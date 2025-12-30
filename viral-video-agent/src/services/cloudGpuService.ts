/**
 * 云端 GPU 数字人服务
 * 
 * 连接远程 GPU 服务器（腾讯云/阿里云等），使用 Duix Avatar 生成数字人视频。
 * 用户只需：
 *   1. 上传形象视频（本地文件）
 *   2. 上传/录制音频
 *   3. 调用生成接口
 * 
 * GitHub: https://github.com/duixcom/Duix-Avatar
 */

import http from 'http'
import https from 'https'
import fs from 'fs'
import path from 'path'
import FormData from 'form-data'
import { replaceAudioTrack } from './ffmpegService'

class CloudGpuCancelledError extends Error {
    constructor(message: string = '已取消') {
        super(message)
        this.name = 'CloudGpuCancelledError'
    }
}

function isAbortLikeError(err: any): boolean {
    const msg = String(err?.message || '').toLowerCase()
    return err?.name === 'AbortError' || err?.name === 'CloudGpuCancelledError' || msg.includes('aborted') || msg.includes('cancel')
}

function throwIfAborted(signal?: AbortSignal) {
    if (signal?.aborted) throw new CloudGpuCancelledError()
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new CloudGpuCancelledError())
        const onAbort = () => {
            clearTimeout(timer)
            reject(new CloudGpuCancelledError())
        }
        const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort)
            resolve()
        }, ms)
        signal?.addEventListener('abort', onAbort, { once: true })
    })
}

const DEFAULT_DOWNLOAD_TIMEOUT_MS = (() => {
    const raw = (process.env.CLOUD_GPU_DOWNLOAD_TIMEOUT_MS || '').trim()
    const parsed = raw && /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 30 * 60 * 1000 // 30 分钟
})()

const DEFAULT_QUERY_TIMEOUT_MS = (() => {
    const raw = (process.env.CLOUD_GPU_QUERY_TIMEOUT_MS || '').trim()
    const parsed = raw && /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 120 * 1000 // 120 秒（跨境/弱网更稳）
})()

// 动态导入 uuid 避免 CommonJS require 报错
async function getUuidV4(): Promise<string> {
    const { v4 } = await new Function('return import("uuid")')()
    return v4()
}

// ============================================
// 配置接口
// ============================================

export interface CloudGpuConfig {
    /** GPU 服务器地址，如 http://123.45.67.89 */
    serverUrl: string
    /** 视频合成端口，默认 8383 */
    videoPort: number
    /** 本地数据目录（存储下载的视频） */
    localDataPath: string
}

export interface CloudAvatarModel {
    id: string
    name: string
    /** 服务器上的视频路径 */
    remoteVideoPath: string
    /** 本地预览视频路径 */
    localPreviewPath?: string
    createdAt: Date
}

export interface VideoGenerationTask {
    taskCode: string
    status: 'pending' | 'processing' | 'completed' | 'failed'
    progress: number
    videoUrl?: string
    errorMessage?: string
}

// ============================================
// 默认配置
// ============================================

const defaultConfig: CloudGpuConfig = {
    serverUrl: 'http://127.0.0.1',  // 需要用户配置为实际的 GPU 服务器 IP
    videoPort: 8383,
    localDataPath: '',  // 运行时设置
}

// ============================================
// HTTP 工具函数
// ============================================

/**
 * HTTP POST JSON 请求
 */
async function postJSON(url: string, data: object, timeout = 30000, retryCount = 0, signal?: AbortSignal): Promise<any> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new CloudGpuCancelledError())
        const urlObj = new URL(url)
        const protocol = urlObj.protocol === 'https:' ? https : http

        const postData = JSON.stringify(data)

        const req = protocol.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
            },
            timeout,
        }, (res) => {
            let responseData = ''
            res.on('data', chunk => responseData += chunk)
            res.on('end', () => {
                // 503 = 服务切换中，自动重试（最多等待 2 分钟）
                if (res.statusCode === 503 && retryCount < 12) {
                    console.log(`[cloudGpuService] Service switching, retry in 10s... (${retryCount + 1}/12)`)
                    setTimeout(() => {
                        if (signal?.aborted) return reject(new CloudGpuCancelledError())
                        postJSON(url, data, timeout, retryCount + 1, signal).then(resolve).catch(reject)
                    }, 10000)
                    return
                }

                try {
                    resolve(JSON.parse(responseData))
                } catch {
                    resolve(responseData)
                }
            })
        })

        const onAbort = () => {
            try { req.destroy(new CloudGpuCancelledError()) } catch { /* ignore */ }
        }
        signal?.addEventListener('abort', onAbort, { once: true })

        req.on('timeout', () => {
            req.destroy()
            reject(new Error('请求超时'))
        })
        req.on('error', (err) => {
            signal?.removeEventListener('abort', onAbort)
            if (isAbortLikeError(err)) reject(new CloudGpuCancelledError())
            else reject(err)
        })
        req.write(postData)
        req.end()
    })
}

/**
 * HTTP GET 请求
 */
async function getJSON(url: string, timeout = 30000, retryCount = 0, signal?: AbortSignal): Promise<any> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new CloudGpuCancelledError())
        const urlObj = new URL(url)
        const protocol = urlObj.protocol === 'https:' ? https : http

        const req = protocol.get(url, { timeout }, (res) => {
            let data = ''
            res.on('data', chunk => data += chunk)
            res.on('end', () => {
                // 503 = 服务切换中，自动重试（最多等待 2 分钟）
                if (res.statusCode === 503 && retryCount < 12) {
                    console.log(`[cloudGpuService] Service switching, retry in 10s... (${retryCount + 1}/12)`)
                    setTimeout(() => {
                        if (signal?.aborted) return reject(new CloudGpuCancelledError())
                        getJSON(url, timeout, retryCount + 1, signal).then(resolve).catch(reject)
                    }, 10000)
                    return
                }

                try {
                    resolve(JSON.parse(data))
                } catch {
                    resolve(data)
                }
            })
        })

        const onAbort = () => {
            try { req.destroy(new CloudGpuCancelledError()) } catch { /* ignore */ }
        }
        signal?.addEventListener('abort', onAbort, { once: true })

        req.on('timeout', () => {
            req.destroy()
            reject(new Error('请求超时'))
        })
        req.on('error', (err) => {
            signal?.removeEventListener('abort', onAbort)
            if (isAbortLikeError(err)) reject(new CloudGpuCancelledError())
            else reject(err)
        })
    })
}

