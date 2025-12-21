/**
 * 多平台自动上传服务
 * 基于 social-auto-upload 开源项目
 *
 * 支持平台：抖音、小红书、视频号
 */
export interface UploadConfig {
    pythonPath: string;
    socialUploadDir: string;
    cookiesDir: string;
}
export type Platform = 'douyin' | 'xiaohongshu' | 'shipinhao';
export interface UploadOptions {
    videoPath: string;
    title: string;
    tags: string[];
    coverPath?: string;
    platform: Platform;
}
export interface UploadResult {
    success: boolean;
    platform: Platform;
    error?: string;
}
/**
 * 检查平台 Cookie 是否存在
 */
export declare function checkCookieExists(config: UploadConfig, platform: Platform): boolean;
/**
 * 获取所有已配置的平台
 */
export declare function getConfiguredPlatforms(config: UploadConfig): Platform[];
/**
 * 上传视频到指定平台
 */
export declare function uploadToPlatform(config: UploadConfig, options: UploadOptions, onProgress?: (message: string) => void): Promise<UploadResult>;
/**
 * 批量上传到多个平台
 */
export declare function uploadToMultiplePlatforms(config: UploadConfig, options: Omit<UploadOptions, 'platform'>, platforms: Platform[], onProgress?: (platform: Platform, message: string) => void): Promise<UploadResult[]>;
/**
 * 启动 Cookie 获取流程（打开浏览器让用户登录）
 */
export declare function startCookieSetup(config: UploadConfig, platform: Platform, onProgress?: (message: string) => void): Promise<boolean>;
