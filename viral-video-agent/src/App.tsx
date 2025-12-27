import { useEffect, useState, useCallback, useRef } from 'react'
import { Input, Button, message, Modal, Spin, Tabs, Card, Space, Typography, Tooltip, Progress, Segmented, Tag } from 'antd'
import {
    DownloadOutlined,
    UserOutlined,
    SettingOutlined,
    CopyOutlined,
    RocketOutlined,
    DownOutlined,
    ReloadOutlined,
    FileSearchOutlined,
} from '@ant-design/icons'
import { useAppStore } from './store/appStore'
import CookieSettings from './components/CookieSettings'
import VoiceCloneSettings from './components/VoiceCloneSettings'
import ServerSettings from './components/ServerSettings'
import ProfileVideoSelector from './components/ProfileVideoSelector'
import CloudServiceStatus from './components/CloudServiceStatus'

// 步骤面板组件
import CopywritingPanel from './components/panels/CopywritingPanel'
import RewritePanel from './components/panels/RewritePanel'
import AudioPanel from './components/panels/AudioPanel'
import DigitalHumanPanel from './components/panels/DigitalHumanPanel'
import SubtitlePanel from './components/panels/SubtitlePanel'
import CoverPanel from './components/panels/CoverPanel'
import TitlePanel from './components/panels/TitlePanel'
import PublishPanel from './components/panels/PublishPanel'
import PreviewPanel from './components/PreviewPanel'
import { auditCopyText, LEGAL_AUDIT_BASIS, type LegalAuditReport } from './services/legalAuditService'

type BenchmarkTopic = {
    title: string
    hook?: string
    angle?: string
}

type BenchmarkProgress = {
    percent: number
    title: string
    detail: string
}

type WorkspaceMode = 'manual' | 'auto'

type AutoStepKey =
    | 'auto_material'
    | 'auto_extract'
    | 'auto_rewrite'
    | 'auto_legal'
    | 'auto_audio'
    | 'auto_digital'
    | 'auto_review'

type CloudVoiceModel = { id: string; name?: string; status?: string }
type CloudAvatarModel = { id: string; name?: string; remoteVideoPath?: string; status?: string }

