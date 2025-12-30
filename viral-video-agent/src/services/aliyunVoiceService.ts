/**
 * 闃块噷浜?DashScope CosyVoice 澹伴煶鍏嬮殕鏈嶅姟
 * 
 * 鍔熻兘锛?
 * - 鍒涘缓澶嶅埢闊宠壊锛堥€氳繃闊抽 URL锛?
 * - 璇煶鍚堟垚锛堜娇鐢ㄥ鍒婚煶鑹诧級
 * - 鏌ヨ闊宠壊鍒楄〃
 * 
 * API 鏂囨。锛歨ttps://help.aliyun.com/zh/model-studio/cosyvoice-clone-api
 */

import fs from 'fs'
import http from 'http'
import path from 'path'
import https from 'https'
import WebSocket from 'ws'
import { createHash, randomUUID } from 'crypto'

// ==================== 閰嶇疆 ====================

const DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization'
const DASHSCOPE_WEBSOCKET_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference'
const DEFAULT_MODEL = 'cosyvoice-v3-flash'
const KNOWN_TTS_MODELS = ['cosyvoice-v3-flash', 'cosyvoice-v3-plus'] as const

const VOICE_ENROLLMENT_MODEL = 'voice-enrollment'
const DEFAULT_TIMEOUT_MS = 60_000

export interface AliyunVoiceConfig {
    apiKey: string
    model?: string // 当前项目默认使用 cosyvoice-v3-flash
    /** 鍥為€€妯″瀷鍒楄〃锛屽綋涓绘ā鍨嬮搴﹁€楀敖鏃舵寜椤哄簭灏濊瘯 */
    fallbackModels?: string[]
    /** 璁惧 ID锛岀敤浜庨煶鑹插墠缂€ */
    deviceId?: string
    /** 鏈湴鏁版嵁瀛樺偍璺緞 */
    localDataPath?: string
    /** 鍙€夛細鐢ㄤ簬涓婁紶闊抽鐨勬湇鍔″櫒 URL锛堝浜戠 GPU 鏈嶅姟鍣級 */
    audioUploadServerUrl?: string
    audioUploadServerPort?: number
}

export interface AliyunVoiceModel {
    id: string // voice_id
    name: string // 浠?voice_id 鎻愬彇鐨勫悕绉?
    status: 'pending' | 'ready' | 'failed'
    createdAt?: string
    updatedAt?: string
}

// ==================== 宸ュ叿鍑芥暟 ====================

function safeTrim(input: string | undefined | null): string {
    return (input || '').toString().trim()
}

function inferModelFromVoiceId(voiceId: string): string | undefined {
    const trimmed = safeTrim(voiceId)
    if (!trimmed) return undefined

    for (const model of KNOWN_TTS_MODELS) {
        if (trimmed === model || trimmed.startsWith(`${model}-`)) return model
    }

    return undefined
}

function sanitizePrefix(name: string): string {
    // DashScope 瑕佹眰锛氫粎鍏佽鏁板瓧銆佸ぇ灏忓啓瀛楁瘝鍜屼笅鍒掔嚎锛屼笉瓒呰繃10涓瓧绗?
    const raw = safeTrim(name)
    const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 10)
    if (cleaned) return cleaned

    // 鐢ㄦ埛杈撳叆鍏ㄦ槸涓枃/绗﹀彿鏃讹紝閬垮厤閮介€€鍖栨垚鍚屼竴涓?"voice"
    if (!raw) return 'voice'
    const hash = createHash('sha1').update(raw).digest('hex').slice(0, 9) // 9 + 'v' = 10 chars
    return `v${hash}`
}

function parseVoiceName(voiceId: string): string {
    // voice_id 格式：<model>-<prefix>-<id>，例如 cosyvoice-clone-v1-myvoice-xxxxxxxx
    // 鎻愬彇鐢ㄦ埛璁剧疆鐨勫墠缂€閮ㄥ垎
    const parts = voiceId.split('-')
    if (parts.length >= 5) {
        // 杩斿洖鐢ㄦ埛璁剧疆鐨勫墠缂€閮ㄥ垎锛堢4涓儴鍒嗭級+ 鐭?ID锛堢敤浜庡尯鍒嗗悓鍚嶅墠缂€鐨勫涓煶鑹诧級
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
                    reject(new Error(`DashScope API 閿欒: ${errMsg}`))
                }
            })
        })

        req.on('timeout', () => {
            req.destroy(new Error('璇锋眰瓒呮椂'))
        })
        req.on('error', reject)
        req.write(payload)
        req.end()
    })
}

