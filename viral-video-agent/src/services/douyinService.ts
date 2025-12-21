/**
 * 抖音视频下载服务 - Playwright 版本
 * 使用真实浏览器绕过反爬虫，无需 Cookie
 */

import { chromium, Browser, Page } from 'playwright'
import https from 'https'
import http from 'http'
import fs from 'fs'
import path from 'path'
import { app, safeStorage } from 'electron'
import { spawn } from 'child_process'

// eslint-disable-next-line @typescript-eslint/no-var-requires
let ffmpegPath = require('ffmpeg-static') as string
if (ffmpegPath.includes('app.asar') && !ffmpegPath.includes('app.asar.unpacked')) {
    ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked')
}

export interface DownloadResult {
    success: boolean
    videoPath?: string
    title?: string
    error?: string
}

export interface ProfileVideo {
    id: string
    url: string
    title: string
    cover?: string
}

interface CookieEntry {
    platform: string
    userName: string
    value: string
    encrypted: boolean
}

/**
 * 从本地存储读取抖音 Cookie
 * 优先级：本地存储 > 环境变量
 */
function loadDouyinCookieFromStore(): string | undefined {
    try {
        const cookieFile = path.join(app.getPath('userData'), 'publish_cookies.json')
        if (!fs.existsSync(cookieFile)) {
            console.log('[Douyin] 本地无 Cookie 存储，使用环境变量')
            return process.env.DOUYIN_COOKIE
        }
        const entries: CookieEntry[] = JSON.parse(fs.readFileSync(cookieFile, 'utf-8'))
        const douyinEntry = entries.find(e => e.platform === 'douyin')
        if (douyinEntry) {
            console.log('[Douyin] 从本地存储读取 Cookie（账号：' + douyinEntry.userName + '）')
            // 如果加密了需要解密
            if (douyinEntry.encrypted && safeStorage.isEncryptionAvailable()) {
                const buf = Buffer.from(douyinEntry.value, 'base64')
                const decrypted = safeStorage.decryptString(buf)
                // Cookie 存储的是 JSON 格式，需要转换为字符串格式
                try {
                    const cookies = JSON.parse(decrypted)
                    if (Array.isArray(cookies)) {
                        return cookies.map((c: any) => `${c.name}=${c.value}`).join('; ')
                    }
                } catch {
                    return decrypted
                }
            }
            // 未加密的情况，可能是 JSON 或字符串
            try {
                const cookies = JSON.parse(douyinEntry.value)
                if (Array.isArray(cookies)) {
                    return cookies.map((c: any) => `${c.name}=${c.value}`).join('; ')
                }
            } catch {
                return douyinEntry.value
            }
        }
    } catch (e) {
        console.log('[Douyin] 读取本地 Cookie 失败:', e)
    }
    console.log('[Douyin] 使用环境变量 Cookie')
    return process.env.DOUYIN_COOKIE
}

let browser: Browser | null = null

/**
 * 获取或创建浏览器实例
 */
async function getBrowser(): Promise<Browser> {
    if (!browser) {
        console.log('[Douyin] 启动浏览器...')
        browser = await chromium.launch({
            headless: false, // 显示浏览器窗口，方便调试
            slowMo: 100, // 稍微慢一点，更容易观察
        })
    }
    return browser
}

/**
 * 关闭浏览器
 */
export async function closeBrowser(): Promise<void> {
    if (browser) {
        await browser.close()
        browser = null
    }
}

/**
 * 从分享链接获取 modal_id
 */
async function getModalIdFromShareLink(shareLink: string): Promise<string | null> {
    // 先检查是否是直接的视频链接格式 (https://www.douyin.com/video/xxx)
    const directVideoPattern = /douyin\.com\/video\/(\d+)/
    const directMatch = shareLink.match(directVideoPattern)
    if (directMatch) {
        console.log('[Douyin] 从直接链接提取到 modal_id:', directMatch[1])
        return directMatch[1]
    }

    // 提取短链接 (https://v.douyin.com/xxx)
    const pattern = /(https?:\/\/v\.douyin\.com\/[\w\-]+)/
    const match = shareLink.match(pattern)
    if (!match) {
        console.log('[Douyin] 无效的分享链接格式')
        return null
    }
    const shortUrl = match[1]
    console.log('[Douyin] 提取到短链接:', shortUrl)

    // 使用简单 HTTP 请求获取重定向（这一步不需要浏览器）
    return new Promise((resolve) => {
        https.get(shortUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
        }, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                const location = response.headers.location
                if (location) {
                    const modalMatch = location.match(/video\/(\d+)/)
                    if (modalMatch) {
                        console.log('[Douyin] 从重定向提取到 modal_id:', modalMatch[1])
                        resolve(modalMatch[1])
                        return
                    }
                }
            }
            let data = ''
            response.on('data', chunk => data += chunk)
            response.on('end', () => {
                const modalMatch = data.match(/video\/(\d+)/)
                resolve(modalMatch ? modalMatch[1] : null)
            })
        }).on('error', () => resolve(null))
    })
}

