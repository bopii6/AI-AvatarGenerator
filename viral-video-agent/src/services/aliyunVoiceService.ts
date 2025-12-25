/**
 * 阿里云 DashScope CosyVoice 声音克隆服务
 * 
 * 功能：
 * - 创建复刻音色（通过音频 URL）
 * - 语音合成（使用复刻音色）
 * - 查询音色列表
 * 
 * API 文档：https://help.aliyun.com/zh/model-studio/cosyvoice-clone-api
 */

import fs from 'fs'
import http from 'http'
import path from 'path'
import https from 'https'
import WebSocket from 'ws'
import { createHash, randomUUID } from 'crypto'

// ==================== 配置 ====================

const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization'
const DASHSCOPE_WEBSOCKET_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference'
const DEFAULT_MODEL = 'cosyvoice-v3-flash' // 性价比最高
const VOICE_ENROLLMENT_MODEL = 'voice-enrollment'
const DEFAULT_TIMEOUT_MS = 60_000

export interface AliyunVoiceConfig {
    apiKey: string
    model?: string // cosyvoice-v3-flash | cosyvoice-v3-plus
    /** 设备 ID，用于音色前缀 */
    deviceId?: string
    /** 本地数据存储路径 */
    localDataPath?: string
    /** 可选：用于上传音频的服务器 URL（如云端 GPU 服务器） */
    audioUploadServerUrl?: string
    audioUploadServerPort?: number
}

export interface AliyunVoiceModel {
    id: string // voice_id
    name: string // 从 voice_id 提取的名称
    status: 'pending' | 'ready' | 'failed'
    createdAt?: string
    updatedAt?: string
}

// ==================== 工具函数 ====================

function safeTrim(input: string | undefined | null): string {
    return (input || '').toString().trim()
}

function sanitizePrefix(name: string): string {
    // DashScope 要求：仅允许数字、大小写字母和下划线，不超过10个字符
    const raw = safeTrim(name)
    const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 10)
    if (cleaned) return cleaned

    // 用户输入全是中文/符号时，避免都退化成同一个 "voice"
    if (!raw) return 'voice'
    const hash = createHash('sha1').update(raw).digest('hex').slice(0, 9) // 9 + 'v' = 10 chars
    return `v${hash}`
}

function parseVoiceName(voiceId: string): string {
    // voice_id 格式：cosyvoice-v3-flash-myvoice-xxxxxxxx
    // 提取用户设置的前缀部分
    const parts = voiceId.split('-')
    if (parts.length >= 5) {
        // 返回用户设置的前缀部分（第4个部分）+ 短 ID（用于区分同名前缀的多个音色）
        const prefix = parts[3] || voiceId
        const shortId = (parts[4] || '').slice(0, 6)
        return shortId ? `${prefix}-${shortId}` : prefix
    }
    if (parts.length >= 4) {
        return parts[3] || voiceId
    }
    return voiceId
}

function mapStatus(status: string): 'pending' | 'ready' | 'failed' {
    switch (status) {
        case 'OK':
            return 'ready'
        case 'DEPLOYING':
            return 'pending'
        case 'UNDEPLOYED':
            return 'failed'
        default:
            return 'pending'
    }
}

async function requestJSON(
    url: string,
    method: 'GET' | 'POST',
    body: any,
    apiKey: string,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<any> {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body)
        const parsedUrl = new URL(url)

        const req = https.request({
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,
            path: parsedUrl.pathname + parsedUrl.search,
            method,
            timeout: timeoutMs,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
            },
        }, (res) => {
            let data = ''
            res.on('data', (chunk) => data += chunk.toString())
            res.on('end', () => {
                const status = res.statusCode || 0
                let parsed: any = data
                try { parsed = data ? JSON.parse(data) : {} } catch { /* ignore */ }

                if (status >= 200 && status < 300) {
                    resolve(parsed)
                } else {
                    const errMsg = parsed?.message || parsed?.error || `HTTP ${status}`
                    reject(new Error(`DashScope API 错误: ${errMsg}`))
                }
            })
        })

        req.on('timeout', () => {
            req.destroy(new Error('请求超时'))
        })
        req.on('error', reject)
        req.write(payload)
        req.end()
    })
}

// ==================== 音频上传辅助 ====================

/**
 * 将本地音频上传到一个“公网可访问”的上传服务，返回可访问的 URL。
 * DashScope CosyVoice Clone 接口要求音频必须通过 URL 提供。
 */
