# 云端部署（只需一个外部入口）

当前方案：
- 数字人（Duix）：对外端口 `8383`
- 声音克隆/配音：走阿里云 DashScope CosyVoice API（无需在 GPU 服务器部署语音服务/调度器）

桌面端只需要配置：
```env
CLOUD_GPU_SERVER_URL=http://<GPU服务器公网IP>
CLOUD_GPU_VIDEO_PORT=8383

ALIYUN_DASHSCOPE_API_KEY=
ALIYUN_COSYVOICE_MODEL=cosyvoice-v3-flash
```

## 前置条件（GPU 服务器）
- 已安装 Docker + `docker compose`
- 已安装 NVIDIA 驱动 + `nvidia-container-toolkit`（否则容器拿不到 GPU）
- 放通安全组端口：`8383/tcp`

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

## 服务器回收后的恢复
见：`scripts/deploy/RECOVERY_SOP.md`