/**
 * 上传文件到服务器
 */
async function uploadFile(
    url: string,
    filePath: string,
    fieldName: string = 'file',
    onProgress?: (percent: number) => void,
    remoteFileName?: string,
    retryCount: number = 0,
    signal?: AbortSignal
): Promise<any> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new CloudGpuCancelledError())
        const fileSize = fs.statSync(filePath).size
        const fileName = remoteFileName || path.basename(filePath)

        const urlObj = new URL(url)
        const protocol = urlObj.protocol === 'https:' ? https : http

        // 构建 multipart/form-data
        const boundary = `----FormBoundary${Date.now()}`
        const header = `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`
        const footer = `\r\n--${boundary}--\r\n`

        let settled = false
        const safeResolve = (value: any) => {
            if (settled) return
            settled = true
            resolve(value)
        }
        const safeReject = (error: Error) => {
            if (settled) return
            settled = true
            reject(error)
        }

        const req = protocol.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': Buffer.byteLength(header) + fileSize + Buffer.byteLength(footer),
            },
            timeout: 300000, // 5 分钟，避免大文件上传卡死
        }, (res) => {
            let data = ''
            res.on('data', chunk => data += chunk)
            res.on('end', () => {
                const statusCode = res.statusCode || 0
                // 503 = 服务切换中，自动重试（最多等 2 分钟）
                if (statusCode === 503 && retryCount < 12) {
                    console.log(`[cloudGpuService] Service switching (upload), retry in 10s... (${retryCount + 1}/12)`)
                    setTimeout(() => {
                        if (signal?.aborted) return safeReject(new CloudGpuCancelledError())
                        uploadFile(url, filePath, fieldName, onProgress, remoteFileName, retryCount + 1, signal).then(safeResolve).catch(safeReject)
                    }, 10000)
                    return
                }
                if (statusCode < 200 || statusCode >= 300) {
                    const snippet = (data || '').toString().slice(0, 200)
                    safeReject(new Error(`上传失败 (HTTP ${statusCode}) ${snippet ? `: ${snippet}` : ''}`))
                    return
                }

                try {
                    safeResolve(JSON.parse(data))
                } catch {
                    safeResolve(data)
                }
            })
        })

        req.on('timeout', () => {
            req.destroy()
            safeReject(new Error('请求超时'))
        })
        const onAbort = () => {
            try { req.destroy(new CloudGpuCancelledError()) } catch { /* ignore */ }
        }
        signal?.addEventListener('abort', onAbort, { once: true })

        req.on('error', (err) => {
            signal?.removeEventListener('abort', onAbort)
            if (isAbortLikeError(err)) safeReject(new CloudGpuCancelledError())
            else safeReject(err as Error)
        })

        // 写入 header
        req.write(header)

        // 流式写入文件
        const fileStream = fs.createReadStream(filePath)
        let uploaded = 0
        let lastPercent = -1

        fileStream.on('data', (chunk) => {
            if (signal?.aborted) {
                try { fileStream.destroy(new CloudGpuCancelledError()) } catch { /* ignore */ }
                try { req.destroy(new CloudGpuCancelledError()) } catch { /* ignore */ }
                return
            }
            uploaded += Buffer.isBuffer(chunk) ? chunk.length : chunk.length
            const pct = Math.round(uploaded / fileSize * 100)
            if (pct !== lastPercent) {
                lastPercent = pct
                onProgress?.(pct)
            }
        })

        fileStream.on('end', () => {
            req.write(footer)
            req.end()
        })
        fileStream.on('error', (err) => {
            req.destroy()
            if (isAbortLikeError(err)) safeReject(new CloudGpuCancelledError())
            else safeReject(err as Error)
        })

        fileStream.pipe(req, { end: false })
    })
}

/**
 * 下载文件
 */
async function downloadFile(
    url: string,
    outputPath: string,
    onProgress?: (percent: number) => void,
    timeoutMs: number = DEFAULT_DOWNLOAD_TIMEOUT_MS,
    signal?: AbortSignal
): Promise<void> {
    const maxRetries = 6
    const baseDelayMs = 1500

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            throwIfAborted(signal)
            await downloadFileOnceWithResume(url, outputPath, onProgress, timeoutMs, signal)
            return
        } catch (e: any) {
            if (e?.name === 'CloudGpuCancelledError') throw e
            const msg = e?.message || String(e)
            // 404 往往表示文件尚未落盘/尚未对外可下载；不在这里做长时间重试，让上层继续轮询再试
            if (String(msg).includes('HTTP 404')) throw e
            const isLast = attempt === maxRetries
            console.warn(`[CloudGPU] 下载失败，准备重试 (${attempt}/${maxRetries}):`, msg)
            if (isLast) throw e
            const backoffMs = Math.min(baseDelayMs * attempt, 8000)
            await delay(backoffMs, signal)
        }
    }
}