/**
 * 使用 Playwright 获取视频信息
 */
async function getVideoInfoWithBrowser(modalId: string): Promise<{
    mp4Url?: string
    dashVideoUrl?: string
    dashAudioUrl?: string
    title: string
} | null> {
    const url = `https://www.douyin.com/video/${modalId}`
    console.log('[Douyin] 使用浏览器请求:', url)

    let page: Page | null = null

    try {
        const browserInstance = await getBrowser()

        // 创建带 Cookie 的上下文
        const cookie = loadDouyinCookieFromStore()
        const context = await browserInstance.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        })

        // 如果有 Cookie，设置到浏览器
        if (cookie) {
            console.log('[Douyin] 设置 Cookie 到浏览器...')
            const cookies = cookie.split(';').map(c => {
                const [name, ...valueParts] = c.trim().split('=')
                return {
                    name: name.trim(),
                    value: valueParts.join('='),
                    domain: '.douyin.com',
                    path: '/',
                }
            }).filter(c => c.name && c.value)
            await context.addCookies(cookies)
        }

        // 监听网络请求，捕获视频/音频 URL（抖音可能是 DASH：video/audio 分离）
        const mp4Urls: string[] = []
        const dashVideoUrls: string[] = []
        const dashAudioUrls: string[] = []
        page = await context.newPage()
        await page.setViewportSize({ width: 1280, height: 720 }) // 设置 viewport
        page.on('response', async (response) => {
            const url = response.url()
            if (!url) return
            if (url.includes('douyinstatic') || url.includes('uuu_265') || url.includes('.jpg') || url.includes('.png')) return

            const looksLikeMediaHost =
                url.includes('douyinvod') ||
                url.includes('bytevcloudcdn') ||
                url.includes('v26-web') ||
                url.includes('v3-web') ||
                url.includes('v9-web') ||
                url.includes('v11-web')

            if (!looksLikeMediaHost) return

            // 抖音经常返回 .m4s（DASH 分离流），也可能有 mp4（可能带音频也可能无音轨）
            if (url.includes('.m4s')) {
                try {
                    const u = new URL(url)
                    const mimeType = (u.searchParams.get('mime_type') || '').toLowerCase()
                    if (mimeType.startsWith('audio')) dashAudioUrls.push(url)
                    else dashVideoUrls.push(url)
                } catch {
                    dashVideoUrls.push(url)
                }
                return
            }

            if (url.includes('.mp4') || url.includes('mime_type=video_mp4')) {
                mp4Urls.push(url)
            }
        })

        // 访问页面
        await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        })

        // 等待页面加载和视频开始播放
        console.log('[Douyin] 等待页面加载和视频播放...')
        await page.waitForTimeout(8000) // 等待 8 秒

        // 获取页面标题
        const title = await page.evaluate(() => {
            const titleEl = document.querySelector('[data-e2e="video-desc"]')
                || document.querySelector('h1')
                || document.querySelector('title')
            return titleEl?.textContent?.trim() || '抖音视频'
        })

        console.log('[Douyin] 页面标题:', title)
        console.log('[Douyin] 捕获到 mp4 URL 数量:', mp4Urls.length)
        console.log('[Douyin] 捕获到 DASH video URL 数量:', dashVideoUrls.length)
        console.log('[Douyin] 捕获到 DASH audio URL 数量:', dashAudioUrls.length)

        // 优先选择 mp4；如果只有 DASH，则返回 video/audio 两路用于后续合并
        if (mp4Urls.length > 0) {
            const mp4Url = mp4Urls[mp4Urls.length - 1]
            console.log('[Douyin] 成功获取 MP4 地址!')
            await page.close()
            return { mp4Url, title, dashVideoUrl: dashVideoUrls.at(-1), dashAudioUrl: dashAudioUrls.at(-1) }
        }

        if (dashVideoUrls.length > 0 && dashAudioUrls.length > 0) {
            const dashVideoUrl = dashVideoUrls[dashVideoUrls.length - 1]
            const dashAudioUrl = dashAudioUrls[dashAudioUrls.length - 1]
            console.log('[Douyin] 使用 DASH 分离流（video+audio）')
            await page.close()
            return { dashVideoUrl, dashAudioUrl, title }
        }

        // 备用方法：从页面 DOM 提取
        console.log('[Douyin] 尝试从页面 DOM 提取...')
        const videoInfo = await page.evaluate(() => {
            // 方法1：从 video 标签获取
            const video = document.querySelector('video')
            if (video && video.src && video.src.includes('http')) {
                return {
                    mp4Url: video.src,
                    title: document.querySelector('[data-e2e="video-desc"]')?.textContent || '抖音视频'
                }
            }

            // 方法2：从 xg-video 获取
            const xgVideo = document.querySelector('xg-video video, .xgplayer video')
            if (xgVideo) {
                const src = xgVideo.getAttribute('src')
                if (src && src.includes('http')) {
                    return {
                        mp4Url: src,
                        title: document.querySelector('[data-e2e="video-desc"]')?.textContent || '抖音视频'
                    }
                }
            }

            return null
        })

        await page.close()

        if (videoInfo) {
            console.log('[Douyin] 从 DOM 提取成功!')
            return videoInfo
        }

        console.error('[Douyin] 无法获取视频信息，尝试的方法都失败了')
        return null

    } catch (error) {
        console.error('[Douyin] 浏览器请求失败:', error)
        return null
    } finally {
        if (page) {
            await page.close()
        }
    }
}

