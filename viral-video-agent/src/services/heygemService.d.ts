/**
 * HeyGem (Duix Avatar) 数字人服务
 * 开源本地部署，完全免费
 *
 * 需要本地运行 Docker 服务
 * GitHub: https://github.com/GuijiAI/HeyGem.ai
 */
export interface HeyGemConfig {
    baseUrl: string;
    audioPort: number;
    videoPort: number;
    dataPath: string;
}
export interface AvatarModel {
    id: string;
    name: string;
    videoPath: string;
    asrFormatAudioUrl: string;
    referenceAudioText: string;
    createdAt: Date;
}
export interface VideoTask {
    taskId: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    progress: number;
    videoUrl?: string;
    errorMessage?: string;
}
/**
 * 检查 HeyGem Docker 服务是否运行
 */
export declare function checkServiceStatus(config?: Partial<HeyGemConfig>): Promise<boolean>;
/**
 * 训练数字人形象模型
 *
 * 步骤：
 * 1. 将用户上传的视频分离为 无声视频 + 音频
 * 2. 将音频放到 D:\duix_avatar_data\voice\data 目录
 * 3. 调用训练 API
 */
export declare function trainAvatarModel(config: Partial<HeyGemConfig>, videoPath: string, modelName: string, onProgress?: (progress: number, message: string) => void): Promise<AvatarModel>;
/**
 * 获取已训练的形象列表
 */
export declare function getTrainedModels(config?: Partial<HeyGemConfig>): AvatarModel[];
/**
 * 合成语音（声音克隆）
 */
export declare function synthesizeAudio(config: Partial<HeyGemConfig>, model: AvatarModel, text: string, outputPath: string): Promise<string>;
/**
 * 生成数字人视频
 */
export declare function generateVideo(config: Partial<HeyGemConfig>, model: AvatarModel, audioPath: string, onProgress?: (progress: number, message: string) => void): Promise<string>;
/**
 * 完整流程：文本 -> 数字人视频
 */
export declare function textToDigitalHumanVideo(config: Partial<HeyGemConfig>, model: AvatarModel, text: string, outputDir: string, onProgress?: (progress: number, message: string) => void): Promise<string>;