// ==================== 闊抽涓婁紶杈呭姪 ====================

/**
 * 灏嗘湰鍦伴煶棰戜笂浼犲埌涓€涓€滃叕缃戝彲璁块棶鈥濈殑涓婁紶鏈嶅姟锛岃繑鍥炲彲璁块棶鐨?URL銆?
 * DashScope CosyVoice Clone 鎺ュ彛瑕佹眰闊抽蹇呴』閫氳繃 URL 鎻愪緵銆?
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
                        reject(new Error('涓婁紶鎴愬姛浣嗘湭杩斿洖 URL'))
                    }
                } catch {
                    reject(new Error('涓婁紶鍝嶅簲瑙ｆ瀽澶辫触'))
                }
            })
        })

        req.on('error', reject)
        req.on('timeout', () => {
            req.destroy()
            reject(new Error('涓婁紶瓒呮椂'))
        })
        form.pipe(req)
    })
}

// ==================== 鏍稿績 API ====================

/**
 * 鍒涘缓澶嶅埢闊宠壊
 * 
 * @param config 閰嶇疆
 * @param params.name 闊宠壊鍚嶇О锛堜細琚竻娲椾负鍚堟硶鍓嶇紑锛?
 * @param params.audioUrl 闊抽 URL锛堝叕缃戝彲璁块棶锛?
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
 * 浠庢湰鍦伴煶棰戞枃浠跺垱寤哄鍒婚煶鑹?
 * 闇€瑕佸厛涓婁紶鍒颁簯绔湇鍔″櫒鑾峰彇 URL
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
 * 鏌ヨ闊宠壊鍒楄〃
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
 * 鏌ヨ鎸囧畾闊宠壊
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
 * 鍒犻櫎闊宠壊
 */
