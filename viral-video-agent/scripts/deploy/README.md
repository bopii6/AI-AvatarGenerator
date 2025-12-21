# 云端部署（固定两个外部入口）

目标：不管云端容器怎么变、内部有多少服务，对外只固定 2 个入口：
- 数字人（Duix）：`8383`
- 声音克隆（CosyVoice 网关）：`9090`

桌面端只需要配置两项 IP：
```env
CLOUD_GPU_SERVER_URL=http://<GPU服务器公网IP>
CLOUD_GPU_VIDEO_PORT=8383

CLOUD_VOICE_SERVER_URL=http://<GPU服务器公网IP>
CLOUD_VOICE_PORT=9090
```

## 前置条件（GPU 服务器）
- 已安装 Docker + `docker compose`
- 已安装 NVIDIA 驱动 + `nvidia-container-toolkit`（否则容器拿不到 GPU）
- 放通安全组端口：`8383/tcp`、`9090/tcp`

## 1) 数字人（Duix）
目录：`scripts/deploy/duix/`

```bash
cd scripts/deploy/duix
docker compose up -d
```

自测：
```bash
curl "http://127.0.0.1:8383/easy/query?code=test"
curl -F "audio=@/etc/hosts;filename=audio_test.wav" "http://127.0.0.1:8383/upload"
```

## 2) 声音克隆（CosyVoice-300M）
目录：`scripts/deploy/cosyvoice/`

### 2.1 准备 CosyVoice 源码（只做一次）
该 compose 会从 `./CosyVoice/runtime/python/Dockerfile` 构建引擎镜像，所以需要先准备官方仓库到当前目录的 `CosyVoice/`。

方式 A（有 git）：
```bash
cd scripts/deploy/cosyvoice
git clone https://github.com/FunAudioLLM/CosyVoice.git
```

方式 B（没 git，用 curl+tar）：
```bash
cd scripts/deploy/cosyvoice
curl -L -o CosyVoice.tar.gz "https://codeload.github.com/FunAudioLLM/CosyVoice/tar.gz/refs/heads/main"
tar -xzf CosyVoice.tar.gz
mv CosyVoice-main CosyVoice
rm -f CosyVoice.tar.gz
```

### 2.2 启动
```bash
cd scripts/deploy/cosyvoice
docker compose up -d --build
```

自测（网关对外端口是 9090）：
```bash
curl http://127.0.0.1:9090/health
```

### 2.3 重要说明
- 第一次启动会自动下载 `iic/CosyVoice-300M` 模型，比较大，期间 `curl` 可能会超时/重置连接，等下载完成后再测。
- 模型下载缓存保存在 `docker volume`（`cosyvoice_modelscope_cache`），换容器不需要重新下载。
- 网关会尽量把参考音频转成标准 `PCM 16k 单声道 wav`（需要网关镜像内 `ffmpeg`），避免某些“伪 wav/不兼容 wav”导致引擎报 `Format not recognised`。
- 本仓库会把 `scripts/cosyvoice_engine_patch/server.py` 挂载到引擎容器内，修复上游 CosyVoice fastapi 的上传音频读取/参数传递问题（避免 `Format not recognised`、`Invalid file: tensor(...)`、`Response ended prematurely`）。
- 引擎首次启动会检查并补装 `matcha-tts` 依赖，否则可能报 `No module named 'matcha'` 导致引擎反复重启。
- 网关 API 说明见：`scripts/cosyvoice_cloud_api.md`

## 已经在服务器上手动跑起来怎么办？
如果你不是用 compose 启动的引擎，而是手动 `docker run ... cosyvoice:v1.0` 启动的：
1) 把本地仓库里的 `scripts/cosyvoice_engine_patch/server.py` 上传到服务器，比如 `/root/server.py`
2) 覆盖容器里的文件并重启引擎：
```bash
docker cp /root/server.py cosyvoice-engine:/opt/CosyVoice/CosyVoice/runtime/python/fastapi/server.py
docker restart cosyvoice-engine
```

如果引擎日志里出现 `No module named 'matcha'`，说明引擎缺少依赖，需要在容器里补装一次：
```bash
docker exec cosyvoice-engine bash -lc "pip install -U matcha-tts"
docker restart cosyvoice-engine
```

如果引擎日志里出现 `Invalid file: tensor([[...` 或网关报 `Response ended prematurely`，说明引擎仍在使用上游未修复的 `server.py`（它会把上传音频变成 tensor 传入，导致流式响应崩溃）。按下面覆盖并重启：
```bash
docker cp /root/server.py cosyvoice-engine:/opt/CosyVoice/CosyVoice/runtime/python/fastapi/server.py
docker restart cosyvoice-engine
```

注意：修复版 `server.py` 里临时音频文件必须等“响应流发送完”再删除，否则会出现 `Error opening '/tmp/tmpxxxx.wav'` / `Response ended prematurely`。
