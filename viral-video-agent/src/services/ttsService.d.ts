/**
 * 腾讯云语音合成 (TTS) 服务
 * 将文字转换为语音
 */
export interface TtsConfig {
    secretId: string;
    secretKey: string;
    region?: string;
}
export interface VoiceOption {
    voiceType: number;
    name: string;
    gender: 'male' | 'female' | 'child';
    description: string;
}
export declare const VOICE_OPTIONS: VoiceOption[];
/**
 * 基础语音合成
 */
export declare function synthesizeSpeech(config: TtsConfig, text: string, options?: {
    voiceType?: number;
    speed?: number;
    volume?: number;
    codec?: string;
}): Promise<string>;
/**
 * 生成语音并保存到文件
 */
export declare function generateSpeechFile(config: TtsConfig, text: string, outputDir: string, options?: {
    voiceType?: number;
    speed?: number;
    volume?: number;
}): Promise<string>;
/**
 * 获取可用音色列表
 */
export declare function getVoiceOptions(): VoiceOption[];
