import numpy as np

class ChannelState:
    def __init__(self):
        self.eval_buffer: list[np.ndarray] = []
        self.pre_roll = np.empty(0, dtype=np.float32)
        self.speech_buffer: list[np.ndarray] = []
        self.is_speaking: bool = False
        self.silence_duration_ms: int = 0
        self.speech_duration_ms: int = 0
        # Half-open sample ranges on this channel's received-audio timeline.
        self.received_samples = 0
        self.evaluated_samples = 0
        self.speech_start = 0
        self.segment_sequence = 0
