import argparse
import sys
import tempfile
from pathlib import Path
from typing import Iterator, Optional

import numpy as np
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from starlette.background import BackgroundTask

# CosyVoice source lives in the repo inside the engine image (not installed as a wheel).
# server.py is at: /opt/CosyVoice/CosyVoice/runtime/python/fastapi/server.py
# We add repo root to sys.path so `import cosyvoice...` works.
REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from cosyvoice.cli.cosyvoice import CosyVoice  # type: ignore  # noqa: E402

app = FastAPI(title="CosyVoice Engine (patched)", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_cosyvoice: Optional[object] = None
_sample_rate: int = 22050


def _write_upload_to_tmp(upload: UploadFile, suffix: str = ".wav") -> Path:
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    try:
        try:
            upload.file.seek(0)
        except Exception:
            pass
        tmp.write(upload.file.read())
        tmp.flush()
    finally:
        tmp.close()
    return Path(tmp.name)

def _safe_unlink(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except Exception:
        pass


def _stream_pcm16le(model_output: Iterator[dict]) -> Iterator[bytes]:
    for item in model_output:
        speech = item.get("tts_speech")
        if speech is None:
            continue
        if hasattr(speech, "detach"):
            speech = speech.detach().cpu().numpy()
        if not isinstance(speech, np.ndarray):
            speech = np.asarray(speech)
        if speech.dtype != np.int16:
            if np.issubdtype(speech.dtype, np.floating):
                speech = np.clip(speech, -1.0, 1.0)
                speech = (speech * 32767.0).astype(np.int16)
            else:
                speech = speech.astype(np.int16)
        yield speech.tobytes()


@app.post("/inference_cross_lingual")
def inference_cross_lingual(
    tts_text: str = Form(...),
    prompt_wav: UploadFile = File(...),
):
    """
    Patched behavior:
    - Save UploadFile to a real temp .wav file.
    - Pass the *file path* into cosyvoice.inference_cross_lingual() to avoid
      'Format not recognised' and 'Invalid file: tensor(...)' errors.
    """
    assert _cosyvoice is not None
    tmp_path = _write_upload_to_tmp(prompt_wav, suffix=".wav")
    model_output = _cosyvoice.inference_cross_lingual(tts_text, str(tmp_path))  # type: ignore[attr-defined]
    return StreamingResponse(
        _stream_pcm16le(model_output),
        media_type="application/octet-stream",
        background=BackgroundTask(_safe_unlink, tmp_path),
    )


@app.post("/inference_zero_shot")
def inference_zero_shot(
    tts_text: str = Form(...),
    prompt_text: str = Form(...),
    prompt_wav: UploadFile = File(...),
):
    assert _cosyvoice is not None
    tmp_path = _write_upload_to_tmp(prompt_wav, suffix=".wav")
    model_output = _cosyvoice.inference_zero_shot(tts_text, prompt_text, str(tmp_path))  # type: ignore[attr-defined]
    return StreamingResponse(
        _stream_pcm16le(model_output),
        media_type="application/octet-stream",
        background=BackgroundTask(_safe_unlink, tmp_path),
    )


def main():
    global _cosyvoice, _sample_rate
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=50000)
    parser.add_argument("--model_dir", type=str, required=True)
    args = parser.parse_args()

    _cosyvoice = CosyVoice(args.model_dir)  # type: ignore[call-arg]

    # best-effort sample_rate exposure
    _sample_rate = int(getattr(_cosyvoice, "sample_rate", 22050))

    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=args.port)


if __name__ == "__main__":
    main()
