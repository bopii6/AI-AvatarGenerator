/**
 * 腾讯云语音识别 (ASR) 服务
 * 将视频/音频中的语音转换为文字
 */
export interface AsrConfig {
    secretId: string;
    secretKey: string;
    region?: string;
}
export interface TranscriptionResult {
    text: string;
    segments: Array<{
        text: string;
        startTime: number;
        endTime: number;
    }>;
}
/**
 * 创建录音文件识别任务
 */
export declare function createRecognitionTask(config: AsrConfig, audioUrl: string, options?: {
    engineType?: string;
    channelNum?: number;
}): Promise<string>;
/**
 * 查询录音文件识别结果
 */
export declare function getRecognitionResult(config: AsrConfig, taskId: string): Promise<TranscriptionResult | null>;
/**
 * 完整的语音转文字流程（带轮询）
 */
export declare function transcribeAudio(config: AsrConfig, audioUrl: string, onProgress?: (status: string) => void): Promise<TranscriptionResult>;
/**
 * 一句话识别（实时）
 */
export declare function recognizeSentence(config: AsrConfig, audioBase64: string, options?: {
    engineType?: string;
}): Promise<string>;
