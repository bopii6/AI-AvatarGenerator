/**
 * Electron IPC 处理器
 * 连接主进程服务和渲染进程
 */

import { ipcMain, app, BrowserWindow, dialog, shell, safeStorage } from 'electron'
import path from 'path'
import { downloadDouyinVideo, fetchProfileVideos, isProfileUrl } from '../src/services/douyinService'
import { transcribeAudio, AsrConfig } from '../src/services/asrService'
import { generateSpeechFile, TtsConfig, getVoiceOptions } from '../src/services/ttsService'
import { rewriteCopy, generateTitles, generateHashtags, analyzeCopyPattern, HunyuanConfig } from '../src/services/hunyuanService'
import {
    getDefaultConfig as getDigitalHumanConfig,
    generateVideo as generateDigitalHumanVideo,
    getSavedSourceVideos,
    checkSystemReady,
    initializeSystem,
    saveSourceVideo
} from '../src/services/digitalHumanService'
import { burnSubtitles, addBackgroundMusic, captureFrame, extractAudio, sliceAudio, getMediaDuration, generateSrtFile } from '../src/services/ffmpegService'
import { generateCover, CoverServiceConfig } from '../src/services/coverService'
import { runPipeline, PipelineConfig } from '../src/services/pipelineService'
import { spawn } from 'child_process'
import http from 'http'
import fs from 'fs'
import FormData from 'form-data'
import { randomBytes, randomUUID } from 'crypto'

let socialAutoUploadProc: ReturnType<typeof spawn> | null = null
let socialAutoUploadWindow: BrowserWindow | null = null

const schedulerStatusTimeout = parseInt(process.env.SCHEDULER_STATUS_TIMEOUT || '20000', 10)
const SCHEDULER_STATUS_TIMEOUT = Number.isFinite(schedulerStatusTimeout) && schedulerStatusTimeout > 0
    ? schedulerStatusTimeout
    : 20000
const debugScheduler = process.env.DEBUG_SCHEDULER === '1'
const schedulerHttpAgent = new http.Agent({ keepAlive: true, maxSockets: 8, keepAliveMsecs: 5000 })
let schedulerStatusInFlight: Promise<any> | null = null

function uuidv4(): string {
    if (typeof randomUUID === 'function') return randomUUID()
    const bytes = randomBytes(16)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = bytes.toString('hex')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

type PublishPlatformKey = 'douyin' | 'xiaohongshu' | 'shipinhao' | 'kuaishou'
const PUBLISH_PLATFORM_TYPE: Record<PublishPlatformKey, number> = {
    // 1 小红书 2 视频号 3 抖音 4 快手
    xiaohongshu: 1,
    shipinhao: 2,
    douyin: 3,
    kuaishou: 4,
}

type PublishCookieEntry = {
    platform: PublishPlatformKey
    userName: string
    value: string // encrypted (base64) or plaintext json
    encrypted: boolean
    updatedAt: number
}

type CookieEditorCookie = {
    domain: string
    name: string
    value: string
    path?: string
    secure?: boolean
    httpOnly?: boolean
    sameSite?: string
    hostOnly?: boolean
    session?: boolean
    expirationDate?: number
    storeId?: string
}

function getPublishCookieStorePath() {
    return path.join(app.getPath('userData'), 'publish_cookies.json')
}

function readPublishCookieStore(): PublishCookieEntry[] {
    try {
        const file = getPublishCookieStorePath()
        if (!fs.existsSync(file)) return []
        const raw = fs.readFileSync(file, 'utf-8')
        const parsed = JSON.parse(raw)
        if (!Array.isArray(parsed)) return []
        return parsed as PublishCookieEntry[]
    } catch {
        return []
    }
}

function writePublishCookieStore(entries: PublishCookieEntry[]) {
    const file = getPublishCookieStorePath()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(entries, null, 2), 'utf-8')
}

function encryptCookieJson(cookieJson: string): { value: string; encrypted: boolean } {
    if (safeStorage.isEncryptionAvailable()) {
        const buf = safeStorage.encryptString(cookieJson)
        return { value: buf.toString('base64'), encrypted: true }
    }
    return { value: cookieJson, encrypted: false }
}

function decryptCookieJson(entry: PublishCookieEntry): string {
    if (entry.encrypted) {
        const buf = Buffer.from(entry.value, 'base64')
        return safeStorage.decryptString(buf)
    }
    return entry.value
}

function getPublishLogPath() {
    return path.join(app.getPath('userData'), 'logs', 'publish.log')
}

function logPublish(message: string, extra?: Record<string, any>) {
    try {
        const payload = {
            ts: new Date().toISOString(),
            message,
            ...(extra ? { extra } : {}),
        }
        const line = JSON.stringify(
            {
                ...payload,
            },
            null,
            0
        )

        // 同时输出到终端（不包含 Cookie 内容）
        try {
            // eslint-disable-next-line no-console
            console.log(`[publish] ${payload.ts} ${payload.message}${payload.extra ? ` ${JSON.stringify(payload.extra)}` : ''}`)
        } catch {
            // ignore
        }

        const file = getPublishLogPath()
        fs.mkdirSync(path.dirname(file), { recursive: true })
        fs.appendFileSync(file, line + '\n', 'utf-8')
    } catch {
        // ignore
    }
}

function platformDefaultCookieDomain(platform: PublishPlatformKey): string {
    switch (platform) {
        case 'douyin':
            return '.douyin.com'
        case 'xiaohongshu':
            return '.xiaohongshu.com'
        case 'shipinhao':
            // 视频号常见域名：channels.weixin.qq.com / weixin.qq.com
            return 'channels.weixin.qq.com'
        default:
            return ''
    }
}

function parseCookieHeaderStringToCookieEditorJson(
    platform: PublishPlatformKey,
    rawCookieHeader: string,
): { json: string; cookieCount: number } {
    const domain = platformDefaultCookieDomain(platform)
    const pairs = rawCookieHeader
        .split(';')
        .map(s => s.trim())
        .filter(Boolean)
        .map(part => {
            const eq = part.indexOf('=')
            if (eq <= 0) return null
            const name = part.slice(0, eq).trim()
            const value = part.slice(eq + 1).trim()
            if (!name) return null
            return { name, value }
        })
        .filter(Boolean) as Array<{ name: string; value: string }>

    if (pairs.length === 0) {
        throw new Error('未识别到有效 Cookie（示例：a=b; c=d）。如果你导出的是 JSON，请直接粘贴 JSON。')
    }

    const cookies: CookieEditorCookie[] = pairs.map(({ name, value }) => ({
        domain,
        name,
        value,
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'unspecified',
        hostOnly: !domain.startsWith('.'),
        session: true,
    }))

    return { json: JSON.stringify(cookies, null, 2), cookieCount: cookies.length }
}

function normalizeCookieInput(platform: PublishPlatformKey, input: string): { normalizedJson: string; format: 'json' | 'cookie-header'; cookieCount?: number } {
    const raw = (input || '').trim()
    if (!raw) throw new Error('请输入 Cookie（JSON 或 Cookie 字符串）')

    try {
        const parsed = JSON.parse(raw)
        // 允许 array/object，保存为格式化后的 JSON，避免用户粘贴压缩内容难以排查
        return { normalizedJson: JSON.stringify(parsed, null, 2), format: 'json' }
    } catch {
        // 兼容用户粘贴 Request Headers 的 cookie 字符串：a=b; c=d
        const converted = parseCookieHeaderStringToCookieEditorJson(platform, raw)
        return { normalizedJson: converted.json, format: 'cookie-header', cookieCount: converted.cookieCount }
    }
}

function safeErrorMessage(error: any): string {
    const msg = (error && typeof error === 'object' && 'message' in error) ? String((error as any).message || '') : String(error || '')
    const stack = (error && typeof error === 'object' && 'stack' in error) ? String((error as any).stack || '') : ''
    return (msg || stack || '未知错误').toString()
}

function getOrCreateDeviceId() {
    const filePath = path.join(app.getPath('userData'), 'device_id.txt')
    try {
        if (fs.existsSync(filePath)) {
            const id = fs.readFileSync(filePath, 'utf-8').trim()
            if (id) return id
        }
    } catch {
        // ignore
    }

    const id = uuidv4()
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.writeFileSync(filePath, id, 'utf-8')
    } catch {
        // ignore
    }
    return id
}

// ========== 配置管理 (动态加载与持久化) ==========
function getServerConfigPath() {
    return path.join(app.getPath('userData'), 'server_config.json')
}

