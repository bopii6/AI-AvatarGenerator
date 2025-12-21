@echo off
echo ================================================
echo     一键追爆 - 环境安装向导
echo ================================================
echo.

REM 检查 Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Python，请先安装 Python 3.10+
    echo 下载地址: https://www.python.org/downloads/
    pause
    exit /b 1
)

echo [1/3] 检测到 Python:
python --version
echo.

REM 检查 FFmpeg
where ffmpeg >nul 2>&1
if %errorlevel% neq 0 (
    echo [警告] 未检测到 FFmpeg
    echo 请下载 FFmpeg 并添加到系统 PATH
    echo 下载地址: https://www.gyan.dev/ffmpeg/builds/
    echo.
) else (
    echo [2/3] 检测到 FFmpeg:
    ffmpeg -version 2>&1 | findstr "version"
    echo.
)

REM 安装 Python 依赖
echo [3/3] 开始安装 Python 依赖...
echo.
python "%~dp0install_dependencies.py"

echo.
echo ================================================
echo 安装完成！
echo.
echo 下一步:
echo 1. 复制 .env.example 为 .env
echo 2. 填写腾讯云和阿里云密钥
echo 3. 运行 npm run dev
echo ================================================
pause
