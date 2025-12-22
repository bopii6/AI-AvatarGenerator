import fs from 'fs'
import path from 'path'
import http from 'http'
import https from 'https'

const DEFAULT_HTTP_TIMEOUT_MS = 120_000
const DEFAULT_DOWNLOAD_TIMEOUT_MS = 300_000

function safeTrim(input: string | undefined | null): string {
    return (input || '').toString().trim()
}

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
    const root = safeTrim(cfg.serverUrl).replace(/\/+$/, '')
    if (!root) throw new Error('CLOUD_VOICE_SERVER_URL 未配置')
    return `${root}:${cfg.port}`
}

function requestJSON(url: string, method: 'GET' | 'POST', body?: any, timeoutMs: number = DEFAULT_HTTP_TIMEOUT_MS): Promise<any> {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http
        const payload = body ? JSON.stringify(body) : undefined

        const makeRequest = (retryCount: number = 0) => {
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

                    // 503 = 服务切换中，自动重试（最多等待 2 分钟）
                    if (status === 503 && retryCount < 12) {
                        console.log(`[cloudVoiceService] Service switching, retry in 10s... (${retryCount + 1}/12)`)
                        setTimeout(() => makeRequest(retryCount + 1), 10000)
                        return
                    }

                    if (status >= 200 && status < 300) resolve(parsed)
                    else reject(new Error(typeof parsed === 'string' ? parsed : (parsed?.message || parsed?.error || `HTTP ${status}`)))
                })
            })
            req.on('timeout', () => {
                req.destroy(new Error('请求超时'))
            })
            req.on('error', reject)
            if (payload) req.write(payload)
            req.end()
        }

        makeRequest()
    })
}

function requestMultipart(
    url: string,
    fileField: string,
    filePath: string,
    fields: Record<string, string>,
    timeoutMs: number = DEFAULT_DOWNLOAD_TIMEOUT_MS,
    retryCount: number = 0
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

                // 503 = 服务切换中，自动重试（最多等 2 分钟）
                if (status === 503 && retryCount < 12) {
                    console.log(`[cloudVoiceService] Service switching (multipart), retry in 10s... (${retryCount + 1}/12)`)
                    setTimeout(() => {
                        requestMultipart(url, fileField, filePath, fields, timeoutMs, retryCount + 1).then(resolve).catch(reject)
                    }, 10000)
                    return
                }

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
                try { file.close() } catch { /* ignore */ }
                try { fs.unlinkSync(outputPath) } catch { /* ignore */ }
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
            try { file.close() } catch { /* ignore */ }
            try { fs.unlinkSync(outputPath) } catch { /* ignore */ }
            reject(err)
        })
    })
}

function resolveAudioUrl(cfg: CloudVoiceConfig, audioUrl: string): string {
    const trimmed = safeTrim(audioUrl)
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

function getCloudGpuDownloadBase(): { baseUrl: string; videoPort: number } | null {
    const rawGpuUrl = safeTrim(process.env.CLOUD_GPU_SERVER_URL)
    const rawPort = safeTrim(process.env.CLOUD_GPU_VIDEO_PORT)
    const videoPort = rawPort && /^\d+$/.test(rawPort) ? parseInt(rawPort, 10) : 8383
    if (!rawGpuUrl) return null
    const base = rawGpuUrl.replace(/\/+$/, '').replace(/:\d+$/, '')
    if (!base) return null
    return { baseUrl: base, videoPort }
}

function posixBasename(p: string): string {
    const s = safeTrim(p).replace(/\\/g, '/')
    const parts = s.split('/').filter(Boolean)
    return parts.length ? parts[parts.length - 1] : s
}

function uniqueStrings(items: string[]): string[] {
    const out: string[] = []
    const seen = new Set<string>()
    for (const it of items) {
        const v = safeTrim(it)
        if (!v) continue
        if (seen.has(v)) continue
        seen.add(v)
        out.push(v)
    }
    return out
}

function buildAudioPathCandidates(serverPath: string): string[] {
    const raw = safeTrim(serverPath).replace(/\\/g, '/')
    const noQuery = raw.split('#')[0].split('?')[0]
    const candidates: string[] = []

    candidates.push(raw)
    candidates.push(noQuery)

    if (noQuery.startsWith('/code/data/')) candidates.push(noQuery.slice('/code/data/'.length))
    if (noQuery.startsWith('code/data/')) candidates.push(noQuery.slice('code/data/'.length))
    if (noQuery.startsWith('/')) candidates.push(noQuery.slice(1))

    const base = posixBasename(noQuery)
    const baseLooksLikeFile = /\.[a-z0-9]+$/i.test(base)

    if (baseLooksLikeFile) {
        candidates.push(`temp/${base}`)
        candidates.push(`/temp/${base}`)
        candidates.push(`/code/data/temp/${base}`)
        candidates.push(`/code/data/${base}`)
    }

    if (noQuery.startsWith('/') && baseLooksLikeFile && !noQuery.startsWith('/code/data/')) {
        candidates.push(`/code/data/temp${noQuery}`)
    }

    return uniqueStrings(candidates)
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

    try {
        await downloadFile(finalUrl, outPath)
        return outPath
    } catch (e: any) {
        // 兼容一些服务端返回“容器内路径”（如 /code/data/xxx.wav），该路径并不一定在 9090 端口提供静态下载；
        // 这里尝试复用 GPU 文件服务（8383 /download?path=...）进行下载。
        const raw = safeTrim(audioUrl)
        const likelyServerPath = raw.startsWith('/') && (raw.includes('/code/') || raw.includes('/code/data') || raw.endsWith('.wav') || raw.endsWith('.mp3'))
        const gpu = getCloudGpuDownloadBase()
        const statusText = safeTrim(e?.message)
        const is404 = statusText.includes('HTTP 404')

        if (likelyServerPath && gpu && is404) {
            let lastErr: any = e
            const candidates = buildAudioPathCandidates(raw)
            for (const p of candidates) {
                try {
                    await downloadFile(`${gpu.baseUrl}:${gpu.videoPort}/download?path=${encodeURIComponent(p)}`, outPath)
                    return outPath
                } catch (err: any) {
                    lastErr = err
                    continue
                }
            }
            throw lastErr
        }

        throw e
    }
    return outPath
}