async function downloadFileOnceWithResume(
    url: string,
    outputPath: string,
    onProgress?: (percent: number) => void,
    timeoutMs: number = DEFAULT_DOWNLOAD_TIMEOUT_MS,
    signal?: AbortSignal
): Promise<void> {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new CloudGpuCancelledError())
        const protocol = url.startsWith('https') ? https : http
        let settled = false

        const safeReject = (err: any) => {
            if (settled) return
            settled = true
            reject(err)
        }

        const safeResolve = () => {
            if (settled) return
            settled = true
            resolve()
        }

        const existingBytes = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0
        const headers: Record<string, string> = {}
        if (existingBytes > 0) headers['Range'] = `bytes=${existingBytes}-`

        const req = protocol.get(url, { headers }, (response) => {
            // 处理重定向
            if (response.statusCode === 301 || response.statusCode === 302) {
                const redirectUrl = response.headers.location
                response.resume()
                if (redirectUrl) {
                    downloadFileOnceWithResume(redirectUrl, outputPath, onProgress, timeoutMs, signal).then(safeResolve).catch(safeReject)
                } else {
                    safeReject(new Error('重定向缺少 Location'))
                }
                return
            }

            const statusCode = response.statusCode || 0
            const isPartial = statusCode === 206
            const isOk = statusCode >= 200 && statusCode < 300
            if (!isOk) {
                response.resume()
                safeReject(new Error(`Download failed (HTTP ${statusCode})`))
                return
            }

            // 如果本地有部分文件，但服务端不支持 Range，会返回 200；此时重新下载
            if (existingBytes > 0 && !isPartial) {
                response.resume()
                try { fs.unlinkSync(outputPath) } catch { /* ignore */ }
                downloadFileOnceWithResume(url, outputPath, onProgress, timeoutMs, signal).then(safeResolve).catch(safeReject)
                return
            }

            let totalSize = parseInt(response.headers['content-length'] || '0', 10)
            const contentRange = response.headers['content-range']
            if (contentRange) {
                const m = String(contentRange).match(/\/(\d+)\s*$/)
                if (m) totalSize = parseInt(m[1], 10)
            } else if (existingBytes > 0 && totalSize > 0) {
                totalSize = existingBytes + totalSize
            }

            let downloaded = existingBytes
            const file = fs.createWriteStream(outputPath, { flags: existingBytes > 0 ? 'a' : 'w' })
            let lastPercent = -1

            file.on('error', (err) => {
                try { response.destroy() } catch { /* ignore */ }
                safeReject(err)
            })
            response.on('aborted', () => safeReject(new Error('下载连接被中断')))
            response.on('error', (err) => safeReject(err))

            response.on('data', (chunk: Buffer | string) => {
                if (signal?.aborted) {
                    try { response.destroy(new CloudGpuCancelledError()) } catch { /* ignore */ }
                    try { file.destroy(new CloudGpuCancelledError()) } catch { /* ignore */ }
                    return
                }
                downloaded += typeof chunk === 'string' ? chunk.length : chunk.length
                if (totalSize > 0) {
                    const pct = Math.max(0, Math.min(100, Math.round(downloaded / totalSize * 100)))
                    if (pct !== lastPercent) {
                        lastPercent = pct
                        onProgress?.(pct)
                    }
                }
            })

            response.pipe(file)
            file.on('finish', () => {
                file.close(() => safeResolve())
            })
        })

        const onAbort = () => {
            try { req.destroy(new CloudGpuCancelledError()) } catch { /* ignore */ }
        }
        signal?.addEventListener('abort', onAbort, { once: true })

        req.setTimeout(timeoutMs, () => {
            try { req.destroy(new Error('下载超时')) } catch { /* ignore */ }
        })
        req.on('error', (err) => {
            signal?.removeEventListener('abort', onAbort)
            if (isAbortLikeError(err)) safeReject(new CloudGpuCancelledError())
            else safeReject(err)
        })
    })
}

function uniqueStrings(items: string[]): string[] {
    const out: string[] = []
    const seen = new Set<string>()
    for (const it of items) {
        const v = (it || '').trim()
        if (!v) continue
        if (seen.has(v)) continue
        seen.add(v)
        out.push(v)
    }
    return out
}

function posixBasename(p: string): string {
    const s = (p || '').replace(/\\/g, '/')
    const parts = s.split('/').filter(Boolean)
    return parts.length ? parts[parts.length - 1] : s
}

function buildDownloadPathCandidates(serverPath: string): string[] {
    const raw = (serverPath || '').trim().replace(/\\/g, '/')
    const noQuery = raw.split('#')[0].split('?')[0]
    const candidates: string[] = []

    // 原始返回值
    candidates.push(raw)
    candidates.push(noQuery)

    // 从路径中提取 taskCode（UUID v4 形态），用于兼容不同服务端的产物命名
    const uuidMatch = noQuery.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
    const taskCode = uuidMatch ? uuidMatch[0] : ''

    // 去掉前缀后的相对路径
    if (noQuery.startsWith('/code/data/')) candidates.push(noQuery.slice('/code/data/'.length))
    if (noQuery.startsWith('code/data/')) candidates.push(noQuery.slice('code/data/'.length))
    if (noQuery.startsWith('/')) candidates.push(noQuery.slice(1))

    const base = posixBasename(noQuery)
    const baseLooksLikeFile = /\.[a-z0-9]+$/i.test(base)
    const baseLower = base.toLowerCase()

    // 常见：Duix 返回 "/<uuid>-r.mp4"，但文件实际在 "/code/data/temp/<uuid>-r.mp4"
    if (baseLooksLikeFile) {
        candidates.push(`temp/${base}`)
        candidates.push(`/temp/${base}`)
        candidates.push(`/code/data/temp/${base}`)
        candidates.push(`/code/data/${base}`)
    }

    // 兼容：/code/data/temp/{taskCode}/result.avi（或 result.mp4）但实际可下载的是 "/{taskCode}-r.mp4"
    if (taskCode && /\/code\/data\/temp\/[^/]+\//i.test(noQuery) && baseLower.startsWith('result.')) {
        candidates.push(`/${taskCode}-r.mp4`)
        candidates.push(`${taskCode}-r.mp4`)
        candidates.push(`/code/data/temp/${taskCode}-r.mp4`)
        candidates.push(`temp/${taskCode}-r.mp4`)
        // 有些环境会把容器内产物转成 mp4
        if (baseLower === 'result.avi') {
            candidates.push(noQuery.replace(/result\.avi$/i, 'result.mp4'))
            candidates.push(noQuery.replace(/result\.avi$/i, `${taskCode}-r.mp4`))
        }
    }

    // 如果返回的是 "/xxx.mp4" 这种根路径，也尝试映射到 /code/data/temp
    if (noQuery.startsWith('/') && baseLooksLikeFile && !noQuery.startsWith('/code/data/')) {
        candidates.push(`/code/data/temp${noQuery}`)
    }

    // 新格式：/code/data/temp/{taskCode}/result.avi
    // 尝试提取 temp/ 后面的相对路径
    const tempMatch = noQuery.match(/\/code\/data\/temp\/(.+)/)
    if (tempMatch) {
        candidates.push(`temp/${tempMatch[1]}`)
        candidates.push(tempMatch[1])
    }

    return uniqueStrings(candidates)
}

