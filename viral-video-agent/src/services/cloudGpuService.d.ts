/**
 * 云端 GPU 数字人服务（Duix Avatar）
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

export declare function checkCloudGpuStatus(config?: Partial<CloudGpuConfig>): Promise<{
    online: boolean;
    message: string;
}>;

export declare function uploadAvatarVideo(
    config: Partial<CloudGpuConfig>,
    localVideoPath: string,
    avatarName: string,
    onProgress?: (progress: number, message: string) => void,
    modelId?: string
): Promise<CloudAvatarModel>;

export declare function getCloudAvatarModels(config?: Partial<CloudGpuConfig>): CloudAvatarModel[];

export declare function deleteCloudAvatarModel(config: Partial<CloudGpuConfig>, modelId: string): boolean;

export declare function generateCloudVideo(
    config: Partial<CloudGpuConfig>,
    model: CloudAvatarModel,
    audioPath: string,
    onProgress?: (progress: number, message: string) => void
): Promise<string>;

export declare function generateCloudVideoWithLocalPaths(
    config: Partial<CloudGpuConfig>,
    avatarVideoPath: string,
    audioPath: string,
    onProgress?: (progress: number, message: string) => void
): Promise<string>;

