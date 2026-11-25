"""Explicit conversion to replay WAV; preserves mono/stereo mapping via PyAV."""
import argparse
import hashlib
import json
from pathlib import Path
import wave

import av


def convert(source, output):
    source, output = Path(source), Path(output)
    if source.resolve() == output.resolve():
        raise ValueError("Conversion must not overwrite source")
    with av.open(str(source)) as container:
        stream = container.streams.audio[0]
        channels = stream.codec_context.channels
        if channels not in (1, 2):
            raise ValueError("Only mono/stereo inputs supported; downmix explicitly first")
        resampler = av.AudioResampler(format="s16", layout="mono" if channels == 1 else "stereo", rate=16000)
        output.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(output), "wb") as writer:
            writer.setparams((channels, 2, 16000, 0, "NONE", "not compressed"))
            for frame in container.decode(stream):
                for converted in resampler.resample(frame):
                    writer.writeframes(converted.to_ndarray().astype("<i2", copy=False).tobytes())
            for converted in resampler.resample(None):
                writer.writeframes(converted.to_ndarray().astype("<i2", copy=False).tobytes())
    info = {"source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "output_sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
            "converter": "PyAV AudioResampler", "av_version": av.__version__,
            "sample_rate": 16000, "channels": channels, "encoding": "pcm_s16le"}
    output.with_suffix(".conversion.json").write_text(json.dumps(info, indent=2), encoding="utf-8")
    return info


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    print(json.dumps(convert(args.input, args.output)))