// 默认配置（如果本地文件不存在，且环境变量也未注入时的保底方案）
function getBuiltInConfig(): Partial<PipelineConfig> {
    return {
        tencent: {
            secretId: process.env.TENCENT_SECRET_ID || '',
            secretKey: process.env.TENCENT_SECRET_KEY || '',
        },
        aliyun: {
            accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || '',
            accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || '',
        },
        // 注意：这些 URL 会被本地存储覆盖
        digitalHuman: {
            apiUrl: process.env.CLOUD_GPU_SERVER_URL ? `${process.env.CLOUD_GPU_SERVER_URL}:${process.env.CLOUD_GPU_VIDEO_PORT || 8383}` : 'http://localhost:8080',
        },
        coverProvider: (process.env.COVER_PROVIDER === 'tencent' ? 'tencent' : 'aliyun') as 'aliyun' | 'tencent',
        // 传递其他全局变量
        extra: {
            cloudVoiceServerUrl: process.env.CLOUD_VOICE_SERVER_URL || '',
            cloudVoicePort: process.env.CLOUD_VOICE_PORT || '9090',
            cloudGpuServerUrl: process.env.CLOUD_GPU_SERVER_URL || '',
            cloudGpuVideoPort: process.env.CLOUD_GPU_VIDEO_PORT || '8383',
        }
    }
}

function readServerConfig(): Record<string, string> {
    try {
        const file = getServerConfigPath()
        if (!fs.existsSync(file)) return {}
        const raw = fs.readFileSync(file, 'utf-8')
        return JSON.parse(raw)
    } catch {
        return {}
    }
}

function saveServerConfig(updated: Record<string, string>) {
    const file = getServerConfigPath()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(updated, null, 2), 'utf-8')
}

function getConfig(): PipelineConfig {
    const builtIn = getBuiltInConfig() as PipelineConfig
    const runtime = readServerConfig()

    // 合并运行时覆盖 (主要是 IP 和端口)
    const cloudGpuUrl = runtime.CLOUD_GPU_SERVER_URL || process.env.CLOUD_GPU_SERVER_URL || ''
    const cloudGpuPort = runtime.CLOUD_GPU_VIDEO_PORT || process.env.CLOUD_GPU_VIDEO_PORT || '8383'

    // 如果有设置 IP，则构造完整的 API URL
    if (cloudGpuUrl) {
        builtIn.digitalHuman.apiUrl = cloudGpuUrl.startsWith('http') ? `${cloudGpuUrl}:${cloudGpuPort}` : `http://${cloudGpuUrl}:${cloudGpuPort}`
    }

    // 注入额外的配置项供后续组件使用
    if (!builtIn.extra) builtIn.extra = {}
    builtIn.extra.cloudGpuServerUrl = cloudGpuUrl
    builtIn.extra.cloudGpuVideoPort = cloudGpuPort
    builtIn.extra.cloudVoiceServerUrl = runtime.CLOUD_VOICE_SERVER_URL || process.env.CLOUD_VOICE_SERVER_URL || ''
    builtIn.extra.cloudVoicePort = runtime.CLOUD_VOICE_PORT || process.env.CLOUD_VOICE_PORT || '9090'

    // 输出目录始终位于用户数据文件夹下
    builtIn.outputDir = path.join(app.getPath('userData'), 'output')

    return builtIn
}

/**
 * 注册所有 IPC 处理器
 */
