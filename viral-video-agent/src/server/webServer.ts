// Web backend for browser renderer (HTTP invoke + WebSocket events)
// NOTE: Keep this file node-only; it is bundled via esbuild.

import http from 'http'
import path from 'path'
import fs from 'fs'
import { spawnSync } from 'child_process'
import { randomBytes, randomUUID } from 'crypto'
import dotenv from 'dotenv'
import { WebSocketServer, type WebSocket } from 'ws'

const COSYVOICE_MIN_SAMPLE_SECONDS = 10

import { downloadDouyinVideo, fetchProfileVideos, isProfileUrl } from '../services/douyinService'
import { recognizeSentence, type AsrConfig } from '../services/asrService'
import {
    extractAudio,
    sliceAudio,
    getMediaDuration,
    generateSrtFile,
    burnSubtitles,
    captureFrame,
    addBackgroundMusic,
} from '../services/ffmpegService'
import {
    rewriteCopy,
    analyzeCopyPattern,
    generateBenchmarkTopics,
    generateBenchmarkScript,
    diagnoseAccount,
    generateTitles,
    generateHashtags,
    type HunyuanConfig,
} from '../services/hunyuanService'
import { generateCover, type CoverServiceConfig } from '../services/coverService'
import {
    checkStatus as checkAliyunVoiceStatus,
    listVoices,
    createVoice,
    createVoiceFromFile,
    getVoice,
    synthesizeSpeech,
} from '../services/aliyunVoiceService'
import { uploadVoiceSampleToCos } from '../services/tencentCosService'
import {
    checkCloudGpuStatus,
    getCloudAvatarModels,
    deleteCloudAvatarModel,
    uploadAvatarVideo,
    generateCloudVideoWithLocalPaths,
    synthesizeCloudVideoOnly,
    downloadCloudVideoToLocal,
} from '../services/cloudGpuService'

type InvokeRequestBody = {
    channel: string
    args?: unknown[]
    clientId?: string
}

type JsonObject = Record<string, unknown>

type WsEventMessage = {
    channel: string
    args: unknown[]
}

function uuidv4(): string {
    if (typeof randomUUID === 'function') return randomUUID()
    const bytes = randomBytes(16)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = bytes.toString('hex')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function loadEnvFile() {
    const candidates = [
        process.env.VIRAL_VIDEO_AGENT_ENV_PATH,
        path.join(process.cwd(), '.env'),
    ].filter((p): p is string => typeof p === 'string' && p.length > 0)

    for (const envPath of candidates) {
        try {
            if (!fs.existsSync(envPath)) continue
            const result = dotenv.config({ path: envPath })
            if (!result.error) {
                process.env.VIRAL_VIDEO_AGENT_ENV_PATH_LOADED = envPath
                return
            }
        } catch {
            // ignore
        }
    }

    dotenv.config()
}

loadEnvFile()

function ensureDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true })
}

function getDataDir(): string {
    const raw = (process.env.VIRAL_VIDEO_AGENT_DATA_DIR || '').trim()
    if (raw) return raw
    return path.join(process.cwd(), 'tmp_client_data', 'web')
}

function getConfigPath(): string {
    return path.join(getDataDir(), 'server_config.json')
}

function getCookieStorePath(): string {
    return path.join(getDataDir(), 'publish_cookies.json')
}

function readServerConfig(): Record<string, string> {
    try {
        const file = getConfigPath()
        if (!fs.existsSync(file)) return {}
        const raw = fs.readFileSync(file, 'utf-8')
        return JSON.parse(raw)
    } catch {
        return {}
    }
}

function saveServerConfig(updated: Record<string, string>) {
    const file = getConfigPath()
    ensureDir(path.dirname(file))
    fs.writeFileSync(file, JSON.stringify(updated, null, 2), 'utf-8')
}

type PipelineConfig = {
    tencent: { secretId: string; secretKey: string }
    aliyun: { accessKeyId: string; accessKeySecret: string }
    coverProvider: 'aliyun' | 'tencent'
    digitalHuman: { apiUrl: string; apiKey?: string }
    outputDir: string
    extra?: { cloudGpuServerUrl?: string; cloudGpuVideoPort?: string }
}

function getBuiltInConfig(): PipelineConfig {
    return {
        tencent: {
            secretId: process.env.TENCENT_SECRET_ID || '',
            secretKey: process.env.TENCENT_SECRET_KEY || '',
        },
        aliyun: {
            accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || '',
            accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || '',
        },
        coverProvider: process.env.COVER_PROVIDER === 'tencent' ? 'tencent' : 'aliyun',
        digitalHuman: {
            apiUrl: process.env.CLOUD_GPU_SERVER_URL
                ? `${process.env.CLOUD_GPU_SERVER_URL}:${process.env.CLOUD_GPU_VIDEO_PORT || 8383}`
                : 'http://localhost:8080',
        },
        outputDir: path.join(getDataDir(), 'output'),
        extra: {
            cloudGpuServerUrl: process.env.CLOUD_GPU_SERVER_URL || '',
            cloudGpuVideoPort: process.env.CLOUD_GPU_VIDEO_PORT || '8383',
        },
    }
}

function getConfig(): PipelineConfig {
    const builtIn = getBuiltInConfig()
    let runtime = readServerConfig()

    const envCloudGpuUrl = (process.env.CLOUD_GPU_SERVER_URL || '').trim()
    const envCloudGpuPort = (process.env.CLOUD_GPU_VIDEO_PORT || '').trim()
    let shouldSyncRuntime = false
    if (envCloudGpuUrl && envCloudGpuUrl !== (runtime.CLOUD_GPU_SERVER_URL || '').trim()) {
        runtime = { ...runtime, CLOUD_GPU_SERVER_URL: envCloudGpuUrl }
        shouldSyncRuntime = true
    }
    if (envCloudGpuPort && envCloudGpuPort !== (runtime.CLOUD_GPU_VIDEO_PORT || '').trim()) {
        runtime = { ...runtime, CLOUD_GPU_VIDEO_PORT: envCloudGpuPort }
        shouldSyncRuntime = true
    }
    if (shouldSyncRuntime) {
        try {
            saveServerConfig(runtime)
        } catch {
            // ignore
        }
    }

    const cloudGpuUrl = envCloudGpuUrl || (runtime.CLOUD_GPU_SERVER_URL || '').trim() || ''
    const cloudGpuPort = envCloudGpuPort || (runtime.CLOUD_GPU_VIDEO_PORT || '').trim() || '8383'
    if (cloudGpuUrl) {
        builtIn.digitalHuman.apiUrl = cloudGpuUrl.startsWith('http')
            ? `${cloudGpuUrl}:${cloudGpuPort}`
            : `http://${cloudGpuUrl}:${cloudGpuPort}`
    }

    ensureDir(builtIn.outputDir)
    builtIn.extra = builtIn.extra || {}
    builtIn.extra.cloudGpuServerUrl = cloudGpuUrl
    builtIn.extra.cloudGpuVideoPort = cloudGpuPort

    return builtIn
}