function App() {
    const [isTracking, setIsTracking] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [adminEnabled, setAdminEnabled] = useState(false)
    const [parseMode, setParseMode] = useState<'single' | 'profile' | 'diagnosis' | null>(null)
    const [profileModalOpen, setProfileModalOpen] = useState(false)
    const [profileLoading, setProfileLoading] = useState(false)
    const [profileVideos, setProfileVideos] = useState<any[]>([])
    const [batchResults, setBatchResults] = useState<
        { title: string; copy: string; status: 'loading' | 'success' | 'error'; error?: string }[]
    >([])

    const [benchmarkLearning, setBenchmarkLearning] = useState(false)
    const [benchmarkProgress, setBenchmarkProgress] = useState<BenchmarkProgress>({
        percent: 0,
        title: '',
        detail: '',
    })
    const [benchmarkSamples, setBenchmarkSamples] = useState<Array<{ title: string; transcript: string }>>([])
    const [benchmarkTopics, setBenchmarkTopics] = useState<BenchmarkTopic[]>([])
    const [benchmarkGeneratingTopicIndex, setBenchmarkGeneratingTopicIndex] = useState<number | null>(null)

    const [diagnosisRunning, setDiagnosisRunning] = useState(false)
    const [diagnosisProgress, setDiagnosisProgress] = useState<BenchmarkProgress>({
        percent: 0,
        title: '',
        detail: '',
    })
    const [diagnosisReport, setDiagnosisReport] = useState('')
    // 预留：云端服务状态可接后端心跳，这里先写死为 ready

    const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(() => {
        try {
            const saved = localStorage.getItem('workspace.mode')
            if (saved === 'auto' || saved === 'manual') return saved
        } catch {
            // ignore
        }
        return 'manual'
    })
    const [settingsTab, setSettingsTab] = useState<string>('cookie')

    const [autoActiveStep, setAutoActiveStep] = useState<AutoStepKey>('auto_material')
    const [autoRunning, setAutoRunning] = useState(false)
    const [autoPercent, setAutoPercent] = useState(0)
    const [autoStatusText, setAutoStatusText] = useState('')
    const [autoError, setAutoError] = useState('')
    const [autoDetailOpen, setAutoDetailOpen] = useState(false)
    const [autoPublishOpen, setAutoPublishOpen] = useState(false)
    const [autoLogs, setAutoLogs] = useState<Array<{ time: string; step: AutoStepKey; message: string }>>([])

    const [autoCheckLoading, setAutoCheckLoading] = useState(false)
    const [autoVoiceReady, setAutoVoiceReady] = useState(false)
    const [autoAvatarReady, setAutoAvatarReady] = useState(false)
    const [autoVoiceStatusText, setAutoVoiceStatusText] = useState('')
    const [autoGpuStatusText, setAutoGpuStatusText] = useState('')
    const [autoGpuEndpoint, setAutoGpuEndpoint] = useState('')
    const [autoAvatars, setAutoAvatars] = useState<CloudAvatarModel[]>([])
    const [autoSelectedAvatarId, setAutoSelectedAvatarId] = useState<string>(() => {
        try {
            return (localStorage.getItem('auto.avatarId') || '').trim()
        } catch {
            return ''
        }
    })

    const [autoSourceVideoPath, setAutoSourceVideoPath] = useState<string>('')
    const [autoExtractedCopy, setAutoExtractedCopy] = useState<string>('')
    const [autoRewrittenCopy, setAutoRewrittenCopy] = useState<string>('')
    const [autoAudioPath, setAutoAudioPath] = useState<string>('')
    const [autoFinalVideoPath, setAutoFinalVideoPath] = useState<string>('')
    const [autoLegalReport, setAutoLegalReport] = useState<LegalAuditReport | null>(null)
    const [autoLegalRunning, setAutoLegalRunning] = useState(false)
    const [autoLegalProgress, setAutoLegalProgress] = useState(0)
    const autoLegalTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const {
        activeKey,
        setActiveKey,
        douyinUrl,
        setDouyinUrl,
        setVideoPath,
        setBatchVideos,
        setPreview,
        setOriginalCopy,
        setRewrittenCopy,
        setFinalVideoPath,
        setAudioPath,
        setBatchCopies,
        setBatchRewrittenCopies,
        setDigitalHumanSelectedCopy,
        setDigitalHumanVideoPath,
        setTitles,
        setHashtags,
        videoPath,
        inputAudioPath,
        rewrittenCopy,
        digitalHumanVideoPath,
        digitalHumanGenerating,
        digitalHumanProgress,
        digitalHumanProgressText,
        finalVideoPath,
    } = useAppStore()

    useEffect(() => {
        const removeListener = window.electronAPI?.on('cloud-gpu-progress', (data: any) => {
            const progress = data?.progress ?? 0
            const text = data?.message ?? ''
            useAppStore.getState().setDigitalHumanProgress(progress, text)
        })

        return () => {
            if (removeListener) removeListener()
        }
    }, [])

    useEffect(() => {
        const removeListener = window.electronAPI?.on?.('cloud-gpu-download-progress', (data: { progress?: number; message?: string }) => {
            const progress = typeof data?.progress === 'number' ? data.progress : 0
            const text = typeof data?.message === 'string' ? data.message : ''
            useAppStore.getState().setDigitalHumanDownloadProgress(Math.max(0, Math.min(100, progress)), text)
        })
        return () => {
            if (typeof removeListener === 'function') removeListener()
        }
    }, [])

    useEffect(() => {
        const loadRuntimeFlags = async () => {
            try {
                const res = await window.electronAPI?.invoke('config-get')
                if (res?.success && res.data) {
                    setAdminEnabled(!!res.data.adminEnabled)
                }
            } catch {
                // ignore
            }
        }
        loadRuntimeFlags()
    }, [])

    useEffect(() => {
        try {
            localStorage.setItem('workspace.mode', workspaceMode)
        } catch {
            // ignore
        }
    }, [workspaceMode])

    useEffect(() => {
        try {
            localStorage.setItem('auto.avatarId', autoSelectedAvatarId)
        } catch {
            // ignore
        }
    }, [autoSelectedAvatarId])

    useEffect(() => {
        if (!adminEnabled && settingsTab === 'server') {
            setSettingsTab('cookie')
        }
    }, [adminEnabled, settingsTab])

    useEffect(() => {
        return () => {
            if (autoLegalTimerRef.current) clearInterval(autoLegalTimerRef.current)
        }
    }, [])

    // Tab 切换（语音走云端 API，数字人走独立 GPU 服务，无需服务切换/等待）
    const handleTabChange = useCallback((key: string) => {
        if (key === activeKey) return
        setActiveKey(key)
    }, [activeKey, setActiveKey])

    const handleDownloadSingle = async (overrideUrl?: string) => {
        const targetUrl = (overrideUrl || douyinUrl).trim()
        if (!targetUrl) {
            message.warning('请输入抖音分享链接')
            return
        }
        if (!window.electronAPI?.invoke) {
            message.error('桌面端接口未就绪，请重启应用')
            return
        }

        setIsTracking(true)
        const hide = message.loading('正在解析视频并自动生成主字稿...', 0)
        try {
            // 新一轮流程：清理旧数据，避免“已完成”误显示
            setBatchVideos([])
            setBatchCopies([])
            setBatchRewrittenCopies([])
            setDigitalHumanSelectedCopy(null)
            setOriginalCopy('')

            const result = await window.electronAPI.invoke('download-video', targetUrl)
            if (result?.success && result.data?.videoPath) {
                const videoTitle = (result.data.title || '抖音视频').toString().trim() || '抖音视频'
                setVideoPath(result.data.videoPath)
                setFinalVideoPath(result.data.videoPath)
                setPreview('video', result.data.videoPath)
                setActiveKey('copywriting')
                message.success(`抓取完成：${videoTitle}`)

                try {
                    const asrRes = await window.electronAPI.invoke('transcribe-audio', result.data.videoPath)
                    if (asrRes?.success) {
                        const transcribedText = (asrRes.data || '').toString().trim()
                        setOriginalCopy(transcribedText)
                        if (transcribedText) {
                            setBatchCopies([{ title: videoTitle, copy: transcribedText }])
                            message.success('主字稿已自动生成')
                        } else {
                            message.warning('主字稿生成完成，但未识别到有效文字')
                        }
                    } else {
                        message.warning(asrRes?.error || '主字稿自动生成失败，请在「提取文案」面板手动重试')
                    }
                } catch (e: any) {
                    message.warning(e?.message || '主字稿自动生成失败，请在「提取文案」面板手动重试')
                }
            } else {
                throw new Error(result?.error || '解析失败')
            }
        } catch (e: any) {
            message.error(e.message)
        } finally {
            hide()
            setIsTracking(false)
        }
    }

    const resetBenchmarkFlow = () => {
        setBatchResults([])
        setBenchmarkSamples([])
        setBenchmarkTopics([])
        setBenchmarkProgress({ percent: 0, title: '', detail: '' })
        setBenchmarkLearning(false)
        setBenchmarkGeneratingTopicIndex(null)
    }

    const resetDiagnosisFlow = () => {
        setDiagnosisRunning(false)
        setDiagnosisProgress({ percent: 0, title: '', detail: '' })
        setDiagnosisReport('')
    }

    const resetAutoSession = () => {
        setAutoRunning(false)
        setAutoPercent(0)
        setAutoStatusText('')
        setAutoError('')
        setAutoLogs([])
        setAutoDetailOpen(false)
        setAutoPublishOpen(false)
        setAutoActiveStep('auto_material')

        setAutoSourceVideoPath('')
        setAutoExtractedCopy('')
        setAutoRewrittenCopy('')
        setAutoAudioPath('')
        setAutoFinalVideoPath('')

        setAutoLegalReport(null)
        setAutoLegalRunning(false)
        setAutoLegalProgress(0)
        if (autoLegalTimerRef.current) {
            clearInterval(autoLegalTimerRef.current)
            autoLegalTimerRef.current = null
        }
    }

    const appendAutoLog = (step: AutoStepKey, messageText: string) => {
        const time = new Date().toLocaleTimeString()
        setAutoLogs((prev) => [...prev, { time, step, message: messageText }].slice(-200))
    }

    const getStoredCloudVoiceId = () => {
        try {
            return (localStorage.getItem('audio.cloudVoiceId') || '').trim()
        } catch {
            return ''
        }
    }

    const refreshAutoReadiness = async () => {
        const fallback = { voiceId: '', voiceReady: false, avatarReady: false, avatars: [] as CloudAvatarModel[], selectedAvatarId: autoSelectedAvatarId }

        if (!window.electronAPI?.invoke) {
            setAutoVoiceReady(false)
            setAutoAvatarReady(false)
            setAutoVoiceStatusText('桌面端接口未就绪')
            setAutoGpuStatusText('桌面端接口未就绪')
            setAutoGpuEndpoint('')
            setAutoAvatars([])
            return fallback
        }

        setAutoCheckLoading(true)
        try {
            const voiceId = getStoredCloudVoiceId()

            const [voiceStatusRes, voiceModelsRes, gpuStatusRes, avatarRes] = await Promise.all([
                window.electronAPI.invoke('cloud-voice-check-status'),
                window.electronAPI.invoke('cloud-voice-list-models'),
                window.electronAPI.invoke('cloud-gpu-check-status'),
                window.electronAPI.invoke('cloud-gpu-get-avatars'),
            ])

            if (voiceStatusRes?.success && voiceStatusRes.data) {
                const ok = !!voiceStatusRes.data?.ready
                setAutoVoiceStatusText(ok ? '语音服务：已连接' : (voiceStatusRes.data?.message || '语音服务：未就绪'))
            } else {
                setAutoVoiceStatusText(`语音服务：${voiceStatusRes?.error || '未连接'}`)
            }

            if (gpuStatusRes?.success && gpuStatusRes.data) {
                const ok = !!gpuStatusRes.data?.connected
                setAutoGpuEndpoint(String(gpuStatusRes.data?.endpoint || ''))
                setAutoGpuStatusText(ok ? '数字人服务：已连接' : (gpuStatusRes.data?.message || '数字人服务：未连接'))
            } else {
                setAutoGpuEndpoint('')
                setAutoGpuStatusText(`数字人服务：${gpuStatusRes?.error || '未连接'}`)
            }

            const voiceModels: CloudVoiceModel[] =
                voiceModelsRes?.success && Array.isArray(voiceModelsRes.data) ? voiceModelsRes.data : []
            const voiceModel = voiceId ? voiceModels.find((m) => String(m?.id || '').trim() === voiceId) : undefined
            const voiceStatus = String(voiceModel?.status || '').toLowerCase()
            const voiceReady = !!voiceModel && (voiceStatus === 'ready' || voiceStatus === 'success' || voiceStatus === 'completed' || voiceStatus === 'done' || voiceStatus === '')
            setAutoVoiceReady(voiceReady)

            const avatars: CloudAvatarModel[] =
                avatarRes?.success && Array.isArray(avatarRes.data) ? avatarRes.data : []
            setAutoAvatars(avatars)
            const avatarReady = avatars.length > 0
            setAutoAvatarReady(avatarReady)

            let selectedAvatarId = autoSelectedAvatarId
            if (avatarReady) {
                const matched = autoSelectedAvatarId && avatars.some((a) => a.id === autoSelectedAvatarId)
                selectedAvatarId = matched ? autoSelectedAvatarId : String(avatars[0].id || '')
                if (selectedAvatarId && selectedAvatarId !== autoSelectedAvatarId) setAutoSelectedAvatarId(selectedAvatarId)
            }

            return { voiceId, voiceReady, avatarReady, avatars, selectedAvatarId }
        } catch (e: any) {
            setAutoVoiceReady(false)
            setAutoAvatarReady(false)
            setAutoVoiceStatusText(e?.message ? `语音服务：${e.message}` : '语音服务：检测失败')
            setAutoGpuStatusText(e?.message ? `数字人服务：${e.message}` : '数字人服务：检测失败')
            return fallback
        } finally {
            setAutoCheckLoading(false)
        }
    }

    const runAutoLegalAudit = async (text: string) => {
        const report = auditCopyText(text)
        setAutoLegalReport(report)
        setAutoLegalRunning(true)
        setAutoLegalProgress(0)
        setAutoActiveStep('auto_legal')
        appendAutoLog('auto_legal', '开始 AI 法务检查（约 10 秒）')

        if (autoLegalTimerRef.current) clearInterval(autoLegalTimerRef.current)
        const startAt = Date.now()
        const totalMs = 10000

        await new Promise<void>((resolve) => {
            autoLegalTimerRef.current = setInterval(() => {
                const elapsed = Date.now() - startAt
                const percent = Math.min(99, Math.floor((elapsed / totalMs) * 100))
                setAutoLegalProgress(percent)
                setAutoPercent((prev) => Math.max(prev, 50 + Math.floor(percent * 0.12)))

                if (elapsed >= totalMs) {
                    if (autoLegalTimerRef.current) clearInterval(autoLegalTimerRef.current)
                    autoLegalTimerRef.current = null
                    setAutoLegalProgress(100)
                    setAutoLegalRunning(false)
                    resolve()
                }
            }, 120)
        })

        appendAutoLog('auto_legal', 'AI 法务检查完成')
        return report
    }

    const startAutoPipeline = async () => {
        const url = douyinUrl.trim()
        if (!url) {
            message.warning('请输入短视频链接')
            setAutoActiveStep('auto_material')
            return
        }
        if (!window.electronAPI?.invoke) {
            message.error('桌面端接口未就绪，请重启应用')
            return
        }

        const readiness = await refreshAutoReadiness()
        if (!readiness.voiceReady || !readiness.avatarReady) {
            message.warning('请先准备好「音色」与「数字人形象」后再开始全自动出片')
            return
        }

        const voiceId = readiness.voiceId
        if (!voiceId) {
            message.warning('你还没有选择/克隆自己的音色')
            return
        }

        const avatar = readiness.avatars.find((a) => a.id === readiness.selectedAvatarId) || readiness.avatars[0]
        if (!avatar?.remoteVideoPath) {
            message.warning('未找到可用的数字人形象，请先创建数字人形象')
            return
        }

        resetAutoSession()
        setAutoRunning(true)
        setAutoStatusText('开始全自动出片...')
        setAutoPercent(2)
        setAutoLogs([])
        appendAutoLog('auto_material', '开始全自动出片')

        // 清理旧数据（不影响半自动的路径，只是刷新本次“全自动”结果）
        setBatchVideos([])
        setBatchCopies([])
        setBatchRewrittenCopies([])
        setDigitalHumanSelectedCopy(null)
        setOriginalCopy('')
        setRewrittenCopy('')
        setAudioPath(null)
        setDigitalHumanVideoPath(null)
        setVideoPath('')
        setFinalVideoPath('')
        setTitles([])
        setHashtags([])
        setPreview('text', '')
        useAppStore.getState().setDigitalHumanProgress(0, '')

        try {
            // 1) 解析素材
            setAutoActiveStep('auto_material')
            setAutoStatusText('正在解析素材...')
            setAutoPercent(5)
            appendAutoLog('auto_material', '下载/解析短视频')

            const downloadRes = await window.electronAPI.invoke('download-video', url)
            if (!downloadRes?.success || !downloadRes.data?.videoPath) {
                throw new Error(downloadRes?.error || '解析失败')
            }
            const sourceVideoPath = String(downloadRes.data.videoPath)
            setAutoSourceVideoPath(sourceVideoPath)
            setVideoPath(sourceVideoPath)
            setPreview('video', sourceVideoPath)
            appendAutoLog('auto_material', '素材解析完成')
            setAutoPercent(15)

            // 2) 提取文案
            setAutoActiveStep('auto_extract')
            setAutoStatusText('正在提取文案...')
            appendAutoLog('auto_extract', '语音识别提取逐字稿')

            const asrRes = await window.electronAPI.invoke('transcribe-audio', sourceVideoPath)
            if (!asrRes?.success) {
                throw new Error(asrRes?.error || '提取文案失败')
            }
            const original = String(asrRes.data || '').trim()
            setAutoExtractedCopy(original)
            setOriginalCopy(original)
            setPreview('text', original || '（未识别到有效文字）')
            appendAutoLog('auto_extract', '文案提取完成')
            setAutoPercent(32)

            // 3) AI 变原创
            setAutoActiveStep('auto_rewrite')
            setAutoStatusText('正在生成原创文案...')
            appendAutoLog('auto_rewrite', 'AI 变原创改写中')

            const rewriteRes = await window.electronAPI.invoke('rewrite-copy', original, 'auto')
            if (!rewriteRes?.success || !rewriteRes.data) {
                throw new Error(rewriteRes?.error || 'AI变原创失败')
            }
            const rewritten = String(rewriteRes.data).trim()
            setAutoRewrittenCopy(rewritten)
            setRewrittenCopy(rewritten)
            setPreview('text', rewritten)
            appendAutoLog('auto_rewrite', '原创文案已生成')
            setAutoPercent(48)

            // 4) AI 法务（10 秒）
            setAutoStatusText('正在进行 AI 法务检查...')
            const report = await runAutoLegalAudit(rewritten)
            const safeText = String(report.suggestedText || rewritten).trim() || rewritten
            if (safeText && safeText !== rewritten) {
                setAutoRewrittenCopy(safeText)
                setRewrittenCopy(safeText)
                setPreview('text', safeText)
                appendAutoLog('auto_legal', '已生成合规建议文本并用于后续流程')
            }
            setAutoPercent(62)

            // 5) AI 配音
            setAutoActiveStep('auto_audio')
            setAutoStatusText('正在生成 AI 配音...')
            appendAutoLog('auto_audio', '云端音色合成中')

            const ttsRes = await window.electronAPI.invoke('cloud-voice-tts', {
                voiceId,
                text: safeText,
            })
            if (!ttsRes?.success || !ttsRes.data?.audioPath) {
                throw new Error(ttsRes?.error || 'AI配音失败')
            }
            const audioPath = String(ttsRes.data.audioPath)
            setAutoAudioPath(audioPath)
            setAudioPath(audioPath)
            setPreview('audio', audioPath)
            appendAutoLog('auto_audio', '配音完成')
            setAutoPercent(75)

            // 6) 数字人出片
            setAutoActiveStep('auto_digital')
            setAutoStatusText('正在生成数字人视频...')
            appendAutoLog('auto_digital', '云端数字人合成中')

            const videoRes = await window.electronAPI.invoke('cloud-gpu-generate-video', {
                avatarVideoPath: avatar.remoteVideoPath,
                audioPath,
            })
            if (!videoRes?.success || !videoRes.data?.videoPath) {
                throw new Error(videoRes?.error || '数字人出片失败')
            }
            const finalPath = String(videoRes.data.videoPath)
            setAutoFinalVideoPath(finalPath)
            setDigitalHumanVideoPath(finalPath)
            setFinalVideoPath(finalPath)
            setPreview('video', finalPath)
            appendAutoLog('auto_digital', '数字人出片完成')

            // 7) 标题/话题（可选，供全网分发使用）
            try {
                const titleRes = await window.electronAPI.invoke('generate-title', safeText)
                if (titleRes?.success && titleRes.data) {
                    const titles = Array.isArray(titleRes.data?.titles) ? titleRes.data.titles : []
                    const hashtags = Array.isArray(titleRes.data?.hashtags) ? titleRes.data.hashtags : []
                    setTitles(titles)
                    setHashtags(hashtags)
                }
            } catch {
                // ignore
            }

            setAutoActiveStep('auto_review')
            setAutoStatusText('全自动出片完成：请先审核，再一键全网分发')
            setAutoPercent(100)
            appendAutoLog('auto_review', '流程完成，等待审核与分发')
        } catch (e: any) {
            const msg = String(e?.message || '全自动出片失败')
            setAutoError(msg)
            setAutoStatusText('流程已中断')
            message.error(msg)
        } finally {
            setAutoRunning(false)
        }
    }

    const handleFetchProfile = async () => {
        if (!douyinUrl) {
            message.warning('请输入对标博主主页链接')
            return
        }

        if (benchmarkLearning || benchmarkGeneratingTopicIndex !== null) return

        setIsTracking(true)
        const hide = message.loading('正在抓取主页...', 0)
        try {
            resetBenchmarkFlow()
            setProfileModalOpen(true)
            setProfileLoading(true)
            const listRes = await window.electronAPI?.invoke('douyin-fetch-profile-videos', douyinUrl)
            if (listRes?.success) {
                setProfileVideos(listRes.data)
            } else {
                message.error(listRes.error || '抓取主页视频失败')
                setProfileModalOpen(false)
            }
        } catch (e: any) {
            message.error('请求失败')
            setProfileModalOpen(false)
        } finally {
            hide()
            setProfileLoading(false)
            setIsTracking(false)
        }
    }

    const handleBatchVideoSelect = async (videos: any[]) => {
        setProfileModalOpen(false)
        if (videos.length === 0) return

        try {
            if (!window.electronAPI?.invoke) {
                message.error('桌面端接口未就绪，请重启应用')
                return
            }

            setBenchmarkLearning(true)
            setBenchmarkGeneratingTopicIndex(null)
            setBenchmarkSamples([])
            setBenchmarkTopics([])
            setBenchmarkProgress({ percent: 5, title: '开始学习', detail: `已选择 ${videos.length} 个样本` })

            setBatchVideos([])
            setBatchCopies([])
            setBatchRewrittenCopies([])
            setDigitalHumanSelectedCopy(null)
            setOriginalCopy('')
            setFinalVideoPath('')

            setBatchResults(
                videos.map((v) => ({
                    title: v.title || '视频',
                    copy: '',
                    status: 'loading',
                }))
            )

            setPreview('text', `🤖 AI 正在学习对标账号（${videos.length} 个样本）...\n\n完成后将生成 4 个选题。`)

            const samples: Array<{ title: string; transcript: string }> = []

            for (let i = 0; i < videos.length; i++) {
                const video = videos[i]
                const videoTitle = video.title || `视频 ${i + 1}`

                setBenchmarkProgress({
                    percent: 5 + Math.round((i / videos.length) * 60),
                    title: `提取逐字稿 ${i + 1}/${videos.length}`,
                    detail: videoTitle,
                })

                try {
                    const downloadRes = await window.electronAPI.invoke('download-video', video.url)
                    if (!downloadRes?.success || !downloadRes.data?.videoPath) {
                        throw new Error(downloadRes?.error || '下载失败')
                    }

                    if (i === 0) {
                        setVideoPath(downloadRes.data.videoPath)
                    }

                    const asrRes = await window.electronAPI.invoke('transcribe-audio', downloadRes.data.videoPath)
                    if (!asrRes?.success || !asrRes.data) {
                        throw new Error(asrRes?.error || '转写失败')
                    }

                    const transcript = String(asrRes.data || '').trim()
                    if (!transcript) {
                        throw new Error('转写结果为空')
                    }

                    samples.push({ title: videoTitle, transcript })

                    setBatchResults((prev) => {
                        const next = [...prev]
                        next[i] = { ...next[i], copy: transcript, status: 'success', error: undefined }
                        return next
                    })
                } catch (e: any) {
                    const errMsg = e?.message || '失败'
                    setBatchResults((prev) => {
                        const next = [...prev]
                        next[i] = { ...next[i], status: 'error', error: errMsg }
                        return next
                    })
                }

                // 避免频率过高触发风控
                if (i < videos.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 800 + Math.random() * 600))
                }
            }

            if (samples.length === 0) {
                throw new Error('未能提取到任何可用逐字稿，请换一组作品重试')
            }

            const usableSamples = samples.slice(0, 5)
            setBenchmarkSamples(usableSamples)

            setBenchmarkProgress({ percent: 75, title: '学习账号规律', detail: 'AI 正在总结对标博主的打法...' })
            setPreview('text', `🤖 AI 正在学习对标账号规律...\n\n正在生成 4 个选题...`)

            const topicsRes = await window.electronAPI.invoke('benchmark-generate-topics', {
                profileUrl: douyinUrl,
                samples: usableSamples,
                count: 4,
            })
            if (!topicsRes?.success) {
                throw new Error(topicsRes?.error || '生成选题失败')
            }

            const normalizedTopics = (Array.isArray(topicsRes.data) ? topicsRes.data : [])
                .map((t: any) => ({
                    title: String(t?.title || '').trim(),
                    hook: t?.hook ? String(t.hook).trim() : undefined,
                    angle: t?.angle ? String(t.angle).trim() : undefined,
                }))
                .filter((t: BenchmarkTopic) => t.title)
                .slice(0, 4)

            if (normalizedTopics.length === 0) {
                throw new Error('未生成可用选题，请重试')
            }

            setBenchmarkTopics(normalizedTopics)
            setBenchmarkProgress({ percent: 100, title: '学习完成', detail: '已生成 4 个选题' })
            setPreview('text', `✅ 学习完成！\n\n请选择一个选题，开始生成逐字稿。`)
            message.success('学习完成：已生成 4 个选题')
        } catch (e: any) {
            setBenchmarkProgress((prev) => ({
                ...prev,
                percent: Math.max(10, prev.percent),
                title: '学习失败',
                detail: e?.message || '学习失败，请重试',
            }))
            message.error(e?.message || '学习失败')
            setPreview('text', `❌ 学习失败：${e?.message || '请重试'}`)
        } finally {
            setBenchmarkLearning(false)
        }
    }

    const handleGenerateBenchmarkScript = async (topic: BenchmarkTopic, index: number) => {
        if (!window.electronAPI?.invoke) {
            message.error('桌面端接口未就绪，请重启应用')
            return
        }
        if (benchmarkLearning) return
        if (benchmarkGeneratingTopicIndex !== null) return
        if (!topic?.title) return
        if (benchmarkSamples.length === 0) {
            message.warning('请先选择样本并完成学习')
            return
        }

        setBenchmarkGeneratingTopicIndex(index)
        setPreview('text', `✍️ 正在生成逐字稿...\n\n选题：${topic.title}`)

        try {
            const res = await window.electronAPI.invoke('benchmark-generate-script', {
                profileUrl: douyinUrl,
                samples: benchmarkSamples,
                topic: topic.title,
            })
            if (!res?.success || !res.data) {
                throw new Error(res?.error || '生成失败')
            }

            const script = String(res.data || '').trim()
            if (!script) throw new Error('生成内容为空')

            setBatchVideos([])
            setBatchCopies([])
            setBatchRewrittenCopies([])

            setOriginalCopy(script)
            setPreview('text', script)

            message.success('逐字稿已生成，进入「变原创」')
            setActiveKey('rewrite')
        } catch (e: any) {
            message.error(`生成逐字稿失败: ${e?.message || '请重试'}`)
            setPreview('text', `❌ 生成逐字稿失败：${e?.message || '请重试'}`)
        } finally {
            setBenchmarkGeneratingTopicIndex(null)
        }
    }

    const handleAccountDiagnosis = async () => {
        if (!window.electronAPI?.invoke) {
            message.error('桌面端接口未就绪，请重启应用')
            return
        }

        if (!douyinUrl) {
            message.warning('请输入你的抖音主页链接')
            return
        }

        if (diagnosisRunning) return

        setDiagnosisRunning(true)
        setDiagnosisReport('')
        setDiagnosisProgress({ percent: 5, title: '准备诊断', detail: '正在检查链接...' })
        setPreview('text', '🔎 正在生成账号诊断报告...')

        try {
            const checkRes = await window.electronAPI.invoke('douyin-check-url-type', douyinUrl)
            if (checkRes?.success && checkRes.data && !checkRes.data.isProfile) {
                throw new Error('请输入抖音主页链接（例如：https://www.douyin.com/user/xxxxx）')
            }

            const diagnosisCount = 5
            setDiagnosisProgress({ percent: 10, title: '抓取作品列表', detail: `准备分析最近 ${diagnosisCount} 条作品...` })

            const listRes = await window.electronAPI.invoke('douyin-fetch-profile-videos', douyinUrl, diagnosisCount)
            if (!listRes?.success) {
                throw new Error(listRes?.error || '抓取主页失败')
            }

            const videos: any[] = Array.isArray(listRes.data) ? listRes.data.slice(0, diagnosisCount) : []
            if (videos.length === 0) {
                throw new Error('未获取到可诊断的作品，请确认主页链接是否正确')
            }

            const samples: Array<{ title: string; transcript: string }> = []

            for (let i = 0; i < videos.length; i++) {
                const video = videos[i]
                const videoTitle = String(video?.title || `作品 ${i + 1}`).trim()

                setDiagnosisProgress({
                    percent: 10 + Math.round((i / videos.length) * 60),
                    title: `提取内容 ${i + 1}/${videos.length}`,
                    detail: videoTitle,
                })

                const downloadRes = await window.electronAPI.invoke('download-video', video.url)
                if (!downloadRes?.success || !downloadRes.data?.videoPath) {
                    continue
                }

                if (i === 0) {
                    setVideoPath(downloadRes.data.videoPath)
                }

                const asrRes = await window.electronAPI.invoke('transcribe-audio', downloadRes.data.videoPath)
                if (!asrRes?.success || !asrRes.data) {
                    continue
                }

                const transcript = String(asrRes.data || '').trim()
                if (!transcript) continue

                samples.push({ title: videoTitle, transcript })

                if (i < videos.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 1800 + Math.random() * 900))
                }
            }

            if (samples.length === 0) {
                throw new Error('作品内容提取失败：请稍后重试')
            }

            setDiagnosisProgress({ percent: 85, title: '生成诊断报告', detail: 'AI 正在生成结构化报告...' })
            const diagRes = await window.electronAPI.invoke('account-diagnose', {
                profileUrl: douyinUrl,
                samples,
            })
            if (!diagRes?.success) {
                throw new Error(diagRes?.error || '诊断失败')
            }

            const raw = String(diagRes.data || '').trim()
            setDiagnosisReport(raw)
            setPreview('text', raw || '诊断完成（报告为空）')
            setDiagnosisProgress({ percent: 100, title: '诊断完成', detail: '已生成报告' })
            message.success('账号诊断完成')
        } catch (e: any) {
            setDiagnosisProgress((prev) => ({
                ...prev,
                percent: Math.max(10, prev.percent),
                title: '诊断失败',
                detail: e?.message || '诊断失败，请重试',
            }))
            message.error(e?.message || '诊断失败')
            setPreview('text', `❌ 诊断失败：${e?.message || '请重试'}`)
        } finally {
            setDiagnosisRunning(false)
        }
    }



    const progressItems = [
        { key: 'material', title: '🔍 找对标', subtitle: '找到爆款视频', done: !!(videoPath || finalVideoPath || inputAudioPath) },
        { key: 'rewrite', title: '✨ 变原创', subtitle: 'AI改写成你的', done: !!rewrittenCopy },
        { key: 'digitalHuman', title: '🎭 数字人', subtitle: '生成AI分身', done: !!digitalHumanVideoPath },
        { key: 'publish', title: '🚀 一键发', subtitle: '全网自动分发', done: !!finalVideoPath },
    ]

    // audio 面板属于「数字人」步骤的子流程：侧栏仍高亮在数字人，避免用户误以为跳回“找对标”
    const sidebarKey = activeKey === 'audio' ? 'digitalHuman' : activeKey

    const activeIndex = Math.max(0, progressItems.findIndex((i) => i.key === sidebarKey))
    const currentItemTitle = progressItems.find((i) => i.key === sidebarKey)?.title || '步骤'
    const showPreviewPanel = sidebarKey !== 'digitalHuman'

    const autoSteps = [
        { key: 'auto_material' as const, title: '解析素材', subtitle: '下载/解析视频', done: !!autoSourceVideoPath },
        { key: 'auto_extract' as const, title: '提取文案', subtitle: '语音识别获取内容', done: !!autoExtractedCopy },
        { key: 'auto_rewrite' as const, title: 'AI 变原创', subtitle: '生成原创文案', done: !!autoRewrittenCopy },
        { key: 'auto_legal' as const, title: 'AI 法务', subtitle: '排查违禁/限流用语', done: !!autoLegalReport && autoLegalProgress === 100 },
        { key: 'auto_audio' as const, title: 'AI 配音', subtitle: '使用已克隆音色', done: !!autoAudioPath },
        { key: 'auto_digital' as const, title: '数字人出片', subtitle: '生成最终视频', done: !!autoFinalVideoPath },
        { key: 'auto_review' as const, title: '完成 & 审核', subtitle: '审核后全网分发', done: !!autoFinalVideoPath },
    ]

    const autoActiveIndex = Math.max(0, autoSteps.findIndex((i) => i.key === autoActiveStep))
    const autoCurrentTitle = autoSteps.find((i) => i.key === autoActiveStep)?.title || '全自动出片'

    useEffect(() => {
        if (workspaceMode !== 'auto') return
        void refreshAutoReadiness()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [workspaceMode])

    useEffect(() => {
        if (!autoRunning || autoActiveStep !== 'auto_digital') return
        const mapped = 75 + Math.floor(Math.max(0, Math.min(100, digitalHumanProgress)) * 0.25)
        setAutoPercent((prev) => Math.max(prev, mapped))
        if (digitalHumanProgressText) {
            setAutoStatusText(digitalHumanProgressText)
        }
    }, [autoRunning, autoActiveStep, digitalHumanProgress, digitalHumanProgressText])

    const getAutoLegalPhaseText = (percent: number) => {
        if (percent < 20) return '正在加载各平台规则库与广告法要点...'
        if (percent < 45) return '正在扫描违禁词/敏感词/导流表达...'
        if (percent < 70) return '正在核验绝对化用语、收益承诺、医疗功效等高风险点...'
        if (percent < 90) return '正在结合常见限流触发点进行二次交叉检查...'
        return '正在生成合规建议与替换方案...'
    }

    const renderAutoAuditTag = (status: LegalAuditReport['status']) => {
        if (status === 'pass') return <Tag color="green">通过</Tag>
        if (status === 'attention') return <Tag color="gold">建议优化</Tag>
        return <Tag color="red">高风险</Tag>
    }

    const renderAutoPanel = () => {
        const urlTrimmed = douyinUrl.trim()
        const voiceId = getStoredCloudVoiceId()
        const avatar = autoAvatars.find((a) => a.id === autoSelectedAvatarId) || autoAvatars[0]

        const disabledReason = (() => {
            if (autoRunning) return '流程运行中'
            if (!urlTrimmed) return '请先粘贴短视频链接'
            if (autoCheckLoading) return '正在检测服务'
            if (!autoVoiceReady) return '音色未就绪（请先克隆/选择）'
            if (!autoAvatarReady) return '形象未就绪（请先创建）'
            if (!voiceId) return '未选择音色'
            if (!avatar?.remoteVideoPath) return '未选择可用形象'
            return ''
        })()

        const showProgressCard = autoRunning || autoPercent > 0 || !!autoError

        const stepBody = (() => {
            switch (autoActiveStep) {
                case 'auto_extract':
                    return (
                        <Card
                            styles={{ body: { padding: 16 } }}
                            style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 16,
                            }}
                        >
                            <Typography.Text strong style={{ color: 'rgba(255,255,255,0.85)' }}>提取文案</Typography.Text>
                            <Input.TextArea
                                value={autoExtractedCopy}
                                readOnly
                                autoSize={{ minRows: 6, maxRows: 12 }}
                                style={{ marginTop: 12, borderRadius: 12 }}
                            />
                        </Card>
                    )
                case 'auto_rewrite':
                    return (
                        <Card
                            styles={{ body: { padding: 16 } }}
                            style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 16,
                            }}
                        >
                            <Typography.Text strong style={{ color: 'rgba(255,255,255,0.85)' }}>AI 变原创</Typography.Text>
                            <Input.TextArea
                                value={autoRewrittenCopy}
                                readOnly
                                autoSize={{ minRows: 6, maxRows: 12 }}
                                style={{ marginTop: 12, borderRadius: 12 }}
                            />
                        </Card>
                    )
                case 'auto_legal':
                    return (
                        <Card
                            styles={{ body: { padding: 16 } }}
                            style={{
                                background: 'linear-gradient(135deg, rgba(146,84,222,0.10), rgba(0,212,170,0.06))',
                                border: '1px solid rgba(146,84,222,0.22)',
                                borderRadius: 16,
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                <Typography.Text strong style={{ color: 'rgba(255,255,255,0.85)' }}>AI 法务</Typography.Text>
                                {autoLegalReport ? renderAutoAuditTag(autoLegalReport.status) : null}
                            </div>

                            {autoLegalRunning ? (
                                <div style={{ marginTop: 12 }}>
                                    <Progress
                                        percent={autoLegalProgress}
                                        status="active"
                                        strokeColor={{ from: '#9254de', to: '#00d4aa' }}
                                        trailColor="rgba(255,255,255,0.08)"
                                    />
                                    <div style={{ marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.70)' }}>
                                        {getAutoLegalPhaseText(autoLegalProgress)}
                                    </div>
                                    <div style={{ marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.50)' }}>
                                        <div style={{ fontWeight: 700, marginBottom: 8, color: 'rgba(255,255,255,0.72)' }}>检查依据（来源）：</div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {LEGAL_AUDIT_BASIS.map((item) => (
                                                <div key={item} style={{ display: 'flex', gap: 8, lineHeight: 1.6 }}>
                                                    <span style={{ color: '#d3adf7' }}>•</span>
                                                    <span>{item}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : autoLegalReport ? (
                                <div style={{ marginTop: 12 }}>
                                    <div style={{ color: 'rgba(255,255,255,0.86)', lineHeight: 1.6 }}>{autoLegalReport.summary}</div>
                                    {autoLegalReport.hits?.length ? (
                                        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                            {autoLegalReport.hits.slice(0, 6).map((hit, i) => (
                                                <div
                                                    key={`${hit.category}-${hit.term}-${i}`}
                                                    style={{
                                                        background: 'rgba(255,255,255,0.03)',
                                                        border: '1px solid rgba(255,255,255,0.08)',
                                                        borderRadius: 14,
                                                        padding: '12px 14px',
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                                        <div style={{ fontWeight: 800, color: 'rgba(255,255,255,0.88)' }}>{hit.category}</div>
                                                        <Tag color={hit.severity === 'high' ? 'red' : hit.severity === 'medium' ? 'gold' : 'blue'}>
                                                            {hit.severity.toUpperCase()}
                                                        </Tag>
                                                    </div>
                                                    <div style={{ marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>
                                                        命中：<span style={{ color: '#fff', fontWeight: 800 }}>{hit.term}</span> × {hit.count}
                                                    </div>
                                                    <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.58)', lineHeight: 1.6 }}>
                                                        建议：{hit.suggestion}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            ) : (
                                <div style={{ marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>法务检查会在「AI 变原创」后自动触发。</div>
                            )}
                        </Card>
                    )
                case 'auto_audio':
                    return (
                        <Card
                            styles={{ body: { padding: 16 } }}
                            style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 16,
                            }}
                        >
                            <Typography.Text strong style={{ color: 'rgba(255,255,255,0.85)' }}>AI 配音</Typography.Text>
                            <div style={{ marginTop: 10, fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
                                {autoAudioPath ? `已生成配音：${autoAudioPath}` : '尚未生成配音'}
                            </div>
                        </Card>
                    )
                case 'auto_digital':
                    return (
                        <Card
                            styles={{ body: { padding: 16 } }}
                            style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 16,
                            }}
                        >
                            <Typography.Text strong style={{ color: 'rgba(255,255,255,0.85)' }}>数字人出片</Typography.Text>
                            <div style={{ marginTop: 12 }}>
                                <Progress
                                    percent={Math.round(Math.max(0, Math.min(100, digitalHumanProgress)))}
                                    status={autoRunning ? 'active' : 'normal'}
                                    strokeColor={{ from: '#00d4aa', to: '#9254de' }}
                                    trailColor="rgba(255,255,255,0.08)"
                                />
                                <div style={{ marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.70)' }}>
                                    {digitalHumanProgressText || (autoFinalVideoPath ? '出片完成' : '等待进度更新...')}
                                </div>
                            </div>
                        </Card>
                    )
                case 'auto_review':
                    return (
                        <Card
                            styles={{ body: { padding: 16 } }}
                            style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 16,
                            }}
                        >
                            <Typography.Text strong style={{ color: 'rgba(255,255,255,0.85)' }}>完成 & 审核</Typography.Text>
                            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 10, lineHeight: 1.6 }}>
                                只需两步：1) 粘贴链接开始全自动出片 2) 审核没问题后，一键全网分发。
                            </div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                                <Button
                                    type="primary"
                                    disabled={!autoFinalVideoPath}
                                    onClick={() => setAutoPublishOpen(true)}
                                    style={{ borderRadius: 12, border: 'none', fontWeight: 900, background: 'linear-gradient(135deg, #9254de, #00d4aa)' }}
                                >
                                    一键全网分发
                                </Button>
                                <Button onClick={() => setAutoDetailOpen(true)} disabled={autoLogs.length === 0}>
                                    查看进度详情
                                </Button>
                            </div>
                        </Card>
                    )
                default:
                    return null
            }
        })()

        return (
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
                <Card
                    styles={{ body: { padding: 16 } }}
                    style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 16,
                    }}
                >
                    <Typography.Text strong style={{ fontSize: 16, color: 'rgba(255,255,255,0.85)' }}>粘贴短视频链接</Typography.Text>
                    <Input
                        placeholder="例如：https://v.douyin.com/xxxxx"
                        size="large"
                        value={douyinUrl}
                        onChange={(e) => setDouyinUrl(e.target.value)}
                        disabled={autoRunning}
                        style={{ marginTop: 12, borderRadius: 12 }}
                    />
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
                        <Button
                            type="primary"
                            icon={<RocketOutlined />}
                            onClick={startAutoPipeline}
                            disabled={!!disabledReason}
                            style={{ borderRadius: 12, border: 'none', fontWeight: 900, background: 'linear-gradient(135deg, #9254de, #00d4aa)' }}
                        >
                            开始全自动出片
                        </Button>
                        <Button icon={<ReloadOutlined />} loading={autoCheckLoading} onClick={() => void refreshAutoReadiness()}>
                            刷新检测
                        </Button>
                        <Button onClick={() => setAutoDetailOpen(true)} disabled={autoLogs.length === 0}>
                            查看进度详情
                        </Button>
                        {!autoVoiceReady && (
                            <Button onClick={() => { setSettingsTab('voice'); setSettingsOpen(true) }}>
                                去克隆声音
                            </Button>
                        )}
                        {!autoAvatarReady && (
                            <Button onClick={() => { setWorkspaceMode('manual'); setActiveKey('digitalHuman') }}>
                                去创建数字人形象
                            </Button>
                        )}
                    </div>
                    {disabledReason && (
                        <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                            当前不可开始：{disabledReason}
                        </div>
                    )}
                </Card>

                {showProgressCard && (
                    <Card
                        styles={{ body: { padding: 16 } }}
                        style={{
                            background: 'rgba(255,255,255,0.03)',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 16,
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                            <Typography.Text strong style={{ color: 'rgba(255,255,255,0.85)' }}>全自动进度</Typography.Text>
                            {autoError ? <Tag color="red">失败</Tag> : autoPercent >= 100 ? <Tag color="green">完成</Tag> : autoRunning ? <Tag color="blue">进行中</Tag> : null}
                        </div>
                        <Progress
                            percent={Math.max(0, Math.min(100, autoPercent))}
                            status={autoError ? 'exception' : (autoRunning ? 'active' : 'normal')}
                            strokeColor={{ from: '#9254de', to: '#00d4aa' }}
                        />
                        <div style={{ marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.70)' }}>{autoStatusText || '—'}</div>
                        {autoError && <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,77,79,0.85)' }}>{autoError}</div>}
                    </Card>
                )}

                {stepBody}
            </Space>
        )
    }


    const renderActivePanel = () => {
        switch (activeKey) {
            case 'material':
                return (
                    <Space direction="vertical" style={{ width: '100%' }} size={24}>
                        {/* 模式选择 */}
                        {!parseMode ? (
                            <>
                                <Typography.Text strong style={{ fontSize: 20, display: 'block', color: 'var(--text-primary)' }}>
                                    请选择找对标的方式
                                </Typography.Text>
                                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                                    {/* 选项1：按单个视频 */}
                                    <div
                                        onClick={() => {
                                            resetBenchmarkFlow()
                                            resetDiagnosisFlow()
                                            setParseMode('single')
                                        }}
                                        style={{
                                            flex: 1,
                                            minWidth: 260,
                                            padding: 32,
                                            borderRadius: 16,
                                            background: 'linear-gradient(135deg, rgba(0, 212, 170, 0.08), rgba(0, 184, 148, 0.04))',
                                            border: '2px solid rgba(0, 212, 170, 0.2)',
                                            cursor: 'pointer',
                                            textAlign: 'center',
                                            transition: 'all 0.2s ease',
                                        }}
                                    >
                                        <DownloadOutlined style={{ fontSize: 48, color: 'var(--primary-color)', marginBottom: 16 }} />
                                        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                                            按单个视频
                                        </div>
                                        <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                                            粘贴一个抖音视频链接，下载视频并提取文案
                                        </div>
                                    </div>

                                    {/* 选项2：对标博主主页 */}
                                    <div
                                        onClick={() => {
                                            resetBenchmarkFlow()
                                            resetDiagnosisFlow()
                                            setParseMode('profile')
                                        }}
                                        style={{
                                            flex: 1,
                                            minWidth: 260,
                                            padding: 32,
                                            borderRadius: 16,
                                            background: 'linear-gradient(135deg, rgba(0, 212, 170, 0.08), rgba(0, 184, 148, 0.04))',
                                            border: '2px solid rgba(0, 212, 170, 0.2)',
                                            cursor: 'pointer',
                                            textAlign: 'center',
                                            transition: 'all 0.2s ease',
                                        }}
                                    >
                                        <UserOutlined style={{ fontSize: 48, color: 'var(--primary-color)', marginBottom: 16 }} />
                                        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                                            对标博主主页
                                        </div>
                                        <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                                            粘贴对标博主主页链接，选择 1-5 条作品，AI 学习打法并生成原创选题
                                        </div>
                                    </div>

                                    {/* 选项3：账号诊断报告 */}
                                    <div
                                        onClick={() => {
                                            resetBenchmarkFlow()
                                            resetDiagnosisFlow()
                                            setParseMode('diagnosis')
                                        }}
                                        style={{
                                            flex: 1,
                                            minWidth: 260,
                                            padding: 32,
                                            borderRadius: 16,
                                            background: 'linear-gradient(135deg, rgba(24, 144, 255, 0.10), rgba(24, 144, 255, 0.04))',
                                            border: '2px solid rgba(24, 144, 255, 0.22)',
                                            cursor: 'pointer',
                                            textAlign: 'center',
                                            transition: 'all 0.2s ease',
                                        }}
                                    >
                                        <FileSearchOutlined style={{ fontSize: 48, color: '#1890ff', marginBottom: 16 }} />
                                        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                                            账号诊断报告
                                        </div>
                                        <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                                            粘贴你自己的主页链接，AI 分析最近作品并输出提升建议
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                {/* 返回按钮 */}
                                 <Button
                                     type="link"
                                      onClick={() => {
                                          setParseMode(null)
                                          resetBenchmarkFlow()
                                          resetDiagnosisFlow()
                                      }}
                                      style={{ padding: 0, color: 'var(--text-secondary)' }}
                                  >
                                      ← 返回选择
                                  </Button>

                                {/* 输入区域 */}
                                 <div style={{
                                      background: 'linear-gradient(135deg, rgba(0, 212, 170, 0.1), rgba(0, 184, 148, 0.05))',
                                      borderRadius: 16,
                                      padding: 24,
                                      border: '1px solid rgba(0, 212, 170, 0.2)'
                                  }}>
                                      <Typography.Text strong style={{ fontSize: 18, marginBottom: 16, display: 'block', color: 'var(--accent)' }}>
                                          {parseMode === 'single' ? '粘贴抖音视频链接' : parseMode === 'profile' ? '粘贴对标博主主页链接' : '粘贴我的主页链接'}
                                      </Typography.Text>
                                     <Input
                                         placeholder={parseMode === 'single' ? '例如：https://v.douyin.com/xxxxx' : '例如：https://www.douyin.com/user/xxxxx'}
                                         size="large"
                                         value={douyinUrl}
                                         onChange={(e) => setDouyinUrl(e.target.value)}
                                        style={{
                                            borderRadius: 12,
                                            fontSize: 16,
                                            padding: '14px 18px',
                                            marginBottom: 16
                                        }}
                                    />
                                      {parseMode === 'single' ? (
                                          <Button
                                              type="primary"
                                              size="large"
                                              icon={<DownloadOutlined />}
                                              disabled={!douyinUrl}
                                              loading={isTracking}
                                              onClick={() => handleDownloadSingle()}
                                              style={{ height: 48, fontSize: 16 }}
                                          >
                                              开始解析视频
                                          </Button>
                                      ) : parseMode === 'profile' ? (
                                          <Button
                                              type="primary"
                                              size="large"
                                              icon={<UserOutlined />}
                                              disabled={!douyinUrl || benchmarkLearning || benchmarkGeneratingTopicIndex !== null}
                                              loading={isTracking}
                                              onClick={handleFetchProfile}
                                              style={{ height: 48, fontSize: 16 }}
                                          >
                                              选择样本视频（最多5个）
                                          </Button>
                                      ) : (
                                          <Button
                                              type="primary"
                                              size="large"
                                              icon={<FileSearchOutlined />}
                                              disabled={!douyinUrl || diagnosisRunning}
                                              loading={diagnosisRunning}
                                              onClick={handleAccountDiagnosis}
                                              style={{ height: 48, fontSize: 16 }}
                                          >
                                              生成诊断报告
                                          </Button>
                                      )}
                                  </div>
                              </>
                          )}

                        {parseMode === 'profile' && (benchmarkLearning || benchmarkProgress.percent > 0 || benchmarkTopics.length > 0) && (
                            <Card
                                style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid var(--border)',
                                }}
                                bodyStyle={{ padding: 16 }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <Typography.Text strong style={{ fontSize: 16 }}>对标博主学习进度</Typography.Text>
                                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                        {benchmarkLearning ? 'AI 学习中…' : (benchmarkTopics.length > 0 ? '已完成' : '待开始')}
                                    </Typography.Text>
                                </div>
                                <Progress
                                    percent={benchmarkProgress.percent}
                                    status={benchmarkProgress.title === '学习失败' ? 'exception' : benchmarkLearning ? 'active' : 'success'}
                                />
                                <div style={{ marginTop: 8, fontSize: 14, color: 'var(--text-primary)' }}>
                                    {benchmarkProgress.title || (benchmarkLearning ? 'AI 学习中…' : '')}
                                </div>
                                <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                                    {benchmarkProgress.detail}
                                </div>
                            </Card>
                        )}

                        {parseMode === 'profile' && benchmarkTopics.length > 0 && (
                            <Card
                                style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid var(--border)',
                                }}
                                bodyStyle={{ padding: 16 }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <Typography.Text strong style={{ fontSize: 16 }}>AI 生成的 4 个选题</Typography.Text>
                                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>选一个生成逐字稿 → 自动进入「变原创」</Typography.Text>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
                                    {benchmarkTopics.slice(0, 4).map((topic, idx) => (
                                        <Card
                                            key={`${idx}-${topic.title}`}
                                            style={{
                                                background: 'rgba(0,0,0,0.35)',
                                                border: '1px solid rgba(255,255,255,0.08)',
                                            }}
                                            bodyStyle={{ padding: 14 }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                                <div style={{ fontWeight: 800, lineHeight: 1.4 }}>
                                                    {idx + 1}. {topic.title}
                                                </div>
                                                <Button
                                                    type="primary"
                                                    size="small"
                                                    loading={benchmarkGeneratingTopicIndex === idx}
                                                    disabled={benchmarkLearning || benchmarkGeneratingTopicIndex !== null}
                                                    onClick={() => handleGenerateBenchmarkScript(topic, idx)}
                                                >
                                                    生成逐字稿
                                                </Button>
                                            </div>
                                            {topic.hook ? (
                                                <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.75)', fontSize: 12, lineHeight: 1.6 }}>
                                                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>钩子：</span>
                                                    {topic.hook}
                                                </div>
                                            ) : null}
                                            {topic.angle ? (
                                                <div style={{ marginTop: 6, color: 'rgba(255,255,255,0.75)', fontSize: 12, lineHeight: 1.6 }}>
                                                    <span style={{ color: 'rgba(255,255,255,0.5)' }}>角度：</span>
                                                    {topic.angle}
                                                </div>
                                            ) : null}
                                        </Card>
                                    ))}
                                </div>
                            </Card>
                        )}

                        {parseMode === 'diagnosis' && (diagnosisRunning || diagnosisProgress.percent > 0 || diagnosisReport) && (
                            <Card
                                style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid var(--border)',
                                }}
                                bodyStyle={{ padding: 16 }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <Typography.Text strong style={{ fontSize: 16 }}>账号诊断进度</Typography.Text>
                                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                        {diagnosisRunning ? 'AI 诊断中…' : (diagnosisReport ? '已完成' : '待开始')}
                                    </Typography.Text>
                                </div>
                                <Progress
                                    percent={diagnosisProgress.percent}
                                    status={diagnosisProgress.title === '诊断失败' ? 'exception' : diagnosisRunning ? 'active' : 'success'}
                                />
                                <div style={{ marginTop: 8, fontSize: 14, color: 'var(--text-primary)' }}>
                                    {diagnosisProgress.title || (diagnosisRunning ? 'AI 诊断中…' : '')}
                                </div>
                                <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                                    {diagnosisProgress.detail}
                                </div>
                            </Card>
                        )}

                        {parseMode === 'diagnosis' && diagnosisReport && (
                            <Card
                                style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid var(--border)',
                                }}
                                bodyStyle={{ padding: 16 }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                    <Typography.Text strong style={{ fontSize: 16 }}>账号诊断报告</Typography.Text>
                                    <Button
                                        size="small"
                                        icon={<CopyOutlined />}
                                        onClick={() => {
                                            navigator.clipboard.writeText(diagnosisReport)
                                            message.success('已复制诊断报告')
                                        }}
                                    >
                                        复制报告
                                    </Button>
                                </div>
                                <div style={{
                                    background: '#000',
                                    padding: 12,
                                    borderRadius: 8,
                                    whiteSpace: 'pre-wrap',
                                    color: 'rgba(255,255,255,0.85)',
                                    lineHeight: 1.7,
                                    maxHeight: 420,
                                    overflowY: 'auto',
                                }}>
                                    {diagnosisReport}
                                </div>
                            </Card>
                        )}

                        {/* 批量解析结果展示区 */}
                        {batchResults.length > 0 && (
                            <div style={{ marginTop: 24 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <Typography.Title level={4} style={{ margin: 0, color: 'var(--accent)' }}>
                                        学习样本逐字稿 ({batchResults.filter(r => r.status === 'success').length}/{batchResults.length})
                                    </Typography.Title>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    {batchResults.map((result, index) => (
                                        <Card
                                            key={index}
                                            style={{
                                                background: 'var(--bg-secondary)',
                                                borderColor: result.status === 'success' ? 'var(--primary-color)' : 'var(--border)'
                                            }}
                                            bodyStyle={{ padding: 16 }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{
                                                        background: 'var(--primary-color)',
                                                        color: '#000',
                                                        borderRadius: '50%',
                                                        width: 24,
                                                        height: 24,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontWeight: 'bold'
                                                    }}>{index + 1}</span>
                                                    <Typography.Text strong style={{ fontSize: 16 }}>{result.title}</Typography.Text>
                                                </div>
                                                {result.status === 'success' ? (
                                                    <Button
                                                        size="small"
                                                        icon={<CopyOutlined />}
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(result.copy)
                                                            message.success('已复制文案')
                                                        }}
                                                    >
                                                        复制
                                                    </Button>
                                                ) : result.status === 'error' ? (
                                                    <Typography.Text type="danger">失败</Typography.Text>
                                                ) : (
                                                    <Spin size="small" />
                                                )}
                                            </div>
                                            {result.status === 'success' ? (
                                                <div style={{
                                                    background: '#000',
                                                    padding: 12,
                                                    borderRadius: 8,
                                                    maxHeight: 150,
                                                    overflowY: 'auto',
                                                    fontSize: 14,
                                                    color: 'rgba(255,255,255,0.85)',
                                                    lineHeight: 1.6
                                                }}>
                                                    {result.copy}
                                                </div>
                                            ) : result.status === 'error' ? (
                                                <div style={{ color: 'rgba(255,77,79,0.85)', lineHeight: 1.6 }}>
                                                    提取失败：{result.error || '请重试'}
                                                </div>
                                            ) : (
                                                <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                                    正在提取逐字稿...
                                                </div>
                                            )}
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )}
                    </Space>
                )
            case 'copywriting':
                return <CopywritingPanel />
            case 'rewrite':
                return <RewritePanel />
            case 'audio':
                return <AudioPanel />
            case 'digitalHuman':
                return <DigitalHumanPanel />
            case 'subtitle':
                return <SubtitlePanel />
            case 'cover':
                return <CoverPanel />
            case 'title':
                return <TitlePanel />
            case 'publish':
                return <PublishPanel />
            default:
                return null
        }
    }

    return (
        <>
            {/* 顶部工具栏 - 简化版 */}
            <header className="header" style={{ justifyContent: 'center', position: 'relative' }}>
                <div className="header-title" style={{ flex: 'none', justifyContent: 'center', paddingRight: 280 }}>
                    <div className="brand-pill" style={{ fontSize: 16, padding: '8px 16px' }}>AI</div>
                    <div style={{ textAlign: 'center' }}>
                        <div className="brand-name" style={{ fontSize: 28, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                            360行 AI智能体大脑
                            <Tooltip title="点击检查更新">
                                <span
                                    title={`build: ${__BUILD_TIME__}`}
                                    style={{ fontSize: 10, backgroundColor: 'rgba(0, 212, 170, 0.1)', color: '#00d4aa', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(0, 212, 170, 0.3)', verticalAlign: 'middle', fontWeight: 400, cursor: 'pointer' }}
                                    onClick={async () => {
                                        const hide = message.loading('正在检查更新...', 0)
                                        try {
                                            const res = await window.electronAPI?.invoke('check-for-updates')
                                            hide()
                                            if (res?.success && res.data) {
                                                if (res.data.hasUpdate) {
                                                    Modal.confirm({
                                                        title: '发现新版本',
                                                        content: res.data.message,
                                                        okText: '立即下载',
                                                        cancelText: '稍后',
                                                        onOk: () => {
                                                            window.open(res.data.downloadUrl, '_blank')
                                                        },
                                                    })
                                                } else {
                                                    message.success(res.data.message)
                                                }
                                            } else {
                                                message.error(res?.data?.message || res?.error || '检查更新失败')
                                            }
                                        } catch (e: any) {
                                            hide()
                                            message.error('检查更新失败')
                                        }
                                    }}
                                >
                                    v{__APP_VERSION__}
                                </span>
                            </Tooltip>
                        </div>
                        <div className="brand-subtitle" style={{ fontSize: 14 }}>一键生成 · 全网分发 · 躺赚流量</div>
                    </div>
                </div>
                <div className="header-actions" style={{ position: 'absolute', right: 28, top: '50%', transform: 'translateY(-50%)' }}>
                    {digitalHumanGenerating && (
                        <Tooltip title={digitalHumanProgressText || '正在生成数字人视频...'}>
                            <Button
                                size="large"
                                icon={<RocketOutlined />}
                                onClick={() => setActiveKey('digitalHuman')}
                                style={{ marginRight: 12 }}
                            >
                                出片中 {Math.round(digitalHumanProgress)}%
                            </Button>
                        </Tooltip>
                    )}
                    <Space size={8} style={{ marginRight: 12 }}>
                        <CloudServiceStatus kind="voice" />
                        <CloudServiceStatus kind="gpu" />
                    </Space>
                    <Button
                        size="large"
                        icon={<SettingOutlined />}
                        onClick={() => setSettingsOpen(true)}
                    >
                        设置
                    </Button>
                </div>
            </header>

            {/* 主内容区 */}
            <main className="main-content">
                {/* 左侧步骤导航 - 大字版 */}
                <aside className="sidebar">
                    <div style={{ marginBottom: 18 }}>
                        <Segmented
                            block
                            value={workspaceMode}
                            onChange={(value) => setWorkspaceMode(value as WorkspaceMode)}
                            options={[
                                { label: '半自动工作台', value: 'manual' },
                                { label: '全自动出片', value: 'auto' },
                            ]}
                            style={{ background: 'rgba(255,255,255,0.04)', padding: 4, borderRadius: 14 }}
                        />
                    </div>

                    {workspaceMode === 'manual' ? (
                        <>
                            <div style={{ marginBottom: 32 }}>
                                <Typography.Text strong style={{ fontSize: 16, color: 'var(--accent)' }}>
                                    当前第 {activeIndex + 1} 步 / 共 {progressItems.length} 步
                                </Typography.Text>
                                <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.5, color: 'rgba(255,255,255,0.60)' }}>
                                    可随时点击任意步骤跳转；建议按上 → 下顺序完成。
                                </div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {progressItems.map((item, idx) => {
                                    const connectorColor = item.done
                                        ? 'rgba(82,196,26,0.75)'
                                        : (activeIndex === idx ? 'rgba(0, 212, 170, 0.85)' : 'rgba(255,255,255,0.38)')

                                    return (
                                        <div key={item.key}>
                                            <div
                                                onClick={() => handleTabChange(item.key)}
                                                style={{
                                                    padding: '16px 20px',
                                                    borderRadius: 12,
                                                    cursor: 'pointer',
                                                    background: activeIndex === idx
                                                        ? 'linear-gradient(135deg, rgba(0, 212, 170, 0.2), rgba(0, 184, 148, 0.1))'
                                                        : 'rgba(255, 255, 255, 0.03)',
                                                    border: activeIndex === idx
                                                        ? '2px solid var(--primary-color)'
                                                        : '1px solid rgba(255, 255, 255, 0.08)',
                                                    transition: 'all 0.2s ease',
                                                    opacity: item.done ? 1 : (activeIndex === idx ? 1 : 0.78),
                                                }}
                                            >
                                                <div style={{
                                                    fontSize: 22,
                                                    fontWeight: 700,
                                                    color: activeIndex === idx ? 'var(--primary-color)' : 'var(--text-primary)',
                                                    marginBottom: 4,
                                                }}>
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        width: 26,
                                                        height: 26,
                                                        borderRadius: 999,
                                                        fontSize: 13,
                                                        fontWeight: 800,
                                                        marginRight: 10,
                                                        background: item.done
                                                            ? 'rgba(82,196,26,0.15)'
                                                            : activeIndex === idx
                                                                ? 'rgba(0, 212, 170, 0.18)'
                                                                : 'rgba(255,255,255,0.06)',
                                                        border: `1px solid ${item.done
                                                            ? 'rgba(82,196,26,0.28)'
                                                            : activeIndex === idx
                                                                ? 'rgba(0, 212, 170, 0.28)'
                                                                : 'rgba(255,255,255,0.10)'}`,
                                                        color: item.done ? '#52c41a' : activeIndex === idx ? 'var(--primary-color)' : 'rgba(255,255,255,0.65)',
                                                    }}>
                                                        {idx + 1}
                                                    </span>
                                                    {item.title}
                                                </div>
                                                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                                    {(item as any).subtitle || ''}
                                                </div>
                                                {item.done ? (
                                                    <div style={{ fontSize: 12, color: '#52c41a', marginTop: 6 }}>
                                                        ✓ 已完成
                                                    </div>
                                                ) : null}
                                            </div>

                                            {idx < progressItems.length - 1 && (
                                                <div style={{ height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none' }}>
                                                    <span style={{
                                                        width: 26,
                                                        height: 26,
                                                        borderRadius: 999,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        background: 'rgba(255, 255, 255, 0.04)',
                                                        border: '1px solid rgba(255, 255, 255, 0.12)',
                                                        color: connectorColor,
                                                        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.25)',
                                                    }}>
                                                        <DownOutlined style={{ fontSize: 14 }} />
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </>
                    ) : (
                        <>
                            <div style={{ marginBottom: 22 }}>
                                <Typography.Text strong style={{ fontSize: 16, color: '#d3adf7' }}>
                                    当前第 {autoActiveIndex + 1} 步 / 共 {autoSteps.length} 步
                                </Typography.Text>
                                <div style={{ marginTop: 10, fontSize: 12, lineHeight: 1.5, color: 'rgba(255,255,255,0.60)' }}>
                                    只需两步：1) 输入链接开始出片 2) 审核后全网分发；步骤可随时点开查看。
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
                                    <Tag color={autoVoiceReady ? 'green' : 'red'}>{autoVoiceReady ? '音色已就绪' : '音色未就绪'}</Tag>
                                    <Tag color={autoAvatarReady ? 'green' : 'red'}>{autoAvatarReady ? '形象已就绪' : '形象未就绪'}</Tag>
                                    <Button size="small" icon={<ReloadOutlined />} loading={autoCheckLoading} onClick={() => void refreshAutoReadiness()}>
                                        刷新检测
                                    </Button>
                                </div>
                                <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
                                    <div>{autoVoiceStatusText || '语音服务：—'}</div>
                                    <div>{autoGpuStatusText || '数字人服务：—'}{autoGpuEndpoint ? `（${autoGpuEndpoint}）` : ''}</div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {autoSteps.map((item, idx) => {
                                    const connectorColor = item.done
                                        ? 'rgba(82,196,26,0.75)'
                                        : (autoActiveIndex === idx ? 'rgba(146,84,222,0.85)' : 'rgba(255,255,255,0.38)')

                                    return (
                                        <div key={item.key}>
                                            <div
                                                onClick={() => setAutoActiveStep(item.key)}
                                                style={{
                                                    padding: '14px 18px',
                                                    borderRadius: 12,
                                                    cursor: 'pointer',
                                                    background: autoActiveIndex === idx
                                                        ? 'linear-gradient(135deg, rgba(146,84,222,0.18), rgba(0,212,170,0.08))'
                                                        : 'rgba(255, 255, 255, 0.03)',
                                                    border: autoActiveIndex === idx
                                                        ? '2px solid rgba(146,84,222,0.45)'
                                                        : '1px solid rgba(255, 255, 255, 0.08)',
                                                    transition: 'all 0.2s ease',
                                                    opacity: item.done ? 1 : (autoActiveIndex === idx ? 1 : 0.78),
                                                }}
                                            >
                                                <div style={{ fontSize: 18, fontWeight: 800, color: autoActiveIndex === idx ? '#d3adf7' : 'var(--text-primary)', marginBottom: 4 }}>
                                                    <span style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        width: 26,
                                                        height: 26,
                                                        borderRadius: 999,
                                                        fontSize: 13,
                                                        fontWeight: 800,
                                                        marginRight: 10,
                                                        background: item.done
                                                            ? 'rgba(82,196,26,0.15)'
                                                            : autoActiveIndex === idx
                                                                ? 'rgba(146,84,222,0.18)'
                                                                : 'rgba(255,255,255,0.06)',
                                                        border: `1px solid ${item.done
                                                            ? 'rgba(82,196,26,0.28)'
                                                            : autoActiveIndex === idx
                                                                ? 'rgba(146,84,222,0.28)'
                                                                : 'rgba(255,255,255,0.10)'}`,
                                                        color: item.done ? '#52c41a' : autoActiveIndex === idx ? '#d3adf7' : 'rgba(255,255,255,0.65)',
                                                    }}>
                                                        {idx + 1}
                                                    </span>
                                                    {item.title}
                                                </div>
                                                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{item.subtitle}</div>
                                                {item.done ? (
                                                    <div style={{ fontSize: 12, color: '#52c41a', marginTop: 6 }}>
                                                        ✓ 已完成
                                                    </div>
                                                ) : null}
                                            </div>

                                            {idx < autoSteps.length - 1 && (
                                                <div style={{ height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none' }}>
                                                    <span style={{
                                                        width: 26,
                                                        height: 26,
                                                        borderRadius: 999,
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        background: 'rgba(255, 255, 255, 0.04)',
                                                        border: '1px solid rgba(255, 255, 255, 0.12)',
                                                        color: connectorColor,
                                                        boxShadow: '0 6px 18px rgba(0, 0, 0, 0.25)',
                                                    }}>
                                                        <DownOutlined style={{ fontSize: 14 }} />
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </>
                    )}
                </aside>

                {/* 中间操作区 */}
                <section className="workspace">
                    <div className="step-card">
                        <div className="step-card-title" style={{ fontSize: 28, marginBottom: 28, display: 'flex', alignItems: 'center' }}>
                            <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 48,
                                height: 48,
                                borderRadius: '50%',
                                background: workspaceMode === 'manual'
                                    ? 'linear-gradient(135deg, #00d4aa, #00b894)'
                                    : 'linear-gradient(135deg, #9254de, #00d4aa)',
                                marginRight: 16,
                                fontSize: 22,
                                fontWeight: 700,
                                boxShadow: workspaceMode === 'manual'
                                    ? '0 4px 20px rgba(0, 212, 170, 0.35)'
                                    : '0 4px 20px rgba(146, 84, 222, 0.35)',
                            }}>
                                {workspaceMode === 'manual' ? (activeIndex + 1) : (autoActiveIndex + 1)}
                            </span>
                            <span style={{ fontWeight: 700 }}>{workspaceMode === 'manual' ? currentItemTitle : autoCurrentTitle}</span>
                        </div>

                        <Card
                            className="workbench-panel"
                            styles={{ body: { paddingTop: 18 } }}
                        >
                            {workspaceMode === 'manual' ? renderActivePanel() : renderAutoPanel()}
                        </Card>
                    </div>
                </section>

                {/* 右侧预览区 */}
                {(workspaceMode === 'manual' ? showPreviewPanel : true) && (
                    <aside className="preview-panel">
                        <PreviewPanel />
                    </aside>
                )}
            </main>

            <Modal
                title="全自动出片进度详情"
                open={autoDetailOpen}
                onCancel={() => setAutoDetailOpen(false)}
                footer={null}
                width={760}
                destroyOnClose
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <Progress
                        percent={Math.max(0, Math.min(100, autoPercent))}
                        status={autoError ? 'exception' : (autoRunning ? 'active' : 'normal')}
                        strokeColor={{ from: '#9254de', to: '#00d4aa' }}
                    />
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)' }}>{autoStatusText || '—'}</div>
                    {autoError ? <div style={{ fontSize: 12, color: 'rgba(255,77,79,0.90)' }}>{autoError}</div> : null}

                    <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                        {autoLogs.length === 0 ? '暂无进度记录' : '进度记录（最近 200 条）'}
                    </div>
                    {autoLogs.length > 0 && (
                        <div style={{ maxHeight: 360, overflowY: 'auto', borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)', padding: 12 }}>
                            {autoLogs.map((log, idx) => {
                                const stepTitle = autoSteps.find((s) => s.key === log.step)?.title || log.step
                                return (
                                    <div key={`${log.time}-${idx}`} style={{ padding: '8px 6px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{log.time} · {stepTitle}</div>
                                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.80)', marginTop: 4, lineHeight: 1.5 }}>{log.message}</div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </Modal>

            <Modal
                title="全网分发"
                open={autoPublishOpen}
                onCancel={() => setAutoPublishOpen(false)}
                footer={null}
                width={980}
                destroyOnClose
            >
                <PublishPanel />
            </Modal>

            <Modal
                title="设置"
                open={settingsOpen}
                onCancel={() => setSettingsOpen(false)}
                footer={null}
                width={720}
                destroyOnClose
            >
                <Tabs
                    activeKey={settingsTab}
                    onChange={(key) => setSettingsTab(key)}
                    items={[
                        { key: 'cookie', label: '全网分发账号', children: <CookieSettings /> },
                        { key: 'voice', label: '声音克隆', children: <VoiceCloneSettings /> },
                        ...(adminEnabled ? [{ key: 'server', label: '服务器设置', children: <ServerSettings /> }] : []),
                    ]}
                />
            </Modal>

            <ProfileVideoSelector
                open={profileModalOpen}
                loading={profileLoading}
                videos={profileVideos}
                onBatchSelect={handleBatchVideoSelect}
                onCancel={() => setProfileModalOpen(false)}
                maxSelect={5}
            />
        </>
    )
}

export default App
