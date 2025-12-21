/**
 * 唇形同步服务 - 基于 Wav2Lip
 *
 * 说明：
 * - 该实现使用 Python + PyTorch 进行推理（CPU 可跑，速度较慢但无需 GPU）
 * - FFmpeg 使用 ffmpeg-static（无需系统安装）
 *
 * 运行时依赖（Python 侧需安装）：
 * - torch, numpy, scipy, opencv-python, librosa, soundfile, tqdm
 */
export interface LipSyncConfig {
    modelsDir: string;
    tempDir: string;
    ffmpegPath?: string;
    pythonPath?: string;
}
export interface LipSyncProgress {
    stage: 'downloading' | 'extracting' | 'processing' | 'synthesizing' | 'complete';
    progress: number;
    message: string;
}
/**
 * 检查模型是否已下载
 */
export declare function checkModelsExist(modelsDir: string): boolean;
/**
 * 下载模型文件
 */
export declare function downloadModels(modelsDir: string, onProgress?: (progress: LipSyncProgress) => void): Promise<void>;
/**
 * 使用 Python 运行 Wav2Lip（CPU 可跑）
 */
export declare function runLipSync(config: LipSyncConfig, videoPath: string, audioPath: string, outputPath: string, onProgress?: (progress: LipSyncProgress) => void): Promise<string>;
/**
 * 完整的数字人视频生成流程
 * 文本 →（TTS）→ 音频 → 唇形同步 → 输出
 */
export declare function generateDigitalHumanVideo(config: LipSyncConfig, sourceVideoPath: string, _text: string, ttsAudioPath: string, onProgress?: (progress: LipSyncProgress) => void): Promise<string>;
