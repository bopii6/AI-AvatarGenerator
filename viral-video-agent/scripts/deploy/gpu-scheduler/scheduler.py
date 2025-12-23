"""
GPU 服务调度器 - 自动管理 CosyVoice 和 Duix 服务的启停

由于 Tesla P4 只有 8GB 显存，无法同时运行两个服务，
此调度器会根据任务类型自动切换服务。
"""

import os
import time
import subprocess
import asyncio
import threading
import shlex
import shutil
from queue import Queue
from typing import Optional, Literal
from dataclasses import dataclass
from datetime import datetime
import logging
import httpx
import docker
from docker.errors import NotFound as DockerNotFound
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# 配置
COSYVOICE_DIR = os.environ.get('COSYVOICE_DIR', '/root/viral-video-agent/scripts/deploy/cosyvoice')
DUIX_DIR = os.environ.get('DUIX_DIR', '/root/viral-video-agent/scripts/deploy/duix')
COSYVOICE_URL = os.environ.get('COSYVOICE_URL', 'http://localhost:9090')
DUIX_URL = os.environ.get('DUIX_URL', 'http://localhost:8383')
SERVICE_SWITCH_TIMEOUT = int(os.environ.get('SERVICE_SWITCH_TIMEOUT', '120'))  # 秒
DOCKER_STOP_TIMEOUT = int(os.environ.get('DOCKER_STOP_TIMEOUT', '45'))
GPU_RELEASE_SLEEP = int(os.environ.get('GPU_RELEASE_SLEEP', '5'))
COSYVOICE_CONTAINERS = [s.strip() for s in os.environ.get('COSYVOICE_CONTAINERS', 'cosyvoice-api,cosyvoice-engine').split(',') if s.strip()]
DUIX_CONTAINERS = [s.strip() for s in os.environ.get('DUIX_CONTAINERS', 'duix-avatar-gen-video,duix-file-api,duix-proxy').split(',') if s.strip()]

# CosyVoice Engine 健康检查：默认通过容器 IP 检测（避免未映射 50000 导致“永远不就绪”）
COSYVOICE_ENGINE_CONTAINER = os.environ.get('COSYVOICE_ENGINE_CONTAINER', 'cosyvoice-engine').strip()
COSYVOICE_ENGINE_PORT = int(os.environ.get('COSYVOICE_ENGINE_PORT', '50000'))
COSYVOICE_ENGINE_HEALTH_PATH = (os.environ.get('COSYVOICE_ENGINE_HEALTH_PATH', '/health') or '/health').strip() or '/health'
COSYVOICE_ENGINE_HEALTH_URL = os.environ.get('COSYVOICE_ENGINE_HEALTH_URL', '').strip()

# API 密钥保护（可选，未配置则不验证）
GPU_API_KEY = os.environ.get('GPU_API_KEY', '').strip()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

ServiceType = Literal['cosyvoice', 'duix', None]

@dataclass
class TaskInfo:
    id: str
    service: ServiceType
    status: str  # 'queued' | 'switching' | 'processing' | 'done' | 'error'
    created_at: datetime
    message: Optional[str] = None

