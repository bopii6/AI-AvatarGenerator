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
export interface CloudGpuConfig {
    /** GPU 服务器地址，如 http://123.45.67.89 */
    serverUrl: string;
    /** 视频合成端口，默认 8383 */
    videoPort: number;
    /** 本地数据目录（存储下载的视频） */
    localDataPath: string;
}
export interface CloudAvatarModel {
    id: string;
    name: string;
    /** 服务器上的视频路径 */
    remoteVideoPath: string;
    /** 本地预览视频路径 */
    localPreviewPath?: string;
    createdAt: Date;
}
export interface VideoGenerationTask {
    taskCode: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    videoUrl?: string;
    errorMessage?: string;
}
/**
 * 检查云端 GPU 服务器状态
 */
export declare function checkCloudGpuStatus(config?: Partial<CloudGpuConfig>): Promise<{
    online: boolean;
    message: string;
}>;
/**
 * 上传形象视频到服务器
 *
 * 注意：Duix Avatar 需要视频存放在服务器的 /code/data 目录
 */
export declare function uploadAvatarVideo(config: Partial<CloudGpuConfig>, localVideoPath: string, avatarName: string, onProgress?: (progress: number, message: string) => void, modelId?: string): Promise<CloudAvatarModel>;
/**
 * 获取已保存的云端形象列表
 */
export declare function getCloudAvatarModels(config?: Partial<CloudGpuConfig>): CloudAvatarModel[];
/**
 * 删除云端形象记录
 */
export declare function deleteCloudAvatarModel(config: Partial<CloudGpuConfig>, modelId: string): boolean;
/**
 * 生成数字人视频
 *
 * 核心流程：
 *   1. 将音频上传到服务器（或使用共享目录）
 *   2. 调用 /easy/submit 提交视频合成任务
 *   3. 轮询 /easy/query 获取进度
 *   4. 下载生成的视频
 */
export declare function generateCloudVideo(config: Partial<CloudGpuConfig>, model: CloudAvatarModel, audioPath: string, onProgress?: (progress: number, message: string) => void): Promise<string>;
/**
 * 使用本地路径模式生成视频
 *
 * 适用于服务器和客户端共享挂载目录的场景
 */
export declare function generateCloudVideoWithLocalPaths(config: Partial<CloudGpuConfig>, avatarVideoPath: string, audioPath: string, onProgress?: (progress: number, message: string) => void): Promise<string>;
