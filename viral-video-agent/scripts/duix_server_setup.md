# Duix 云端服务部署（支持 `/upload` 与 `/download`）

本项目的云端 GPU 数字人（Duix.Avatar）接口默认只有 `/easy/*`，很多部署不带文件上传/下载能力，会导致客户端“上传音频/视频”返回 404 或生成任务报错（例如 `KeyError: 'streams'`）。

这里提供一个最小的三容器方案：

- `duix-avatar-gen-video`：Duix.Avatar 生成服务（只暴露内部端口）
- `duix-file-api`：提供 `POST /upload` 与 `GET /download`，把文件写入共享卷 `/code/data`
- `duix-proxy`：Nginx 统一对外暴露 `:8383`，路由：
  - `/easy/*` → `duix-avatar-gen-video:8383`
  - `/upload`、`/download` → `duix-file-api:8080`

## 1) 服务器准备文件

把以下两个文件上传到服务器（示例路径：`/root/duix/`）：

- `scripts/duix_file_api.py` → `/root/duix/duix_file_api.py`
- `scripts/duix_nginx_proxy.conf` → `/root/duix/duix_nginx_proxy.conf`

## 2) 启动容器

```bash
docker network create duix-net || true
docker volume create duix_data

docker rm -f duix-avatar-gen-video duix-file-api duix-proxy || true

# 生成服务（不直接对外暴露端口）
docker run -d --name duix-avatar-gen-video --restart always --gpus all \
  --network duix-net \
  -v duix_data:/code/data \
  guiji2025/duix.avatar python /code/app_local.py

# 文件上传/下载 API
docker run -d --name duix-file-api --restart always \
  --network duix-net \
  -v duix_data:/code/data \
  -v /root/duix/duix_file_api.py:/app/duix_file_api.py:ro \
  python:3.11-slim python /app/duix_file_api.py

# 对外统一入口（8383）
docker run -d --name duix-proxy --restart always \
  --network duix-net \
  -p 8383:8383 \
  -v /root/duix/duix_nginx_proxy.conf:/etc/nginx/conf.d/default.conf:ro \
  nginx:alpine
```

## 3) 自检

在服务器上：

```bash
curl "http://127.0.0.1:8383/easy/query?code=test"
curl -F "audio=@/etc/hosts;filename=audio_test.wav" "http://127.0.0.1:8383/upload"
docker exec duix-avatar-gen-video ls -lh /code/data/audio_test.wav
```

在 Windows（PowerShell）上请用 `curl.exe`（避免 `curl`=Invoke-WebRequest 的别名问题；如有代理也建议加 `--noproxy "*"`)：

```powershell
curl.exe --noproxy "*" "http://<你的服务器IP>:8383/easy/query?code=test"
curl.exe --noproxy "*" -F "audio=@package.json;filename=audio_test.wav" "http://<你的服务器IP>:8383/upload"
```

## 4) 常见问题

- 外网连不上：腾讯云安全组需放行入站 TCP `8383`；如果服务器还有系统防火墙（iptables/nftables）也需要放行。
- `/upload` 返回 502：通常是 `duix-file-api` 没跑起来或脚本异常，执行 `docker logs -n 200 duix-file-api` 查看原因。

