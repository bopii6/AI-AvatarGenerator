/**
 * AI 封面生成服务
 * 使用阿里通义万相生成封面图片
 */

import crypto from 'crypto'
import https from 'https'
import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { generateTitles, HunyuanConfig } from './hunyuanService'

// eslint-disable-next-line @typescript-eslint/no-var-requires
let ffmpegPath = require('ffmpeg-static') as string
if (ffmpegPath.includes('app.asar') && !ffmpegPath.includes('app.asar.unpacked')) {
    ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked')
}

export interface WanxiangConfig {
    accessKeyId: string
    accessKeySecret: string
}

function runFFmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        console.log(`[FFmpeg] 使用路径: ${ffmpegPath}`)
        console.log(`[FFmpeg] 参数: ${args.join(' ')}`)

        const proc = spawn(ffmpegPath, args, { stdio: 'pipe' })
        let stderr = ''
        proc.stderr.on('data', (data) => {
            stderr += data.toString()
        })

        proc.on('close', (code) => {
            if (code === 0) return resolve()
            const trimmed = stderr.length > 4000 ? stderr.slice(-4000) : stderr
            reject(new Error(`FFmpeg failed with code ${code}: ${trimmed}`))
        })

        proc.on('error', reject)
    })
}

function toFfmpegFilterPath(filePath: string): string {
    // FFmpeg filter args need escaping for Windows drive colons.
    // Example: C:/path/file.txt => C\\:/path/file.txt
    return filePath.replace(/\\/g, '/').replace(/:/g, '\\:')
}

function wrapTitleLines(title: string, maxCharsPerLine: number, maxLines: number): string[] {
    const trimmed = (title || '').trim()
    if (!trimmed) return ['爆款封面']

    const chars = Array.from(trimmed)
    const lines: string[] = []
    let idx = 0

    while (idx < chars.length && lines.length < maxLines) {
        const remaining = chars.length - idx
        const take = Math.min(maxCharsPerLine, remaining)
        const lineChars = chars.slice(idx, idx + take)
        lines.push(lineChars.join(''))
        idx += take
    }

    if (idx < chars.length && lines.length > 0) {
        lines[lines.length - 1] = lines[lines.length - 1].replace(/.$/, '…')
    }

    return lines
}

async function generateTencentTextCover(
    config: TencentCoverConfig,
    prompt: string,
    outputDir: string,
    options?: { width?: number; height?: number }
): Promise<string> {
    const width = options?.width || 1080
    const height = options?.height || 1920

    let title = prompt.trim()
    try {
        const titles = await generateTitles(
            {
                secretId: config.secretId,
                secretKey: config.secretKey,
                region: config.region || 'ap-guangzhou',
            } as HunyuanConfig,
            prompt,
            1
        )
        if (titles?.[0]) title = titles[0].trim()
    } catch (e) {
        console.warn('[Cover] generateTitles failed, fallback to prompt:', e)
    }

    const lines = wrapTitleLines(title, 12, 2)
    const titleFilePath = path.join(outputDir, `cover_title_${Date.now()}.txt`)
    fs.writeFileSync(titleFilePath, lines.join('\n'), { encoding: 'utf8' })

    const outPath = path.join(outputDir, `cover_${Date.now()}_0.png`)

    const fontFile = 'C:/Windows/Fonts/msyh.ttc'
    const textFile = toFfmpegFilterPath(titleFilePath)
    const font = toFfmpegFilterPath(fontFile)

    const vf = [
        // background + subtle highlight
        `drawbox=x=0:y=0:w=iw:h=ih:color=#0b1025:t=fill`,
        `drawbox=x=0:y=0:w=iw:h=280:color=#1f3cff@0.10:t=fill`,
        // title text
        `drawtext=fontfile='${font}':textfile='${textFile}':fontsize=88:fontcolor=white:borderw=6:bordercolor=black@0.45:line_spacing=12:x=(w-text_w)/2:y=220`,
        // small footer tag
        `drawtext=fontfile='${font}':text='一键追爆':fontsize=44:fontcolor=white@0.9:borderw=4:bordercolor=black@0.35:x=80:y=h-160`,
    ].join(',')

    await runFFmpeg([
        '-hide_banner',
        '-f', 'lavfi',
        '-i', `color=c=#0b1025:s=${width}x${height}:d=1`,
        '-vf', vf,
        '-frames:v', '1',
        '-y',
        outPath,
    ])

    return outPath
}

