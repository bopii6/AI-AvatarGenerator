# GPU 服务调度器部署指南

## 功能说明

由于 Tesla P4 GPU 只有 8GB 显存，无法同时运行 CosyVoice（声音克隆）和 Duix（数字人视频）服务。

此调度器会**自动切换服务**：
- 请求 TTS/声音克隆时 → 自动启动 CosyVoice，停止 Duix
- 请求视频生成时 → 自动启动 Duix，停止 CosyVoice

## 部署步骤

### 1. 上传代码到服务器

```bash
cd /root/viral-video-agent
git pull  # 或手动上传
```

### 2. 启动调度器

```bash
cd /root/viral-video-agent/scripts/deploy/gpu-scheduler
docker-compose up -d
```

### 3. 检查状态

```bash
# 查看调度器日志
docker logs -f gpu-scheduler

# 检查健康状态
curl http://localhost:9999/health
```

### 4. 配置桌面端

修改桌面端 `.env` 文件，将服务地址指向调度器（端口 9999）：

```env
# 原来分开的配置
# CLOUD_VOICE_PORT=9090
# CLOUD_GPU_VIDEO_PORT=8383

# 改为使用调度器统一端口
CLOUD_VOICE_PORT=9999
CLOUD_GPU_VIDEO_PORT=9999
```

> æ³¨ï¼š`CLOUD_VOICE_SERVER_URL` / `CLOUD_GPU_SERVER_URL` ä»ç„¶å¡«ä½ çš„ GPU æœåŠ¡å™¨å…¬ç½‘ IPï¼ˆä¾‹å¦‚ `http://1.15.25.183`ï¼‰ï¼Œåªæ˜¯ç«¯å£ç»Ÿä¸€æŒ‡å‘ `9999`ã€‚

### 5. 开放端口

在腾讯云安全组中放行端口 **9999**

> 说明：调度器使用 `network_mode: host`，可直接访问本机的 `9090/8383`，同时对外提供统一入口 `9999`；适配旧版 Docker 环境（避免 `host.docker.internal` 不可用）。

## API 说明

| 端点 | 说明 |
|-----|-----|
| `GET /health` | 健康检查 |
| `GET /status` | 查看当前服务状态 |
| `POST /switch/cosyvoice` | 手动切换到 CosyVoice |
| `POST /switch/duix` | 手动切换到 Duix |
| `/v1/*` | 代理到 CosyVoice |
| `/easy/*` | 代理到 Duix |
| `/upload` | 代理 Duix 上传 |
| `/download` | 代理 Duix 下载 |

## 注意事项

- 服务切换需要 30-120 秒（模型加载时间）
- 切换期间请求会返回 503 错误，桌面端会显示"服务切换中"
- 建议用户先完成所有音频生成，再统一生成视频，减少切换次数

## 提速说明（重要）

为避免 `docker build` 在国内网络下很慢，调度器改为：
- 直接使用官方 `python:3.11-slim` 运行（无 build）
- 通过挂载 `/var/run/docker.sock` 用 Python Docker SDK 启停宿主机容器（不依赖容器内的 docker-compose）
- 依赖（fastapi/uvicorn/httpx/docker）首次启动自动 `pip install`，并挂载 `/root/.cache/pip` 缓存加速后续启动