/**
 * 抓取博主主页最近的视频列表
 */
export async function fetchProfileVideos(profileUrl: string, count: number = 10): Promise<ProfileVideo[]> {
    console.log('[Douyin] 开始抓取主页视频:', profileUrl)
    let page: Page | null = null
    const results: ProfileVideo[] = []

    try {
        const browserInstance = await getBrowser()
        const cookie = loadDouyinCookieFromStore()
        const context = await browserInstance.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        })

        if (cookie) {
            const cookies = cookie.split(';').map(c => {
                const [name, ...valueParts] = c.trim().split('=')
                return {
                    name: name.trim(),
                    value: valueParts.join('='),
                    domain: '.douyin.com',
                    path: '/',
                }
            }).filter(c => c.name && c.value)
            await context.addCookies(cookies)
        }

        page = await context.newPage()
        await page.setViewportSize({ width: 1280, height: 1000 })

        // 访问主页
        await page.goto(profileUrl, {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        })

        // 等待作品列表加载
        console.log('[Douyin] 等待主页作品加载...')
        await page.waitForTimeout(5000)

        // 尝试解析视频列表
        // 抖音 web 版中，视频项通常在 [data-e2e="user-post-list"] 下的 <li> 中
        const videos = await page.evaluate((maxCount) => {
            const list: any[] = []
            // 常见的视频项选择器
            const items = document.querySelectorAll('li[data-e2e="user-post-list-item"], a[href*="/video/"]')

            for (const item of Array.from(items)) {
                if (list.length >= maxCount) break

                const linkEl = (item.tagName === 'A' ? item : item.querySelector('a[href*="/video/"]')) as HTMLAnchorElement
                if (!linkEl) continue

                const href = linkEl.href
                const videoIdMatch = href.match(/video\/(\d+)/)
                if (!videoIdMatch) continue

                const id = videoIdMatch[1]
                const title = item.querySelector('img')?.alt || item.textContent?.trim() || '未命名视频'
                const cover = item.querySelector('img')?.src || ''

                // 排除重复
                if (!list.some(v => v.id === id)) {
                    list.push({
                        id,
                        url: href,
                        title,
                        cover
                    })
                }
            }
            return list
        }, count)

        console.log(`[Douyin] 抓取完成，找到 ${videos.length} 个视频`)
        return videos

    } catch (error) {
        console.error('[Douyin] 抓取主页失败:', error)
        return []
    } finally {
        if (page) await page.close()
    }
}