const TENCENT_COVER_HOST = 'aiart.tencentcloudapi.com'
const TENCENT_COVER_SERVICE = 'aiart'
const TENCENT_COVER_VERSION = '2022-12-29'

function generateTencentAuthHeaders(
    config: TencentCoverConfig,
    action: string,
    payload: string
): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000)
    const date = new Date(timestamp * 1000).toISOString().split('T')[0]
    const algorithm = 'TC3-HMAC-SHA256'
    const host = TENCENT_COVER_HOST
    const service = TENCENT_COVER_SERVICE

    const httpRequestMethod = 'POST'
    const canonicalUri = '/'
    const canonicalQueryString = ''
    const canonicalHeaders = `content-type:application/json\nhost:${host}\n`
    const signedHeaders = 'content-type;host'
    const hashedRequestPayload = crypto.createHash('sha256').update(payload).digest('hex')

    const canonicalRequest = [
        httpRequestMethod,
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        hashedRequestPayload,
    ].join('\n')

    const credentialScope = `${date}/${service}/tc3_request`
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    const stringToSign = [
        algorithm,
        timestamp,
        credentialScope,
        hashedCanonicalRequest,
    ].join('\n')

    const secretDate = crypto.createHmac('sha256', `TC3${config.secretKey}`).update(date).digest()
    const secretService = crypto.createHmac('sha256', secretDate).update(service).digest()
    const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest()
    const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex')

    const authorization = [
        `${algorithm} Credential=${config.secretId}/${credentialScope}`,
        `SignedHeaders=${signedHeaders}`,
        `Signature=${signature}`,
    ].join(', ')

    return {
        'Content-Type': 'application/json',
        'Host': host,
        'X-TC-Action': action,
        'X-TC-Version': TENCENT_COVER_VERSION,
        'X-TC-Timestamp': timestamp.toString(),
        'X-TC-Region': config.region || 'ap-guangzhou',
        'Authorization': authorization,
    }
}

async function callTencentCoverApi(
    config: TencentCoverConfig,
    prompt: string,
    options?: {
        style?: string
        count?: number
        width?: number
        height?: number
    }
): Promise<{ entries: Array<{ url?: string; base64?: string }>; requestId?: string; action: 'TextToImageLite' }> {
    // 使用 AIArt 的 TextToImageLite 接口（同步返回）
    // 参考：TencentCloud tencentcloud-sdk-nodejs aiart/v20221229
    const width = options?.width || 1024
    const height = options?.height || 1024
    const resolution = `${width}:${height}`

    const requestBody: any = {
        Prompt: prompt,
        Resolution: resolution,
        LogoAdd: 0,
        RspImgType: 'base64',
    }

    const payload = JSON.stringify(requestBody)
    const headers = generateTencentAuthHeaders(config, 'TextToImageLite', payload)

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: TENCENT_COVER_HOST,
            method: 'POST',
            headers,
        }, (res) => {
            let data = ''
            res.on('data', chunk => data += chunk)
            res.on('end', () => {
                try {
                    const result = JSON.parse(data)
                    if (result.Response?.Error) {
                        reject(new Error(result.Response.Error.Message))
                        return
                    }
                    const entries: Array<{ url?: string; base64?: string }> = []
                    const responseData = result.Response || {}
                    if (responseData.ResultImage) {
                        const v = String(responseData.ResultImage)
                        if (/^https?:\/\//i.test(v)) entries.push({ url: v })
                        else entries.push({ base64: v })
                    }

                    const detailList = responseData.ResultDetails || responseData.ResultDetail
                    if (Array.isArray(detailList)) {
                        detailList.forEach((item: any) => {
                            if (item.ResultUrl || item.Url) {
                                entries.push({ url: item.ResultUrl || item.Url })
                            } else if (item.ResultImage || item.ImageBase64) {
                                entries.push({ base64: item.ResultImage || item.ImageBase64 })
                            }
                        })
                    }

                    if (Array.isArray(responseData.ImageResults)) {
                        responseData.ImageResults.forEach((item: any) => {
                            if (item.Url) entries.push({ url: item.Url })
                            else if (item.ImageBase64) entries.push({ base64: item.ImageBase64 })
                        })
                    } else if (Array.isArray(responseData.Results)) {
                        responseData.Results.forEach((item: any) => {
                            if (item.Url) entries.push({ url: item.Url })
                            else if (item.ImageBase64) entries.push({ base64: item.ImageBase64 })
                        })
                    } else if (responseData.ImageUrl && entries.length === 0) {
                        entries.push({ url: responseData.ImageUrl })
                    } else if (responseData.ImageBase64 && entries.length === 0) {
                        entries.push({ base64: responseData.ImageBase64 })
                    }
                    if (entries.length === 0) {
                        reject(new Error('未返回封面数据'))
                        return
                    }
                    resolve({ entries, requestId: responseData.RequestId, action: 'TextToImageLite' })
                } catch (e) {
                    reject(e)
                }
            })
        })

        req.on('error', reject)
        req.write(payload)
        req.end()
    })
}

