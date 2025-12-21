"""
环境安装脚本 - 一键追爆
安装 Wav2Lip 所需的 Python 依赖
"""

import subprocess
import sys
import os

def install_package(package):
    """安装单个 pip 包"""
    print(f"正在安装 {package}...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", package, "-q"])
        print(f"✓ {package} 安装成功")
        return True
    except subprocess.CalledProcessError:
        print(f"✗ {package} 安装失败")
        return False

def main():
    print("=" * 50)
    print("一键追爆 - 环境安装脚本")
    print("=" * 50)
    print()
    
    # 必需的包
    packages = [
        # ONNX Runtime (CPU 版本)
        "onnxruntime",
        
        # 图像处理
        "opencv-python",
        "Pillow",
        
        # 数值计算
        "numpy",
        
        # 视频处理
        "tqdm",
        
        # 人脸检测 (insightface)
        "insightface",
        
        # HTTP 请求
        "requests",
        
        # Playwright (多平台上传)
        "playwright",
    ]
    
    print("将安装以下依赖:")
    for pkg in packages:
        print(f"  - {pkg}")
    print()
    
    input("按 Enter 开始安装...")
    print()
    
    success = 0
    failed = 0
    
    for pkg in packages:
        if install_package(pkg):
            success += 1
        else:
            failed += 1
    
    print()
    print("=" * 50)
    print(f"安装完成: 成功 {success} 个, 失败 {failed} 个")
    print("=" * 50)
    
    # 安装 Playwright 浏览器
    print()
    print("正在安装 Playwright 浏览器...")
    try:
        subprocess.check_call([sys.executable, "-m", "playwright", "install", "chromium"])
        print("✓ Playwright 浏览器安装成功")
    except:
        print("⚠ Playwright 浏览器安装失败，请手动运行: python -m playwright install chromium")
    
    print()
    print("安装完成！现在可以运行项目了：")
    print("  npm run dev")
    print()

if __name__ == "__main__":
    main()
