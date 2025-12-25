/**
 * 自动更新检查服务
 * 
 * 通过 GitHub Releases API 检查是否有新版本
 * 有新版本时弹窗提示用户下载
 */

import https from 'https'
import { app, dialog, shell } from 'electron'

// ==================== 配置 ====================

const GITHUB_OWNER = 'bopii6'
const GITHUB_REPO = 'AI-AvatarGenerator'
const RELEASES_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
const DOWNLOAD_PAGE_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`

// ==================== 类型定义 ====================

interface ReleaseInfo {
    version: string
    downloadUrl: string
    releaseNotes: string
    publishedAt: string
}

// ==================== 工具函数 ====================

function getCurrentVersion(): string {
    return app.getVersion()
}

function compareVersions(v1: string, v2: string): number {
    // 移除 v 前缀
    const normalize = (v: string) => v.replace(/^v/, '')
    const parts1 = normalize(v1).split('.').map(Number)
    const parts2 = normalize(v2).split('.').map(Number)

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const p1 = parts1[i] || 0
        const p2 = parts2[i] || 0
        if (p1 > p2) return 1
        if (p1 < p2) return -1
    }
    return 0
}

// ==================== API 请求 ====================

async function fetchLatestRelease(): Promise<ReleaseInfo | null> {
    return new Promise((resolve) => {
        const req = https.get(RELEASES_URL, {
            headers: {
                'User-Agent': 'AI-AvatarGenerator-Updater',
                'Accept': 'application/vnd.github.v3+json',
            },
            timeout: 10000,
        }, (res) => {
            if (res.statusCode !== 200) {
                console.log('[Updater] GitHub API 返回状态码:', res.statusCode)
                resolve(null)
                return
            }

            let data = ''
            res.on('data', (chunk) => data += chunk.toString())
            res.on('end', () => {
                try {
                    const release = JSON.parse(data)
                    resolve({
                        version: release.tag_name || release.name || '',
                        downloadUrl: release.html_url || DOWNLOAD_PAGE_URL,
                        releaseNotes: release.body || '',
                        publishedAt: release.published_at || '',
                    })
                } catch (e) {
                    console.error('[Updater] 解析 Release 信息失败:', e)
                    resolve(null)
                }
            })
        })

        req.on('error', (err) => {
            console.error('[Updater] 请求失败:', err.message)
            resolve(null)
        })

        req.on('timeout', () => {
            req.destroy()
            console.error('[Updater] 请求超时')
            resolve(null)
        })
    })
}

// ==================== 核心 API ====================

/**
 * 检查更新并返回结果
 */
export async function checkForUpdates(): Promise<{
    hasUpdate: boolean
    currentVersion: string
    latestVersion: string
    downloadUrl: string
    releaseNotes: string
} | null> {
    try {
        const currentVersion = getCurrentVersion()
        console.log('[Updater] 当前版本:', currentVersion)

        const release = await fetchLatestRelease()
        if (!release || !release.version) {
            console.log('[Updater] 未获取到 Release 信息')
            return null
        }

        console.log('[Updater] 最新版本:', release.version)

        const hasUpdate = compareVersions(release.version, currentVersion) > 0

        return {
            hasUpdate,
            currentVersion,
            latestVersion: release.version,
            downloadUrl: release.downloadUrl,
            releaseNotes: release.releaseNotes,
        }
    } catch (err) {
        console.error('[Updater] 检查更新失败:', err)
        return null
    }
}

/**
 * 检查更新并弹窗提示（如有新版本）
 */
export async function checkForUpdatesAndNotify(): Promise<void> {
    const result = await checkForUpdates()

    if (!result) {
        console.log('[Updater] 检查更新失败，跳过提示')
        return
    }

    if (!result.hasUpdate) {
        console.log('[Updater] 当前已是最新版本')
        return
    }

    console.log('[Updater] 发现新版本:', result.latestVersion)

    // 弹窗提示
    const response = await dialog.showMessageBox({
        type: 'info',
        title: '发现新版本',
        message: `发现新版本 ${result.latestVersion}`,
        detail: `当前版本: ${result.currentVersion}\n\n${result.releaseNotes ? '更新内容:\n' + result.releaseNotes.slice(0, 500) : '点击"立即更新"下载最新版本'}`,
        buttons: ['立即更新', '稍后提醒'],
        defaultId: 0,
        cancelId: 1,
    })

    if (response.response === 0) {
        // 打开下载页面
        shell.openExternal(result.downloadUrl)
    }
}

/**
 * 手动检查更新（用于设置页面的"检查更新"按钮）
 */
export async function manualCheckForUpdates(): Promise<{
    hasUpdate: boolean
    message: string
    downloadUrl?: string
}> {
    const result = await checkForUpdates()

    if (!result) {
        return {
            hasUpdate: false,
            message: '检查更新失败，请稍后重试',
        }
    }

    if (!result.hasUpdate) {
        return {
            hasUpdate: false,
            message: `当前已是最新版本 (${result.currentVersion})`,
        }
    }

    return {
        hasUpdate: true,
        message: `发现新版本 ${result.latestVersion}`,
        downloadUrl: result.downloadUrl,
    }
}
