import { contextBridge, ipcRenderer } from 'electron'

// 暴露给渲染进程的安全 API
contextBridge.exposeInMainWorld('electronAPI', {
    // 通用调用方法
    invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
    on: (channel: string, callback: (...args: any[]) => void) => {
        const subscription = (_event: any, ...args: any[]) => callback(...args)
        ipcRenderer.on(channel, subscription)
        return () => ipcRenderer.removeListener(channel, subscription)
    },
    off: (channel: string, callback: (...args: any[]) => void) => ipcRenderer.removeListener(channel, callback),

    getAppPath: () => ipcRenderer.invoke('get-app-path'),
    // 视频相关
    downloadVideo: (url: string) => ipcRenderer.invoke('download-video', url),
    // ASR 相关
    transcribeAudio: (audioPath: string) => ipcRenderer.invoke('transcribe-audio', audioPath),
    // TTS 相关
    generateSpeech: (text: string, voiceId: string) => ipcRenderer.invoke('generate-speech', text, voiceId),
    // 数字人相关
    generateDigitalHuman: (params: any) => ipcRenderer.invoke('generate-digital-human', params),
    // 文案改写
    rewriteCopy: (text: string, mode: string, instruction?: string) =>
        ipcRenderer.invoke('rewrite-copy', text, mode, instruction),
    // 封面生成
    generateCover: (prompt: string) => ipcRenderer.invoke('generate-cover', prompt),
    generateSubtitleFile: (params: { segments?: Array<{ start: number; end: number; text: string }>; text?: string }) =>
        ipcRenderer.invoke('generate-subtitle-file', params),
    getVideoDuration: (videoPath: string) => ipcRenderer.invoke('get-video-duration', videoPath),
    // 标题生成
    generateTitle: (content: string) => ipcRenderer.invoke('generate-title', content),
    // 事件监听
    onProgress: (callback: (progress: number, stage: string) => void) => {
        ipcRenderer.on('pipeline-progress', (_event, progress, stage) => callback(progress, stage))
    },
    onDownloadProgress: (callback: (data: { percent: number; message: string }) => void) => {
        ipcRenderer.on('download-progress', (_event, data) => callback(data))
    },
})