/**
 * 判断是否为主页链接
 */
export function isProfileUrl(url: string): boolean {
    return url.includes('/user/') || (url.includes('douyin.com') && !url.includes('/video/'))
}

/**
 * 从分享链接获取视频信息
 */
export async function parseDouyinUrl(shareUrl: string): Promise<{
    mp4Url?: string
    dashVideoUrl?: string
    dashAudioUrl?: string
    title: string
    author?: string
} | null> {
    try {
        console.log('[Douyin] 开始解析链接:', shareUrl)

        // 1. 获取 modal_id
        const modalId = await getModalIdFromShareLink(shareUrl)
        if (!modalId) {
            console.error('[Douyin] 无法获取 modal_id')
            return null
        }

        // 2. 使用浏览器获取视频信息
        const videoInfo = await getVideoInfoWithBrowser(modalId)
        if (!videoInfo) {
            console.error('[Douyin] 无法获取视频信息')
            return null
        }

        return videoInfo

    } catch (error) {
        console.error('[Douyin] 解析失败:', error)
        return null
    }
}

function runFfmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })

        let stderr = ''
        ffmpeg.stderr.on('data', (data) => {
            stderr += data.toString()
        })

        ffmpeg.on('close', (code) => {
            if (code === 0) resolve()
            else reject(new Error(stderr.length > 4000 ? stderr.slice(-4000) : stderr))
        })

        ffmpeg.on('error', reject)
    })
}

async function hasAudioStream(mediaPath: string): Promise<boolean> {
    return await new Promise((resolve, reject) => {
        const ffmpeg = spawn(ffmpegPath, ['-hide_banner', '-i', mediaPath], { stdio: ['ignore', 'pipe', 'pipe'] })
        let stderr = ''
        ffmpeg.stderr.on('data', (data) => {
            stderr += data.toString()
        })
        ffmpeg.on('close', () => {
            resolve(/Stream\s+#\d+:\d+.*Audio:/i.test(stderr) || /Audio:/i.test(stderr))
        })
        ffmpeg.on('error', reject)
    })
}

async function mergeVideoAndAudio(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
    await runFfmpeg([
        '-y',
        '-i', videoPath,
        '-i', audioPath,
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-c', 'copy',
        '-shortest',
        outputPath,
    ])
}

/**
 * 下载视频文件
 */
async function downloadVideo(videoUrl: string, outputPath: string, onProgress?: (percent: number) => void): Promise<boolean> {
    return new Promise((resolve) => {
        const protocol = videoUrl.startsWith('https') ? https : http

        const request = protocol.get(videoUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://www.douyin.com/',
            },
        }, (response) => {
            // 处理重定向
            if (response.statusCode === 301 || response.statusCode === 302) {
                const redirectUrl = response.headers.location
                if (redirectUrl) {
                    downloadVideo(redirectUrl, outputPath, onProgress).then(resolve)
                    return
                }
            }

            if (response.statusCode !== 200) {
                console.error('[Douyin] 下载失败，状态码:', response.statusCode)
                resolve(false)
                return
            }

            const totalSize = parseInt(response.headers['content-length'] || '0', 10)
            let downloadedSize = 0

            // 确保目录存在
            const dir = path.dirname(outputPath)
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true })
            }

            const file = fs.createWriteStream(outputPath)

            response.on('data', (chunk) => {
                downloadedSize += chunk.length
                if (totalSize > 0) {
                    onProgress?.((downloadedSize / totalSize) * 100)
                }
            })

            response.pipe(file)

            file.on('finish', () => {
                file.close()
                console.log('[Douyin] 下载完成:', outputPath)
                resolve(true)
            })

            file.on('error', (e) => {
                console.error('[Douyin] 写入文件失败:', e)
                fs.unlink(outputPath, () => { })
                resolve(false)
            })
        })

        request.on('error', (e) => {
            console.error('[Douyin] 下载请求失败:', e)
            resolve(false)
        })
        request.setTimeout(120000, () => {
            request.destroy()
            resolve(false)
        })
    })
}

/**
 * 清理文件名
 */