class GPUScheduler:
    def __init__(self):
        self.current_service: ServiceType = None
        self.lock = threading.Lock()
        self.task_queue: Queue[TaskInfo] = Queue()
        self.current_task: Optional[TaskInfo] = None
        self.switching = False
        # 新增：切换状态跟踪
        self.switching_started_at: Optional[datetime] = None
        self.switching_target: ServiceType = None
        # Connect to host Docker via mounted socket; avoids slow docker-compose installation in this container.
        self.docker = docker.from_env()
        
        # Prefer legacy docker-compose for older Docker; fall back to docker compose plugin if present.
        if shutil.which('docker-compose'):
            self.compose_cmd = ['docker-compose']
        elif shutil.which('docker'):
            self.compose_cmd = ['docker', 'compose']
        else:
            self.compose_cmd = ['docker-compose']
        
        # 初始化时强制只保留一个服务运行，防止 GPU 显存溢出
        self._ensure_single_service_on_startup()

        # Prefer legacy docker-compose for older Docker; fall back to docker compose plugin if present.
        if shutil.which('docker-compose'):
            self.compose_cmd = ['docker-compose']
        elif shutil.which('docker'):
            self.compose_cmd = ['docker', 'compose']
        else:
            self.compose_cmd = ['docker-compose']
    
    def _run_docker_compose(self, directory: str, command: str) -> bool:
        """执行 docker compose 命令"""
        try:
            # 先尝试新版 docker compose，失败则用旧版 docker-compose
            args = shlex.split(command)
            cmd = [*self.compose_cmd, *args]
            result = subprocess.run(
                cmd,
                cwd=directory,
                capture_output=True,
                text=True,
                timeout=120
            )
            if result.returncode != 0:
                logger.error(f"Docker compose failed: {' '.join(cmd)}\nstdout: {result.stdout}\nstderr: {result.stderr}")
                return False
            return True
        except Exception as e:
            logger.error(f"Docker compose error: {e}")
            return False

    def _stop_containers(self, names: list[str]) -> None:
        for name in names:
            try:
                c = self.docker.containers.get(name)
            except DockerNotFound:
                logger.warning(f"Container not found: {name}")
                continue
            try:
                c.reload()
                if c.status == 'running':
                    logger.info(f"Stopping container: {name}")
                    c.stop(timeout=DOCKER_STOP_TIMEOUT)
                else:
                    logger.info(f"Container already not running: {name} (status={c.status})")
            except Exception as e:
                logger.error(f"Failed to stop {name}: {e}")

    def _start_containers(self, names: list[str]) -> bool:
        ok = True
        for name in names:
            try:
                c = self.docker.containers.get(name)
            except DockerNotFound:
                logger.error(f"Container not found: {name}. Please run docker-compose up -d once to create it.")
                ok = False
                continue
            try:
                c.reload()
                if c.status != 'running':
                    logger.info(f"Starting container: {name}")
                    c.start()
                else:
                    logger.info(f"Container already running: {name}")
            except Exception as e:
                logger.error(f"Failed to start {name}: {e}")
                ok = False
        return ok
    
    def _wait_for_service(self, service: ServiceType, timeout: int = 60) -> bool:
        """等待服务就绪（包括引擎完全初始化）"""
        url = COSYVOICE_URL if service == 'cosyvoice' else DUIX_URL
        health_endpoint = f"{url}/health" if service == 'cosyvoice' else f"{url}/easy/query?code=health_check"
        
        # CosyVoice 需要同时检查 API 和 Engine
        if service == 'cosyvoice':
            engine_health = self._get_cosyvoice_engine_health_url()
        else:
            engine_health = None
        
        start = time.time()
        api_ready = False
        engine_ready = False if engine_health else True
        
        while time.time() - start < timeout:
            try:
                with httpx.Client(timeout=5) as client:
                    # 检查 API
                    if not api_ready:
                        resp = client.get(health_endpoint)
                        if resp.status_code < 500:
                            api_ready = True
                            logger.info(f"Service {service} API is ready")
                    
                    # 检查 Engine（仅 CosyVoice）
                    if engine_health and not engine_ready:
                        try:
                            resp = client.get(engine_health)
                            if resp.status_code < 500:
                                engine_ready = True
                                logger.info(f"Service {service} Engine is ready")
                        except Exception:
                            pass  # Engine 还在启动
                    
                    # 两个都就绪了
                    if api_ready and engine_ready:
                        logger.info(f"Service {service} is fully ready")
                        return True
            except Exception:
                pass
            time.sleep(2)
        
        logger.warning(f"Service {service} not ready after {timeout}s (api={api_ready}, engine={engine_ready})")
        return False
    
    def switch_to_service(self, target: ServiceType) -> bool:
        """切换到目标服务"""
        with self.lock:
            if self.current_service == target:
                logger.info(f"Already running {target}")
                return True
            
            self.switching = True
            self.switching_started_at = datetime.now()
            self.switching_target = target
            logger.info(f"Switching from {self.current_service} to {target}")
            
            # 停止当前服务
            if self.current_service == 'cosyvoice':
                logger.info("Stopping CosyVoice...")
                self._stop_containers(COSYVOICE_CONTAINERS)
                time.sleep(GPU_RELEASE_SLEEP)  # 等待显存释放
            elif self.current_service == 'duix':
                logger.info("Stopping Duix...")
                self._stop_containers(DUIX_CONTAINERS)
                time.sleep(GPU_RELEASE_SLEEP)
            
            # 启动目标服务
            if target == 'cosyvoice':
                logger.info("Starting CosyVoice...")
                if not self._start_containers(COSYVOICE_CONTAINERS):
                    self.switching = False
                    return False
            elif target == 'duix':
                logger.info("Starting Duix...")
                if not self._start_containers(DUIX_CONTAINERS):
                    self.switching = False
                    return False
            
            # 等待服务就绪
            if not self._wait_for_service(target, SERVICE_SWITCH_TIMEOUT):
                self.switching = False
                return False
            
            self.current_service = target
            self.switching = False
            self.switching_started_at = None
            self.switching_target = None
            logger.info(f"Successfully switched to {target}")
            return True
    
    def _estimate_remaining_seconds(self) -> Optional[int]:
        """估算切换剩余时间"""
        if not self.switching or not self.switching_started_at:
            return None
        elapsed = (datetime.now() - self.switching_started_at).total_seconds()
        # 平均切换时间约 60 秒，最长 120 秒
        estimated_total = 75  # 秒
        remaining = max(0, estimated_total - elapsed)
        return int(remaining)
    
    def _check_service_health(self, service: ServiceType) -> bool:
        """检查服务健康状态（包括 Engine，快速检测，不等待）"""
        if service is None:
            return False
        url = COSYVOICE_URL if service == 'cosyvoice' else DUIX_URL
        health_endpoint = f"{url}/health" if service == 'cosyvoice' else f"{url}/easy/query?code=health_check"
        
        try:
            with httpx.Client(timeout=3) as client:
                resp = client.get(health_endpoint)
                if resp.status_code >= 500:
                    return False
                
                # CosyVoice 还需要检查 Engine
                if service == 'cosyvoice':
                    try:
                        engine_resp = client.get(self._get_cosyvoice_engine_health_url())
                        if engine_resp.status_code >= 500:
                            return False
                    except Exception:
                        return False  # Engine 不可用
                
                return True
        except Exception:
            return False

    def _get_container_ip(self, name: str) -> Optional[str]:
        try:
            c = self.docker.containers.get(name)
        except Exception:
            return None
        try:
            c.reload()
            nets = (c.attrs or {}).get('NetworkSettings', {}).get('Networks', {}) or {}
            for _net_name, net in nets.items():
                ip = (net or {}).get('IPAddress')
                if ip:
                    return ip
        except Exception:
            return None
        return None

    def _get_cosyvoice_engine_health_url(self) -> str:
        if COSYVOICE_ENGINE_HEALTH_URL:
            return COSYVOICE_ENGINE_HEALTH_URL
        ip = self._get_container_ip(COSYVOICE_ENGINE_CONTAINER)
        if ip:
            return f"http://{ip}:{COSYVOICE_ENGINE_PORT}{COSYVOICE_ENGINE_HEALTH_PATH}"
        return f"http://127.0.0.1:{COSYVOICE_ENGINE_PORT}{COSYVOICE_ENGINE_HEALTH_PATH}"

    def _ensure_single_service_on_startup(self):
        """启动时确保只有一个 GPU 服务在运行，防止显存溢出"""
        logger.info("Checking for conflicting GPU services on startup...")
        cosyvoice_running = self._check_service_health('cosyvoice')
        duix_running = self._check_service_health('duix')
        
        if cosyvoice_running and duix_running:
            logger.warning("Both services running! Stopping Duix to free GPU memory...")
            self._stop_containers(DUIX_CONTAINERS)
            time.sleep(GPU_RELEASE_SLEEP)  # 等待显存释放
            self.current_service = 'cosyvoice'
            logger.info("Duix stopped, GPU memory freed. Current service: cosyvoice")
        elif cosyvoice_running:
            self.current_service = 'cosyvoice'
            logger.info("Detected running service: cosyvoice")
        elif duix_running:
            self.current_service = 'duix'
            logger.info("Detected running service: duix")
        else:
            logger.info("No GPU service currently running")

        # 默认启动 CosyVoice：让“音频/克隆”开箱即用，避免用户首次操作被迫等待
        if self.current_service != 'cosyvoice':
            logger.info("Ensuring default service on startup: cosyvoice")
            try:
                threading.Thread(target=lambda: self.switch_to_service('cosyvoice'), daemon=True).start()
            except Exception as e:
                logger.warning(f"Failed to start cosyvoice on startup: {e}")
    
    def get_status(self) -> dict:
        """获取调度器状态（增强版）"""
        return {
            "current_service": self.current_service,
            "switching": self.switching,
            "switching_target": self.switching_target,
            "switching_started_at": self.switching_started_at.isoformat() if self.switching_started_at else None,
            "estimated_remaining_seconds": self._estimate_remaining_seconds(),
            "queue_size": self.task_queue.qsize(),
            "services_health": {
                "cosyvoice": self._check_service_health('cosyvoice'),
                "duix": self._check_service_health('duix'),
            }
        }