let config: PipelineConfig = getConfig()
ensureDir(getDataDir())
ensureDir(config.outputDir)

function normalizeHttpUrl(raw: string): string {
    const trimmed = (raw || '').trim().replace(/\/+$/, '')
    if (!trimmed) return ''
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
    return `http://${trimmed}`
}

function getCloudGpuRuntime() {
    const serverUrlRaw = process.env.CLOUD_GPU_SERVER_URL || config.extra?.cloudGpuServerUrl || ''
    const portRaw = process.env.CLOUD_GPU_VIDEO_PORT || config.extra?.cloudGpuVideoPort || '8383'
    const parsedPort = parseInt(portRaw, 10)
    const videoPort = Number.isFinite(parsedPort) ? parsedPort : 8383
    const serverUrl = normalizeHttpUrl(serverUrlRaw)
    return { serverUrl, videoPort }
}

function getAliyunVoiceRuntime() {
    const runtime = readServerConfig()
    const apiKey = (runtime.ALIYUN_DASHSCOPE_API_KEY || process.env.ALIYUN_DASHSCOPE_API_KEY || '').trim()
    const model = (runtime.ALIYUN_COSYVOICE_MODEL || process.env.ALIYUN_COSYVOICE_MODEL || 'cosyvoice-v3-flash').trim()
    const fallbackModelsRaw = (runtime.ALIYUN_COSYVOICE_FALLBACK_MODELS || process.env.ALIYUN_COSYVOICE_FALLBACK_MODELS || '').trim()
    const fallbackModels = fallbackModelsRaw
        ? fallbackModelsRaw.split(',').map(m => m.trim()).filter(Boolean)
        : []
    const uploadServerUrl = (runtime.VOICE_AUDIO_UPLOAD_SERVER_URL || process.env.VOICE_AUDIO_UPLOAD_SERVER_URL || '').trim()
    const uploadPortRaw = (runtime.VOICE_AUDIO_UPLOAD_PORT || process.env.VOICE_AUDIO_UPLOAD_PORT || '').trim()
    const uploadPortParsed = parseInt(uploadPortRaw, 10)
    const uploadServerPort = Number.isFinite(uploadPortParsed) ? uploadPortParsed : undefined
    const cosBucket = (runtime.TENCENT_COS_BUCKET || process.env.TENCENT_COS_BUCKET || '').trim()
    const cosRegion = (runtime.TENCENT_COS_REGION || process.env.TENCENT_COS_REGION || '').trim()
    const cosPrefix = (runtime.TENCENT_COS_VOICE_PREFIX || process.env.TENCENT_COS_VOICE_PREFIX || '').trim()
    const cosExpiresRaw = (runtime.TENCENT_COS_SIGNED_URL_EXPIRES_SECONDS || process.env.TENCENT_COS_SIGNED_URL_EXPIRES_SECONDS || '').trim()
    const cosExpiresParsed = parseInt(cosExpiresRaw, 10)
    const cosSignedUrlExpiresSeconds = Number.isFinite(cosExpiresParsed) ? cosExpiresParsed : undefined

    return {
        apiKey,
        model,
        fallbackModels,
        uploadServerUrl,
        uploadServerPort,
        cosBucket,
        cosRegion,
        cosPrefix,
        cosSignedUrlExpiresSeconds,
    }
}

const ffmpegExecutable = (() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffmpegPath = require('ffmpeg-static') as string | null
    return ffmpegPath || 'ffmpeg'
})()

