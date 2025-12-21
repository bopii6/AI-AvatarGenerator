/**
 * 多平台自动上传服务
 * 基于 social-auto-upload 开源项目
 * 
 * 支持平台：抖音、小红书、视频号
 */

import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

export interface UploadConfig {
    pythonPath: string        // Python 路径
    socialUploadDir: string   // social-auto-upload 目录
    cookiesDir: string        // Cookie 存放目录
}

export type Platform = 'douyin' | 'xiaohongshu' | 'shipinhao'

export interface UploadOptions {
    videoPath: string
    title: string
    tags: string[]
    coverPath?: string
    platform: Platform
}

export interface UploadResult {
    success: boolean
    platform: Platform
    error?: string
}

/**
 * 获取平台对应的上传脚本
 */
function getUploadScript(platform: Platform): string {
    const scripts: Record<Platform, string> = {
        'douyin': 'upload_video_to_douyin.py',
        'xiaohongshu': 'upload_video_to_xhs.py',
        'shipinhao': 'upload_video_to_tencent.py',
    }
    return scripts[platform]
}

/**
 * 检查平台 Cookie 是否存在
 */
export function checkCookieExists(config: UploadConfig, platform: Platform): boolean {
    const cookiePaths: Record<Platform, string> = {
        'douyin': path.join(config.cookiesDir, 'douyin_uploader', 'account.json'),
        'xiaohongshu': path.join(config.cookiesDir, 'xhs_uploader', 'account.json'),
        'shipinhao': path.join(config.cookiesDir, 'tencent_uploader', 'account.json'),
    }

    return fs.existsSync(cookiePaths[platform])
}

/**
 * 获取所有已配置的平台
 */
export function getConfiguredPlatforms(config: UploadConfig): Platform[] {
    const platforms: Platform[] = ['douyin', 'xiaohongshu', 'shipinhao']
    return platforms.filter(p => checkCookieExists(config, p))
}

/**
 * 上传视频到指定平台
 */
export async function uploadToPlatform(
    config: UploadConfig,
    options: UploadOptions,
    onProgress?: (message: string) => void
): Promise<UploadResult> {
    const { platform, videoPath, title, tags, coverPath } = options

    // 检查视频文件
    if (!fs.existsSync(videoPath)) {
        return { success: false, platform, error: '视频文件不存在' }
    }

    // 检查 Cookie
    if (!checkCookieExists(config, platform)) {
        return { success: false, platform, error: `请先配置 ${platform} 的登录 Cookie` }
    }

    const scriptPath = path.join(config.socialUploadDir, getUploadScript(platform))

    if (!fs.existsSync(scriptPath)) {
        return { success: false, platform, error: '上传脚本不存在' }
    }

    onProgress?.(`正在上传到 ${platform}...`)

    return new Promise((resolve) => {
        const args = [
            scriptPath,
            videoPath,
            coverPath || '',
            title,
            tags.map(t => `#${t}`).join(','),
        ]

        const proc = spawn(config.pythonPath, args, {
            cwd: config.socialUploadDir,
            env: { ...process.env },
        })

        let stdout = ''
        let stderr = ''

        proc.stdout.on('data', (data) => {
            const text = data.toString()
            stdout += text

            // 解析进度信息
            if (text.includes('登录成功')) {
                onProgress?.('登录成功')
            } else if (text.includes('开始上传')) {
                onProgress?.('开始上传视频')
            } else if (text.includes('上传成功') || text.includes('视频上传成功')) {
                onProgress?.('上传成功！')
            }
        })

        proc.stderr.on('data', (data) => {
            stderr += data.toString()
        })

        proc.on('close', (code) => {
            if (code === 0 && (stdout.includes('上传成功') || stdout.includes('视频上传成功'))) {
                resolve({ success: true, platform })
            } else {
                resolve({
                    success: false,
                    platform,
                    error: stderr || '上传失败，请检查网络和登录状态',
                })
            }
        })

        proc.on('error', (err) => {
            resolve({ success: false, platform, error: err.message })
        })
    })
}

/**
 * 批量上传到多个平台
 */
export async function uploadToMultiplePlatforms(
    config: UploadConfig,
    options: Omit<UploadOptions, 'platform'>,
    platforms: Platform[],
    onProgress?: (platform: Platform, message: string) => void
): Promise<UploadResult[]> {
    const results: UploadResult[] = []

    for (const platform of platforms) {
        onProgress?.(platform, `开始上传到 ${platform}`)

        const result = await uploadToPlatform(
            config,
            { ...options, platform },
            (msg) => onProgress?.(platform, msg)
        )

        results.push(result)

        // 平台之间间隔一下
        await new Promise(r => setTimeout(r, 2000))
    }

    return results
}

/**
 * 启动 Cookie 获取流程（打开浏览器让用户登录）
 */
export async function startCookieSetup(
    config: UploadConfig,
    platform: Platform,
    onProgress?: (message: string) => void
): Promise<boolean> {
    const scripts: Record<Platform, string> = {
        'douyin': 'get_douyin_cookie.py',
        'xiaohongshu': 'get_xhs_cookie.py',
        'shipinhao': 'get_tencent_cookie.py',
    }

    const scriptPath = path.join(config.socialUploadDir, scripts[platform])

    if (!fs.existsSync(scriptPath)) {
        onProgress?.('Cookie 获取脚本不存在')
        return false
    }

    onProgress?.(`正在打开 ${platform} 登录页面...`)

    return new Promise((resolve) => {
        const proc = spawn(config.pythonPath, [scriptPath], {
            cwd: config.socialUploadDir,
        })

        proc.stdout.on('data', (data) => {
            const text = data.toString()
            if (text.includes('Cookie') || text.includes('成功')) {
                onProgress?.(text.trim())
            }
        })

        proc.on('close', (code) => {
            if (code === 0) {
                onProgress?.('Cookie 保存成功！')
                resolve(true)
            } else {
                onProgress?.('Cookie 获取失败')
                resolve(false)
            }
        })

        proc.on('error', () => resolve(false))
    })
}
