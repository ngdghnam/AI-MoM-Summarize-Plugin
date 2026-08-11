import { useEffect, useRef } from "react"

export default function OffscreenPage() {
  const audioCtxRef = useRef<AudioContext | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const tabStreamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    console.log("Offscreen document loaded.")

    const handleMessages = (message: any, sender: any, sendResponse: any) => {
      if (message.target !== "offscreen") return

      console.log("Offscreen received message:", message)
      if (message.type === "start-capture") {
        startCapture(message.streamId, message.tabId)
      } else if (message.type === "stop-capture") {
        stopCapture()
      }
    }

    chrome.runtime.onMessage.addListener(handleMessages)

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessages)
      stopCapture()
    }
  }, [])

  const startCapture = async (streamId: string, tabId: number) => {
    try {
      // 1. Get Tab stream using streamId from background
      tabStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: "tab",
            chromeMediaSourceId: streamId
          }
        } as any,
        video: false
      })

      // 2. Get Local Mic stream
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      })

      // 3. Setup AudioContext at 16000 Hz
      audioCtxRef.current = new AudioContext({ sampleRate: 16000 })
      const audioCtx = audioCtxRef.current

      const micSource = audioCtx.createMediaStreamSource(micStreamRef.current)
      const tabSource = audioCtx.createMediaStreamSource(tabStreamRef.current)

      // 4. Merge them: Mic -> Left (0), Tab -> Right (1)
      const merger = audioCtx.createChannelMerger(2)
      micSource.connect(merger, 0, 0)
      tabSource.connect(merger, 0, 1)

      // 5. Process PCM (buffer size 4096, 2 input channels, 2 output channels)
      const processor = audioCtx.createScriptProcessor(4096, 2, 2)
      scriptProcessorRef.current = processor
      
      merger.connect(processor)
      processor.connect(audioCtx.destination) // Required for script processor to work

      // 6. Setup WebSocket
      const wsUrl = process.env.PLASMO_PUBLIC_WS_URL
      if (!wsUrl) {
        throw new Error("PLASMO_PUBLIC_WS_URL is not defined in environment variables.")
      }
      const ws = new WebSocket(`${wsUrl}/ws/transcribe`)
      wsRef.current = ws

      ws.onopen = () => {
        console.log("WebSocket connected to STT backend.")
      }

      ws.onmessage = (event) => {
        // Send STT result back to content script
        if (tabId) {
          chrome.tabs.sendMessage(tabId, {
            target: "content",
            type: "stt-result",
            data: JSON.parse(event.data)
          }).catch(err => console.log("Failed to send STT result to content script", err))
        }
      }

      ws.onclose = () => {
        console.log("WebSocket disconnected.")
      }

      processor.onaudioprocess = (e) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return

        const left = e.inputBuffer.getChannelData(0)
        const right = e.inputBuffer.getChannelData(1)
        
        // Convert Float32 to Int16
        const buffer = new Int16Array(left.length * 2)
        for (let i = 0; i < left.length; i++) {
          // Left
          let s = Math.max(-1, Math.min(1, left[i]))
          buffer[i * 2] = s < 0 ? s * 0x8000 : s * 0x7fff
          // Right
          s = Math.max(-1, Math.min(1, right[i]))
          buffer[i * 2 + 1] = s < 0 ? s * 0x8000 : s * 0x7fff
        }

        ws.send(buffer.buffer)
      }
    } catch (error) {
      console.error("Failed to start capture:", error)
    }
  }

  const stopCapture = () => {
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect()
      scriptProcessorRef.current = null
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close()
      audioCtxRef.current = null
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop())
      micStreamRef.current = null
    }
    if (tabStreamRef.current) {
      tabStreamRef.current.getTracks().forEach((track) => track.stop())
      tabStreamRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    console.log("Capture stopped.")
  }

  return (
    <div>
      <h1>Offscreen STT Processor</h1>
      <p>This page runs in the background and processes audio streams.</p>
    </div>
  )
}