export interface TencentCoverConfig {
    secretId: string
    secretKey: string
    region?: string
}

export type CoverProvider = 'aliyun' | 'tencent'

export interface CoverServiceConfig {
    provider: CoverProvider
    aliyun?: WanxiangConfig
    tencent?: TencentCoverConfig
}

/**
 * 生成阿里云签名
 */
function generateSignature(
    accessKeySecret: string,
    stringToSign: string
): string {
    return crypto
        .createHmac('sha1', accessKeySecret + '&')
        .update(stringToSign)
        .digest('base64')
}

/**
 * 调用通义万相 API
 */
async function callWanxiangApi(
    config: WanxiangConfig,
    prompt: string,
    options?: {
        style?: string
        size?: string
        n?: number
    }
): Promise<string[]> {
    // 阿里云百炼API调用
    const requestBody = {
        model: 'wanx-v1',
        input: {
            prompt: prompt,
        },
        parameters: {
            style: options?.style || '<auto>',
            size: options?.size || '1024*1024',
            n: options?.n || 1,
        },
    }

    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(requestBody)

        const req = https.request({
            hostname: 'dashscope.aliyuncs.com',
            path: '/api/v1/services/aigc/text2image/image-synthesis',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.accessKeyId}`,
                'X-DashScope-Async': 'enable',
            },
        }, (res) => {
            let data = ''
            res.on('data', chunk => data += chunk)
            res.on('end', () => {
                try {
                    const result = JSON.parse(data)
                    if (result.output?.task_id) {
                        // 异步任务，需要轮询
                        pollTaskResult(config, result.output.task_id)
                            .then(resolve)
                            .catch(reject)
                    } else if (result.output?.results) {
                        resolve(result.output.results.map((r: any) => r.url))
                    } else {
                        reject(new Error(result.message || '生成失败'))
                    }
                } catch (e) {
                    reject(e)
                }
            })
        })

        req.on('error', reject)
        req.write(postData)
        req.end()
    })
}

/**
 * 轮询任务结果
 */
async function pollTaskResult(
    config: WanxiangConfig,
    taskId: string
): Promise<string[]> {
    const maxAttempts = 60

    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 2000))

        const result = await new Promise<any>((resolve, reject) => {
            https.get({
                hostname: 'dashscope.aliyuncs.com',
                path: `/api/v1/tasks/${taskId}`,
                headers: {
                    'Authorization': `Bearer ${config.accessKeyId}`,
                },
            }, (res) => {
                let data = ''
                res.on('data', chunk => data += chunk)
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data))
                    } catch (e) {
                        reject(e)
                    }
                })
            }).on('error', reject)
        })

        if (result.output?.task_status === 'SUCCEEDED') {
            return result.output.results.map((r: any) => r.url)
        } else if (result.output?.task_status === 'FAILED') {
            throw new Error(result.output.message || '生成失败')
        }
    }

    throw new Error('生成超时')
}

/**
 * 下载图片到本地
 */
async function downloadImage(
    imageUrl: string,
    outputPath: string
): Promise<string> {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(outputPath)

        https.get(imageUrl, (response) => {
            response.pipe(file)
            file.on('finish', () => {
                file.close()
                resolve(outputPath)
            })
        }).on('error', (err) => {
            fs.unlink(outputPath, () => { })
            reject(err)
        })
    })
}

async function downloadBase64Image(
    base64: string,
    outputPath: string
): Promise<string> {
    return new Promise((resolve, reject) => {
        const data = base64.replace(/^data:image\/[^;]+;base64,/, '')
        fs.writeFile(outputPath, Buffer.from(data, 'base64'), (err) => {
            if (err) return reject(err)
            resolve(outputPath)
        })
    })
}

/**
 * 生成AI封面
 */
export async function generateCover(
    config: CoverServiceConfig,
    prompt: string,
    outputDir: string,
    options?: {
        style?: string
        count?: number
        width?: number
        height?: number
    }
): Promise<string[]> {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
    }

    if (config.provider === 'tencent' && config.tencent) {
        // 优先尝试腾讯 AIArt 文生图（如果账号未开通/资源不足，会失败）
        try {
            const apiResult = await callTencentCoverApi(config.tencent, prompt, options)
            const entries = apiResult.entries
            const localPaths: string[] = []
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i]
                const fileName = `cover_${Date.now()}_${i}.png`
                const filePath = path.join(outputDir, fileName)
                if (entry.url) {
                    await downloadImage(entry.url, filePath)
                    localPaths.push(filePath)
                } else if (entry.base64) {
                    await downloadBase64Image(entry.base64, filePath)
                    localPaths.push(filePath)
                }
            }
            if (localPaths.length > 0) {
                console.log('[Cover] tencent aiart ok:', {
                    action: apiResult.action,
                    requestId: apiResult.requestId,
                    count: localPaths.length,
                })
                return localPaths
            }
        } catch (e) {
            console.warn('[Cover] aiart TextToImage failed, fallback to text cover:', e)
        }

        // 回退：使用腾讯混元生成“标题文案”，再用本地 FFmpeg 渲染成封面图
        const coverPath = await generateTencentTextCover(
            {
                ...config.tencent,
                region: config.tencent.region || 'ap-guangzhou',
            },
            prompt,
            outputDir,
            { width: options?.width, height: options?.height }
        )
        return [coverPath]
    }

    const enhancedPrompt = `短视频封面，${prompt}，高清，专业，吸引眼球，适合社交媒体`
    const imageUrls = await callWanxiangApi(config.aliyun as WanxiangConfig, enhancedPrompt, {
        n: options?.count || 1,
        style: options?.style,
        size: `${options?.width || 1024}*${options?.height || 1024}`,
    })

    const localPaths: string[] = []
    for (let i = 0; i < imageUrls.length; i++) {
        const fileName = `cover_${Date.now()}_${i}.png`
        const filePath = path.join(outputDir, fileName)
        await downloadImage(imageUrls[i], filePath)
        localPaths.push(filePath)
    }

    return localPaths
}

/**
 * 为封面添加文字标题
 */
export async function addTextToCover(
    imagePath: string,
    text: string,
    outputPath: string,
    options?: {
        fontSize?: number
        fontColor?: string
        position?: 'top' | 'center' | 'bottom'
    }
): Promise<string> {
    // 使用 FFmpeg 添加文字
    const { spawn } = await import('child_process')

    const fontSize = options?.fontSize || 48
    const fontColor = options?.fontColor || 'white'
    const y = options?.position === 'top' ? '50' : options?.position === 'center' ? '(h-text_h)/2' : 'h-text_h-50'

    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
            '-i', imagePath,
            '-vf', `drawtext=text='${text}':fontsize=${fontSize}:fontcolor=${fontColor}:x=(w-text_w)/2:y=${y}:shadowcolor=black:shadowx=2:shadowy=2`,
            '-y',
            outputPath,
        ])

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                resolve(outputPath)
            } else {
                reject(new Error('添加文字失败'))
            }
        })

        ffmpeg.on('error', reject)
    })
}
