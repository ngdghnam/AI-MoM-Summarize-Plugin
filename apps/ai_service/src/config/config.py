# ------------------------------------
# Whisper Model Config
# ------------------------------------
# Model size: "tiny", "base", "small", "medium", "large"
# Use a multilingual model to transcribe speech in its original language.
MODEL_SIZE = "small"
BEAM_SIZE = 5
INITIAL_PROMPT = None

# Detect the spoken language for each audio segment instead of forcing one.
LANGUAGE = None

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
MAX_BUFFER_SECONDS = 20

# ------------------------------------
# VAD & Real-time STT Config
# ------------------------------------
# Interval to check for voice activity (in milliseconds)
VAD_CHECK_INTERVAL_MS = 500
VAD_THRESHOLD = 0.5
VAD_MIN_SPEECH_MS = 100
# Retain audio before speech detection so quiet initial syllables survive.
VAD_PRE_ROLL_MS = 500

# Wait through brief thinking/breathing pauses before finalizing a segment.
# Recording continues after transcription; this only controls segmentation.
VAD_MAX_SILENCE_MS = 2500

# Maximum continuous speech duration (in milliseconds) before forcing transcription
VAD_MAX_SPEECH_MS = MAX_BUFFER_SECONDS * 1000
