/**
 * GPU 调度器状态服务
 *
 * 统一管理 CosyVoice（声音克隆）和 Duix（数字人）服务的调度状态，
 * 提供实时状态查询、预热、切换进度等功能。
 */
export type ServiceType = 'cosyvoice' | 'duix' | null;
export interface SchedulerStatus {
    /** 当前运行的服务 */
    currentService: ServiceType;
    /** 是否正在切换 */
    switching: boolean;
    /** 切换目标服务 */
    switchingTarget?: ServiceType;
    /** 切换开始时间 (ISO string) */
    switchingStartedAt?: string;
    /** 预计剩余秒数 */
    estimatedRemainingSeconds?: number;
    /** 队列大小（多用户场景） */
    queueSize: number;
    /** 调度器是否在线 */
    online: boolean;
    /** 连接是否不稳定（短暂失败但近期曾成功） */
    unstable?: boolean;
    /** 各服务健康状态 */
    servicesHealth: {
        cosyvoice: boolean;
        duix: boolean;
    };
    /** 错误信息 */
    error?: string;
}
export interface PreswitchResult {
    success: boolean;
    message?: string;
    noSwitchNeeded?: boolean;
    inProgress?: boolean;
    started?: boolean;
    targetService?: ServiceType;
    estimatedRemainingSeconds?: number;
}
/**
 * 根据功能类型获取所需的服务类型
 */
export declare function getServiceForFeature(feature: 'voice-clone' | 'tts' | 'digital-human' | 'avatar-upload'): ServiceType;
/**
 * 获取服务的友好名称
 */
export declare function getServiceDisplayName(service: ServiceType): string;
/**
 * 计算切换进度百分比
 */
export declare function calculateSwitchProgress(status: SchedulerStatus): {
    percent: number;
    remainingSeconds: number;
};
/**
 * 格式化剩余时间
 */
export declare function formatRemainingTime(seconds: number): string;
/**
 * 判断错误是否为服务切换中
 */
export declare function isServiceSwitchingError(err: any): boolean;
