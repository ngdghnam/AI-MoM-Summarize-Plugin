import numpy as np

class ChannelState:
    def __init__(self):
        self.eval_buffer: list[np.ndarray] = []
        self.speech_buffer: list[np.ndarray] = []
        self.is_speaking: bool = False
        self.silence_duration_ms: int = 0
        self.speech_duration_ms: int = 0
