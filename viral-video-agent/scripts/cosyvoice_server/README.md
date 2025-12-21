# CosyVoice 云端 API（给桌面端用）

这是一个 **API 网关**，用于把你部署在 GPU 云端的开源 CosyVoice（FunAudioLLM/CosyVoice）通过 HTTP 暴露出来，供桌面端调用。

桌面端已按 `scripts/cosyvoice_cloud_api.md` 的接口对接：

- `GET /health`
- `GET /v1/voices?device_id=...`
- `POST /v1/voices/train`（multipart）
- `GET /v1/voices/{voice_id}?device_id=...`
- `POST /v1/tts`
- `GET /files/...`（下载合成 wav）

## 推荐做法：直接跑官方 CosyVoice FastAPI 引擎 + 本网关

CosyVoice 官方仓库自带推理 FastAPI（`runtime/python/fastapi/server.py`），支持 `cross_lingual` / `zero_shot` 等模式。

本网关负责：
1) 以 `device_id` 隔离存储用户参考音频
2) 对外提供桌面端统一接口（`/v1/voices/*`、`/v1/tts`）
3) 内部转发到官方 FastAPI 引擎，并把返回的 PCM 写成 WAV 文件供下载

需要配置的关键环境变量：

- `COSYVOICE_ENGINE_URL`：官方 FastAPI 引擎地址，例如 `http://127.0.0.1:50000`
- `COSYVOICE_ENGINE_MODE`：默认推理模式，推荐 `cross_lingual`

## Docker 运行（最简）

在 `scripts/cosyvoice_server/` 下：

```bash
docker build -t cosyvoice-api:latest .
docker run -d --name cosyvoice-api -p 9090:9090 -v /data/cosyvoice_api:/data \
  -e COSYVOICE_ENGINE_URL='http://<你的CosyVoice引擎IP>:50000' \
  -e COSYVOICE_ENGINE_MODE='cross_lingual' \
  cosyvoice-api:latest
```

## 桌面端配置

在桌面端 `.env`：

```env
CLOUD_VOICE_SERVER_URL=http://<你的云服务器IP>
CLOUD_VOICE_PORT=9090
```

## 调试

- `curl http://127.0.0.1:9090/health`

> CosyVoice 是零样本声音克隆，本网关把“训练”视为“注册参考音频”（异步 1 秒后变为 ready）。