# 全局调度器实例
scheduler = GPUScheduler()

# FastAPI 应用
app = FastAPI(title="GPU Service Scheduler", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 密钥验证中间件
@app.middleware("http")
async def verify_api_key(request: Request, call_next):
    # 健康检查接口不需要验证（供服务监控/负载均衡使用）
    if request.url.path in ['/health']:
        return await call_next(request)
    
    # 如果未配置密钥，跳过验证
    if not GPU_API_KEY:
        return await call_next(request)
    
    # 验证请求头中的 API 密钥
    api_key = request.headers.get('X-API-Key', '')
    if api_key != GPU_API_KEY:
        logger.warning(f"Invalid API key from {request.client.host}: {api_key[:8]}..." if api_key else f"Missing API key from {request.client.host}")
        return JSONResponse({"error": "Invalid or missing API key"}, status_code=401)
    
    return await call_next(request)

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/status")
async def status():
    return scheduler.get_status()

@app.post("/switch/{service}")
async def switch_service(service: str):
    """手动切换服务"""
    if service not in ['cosyvoice', 'duix']:
        raise HTTPException(400, "Invalid service. Use 'cosyvoice' or 'duix'")
    
    if scheduler.switching:
        raise HTTPException(503, "Service switching in progress, please wait")
    
    success = scheduler.switch_to_service(service)
    if not success:
        raise HTTPException(500, f"Failed to switch to {service}")
    
    return {"success": True, "current_service": service}

@app.post("/preswitch/{service}")
async def preswitch_service(service: str, background_tasks: BackgroundTasks):
    """异步预热服务（不阻塞当前请求）
    
    用于前端预测用户行为，提前切换服务，减少等待时间。
    例如：用户点击"数字人"Tab 时，预热 duix 服务。
    """
    if service not in ['cosyvoice', 'duix']:
        raise HTTPException(400, "Invalid service. Use 'cosyvoice' or 'duix'")
    
    # 如果已经是目标服务，无需切换
    if scheduler.current_service == service:
        return {
            "success": True, 
            "message": "Already running", 
            "no_switch_needed": True,
            "current_service": service
        }
    
    # 如果正在切换中
    if scheduler.switching:
        return {
            "success": True, 
            "message": "Already switching", 
            "in_progress": True,
            "switching_target": scheduler.switching_target,
            "estimated_remaining_seconds": scheduler._estimate_remaining_seconds()
        }
    
    # 后台异步切换
    def do_switch():
        scheduler.switch_to_service(service)
    
    background_tasks.add_task(do_switch)
    
    return {
        "success": True, 
        "message": "Preswitch started", 
        "started": True,
        "target_service": service
    }

# ========== CosyVoice 代理 ==========

@app.api_route("/v1/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_cosyvoice(path: str, request: Request):
    """代理 CosyVoice 请求"""
    # 自动切换到 CosyVoice
    if scheduler.current_service != 'cosyvoice':
        if scheduler.switching:
            return JSONResponse({"error": "Service switching in progress"}, status_code=503)
        
        success = scheduler.switch_to_service('cosyvoice')
        if not success:
            return JSONResponse({"error": "Failed to start CosyVoice"}, status_code=500)
    
    # 转发请求
    url = f"{COSYVOICE_URL}/v1/{path}"
    
    async with httpx.AsyncClient(timeout=600) as client:  # 增加超时以支持长文本 TTS
        try:
            body = await request.body()
            resp = await client.request(
                method=request.method,
                url=url,
                content=body,
                headers={k: v for k, v in request.headers.items() if k.lower() not in ['host']},
                params=request.query_params,
            )
            return JSONResponse(resp.json() if resp.headers.get('content-type', '').startswith('application/json') else {"data": resp.text}, status_code=resp.status_code)
        except Exception as e:
            logger.error(f"CosyVoice proxy error: {e}")
            return JSONResponse({"error": str(e)}, status_code=500)

# ========== Duix 上传代理（/upload）==========

@app.api_route("/upload", methods=["POST"])
async def proxy_upload(request: Request, background_tasks: BackgroundTasks):
    """代理 Duix 上传（避免前端直连 8383）"""
    if scheduler.current_service != 'duix':
        if scheduler.switching:
            return JSONResponse({"error": "Service switching in progress"}, status_code=503)

        success = scheduler.switch_to_service('duix')
        if not success:
            return JSONResponse({"error": "Failed to start Duix"}, status_code=500)

    url = f"{DUIX_URL}/upload"

    client = httpx.AsyncClient(timeout=600, follow_redirects=True)
    try:
        req = client.build_request(
            method=request.method,
            url=url,
            content=request.stream(),
            headers={k: v for k, v in request.headers.items() if k.lower() not in ['host']},
            params=request.query_params,
        )
        resp = await client.send(req, stream=True)
    except Exception as e:
        await client.aclose()
        logger.error(f"Upload proxy error: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

    background_tasks.add_task(resp.aclose)
    background_tasks.add_task(client.aclose)

    return StreamingResponse(
        resp.aiter_bytes(),
        status_code=resp.status_code,
        media_type=resp.headers.get('content-type', 'application/octet-stream'),
    )

# ========== Duix 代理 ==========

@app.api_route("/easy/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_duix(path: str, request: Request):
    """代理 Duix 请求"""
    # 自动切换到 Duix
    if scheduler.current_service != 'duix':
        if scheduler.switching:
            return JSONResponse({"error": "Service switching in progress"}, status_code=503)
        
        success = scheduler.switch_to_service('duix')
        if not success:
            return JSONResponse({"error": "Failed to start Duix"}, status_code=500)
    
    # 转发请求
    url = f"{DUIX_URL}/easy/{path}"
    
    async with httpx.AsyncClient(timeout=600) as client:  # 增加超时以支持长时间操作
        try:
            body = await request.body()
            resp = await client.request(
                method=request.method,
                url=url,
                content=body,
                headers={k: v for k, v in request.headers.items() if k.lower() not in ['host']},
                params=request.query_params,
            )
            
            # 返回原始响应
            return JSONResponse(
                resp.json() if resp.headers.get('content-type', '').startswith('application/json') else {"data": resp.text},
                status_code=resp.status_code
            )
        except Exception as e:
            logger.error(f"Duix proxy error: {e}")
            return JSONResponse({"error": str(e)}, status_code=500)

# 文件下载代理（Duix 视频下载）
@app.get("/download")
async def proxy_download(request: Request, background_tasks: BackgroundTasks):
    """代理 Duix 文件下载"""
    if scheduler.current_service != 'duix':
        if scheduler.switching:
            return JSONResponse({"error": "Service switching in progress"}, status_code=503)

        success = scheduler.switch_to_service('duix')
        if not success:
            return JSONResponse({"error": "Failed to start Duix"}, status_code=500)

    url = f"{DUIX_URL}/download"

    client = httpx.AsyncClient(timeout=600, follow_redirects=True)
    try:
        req = client.build_request('GET', url, params=request.query_params)
        resp = await client.send(req, stream=True)
    except Exception as e:
        await client.aclose()
        logger.error(f"Download proxy error: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)

    background_tasks.add_task(resp.aclose)
    background_tasks.add_task(client.aclose)

    return StreamingResponse(
        resp.aiter_bytes(),
        status_code=resp.status_code,
        media_type=resp.headers.get('content-type', 'application/octet-stream'),
        headers={
            'Content-Disposition': resp.headers.get('Content-Disposition', ''),
        }
    )

if __name__ == "__main__":
    logger.info("Starting GPU Service Scheduler on port 9999...")
    uvicorn.run(app, host="0.0.0.0", port=9999)
