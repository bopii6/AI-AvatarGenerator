export type CloudVoiceConfig = {
    serverUrl?: string
    port: number
    deviceId: string
    localDataPath: string
    /** 可选：当语音服务返回容器内路径（如 /code/data/xxx.wav）且 9090 无法下载时，使用 GPU 文件服务兜底下载 */
    fallbackDownloadServerUrl?: string
    fallbackDownloadPort?: number
}

export type CloudVoiceModel = {
    id: string
    name: string
    status: 'pending' | 'training' | 'ready' | 'failed'
    createdAt?: string
    updatedAt?: string
    error?: string
}

export declare function checkCloudVoiceStatus(cfg: CloudVoiceConfig): Promise<{ online: boolean; message?: string }>
export declare function listVoiceModels(cfg: CloudVoiceConfig): Promise<CloudVoiceModel[]>
export declare function trainVoiceModel(cfg: CloudVoiceConfig, params: { name: string; audioPath: string }): Promise<{ voiceId: string }>
export declare function getVoiceModel(cfg: CloudVoiceConfig, voiceId: string): Promise<CloudVoiceModel>
export declare function synthesizeWithVoice(cfg: CloudVoiceConfig, params: { voiceId: string; text: string }): Promise<string>
