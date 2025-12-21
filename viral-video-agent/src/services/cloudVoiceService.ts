import fs from 'fs'
import path from 'path'
import http from 'http'
import https from 'https'

const DEFAULT_HTTP_TIMEOUT_MS = 120_000
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 300_000

export type CloudVoiceConfig = {
    serverUrl?: string // e.g. http://1.2.3.4
    port: number // e.g. 9090
    deviceId: string
    localDataPath: string
}

export type CloudVoiceModel = {
    id: string
    name: string
    status: 'pending' | 'training' | 'ready' | 'failed'
    createdAt?: string
    updatedAt?: string
    error?: string
}

function baseUrl(cfg: CloudVoiceConfig) {
    const root = (cfg.serverUrl || '').trim().replace(/\/+$/, '')
    if (!root) throw new Error('CLOUD_VOICE_SERVER_URL 未配置')
    return `${root}:${cfg.port}`
}

function requestJSON(url: string, method: 'GET' | 'POST', body?: any, timeoutMs: number = DEFAULT_HTTP_TIMEOUT_MS): Promise<any> {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http
        const payload = body ? JSON.stringify(body) : undefined

        const req = protocol.request(url, {
            method,
            timeout: timeoutMs,
            headers: {
                'Content-Type': 'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
            },
        }, (res) => {
            let data = ''
            res.on('data', (c) => data += c.toString())
            res.on('end', () => {
                const status = res.statusCode || 0
                let parsed: any = data
                try { parsed = data ? JSON.parse(data) : {} } catch { /* ignore */ }
                if (status >= 200 && status < 300) resolve(parsed)
                else reject(new Error(typeof parsed === 'string' ? parsed : (parsed?.message || `HTTP ${status}`)))
            })
        })
        req.on('timeout', () => {
            req.destroy(new Error('请求超时'))
        })
        req.on('error', reject)
        if (payload) req.write(payload)
        req.end()
    })
}

function requestMultipart(
    url: string,
    fileField: string,
    filePath: string,
    fields: Record<string, string>,
    timeoutMs: number = DEFAULT_DOWNLOAD_TIMEOUT_MS
): Promise<any> {
    // We avoid adding extra deps in src/services; build multipart by hand (small payloads only).
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http
        const boundary = `----vva-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`

        const fileName = path.basename(filePath)
        const fileBuf = fs.readFileSync(filePath)
        const headParts: Buffer[] = []

        for (const [k, v] of Object.entries(fields)) {
            headParts.push(Buffer.from(
                `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="${k}"\r\n\r\n` +
                `${v}\r\n`
            ))
        }

        headParts.push(Buffer.from(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\n` +
            `Content-Type: application/octet-stream\r\n\r\n`
        ))

        const tail = Buffer.from(`\r\n--${boundary}--\r\n`)
        const body = Buffer.concat([...headParts, fileBuf, tail])

        const req = protocol.request(url, {
            method: 'POST',
            timeout: timeoutMs,
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length,
            },
        }, (res) => {
            let data = ''
            res.on('data', (c) => data += c.toString())
            res.on('end', () => {
                const status = res.statusCode || 0
                let parsed: any = data
                try { parsed = data ? JSON.parse(data) : {} } catch { /* ignore */ }
                if (status >= 200 && status < 300) resolve(parsed)
                else reject(new Error(typeof parsed === 'string' ? parsed : (parsed?.message || `HTTP ${status}`)))
            })
        })
        req.on('timeout', () => {
            req.destroy(new Error('请求超时'))
        })
        req.on('error', reject)
        req.write(body)
        req.end()
    })
}

async function downloadFile(url: string, outputPath: string, timeoutMs: number = DEFAULT_DOWNLOAD_TIMEOUT_MS): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http
        const file = fs.createWriteStream(outputPath)
        const req = protocol.get(url, { timeout: timeoutMs }, (res) => {
            if ((res.statusCode || 0) >= 400) {
                reject(new Error(`下载失败 HTTP ${res.statusCode}`))
                res.resume()
                return
            }
            res.pipe(file)
            file.on('finish', () => file.close(() => resolve()))
        })

        req.on('timeout', () => {
            req.destroy(new Error('下载超时'))
        })
        req.on('error', (err) => {
            try { fs.unlinkSync(outputPath) } catch { /* ignore */ }
            reject(err)
        })
    })
}

function resolveAudioUrl(cfg: CloudVoiceConfig, audioUrl: string): string {
    const trimmed = (audioUrl || '').trim()
    if (!trimmed) return trimmed

    // Relative URL => same host
    if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
        return `${baseUrl(cfg)}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`
    }

    // Absolute URL => if server mistakenly returns localhost/0.0.0.0, rewrite to configured host.
    try {
        const u = new URL(trimmed)
        if (u.hostname === '127.0.0.1' || u.hostname === 'localhost' || u.hostname === '0.0.0.0') {
            return `${baseUrl(cfg)}${u.pathname}${u.search}`
        }
    } catch {
        // ignore parse error, return as-is
    }

    return trimmed
}

export async function checkCloudVoiceStatus(cfg: CloudVoiceConfig): Promise<{ online: boolean; message?: string }> {
    try {
        const url = `${baseUrl(cfg)}/health`
        const res = await requestJSON(url, 'GET', undefined, 30_000)
        return { online: true, message: res?.message || 'ok' }
    } catch (e: any) {
        return { online: false, message: e.message }
    }
}

export async function listVoiceModels(cfg: CloudVoiceConfig): Promise<CloudVoiceModel[]> {
    const url = `${baseUrl(cfg)}/v1/voices?device_id=${encodeURIComponent(cfg.deviceId)}`
    const res = await requestJSON(url, 'GET')
    const items = res?.data || res?.voices || res
    if (!Array.isArray(items)) return []
    return items
}

export async function trainVoiceModel(cfg: CloudVoiceConfig, params: { name: string; audioPath: string }): Promise<{ voiceId: string }> {
    const url = `${baseUrl(cfg)}/v1/voices/train`
    const res = await requestMultipart(url, 'audio', params.audioPath, {
        device_id: cfg.deviceId,
        name: params.name,
    })
    const voiceId = res?.data?.voiceId || res?.voiceId || res?.id
    if (!voiceId) throw new Error('训练接口未返回 voiceId')
    return { voiceId }
}

export async function getVoiceModel(cfg: CloudVoiceConfig, voiceId: string): Promise<CloudVoiceModel> {
    const url = `${baseUrl(cfg)}/v1/voices/${encodeURIComponent(voiceId)}?device_id=${encodeURIComponent(cfg.deviceId)}`
    const res = await requestJSON(url, 'GET')
    return res?.data || res
}

export async function synthesizeWithVoice(cfg: CloudVoiceConfig, params: { voiceId: string; text: string }): Promise<string> {
    const url = `${baseUrl(cfg)}/v1/tts`
    const res = await requestJSON(url, 'POST', { device_id: cfg.deviceId, voice_id: params.voiceId, text: params.text })

    const audioUrl = res?.data?.audioUrl || res?.audioUrl || res?.audio_url
    if (!audioUrl) throw new Error('合成接口未返回音频地址')

    const outDir = path.join(cfg.localDataPath, 'audio')
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
    const outPath = path.join(outDir, `cloud_voice_${params.voiceId}_${Date.now()}.wav`)

    const finalUrl = resolveAudioUrl(cfg, audioUrl)
    await downloadFile(finalUrl, outPath)
    return outPath
}