export async function deleteVoice(
    config: AliyunVoiceConfig,
    voiceId: string
): Promise<boolean> {
    const apiKey = safeTrim(config.apiKey)
    if (!apiKey) throw new Error('鏈厤缃樋閲屼簯 DashScope API Key')

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
 * 浣跨敤澶嶅埢闊宠壊鍚堟垚璇煶锛圵ebSocket API锛?
 * 
 * DashScope CosyVoice 璇煶鍚堟垚浣跨敤 WebSocket 瀹炴椂娴佸紡鎺ュ彛
 * 鏀寔妯″瀷鍥為€€锛氬綋涓绘ā鍨嬮搴﹁€楀敖鏃惰嚜鍔ㄥ垏鎹㈠埌澶囩敤妯″瀷
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

    // 当前项目固定只使用 cosyvoice-v3-flash；历史音色如果是其它模型，提示用户重新复刻
    const disallowedVoiceIdPrefixes = ['cosyvoice-clone-v1', 'cosyvoice-v3-plus']
    for (const prefix of disallowedVoiceIdPrefixes) {
        if (voiceId === prefix || voiceId.startsWith(`${prefix}-`)) {
            throw new Error(`检测到历史音色模型 ${prefix}，当前仅支持 ${DEFAULT_MODEL}，请使用 ${DEFAULT_MODEL} 重新复刻音色。`)
        }
    }
    if (voiceId.startsWith('cosyvoice-') && !(voiceId === DEFAULT_MODEL || voiceId.startsWith(`${DEFAULT_MODEL}-`))) {
        const inferred = inferModelFromVoiceId(voiceId)
        throw new Error(`当前仅支持 ${DEFAULT_MODEL}，该音色可能来自 ${inferred || '未知模型'}，请重新复刻音色后再试。`)
    }

    const primaryModel = safeTrim(config.model) || DEFAULT_MODEL

    const normalizedFallbackModels = (config.fallbackModels || []).map(m => safeTrim(m)).filter(Boolean)
    const fallbackModels = normalizedFallbackModels.filter((m) => m === primaryModel)

    const allModels = Array.from(new Set([primaryModel, ...fallbackModels]))
    // 确保输出目录存在
    const outputDir = path.dirname(params.outputPath)
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
    }

    const debugWs = (process.env.DASHSCOPE_DEBUG_WS || '').trim() === '1'

    // 妫€娴嬫槸鍚︿负棰濆害鑰楀敖閿欒
    const isQuotaExhaustedError = (errMsg: string): boolean => {
        return errMsg.includes('AllocationQuota') ||
            errMsg.includes('FreeTierOnly') ||
            errMsg.includes('quota') ||
            errMsg.includes('403')
    }

    const runOnceWithModel = async (model: string, options: { format: 'mp3' | 'wav' | 'pcm' | 'opus'; sampleRate: number }) => {
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
                // DashScope tts_v2 鍗忚锛歳un-task(start) -> continue-task(text) -> finish-task
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
                        console.log(`[AliyunVoice] 语音合成任务开始(模型: ${model})`)
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
                    console.log(`[AliyunVoice] 语音合成完成 (模型: ${model})`)
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

    // 带模型回退的合成函数
    const synthesizeWithFallback = async (options: { format: 'mp3' | 'wav' | 'pcm' | 'opus'; sampleRate: number }): Promise<string> => {
        let lastError: Error | null = null

        for (let i = 0; i < allModels.length; i++) {
            const model = allModels[i]
            try {
                console.log(`[AliyunVoice] 尝试使用模型: ${model}${i > 0 ? ' (回退)' : ''}`)
                return await runOnceWithModel(model, options)
            } catch (err: any) {
                lastError = err
                const errMsg = String(err?.message || err)

                // 濡傛灉鏄搴﹁€楀敖閿欒锛屼笖杩樻湁澶囩敤妯″瀷锛屽垯缁х画灏濊瘯
                if (isQuotaExhaustedError(errMsg) && i < allModels.length - 1) {
                    console.warn(`[AliyunVoice] 模型 ${model} 额度耗尽，尝试回退到下一个模型...`)
                    continue
                }

                // 鍏朵粬閿欒鎴栨病鏈夋洿澶氬鐢ㄦā鍨嬶紝鐩存帴鎶涘嚭
                throw err
            }
        }

        // 濡傛灉鎵€鏈夋ā鍨嬮兘澶辫触浜?
        throw lastError || new Error('所有模型均合成失败')
    }

    // 杈撳嚭鏍煎紡璺熼殢 outputPath 鍚庣紑锛岄伩鍏?鍐呭鏄?wav 浣嗘枃浠跺悕鏄?mp3"杩欑鍧?
    const outExt = path.extname(params.outputPath).toLowerCase()

    // wav锛氫紭鍏?16k锛堟洿绋筹級锛屽け璐ュ啀灏濊瘯 22.05k锛堥儴鍒嗙幆澧?鏂囨湰鏇村揩锛?
    if (outExt === '.wav' || !outExt) {
        try {
            return await synthesizeWithFallback({ format: 'wav', sampleRate: 16000 })
        } catch (e1: any) {
            const msg = String(e1?.message || e1)
            if (msg.includes('timeout') || msg.includes('InvalidParameter') || msg.includes('task-failed')) {
                return await synthesizeWithFallback({ format: 'wav', sampleRate: 22050 })
            }
            throw e1
        }
    }

    // mp3锛氱洿鎺ョ敤 mp3/22050锛堟洿灏忔洿蹇級锛屽け璐ュ啀閫€鍥?wav/16000锛堜粛鐒跺啓鍏ュ埌 mp3 璺緞锛岀敱涓婂眰鍐冲畾鏄惁杞爜锛?
    try {
        return await synthesizeWithFallback({ format: 'mp3', sampleRate: 22050 })
    } catch (e1: any) {
        const msg = String(e1?.message || e1)
        if (msg.includes('timeout') || msg.includes('InvalidParameter') || msg.includes('task-failed')) {
            return await synthesizeWithFallback({ format: 'wav', sampleRate: 16000 })
        }
        throw e1
    }
}

/**
 * 妫€鏌ラ樋閲屼簯 CosyVoice 鏈嶅姟鐘舵€?
 */
export async function checkStatus(config: AliyunVoiceConfig): Promise<{ online: boolean; message?: string }> {
    const apiKey = safeTrim(config.apiKey)
    if (!apiKey) {
        return { online: false, message: '鏈厤缃樋閲屼簯 DashScope API Key' }
    }

    try {
        // 灏濊瘯鍒楀嚭闊宠壊鏉ラ獙璇?API Key 鏄惁鏈夋晥
        await listVoices(config, { pageSize: 1 })
        return { online: true, message: 'ok' }
    } catch (e: any) {
        return { online: false, message: e.message }
    }
}
