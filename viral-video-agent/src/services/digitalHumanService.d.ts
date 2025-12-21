/**
 * 数字人服务（本地版）
 * 基于开源 Wav2Lip 实现唇形同步，支持 CPU 推理（速度较慢但无需 GPU）
 */
import { LipSyncProgress } from './lipSyncService';
export interface DigitalHumanConfig {
    modelsDir: string;
    tempDir: string;
    outputDir: string;
    pythonPath?: string;
}
export interface GenerationOptions {
    sourceVideoPath: string;
    audioPath: string;
    text?: string;
}
export interface GenerationResult {
    videoPath: string;
    duration: number;
    success: boolean;
}
/**
 * 获取默认配置
 */
export declare function getDefaultConfig(appDataPath: string): DigitalHumanConfig;
/**
 * 检查系统是否已准备好
 */
export declare function checkSystemReady(config: DigitalHumanConfig): Promise<{
    ready: boolean;
    modelsDownloaded: boolean;
    pythonInstalled: boolean;
    ffmpegInstalled: boolean;
}>;
/**
 * 初始化系统（下载模型）
 */
export declare function initializeSystem(config: DigitalHumanConfig, onProgress?: (progress: LipSyncProgress) => void): Promise<void>;
/**
 * 生成数字人视频
 */
export declare function generateVideo(config: DigitalHumanConfig, options: GenerationOptions, onProgress?: (progress: LipSyncProgress) => void): Promise<GenerationResult>;
/**
 * 获取已保存的源视频列表
 */
export declare function getSavedSourceVideos(config: DigitalHumanConfig): string[];
/**
 * 保存用户上传的源视频
 */
export declare function saveSourceVideo(config: DigitalHumanConfig, videoBuffer: Buffer, name: string): Promise<string>;
