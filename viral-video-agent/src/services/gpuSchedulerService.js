/**
 * GPU 调度器状态服务
 *
 * 统一管理 CosyVoice（声音克隆）和 Duix（数字人）服务的调度状态，
 * 提供实时状态查询、预热、切换进度等功能。
 */
/**
 * 根据功能类型获取所需的服务类型
 */
export function getServiceForFeature(feature) {
    switch (feature) {
        case 'voice-clone':
        case 'tts':
            return 'cosyvoice';
        case 'digital-human':
        case 'avatar-upload':
            return 'duix';
        default:
            return null;
    }
}
/**
 * 获取服务的友好名称
 */
export function getServiceDisplayName(service) {
    switch (service) {
        case 'cosyvoice':
            return '声音克隆';
        case 'duix':
            return '数字人';
        default:
            return '未知服务';
    }
}
/**
 * 计算切换进度百分比
 */
export function calculateSwitchProgress(status) {
    var _a;
    if (!status.switching || !status.switchingStartedAt) {
        return { percent: 100, remainingSeconds: 0 };
    }
    var startedAt = new Date(status.switchingStartedAt).getTime();
    var now = Date.now();
    var elapsed = (now - startedAt) / 1000;
    // 假设平均切换时间 75 秒
    var estimatedTotal = 75;
    var percent = Math.min(95, Math.round((elapsed / estimatedTotal) * 100));
    var remaining = (_a = status.estimatedRemainingSeconds) !== null && _a !== void 0 ? _a : Math.max(0, estimatedTotal - elapsed);
    return { percent: percent, remainingSeconds: Math.round(remaining) };
}
/**
 * 格式化剩余时间
 */
export function formatRemainingTime(seconds) {
    if (seconds <= 0)
        return '即将完成';
    if (seconds < 60)
        return "\u7EA6 ".concat(seconds, " \u79D2");
    var minutes = Math.floor(seconds / 60);
    var secs = seconds % 60;
    return "\u7EA6 ".concat(minutes, " \u5206 ").concat(secs, " \u79D2");
}
/**
 * 判断错误是否为服务切换中
 */
export function isServiceSwitchingError(err) {
    var raw = (err === null || err === void 0 ? void 0 : err.message) || (err === null || err === void 0 ? void 0 : err.error) || err || '';
    raw = raw.toString().toLowerCase();
    return (raw.includes('service switching') ||
        raw.includes('switching in progress') ||
        raw.includes('http 503') ||
        raw.includes('503'));
}
