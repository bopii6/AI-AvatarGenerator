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
import { randomUUID } from 'crypto'

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
    return safeTrim(name).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 10) || 'voice'
}

function parseVoiceName(voiceId: string): string {
    // voice_id 格式：cosyvoice-v3-flash-myvoice-xxxxxxxx
    // 提取用户设置的前缀部分
    const parts = voiceId.split('-')
    if (parts.length >= 4) {
        // 返回用户设置的前缀部分（第4个部分）
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

    return new Promise((resolve, reject) => {
        const taskId = randomUUID()
        const audioChunks: Buffer[] = []
        let resolved = false

        // WebSocket 连接
        const ws = new WebSocket(DASHSCOPE_WEBSOCKET_URL, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        })

        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true
                ws.close()
                reject(new Error('语音合成超时'))
            }
        }, 180_000) // 3 分钟超时

        ws.on('open', () => {
            // 发送 run-task 消息
            const message = {
                header: {
                    action: 'run-task',
                    task_id: taskId,
                    streaming: 'duplex',
                },
                payload: {
                    task_group: 'audio',
                    task: 'tts',
                    function: 'SpeechSynthesizer',
                    model,
                    parameters: {
                        voice: voiceId,
                        format: 'mp3',
                        sample_rate: 22050,
                    },
                    input: {
                        text,
                    },
                },
            }
            ws.send(JSON.stringify(message))
        })

        ws.on('message', (data: Buffer) => {
            try {
                // 尝试解析为 JSON（控制消息）
                const str = data.toString('utf8')
                if (str.startsWith('{')) {
                    const msg = JSON.parse(str)
                    const event = msg?.header?.event

                    if (event === 'task-started') {
                        console.log('[AliyunVoice] 语音合成任务开始')
                    } else if (event === 'task-finished') {
                        console.log('[AliyunVoice] 语音合成任务完成')
                        // 任务完成，发送 finish-task
                        ws.send(JSON.stringify({
                            header: {
                                action: 'finish-task',
                                task_id: taskId,
                            },
                        }))
                    } else if (event === 'result-generated') {
                        // 音频数据在 payload 中
                        const audio = msg?.payload?.output?.audio
                        if (audio) {
                            audioChunks.push(Buffer.from(audio, 'base64'))
                        }
                    } else if (event === 'task-failed') {
                        const errMsg = msg?.payload?.message || '合成失败'
                        if (!resolved) {
                            resolved = true
                            clearTimeout(timeout)
                            ws.close()
                            reject(new Error(errMsg))
                        }
                    }
                } else {
                    // 二进制音频数据
                    audioChunks.push(data)
                }
            } catch {
                // 可能是二进制数据
                audioChunks.push(data)
            }
        })

        ws.on('close', () => {
            clearTimeout(timeout)
            if (!resolved) {
                resolved = true
                if (audioChunks.length > 0) {
                    const audioBuffer = Buffer.concat(audioChunks)
                    fs.writeFileSync(params.outputPath, audioBuffer)
                    console.log('[AliyunVoice] 音频保存到:', params.outputPath)
                    resolve(params.outputPath)
                } else {
                    reject(new Error('未收到音频数据'))
                }
            }
        })

        ws.on('error', (err: Error) => {
            clearTimeout(timeout)
            if (!resolved) {
                resolved = true
                reject(new Error(`WebSocket 错误: ${err.message}`))
            }
        })
    })
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
