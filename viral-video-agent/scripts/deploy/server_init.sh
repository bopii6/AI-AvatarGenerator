#!/bin/bash
# ========================================
# GPU 服务器一键部署脚本
# 适用于：腾讯云 Ubuntu 22.04 / CentOS 8+
# 功能：部署 Duix + CosyVoice 数字人服务
# ========================================

set -e

echo "=========================================="
echo "🚀 GPU 服务器一键部署脚本"
echo "=========================================="

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ========================================
# 1. 系统检测
# ========================================
log_info "检测系统类型..."

if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    VERSION=$VERSION_ID
else
    log_error "无法检测系统类型"
    exit 1
fi

log_info "系统: $OS $VERSION"

# ========================================
# 2. 安装 Docker
# ========================================
install_docker() {
    if command -v docker &> /dev/null; then
        log_info "Docker 已安装: $(docker --version)"
        return
    fi

    log_info "安装 Docker..."
    
    if [[ "$OS" == "ubuntu" ]]; then
        apt-get update
        apt-get install -y ca-certificates curl gnupg
        install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        chmod a+r /etc/apt/keyrings/docker.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
        apt-get update
        apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    elif [[ "$OS" == "centos" || "$OS" == "tencentos" || "$OS" == "opencloudos" ]]; then
        yum install -y yum-utils
        yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
        yum install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    fi

    systemctl enable docker
    systemctl start docker
    log_info "Docker 安装完成"
}

# ========================================
# 3. 安装 NVIDIA Docker 支持
# ========================================
install_nvidia_docker() {
    if docker info 2>/dev/null | grep -q "nvidia"; then
        log_info "NVIDIA Container Toolkit 已安装"
        return
    fi

    log_info "安装 NVIDIA Container Toolkit..."
    
    if [[ "$OS" == "ubuntu" ]]; then
        curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
        curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
            sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
            tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
        apt-get update
        apt-get install -y nvidia-container-toolkit
    elif [[ "$OS" == "centos" || "$OS" == "tencentos" || "$OS" == "opencloudos" ]]; then
        curl -s -L https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo | \
            tee /etc/yum.repos.d/nvidia-container-toolkit.repo
        yum install -y nvidia-container-toolkit
    fi

    nvidia-ctk runtime configure --runtime=docker
    systemctl restart docker
    log_info "NVIDIA Container Toolkit 安装完成"
}

# ========================================
# 4. 配置 Docker 镜像加速
# ========================================
configure_docker_mirror() {
    log_info "配置 Docker 镜像加速..."
    
    mkdir -p /etc/docker
    cat > /etc/docker/daemon.json << 'EOF'
{
  "registry-mirrors": [
    "https://docker.1ms.run",
    "https://docker.xuanyuan.me"
  ],
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "100m",
    "max-file": "3"
  }
}
EOF
    systemctl daemon-reload
    systemctl restart docker
    log_info "Docker 镜像加速配置完成"
}

# ========================================
# 5. 配置 SSH 密码登录
# ========================================
configure_ssh() {
    log_info "配置 SSH 密码登录..."
    
    sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
    sed -i 's/^#*PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
    
    systemctl restart sshd
    log_info "SSH 配置完成"
}

# ========================================
# 6. 创建项目目录
# ========================================
setup_project() {
    log_info "创建项目目录..."
    
    PROJECT_DIR="/root/viral-video-agent"
    mkdir -p $PROJECT_DIR/scripts/deploy/cosyvoice
    mkdir -p $PROJECT_DIR/scripts/deploy/duix
    mkdir -p $PROJECT_DIR/scripts/cosyvoice_server
    mkdir -p $PROJECT_DIR/scripts/cosyvoice_engine_patch
    
    log_info "项目目录: $PROJECT_DIR"
}

# ========================================
# 7. 检查 GPU
# ========================================
check_gpu() {
    log_info "检查 GPU..."
    
    if command -v nvidia-smi &> /dev/null; then
        nvidia-smi --query-gpu=name,memory.total --format=csv,noheader
        log_info "GPU 检测成功"
    else
        log_warn "未检测到 nvidia-smi，请确保已安装 NVIDIA 驱动"
    fi
}

# ========================================
# 8. 显示后续步骤
# ========================================
show_next_steps() {
    PUBLIC_IP=$(curl -s ifconfig.me 2>/dev/null || echo "获取失败")
    
    echo ""
    echo "=========================================="
    echo -e "${GREEN}✅ 服务器初始化完成！${NC}"
    echo "=========================================="
    echo ""
    echo "📋 服务器信息:"
    echo "   公网 IP: $PUBLIC_IP"
    echo "   项目目录: /root/viral-video-agent"
    echo ""
    echo "📋 下一步操作:"
    echo ""
    echo "1️⃣  在腾讯云安全组放开端口: 22, 8383, 9090"
    echo ""
    echo "2️⃣  设置 root 密码 (用于 SSH 登录):"
    echo "    echo 'root:你的密码' | chpasswd"
    echo ""
    echo "3️⃣  从本地上传部署文件:"
    echo "    scp -r scripts root@$PUBLIC_IP:/root/viral-video-agent/"
    echo ""
    echo "4️⃣  启动 Duix 服务:"
    echo "    cd /root/viral-video-agent/scripts/deploy/duix"
    echo "    docker compose up -d"
    echo ""
    echo "5️⃣  启动 CosyVoice 服务:"
    echo "    cd /root/viral-video-agent/scripts/deploy/cosyvoice"
    echo "    docker compose up -d --build"
    echo ""
    echo "6️⃣  更新桌面端 .env 配置:"
    echo "    CLOUD_GPU_SERVER_URL=http://$PUBLIC_IP"
    echo "    CLOUD_VOICE_SERVER_URL=http://$PUBLIC_IP"
    echo ""
    echo "=========================================="
}

# ========================================
# 主流程
# ========================================
main() {
    log_info "开始部署..."
    
    install_docker
    install_nvidia_docker
    configure_docker_mirror
    configure_ssh
    setup_project
    check_gpu
    show_next_steps
    
    log_info "部署脚本执行完成！"
}

main "$@"
