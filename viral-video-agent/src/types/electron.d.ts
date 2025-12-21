/**
 * Electron API 类型声明
 */

export interface ElectronAPI {
    invoke: (channel: string, ...args: any[]) => Promise<any>
    on: (channel: string, callback: (...args: any[]) => void) => () => void
    off: (channel: string, callback: (...args: any[]) => void) => void
    getAppPath: () => Promise<string>
    downloadVideo: (url: string) => Promise<{ success: boolean; error?: string; data?: { videoPath: string; title?: string } }>
    transcribeAudio: (audioPath: string) => Promise<{ success: boolean; error?: string; data?: string }>
    generateSpeech: (text: string, voiceId: string) => Promise<{ success: boolean; error?: string; data?: { audioPath: string } }>
    generateDigitalHuman: (params: any) => Promise<{ success: boolean; error?: string; data?: any }>
    rewriteCopy: (text: string, mode: string, instruction?: string) => Promise<{ success: boolean; error?: string; data?: string }>
    generateCover: (prompt: string) => Promise<{ success: boolean; error?: string; data?: { coverPaths: string[] } }>
    generateSubtitleFile: (params: { segments?: Array<{ start: number; end: number; text: string }>; text?: string }) => Promise<{ success: boolean; error?: string; data?: { subtitlePath: string } }>
    getVideoDuration: (videoPath: string) => Promise<{ success: boolean; error?: string; data?: number }>
    generateTitle: (content: string) => Promise<{ success: boolean; error?: string; data?: { titles: string[]; hashtags: string[] } }>
    onProgress: (callback: (progress: number, stage: string) => void) => void
    onDownloadProgress: (callback: (data: { percent: number; message: string }) => void) => void
}

declare global {
    interface Window {
        electronAPI?: ElectronAPI
    }
}

export { }
