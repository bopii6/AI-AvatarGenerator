import { create } from 'zustand'

export interface PipelineState {
    // 当前步骤
    currentStep: number
    setCurrentStep: (step: number) => void

    // 是否正在运行流水线
    isRunning: boolean

    // 抖音链接
    douyinUrl: string
    setDouyinUrl: (url: string) => void

    // 源视频路径（用户上传用于数字人）
    sourceVideoPath: string | null
    setSourceVideoPath: (path: string) => void

    // 下载的视频路径
    videoPath: string | null
    setVideoPath: (path: string) => void

    // 提取的文案
    originalCopy: string
    setOriginalCopy: (copy: string) => void

    // 改写后的文案
    rewrittenCopy: string
    setRewrittenCopy: (copy: string) => void

    // 生成的音频路径
    audioPath: string | null
    setAudioPath: (path: string) => void

    // 用户导入的本地音频（用于ASR提取文案）
    inputAudioPath: string | null
    setInputAudioPath: (path: string | null) => void

    // 数字人视频路径
    digitalHumanVideoPath: string | null
    setDigitalHumanVideoPath: (path: string) => void

    // 字幕文件路径
    subtitlePath: string | null
    setSubtitlePath: (path: string) => void

    // 最终视频路径
    finalVideoPath: string | null
    setFinalVideoPath: (path: string) => void

    // 封面图片路径
    coverPath: string | null
    setCoverPath: (path: string) => void

    // 生成的标题
    titles: string[]
    setTitles: (titles: string[]) => void

    // 话题标签
    hashtags: string[]
    setHashtags: (hashtags: string[]) => void

    // 当前预览内容
    previewType: 'video' | 'audio' | 'image' | 'text' | null
    previewContent: string | null
    setPreview: (type: 'video' | 'audio' | 'image' | 'text', content: string) => void

    // 启动流水线
    startPipeline: (url: string) => void
    stopPipeline: () => void

    // 重置状态
    reset: () => void
}

const initialState = {
    currentStep: 0,
    isRunning: false,
    douyinUrl: '',
    sourceVideoPath: null,
    videoPath: null,
    originalCopy: '',
    rewrittenCopy: '',
    audioPath: null,
    inputAudioPath: null,
    digitalHumanVideoPath: null,
    subtitlePath: null,
    finalVideoPath: null,
    coverPath: null,
    titles: [],
    hashtags: [],
    previewType: null,
    previewContent: null,
}

export const useAppStore = create<PipelineState>((set) => ({
    ...initialState,

    setCurrentStep: (step) => set({ currentStep: step }),
    setDouyinUrl: (url) => set({ douyinUrl: url }),
    setSourceVideoPath: (path) => set({ sourceVideoPath: path }),
    setVideoPath: (path) => set({ videoPath: path }),
    setOriginalCopy: (copy) => set({ originalCopy: copy }),
    setRewrittenCopy: (copy) => set({ rewrittenCopy: copy }),
    setAudioPath: (path) => set({ audioPath: path }),
    setInputAudioPath: (path) => set({ inputAudioPath: path }),
    setDigitalHumanVideoPath: (path) => set({ digitalHumanVideoPath: path }),
    setSubtitlePath: (path) => set({ subtitlePath: path }),
    setFinalVideoPath: (path) => set({ finalVideoPath: path }),
    setCoverPath: (path) => set({ coverPath: path }),
    setTitles: (titles) => set({ titles }),
    setHashtags: (hashtags) => set({ hashtags }),
    setPreview: (type, content) => set({ previewType: type, previewContent: content }),

    startPipeline: (url) => set({ isRunning: true, douyinUrl: url, currentStep: 0 }),
    stopPipeline: () => set({ isRunning: false }),

    reset: () => set(initialState),
}))
