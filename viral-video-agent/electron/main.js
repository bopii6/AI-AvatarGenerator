// 加载环境变量（尽量在最开头）
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
function loadEnvFile() {
    var resourcesPath = process.resourcesPath;
    // 按优先级尝试多个 .env 位置
    var candidates = [
        // 1. 显式指定的路径
        process.env.VIRAL_VIDEO_AGENT_ENV_PATH,
        // 2. 当前工作目录 (通常是运行目录)
        path.join(process.cwd(), '.env'),
        // 3. 可执行文件同级目录 (EXE 所在文件夹)
        path.join(path.dirname(process.execPath), '.env'),
        // 4. 资源目录 (如果是打包后的 resources 文件夹)
        resourcesPath ? path.join(resourcesPath, '.env') : undefined,
        // 5. 开发者模式: 项目根目录 (相对于打包后的 dist-electron/main.js)
        path.join(__dirname, '..', '..', '.env'),
        // 6. 特殊情况：如果是在 release/win-unpacked 下运行，往上退两级找根目录
        path.join(path.dirname(process.execPath), '..', '..', '.env'),
        // 7. 用户数据目录 (适合存放持久配置)
        path.join(app.getPath('userData'), '.env'),
    ].filter(function (p) { return typeof p === 'string' && p.length > 0; });
    console.log('[Env] 正在搜索配置文件...');
    for (var _i = 0, candidates_1 = candidates; _i < candidates_1.length; _i++) {
        var envPath = candidates_1[_i];
        try {
            if (!fs.existsSync(envPath))
                continue;
            var result = dotenv.config({ path: envPath });
            if (!result.error) {
                console.log('[Env] 成功加载配置文件:', envPath);
                process.env.VIRAL_VIDEO_AGENT_ENV_PATH_LOADED = envPath;
                return;
            }
        }
        catch (e) {
            console.error("[Env] \u52A0\u8F7D ".concat(envPath, " \u5931\u8D25:"), e);
        }
    }
    // 默认行为
    dotenv.config();
}
loadEnvFile();
function appendNoProxyHost(rawUrl) {
    if (!rawUrl)
        return;
    var host = '';
    try {
        host = new URL(rawUrl).hostname;
    }
    catch (_a) {
        host = rawUrl.replace(/^https?:\/\//, '').split(/[/:]/)[0] || '';
    }
    host = host.trim();
    if (!host)
        return;
    var existing = (process.env.NO_PROXY || process.env.no_proxy || '').trim();
    var parts = existing ? existing.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];
    if (!parts.includes(host)) {
        parts.push(host);
    }
    process.env.NO_PROXY = parts.join(',');
    process.env.no_proxy = process.env.NO_PROXY;
}
appendNoProxyHost('localhost');
appendNoProxyHost('127.0.0.1');
appendNoProxyHost(process.env.CLOUD_GPU_SERVER_URL);
import { app, BrowserWindow } from 'electron';
import { registerIpcHandlers } from './ipcHandlers';
var mainWindow = null;
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 800,
        title: '360行 AI智能体大脑',
        autoHideMenuBar: true, // 隐藏菜单栏
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: false, // 允许加载本地文件用于预览
        },
    });
    // 注册 IPC 处理器
    registerIpcHandlers(mainWindow);
    // 开发模式加载本地服务器，生产模式加载打包文件
    if (process.env.NODE_ENV === 'development') {
        // 强制清理开发缓存
        var session = require('electron').session;
        session.defaultSession.clearCache().then(function () {
            console.log('[Dev] 缓存已清理，加载最新本地服务器...');
            mainWindow === null || mainWindow === void 0 ? void 0 : mainWindow.loadURL('http://localhost:5173');
        });
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}
app.whenReady().then(createWindow);
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});
