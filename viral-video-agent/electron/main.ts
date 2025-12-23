// 加载环境变量（尽量在最开头）
import dotenv from 'dotenv'
import fs from 'fs'
import path from 'path'

function loadEnvFile() {
    const resourcesPath = (process as unknown as { resourcesPath?: string }).resourcesPath

    // 按优先级尝试多个 .env 位置
    const candidates = [
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
    ].filter((p): p is string => typeof p === 'string' && p.length > 0)

    console.log('[Env] 正在搜索配置文件...')
    for (const envPath of candidates) {
        try {
            if (!fs.existsSync(envPath)) continue
            const result = dotenv.config({ path: envPath })
            if (!result.error) {
                console.log('[Env] 成功加载配置文件:', envPath)
                process.env.VIRAL_VIDEO_AGENT_ENV_PATH_LOADED = envPath
                return
            }
        } catch (e) {
            console.error(`[Env] 加载 ${envPath} 失败:`, e)
        }
    }

    // 默认行为
    dotenv.config()
}

loadEnvFile()

function appendNoProxyHost(rawUrl: string | undefined) {
    if (!rawUrl) return

    let host = ''
    try {
        host = new URL(rawUrl).hostname
    } catch {
        host = rawUrl.replace(/^https?:\/\//, '').split(/[/:]/)[0] || ''
    }

    host = host.trim()
    if (!host) return

    const existing = (process.env.NO_PROXY || process.env.no_proxy || '').trim()
    const parts = existing ? existing.split(',').map(s => s.trim()).filter(Boolean) : []

    if (!parts.includes(host)) {
        parts.push(host)
    }

    process.env.NO_PROXY = parts.join(',')
    process.env.no_proxy = process.env.NO_PROXY
}

appendNoProxyHost('localhost')
appendNoProxyHost('127.0.0.1')
appendNoProxyHost(process.env.CLOUD_GPU_SERVER_URL)
appendNoProxyHost(process.env.CLOUD_VOICE_SERVER_URL)

import { app, BrowserWindow, ipcMain } from 'electron'
import { registerIpcHandlers } from './ipcHandlers'

let mainWindow: BrowserWindow | null = null

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
    })

    // 注册 IPC 处理器
    registerIpcHandlers(mainWindow)

    // 开发模式加载本地服务器，生产模式加载打包文件
    if (process.env.NODE_ENV === 'development') {
        // 强制清理开发缓存
        const { session } = require('electron')
        session.defaultSession.clearCache().then(() => {
            console.log('[Dev] 缓存已清理，加载最新本地服务器...')
            mainWindow?.loadURL('http://localhost:5173')
        })
        mainWindow.webContents.openDevTools()
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    }

    mainWindow.on('closed', () => {
        mainWindow = null
    })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow()
    }
})
