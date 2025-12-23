import json
import os
import shutil
import subprocess
import threading
import time
import uuid
import wave
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional

import requests
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

Status = Literal["pending", "training", "ready", "failed"]


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime())


def safe_filename(name: str) -> str:
    return "".join(c if c.isalnum() or c in ("-", "_", ".") else "_" for c in name).strip("_") or "file"


DATA_DIR = Path(os.environ.get("DATA_DIR", "./data")).resolve()
FILES_DIR = DATA_DIR / "files"
VOICES_DIR = DATA_DIR / "voices"

HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "9090"))

# CosyVoice official fastapi server
# See: https://github.com/FunAudioLLM/CosyVoice (runtime/python/fastapi/server.py)
ENGINE_URL = os.environ.get("COSYVOICE_ENGINE_URL", "http://127.0.0.1:50000").strip().rstrip("/")
ENGINE_MODE = os.environ.get("COSYVOICE_ENGINE_MODE", "cross_lingual").strip()

# audio sample rate used by our gateway output (engine returns PCM stream)
TARGET_SR = int(os.environ.get("COSYVOICE_TARGET_SR", "22050"))

app = FastAPI(title="CosyVoice Cloud API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_lock = threading.Lock()


def ensure_dirs() -> None:
    FILES_DIR.mkdir(parents=True, exist_ok=True)
    VOICES_DIR.mkdir(parents=True, exist_ok=True)


def try_convert_to_pcm_wav(src: Path, dst: Path, sample_rate: int = 16000) -> Path:
    if dst.exists() and dst.stat().st_size > 0:
        return dst

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return src

    dst.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        ffmpeg,
        "-y",
        "-i",
        str(src),
        "-ac",
        "1",
        "-ar",
        str(sample_rate),
        "-c:a",
        "pcm_s16le",
        str(dst),
    ]
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if dst.exists() and dst.stat().st_size > 0:
        return dst
    return src


def voice_dir(device_id: str, voice_id: str) -> Path:
    return VOICES_DIR / safe_filename(device_id) / safe_filename(voice_id)


def meta_path(device_id: str, voice_id: str) -> Path:
    return voice_dir(device_id, voice_id) / "meta.json"


def read_meta(device_id: str, voice_id: str) -> Dict[str, Any]:
    p = meta_path(device_id, voice_id)
    if not p.exists():
        raise HTTPException(status_code=404, detail="voice not found")
    return json.loads(p.read_text(encoding="utf-8"))