function convertAudioToWavIfNeeded(sourcePath: string): string {
    const ext = path.extname(sourcePath).toLowerCase()
    if (ext === '.wav') return sourcePath
    const outputPath = sourcePath.replace(/\.\w+$/, '') + '_cosyvoice.wav'
    const args = ['-y', '-i', sourcePath, '-ar', '22050', '-ac', '1', '-f', 'wav', outputPath]
    const result = spawnSync(ffmpegExecutable, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    if (result.status !== 0) {
        const err = (result.stderr || result.stdout || '').toString('utf8')
        throw new Error(`闊抽杞爜澶辫触: ${err.trim()}`)
    }
    return outputPath
}

function convertAudioToDuixWavPcm16k(sourcePath: string, tempDir: string): string {
    ensureDir(tempDir)
    const outputPath = path.join(tempDir, `duix_audio_${Date.now()}_${uuidv4()}.wav`)
    const args = ['-y', '-i', sourcePath, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', outputPath]
    const result = spawnSync(ffmpegExecutable, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    if (result.status !== 0) {
        const err = (result.stderr || result.stdout || '').toString('utf8')
        throw new Error(`闊抽杞爜澶辫触: ${err.trim()}`)
    }
    return outputPath
}

function splitTextForTts(input: string, maxChunkChars: number): string[] {
    const text = (input || '').trim()
    if (!text) return []
    if (text.length <= maxChunkChars) return [text]

    const rawParts = text
        .replace(/\r\n/g, '\n')
        .split(/(?<=[銆傦紒锛燂紱!?;])|\n+/)
        .map(s => s.trim())
        .filter(Boolean)

    const chunks: string[] = []
    let current = ''

    const pushCurrent = () => {
        const v = current.trim()
        if (v) chunks.push(v)
        current = ''
    }

    for (const part of rawParts) {
        if (!part) continue
        if (part.length > maxChunkChars) {
            pushCurrent()
            for (let i = 0; i < part.length; i += maxChunkChars) {
                chunks.push(part.slice(i, i + maxChunkChars))
            }
            continue
        }

        if ((current + part).length > maxChunkChars) {
            pushCurrent()
        }
        current = current ? `${current}${part}` : part
    }
    pushCurrent()
    return chunks
}

function readCookieStore(): Array<{ platform: string; userName: string; value: string; encrypted: boolean; updatedAt: number }> {
    try {
        const file = getCookieStorePath()
        if (!fs.existsSync(file)) return []
        const raw = fs.readFileSync(file, 'utf-8')
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

function writeCookieStore(entries: Array<{ platform: string; userName: string; value: string; encrypted: boolean; updatedAt: number }>) {
    const file = getCookieStorePath()
    ensureDir(path.dirname(file))
    fs.writeFileSync(file, JSON.stringify(entries, null, 2), 'utf-8')
}

function writeJson(res: http.ServerResponse, statusCode: number, data: unknown) {
    const body = JSON.stringify(data)
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, X-Client-Id, X-Filename',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    })
    res.end(body)
}

function readJsonBody(req: http.IncomingMessage, maxBytes: number): Promise<JsonObject> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = []
        let total = 0
        req.on('data', (chunk: Buffer) => {
            total += chunk.length
            if (total > maxBytes) {
                reject(new Error('Body too large'))
                req.destroy()
                return
            }
            chunks.push(chunk)
        })
        req.on('end', () => {
            try {
                const text = Buffer.concat(chunks).toString('utf-8')
                const parsed = text ? JSON.parse(text) : {}
                if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON')
                resolve(parsed as JsonObject)
            } catch (e) {
                reject(e)
            }
        })
        req.on('error', reject)
    })
}

function isSubPath(parent: string, candidate: string): boolean {
    const rel = path.relative(parent, candidate)
    return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}

function guessMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase()
    switch (ext) {
        case '.html': return 'text/html; charset=utf-8'
        case '.js': return 'application/javascript; charset=utf-8'
        case '.css': return 'text/css; charset=utf-8'
        case '.svg': return 'image/svg+xml'
        case '.ico': return 'image/x-icon'
        case '.mp4': return 'video/mp4'
        case '.webm': return 'video/webm'
        case '.mov': return 'video/quicktime'
        case '.mp3': return 'audio/mpeg'
        case '.wav': return 'audio/wav'
        case '.m4a': return 'audio/mp4'
        case '.aac': return 'audio/aac'
        case '.ogg': return 'audio/ogg'
        case '.png': return 'image/png'
        case '.jpg':
        case '.jpeg': return 'image/jpeg'
        case '.webp': return 'image/webp'
        case '.txt':
        case '.srt':
        case '.vtt':
        case '.md': return 'text/plain; charset=utf-8'
        case '.json': return 'application/json; charset=utf-8'
        default: return 'application/octet-stream'
    }
}

type InvokeHandler = (ctx: { clientId?: string }, ...args: unknown[]) => Promise<unknown>

const wsClients = new Map<string, WebSocket>()

function emitWs(clientId: string | undefined, channel: string, ...args: unknown[]) {
    if (!clientId) return
    const ws = wsClients.get(clientId)
    if (!ws || ws.readyState !== ws.OPEN) return
    const payload: WsEventMessage = { channel, args }
    try {
        ws.send(JSON.stringify(payload))
    } catch {
        // ignore
    }
}

const handlers: Record<string, InvokeHandler> = {}

handlers['config-get'] = async () => {
    const full = getConfig()
    const { apiKey, model, fallbackModels, uploadServerUrl, uploadServerPort, cosBucket, cosRegion, cosPrefix, cosSignedUrlExpiresSeconds } = getAliyunVoiceRuntime()
    return {
        success: true,
        data: {
            CLOUD_GPU_SERVER_URL: full.extra?.cloudGpuServerUrl || '',
            CLOUD_GPU_VIDEO_PORT: full.extra?.cloudGpuVideoPort || '8383',
            ALIYUN_DASHSCOPE_API_KEY: apiKey,
            ALIYUN_COSYVOICE_MODEL: model,
            ALIYUN_COSYVOICE_FALLBACK_MODELS: fallbackModels.join(','),
            VOICE_AUDIO_UPLOAD_SERVER_URL: uploadServerUrl,
            VOICE_AUDIO_UPLOAD_PORT: uploadServerPort ? String(uploadServerPort) : '',
            TENCENT_COS_BUCKET: cosBucket,
            TENCENT_COS_REGION: cosRegion,
            TENCENT_COS_VOICE_PREFIX: cosPrefix,
            TENCENT_COS_SIGNED_URL_EXPIRES_SECONDS: cosSignedUrlExpiresSeconds ? String(cosSignedUrlExpiresSeconds) : '',
            COVER_PROVIDER: full.coverProvider,
            loadedEnvPath: process.env.VIRAL_VIDEO_AGENT_ENV_PATH_LOADED || 'Built-in',
            adminEnabled: ['1', 'true', 'yes', 'on'].includes((process.env.VIRAL_VIDEO_AGENT_ADMIN || '').trim().toLowerCase()),
        },
    }
}

handlers['config-update'] = async (_ctx, updates: unknown) => {
    const record = updates && typeof updates === 'object' ? (updates as Record<string, string>) : {}
    const current = readServerConfig()
    const next = { ...current, ...record }
    saveServerConfig(next)
    config = getConfig()
    return { success: true }
}

handlers['cloud-voice-check-status'] = async () => {
    const { apiKey, model } = getAliyunVoiceRuntime()
    const status = await checkAliyunVoiceStatus({ apiKey, model })
    return { success: true, data: { ...status, provider: 'aliyun', endpoint: 'dashscope.aliyuncs.com' } }
}

handlers['cloud-voice-list-models'] = async () => {
    const { apiKey, model } = getAliyunVoiceRuntime()
    const voices = await listVoices({ apiKey, model })
    return { success: true, data: voices }
}

handlers['cloud-voice-get-model'] = async (_ctx, voiceId: unknown) => {
    const id = String(voiceId || '').trim()
    if (!id) throw new Error('voiceId 涓虹┖')
    const { apiKey, model } = getAliyunVoiceRuntime()
    const voice = await getVoice({ apiKey, model }, id)
    return { success: true, data: voice }
}

handlers['cloud-voice-train'] = async (_ctx, params: unknown) => {
    const p = (params || {}) as { name?: string; audioBufferBase64?: string; fileName?: string }
    const name = (p.name || '').trim()
    if (!name) throw new Error('请填写声音名称')
    const b64 = p.audioBufferBase64
    if (!b64) throw new Error('闊抽涓虹┖')

    const voiceDataDir = path.join(getDataDir(), 'cloud_voice_data')
    const tempDir = path.join(voiceDataDir, 'temp')
    ensureDir(tempDir)

    const safeName = (p.fileName || `sample_${Date.now()}.wav`).replace(/[\\\\/:*?"<>|]/g, '_')
    const tempAudioPath = path.join(tempDir, safeName)
    fs.writeFileSync(tempAudioPath, Buffer.from(b64, 'base64'))

    let audioPathToUpload = tempAudioPath
    try {
        audioPathToUpload = convertAudioToWavIfNeeded(tempAudioPath)
    } catch (err: any) {
        throw new Error(`闊抽杞爜澶辫触: ${err?.message || err}`)
    }

    const { apiKey, model, fallbackModels, uploadServerUrl, uploadServerPort, cosBucket, cosRegion, cosPrefix, cosSignedUrlExpiresSeconds } = getAliyunVoiceRuntime()
    const { serverUrl, videoPort } = getCloudGpuRuntime()
    const deviceId = (process.env.VIRAL_VIDEO_AGENT_DEVICE_ID || '').trim() || uuidv4()

    if (cosBucket && cosRegion) {
        const buffer = fs.readFileSync(audioPathToUpload)
        const cosRes = await uploadVoiceSampleToCos(
            {
                secretId: config.tencent.secretId,
                secretKey: config.tencent.secretKey,
                bucket: cosBucket,
                region: cosRegion,
                prefix: cosPrefix || 'voice-samples/',
                signedUrlExpiresSeconds: cosSignedUrlExpiresSeconds ?? 3600,
            },
            { buffer, fileName: safeName, deviceId }
        )

        const { voiceId } = await createVoice({ apiKey, model }, { name, audioUrl: cosRes.signedUrl })
        return { success: true, data: { voiceId } }
    }

    const { voiceId } = await createVoiceFromFile(
        {
            apiKey,
            model,
            audioUploadServerUrl: uploadServerUrl || serverUrl,
            audioUploadServerPort: uploadServerPort || videoPort,
        },
        { name, audioPath: audioPathToUpload }
    )
    return { success: true, data: { voiceId } }
}

handlers['cloud-voice-train-from-file'] = async (_ctx, params: unknown) => {
    const p = (params || {}) as { name?: string; filePath?: string }
    const name = (p.name || '').trim()
    if (!name) throw new Error('请填写声音名称')
    const filePath = String(p.filePath || '').trim()
    if (!filePath) throw new Error('鏂囦欢璺緞涓虹┖')
    if (!fs.existsSync(filePath)) throw new Error('鏂囦欢涓嶅瓨鍦細' + filePath)

    const voiceDataDir = path.join(getDataDir(), 'cloud_voice_data')
    const tempDir = path.join(voiceDataDir, 'temp')
    ensureDir(tempDir)

    const originalBase = path.basename(filePath)
    const safeBase = (originalBase || `sample_${Date.now()}.dat`).replace(/[\\\\/:*?"<>|]/g, '_')
    const tempSourcePath = path.join(tempDir, `${Date.now()}_${uuidv4()}_${safeBase}`)
    fs.copyFileSync(filePath, tempSourcePath)

    let audioPathToUpload = tempSourcePath
    try {
        audioPathToUpload = convertAudioToWavIfNeeded(tempSourcePath)
    } catch (err: any) {
        throw new Error(`音频转码失败：${err?.message || err}`)
    }

    const duration = await getMediaDuration(audioPathToUpload)
    if (Number.isFinite(duration) && duration > 0 && duration < COSYVOICE_MIN_SAMPLE_SECONDS) {
        throw new Error(`样本时长不足（${duration.toFixed(1)} 秒），请提供至少 ${COSYVOICE_MIN_SAMPLE_SECONDS} 秒的音频/视频。`)
    }

    const { apiKey, model, fallbackModels, uploadServerUrl, uploadServerPort, cosBucket, cosRegion, cosPrefix, cosSignedUrlExpiresSeconds } = getAliyunVoiceRuntime()
    const { serverUrl, videoPort } = getCloudGpuRuntime()
    const deviceId = (process.env.VIRAL_VIDEO_AGENT_DEVICE_ID || '').trim() || uuidv4()

    if (cosBucket && cosRegion) {
        const buffer = fs.readFileSync(audioPathToUpload)
        const cosRes = await uploadVoiceSampleToCos(
            {
                secretId: config.tencent.secretId,
                secretKey: config.tencent.secretKey,
                bucket: cosBucket,
                region: cosRegion,
                prefix: cosPrefix || 'voice-samples/',
                signedUrlExpiresSeconds: cosSignedUrlExpiresSeconds ?? 3600,
            },
            { buffer, fileName: path.basename(audioPathToUpload), deviceId }
        )

        const { voiceId } = await createVoice({ apiKey, model }, { name, audioUrl: cosRes.signedUrl })
        return { success: true, data: { voiceId } }
    }

    const { voiceId } = await createVoiceFromFile(
        {
            apiKey,
            model,
            audioUploadServerUrl: uploadServerUrl || serverUrl,
            audioUploadServerPort: uploadServerPort || videoPort,
        },
        { name, audioPath: audioPathToUpload }
    )
    return { success: true, data: { voiceId } }
}

handlers['cloud-voice-tts'] = async (_ctx, params: unknown) => {
    const p = (params || {}) as { voiceId?: string; text?: string }
    const text = (p.text || '').trim()
    if (!text) throw new Error('鏂囨湰涓虹┖')
    const voiceId = (p.voiceId || '').trim()
    if (!voiceId) throw new Error('voiceId 涓虹┖')

    const { apiKey, model, fallbackModels } = getAliyunVoiceRuntime()

    const voice = await getVoice({ apiKey, model }, voiceId)
    if (!voice) throw new Error('音色不存在或已删除，请刷新列表')
    if (voice.status !== 'ready') throw new Error('音色仍在训练中（当前状态：' + voice.status + '）')

    const voiceDataDir = path.join(getDataDir(), 'cloud_voice_data')
    const outputDir = path.join(voiceDataDir, 'audio')
    ensureDir(outputDir)
    const outputPath = path.join(outputDir, `aliyun_voice_${Date.now()}.wav`)

    const chunks = splitTextForTts(text, 220)
    if (chunks.length <= 1) {
        const audioPath = await synthesizeSpeech({ apiKey, model, fallbackModels }, { voiceId, text, outputPath })
        return { success: true, data: { audioPath } }
    }

    const partPaths: string[] = []
    for (let i = 0; i < chunks.length; i++) {
        const partOut = path.join(outputDir, `aliyun_voice_part_${Date.now()}_${i}.wav`)
        const partPath = await synthesizeSpeech({ apiKey, model, fallbackModels }, { voiceId, text: chunks[i], outputPath: partOut })
        partPaths.push(partPath)
    }

    const concatArgs = ['-y']
    for (const p2 of partPaths) concatArgs.push('-i', p2)
    concatArgs.push('-filter_complex', `concat=n=${partPaths.length}:v=0:a=1`, outputPath)
    const concat = spawnSync(ffmpegExecutable, concatArgs, { stdio: ['ignore', 'pipe', 'pipe'] })
    if (concat.status !== 0) {
        const err = (concat.stderr || concat.stdout || '').toString('utf8')
        throw new Error(`闊抽鎷兼帴澶辫触: ${err.trim()}`)
    }
    for (const p2 of partPaths) {
        try { fs.unlinkSync(p2) } catch { /* ignore */ }
    }
    return { success: true, data: { audioPath: outputPath } }
}

handlers['douyin-fetch-profile-videos'] = async (_ctx, profileUrl: unknown, count: unknown) => {
    const url = String(profileUrl || '').trim()
    const c = typeof count === 'number' ? count : parseInt(String(count || '10'), 10)
    const videos = await fetchProfileVideos(url, Number.isFinite(c) ? c : 10)
    return { success: true, data: videos }
}

handlers['douyin-check-url-type'] = async (_ctx, url: unknown) => {
    const u = String(url || '').trim()
    return { success: true, data: { isProfile: isProfileUrl(u) } }
}

handlers['download-video'] = async (ctx, url: unknown) => {
    const u = String(url || '').trim()
    if (!u) throw new Error('url 涓虹┖')
    const outputDir = path.join(config.outputDir, 'downloads')
    ensureDir(outputDir)
    const result = await downloadDouyinVideo(u, outputDir, (percent, message) => {
        emitWs(ctx.clientId, 'download-progress', { percent, message })
    })
    if (!result.success) return { success: false, error: result.error || '涓嬭浇澶辫触' }
    return { success: true, data: { videoPath: result.videoPath, title: result.title } }
}

handlers['transcribe-audio'] = async (ctx, videoPath: unknown) => {
    const sourcePath = String(videoPath || '').trim()
    if (!sourcePath) throw new Error('videoPath 涓虹┖')
    if (!fs.existsSync(sourcePath)) throw new Error('瑙嗛鏂囦欢涓嶅瓨鍦? ' + sourcePath)

    const audioDir = path.join(config.outputDir, 'audio')
    ensureDir(audioDir)
    const timestamp = Date.now()
    const audioPath = path.join(audioDir, `temp_audio_${timestamp}.mp3`)

    emitWs(ctx.clientId, 'pipeline-progress', 10, '姝ｅ湪鎻愬彇闊抽...')
    await extractAudio(sourcePath, audioPath, 'mp3', { sampleRate: 16000, channels: 1 })
    if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size < 100) throw new Error('鎻愬彇鍑虹殑闊抽鏂囦欢鏃犳晥')

    let duration = 0
    try {
        duration = await getMediaDuration(audioPath)
    } catch {
        duration = 300
    }

    if (duration > 600) {
        try { fs.unlinkSync(audioPath) } catch { /* ignore */ }
        throw new Error('视频时长超过 10 分钟，请使用较短的视频')
    }

    emitWs(ctx.clientId, 'pipeline-progress', 20, '姝ｅ湪璇嗗埆璇煶...')

    const tencentConfig: AsrConfig = {
        secretId: config.tencent.secretId,
        secretKey: config.tencent.secretKey,
    } as any

    const segmentDuration = 50
    const results: string[] = []
    const segmentCount = duration <= 50 ? 1 : Math.ceil(duration / segmentDuration)

    if (segmentCount === 1) {
        const audioBase64 = fs.readFileSync(audioPath).toString('base64')
        const text = await recognizeSentence(tencentConfig, audioBase64)
        try { fs.unlinkSync(audioPath) } catch { /* ignore */ }
        emitWs(ctx.clientId, 'pipeline-progress', 100, '璇嗗埆瀹屾垚')
        return { success: true, data: text || '锛堟湭璇嗗埆鍒版枃瀛楋級' }
    }

    for (let i = 0; i < segmentCount; i++) {
        const startTime = i * segmentDuration
        const segmentPath = path.join(audioDir, `segment_${timestamp}_${i}.mp3`)
        emitWs(ctx.clientId, 'pipeline-progress', 20 + (i / segmentCount) * 70, `璇嗗埆涓?.. (${i + 1}/${segmentCount})`)
        try {
            await sliceAudio(audioPath, segmentPath, startTime, segmentDuration, 'mp3', { sampleRate: 16000, channels: 1 })
            if (fs.existsSync(segmentPath)) {
                const segmentBase64 = fs.readFileSync(segmentPath).toString('base64')
                const segmentText = await recognizeSentence(tencentConfig, segmentBase64)
                if (segmentText) results.push(segmentText)
            }
        } finally {
            try { fs.unlinkSync(segmentPath) } catch { /* ignore */ }
        }
    }

    try { fs.unlinkSync(audioPath) } catch { /* ignore */ }
    emitWs(ctx.clientId, 'pipeline-progress', 100, '璇嗗埆瀹屾垚')
    return { success: true, data: results.join(' ') || '（未从长音频中识别到有效文字）' }
}

handlers['rewrite-copy'] = async (_ctx, text: unknown, mode: unknown, instruction: unknown) => {
    const t = String(text || '')
    const m = String(mode || 'auto')
    const i = typeof instruction === 'string' ? instruction : undefined
    const result = await rewriteCopy(config.tencent as unknown as HunyuanConfig, t, m as any, i)
    return { success: true, data: result }
}

handlers['analyze-copy-pattern'] = async (_ctx, copies: unknown) => {
    const c = String(copies || '')
    const result = await analyzeCopyPattern(config.tencent as unknown as HunyuanConfig, c)
    return { success: true, data: result }
}

handlers['benchmark-generate-topics'] = async (_ctx, payload: unknown) => {
    const p = payload as { profileUrl?: string; samples: Array<{ title: string; transcript: string }>; count?: number }
    const count = typeof p?.count === 'number' ? p.count : 4
    const topics = await generateBenchmarkTopics(config.tencent as unknown as HunyuanConfig, p, count)
    return { success: true, data: topics }
}

handlers['benchmark-generate-script'] = async (_ctx, payload: unknown) => {
    const p = payload as { profileUrl?: string; samples: Array<{ title: string; transcript: string }>; topic: string }
    const script = await generateBenchmarkScript(config.tencent as unknown as HunyuanConfig, p)
    return { success: true, data: script }
}

handlers['account-diagnose'] = async (_ctx, payload: unknown) => {
    const p = payload as { profileUrl?: string; samples: Array<{ title: string; transcript: string }> }
    const result = await diagnoseAccount(config.tencent as unknown as HunyuanConfig, p)
    return { success: true, data: result }
}

handlers['generate-title'] = async (_ctx, content: unknown) => {
    const c = String(content || '')
    const titles = await generateTitles(config.tencent as unknown as HunyuanConfig, c)
    const hashtags = await generateHashtags(config.tencent as unknown as HunyuanConfig, c)
    return { success: true, data: { titles, hashtags } }
}

handlers['generate-cover'] = async (_ctx, prompt: unknown) => {
    const p = String(prompt || '').trim()
    const outputDir = path.join(config.outputDir, 'covers')
    ensureDir(outputDir)
    const coverRequest: CoverServiceConfig = {
        provider: config.coverProvider,
        aliyun: config.aliyun,
        tencent: {
            secretId: config.tencent.secretId,
            secretKey: config.tencent.secretKey,
            region: process.env.COVER_TENCENT_REGION,
        },
    } as any

    const covers = await generateCover(coverRequest, p, outputDir)
    return { success: true, data: { coverPaths: covers, provider: config.coverProvider } }
}

handlers['capture-frame'] = async (_ctx, videoPath: unknown, time: unknown) => {
    const vp = String(videoPath || '').trim()
    const t = typeof time === 'number' ? time : parseFloat(String(time || '2'))
    const outputDir = path.join(config.outputDir, 'covers')
    ensureDir(outputDir)
    const coverPath = path.join(outputDir, `frame_${Date.now()}.jpg`)
    await captureFrame(vp, coverPath, Number.isFinite(t) ? t : 2)
    return { success: true, data: { coverPath } }
}

handlers['generate-subtitle-file'] = async (_ctx, params: unknown) => {
    const p = (params || {}) as { segments?: Array<{ start?: number; end?: number; startTime?: number; endTime?: number; text: string }>; text?: string }
    const subtitlesDir = path.join(config.outputDir, 'subtitles')
    ensureDir(subtitlesDir)
    const subtitlePath = path.join(subtitlesDir, `subtitle_${Date.now()}.srt`)
    if (p.segments && p.segments.length > 0) {
        const normalized = p.segments.map((seg) => ({
            text: seg.text,
            startTime: typeof seg.startTime === 'number' ? seg.startTime : (seg.start || 0),
            endTime: typeof seg.endTime === 'number' ? seg.endTime : (seg.end || 0),
        }))
        const srtPath = generateSrtFile(normalized, subtitlePath)
        return { success: true, data: { subtitlePath: srtPath } }
    }

    const raw = (p.text || '').trim()
    const defaultLine = '这是自动生成的字幕'
    const lines = raw ? raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean) : []
    if (lines.length === 0) lines.push(defaultLine)

    const durationPerLine = 4
    const fallbackSegments = lines.map((line, index) => ({
        startTime: index * durationPerLine,
        endTime: (index + 1) * durationPerLine,
        text: line,
    }))

    const pad = (value: number, length: number = 2) => value.toString().padStart(length, '0')
    const formatTimestamp = (seconds: number) => {
        const h = Math.floor(seconds / 3600)
        const m = Math.floor((seconds % 3600) / 60)
        const s = Math.floor(seconds % 60)
        const ms = Math.floor((seconds % 1) * 1000)
        return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`
    }

    const srtContent = fallbackSegments
        .map((seg, idx) => `${idx + 1}\n${formatTimestamp(seg.startTime)} --> ${formatTimestamp(seg.endTime)}\n${seg.text}\n`)
        .join('\n')
    fs.writeFileSync(subtitlePath, srtContent, 'utf-8')
    return { success: true, data: { subtitlePath } }
}

handlers['get-video-duration'] = async (_ctx, videoPath: unknown) => {
    const vp = String(videoPath || '').trim()
    if (!vp) throw new Error('videoPath 涓虹┖')
    const duration = await getMediaDuration(vp)
    return { success: true, data: duration }
}

handlers['add-subtitles'] = async (_ctx, videoPath: unknown, subtitlePath: unknown) => {
    const vp = String(videoPath || '').trim()
    const sp = String(subtitlePath || '').trim()
    const outputDir = path.join(config.outputDir, 'video')
    ensureDir(outputDir)
    const outputPath = path.join(outputDir, `subtitled_${Date.now()}.mp4`)
    await burnSubtitles(vp, sp, outputPath)
    return { success: true, data: { videoPath: outputPath } }
}

handlers['add-bgm'] = async (_ctx, videoPath: unknown, bgmPath: unknown, volume: unknown) => {
    const vp = String(videoPath || '').trim()
    const bp = String(bgmPath || '').trim()
    const v = typeof volume === 'number' ? volume : parseFloat(String(volume || '0.2'))
    const outputDir = path.join(config.outputDir, 'video')
    ensureDir(outputDir)
    const outputPath = path.join(outputDir, `with_bgm_${Date.now()}.mp4`)
    await addBackgroundMusic(vp, bp, outputPath, { bgmVolume: Number.isFinite(v) ? v : 0.2 })
    return { success: true, data: { videoPath: outputPath } }
}

handlers['cloud-gpu-check-status'] = async () => {
    const { serverUrl, videoPort } = getCloudGpuRuntime()
    const localDataPath = path.join(getDataDir(), 'cloud_gpu_data')
    ensureDir(localDataPath)
    const status = await checkCloudGpuStatus({ serverUrl, videoPort, localDataPath })
    return { success: true, data: { ...status, endpoint: `${serverUrl}:${videoPort}` } }
}

handlers['cloud-gpu-get-avatars'] = async () => {
    const localDataPath = path.join(getDataDir(), 'cloud_gpu_data')
    ensureDir(localDataPath)
    const models = getCloudAvatarModels({ localDataPath })
    return { success: true, data: models }
}

handlers['cloud-gpu-delete-avatar'] = async (_ctx, modelId: unknown) => {
    const id = String(modelId || '').trim()
    if (!id) throw new Error('modelId 涓虹┖')
    const localDataPath = path.join(getDataDir(), 'cloud_gpu_data')
    ensureDir(localDataPath)
    const ok = deleteCloudAvatarModel({ localDataPath }, id)
    return { success: true, data: { ok } }
}

handlers['cloud-gpu-save-avatar'] = async (ctx, params: unknown) => {
    const p = (params || {}) as { videoBuffer?: string; avatarName?: string; remoteVideoPath?: string }
    const avatarName = (p.avatarName || '').trim()
    if (!avatarName) throw new Error('avatarName 涓虹┖')
    const videoBuffer = (p.videoBuffer || '').trim()
    if (!videoBuffer) throw new Error('videoBuffer 涓虹┖')

    const localDataPath = path.join(getDataDir(), 'cloud_gpu_data')
    const avatarsDir = path.join(localDataPath, 'cloud_avatars')
    const previewsDir = path.join(localDataPath, 'previews')
    ensureDir(avatarsDir)
    ensureDir(previewsDir)

    const modelId = uuidv4()
    const localPreviewPath = path.join(previewsDir, `${modelId}.mp4`)
    fs.writeFileSync(localPreviewPath, Buffer.from(videoBuffer, 'base64'))

    if (p.remoteVideoPath) {
        const model = {
            id: modelId,
            name: avatarName,
            remoteVideoPath: p.remoteVideoPath,
            localPreviewPath,
            createdAt: new Date().toISOString(),
        }
        fs.writeFileSync(path.join(avatarsDir, `${modelId}.json`), JSON.stringify(model, null, 2), 'utf-8')
        return { success: true, data: model }
    }

    const { serverUrl, videoPort } = getCloudGpuRuntime()
    if (serverUrl) {
        const uploaded = await uploadAvatarVideo(
            { serverUrl, videoPort, localDataPath },
            localPreviewPath,
            avatarName,
            (progress, message) => emitWs(ctx.clientId, 'cloud-gpu-progress', { progress, message }),
            modelId
        )
        return { success: true, data: uploaded }
    }

    const fallbackModel = {
        id: modelId,
        name: avatarName,
        remoteVideoPath: localPreviewPath,
        localPreviewPath,
        createdAt: new Date().toISOString(),
    }
    fs.writeFileSync(path.join(avatarsDir, `${modelId}.json`), JSON.stringify(fallbackModel, null, 2), 'utf-8')
    return { success: true, data: fallbackModel }
}

handlers['cloud-gpu-generate-video'] = async (ctx, params: unknown) => {
    const p = (params || {}) as { avatarVideoPath?: string; audioPath?: string }
    const avatarVideoPath = String(p.avatarVideoPath || '').trim()
    const audioPath = String(p.audioPath || '').trim()
    if (!avatarVideoPath) throw new Error('avatarVideoPath 涓虹┖')
    if (!audioPath) throw new Error('audioPath 涓虹┖')

    let tempAudioPath: string | null = null
    try {
        const tempDir = path.join(getDataDir(), 'cloud_gpu_data', 'temp_audio')
        tempAudioPath = convertAudioToDuixWavPcm16k(audioPath, tempDir)

        const videoPath = await generateCloudVideoWithLocalPaths(
            { ...getCloudGpuRuntime(), localDataPath: path.join(getDataDir(), 'cloud_gpu_data') } as any,
            avatarVideoPath,
            tempAudioPath,
            (progress: number, message: string) => emitWs(ctx.clientId, 'cloud-gpu-progress', { progress, message })
        )
        return { success: true, data: { videoPath } }
    } finally {
        if (tempAudioPath) {
            try { fs.unlinkSync(tempAudioPath) } catch { /* ignore */ }
        }
    }
}

handlers['cloud-gpu-synthesize-only'] = async (ctx, params: unknown) => {
    const p = (params || {}) as { avatarVideoPath?: string; audioPath?: string }
    const avatarVideoPath = String(p.avatarVideoPath || '').trim()
    const audioPath = String(p.audioPath || '').trim()
    if (!avatarVideoPath) throw new Error('avatarVideoPath 涓虹┖')
    if (!audioPath) throw new Error('audioPath 涓虹┖')

    const tempDir = path.join(getDataDir(), 'cloud_gpu_data', 'temp_audio')
    const tempAudioPath = convertAudioToDuixWavPcm16k(audioPath, tempDir)

    try {
        const result = await synthesizeCloudVideoOnly(
            { ...getCloudGpuRuntime(), localDataPath: path.join(getDataDir(), 'cloud_gpu_data') } as any,
            avatarVideoPath,
            tempAudioPath,
            (progress: number, message: string) => emitWs(ctx.clientId, 'cloud-gpu-progress', { progress, message })
        )
        return { success: true, data: { taskCode: result.taskCode, remoteVideoPath: result.remoteVideoPath, tempAudioPath } }
    } catch (e) {
        try { fs.unlinkSync(tempAudioPath) } catch { /* ignore */ }
        throw e
    }
}

handlers['cloud-gpu-download-video'] = async (ctx, params: unknown) => {
    const p = (params || {}) as { remoteVideoPath?: string; tempAudioPath?: string }
    const remoteVideoPath = String(p.remoteVideoPath || '').trim()
    const tempAudioPath = p.tempAudioPath ? String(p.tempAudioPath).trim() : undefined
    if (!remoteVideoPath) throw new Error('remoteVideoPath 涓虹┖')

    try {
        const videoPath = await downloadCloudVideoToLocal(
            { ...getCloudGpuRuntime(), localDataPath: path.join(getDataDir(), 'cloud_gpu_data') } as any,
            remoteVideoPath,
            tempAudioPath,
            (progress: number, message: string) => emitWs(ctx.clientId, 'cloud-gpu-download-progress', { progress, message })
        )
        return { success: true, data: { videoPath } }
    } finally {
        if (tempAudioPath) {
            try { fs.unlinkSync(tempAudioPath) } catch { /* ignore */ }
        }
    }
}

handlers['publish-cookie-list'] = async () => {
    const entries = readCookieStore()
        .map(e => ({ platform: e.platform, userName: e.userName, updatedAt: e.updatedAt, encrypted: e.encrypted }))
        .sort((a, b) => b.updatedAt - a.updatedAt)
    return { success: true, data: entries }
}

handlers['publish-cookie-save'] = async (_ctx, params: unknown) => {
    const p = (params || {}) as { platform?: string; userName?: string; cookieJson?: string }
    const platform = String(p.platform || '').trim()
    const userName = String(p.userName || '').trim()
    const cookieJson = String(p.cookieJson || '').trim()
    if (!platform) throw new Error('璇烽€夋嫨骞冲彴')
    if (!userName) throw new Error('请输入账号名称')
    if (!cookieJson) throw new Error('Cookie 涓虹┖')

    const entries = readCookieStore()
    const now = Date.now()
    const next = { platform, userName, value: cookieJson, encrypted: false, updatedAt: now }
    const merged = entries.filter(e => !(e.platform === platform && e.userName === userName))
    merged.unshift(next)
    writeCookieStore(merged)
    return { success: true, data: { encrypted: false, format: 'raw', cookieCount: 0 } }
}

handlers['publish-cookie-delete'] = async (_ctx, params: unknown) => {
    const p = (params || {}) as { platform?: string; userName?: string }
    const platform = String(p.platform || '').trim()
    const userName = String(p.userName || '').trim()
    if (!platform || !userName) throw new Error('鍙傛暟閿欒')
    const entries = readCookieStore()
    const next = entries.filter(e => !(e.platform === platform && e.userName === userName))
    writeCookieStore(next)
    return { success: true }
}

async function handleInvoke(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
        const body = (await readJsonBody(req, 200 * 1024 * 1024)) as InvokeRequestBody
        const channel = String(body.channel || '').trim()
        if (!channel) return writeJson(res, 400, { success: false, error: 'channel 涓虹┖' })
        const args = Array.isArray(body.args) ? body.args : []
        const clientId = body.clientId ? String(body.clientId) : undefined

        const handler = handlers[channel]
        if (!handler) return writeJson(res, 404, { success: false, error: `鏈煡 channel: ${channel}` })

        const result = await handler({ clientId }, ...args)
        return writeJson(res, 200, result)
    } catch (e: any) {
        const msg = e?.message || String(e)
        if (msg === 'Body too large') return writeJson(res, 413, { success: false, error: '请求体过大' })
        return writeJson(res, 500, { success: false, error: msg })
    }
}

async function handleUpload(req: http.IncomingMessage, res: http.ServerResponse) {
    const requestUrl = new URL(req.url || '/', 'http://localhost')
    const fileNameRaw =
        requestUrl.searchParams.get('filename') ||
        (req.headers['x-filename'] as string | undefined) ||
        `upload_${Date.now()}`
    const safeName = fileNameRaw.replace(/[\\\\/:*?"<>|]/g, '_')
    const uploadDir = path.join(config.outputDir, 'uploads')
    ensureDir(uploadDir)
    const filePath = path.join(uploadDir, `${Date.now()}_${safeName}`)

    const ws = fs.createWriteStream(filePath)
    req.pipe(ws)
    ws.on('finish', () => {
        writeJson(res, 200, { success: true, data: { filePath } })
    })
    ws.on('error', (err) => {
        writeJson(res, 500, { success: false, error: (err as any)?.message || String(err) })
    })
}

function handleFile(req: http.IncomingMessage, res: http.ServerResponse) {
    try {
        const requestUrl = new URL(req.url || '/', 'http://localhost')
        const rawPath = requestUrl.searchParams.get('path')
        if (!rawPath) return writeJson(res, 400, { success: false, error: 'path 涓虹┖' })
        const decoded = decodeURIComponent(rawPath)

        const dataDir = getDataDir()
        const resolved = path.resolve(decoded)
        const resolvedDataDir = path.resolve(dataDir)
        if (!isSubPath(resolvedDataDir, resolved) && resolvedDataDir !== resolved) {
            res.writeHead(403, { 'Access-Control-Allow-Origin': '*' })
            res.end('Forbidden')
            return
        }
        if (!fs.existsSync(resolved)) {
            res.writeHead(404, { 'Access-Control-Allow-Origin': '*' })
            res.end('Not Found')
            return
        }

        const stat = fs.statSync(resolved)
        const mime = guessMimeType(resolved)
        const range = req.headers.range
        if (!range) {
            res.writeHead(200, {
                'Content-Type': mime,
                'Content-Length': stat.size,
                'Accept-Ranges': 'bytes',
                'Access-Control-Allow-Origin': '*',
            })
            fs.createReadStream(resolved).pipe(res)
            return
        }

        const m = /^bytes=(\d+)-(\d+)?$/i.exec(range)
        if (!m) {
            res.writeHead(416, { 'Access-Control-Allow-Origin': '*' })
            res.end()
            return
        }
        const start = parseInt(m[1], 10)
        const end = m[2] ? parseInt(m[2], 10) : stat.size - 1
        if (start >= stat.size || end >= stat.size || start > end) {
            res.writeHead(416, { 'Access-Control-Allow-Origin': '*' })
            res.end()
            return
        }
        res.writeHead(206, {
            'Content-Type': mime,
            'Content-Length': end - start + 1,
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
        })
        fs.createReadStream(resolved, { start, end }).pipe(res)
    } catch {
        res.writeHead(500, { 'Access-Control-Allow-Origin': '*' })
        res.end('Internal Server Error')
    }
}

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse) {
    const urlObj = new URL(req.url || '/', 'http://localhost')
    const distDir = path.join(process.cwd(), 'dist')
    if (!fs.existsSync(distDir)) {
        res.writeHead(404)
        res.end('Not Found')
        return
    }

    const pathname = decodeURIComponent(urlObj.pathname)
    const filePath = pathname === '/' ? path.join(distDir, 'index.html') : path.join(distDir, pathname.replace(/^\//, ''))
    const resolved = path.resolve(filePath)
    const resolvedDist = path.resolve(distDir)
    if (!isSubPath(resolvedDist, resolved) && resolvedDist !== resolved) {
        res.writeHead(403)
        res.end('Forbidden')
        return
    }

    if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
        const indexPath = path.join(distDir, 'index.html')
        if (!fs.existsSync(indexPath)) {
            res.writeHead(404)
            res.end('Not Found')
            return
        }
        const html = fs.readFileSync(indexPath)
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(html)
        return
    }

    const mime = guessMimeType(resolved)
    res.writeHead(200, { 'Content-Type': mime })
    fs.createReadStream(resolved).pipe(res)
}

const server = http.createServer((req, res) => {
    const method = (req.method || 'GET').toUpperCase()
    const urlObj = new URL(req.url || '/', 'http://localhost')

    if (method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type, X-Client-Id, X-Filename',
            'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
        })
        res.end()
        return
    }

    if (urlObj.pathname === '/api/health') {
        return writeJson(res, 200, { ok: true })
    }

    if (urlObj.pathname === '/api/invoke' && method === 'POST') {
        return void handleInvoke(req, res)
    }

    if (urlObj.pathname === '/api/upload' && (method === 'POST' || method === 'PUT')) {
        return void handleUpload(req, res)
    }

    if (urlObj.pathname === '/api/file' && method === 'GET') {
        return void handleFile(req, res)
    }

    return void serveStatic(req, res)
})

const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
    const urlObj = new URL(req.url || '/', 'http://localhost')
    if (urlObj.pathname !== '/ws') {
        socket.destroy()
        return
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req)
    })
})

wss.on('connection', (ws, req) => {
    const urlObj = new URL(req.url || '/', 'http://localhost')
    const clientId = (urlObj.searchParams.get('clientId') || '').trim() || uuidv4()
    wsClients.set(clientId, ws)
    ws.send(JSON.stringify({ channel: 'ws-ready', args: [{ clientId }] }))

    ws.on('close', () => {
        if (wsClients.get(clientId) === ws) wsClients.delete(clientId)
    })
})

const PORT = parseInt((process.env.WEB_SERVER_PORT || '8787').trim(), 10) || 8787
const HOST = (process.env.WEB_SERVER_HOST || '127.0.0.1').trim() || '127.0.0.1'

server.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`[web-server] listening on http://${HOST}:${PORT}`)
    // eslint-disable-next-line no-console
    console.log(`[web-server] dataDir: ${getDataDir()}`)
})