async function uploadAudioToGpuServer(
    audioPath: string,
    serverUrl: string,
    serverPort: number
): Promise<string> {
    return new Promise((resolve, reject) => {
        const FormData = require('form-data')
        const form = new FormData()
        form.append('audio', fs.createReadStream(audioPath))

        const parsedUrl = new URL(serverUrl)
        const isHttps = parsedUrl.protocol === 'https:'
        const port = serverPort || (parsedUrl.port ? parseInt(parsedUrl.port, 10) : (isHttps ? 443 : 80))
        const basePath = (parsedUrl.pathname || '').replace(/\/+$/, '')
        const uploadPath = `${basePath}/upload` || '/upload'

        const client = isHttps ? https : http
        const req = client.request({
            hostname: parsedUrl.hostname,
            port,
            path: uploadPath,
            method: 'POST',
            headers: form.getHeaders(),
            timeout: 120_000,
        }, (res: any) => {
            let data = ''
            res.on('data', (chunk: Buffer) => data += chunk.toString('utf8'))
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data)
                    if (parsed.url || parsed.audio_url) {
                        resolve(parsed.url || parsed.audio_url)
                    } else {
                        reject(new Error('上传成功但未返回 URL'))
                    }
                } catch {
                    reject(new Error('上传响应解析失败'))
                }
            })
        })

        req.on('error', reject)
        req.on('timeout', () => {
            req.destroy()
            reject(new Error('上传超时'))
        })
        form.pipe(req)
    })
}

// ==================== 核心 API ====================

/**
 * 创建复刻音色
 * 
 * @param config 配置
 * @param params.name 音色名称（会被清洗为合法前缀）
 * @param params.audioUrl 音频 URL（公网可访问）
 * @returns voice_id
 */
export async function createVoice(
    config: AliyunVoiceConfig,
    params: { name: string; audioUrl: string }
): Promise<{ voiceId: string }> {
    const apiKey = safeTrim(config.apiKey)
    if (!apiKey) throw new Error('未配置阿里云 DashScope API Key (ALIYUN_DASHSCOPE_API_KEY)')

    const prefix = sanitizePrefix(params.name)
    const targetModel = config.model || DEFAULT_MODEL

    const body = {
        model: VOICE_ENROLLMENT_MODEL,
        input: {
            action: 'create_voice',
            target_model: targetModel,
            prefix,
            url: params.audioUrl,
        },
    }

    const result = await requestJSON(DASHSCOPE_API_URL, 'POST', body, apiKey)
    const voiceId = result?.output?.voice_id
    if (!voiceId) throw new Error('创建音色失败：未返回 voice_id')

    return { voiceId }
}

/**
 * 从本地音频文件创建复刻音色
 * 需要先上传到云端服务器获取 URL
 */
export async function createVoiceFromFile(
    config: AliyunVoiceConfig,
    params: { name: string; audioPath: string }
): Promise<{ voiceId: string }> {
    // 确保音频文件存在
    if (!fs.existsSync(params.audioPath)) {
        throw new Error(`音频文件不存在: ${params.audioPath}`)
    }

    // 上传音频到“上传服务”获取 URL（需公网可访问）
    const serverUrl = safeTrim(config.audioUploadServerUrl)
    const serverPort = config.audioUploadServerPort || 8383

    if (!serverUrl) {
        throw new Error(
            'DashScope CosyVoice 要求音频通过公网 URL 提供。请配置 VOICE_AUDIO_UPLOAD_SERVER_URL（推荐）或 CLOUD_GPU_SERVER_URL（兜底），或改为直接提供音频 URL。'
        )
    }

    console.log('[AliyunVoice] 上传音频到上传服务...')
    const audioUrl = await uploadAudioToGpuServer(params.audioPath, serverUrl, serverPort)
    console.log('[AliyunVoice] 音频上传成功:', audioUrl)

    return createVoice(config, { name: params.name, audioUrl })
}

/**
 * 查询音色列表
 */
export async function listVoices(
    config: AliyunVoiceConfig,
    options?: { prefix?: string; pageIndex?: number; pageSize?: number }
): Promise<AliyunVoiceModel[]> {
    const apiKey = safeTrim(config.apiKey)
    if (!apiKey) throw new Error('未配置阿里云 DashScope API Key')

    const body: any = {
        model: VOICE_ENROLLMENT_MODEL,
        input: {
            action: 'list_voice',
            page_index: options?.pageIndex ?? 0,
            page_size: options?.pageSize ?? 100,
        },
    }

    if (options?.prefix) {
        body.input.prefix = options.prefix
    }

    const result = await requestJSON(DASHSCOPE_API_URL, 'POST', body, apiKey)
    const voiceList = result?.output?.voice_list || []

    return voiceList.map((v: any) => ({
        id: v.voice_id,
        name: parseVoiceName(v.voice_id),
        status: mapStatus(v.status),
        createdAt: v.gmt_create,
        updatedAt: v.gmt_modified,
    }))
}

