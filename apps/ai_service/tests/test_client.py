import asyncio
import websockets
import numpy as np
import argparse
import wave
import os

import subprocess

def get_speech_audio() -> np.ndarray:
    """Generate a speech sample using Windows TTS and resample to 16kHz."""
    wav_path = "sample_speech.wav"
    
    if not os.path.exists(wav_path):
        print("Generating speech sample using Windows TTS...")
        abs_path = os.path.abspath(wav_path)
        ps_cmd = (
            "Add-Type -AssemblyName System.speech; "
            "$speak = New-Object System.Speech.Synthesis.SpeechSynthesizer; "
            f"$speak.SetOutputToWaveFile('{abs_path}'); "
            "$speak.Speak('Experience proves this. Hello from Windows TTS.'); "
            "$speak.Dispose();"
        )
        subprocess.run(["powershell", "-Command", ps_cmd], check=True)
        
    with wave.open(wav_path, 'rb') as wf:
        framerate = wf.getframerate()
        raw_data = wf.readframes(wf.getnframes())
        audio_array = np.frombuffer(raw_data, dtype=np.int16)
        
        # Resample to 16kHz if necessary
        if framerate != 16000:
            num_samples = int(len(audio_array) * 16000 / framerate)
            old_indices = np.arange(len(audio_array))
            new_indices = np.linspace(0, len(audio_array) - 1, num_samples)
            audio_array = np.interp(new_indices, old_indices, audio_array).astype(np.int16)
            
        return audio_array

async def test_stt_websocket(uri: str):
    """
    Connects to the STT WebSocket and sends synthetic interleaved stereo audio.
    Timeline (Left Channel):
    - 0.0s to 2.0s: Beep (should be ignored by VAD)
    - 2.0s to 3.0s: Silence
    - 3.0s onwards: Real human speech ("experience proves this")
    """
    sample_rate = 16000
    
    # Generate the Left Channel audio sequence
    # 1. Beep (2 seconds)
    t_beep = np.linspace(0, 2.0, int(sample_rate * 2.0), endpoint=False)
    beep_audio = (np.sin(2 * np.pi * 440 * t_beep) * 16383).astype(np.int16)
    
    # 2. Silence (1 second)
    silence_audio = np.zeros(sample_rate * 1, dtype=np.int16)
    
    # 3. Speech
    try:
        speech_audio = get_speech_audio()
    except Exception as e:
        print(f"Failed to load speech audio: {e}")
        return

    # Combine them for the left channel
    left_channel = np.concatenate([beep_audio, silence_audio, speech_audio])
    
    # Right channel is just silence for the same duration
    right_channel = np.zeros(len(left_channel), dtype=np.int16)
    
    # Interleave to stereo
    stereo = np.empty((len(left_channel) * 2,), dtype=np.int16)
    stereo[0::2] = left_channel
    stereo[1::2] = right_channel
    
    total_bytes = stereo.tobytes()
    bytes_per_chunk = sample_rate * 2 * 2 // 10  # 100ms chunk (16000 samples/s * 2 bytes * 2 channels / 10)
    
    print(f"Connecting to {uri}...")
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected! Starting audio stream...")
            
            async def receive_responses():
                try:
                    async for message in websocket:
                        print(f"\n[SERVER RESPONSE]: {message}")
                except websockets.exceptions.ConnectionClosed:
                    print("Server connection closed.")
                    
            recv_task = asyncio.create_task(receive_responses())
            
            # Stream the audio chunk by chunk to simulate real-time
            for i in range(0, len(total_bytes), bytes_per_chunk):
                chunk = total_bytes[i:i+bytes_per_chunk]
                await websocket.send(chunk)
                await asyncio.sleep(0.1)
                
            print("Finished sending audio. Waiting for final transcriptions...")
            await asyncio.sleep(2)
            recv_task.cancel()

    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test STT WebSocket Server")
    parser.add_argument("--uri", type=str, default="ws://127.0.0.1:8000/ws/transcribe", help="WebSocket URI")
    args = parser.parse_args()
    
    asyncio.run(test_stt_websocket(args.uri))