export function registerIpcHandlers(mainWindow: BrowserWindow) {
    let config = getConfig()
    const deviceId = getOrCreateDeviceId()

    const normalizeHttpUrl = (raw: string): string => {
        const trimmed = (raw || '').trim().replace(/\/+$/, '')
        if (!trimmed) return ''
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
        return `http://${trimmed}`
    }

    const getCloudVoiceRuntime = () => {
        const serverUrlRaw = config.extra?.cloudVoiceServerUrl || process.env.CLOUD_VOICE_SERVER_URL || ''
        const portRaw = config.extra?.cloudVoicePort || process.env.CLOUD_VOICE_PORT || '9090'
        return {
            serverUrl: normalizeHttpUrl(serverUrlRaw),
            port: parseInt(portRaw, 10),
        }
    }

    const getCloudGpuRuntime = () => {
        const runtime = readServerConfig()
        const serverUrlRaw = config.extra?.cloudGpuServerUrl || process.env.CLOUD_GPU_SERVER_URL || ''
        const portRaw = config.extra?.cloudGpuVideoPort || process.env.CLOUD_GPU_VIDEO_PORT || '8383'
        // 9999 是调度器端口（/status、/preswitch），文件/生成服务默认是 8383。
        // 为避免用户误把 9999 填到“视频端口”，这里做一次自愈修正。
        const parsed = parseInt(portRaw, 10)
        const videoPort = parsed === 9999 ? 8383 : parsed
        return {
            serverUrl: normalizeHttpUrl(serverUrlRaw),
            videoPort,
            // server_config.json 显式配置优先（允许为空以覆盖 env），否则回退到 env
            apiKey: (Object.prototype.hasOwnProperty.call(runtime, 'GPU_API_KEY')
                ? (runtime.GPU_API_KEY || '')
                : (process.env.GPU_API_KEY || '')).trim(),
        }
    }

    // ========== 系统配置 IPC ==========
    ipcMain.handle('config-get', async () => {
        const full = getConfig()
        const runtime = readServerConfig()
        const apiKeyRaw = Object.prototype.hasOwnProperty.call(runtime, 'GPU_API_KEY')
            ? (runtime.GPU_API_KEY || '')
            : (process.env.GPU_API_KEY || '')
        // 过滤掉敏感 Key，只向前端暴露可配置的 IP 和非敏感项
        return {
            success: true,
            data: {
                CLOUD_GPU_SERVER_URL: full.extra?.cloudGpuServerUrl || '',
                CLOUD_GPU_VIDEO_PORT: full.extra?.cloudGpuVideoPort || '8383',
                GPU_API_KEY: apiKeyRaw.trim(),
                CLOUD_VOICE_SERVER_URL: full.extra?.cloudVoiceServerUrl || '',
                CLOUD_VOICE_PORT: full.extra?.cloudVoicePort || '9090',
                COVER_PROVIDER: full.coverProvider,
                loadedEnvPath: process.env.VIRAL_VIDEO_AGENT_ENV_PATH_LOADED || 'Built-in'
            }
        }
    })

    ipcMain.handle('config-update', async (_event, updates: Record<string, string>) => {
        try {
            const current = readServerConfig()
            const next = { ...current, ...updates }
            saveServerConfig(next)

            // 热更新内存中的配置对象
            config = getConfig()

            return { success: true }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // ========== 全网分发（Cookie 管理）==========
    ipcMain.handle('publish-cookie-list', async () => {
        try {
            logPublish('publish-cookie-list:start')
            const entries = readPublishCookieStore()
                .map(e => ({ platform: e.platform, userName: e.userName, updatedAt: e.updatedAt, encrypted: e.encrypted }))
                .sort((a, b) => b.updatedAt - a.updatedAt)
            logPublish('publish-cookie-list:ok', { count: entries.length })
            return { success: true, data: entries }
        } catch (error: any) {
            logPublish('publish-cookie-list:error', { error: safeErrorMessage(error) })
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('publish-cookie-save', async (_event, params: { platform: PublishPlatformKey; userName: string; cookieJson: string }) => {
        try {
            const platform = params?.platform
            const userName = (params?.userName || '').trim()
            const cookieJson = (params?.cookieJson || '').trim()
            logPublish('publish-cookie-save:start', { platform, userName })

            if (!platform || !(platform in PUBLISH_PLATFORM_TYPE)) {
                throw new Error('请选择平台')
            }
            if (!userName) {
                throw new Error('请输入账号名称')
            }

            const normalized = normalizeCookieInput(platform, cookieJson)
            logPublish('publish-cookie-save:normalized', { platform, userName, format: normalized.format, cookieCount: normalized.cookieCount })

            const entries = readPublishCookieStore()
            const encoded = encryptCookieJson(normalized.normalizedJson)
            const now = Date.now()
            const next: PublishCookieEntry = { platform, userName, value: encoded.value, encrypted: encoded.encrypted, updatedAt: now }
            const merged = entries.filter(e => !(e.platform === platform && e.userName === userName))
            merged.unshift(next)
            writePublishCookieStore(merged)

            logPublish('publish-cookie-save:ok', { platform, userName, encrypted: encoded.encrypted, format: normalized.format, cookieCount: normalized.cookieCount })
            return { success: true, data: { encrypted: encoded.encrypted, format: normalized.format, cookieCount: normalized.cookieCount } }
        } catch (error: any) {
            logPublish('publish-cookie-save:error', { platform: params?.platform, userName: params?.userName, error: safeErrorMessage(error) })
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('publish-cookie-delete', async (_event, params: { platform: PublishPlatformKey; userName: string }) => {
        try {
            const platform = params?.platform
            const userName = (params?.userName || '').trim()
            logPublish('publish-cookie-delete:start', { platform, userName })
            if (!platform || !(platform in PUBLISH_PLATFORM_TYPE) || !userName) {
                throw new Error('参数错误')
            }
            const entries = readPublishCookieStore()
            const next = entries.filter(e => !(e.platform === platform && e.userName === userName))
            writePublishCookieStore(next)
            logPublish('publish-cookie-delete:ok', { platform, userName })
            return { success: true }
        } catch (error: any) {
            logPublish('publish-cookie-delete:error', { platform: params?.platform, userName: params?.userName, error: safeErrorMessage(error) })
            return { success: false, error: error.message }
        }
    })

    // ========== 诊断接口 ==========
    ipcMain.handle('env-get-loaded-path', async () => {
        return {
            success: true,
            data: {
                loadedPath: process.env.VIRAL_VIDEO_AGENT_ENV_PATH_LOADED || '未加载任何 .env 文件',
                cwd: process.cwd(),
                execPath: process.execPath,
                appPath: app.getAppPath()
            }
        }
    })

    // ========== GPU 调度器状态 ==========

    // 获取调度器端口（固定 9999）
    const getSchedulerUrl = () => {
        const { serverUrl } = getCloudGpuRuntime()
        if (!serverUrl) return null
        // 调度器端口固定为 9999
        const base = serverUrl.replace(/:\d+$/, '')
        return `${base}:9999`
    }

    ipcMain.handle('scheduler-get-status', async () => {
        if (schedulerStatusInFlight) return schedulerStatusInFlight

        schedulerStatusInFlight = (async () => {
            try {
                const schedulerUrl = getSchedulerUrl()
                if (debugScheduler) console.log('[Scheduler] URL:', schedulerUrl)

                if (!schedulerUrl) {
                    return {
                        success: false,
                        error: '未配置 GPU 服务器地址',
                        data: { online: false }
                    }
                }

                const result = await new Promise<{ data: any; statusCode: number }>((resolve, reject) => {
                    if (debugScheduler) console.log('[Scheduler] Fetching:', `${schedulerUrl}/status`)
                    let didTimeout = false
                    const { apiKey } = getCloudGpuRuntime()
                    const req = http.get(`${schedulerUrl}/status`, {
                        timeout: SCHEDULER_STATUS_TIMEOUT,
                        agent: schedulerHttpAgent,
                        headers: {
                            'User-Agent': 'ViralVideoAgent/1.0',
                            'Accept': 'application/json',
                            ...(apiKey ? { 'X-API-Key': apiKey } : {}),
                        }
                    }, (res) => {
                        res.setEncoding('utf8')
                        let data = ''
                        res.on('data', chunk => data += chunk)
                        res.on('end', () => {
                            if (debugScheduler) console.log('[Scheduler] Got data:', data.substring(0, 200))
                            const statusCode = res.statusCode || 0
                            try {
                                resolve({ data: JSON.parse(data), statusCode })
                            } catch {
                                resolve({ data, statusCode })
                            }
                        })
                    })
                    req.on('timeout', () => {
                        if (debugScheduler) console.error('[Scheduler] Timeout')
                        didTimeout = true
                        req.destroy()
                        reject(new Error('调度器请求超时'))
                    })
                    req.on('error', (e) => {
                        if (didTimeout && (e as NodeJS.ErrnoException)?.code === 'ECONNRESET') {
                            return
                        }
                        if (debugScheduler) console.error('[Scheduler] Error:', (e as any)?.message || e)
                        reject(e)
                    })
                })

                if (result.statusCode === 401) {
                    return {
                        success: false,
                        error: 'API 密钥无效或未配置，请先在「服务器设置」中填写正确的 GPU_API_KEY',
                        data: { online: false, apiKeyError: true }
                    }
                }
                if (result.statusCode >= 400) {
                    const rawErr = (result.data as any)?.error
                    throw new Error(rawErr ? String(rawErr) : `调度器返回错误: HTTP ${result.statusCode}`)
                }

                return {
                    success: true,
                    data: {
                        ...(result.data || {}),
                        online: true,
                    }
                }
            } catch (error: any) {
                if (debugScheduler) console.error('[Scheduler] Catch error:', error.message)
                return {
                    success: false,
                    error: error.message,
                    data: { online: false }
                }
            } finally {
                schedulerStatusInFlight = null
            }
        })()

        return schedulerStatusInFlight
    })

    ipcMain.handle('scheduler-preswitch', async (_event, service: string) => {
        try {
            const schedulerUrl = getSchedulerUrl()
            if (!schedulerUrl) {
                return { success: false, error: '未配置 GPU 服务器地址' }
            }

            if (!['cosyvoice', 'duix'].includes(service)) {
                return { success: false, error: '无效的服务类型' }
            }

            const result = await new Promise<{ data: any; statusCode: number }>((resolve, reject) => {
                const { apiKey } = getCloudGpuRuntime()
                const req = http.request(`${schedulerUrl}/preswitch/${service}`, {
                    method: 'POST',
                    timeout: 10000,
                    agent: schedulerHttpAgent,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'ViralVideoAgent/1.0',
                        ...(apiKey ? { 'X-API-Key': apiKey } : {}),
                    },
                }, (res) => {
                    let data = ''
                    res.on('data', chunk => data += chunk)
                    res.on('end', () => {
                        try {
                            resolve({ data: JSON.parse(data), statusCode: res.statusCode || 0 })
                        } catch {
                            resolve({ data, statusCode: res.statusCode || 0 })
                        }
                    })
                })
                req.on('timeout', () => {
                    req.destroy()
                    reject(new Error('预热请求超时'))
                })
                req.on('error', reject)
                req.end()
            })

            // 检查 HTTP 状态码
            if (result.statusCode === 401) {
                return { success: false, error: 'API 密钥无效，请在设置中检查密钥' }
            }
            if (result.statusCode >= 400) {
                return { success: false, error: result.data?.error || `HTTP ${result.statusCode}` }
            }

            return { success: true, data: result.data }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // ========== 云端声音克隆（CosyVoice）==========
    // ========== GPU API 密钥校验（不落盘）==========
    ipcMain.handle('scheduler-validate-key', async (_event, apiKeyRaw: string) => {
        try {
            const schedulerUrl = getSchedulerUrl()
            if (!schedulerUrl) {
                return { success: false, error: '未配置 GPU 服务器地址，请先在「服务器设置」里填写服务器 IP/域名' }
            }

            const apiKey = (apiKeyRaw || '').trim()
            if (!apiKey) return { success: false, error: 'API 密钥为空' }

            const result = await new Promise<{ data: any; statusCode: number }>((resolve, reject) => {
                const req = http.get(`${schedulerUrl}/status`, {
                    timeout: SCHEDULER_STATUS_TIMEOUT,
                    agent: schedulerHttpAgent,
                    headers: {
                        'User-Agent': 'ViralVideoAgent/1.0',
                        'Accept': 'application/json',
                        'X-API-Key': apiKey,
                    }
                }, (res) => {
                    res.setEncoding('utf8')
                    let data = ''
                    res.on('data', chunk => data += chunk)
                    res.on('end', () => {
                        const statusCode = res.statusCode || 0
                        try {
                            resolve({ data: JSON.parse(data), statusCode })
                        } catch {
                            resolve({ data, statusCode })
                        }
                    })
                })
                req.on('timeout', () => {
                    req.destroy()
                    reject(new Error('验证请求超时'))
                })
                req.on('error', reject)
            })

            if (result.statusCode === 401) {
                return { success: false, error: '密钥不正确，请检查 GPU_API_KEY 是否填写正确' }
            }
            if (result.statusCode >= 400) {
                const rawErr = (result.data as any)?.error
                return { success: false, error: rawErr ? String(rawErr) : `验证失败: HTTP ${result.statusCode}` }
            }

            return { success: true }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('cloud-voice-check-status', async () => {
        try {
            const { checkCloudVoiceStatus } = await import('../src/services/cloudVoiceService')
            const { serverUrl, port } = getCloudVoiceRuntime()
            const { apiKey } = getCloudGpuRuntime()
            const status = await checkCloudVoiceStatus({
                serverUrl,
                port,
                deviceId,
                localDataPath: path.join(app.getPath('userData'), 'cloud_voice_data'),
                apiKey,
            })
            return { success: true, data: { ...status, endpoint: `${serverUrl}:${port}` } }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('cloud-voice-list-models', async () => {
        try {
            const { listVoiceModels } = await import('../src/services/cloudVoiceService')
            const { serverUrl, port } = getCloudVoiceRuntime()
            const { apiKey } = getCloudGpuRuntime()
            const models = await listVoiceModels({
                serverUrl,
                port,
                deviceId,
                localDataPath: path.join(app.getPath('userData'), 'cloud_voice_data'),
                apiKey,
            })
            return { success: true, data: models }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('cloud-voice-train', async (_event, params: { name: string; audioBufferBase64: string; fileName?: string }) => {
        try {
            const fs = await import('fs')
            const { trainVoiceModel } = await import('../src/services/cloudVoiceService')

            const name = (params?.name || '').trim()
            if (!name) throw new Error('请填写声音名称')
            const b64 = params?.audioBufferBase64
            if (!b64) throw new Error('音频为空')

            const tempDir = path.join(app.getPath('userData'), 'cloud_voice_data', 'temp')
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
            const safeName = (params?.fileName || `sample_${Date.now()}.wav`).replace(/[\\\\/:*?"<>|]/g, '_')
            const tempAudioPath = path.join(tempDir, safeName)
            fs.writeFileSync(tempAudioPath, Buffer.from(b64, 'base64'))

            const { serverUrl, port } = getCloudVoiceRuntime()
            const { apiKey } = getCloudGpuRuntime()
            const { voiceId } = await trainVoiceModel({
                serverUrl,
                port,
                deviceId,
                localDataPath: path.join(app.getPath('userData'), 'cloud_voice_data'),
                apiKey,
            }, { name, audioPath: tempAudioPath })

            return { success: true, data: { voiceId } }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('cloud-voice-get-model', async (_event, voiceId: string) => {
        try {
            const { getVoiceModel } = await import('../src/services/cloudVoiceService')
            const { serverUrl, port } = getCloudVoiceRuntime()
            const { apiKey } = getCloudGpuRuntime()
            const model = await getVoiceModel({
                serverUrl,
                port,
                deviceId,
                localDataPath: path.join(app.getPath('userData'), 'cloud_voice_data'),
                apiKey,
            }, voiceId)
            return { success: true, data: model }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('cloud-voice-tts', async (_event, params: { voiceId: string; text: string }) => {
        try {
            const { synthesizeWithVoice } = await import('../src/services/cloudVoiceService')
            const text = (params?.text || '').trim()
            if (!text) throw new Error('文本为空')
            const voiceId = (params?.voiceId || '').trim()
            if (!voiceId) throw new Error('voiceId 为空')

            const { serverUrl, port } = getCloudVoiceRuntime()
            const { serverUrl: cloudGpuServerUrl, videoPort: cloudGpuVideoPort, apiKey } = getCloudGpuRuntime()
            const audioPath = await synthesizeWithVoice({
                serverUrl,
                port,
                deviceId,
                localDataPath: path.join(app.getPath('userData'), 'cloud_voice_data'),
                fallbackDownloadServerUrl: cloudGpuServerUrl,
                fallbackDownloadPort: cloudGpuVideoPort,
                apiKey,
            }, { voiceId, text })

            return { success: true, data: { audioPath } }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // ========== 抖音主页获取 ==========
    ipcMain.handle('douyin-fetch-profile-videos', async (_event, profileUrl: string, count: number = 10) => {
        try {
            const videos = await fetchProfileVideos(profileUrl, count)
            return { success: true, data: videos }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('douyin-check-url-type', async (_event, url: string) => {
        try {
            const isProfile = isProfileUrl(url)
            return { success: true, data: { isProfile } }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // ========== 视频下载 ==========
    ipcMain.handle('download-video', async (_event, url: string) => {
        try {
            const outputDir = path.join(config.outputDir, 'downloads')
            const result = await downloadDouyinVideo(url, outputDir, (percent, message) => {
                mainWindow.webContents.send('download-progress', { percent, message })
            })
            // 返回格式需要符合前端期望: { success, data: { videoPath, title } }
            if (result.success) {
                return { success: true, data: { videoPath: result.videoPath, title: result.title } }
            } else {
                return { success: false, error: result.error }
            }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('select-video-file', async () => {
        try {
            if (!mainWindow) {
                throw new Error('窗口尚未准备')
            }
            const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
                title: '选择本地视频',
                properties: ['openFile'],
                filters: [
                    { name: '视频', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'ts'] },
                ],
            })
            if (canceled || !filePaths || filePaths.length === 0) {
                return { success: false, canceled: true }
            }
            return { success: true, filePath: filePaths[0] }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('select-audio-file', async () => {
        try {
            if (!mainWindow) {
                throw new Error('窗口尚未准备')
            }
            const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
                title: '选择本地音频',
                properties: ['openFile'],
                filters: [
                    { name: '音频', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'] },
                ],
            })
            if (canceled || !filePaths || filePaths.length === 0) {
                return { success: false, canceled: true }
            }
            return { success: true, filePath: filePaths[0] }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('select-text-file', async () => {
        try {
            if (!mainWindow) {
                throw new Error('窗口尚未准备')
            }
            const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
                title: '选择文案文本',
                properties: ['openFile'],
                filters: [
                    { name: '文本', extensions: ['txt', 'md'] },
                ],
            })
            if (canceled || !filePaths || filePaths.length === 0) {
                return { success: false, canceled: true }
            }
            const filePath = filePaths[0]
            const content = fs.readFileSync(filePath, 'utf8')
            return { success: true, data: { filePath, content } }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // ========== 语音转文字 ==========
    ipcMain.handle('transcribe-audio', async (_event, videoPath: string) => {
        try {
            // 检查凭据
            if (!config.tencent.secretId || !config.tencent.secretKey) {
                const loadedPath = process.env.VIRAL_VIDEO_AGENT_ENV_PATH_LOADED || '（未加载任何 .env 文件）'
                throw new Error(`未检测到腾讯云凭据（TENCENT_SECRET_ID/KEY）。当前加载的环境文件: ${loadedPath}。请确保已在对应的 .env 文件中正确配置。`)
            }

            // 检查视频文件是否存在
            if (!fs.existsSync(videoPath)) {
                throw new Error('视频文件不存在: ' + videoPath)
            }

            // 用 FFmpeg 从视频中提取音频
            const audioDir = path.join(config.outputDir, 'audio')
            if (!fs.existsSync(audioDir)) {
                fs.mkdirSync(audioDir, { recursive: true })
            }
            const timestamp = Date.now()
            const audioPath = path.join(audioDir, `temp_audio_${timestamp}.mp3`)

            console.log('[ASR] 正在从视频提取音频:', videoPath)
            mainWindow.webContents.send('pipeline-progress', 10, '正在提取音频...')

            try {
                await extractAudio(videoPath, audioPath, 'mp3', { sampleRate: 16000, channels: 1 })
            } catch (ffmpegError: any) {
                console.error('[ASR] FFmpeg 提取音频失败:', ffmpegError)
                throw new Error(`音频提取失败 (可能视频无声或编码不支持): ${ffmpegError.message || ffmpegError}`)
            }

            if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size < 100) {
                throw new Error('提取出的音频文件无效（文件过小或不存在）')
            }

            // 获取音频时长
            let duration = 0
            try {
                duration = await getMediaDuration(audioPath)
            } catch {
                duration = 300 // 默认假设 5 分钟
            }

            console.log('[ASR] 音频时长:', duration.toFixed(1), '秒')

            // 检查时长限制（10分钟，放宽一点）
            if (duration > 600) {
                if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath)
                throw new Error('视频时长超过 10 分钟，请使用较短的视频')
            }

            mainWindow.webContents.send('pipeline-progress', 20, '正在识别语音...')

            const { recognizeSentence } = await import('../src/services/asrService')

            // 如果音频短于 50 秒，直接识别
            if (duration <= 50) {
                console.log('[ASR] 使用一句话识别模式（短音频）')
                const audioBase64 = fs.readFileSync(audioPath).toString('base64')
                const text = await recognizeSentence(config.tencent as AsrConfig, audioBase64)
                if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath)
                if (!text) console.warn('[ASR] 识别结果为空')
                return { success: true, data: text || '（未识别到文字）' }
            }

            // 长音频：分段处理
            console.log('[ASR] 使用分段识别模式（长音频）')
            const segmentDuration = 50 // 每段 50 秒
            const segmentCount = Math.ceil(duration / segmentDuration)
            const results: string[] = []

            for (let i = 0; i < segmentCount; i++) {
                const startTime = i * segmentDuration
                const segmentPath = path.join(audioDir, `segment_${timestamp}_${i}.mp3`)

                mainWindow.webContents.send('pipeline-progress',
                    20 + (i / segmentCount) * 70,
                    `识别中... (${i + 1}/${segmentCount})`
                )

                // 用 FFmpeg 切分音频
                try {
                    await sliceAudio(audioPath, segmentPath, startTime, segmentDuration, 'mp3', { sampleRate: 16000, channels: 1 })

                    if (fs.existsSync(segmentPath)) {
                        const segmentBase64 = fs.readFileSync(segmentPath).toString('base64')
                        const segmentText = await recognizeSentence(config.tencent as AsrConfig, segmentBase64)
                        if (segmentText) results.push(segmentText)
                        console.log(`[ASR] 分段 ${i + 1} 识别完成:`, segmentText.slice(0, 20) + '...')
                    }
                } catch (e: any) {
                    console.error(`[ASR] 分段 ${i + 1} 处理失败:`, e.message || e)
                    // 继续处理下一段，不要因为一段失败就全部终止
                } finally {
                    // 删除分段文件
                    if (fs.existsSync(segmentPath)) {
                        fs.unlinkSync(segmentPath)
                    }
                }
            }

            // 清理原始音频
            if (fs.existsSync(audioPath)) {
                fs.unlinkSync(audioPath)
            }

            const fullText = results.join(' ')
            console.log('[ASR] 转录完成，总长度:', fullText.length)

            mainWindow.webContents.send('pipeline-progress', 100, '识别完成')
            return { success: true, data: fullText || '（未从长音频中识别到有效文字）' }

        } catch (error: any) {
            console.error('[ASR] 全局错误:', error)
            const errorMsg = error.message || String(error)
            return { success: false, error: errorMsg }
        }
    })

    // ========== TTS 语音合成 ==========
    ipcMain.handle('generate-speech', async (_event, text: string, voiceType: number) => {
        try {
            const outputDir = path.join(config.outputDir, 'audio')
            const audioPath = await generateSpeechFile(
                config.tencent as TtsConfig,
                text,
                outputDir,
                { voiceType }
            )
            return { success: true, data: { audioPath } }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('get-voice-options', async () => {
        return { success: true, data: getVoiceOptions() }
    })

    // ========== 文案改写 ==========
    ipcMain.handle('rewrite-copy', async (_event, text: string, mode: string, instruction?: string) => {
        try {
            const result = await rewriteCopy(
                config.tencent as HunyuanConfig,
                text,
                mode as any,
                instruction
            )
            return { success: true, data: result }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // ========== 文案模式分析 ==========
    ipcMain.handle('analyze-copy-pattern', async (_event, copies: string) => {
        try {
            const result = await analyzeCopyPattern(
                config.tencent as HunyuanConfig,
                copies
            )
            return { success: true, data: result }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // ========== 标题和话题生成 ==========
    ipcMain.handle('generate-title', async (_event, content: string) => {
        try {
            const titles = await generateTitles(config.tencent as HunyuanConfig, content)
            const hashtags = await generateHashtags(config.tencent as HunyuanConfig, content)
            return { success: true, data: { titles, hashtags } }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // ========== 数字人视频 ==========
    const digitalHumanConfig = getDigitalHumanConfig(app.getPath('userData'))

    ipcMain.handle('get-avatar-list', async () => {
        try {
            const avatars = getSavedSourceVideos(digitalHumanConfig)
            return { success: true, data: avatars }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('generate-digital-human', async (_event, params: any) => {
        try {
            const result = await generateDigitalHumanVideo(
                digitalHumanConfig,
                {
                    sourceVideoPath: params.sourceVideoPath,
                    audioPath: params.audioPath,
                    text: params.text,
                    qualityPreset: params.qualityPreset,
                },
                (progress: { stage: string; progress: number; message: string }) => {
                    mainWindow.webContents.send('digital-human-progress', progress)
                }
            )
            return { success: true, data: result }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // 检查系统状态 (新增)
    ipcMain.handle('digital-human-check-system', async (_event, params?: { qualityPreset?: 'quality' | 'fast' }) => {
        try {
            const status = await checkSystemReady(digitalHumanConfig, { qualityPreset: params?.qualityPreset })
            return { success: true, data: status }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // 初始化系统
    ipcMain.handle('digital-human-initialize', async (_event, params?: { qualityPreset?: 'quality' | 'fast' }) => {
        try {
            await initializeSystem(digitalHumanConfig, (progress) => {
                mainWindow.webContents.send('digital-human-progress', progress)
            }, { qualityPreset: params?.qualityPreset })
            return { success: true }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // 保存源视频
    ipcMain.handle('digital-human-save-source', async (_event, params: { videoBuffer: string, name: string }) => {
        try {
            const buffer = Buffer.from(params.videoBuffer, 'base64')
            const path = await saveSourceVideo(digitalHumanConfig, buffer, params.name)
            return { success: true, data: path }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // ========== 封面生成 ==========
    ipcMain.handle('generate-cover', async (_event, prompt: string) => {
        try {
            const outputDir = path.join(config.outputDir, 'covers')
            const coverRequest: CoverServiceConfig = {
                provider: config.coverProvider,
                aliyun: config.aliyun,
                tencent: {
                    secretId: config.tencent.secretId,
                    secretKey: config.tencent.secretKey,
                    region: process.env.COVER_TENCENT_REGION,
                },
            }
            const covers = await generateCover(
                coverRequest,
                prompt,
                outputDir
            )
            const isFallbackTextCover = covers.length === 1 && /cover_\d+_0\.png$/i.test(covers[0])
            console.log('[Cover] prompt:', prompt, 'result:', covers)
            return {
                success: true,
                data: {
                    coverPaths: covers,
                    provider: config.coverProvider,
                    source: config.coverProvider === 'tencent'
                        ? (isFallbackTextCover ? 'tencent-fallback-ffmpeg' : 'tencent-aiart')
                        : 'aliyun-wanxiang',
                },
            }
        } catch (error: any) {
            console.error('[Cover] failed:', error)
            return { success: false, error: error.message }
        }
    })

    // ========== 全自动流水线 ==========
    ipcMain.handle('run-pipeline', async (_event, params: { douyinUrl: string }) => {
        try {
            const pipelineConfig = getConfig()
            const result = await runPipeline(
                pipelineConfig,
                params.douyinUrl,
                {
                    rewriteMode: 'auto', // 默认自动改写
                    voiceType: 101001,   // 默认音色
                },
                (progress) => {
                    mainWindow.webContents.send('pipeline-progress', progress)
                }
            )
            return { success: true, data: result }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('capture-frame', async (_event, videoPath: string, time: number) => {
        try {
            const outputDir = path.join(config.outputDir, 'covers')
            const coverPath = path.join(outputDir, `frame_${Date.now()}.jpg`)
            await captureFrame(videoPath, coverPath, time)
            return { success: true, data: { coverPath } }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    const pad = (value: number, length: number = 2) => value.toString().padStart(length, '0')
    const formatTimestamp = (seconds: number) => {
        const h = Math.floor(seconds / 3600)
        const m = Math.floor((seconds % 3600) / 60)
        const s = Math.floor(seconds % 60)
        const ms = Math.floor((seconds % 1) * 1000)
        return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`
    }

    // ========== 字幕文件生成 ==========
    ipcMain.handle('generate-subtitle-file', async (_event, params?: { segments?: Array<{ startTime: number; endTime: number; text: string }>; text?: string }) => {
        try {
            const subtitlesDir = path.join(config.outputDir, 'subtitles')
            if (!fs.existsSync(subtitlesDir)) {
                fs.mkdirSync(subtitlesDir, { recursive: true })
            }
            const subtitlePath = path.join(subtitlesDir, `subtitle_${Date.now()}.srt`)
            if (params?.segments && params.segments.length > 0) {
                const srtPath = generateSrtFile(params.segments, subtitlePath)
                return { success: true, data: { subtitlePath: srtPath } }
            }
            const raw = (params?.text || '').trim()
            const defaultLine = '这是自动生成的字幕'
            const lines = raw
                ? raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
                : []
            if (lines.length === 0) {
                lines.push(defaultLine)
            }
            const durationPerLine = 4
            const fallbackSegments = lines.map((line, index) => ({
                startTime: index * durationPerLine,
                endTime: (index + 1) * durationPerLine,
                text: line,
            }))
            const srtContent = fallbackSegments.map((seg, idx) => (
                `${idx + 1}\n${formatTimestamp(seg.startTime)} --> ${formatTimestamp(seg.endTime)}\n${seg.text}\n`
            )).join('\n')
            fs.writeFileSync(subtitlePath, srtContent, 'utf-8')
            return { success: true, data: { subtitlePath } }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('get-video-duration', async (_event, videoPath: string) => {
        try {
            if (!videoPath) throw new Error('videoPath 为空')
            const duration = await getMediaDuration(videoPath)
            return { success: true, data: duration }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // ========== 视频处理 ==========
    ipcMain.handle('add-subtitles', async (_event, videoPath: string, subtitlePath: string) => {
        try {
            const outputDir = path.join(config.outputDir, 'video')
            const outputPath = path.join(outputDir, `subtitled_${Date.now()}.mp4`)
            await burnSubtitles(videoPath, subtitlePath, outputPath)
            return { success: true, data: { videoPath: outputPath } }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('add-bgm', async (_event, videoPath: string, bgmPath: string, volume: number) => {
        try {
            const outputDir = path.join(config.outputDir, 'video')
            const outputPath = path.join(outputDir, `with_bgm_${Date.now()}.mp4`)
            await addBackgroundMusic(videoPath, bgmPath, outputPath, { bgmVolume: volume })
            return { success: true, data: { videoPath: outputPath } }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })



    // ========== 通用 ==========
    ipcMain.handle('get-app-path', () => {
        return app.getPath('userData')
    })

    ipcMain.handle('get-output-dir', () => {
        return config.outputDir
    })

    // ========== 保存文件到桌面（用于“下载”体验）==========
    ipcMain.handle('save-to-desktop', async (_event, params: { sourcePath: string, fileName?: string }) => {
        try {
            const fs = await import('fs')

            const sourcePath = params?.sourcePath
            if (!sourcePath) {
                throw new Error('sourcePath 为空')
            }
            if (!fs.existsSync(sourcePath)) {
                throw new Error('文件不存在: ' + sourcePath)
            }

            const desktopDir = app.getPath('desktop')
            const baseName = (params?.fileName || path.basename(sourcePath) || `video_${Date.now()}.mp4`).trim()
            const parsed = path.parse(baseName)
            const ext = parsed.ext || path.extname(sourcePath) || '.mp4'
            const name = parsed.name || 'video'

            let destPath = path.join(desktopDir, `${name}${ext}`)
            if (fs.existsSync(destPath)) {
                destPath = path.join(desktopDir, `${name}_${Date.now()}${ext}`)
            }

            fs.copyFileSync(sourcePath, destPath)
            try {
                shell.showItemInFolder(destPath)
            } catch {
                // ignore
            }

            return { success: true, data: { destPath } }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // ========== HeyGem 数字人 ==========
    // ========== 全网分发（social-auto-upload）==========
    type SocialAutoUploadMeta = {
        installDir: string
        venvPython: string
        dbFile: string
    }

    const ensureSocialAutoUploadRunning = async (): Promise<SocialAutoUploadMeta> => {
        const defaultRepoUrls = [
            // 官方源
            'https://github.com/dreammis/social-auto-upload',
            // 国内常见 GitHub 加速（可用性依网络而定）
            'https://ghproxy.com/https://github.com/dreammis/social-auto-upload',
            'https://mirror.ghproxy.com/https://github.com/dreammis/social-auto-upload',
            'https://hub.njuu.cf/dreammis/social-auto-upload',
        ]
        const repoUrls = (process.env.SOCIAL_AUTO_UPLOAD_REPO_URLS || '')
            .split(/[;,\s]+/g)
            .map(s => s.trim())
            .filter(Boolean)
        let repoUrlsToTry = repoUrls.length > 0 ? repoUrls : defaultRepoUrls

        // Gitee 经常在未登录/风控时要求账号密码，会触发认证弹窗（已禁用交互后会直接失败）
        // 为了客户体验，默认跳过 gitee 源；如你确认可匿名访问，可设置 SOCIAL_AUTO_UPLOAD_ALLOW_GITEE=1
        const allowGitee = (process.env.SOCIAL_AUTO_UPLOAD_ALLOW_GITEE || '').trim() === '1'
        if (!allowGitee) {
            const before = repoUrlsToTry.length
            repoUrlsToTry = repoUrlsToTry.filter(u => !/^https?:\/\/gitee\.com\//i.test(u))
            const removed = before - repoUrlsToTry.length
            if (removed > 0) logPublish('social-auto-upload:repoUrls:skip-gitee', { removed })
        }

        const installDir = path.join(app.getPath('userData'), 'social-auto-upload')
        const venvDir = path.join(installDir, '.venv')
        const venvPython = process.platform === 'win32'
            ? path.join(venvDir, 'Scripts', 'python.exe')
            : path.join(venvDir, 'bin', 'python')
        const backendPy = path.join(installDir, 'sau_backend.py')
        const confPy = path.join(installDir, 'conf.py')
        const confExamplePy = path.join(installDir, 'conf.example.py')
        const dbFile = path.join(installDir, 'db', 'database.db')

        const run = (command: string, args: string[], cwd: string) => new Promise<void>((resolve, reject) => {
            const child = spawn(command, args, {
                cwd,
                stdio: 'pipe',
                env: {
                    ...process.env,
                    // 避免弹出 Git Credential Manager / 交互式认证窗口（客户体验灾难）
                    // 失败应当直接返回错误提示，由应用引导用户配置镜像或离线包。
                    GIT_TERMINAL_PROMPT: '0',
                    GCM_INTERACTIVE: 'Never',
                    GIT_ASKPASS: 'echo',
                    // Windows 默认控制台编码可能是 GBK，会导致 social-auto-upload 的 createTable.py 打印 emoji 时报错
                    PYTHONUTF8: '1',
                    PYTHONIOENCODING: 'utf-8',
                },
            })
            let stderr = ''
            child.stderr?.on('data', (d) => stderr += d.toString())
            child.on('error', (err: any) => {
                if (err?.code === 'ENOENT') {
                    if (command === 'git') {
                        reject(new Error('未检测到 Git：请先安装 Git 并加入 PATH，然后重试'))
                        return
                    }
                    if (command === 'python' || command === 'python3' || command === 'py' || command.endsWith('python.exe')) {
                        reject(new Error('未检测到 Python：请先安装 Python 3 并勾选 “Add to PATH”，然后重试'))
                        return
                    }
                }
                reject(err)
            })
            child.on('close', (code) => {
                if (code === 0) resolve()
                else reject(new Error(`${command} ${args.join(' ')} failed (code ${code})${stderr ? `: ${stderr.slice(0, 500)}` : ''}`))
            })
        })

        const getPipMirrorArgs = () => {
            const indexUrl = (process.env.SOCIAL_AUTO_UPLOAD_PIP_INDEX_URL || 'https://mirrors.aliyun.com/pypi/simple/').trim()
            if (!indexUrl) return { indexUrl: '', args: [] as string[] }

            let host = ''
            try {
                host = new URL(indexUrl).host
            } catch {
                host = ''
            }

            const trustedHosts = (process.env.SOCIAL_AUTO_UPLOAD_PIP_TRUSTED_HOSTS || host).trim()
            const trustedArgs = trustedHosts
                ? trustedHosts
                    .split(/[;,\s]+/g)
                    .map(s => s.trim())
                    .filter(Boolean)
                    .flatMap(h => ['--trusted-host', h])
                : []

            return {
                indexUrl,
                args: ['-i', indexUrl, ...trustedArgs],
            }
        }

        const waitForHttp = (url: string, timeoutMs = 30000) => new Promise<void>((resolve, reject) => {
            const started = Date.now()
            const tick = () => {
                const req = http.get(url, (res) => {
                    res.resume()
                    if ((res.statusCode || 0) >= 200 && (res.statusCode || 0) < 500) {
                        resolve()
                        return
                    }
                    if (Date.now() - started > timeoutMs) reject(new Error('分发服务启动超时'))
                    else setTimeout(tick, 500)
                })
                req.on('error', () => {
                    if (Date.now() - started > timeoutMs) reject(new Error('分发服务启动超时'))
                    else setTimeout(tick, 500)
                })
            }
            tick()
        })

        if (!fs.existsSync(backendPy)) {
            fs.mkdirSync(path.dirname(installDir), { recursive: true })

            // 直接使用内置版本（打包时一起分发，避免国内网络问题）
            const bundledDir = path.join(app.getAppPath(), 'python', 'social-auto-upload')
            const bundledMarker = path.join(bundledDir, 'requirements.txt')

            if (fs.existsSync(bundledMarker)) {
                logPublish('social-auto-upload:copy-bundled', { from: bundledDir, to: installDir })
                fs.cpSync(bundledDir, installDir, { recursive: true })
            } else {
                throw new Error(
                    `分发中心组件未找到。\n` +
                    `请确认项目包含 python/social-auto-upload 目录。\n` +
                    `查找路径: ${bundledDir}`
                )
            }
        }

        if (!fs.existsSync(confPy) && fs.existsSync(confExamplePy)) {
            fs.copyFileSync(confExamplePy, confPy)
        }

        if (!fs.existsSync(dbFile)) {
            const dbDir = path.join(installDir, 'db')
            fs.mkdirSync(dbDir, { recursive: true })
            const createTablePy = path.join(dbDir, 'createTable.py')
            if (fs.existsSync(createTablePy)) {
                try {
                    await run(process.env.PYTHON || 'python', [createTablePy], dbDir)
                } catch (e: any) {
                    const msg = safeErrorMessage(e)
                    // Windows 控制台默认 GBK 时，createTable.py 打印 emoji 可能触发 UnicodeEncodeError
                    if (msg.includes('UnicodeEncodeError') || msg.includes('gbk')) {
                        logPublish('social-auto-upload:createTable:retry-utf8', { reason: 'UnicodeEncodeError/gbk' })
                        await run(process.env.PYTHON || 'python', ['-X', 'utf8', createTablePy], dbDir)
                    } else {
                        throw e
                    }
                }
            }
        }

        const depsMarker = path.join(venvDir, '.deps_installed')
        if (!fs.existsSync(depsMarker)) {
            if (!fs.existsSync(venvPython)) {
                await run(process.env.PYTHON || 'python', ['-m', 'venv', venvDir], installDir)
            }

            const pipMirror = getPipMirrorArgs()
            logPublish('social-auto-upload:pip:mirror', { indexUrl: pipMirror.indexUrl })
            await run(venvPython, ['-m', 'pip', 'install', '--upgrade', 'pip', ...pipMirror.args], installDir)
            await run(venvPython, ['-m', 'pip', 'install', '-r', path.join(installDir, 'requirements.txt'), ...pipMirror.args], installDir)
            fs.writeFileSync(depsMarker, new Date().toISOString())
        }

        if (!socialAutoUploadProc || socialAutoUploadProc.killed) {
            socialAutoUploadProc = spawn(venvPython, [backendPy], {
                cwd: installDir,
                stdio: 'ignore',
                windowsHide: true,
                env: {
                    ...process.env,
                    PYTHONUTF8: '1',
                    PYTHONIOENCODING: 'utf-8',
                },
            })
            socialAutoUploadProc.on('exit', () => {
                socialAutoUploadProc = null
            })
        }

        await waitForHttp('http://127.0.0.1:5409/')
        return { installDir, venvPython, dbFile }
    }

    const runCapture = (command: string, args: string[], cwd: string) => new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            stdio: 'pipe',
            env: {
                ...process.env,
                PYTHONUTF8: '1',
                PYTHONIOENCODING: 'utf-8',
            },
        })
        let stderr = ''
        let stdout = ''
        child.stdout?.on('data', (d) => stdout += d.toString())
        child.stderr?.on('data', (d) => stderr += d.toString())
        child.on('error', reject)
        child.on('close', (code) => {
            if (code === 0) resolve({ stdout, stderr })
            else reject(new Error(`${command} ${args.join(' ')} failed (code ${code})${stderr ? `: ${stderr.slice(0, 500)}` : ''}`))
        })
    })

    const upsertSocialAutoUploadAccount = async (meta: SocialAutoUploadMeta, params: { platform: PublishPlatformKey; userName: string }) => {
        const type = PUBLISH_PLATFORM_TYPE[params.platform]
        const py = `
import sqlite3, json, re
from pathlib import Path
db = Path(${JSON.stringify(meta.dbFile)})
db.parent.mkdir(parents=True, exist_ok=True)
conn = sqlite3.connect(str(db))
cur = conn.cursor()
cur.execute("""
CREATE TABLE IF NOT EXISTS user_info (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type INTEGER NOT NULL,
    filePath TEXT NOT NULL,
    userName TEXT NOT NULL,
    status INTEGER DEFAULT 0
)
""")
platform = ${JSON.stringify(params.platform)}
type_ = int(${JSON.stringify(type)})
userName = ${JSON.stringify(params.userName)}
cur.execute("SELECT id, filePath FROM user_info WHERE type = ? AND userName = ? LIMIT 1", (type_, userName))
row = cur.fetchone()
def safe_name(s: str) -> str:
    s = re.sub(r"[\\\\/:*?\\\"<>|\\s]+", "_", s.strip())
    return s[:40] if s else "account"
if row:
    id_, filePath = int(row[0]), row[1]
    if not filePath:
        filePath = f"{platform}/{safe_name(userName)}_{id_}.json"
        cur.execute("UPDATE user_info SET filePath = ?, status = 1 WHERE id = ?", (filePath, id_))
else:
    cur.execute("INSERT INTO user_info(type, filePath, userName, status) VALUES(?, ?, ?, ?)", (type_, "", userName, 1))
    id_ = int(cur.lastrowid)
    filePath = f"{platform}/{safe_name(userName)}_{id_}.json"
    cur.execute("UPDATE user_info SET filePath = ?, status = 1 WHERE id = ?", (filePath, id_))
conn.commit()
conn.close()
print(json.dumps({"id": id_, "filePath": filePath}, ensure_ascii=False))
`.trim()

        const { stdout } = await runCapture(meta.venvPython, ['-c', py], meta.installDir)
        const parsed = JSON.parse(stdout.trim())
        if (!parsed?.filePath) throw new Error('写入分发账号失败：未返回 filePath')
        return parsed as { id: number; filePath: string }
    }

    const writeSocialAutoUploadCookieFile = (meta: SocialAutoUploadMeta, filePath: string, cookieJson: string) => {
        const cookieAbs = path.join(meta.installDir, 'cookiesFile', filePath)
        fs.mkdirSync(path.dirname(cookieAbs), { recursive: true })
        fs.writeFileSync(cookieAbs, cookieJson, 'utf-8')
        return cookieAbs
    }

    const syncSavedPublishCookiesToSocialAutoUpload = async (meta: SocialAutoUploadMeta) => {
        const entries = readPublishCookieStore()
        let applied = 0
        for (const entry of entries) {
            try {
                const cookieJson = decryptCookieJson(entry)
                const account = await upsertSocialAutoUploadAccount(meta, { platform: entry.platform, userName: entry.userName })
                writeSocialAutoUploadCookieFile(meta, account.filePath, cookieJson)
                applied += 1
            } catch {
                // ignore per-entry errors
            }
        }
        return applied
    }

    const uploadToSocialAutoUpload = async (filePath: string, filenameBase?: string) => {
        const stat = fs.statSync(filePath)
        if (!stat.isFile()) throw new Error('不是有效文件: ' + filePath)

        const form = new FormData()
        form.append('file', fs.createReadStream(filePath))
        if (filenameBase) form.append('filename', filenameBase)

        await new Promise<void>((resolve, reject) => {
            const req = http.request('http://127.0.0.1:5409/uploadSave', {
                method: 'POST',
                headers: form.getHeaders(),
            }, (res) => {
                let data = ''
                res.on('data', (c) => data += c.toString())
                res.on('end', () => {
                    if ((res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300) resolve()
                    else reject(new Error(`上传到分发中心失败 (HTTP ${res.statusCode}) ${data.slice(0, 200)}`))
                })
            })
            req.on('error', reject)
            form.pipe(req)
        })
    }

    ipcMain.handle('social-auto-upload-open', async (_event, params?: { videoPath?: string, title?: string }) => {
        try {
            const meta = await ensureSocialAutoUploadRunning()
            await syncSavedPublishCookiesToSocialAutoUpload(meta)

            if (params?.videoPath && fs.existsSync(params.videoPath)) {
                const base = params.title ? params.title.replace(/[\\\\/:*?"<>|]/g, '').slice(0, 50) : undefined
                await uploadToSocialAutoUpload(params.videoPath, base)
            }

            if (socialAutoUploadWindow && !socialAutoUploadWindow.isDestroyed()) {
                socialAutoUploadWindow.focus()
            } else {
                socialAutoUploadWindow = new BrowserWindow({
                    width: 1200,
                    height: 850,
                    title: '全网分发中心',
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true,
                        webSecurity: false,
                    },
                })
                socialAutoUploadWindow.on('closed', () => { socialAutoUploadWindow = null })
                await socialAutoUploadWindow.loadURL('http://127.0.0.1:5409/')
            }

            return { success: true }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('publish-cookie-apply', async (_event, params: { platform: PublishPlatformKey; userName: string }) => {
        try {
            const platform = params?.platform
            const userName = (params?.userName || '').trim()
            logPublish('publish-cookie-apply:start', { platform, userName })
            if (!platform || !(platform in PUBLISH_PLATFORM_TYPE) || !userName) {
                throw new Error('参数错误')
            }

            const entry = readPublishCookieStore().find(e => e.platform === platform && e.userName === userName)
            if (!entry) throw new Error('未找到该账号的 Cookie，请先保存')

            const meta = await ensureSocialAutoUploadRunning()
            logPublish('publish-cookie-apply:ensureSocialAutoUploadRunning:ok', { platform, userName, installDir: meta.installDir })
            const cookieJson = decryptCookieJson(entry)
            const account = await upsertSocialAutoUploadAccount(meta, { platform, userName })
            const fileAbs = writeSocialAutoUploadCookieFile(meta, account.filePath, cookieJson)

            logPublish('publish-cookie-apply:ok', { platform, userName, filePath: account.filePath })
            return { success: true, data: { filePath: account.filePath, fileAbs } }
        } catch (error: any) {
            logPublish('publish-cookie-apply:error', { platform: params?.platform, userName: params?.userName, error: safeErrorMessage(error) })
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('heygem-check-status', async () => {
        try {
            const { checkServiceStatus } = await import('../src/services/heygemService')
            const isRunning = await checkServiceStatus({
                baseUrl: process.env.HEYGEM_BASE_URL,
                audioPort: parseInt(process.env.HEYGEM_AUDIO_PORT || '18180'),
                videoPort: parseInt(process.env.HEYGEM_VIDEO_PORT || '8383'),
            })
            return { success: true, data: isRunning }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('heygem-get-models', async () => {
        try {
            const { getTrainedModels } = await import('../src/services/heygemService')
            const models = getTrainedModels({
                dataPath: process.env.HEYGEM_DATA_PATH,
            })
            return { success: true, data: models }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('heygem-train-model', async (_event, params: { videoBuffer: string; modelName: string }) => {
        try {
            const { trainAvatarModel } = await import('../src/services/heygemService')
            const fs = await import('fs')

            // 保存视频到临时文件
            const tempDir = path.join(config.outputDir, 'temp')
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true })
            }
            const tempVideoPath = path.join(tempDir, `upload_${Date.now()}.mp4`)
            fs.writeFileSync(tempVideoPath, Buffer.from(params.videoBuffer, 'base64'))

            const model = await trainAvatarModel(
                {
                    baseUrl: process.env.HEYGEM_BASE_URL,
                    audioPort: parseInt(process.env.HEYGEM_AUDIO_PORT || '18180'),
                    videoPort: parseInt(process.env.HEYGEM_VIDEO_PORT || '8383'),
                    dataPath: process.env.HEYGEM_DATA_PATH,
                },
                tempVideoPath,
                params.modelName,
                (progress: number, message: string) => {
                    mainWindow.webContents.send('heygem-progress', progress, message)
                }
            )
            return { success: true, data: model }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('heygem-generate-video', async (_event, params: { modelId: string; text: string }) => {
        try {
            const { getTrainedModels, textToDigitalHumanVideo } = await import('../src/services/heygemService')

            const models = getTrainedModels({ dataPath: process.env.HEYGEM_DATA_PATH })
            const model = models.find(m => m.id === params.modelId)

            if (!model) {
                throw new Error('找不到指定的数字人形象')
            }

            const outputDir = path.join(config.outputDir, 'heygem_videos')
            const videoPath = await textToDigitalHumanVideo(
                {
                    baseUrl: process.env.HEYGEM_BASE_URL,
                    audioPort: parseInt(process.env.HEYGEM_AUDIO_PORT || '18180'),
                    videoPort: parseInt(process.env.HEYGEM_VIDEO_PORT || '8383'),
                    dataPath: process.env.HEYGEM_DATA_PATH,
                },
                model,
                params.text,
                outputDir,
                (progress: number, message: string) => {
                    mainWindow.webContents.send('heygem-progress', progress, message)
                }
            )
            return { success: true, data: { videoPath } }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    ipcMain.handle('heygem-synthesize-audio', async (_event, params: { modelId: string; text: string }) => {
        try {
            const { getTrainedModels, synthesizeAudio } = await import('../src/services/heygemService')

            const models = getTrainedModels({ dataPath: process.env.HEYGEM_DATA_PATH })
            const model = models.find(m => m.id === params.modelId)
            if (!model) {
                throw new Error('找不到指定的声音模型')
            }

            const text = (params.text || '').trim()
            if (!text) {
                throw new Error('文本为空')
            }

            const outputDir = path.join(config.outputDir, 'audio')
            const fs = await import('fs')
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true })
            }
            const audioPath = path.join(outputDir, `voice_clone_${model.id}_${Date.now()}.wav`)

            await synthesizeAudio(
                {
                    baseUrl: process.env.HEYGEM_BASE_URL,
                    audioPort: parseInt(process.env.HEYGEM_AUDIO_PORT || '18180'),
                    videoPort: parseInt(process.env.HEYGEM_VIDEO_PORT || '8383'),
                    dataPath: process.env.HEYGEM_DATA_PATH,
                },
                model,
                text,
                audioPath
            )

            return { success: true, data: { audioPath } }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // ========== 云端 GPU 数字人服务 ==========

    // 检查云端 GPU 服务器状态
    ipcMain.handle('cloud-gpu-check-status', async () => {
        try {
            const { checkCloudGpuStatus } = await import('../src/services/cloudGpuService')
            const { serverUrl, videoPort } = getCloudGpuRuntime()
            const status = await checkCloudGpuStatus({
                serverUrl,
                videoPort,
                localDataPath: path.join(app.getPath('userData'), 'cloud_gpu_data'),
            })
            return { success: true, data: { ...status, endpoint: `${serverUrl}:${videoPort}` } }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // 获取已保存的云端形象列表
    ipcMain.handle('cloud-gpu-get-avatars', async () => {
        try {
            const { getCloudAvatarModels } = await import('../src/services/cloudGpuService')
            const models = getCloudAvatarModels({
                localDataPath: path.join(app.getPath('userData'), 'cloud_gpu_data'),
            })
            return { success: true, data: models }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // 保存形象视频信息（用户上传形象视频后调用）
    ipcMain.handle('cloud-gpu-save-avatar', async (_event, params: {
        videoBuffer: string
        avatarName: string
        remoteVideoPath?: string
    }) => {
        try {
            const fs = await import('fs')
            const { v4: uuidv4 } = await new Function('return import("uuid")')()

            const localDataPath = path.join(app.getPath('userData'), 'cloud_gpu_data')
            const avatarsDir = path.join(localDataPath, 'cloud_avatars')

            if (!fs.existsSync(avatarsDir)) {
                fs.mkdirSync(avatarsDir, { recursive: true })
            }

            const modelId = uuidv4()

            // 保存本地预览副本
            const localPreviewDir = path.join(localDataPath, 'previews')
            if (!fs.existsSync(localPreviewDir)) {
                fs.mkdirSync(localPreviewDir, { recursive: true })
            }
            const localPreviewPath = path.join(localPreviewDir, `${modelId}.mp4`)
            fs.writeFileSync(localPreviewPath, Buffer.from(params.videoBuffer, 'base64'))

            // 如果用户手动指定了服务端路径，则直接保存本地记录即可
            if (params.remoteVideoPath) {
                const model = {
                    id: modelId,
                    name: params.avatarName,
                    remoteVideoPath: params.remoteVideoPath,
                    localPreviewPath,
                    createdAt: new Date().toISOString(),
                }

                fs.writeFileSync(
                    path.join(avatarsDir, `${modelId}.json`),
                    JSON.stringify(model, null, 2)
                )

                return { success: true, data: model }
            }

            // 否则：尝试把形象视频上传到云端 /code/data，避免后续合成时服务端找不到文件
            const { serverUrl, videoPort } = getCloudGpuRuntime()
            if (serverUrl) {
                const { uploadAvatarVideo } = await import('../src/services/cloudGpuService')
                const uploaded = await uploadAvatarVideo(
                    {
                        serverUrl,
                        videoPort,
                        localDataPath,
                    },
                    localPreviewPath,
                    params.avatarName,
                    undefined,
                    modelId
                )

                // uploadAvatarVideo 已写入 modelsDir 的 JSON；这里返回给渲染进程即可
                return {
                    success: true,
                    data: {
                        ...uploaded,
                        createdAt: uploaded.createdAt instanceof Date ? uploaded.createdAt.toISOString() : uploaded.createdAt,
                    },
                }
            }

            // 未配置服务端：仅保存本地记录（后续无法云端合成）
            const model = {
                id: modelId,
                name: params.avatarName,
                remoteVideoPath: `/code/data/avatar_${modelId}.mp4`,
                localPreviewPath,
                createdAt: new Date().toISOString(),
            }

            fs.writeFileSync(
                path.join(avatarsDir, `${modelId}.json`),
                JSON.stringify(model, null, 2)
            )

            return { success: true, data: model }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // 删除云端形象
    ipcMain.handle('cloud-gpu-delete-avatar', async (_event, modelId: string) => {
        try {
            const { deleteCloudAvatarModel } = await import('../src/services/cloudGpuService')
            const deleted = deleteCloudAvatarModel({
                localDataPath: path.join(app.getPath('userData'), 'cloud_gpu_data'),
            }, modelId)
            return { success: true, data: deleted }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })

    // 生成云端数字人视频
    ipcMain.handle('cloud-gpu-generate-video', async (_event, params: {
        avatarVideoPath: string  // 服务器上的形象视频路径
        audioPath: string        // 本地音频文件路径
    }) => {
        try {
            const { generateCloudVideoWithLocalPaths } = await import('../src/services/cloudGpuService')

            const videoPath = await generateCloudVideoWithLocalPaths(
                {
                    ...getCloudGpuRuntime(),
                    localDataPath: path.join(app.getPath('userData'), 'cloud_gpu_data'),
                },
                params.avatarVideoPath,
                params.audioPath,
                (progress: number, message: string) => {
                    mainWindow.webContents.send('cloud-gpu-progress', { progress, message })
                }
            )
            return { success: true, data: { videoPath } }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    })
}