function sanitizeFilename(title: string): string {
    return title
        .replace(/[<>:"/\\|?*\n\r]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 50) || 'video'
}

/**
 * 完整的下载流程
 */
export async function downloadDouyinVideo(
    shareLink: string,
    outputDir: string,
    onProgress?: (percent: number, message: string) => void
): Promise<DownloadResult> {
    try {
        onProgress?.(5, '解析分享链接...')

        const videoInfo = await parseDouyinUrl(shareLink)
        if (!videoInfo) {
            return { success: false, error: '无法解析视频链接' }
        }

        onProgress?.(30, `获取到视频: ${videoInfo.title}`)

        const filename = `${sanitizeFilename(videoInfo.title)}_${Date.now()}.mp4`
        const outputPath = path.join(outputDir, filename)

        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true })
        }

        const mp4Url = videoInfo.mp4Url
        const dashVideoUrl = videoInfo.dashVideoUrl
        const dashAudioUrl = videoInfo.dashAudioUrl

        // 1) 优先下载 mp4（如果能拿到）
        if (mp4Url) {
            onProgress?.(40, '开始下载视频...')

            const ok = await downloadVideo(mp4Url, outputPath, (percent) => {
                onProgress?.(40 + percent * 0.5, `下载中: ${percent.toFixed(1)}%`)
            })
            if (!ok) return { success: false, error: '视频下载失败' }

            // mp4 可能无音轨；如果有 DASH audio/video，则自动合并生成带音轨的 mp4
            const audioOk = await hasAudioStream(outputPath)
            if (!audioOk && dashVideoUrl && dashAudioUrl) {
                onProgress?.(92, '检测到无音轨，改用 DASH 合并音视频...')
                const tmpDir = path.join(outputDir, '.tmp')
                fs.mkdirSync(tmpDir, { recursive: true })
                const ts = Date.now()
                const tmpVideo = path.join(tmpDir, `dash_video_${ts}.m4s`)
                const tmpAudio = path.join(tmpDir, `dash_audio_${ts}.m4s`)

                const okV = await downloadVideo(dashVideoUrl, tmpVideo, (p) => onProgress?.(92 + p * 0.03, `下载视频流: ${p.toFixed(1)}%`))
                const okA = await downloadVideo(dashAudioUrl, tmpAudio, (p) => onProgress?.(95 + p * 0.03, `下载音频流: ${p.toFixed(1)}%`))
                if (!okV || !okA) return { success: false, error: '下载音视频流失败（DASH）' }

                onProgress?.(98, '正在合并音视频...')
                await mergeVideoAndAudio(tmpVideo, tmpAudio, outputPath)
                try { fs.unlinkSync(tmpVideo) } catch { /* ignore */ }
                try { fs.unlinkSync(tmpAudio) } catch { /* ignore */ }
            }
        } else if (dashVideoUrl && dashAudioUrl) {
            // 2) 只有 DASH：下载并合并
            onProgress?.(40, '开始下载视频/音频流（DASH）...')
            const tmpDir = path.join(outputDir, '.tmp')
            fs.mkdirSync(tmpDir, { recursive: true })
            const ts = Date.now()
            const tmpVideo = path.join(tmpDir, `dash_video_${ts}.m4s`)
            const tmpAudio = path.join(tmpDir, `dash_audio_${ts}.m4s`)

            const okV = await downloadVideo(dashVideoUrl, tmpVideo, (p) => onProgress?.(40 + p * 0.25, `下载视频流: ${p.toFixed(1)}%`))
            const okA = await downloadVideo(dashAudioUrl, tmpAudio, (p) => onProgress?.(65 + p * 0.25, `下载音频流: ${p.toFixed(1)}%`))
            if (!okV || !okA) return { success: false, error: '下载音视频流失败（DASH）' }

            onProgress?.(95, '正在合并音视频...')
            await mergeVideoAndAudio(tmpVideo, tmpAudio, outputPath)
            try { fs.unlinkSync(tmpVideo) } catch { /* ignore */ }
            try { fs.unlinkSync(tmpAudio) } catch { /* ignore */ }
        } else {
            return { success: false, error: '未捕获到可下载的视频地址（mp4 或 DASH）' }
        }

        onProgress?.(100, '下载完成！')

        return {
            success: true,
            videoPath: outputPath,
            title: videoInfo.title,
        }

    } catch (error: any) {
        return { success: false, error: error.message }
    }
}
