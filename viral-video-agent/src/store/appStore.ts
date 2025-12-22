import { create } from 'zustand'

export interface PipelineState {
    // 当前面板（UI 导航用）
    activeKey: string
    setActiveKey: (key: string) => void

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

    batchVideos: { title: string; videoPath: string }[]
    setBatchVideos: (videos: { title: string; videoPath: string }[]) => void

    // 提取的文案
    originalCopy: string
    setOriginalCopy: (copy: string) => void

    // 改写后的文案
    rewrittenCopy: string
    setRewrittenCopy: (copy: string) => void

    // 批量文案（每个视频独立存储）
    batchCopies: { title: string; copy: string }[]
    setBatchCopies: (copies: { title: string; copy: string }[]) => void

    batchRewrittenCopies: { title: string; copy: string }[]
    setBatchRewrittenCopies: (copies: { title: string; copy: string }[]) => void
    updateBatchRewrittenCopy: (index: number, title: string, copy: string) => void

    digitalHumanSelectedCopy: { title: string; copy: string } | null
    setDigitalHumanSelectedCopy: (value: { title: string; copy: string } | null) => void

    digitalHumanScriptConfirmed: boolean
    setDigitalHumanScriptConfirmed: (confirmed: boolean) => void

    digitalHumanGenerating: boolean
    digitalHumanProgress: number
    digitalHumanProgressText: string
    setDigitalHumanGenerating: (generating: boolean) => void
    setDigitalHumanProgress: (progress: number, text?: string) => void

    // 生成的音频路径
    audioPath: string | null
    setAudioPath: (path: string | null) => void

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
    activeKey: 'material',
    currentStep: 0,
    isRunning: false,
    douyinUrl: '',
    sourceVideoPath: null,
    videoPath: null,
    batchVideos: [],
    originalCopy: '',
    rewrittenCopy: '',
    batchCopies: [],
    batchRewrittenCopies: [],
    digitalHumanSelectedCopy: null,
    digitalHumanScriptConfirmed: false,
    digitalHumanGenerating: false,
    digitalHumanProgress: 0,
    digitalHumanProgressText: '',
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

    setActiveKey: (key) => set({ activeKey: key }),
    setCurrentStep: (step) => set({ currentStep: step }),
    setDouyinUrl: (url) => set({ douyinUrl: url }),
    setSourceVideoPath: (path) => set({ sourceVideoPath: path }),
    setVideoPath: (path) => set({ videoPath: path }),
    setBatchVideos: (videos) => set({ batchVideos: videos }),
    setOriginalCopy: (copy) => set({ originalCopy: copy }),
    setRewrittenCopy: (copy) => set({ rewrittenCopy: copy }),
    setBatchCopies: (copies) => set({ batchCopies: copies }),
    setBatchRewrittenCopies: (copies) => set({ batchRewrittenCopies: copies }),
    updateBatchRewrittenCopy: (index, title, copy) =>
        set((state) => {
            const next = [...state.batchRewrittenCopies]
            next[index] = { title, copy }
            return { batchRewrittenCopies: next }
        }),
    setDigitalHumanSelectedCopy: (value) => set({ digitalHumanSelectedCopy: value, digitalHumanScriptConfirmed: false }),
    setDigitalHumanScriptConfirmed: (confirmed) => set({ digitalHumanScriptConfirmed: confirmed }),
    setDigitalHumanGenerating: (generating) => set({ digitalHumanGenerating: generating }),
    setDigitalHumanProgress: (progress, text) =>
        set({ digitalHumanProgress: progress, digitalHumanProgressText: text ?? '' }),
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
