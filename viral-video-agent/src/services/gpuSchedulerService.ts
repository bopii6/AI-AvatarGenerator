/**
 * GPU 调度器状态服务
 * 
 * 统一管理 CosyVoice（声音克隆）和 Duix（数字人）服务的调度状态，
 * 提供实时状态查询、预热、切换进度等功能。
 * 
 * 解决的问题：
 * - 声音克隆服务在线时，数字人显示"未连接" → 现在显示"云端就绪（需切换）"
 * - 切换过程无反馈 → 现在显示进度和倒计时
 * - 频繁等待 → 通过预热机制减少等待时间
 */

export type ServiceType = 'cosyvoice' | 'duix' | null

export interface SchedulerStatus {
    /** 当前运行的服务 */
    currentService: ServiceType
    /** 是否正在切换 */
    switching: boolean
    /** 切换目标服务 */
    switchingTarget?: ServiceType
    /** 切换开始时间 (ISO string) */
    switchingStartedAt?: string
    /** 预计剩余秒数 */
    estimatedRemainingSeconds?: number
    /** 队列大小（多用户场景） */
    queueSize: number
    /** 调度器是否在线 */
    online: boolean
    /** 连接是否不稳定（短暂失败但近期曾成功） */
    unstable?: boolean
    /** 各服务健康状态 */
    servicesHealth: {
        cosyvoice: boolean
        duix: boolean
    }
    /** 错误信息 */
    error?: string
}

export interface PreswitchResult {
    success: boolean
    message?: string
    noSwitchNeeded?: boolean
    inProgress?: boolean
    started?: boolean
    targetService?: ServiceType
    estimatedRemainingSeconds?: number
}

/**
 * 根据功能类型获取所需的服务类型
 */
export function getServiceForFeature(feature: 'voice-clone' | 'tts' | 'digital-human' | 'avatar-upload'): ServiceType {
    switch (feature) {
        case 'voice-clone':
        case 'tts':
            return 'cosyvoice'
        case 'digital-human':
        case 'avatar-upload':
            return 'duix'
        default:
            return null
    }
}

/**
 * 获取服务的友好名称
 */
export function getServiceDisplayName(service: ServiceType): string {
    switch (service) {
        case 'cosyvoice':
            return '声音克隆'
        case 'duix':
            return '数字人'
        default:
            return '未知服务'
    }
}

/**
 * 计算切换进度百分比
 */
export function calculateSwitchProgress(status: SchedulerStatus): { percent: number; remainingSeconds: number } {
    if (!status.switching || !status.switchingStartedAt) {
        return { percent: 100, remainingSeconds: 0 }
    }

    const startedAt = new Date(status.switchingStartedAt).getTime()
    const now = Date.now()
    const elapsed = (now - startedAt) / 1000

    // 假设平均切换时间 75 秒
    const estimatedTotal = 75
    const percent = Math.min(95, Math.round((elapsed / estimatedTotal) * 100))
    const remaining = status.estimatedRemainingSeconds ?? Math.max(0, estimatedTotal - elapsed)

    return { percent, remainingSeconds: Math.round(remaining) }
}

/**
 * 格式化剩余时间
 */
export function formatRemainingTime(seconds: number): string {
    if (seconds <= 0) return '即将完成'
    if (seconds < 60) return `约 ${seconds} 秒`
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `约 ${minutes} 分 ${secs} 秒`
}

/**
 * 判断错误是否为服务切换中
 */
export function isServiceSwitchingError(err: any): boolean {
    const raw = (err?.message || err?.error || err || '').toString().toLowerCase()
    return (
        raw.includes('service switching') ||
        raw.includes('switching in progress') ||
        raw.includes('http 503') ||
        raw.includes('503')
    )
}
