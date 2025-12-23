/**
 * 抖音视频下载服务 - Playwright 版本
 * 使用真实浏览器绕过反爬虫，无需 Cookie
 */
export interface DownloadResult {
    success: boolean;
    videoPath?: string;
    title?: string;
    error?: string;
}
export interface ProfileVideo {
    id: string;
    url: string;
    title: string;
    cover?: string;
}
/**
 * 关闭浏览器
 */
export declare function closeBrowser(): Promise<void>;
/**
 * 抓取博主主页最近的视频列表
 */
export declare function fetchProfileVideos(profileUrl: string, count?: number): Promise<ProfileVideo[]>;
/**
 * 判断是否为主页链接
 */
export declare function isProfileUrl(url: string): boolean;
/**
 * 从分享链接获取视频信息
 */
export declare function parseDouyinUrl(shareUrl: string): Promise<{
    mp4Url?: string;
    dashVideoUrl?: string;
    dashAudioUrl?: string;
    title: string;
    author?: string;
} | null>;
/**
 * 完整的下载流程
 */
export declare function downloadDouyinVideo(shareLink: string, outputDir: string, onProgress?: (percent: number, message: string) => void): Promise<DownloadResult>;