function looksLikeFilePath(value: unknown): value is string {
    if (typeof value !== 'string') return false
    const v = value.trim()
    return v.length > 0 && /\.[a-z0-9]{2,6}$/i.test(v.split(/[?#]/)[0])
}

function parseDuixQueryResult(taskCode: string, queryResult: any): {
    taskProgress?: number
    taskStatus?: any
    resultUrl?: string
    errorMessage?: string
} {
    const normalizedCode = (taskCode || '').trim()

    if (Array.isArray(queryResult)) {
        const entry = queryResult.find((row: any) => Array.isArray(row) && String(row[0] || '').trim() === normalizedCode)
            ?? queryResult.find((row: any) => Array.isArray(row) && row.length >= 2)

        if (Array.isArray(entry)) {
            const s = String(entry[1] ?? '').trim()
            const v = entry[2]
            const lower = s.toLowerCase()

            if (['s', 'success', 'done', 'completed'].includes(lower)) {
                // 有些实现成功时只返回一个数字（如时长），不会返回路径；这里用已知产物路径兜底
                const url = looksLikeFilePath(v) ? String(v) : `/code/data/temp/${normalizedCode}-r.mp4`
                return { taskStatus: s, resultUrl: url }
            }

            if (['f', 'fail', 'failed', 'error'].includes(lower)) {
                return { taskStatus: s, errorMessage: typeof v === 'string' ? v : '视频合成失败' }
            }

            const numeric = typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) : NaN)
            if (!Number.isNaN(numeric)) {
                const pct = numeric <= 1 ? numeric * 100 : numeric
                return { taskStatus: s, taskProgress: Math.max(0, Math.min(100, pct)) }
            }

            return { taskStatus: s }
        }
    }

    const payload = (queryResult && typeof queryResult === 'object' && queryResult.data && typeof queryResult.data === 'object')
        ? queryResult.data
        : queryResult

    const taskProgress = payload?.progress ?? queryResult.progress
    const taskStatus = payload?.status ?? queryResult.status
    const resultUrl = payload?.result || payload?.video_url || payload?.output_url || queryResult.result || queryResult.video_url || queryResult.output_url
    const errorMessage = payload?.msg || payload?.message || queryResult.msg || queryResult.message

    return { taskProgress, taskStatus, resultUrl, errorMessage }
}

async function downloadFromDuixFileApi(
    cfg: CloudGpuConfig,
    serverPath: string,
    outputPath: string,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal
): Promise<void> {
    const candidates = buildDownloadPathCandidates(serverPath)
    console.log(`[downloadFromDuixFileApi] 原始路径: ${serverPath}`)
    console.log(`[downloadFromDuixFileApi] 候选路径:`, candidates)
    let lastError: any

    for (let i = 0; i < candidates.length; i++) {
        const p = candidates[i]
        const downloadUrl = `${cfg.serverUrl}:${cfg.videoPort}/download?path=${encodeURIComponent(p)}`
        console.log(`[downloadFromDuixFileApi] 尝试下载 ${i + 1}/${candidates.length}: ${downloadUrl}`)
        try {
            await downloadFile(
                downloadUrl,
                outputPath,
                onProgress,
                DEFAULT_DOWNLOAD_TIMEOUT_MS,
                signal
            )
            console.log(`[downloadFromDuixFileApi] ✅ 下载成功: ${p}`)
            return
        } catch (e: any) {
            lastError = e
            console.log(`[downloadFromDuixFileApi] ❌ 失败: ${e?.message || e}`)
            continue
        }
    }

    throw lastError || new Error(`视频生成完成，但无法下载。服务器路径: ${serverPath}`)
}

// ============================================
// 核心 API
// ============================================

/**
 * 检查云端 GPU 服务器状态
 */
export async function checkCloudGpuStatus(config: Partial<CloudGpuConfig> = {}): Promise<{
    online: boolean
    message: string
}> {
    const cfg = { ...defaultConfig, ...config }

    if (!cfg.serverUrl || cfg.serverUrl === 'http://127.0.0.1') {
        return {
            online: false,
            message: '请先配置 GPU 服务器地址（CLOUD_GPU_SERVER_URL）',
        }
    }

    try {
        // 测试连接
        // 使用 30s 超时防止网络波动误报
        await getJSON(`${cfg.serverUrl}:${cfg.videoPort}/easy/query?code=health_check`, 30000)
        return {
            online: true,
            message: '服务器已连接',
        }
    } catch (error: any) {
        return {
            online: false,
            message: `无法连接服务器: ${error.message}`,
        }
    }
}

/**
 * 上传形象视频到服务器
 * 
 * 注意：Duix Avatar 需要视频存放在服务器的 /code/data 目录
 */
export async function uploadAvatarVideo(
    config: Partial<CloudGpuConfig>,
    localVideoPath: string,
    avatarName: string,
    onProgress?: (progress: number, message: string) => void,
    modelId?: string
): Promise<CloudAvatarModel> {
    const cfg = { ...defaultConfig, ...config }

    // 检查文件存在
    if (!fs.existsSync(localVideoPath)) {
        throw new Error(`视频文件不存在: ${localVideoPath}`)
    }

    onProgress?.(10, '正在上传形象视频...')

    const finalModelId = modelId || await getUuidV4()
    const ext = path.extname(localVideoPath)
    const remoteFileName = `avatar_${finalModelId}${ext}`

    // 调用服务器上传接口
    // 根据 Duix Avatar 架构，视频需要传到 /code/data 目录
    try {
        const uploadResult = await uploadFile(
            `${cfg.serverUrl}:${cfg.videoPort}/upload`,
            localVideoPath,
            'video',
            (percent) => {
                onProgress?.(10 + percent * 0.6, `上传中 ${percent}%`)
            },
            remoteFileName
        )

        onProgress?.(80, '上传完成，正在保存形象信息...')

        // 获取服务器返回的视频路径
        const remoteVideoPath = uploadResult?.path || uploadResult?.video_path || `/code/data/${remoteFileName}`

        // 保存模型信息到本地
        const model: CloudAvatarModel = {
            id: finalModelId,
            name: avatarName,
            remoteVideoPath,
            localPreviewPath: localVideoPath,
            createdAt: new Date(),
        }

        // 保存到本地 JSON
        const modelsDir = path.join(cfg.localDataPath, 'cloud_avatars')
        if (!fs.existsSync(modelsDir)) {
            fs.mkdirSync(modelsDir, { recursive: true })
        }
        fs.writeFileSync(
            path.join(modelsDir, `${finalModelId}.json`),
            JSON.stringify(model, null, 2)
        )

        onProgress?.(100, '形象保存成功！')
        return model

    } catch (error: any) {
        // 如果上传接口不存在，尝试直接使用本地路径方案
        // 某些部署模式下，视频是通过挂载目录共享的
        console.warn('上传接口调用失败，尝试使用本地路径模式:', error.message)

        // 假设视频需要手动获得服务器上的路径
        throw new Error(`上传失败: ${error.message}。请确认服务器支持文件上传，或将视频手动放到服务器的 /code/data 目录。`)
    }
}

/**
 * 获取已保存的云端形象列表
 */
export function getCloudAvatarModels(config: Partial<CloudGpuConfig> = {}): CloudAvatarModel[] {
    const cfg = { ...defaultConfig, ...config }
    const modelsDir = path.join(cfg.localDataPath, 'cloud_avatars')

    if (!fs.existsSync(modelsDir)) {
        return []
    }

    const models: CloudAvatarModel[] = []
    const files = fs.readdirSync(modelsDir).filter(f => f.endsWith('.json'))

    for (const file of files) {
        try {
            const content = fs.readFileSync(path.join(modelsDir, file), 'utf-8')
            models.push(JSON.parse(content))
        } catch {
            // 忽略损坏的文件
        }
    }

    return models.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
}

/**
 * 删除云端形象记录
 */
export function deleteCloudAvatarModel(config: Partial<CloudGpuConfig>, modelId: string): boolean {
    const cfg = { ...defaultConfig, ...config }
    const modelPath = path.join(cfg.localDataPath, 'cloud_avatars', `${modelId}.json`)

    if (fs.existsSync(modelPath)) {
        fs.unlinkSync(modelPath)
        return true
    }
    return false
}

/**
 * 生成数字人视频
 * 
 * 核心流程：
 *   1. 将音频上传到服务器（或使用共享目录）
 *   2. 调用 /easy/submit 提交视频合成任务
 *   3. 轮询 /easy/query 获取进度
 *   4. 下载生成的视频
 */
export async function generateCloudVideo(
    config: Partial<CloudGpuConfig>,
    model: CloudAvatarModel,
    audioPath: string,
    onProgress?: (progress: number, message: string) => void,
    signal?: AbortSignal
): Promise<string> {
    const cfg = { ...defaultConfig, ...config }

    // 检查音频文件
    if (!fs.existsSync(audioPath)) {
        throw new Error(`音频文件不存在: ${audioPath}`)
    }

    const taskCode = await getUuidV4()

    throwIfAborted(signal)
    onProgress?.(5, '正在上传音频到服务器...')

    // 尝试上传音频
    let remoteAudioPath: string
    try {
        const audioExt = path.extname(audioPath) || '.wav'
        const remoteAudioFileName = `audio_${taskCode}${audioExt}`
        const uploadResult = await uploadFile(
            `${cfg.serverUrl}:${cfg.videoPort}/upload`,
            audioPath,
            'audio',
            (percent) => {
                onProgress?.(5 + percent * 0.1, `上传音频 ${percent}%`)
            },
            remoteAudioFileName,
            0,
            signal
        )
        remoteAudioPath = uploadResult?.path || uploadResult?.audio_path || `/code/data/${remoteAudioFileName}`
    } catch (error: any) {
        // 远程云端场景下，本地路径无法被服务端容器访问；这里直接给出更明确的错误提示
        throw new Error(`音频上传失败：${error?.message || '未知错误'}。请确认服务端提供 /upload 接口，或将音频文件放入服务端容器可访问的 /code/data 目录。`)
    }

    onProgress?.(20, '正在提交视频合成任务...')

    // 提交合成任务
    const submitResult = await postJSON(`${cfg.serverUrl}:${cfg.videoPort}/easy/submit`, {
        audio_url: remoteAudioPath,
        video_url: model.remoteVideoPath,
        code: taskCode,
        chaofen: 0,           // 超分辨率，0 关闭
        watermark_switch: 0,  // 水印，0 关闭
        pn: 1,                // 固定值
    }, 30000, 0, signal)

    // 检查提交结果
    if (submitResult.code !== undefined && submitResult.code !== 0 && submitResult.code !== 200 && submitResult.code !== 10000) {
        throw new Error(submitResult.msg || submitResult.message || '提交任务失败')
    }

    onProgress?.(25, '任务已提交，正在合成视频...')

    // 轮询查询进度
    const maxAttempts = 180  // 最多等待 15 分钟
    const pollInterval = 5000  // 5 秒轮询一次

    for (let i = 0; i < maxAttempts; i++) {
        await delay(pollInterval, signal)
        throwIfAborted(signal)

        let queryResult: any
        try {
            queryResult = await getJSON(
                `${cfg.serverUrl}:${cfg.videoPort}/easy/query?code=${taskCode}`,
                DEFAULT_QUERY_TIMEOUT_MS,
                0,
                signal
            )
        } catch (error: any) {
            // 网络错误，继续轮询
            console.warn('查询进度失败，继续等待...', error.message)
            continue
        }

        // 检查完成状态
        // Duix Avatar 返回格式可能是 { code: 200, result: "视频路径" } 或 { status: "completed", video_url: "..." }
        const parsed = parseDuixQueryResult(taskCode, queryResult)
        const taskProgress = parsed.taskProgress
        const taskStatus = parsed.taskStatus
        const resultUrl = parsed.resultUrl

        if (resultUrl || taskStatus === 2 || taskProgress === 100) {
            const videoUrl = resultUrl || `/code/data/temp/${taskCode}-r.mp4`

            if (videoUrl) {
                onProgress?.(90, '视频合成完成，正在下载...')

                // 下载视频到本地
                const outputDir = path.join(cfg.localDataPath, 'generated_videos')
                if (!fs.existsSync(outputDir)) {
                    fs.mkdirSync(outputDir, { recursive: true })
                }

                const outputPath = path.join(outputDir, `digital_human_${Date.now()}.mp4`)

                // 判断是 URL 还是本地路径
                if (videoUrl.startsWith('http')) {
                    await downloadFile(videoUrl, outputPath, (percent) => {
                        onProgress?.(90 + percent * 0.1, `下载视频 ${percent}%`)
                    }, DEFAULT_DOWNLOAD_TIMEOUT_MS, signal)
                } else {
                    // 服务器返回的是服务器上的本地路径
                    // 需要通过下载接口获取
                    // 直接在下载阶段内重试，避免回到轮询循环（每次轮询有5s延迟）
                    const maxDownloadRetries = 12  // 最多等待 1 分钟（12 * 5s）
                    let downloadSuccess = false
                    let lastDownloadError: any

                    for (let downloadAttempt = 0; downloadAttempt < maxDownloadRetries; downloadAttempt++) {
                        try {
                            await downloadFromDuixFileApi(cfg, videoUrl, outputPath, (percent) => {
                                onProgress?.(90 + percent * 0.1, `下载视频 ${percent}%`)
                            }, signal)
                            downloadSuccess = true
                            break
                        } catch (e: any) {
                            lastDownloadError = e
                            const msg = String(e?.message || e)
                            if (e?.name === 'CloudGpuCancelledError') throw e
                            // 404 表示文件尚未落盘，等待后重试
                            if (msg.includes('HTTP 404') || msg.includes('file not found') || msg.includes('Download failed')) {
                                onProgress?.(90, `等待服务端写文件... (${downloadAttempt + 1}/${maxDownloadRetries})`)
                                await delay(5000, signal)
                                continue
                            }
                            // 其他错误，抛出
                            throw e
                        }
                    }

                    if (!downloadSuccess) {
                        // 尝试直接路径下载
                        try {
                            const directPath = videoUrl.startsWith('/') ? videoUrl : `/${videoUrl}`
                            await downloadFile(`${cfg.serverUrl}:${cfg.videoPort}${directPath}`, outputPath, undefined, DEFAULT_DOWNLOAD_TIMEOUT_MS, signal)
                            onProgress?.(100, '完成')
                            return outputPath
                        } catch {
                            // ignore and fall back
                        }

                        if (fs.existsSync(videoUrl)) {
                            fs.copyFileSync(videoUrl, outputPath)
                        } else {
                            throw lastDownloadError || new Error(`视频生成完成，但无法下载。服务器路径: ${videoUrl}`)
                        }
                    }
                }

                // 一些云端实现会返回“无声视频”（没有音轨或者音轨不可播放）；
                // 为了确保用户拿到的视频一定有声音，这里用本地音频强制回填一次。
                try {
                    onProgress?.(98, '正在合并音频...')
                    const muxedPath = outputPath.replace(/\.mp4$/i, '_with_audio.mp4')
                    await replaceAudioTrack(outputPath, audioPath, muxedPath)
                    try {
                        fs.unlinkSync(outputPath)
                    } catch {
                        // ignore
                    }
                    fs.renameSync(muxedPath, outputPath)
                } catch (e: any) {
                    console.warn('合并音频失败，返回原视频:', e?.message || e)
                }

                onProgress?.(100, '完成！')
                return outputPath
            }
        }

        // 检查失败状态
        if (
            queryResult.code === -1 ||
            queryResult.status === 'failed' ||
            taskStatus === 3 ||
            (typeof taskStatus === 'string' && ['f', 'fail', 'failed', 'error'].includes(taskStatus.toLowerCase()))
        ) {
            throw new Error(parsed.errorMessage || queryResult.msg || queryResult.message || '视频合成失败')
        }

        // 更新进度（估算）
        const estimatedProgress = Math.min(25 + (i / maxAttempts) * 60, 85)
        const progressPercent = typeof taskProgress === 'number' ? taskProgress : estimatedProgress
        onProgress?.(Math.round(progressPercent), `合成中 ${Math.round(progressPercent)}%...`)
    }

    throw new Error('视频合成超时（超过 15 分钟），请检查服务器状态')
}

/**
 * 使用本地路径模式生成视频
 * 
 * 适用于服务器和客户端共享挂载目录的场景
 */
export async function generateCloudVideoWithLocalPaths(
    config: Partial<CloudGpuConfig>,
    avatarVideoPath: string,
    audioPath: string,
    onProgress?: (progress: number, message: string) => void,
    signal?: AbortSignal
): Promise<string> {
    const cfg = { ...defaultConfig, ...config }

    // 创建一个临时的模型对象
    const tempModel: CloudAvatarModel = {
        id: 'temp',
        name: 'temp',
        remoteVideoPath: avatarVideoPath,
        createdAt: new Date(),
    }

    return generateCloudVideo(cfg, tempModel, audioPath, onProgress, signal)
}

/**
 * 仅合成视频（不下载）
 * 
 * 返回服务端视频路径，用于后续手动下载。
 * 这样可以区分"合成阶段"和"下载阶段"，便于定位瓶颈。
 */
export async function synthesizeCloudVideoOnly(
    config: Partial<CloudGpuConfig>,
    avatarVideoPath: string,
    audioPath: string,
    onProgress?: (progress: number, message: string) => void,
    signal?: AbortSignal
): Promise<{ taskCode: string; remoteVideoPath: string }> {
    const cfg = { ...defaultConfig, ...config }

    // 检查音频文件
    if (!fs.existsSync(audioPath)) {
        throw new Error(`音频文件不存在: ${audioPath}`)
    }

    const taskCode = await getUuidV4()

    throwIfAborted(signal)
    onProgress?.(5, '正在上传音频到服务器...')

    // 尝试上传音频
    let remoteAudioPath: string
    try {
        const audioExt = path.extname(audioPath) || '.wav'
        const remoteAudioFileName = `audio_${taskCode}${audioExt}`
        const uploadResult = await uploadFile(
            `${cfg.serverUrl}:${cfg.videoPort}/upload`,
            audioPath,
            'audio',
            (percent) => {
                onProgress?.(5 + percent * 0.15, `上传音频 ${percent}%`)
            },
            remoteAudioFileName,
            0,
            signal
        )
        remoteAudioPath = uploadResult?.path || uploadResult?.audio_path || `/code/data/${remoteAudioFileName}`
    } catch (error: any) {
        throw new Error(`音频上传失败：${error?.message || '未知错误'}`)
    }

    onProgress?.(25, '正在提交视频合成任务...')

    // 提交合成任务
    const submitResult = await postJSON(`${cfg.serverUrl}:${cfg.videoPort}/easy/submit`, {
        audio_url: remoteAudioPath,
        video_url: avatarVideoPath,
        code: taskCode,
        chaofen: 0,
        watermark_switch: 0,
        pn: 1,
    }, 30000, 0, signal)

    if (submitResult.code !== undefined && submitResult.code !== 0 && submitResult.code !== 200 && submitResult.code !== 10000) {
        throw new Error(submitResult.msg || submitResult.message || '提交任务失败')
    }

    onProgress?.(30, '任务已提交，正在合成视频...')

    // 轮询查询进度
    const maxAttempts = 180
    const pollInterval = 5000

    for (let i = 0; i < maxAttempts; i++) {
        await delay(pollInterval, signal)
        throwIfAborted(signal)

        let queryResult: any
        try {
            queryResult = await getJSON(
                `${cfg.serverUrl}:${cfg.videoPort}/easy/query?code=${taskCode}`,
                DEFAULT_QUERY_TIMEOUT_MS,
                0,
                signal
            )
        } catch (error: any) {
            console.warn('查询进度失败，继续等待...', error.message)
            continue
        }

        // 添加日志以便调试
        console.log(`[synthesizeCloudVideoOnly] 轮询 ${i + 1}/${maxAttempts}, 原始返回:`, JSON.stringify(queryResult))

        const parsed = parseDuixQueryResult(taskCode, queryResult)
        const taskProgress = parsed.taskProgress
        const taskStatus = parsed.taskStatus
        const resultUrl = parsed.resultUrl

        console.log(`[synthesizeCloudVideoOnly] 解析结果: progress=${taskProgress}, status=${taskStatus}, resultUrl=${resultUrl}`)

        // 合成完成
        if (resultUrl || taskStatus === 2 || taskProgress === 100) {
            const videoUrl = resultUrl || `/code/data/temp/${taskCode}-r.mp4`
            console.log(`[synthesizeCloudVideoOnly] ✅ 合成完成! videoUrl=${videoUrl}`)
            onProgress?.(100, '✅ 合成完成！点击下方按钮下载视频')
            return { taskCode, remoteVideoPath: videoUrl }
        }

        // 失败
        if (
            queryResult.code === -1 ||
            queryResult.status === 'failed' ||
            taskStatus === 3 ||
            (typeof taskStatus === 'string' && ['f', 'fail', 'failed', 'error'].includes(taskStatus.toLowerCase()))
        ) {
            throw new Error(parsed.errorMessage || queryResult.msg || queryResult.message || '视频合成失败')
        }

        // 更新进度
        const estimatedProgress = Math.min(30 + (i / maxAttempts) * 65, 95)
        const progressPercent = typeof taskProgress === 'number' ? taskProgress : estimatedProgress
        onProgress?.(Math.round(progressPercent), `合成中 ${Math.round(progressPercent)}%...`)
    }

    throw new Error('视频合成超时（超过 15 分钟），请检查服务器状态')
}

/**
 * 从服务器下载合成好的视频到本地
 * 
 * 配合 synthesizeCloudVideoOnly 使用，分离合成和下载阶段。
 */
export async function downloadCloudVideoToLocal(
    config: Partial<CloudGpuConfig>,
    remoteVideoPath: string,
    localAudioPathForMux?: string,
    onProgress?: (progress: number, message: string) => void,
    signal?: AbortSignal
): Promise<string> {
    const cfg = { ...defaultConfig, ...config }

    let remotePath = remoteVideoPath

    // 兼容：某些服务端在 query 返回的 result 与 SDK/客户端缓存的路径不一致（例如 result.avi vs {taskCode}-r.mp4）
    // 如遇到这类路径，先尝试通过 /easy/query 反查真实可下载的 result，再进入下载重试循环。
    try {
        const m = String(remotePath || '').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
        const taskCode = m ? m[0] : ''
        const normalized = String(remotePath || '').replace(/\\/g, '/')
        const looksLikeDirectArtifact = /(^|\/)[0-9a-f-]{36}-r\.[a-z0-9]{2,6}$/i.test(normalized)
        const looksLikeResultInFolder = /\/code\/data\/temp\/[0-9a-f-]{36}\/result\.[a-z0-9]{2,6}$/i.test(normalized)

        if (cfg.serverUrl && taskCode && (looksLikeResultInFolder || (!looksLikeDirectArtifact && normalized.includes(taskCode)))) {
            const queryResult = await getJSON(
                `${cfg.serverUrl}:${cfg.videoPort}/easy/query?code=${taskCode}`,
                DEFAULT_QUERY_TIMEOUT_MS,
                0,
                signal
            )
            const parsed = parseDuixQueryResult(taskCode, queryResult)
            if (parsed?.resultUrl && looksLikeFilePath(parsed.resultUrl)) {
                console.log(`[downloadCloudVideoToLocal] 反查 resultUrl 成功: ${parsed.resultUrl} (from ${remotePath})`)
                remotePath = String(parsed.resultUrl)
            }
        }
    } catch (e: any) {
        console.warn('[downloadCloudVideoToLocal] 反查下载路径失败，继续使用原始路径:', e?.message || e)
    }

    console.log(`[downloadCloudVideoToLocal] 开始下载(云端->本地), 远程路径: ${remotePath}`)
    onProgress?.(0, '准备下载（云端->本地）...')

    const outputDir = path.join(cfg.localDataPath, 'generated_videos')
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
    }

    const outputPath = path.join(outputDir, `digital_human_${Date.now()}.mp4`)
    console.log(`[downloadCloudVideoToLocal] 本地目标路径(下载中，文件可能会先出现但未完成): ${outputPath}`)

    // 直接在下载阶段内重试
    const maxDownloadRetries = 12
    let downloadSuccess = false
    let lastDownloadError: any
    let lastLoggedPercent = -1  // 用于节流日志输出

    for (let downloadAttempt = 0; downloadAttempt < maxDownloadRetries; downloadAttempt++) {
        console.log(`[downloadCloudVideoToLocal] 下载尝试 ${downloadAttempt + 1}/${maxDownloadRetries}`)
        onProgress?.(0, `正在下载（云端->本地）... (尝试 ${downloadAttempt + 1}/${maxDownloadRetries})`)
        try {
            throwIfAborted(signal)
            await downloadFromDuixFileApi(cfg, remotePath, outputPath, (percent) => {
                // 只在进度变化时输出日志
                if (percent !== lastLoggedPercent) {
                    console.log(`[downloadCloudVideoToLocal] 下载进度: ${percent}%`)
                    lastLoggedPercent = percent
                }
                onProgress?.(percent, `下载视频（云端->本地） ${percent}%`)
            }, signal)
            downloadSuccess = true
            console.log(`[downloadCloudVideoToLocal] ✅ 下载成功!`)
            break
        } catch (e: any) {
            lastDownloadError = e
            const msg = String(e?.message || e)
            console.log(`[downloadCloudVideoToLocal] ❌ 下载失败: ${msg}`)
            if (e?.name === 'CloudGpuCancelledError') throw e
            if (msg.includes('HTTP 404') || msg.includes('file not found') || msg.includes('Download failed')) {
                onProgress?.(0, `等待服务端写文件... (${downloadAttempt + 1}/${maxDownloadRetries})`)
                await delay(5000, signal)
                continue
            }
            throw e
        }
    }

    if (!downloadSuccess) {
        // 尝试直接路径下载
        try {
            const directPath = remotePath.startsWith('/') ? remotePath : `/${remotePath}`
            await downloadFile(`${cfg.serverUrl}:${cfg.videoPort}${directPath}`, outputPath, undefined, DEFAULT_DOWNLOAD_TIMEOUT_MS, signal)
        } catch {
            if (fs.existsSync(remotePath)) {
                fs.copyFileSync(remotePath, outputPath)
            } else {
                throw lastDownloadError || new Error(`无法下载视频。服务器路径: ${remotePath}`)
            }
        }
    }

    // 如果提供了音频路径，合并音频
    if (localAudioPathForMux && fs.existsSync(localAudioPathForMux)) {
        try {
            onProgress?.(95, '正在合并音频...')
            const muxedPath = outputPath.replace(/\.mp4$/i, '_with_audio.mp4')
            await replaceAudioTrack(outputPath, localAudioPathForMux, muxedPath)
            try {
                fs.unlinkSync(outputPath)
            } catch {
                // ignore
            }
            fs.renameSync(muxedPath, outputPath)
        } catch (e: any) {
            console.warn('合并音频失败，返回原视频:', e?.message || e)
        }
    }

    onProgress?.(100, '✅ 下载完成！')
    return outputPath
}
