/**
 * 一键追爆流水线服务
 * 串联所有模块，实现全自动化流程
 */
export interface PipelineConfig {
    tencent: {
        secretId: string;
        secretKey: string;
    };
    aliyun: {
        accessKeyId: string;
        accessKeySecret: string;
    };
    digitalHuman: {
        apiUrl: string;
        apiKey?: string;
    };
    outputDir: string;
}
export interface PipelineResult {
    videoPath: string;
    coverPath: string;
    titles: string[];
    hashtags: string[];
    originalCopy: string;
    rewrittenCopy: string;
}
export type PipelineStage = 'download' | 'extract_audio' | 'transcribe' | 'rewrite' | 'tts' | 'digital_human' | 'subtitle' | 'bgm' | 'cover' | 'title' | 'complete';
export interface PipelineProgress {
    stage: PipelineStage;
    progress: number;
    message: string;
}
/**
 * 执行完整的一键追爆流水线
 */
export declare function runPipeline(config: PipelineConfig, douyinUrl: string, options: {
    rewriteMode?: 'auto' | 'custom' | 'same';
    customInstruction?: string;
    voiceType?: number;
    avatarId?: string;
    bgmPath?: string;
    bgmVolume?: number;
}, onProgress?: (progress: PipelineProgress) => void): Promise<PipelineResult>;
