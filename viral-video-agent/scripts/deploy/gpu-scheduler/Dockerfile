FROM python:3.11-slim

WORKDIR /app

# 安装 Docker CLI + docker-compose（用于控制其他容器）
RUN apt-get update && apt-get install -y \
    docker.io \
    docker-compose \
    && rm -rf /var/lib/apt/lists/*

# 安装 Python 依赖
RUN pip install --no-cache-dir \
    fastapi \
    uvicorn \
    httpx

COPY scheduler.py /app/

EXPOSE 9999

CMD ["python", "scheduler.py"]