/**
 * 查询指定音色
 */
export async function getVoice(
    config: AliyunVoiceConfig,
    voiceId: string
): Promise<AliyunVoiceModel | null> {
    const apiKey = safeTrim(config.apiKey)
    if (!apiKey) throw new Error('未配置阿里云 DashScope API Key')

    const body = {
        model: VOICE_ENROLLMENT_MODEL,
        input: {
            action: 'query_voice',
            voice_id: voiceId,
        },
    }

    try {
        const result = await requestJSON(DASHSCOPE_API_URL, 'POST', body, apiKey)
        const v = result?.output
        if (!v) return null

        return {
            id: v.voice_id || voiceId,
            name: parseVoiceName(v.voice_id || voiceId),
            status: mapStatus(v.status),
            createdAt: v.gmt_create,
            updatedAt: v.gmt_modified,
        }
    } catch {
        return null
    }
}

/**
 * 删除音色
 */
export async function deleteVoice(
    config: AliyunVoiceConfig,
    voiceId: string
): Promise<boolean> {
    const apiKey = safeTrim(config.apiKey)
    if (!apiKey) throw new Error('未配置阿里云 DashScope API Key')

    const body = {
        model: VOICE_ENROLLMENT_MODEL,
        input: {
            action: 'delete_voice',
            voice_id: voiceId,
        },
    }

    try {
        await requestJSON(DASHSCOPE_API_URL, 'POST', body, apiKey)
        return true
    } catch {
        return false
    }
}

/**
 * 使用复刻音色合成语音（WebSocket API）
 * 
 * DashScope CosyVoice 语音合成使用 WebSocket 实时流式接口
 */
