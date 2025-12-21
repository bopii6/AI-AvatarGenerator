# GPU 服务器被回收后的“快速恢复”清单（小白版）

你现在的云端架构只固定对外 2 个端口：
- 数字人（Duix）：`8383`
- 声音克隆（CosyVoice 网关）：`9090`

服务器被回收后，你要做的就是：**买一台新 GPU 服务器 → 装好 Docker+GPU 运行时 → 把服务用 compose 拉起来 → 桌面端把 IP 换成新服务器 IP**。

---

## 0) 你提前要准备的“随身包”（强烈建议）

在你本机把这些文件打成一个压缩包，服务器回收后直接上传即可：
- 整个 `scripts/` 目录（至少要包含下面这些）
  - `scripts/deploy/`
  - `scripts/duix_file_api.py`
  - `scripts/duix_nginx_proxy.conf`
  - `scripts/cosyvoice_server/`

建议你把压缩包命名成：`deploy_bundle.zip`（我们已经在仓库根目录生成过的话，就直接用它）

### 0.1 在本机（Windows）一键打包命令
在项目根目录执行：
```powershell
cd "E:\AI数字人\viral-video-agent"
Compress-Archive -Path scripts -DestinationPath deploy_bundle.zip -Force
```

打包后文件在：`E:\AI数字人\viral-video-agent\deploy_bundle.zip`

---

## 1) 新买的 GPU 服务器：开端口（安全组）

放通入站：
- `8383/tcp`
- `9090/tcp`

（这一步只在云控制台操作，不用进服务器）

---

## 2) 新服务器：确认 GPU 驱动正常

登录服务器后执行：
```bash
nvidia-smi
```

能看到 GPU 信息才继续；如果提示找不到命令/驱动异常，先在云厂商控制台安装/重装 GPU 驱动。

---

## 3) 新服务器：安装 Docker + docker compose

（不同系统命令略有差异，这里给一个最常见的通用方式）

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker version
docker compose version
```

如果 `docker compose` 没有，通常是没装 compose 插件（按报错提示安装即可）。

---

## 4) 新服务器：安装 NVIDIA 容器运行时（让容器能用 GPU）

执行下面命令（适用于大多数基于 yum 的系统；如果你的系统不是 yum，会报错，那就按你系统类型改）：
```bash
distribution=$(. /etc/os-release;echo ${ID}${VERSION_ID})
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.repo \
  | tee /etc/yum.repos.d/nvidia-container-toolkit.repo
yum install -y nvidia-container-toolkit
nvidia-ctk runtime configure --runtime=docker
systemctl restart docker
```

验证：
```bash
docker run --rm --gpus all nvidia/cuda:12.2.0-base-ubuntu22.04 nvidia-smi
```

能在容器里看到 GPU 信息，说明 OK。

---

## 5) 把“随身包”上传到新服务器并解压

你可以用任意方式上传（SFTP / 宝塔 / 终端工具上传）。

把你本机的 `deploy_bundle.zip` 上传到服务器（任意方式：SFTP/宝塔/终端上传）。

假设你上传到了服务器：`/root/deploy_bundle.zip`，执行：
```bash
mkdir -p /root/viral-video-agent
cd /root/viral-video-agent
unzip -o /root/deploy_bundle.zip
```

解压后，你应该能看到：`/root/viral-video-agent/scripts/deploy/`。

---

## 6) 启动 Duix（数字人服务）

```bash
cd /root/viral-video-agent/scripts/deploy/duix
docker compose up -d
```

自测：
```bash
curl "http://127.0.0.1:8383/easy/query?code=test"
curl -F "audio=@/etc/hosts;filename=audio_test.wav" "http://127.0.0.1:8383/upload"
```

---

## 7) 启动 CosyVoice（声音克隆服务，300M）

### 7.1 准备 CosyVoice 源码（服务器没 git 也可以）
```bash
cd /root/viral-video-agent/scripts/deploy/cosyvoice
curl -L -o CosyVoice.tar.gz "https://codeload.github.com/FunAudioLLM/CosyVoice/tar.gz/refs/heads/main"
tar -xzf CosyVoice.tar.gz
mv CosyVoice-main CosyVoice
rm -f CosyVoice.tar.gz
```

### 7.2 启动
```bash
cd /root/viral-video-agent/scripts/deploy/cosyvoice
docker compose up -d --build
```

自测（对外固定 9090）：
```bash
curl http://127.0.0.1:9090/health
```

说明：
- 第一次启动会下载 `iic/CosyVoice-300M` 模型，时间比较久；下载没结束时 `curl` 可能会超时/重置连接，属正常。

---

## 8) 桌面端把 IP 改成新服务器公网 IP

桌面端配置里（或 `.env`）把：
```env
CLOUD_GPU_SERVER_URL=http://<新GPU服务器公网IP>
CLOUD_GPU_VIDEO_PORT=8383

CLOUD_VOICE_SERVER_URL=http://<新GPU服务器公网IP>
CLOUD_VOICE_PORT=9090
```

改完重启桌面端即可。

---

## 9) 新服务器“最终自测”（推荐你每次恢复后都跑）
在服务器本机执行：
```bash
curl "http://127.0.0.1:8383/easy/query?code=test"
curl "http://127.0.0.1:9090/health"
```

---

## 10) 常见故障排查（最常用 3 个命令）

看容器是否都在跑：
```bash
docker ps
```

看某个容器日志（例：CosyVoice 网关）：
```bash
docker logs --tail 200 cosyvoice-api
```

重启某个容器：
```bash
docker restart cosyvoice-api
```
