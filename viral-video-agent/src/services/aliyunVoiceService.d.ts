/**
 * 阿里云 DashScope CosyVoice 声音克隆服务
 *
 * 功能：
 * - 创建复刻音色（通过音频 URL）
 * - 语音合成（使用复刻音色）
 * - 查询音色列表
 *
 * API 文档：https://help.aliyun.com/zh/model-studio/cosyvoice-clone-api
 */
export interface AliyunVoiceConfig {
    apiKey: string;
    model?: string;
    /** 设备 ID，用于音色前缀 */
    deviceId?: string;
    /** 本地数据存储路径 */
    localDataPath?: string;
    /** 可选：用于上传音频的服务器 URL（如云端 GPU 服务器） */
    audioUploadServerUrl?: string;
    audioUploadServerPort?: number;
}
export interface AliyunVoiceModel {
    id: string;
    name: string;
    status: 'pending' | 'ready' | 'failed';
    createdAt?: string;
    updatedAt?: string;
}
/**
 * 创建复刻音色
 *
 * @param config 配置
 * @param params.name 音色名称（会被清洗为合法前缀）
 * @param params.audioUrl 音频 URL（公网可访问）
 * @returns voice_id
 */
export declare function createVoice(config: AliyunVoiceConfig, params: {
    name: string;
    audioUrl: string;
}): Promise<{
    voiceId: string;
}>;
/**
 * 从本地音频文件创建复刻音色
 * 需要先上传到云端服务器获取 URL
 */
export declare function createVoiceFromFile(config: AliyunVoiceConfig, params: {
    name: string;
    audioPath: string;
}): Promise<{
    voiceId: string;
}>;
/**
 * 查询音色列表
 */
export declare function listVoices(config: AliyunVoiceConfig, options?: {
    prefix?: string;
    pageIndex?: number;
    pageSize?: number;
}): Promise<AliyunVoiceModel[]>;
/**
 * 查询指定音色
 */
export declare function getVoice(config: AliyunVoiceConfig, voiceId: string): Promise<AliyunVoiceModel | null>;
/**
 * 删除音色
 */
export declare function deleteVoice(config: AliyunVoiceConfig, voiceId: string): Promise<boolean>;
/**
 * 使用复刻音色合成语音（WebSocket API）
 *
 * DashScope CosyVoice 语音合成使用 WebSocket 实时流式接口
 */
export declare function synthesizeSpeech(config: AliyunVoiceConfig, params: {
    voiceId: string;
    text: string;
    outputPath: string;
}): Promise<string>;
/**
 * 检查阿里云 CosyVoice 服务状态
 */
export declare function checkStatus(config: AliyunVoiceConfig): Promise<{
    online: boolean;
    message?: string;
}>;