export async function synthesizeSpeech(
    config: AliyunVoiceConfig,
    params: { voiceId: string; text: string; outputPath: string }
): Promise<string> {
    const apiKey = safeTrim(config.apiKey)
    if (!apiKey) throw new Error('未配置阿里云 DashScope API Key')

    const text = safeTrim(params.text)
    if (!text) throw new Error('合成文本为空')

    const voiceId = safeTrim(params.voiceId)
    if (!voiceId) throw new Error('voice_id 为空')

    const model = config.model || DEFAULT_MODEL

    // 确保输出目录存在
    const outputDir = path.dirname(params.outputPath)
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
    }

    const debugWs = (process.env.DASHSCOPE_DEBUG_WS || '').trim() === '1'

    const runOnce = async (options: { format: 'mp3' | 'wav' | 'pcm' | 'opus'; sampleRate: number }) => {
        return new Promise<string>((resolve, reject) => {
            const taskId = randomUUID()
            const audioChunks: Buffer[] = []
            let resolved = false

            const ws = new WebSocket(DASHSCOPE_WEBSOCKET_URL, {
                headers: { 'Authorization': `Bearer ${apiKey}` },
            })

            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true
                    ws.close()
                    reject(new Error('语音合成超时'))
                }
            }, 180_000)

            const fail = (msg: string) => {
                if (resolved) return
                resolved = true
                clearTimeout(timeout)
                try { ws.close() } catch { /* ignore */ }
                reject(new Error(msg))
            }

            ws.on('open', () => {
                // DashScope tts_v2 协议：run-task(start) -> continue-task(text) -> finish-task
                const startMsg = {
                    header: {
                        action: 'run-task',
                        task_id: taskId,
                        streaming: 'duplex',
                    },
                    payload: {
                        model,
                        task_group: 'audio',
                        task: 'tts',
                        function: 'SpeechSynthesizer',
                        input: {},
                        parameters: {
                            voice: voiceId,
                            volume: 50,
                            text_type: 'PlainText',
                            sample_rate: options.sampleRate,
                            rate: 1.0,
                            format: options.format,
                            pitch: 1.0,
                            seed: 0,
                            type: 0,
                        },
                    },
                }

                const continueMsg = {
                    header: {
                        action: 'continue-task',
                        task_id: taskId,
                        streaming: 'duplex',
                    },
                    payload: {
                        model,
                        task_group: 'audio',
                        task: 'tts',
                        function: 'SpeechSynthesizer',
                        input: { text },
                    },
                }

                const finishMsg = {
                    header: {
                        action: 'finish-task',
                        task_id: taskId,
                        streaming: 'duplex',
                    },
                    payload: { input: {} },
                }

                if (debugWs) console.log('[AliyunVoice] WS start:', JSON.stringify(startMsg))
                ws.send(JSON.stringify(startMsg))
                if (debugWs) console.log('[AliyunVoice] WS continue:', JSON.stringify(continueMsg))
                ws.send(JSON.stringify(continueMsg))
                if (debugWs) console.log('[AliyunVoice] WS finish:', JSON.stringify(finishMsg))
                ws.send(JSON.stringify(finishMsg))
            })

            ws.on('message', (data: Buffer) => {
                const str = data.toString('utf8')
                if (str.startsWith('{')) {
                    let msg: any
                    try {
                        msg = JSON.parse(str)
                    } catch {
                        audioChunks.push(data)
                        return
                    }

                    const event = msg?.header?.event || msg?.header?.status
                    if (debugWs) console.log('[AliyunVoice] WS event:', event, 'raw:', str.slice(0, 500))

                    if (event === 'task-started') {
                        console.log('[AliyunVoice] 语音合成任务开始')
                        return
                    }

                    if (event === 'result-generated') {
                        const audio =
                            msg?.payload?.output?.audio?.data ||
                            msg?.payload?.output?.audio ||
                            msg?.payload?.audio ||
                            msg?.payload?.output?.data
                        if (typeof audio === 'string' && audio) {
                            audioChunks.push(Buffer.from(audio, 'base64'))
                        } else if (Array.isArray(audio)) {
                            for (const a of audio) {
                                if (typeof a === 'string' && a) audioChunks.push(Buffer.from(a, 'base64'))
                            }
                        }
                        return
                    }

                    if (event === 'task-finished') {
                        if (debugWs) console.log('[AliyunVoice] WS task-finished')
                        try { ws.close() } catch { /* ignore */ }
                        return
                    }

                    if (event === 'task-failed' || event === 'error') {
                        const payload = msg?.payload
                        const header = msg?.header
                        const errCode = payload?.code || payload?.error_code || payload?.reason || header?.code || header?.error_code
                        const errMsgRaw =
                            payload?.message ||
                            payload?.error_msg ||
                            header?.message ||
                            header?.error_message ||
                            header?.status_message ||
                            '合成失败'
                        const errMsg = errCode ? `[${errCode}] ${errMsgRaw}` : errMsgRaw
                        console.error('[AliyunVoice] 任务失败:', str.slice(0, 1200))
                        fail(errMsg)
                        return
                    }

                    return
                }

                audioChunks.push(data)
            })

            ws.on('close', () => {
                clearTimeout(timeout)
                if (resolved) return
                resolved = true
                if (audioChunks.length > 0) {
                    const audioBuffer = Buffer.concat(audioChunks)
                    fs.writeFileSync(params.outputPath, audioBuffer)
                    resolve(params.outputPath)
                } else {
                    reject(new Error('未收到音频数据'))
                }
            })

            ws.on('error', (err: Error) => {
                clearTimeout(timeout)
                fail(`WebSocket 错误: ${err.message}`)
            })
        })
    }

    // 输出格式跟随 outputPath 后缀，避免“内容是 wav 但文件名是 mp3”这种坑
    const outExt = path.extname(params.outputPath).toLowerCase()

    // wav：优先 16k（更稳），失败再尝试 22.05k（部分环境/文本更快）
    if (outExt === '.wav' || !outExt) {
        try {
            return await runOnce({ format: 'wav', sampleRate: 16000 })
        } catch (e1: any) {
            const msg = String(e1?.message || e1)
            if (msg.includes('timeout') || msg.includes('InvalidParameter') || msg.includes('task-failed')) {
                return await runOnce({ format: 'wav', sampleRate: 22050 })
            }
            throw e1
        }
    }

    // mp3：直接用 mp3/22050（更小更快），失败再退回 wav/16000（仍然写入到 mp3 路径，由上层决定是否转码）
    try {
        return await runOnce({ format: 'mp3', sampleRate: 22050 })
    } catch (e1: any) {
        const msg = String(e1?.message || e1)
        if (msg.includes('timeout') || msg.includes('InvalidParameter') || msg.includes('task-failed')) {
            return await runOnce({ format: 'wav', sampleRate: 16000 })
        }
        throw e1
    }
}

/**
 * 检查阿里云 CosyVoice 服务状态
 */
export async function checkStatus(config: AliyunVoiceConfig): Promise<{ online: boolean; message?: string }> {
    const apiKey = safeTrim(config.apiKey)
    if (!apiKey) {
        return { online: false, message: '未配置阿里云 DashScope API Key' }
    }

    try {
        // 尝试列出音色来验证 API Key 是否有效
        await listVoices(config, { pageSize: 1 })
        return { online: true, message: 'ok' }
    } catch (e: any) {
        return { online: false, message: e.message }
    }
}
