# ------------------------------------
# Whisper Model Config
# ------------------------------------
# Model size: "tiny", "base", "small", "medium", "large"
# For personal laptops -> using "base" is optimal (light, fast, quite accurate)
MODEL_SIZE = "base"

# Priority language for recognition
LANGUAGE = "vi"

# Device to run the model: "cpu" or "cuda" (if GPU is available)
DEVICE = "cpu"

# Compute type: "int8" significantly reduces CPU load
COMPUTE_TYPE = "int8"

# ------------------------------------
# Audio Config
# ------------------------------------
# Sample rate of the PCM stream sent from the Extension
SAMPLE_RATE = 16000

# Number of audio channels (Stereo = 2: Left channel is you, Right channel is others)
CHANNELS = 2

# Buffer size (in seconds) before flushing to transcribe
# VAD controls this, this is just an upper limit (fallback)
MAX_BUFFER_SECONDS = 10

# ------------------------------------
# VAD & Real-time STT Config
# ------------------------------------
# Interval to check for voice activity (in milliseconds)
VAD_CHECK_INTERVAL_MS = 500

# Maximum silence duration (in milliseconds) before stopping recording and transcribing
VAD_MAX_SILENCE_MS = 1000

# Maximum continuous speech duration (in milliseconds) before forcing transcription
VAD_MAX_SPEECH_MS = 10000