def write_meta(device_id: str, voice_id: str, meta: Dict[str, Any]) -> None:
    p = meta_path(device_id, voice_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")


def list_metas(device_id: str) -> List[Dict[str, Any]]:
    base = VOICES_DIR / safe_filename(device_id)
    if not base.exists():
        return []
    items: List[Dict[str, Any]] = []
    for child in base.iterdir():
        p = child / "meta.json"
        if not p.exists():
            continue
        try:
            items.append(json.loads(p.read_text(encoding="utf-8")))
        except Exception:
            continue
    items.sort(key=lambda x: x.get("updatedAt", ""), reverse=True)
    return items


def train_worker(device_id: str, voice_id: str) -> None:
    with _lock:
        meta = read_meta(device_id, voice_id)
        meta["status"] = "training"
        meta["updatedAt"] = now_iso()
        write_meta(device_id, voice_id, meta)

    vdir = voice_dir(device_id, voice_id)
    sample = vdir / "sample.wav"

    try:
        if not sample.exists():
            raise RuntimeError("sample.wav missing")

        # Many "wav" files are actually unsupported codecs; convert to standard PCM 16k mono if ffmpeg exists.
        try_convert_to_pcm_wav(sample, vdir / "sample_16k.wav", sample_rate=16000)
        time.sleep(1)

        with _lock:
            meta = read_meta(device_id, voice_id)
            meta["status"] = "ready"
            meta["updatedAt"] = now_iso()
            write_meta(device_id, voice_id, meta)
    except Exception as e:
        with _lock:
            meta = read_meta(device_id, voice_id)
            meta["status"] = "failed"
            meta["error"] = str(e)
            meta["updatedAt"] = now_iso()
            write_meta(device_id, voice_id, meta)


@app.get("/health")
def health():
    ensure_dirs()
    return {"message": "ok"}


@app.get("/files/{file_path:path}")
def get_file(file_path: str):
    ensure_dirs()
    target = (FILES_DIR / file_path).resolve()
    if not str(target).startswith(str(FILES_DIR.resolve())):
        raise HTTPException(status_code=400, detail="invalid file path")
    if not target.exists():
        raise HTTPException(status_code=404, detail="file not found")
    return FileResponse(str(target))


@app.get("/v1/voices")
def voices(device_id: str):
    ensure_dirs()
    return {"data": list_metas(device_id)}


@app.post("/v1/voices/train")
async def train_voice(
    device_id: str = Form(...),
    name: str = Form(...),
    audio: UploadFile = File(...),
    prompt_text: Optional[str] = Form(default=None),
):
    ensure_dirs()
    if not device_id.strip():
        raise HTTPException(status_code=400, detail="device_id required")
    if not name.strip():
        raise HTTPException(status_code=400, detail="name required")

    voice_id = f"v_{uuid.uuid4().hex[:12]}"
    vdir = voice_dir(device_id, voice_id)
    vdir.mkdir(parents=True, exist_ok=True)

    sample_path = vdir / "sample.wav"
    with sample_path.open("wb") as f:
        f.write(await audio.read())

    meta = {
        "id": voice_id,
        "name": name.strip(),
        "status": "pending",
        "promptText": (prompt_text or "").strip(),
        "createdAt": now_iso(),
        "updatedAt": now_iso(),
    }
    write_meta(device_id, voice_id, meta)

    thread = threading.Thread(target=train_worker, args=(device_id, voice_id), daemon=True)
    thread.start()

    return {"data": {"voiceId": voice_id}}


@app.get("/v1/voices/{voice_id}")
def voice_detail(voice_id: str, device_id: str):
    ensure_dirs()
    meta = read_meta(device_id, voice_id)
    return {"data": meta}


@app.post("/v1/tts")
def tts(payload: Dict[str, Any]):
    ensure_dirs()
    device_id = str(payload.get("device_id", "")).strip()
    voice_id = str(payload.get("voice_id", "")).strip()
    text = str(payload.get("text", "")).strip()

    if not device_id or not voice_id or not text:
        raise HTTPException(status_code=400, detail="device_id/voice_id/text required")

    meta = read_meta(device_id, voice_id)
    if meta.get("status") != "ready":
        raise HTTPException(status_code=400, detail=f"voice not ready: {meta.get('status')}")

    out_rel = f"{safe_filename(device_id)}/{safe_filename(voice_id)}/{int(time.time())}.wav"
    out_wav = FILES_DIR / out_rel
    out_wav.parent.mkdir(parents=True, exist_ok=True)

    try:
        mode = str(payload.get("mode") or "").strip() or ENGINE_MODE
        url = f"{ENGINE_URL}/inference_{mode}"

        vdir = voice_dir(device_id, voice_id)
        prompt_path = vdir / "sample_16k.wav"
        if not prompt_path.exists():
            prompt_path = vdir / "sample.wav"
        prompt_path = try_convert_to_pcm_wav(prompt_path, vdir / "sample_16k.wav", sample_rate=16000)

        data: Dict[str, Any] = {"tts_text": text}
        if mode == "zero_shot":
            prompt_text = str(payload.get("prompt_text") or meta.get("promptText") or "").strip()
            if not prompt_text:
                raise HTTPException(status_code=400, detail="zero_shot 需要 prompt_text（可在训练时提供 prompt_text）")
            data["prompt_text"] = prompt_text

        with Path(prompt_path).open("rb") as f:
            files = {"prompt_wav": ("prompt.wav", f, "audio/wav")}
            # 增加超时到 480s 以支持长文本合成（约 400 字可能需要 3 分钟）
            with requests.request("POST", url, data=data, files=files, stream=True, timeout=480) as resp:
                if resp.status_code >= 400:
                    detail = f"engine error HTTP {resp.status_code}"
                    try:
                        detail = f"{detail}: {resp.text[:500]}"
                    except Exception:
                        pass
                    raise HTTPException(status_code=500, detail=detail)
                pcm = b"".join(resp.iter_content(chunk_size=16000))

        # Write WAV (int16 PCM, 1ch)
        with wave.open(str(out_wav), "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(TARGET_SR)
            wf.writeframes(pcm)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"data": {"audioUrl": f"/files/{out_rel}"}}


if __name__ == "__main__":
    import uvicorn

    ensure_dirs()
    uvicorn.run(app, host=HOST, port=PORT)
