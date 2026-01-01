import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { Input, Button, message, Modal, Spin, Tabs, Card, Space, Typography, Tooltip, Progress, Segmented, Tag, Radio, Checkbox } from 'antd'
import {
    DownloadOutlined,
    UserOutlined,
    SettingOutlined,
    CopyOutlined,
    RocketOutlined,
    DownOutlined,
    FileSearchOutlined,
    ExpandOutlined,
    TagsOutlined,
} from '@ant-design/icons'
import {
    addDigitalHumanCommunityVideo,
    loadDigitalHumanCommunity,
    moveDigitalHumanCommunityVideo,
    removeDigitalHumanCommunityVideo,
    updateDigitalHumanCommunityVideo,
    clearDigitalHumanCommunity,
    type DigitalHumanCommunityVideo,
} from './services/digitalHumanCommunity'
import { DigitalHumanCommunityModal } from './components/digitalHuman/DigitalHumanCommunityPanel'
import { useAppStore } from './store/appStore'
import CookieSettings from './components/CookieSettings'
import VoiceCloneSettings from './components/VoiceCloneSettings'
import AvatarSettings from './components/AvatarSettings'
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
import AutoPilotOverlay from './components/AutoPilotOverlay'
import { auditCopyText, type LegalAuditReport } from './services/legalAuditService'
import LegalComplianceSettings from './components/LegalComplianceSettings'
import { LEGAL_DISCLAIMER_TEXT, LEGAL_DISCLAIMER_TITLE } from './legal/disclaimer'
import { acceptLegalConsent, getLegalConsentStatus } from './services/legalConsent'
import AutoExecutionPanel from './components/AutoExecutionPanel'

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
    const [benchmarkProgressModalOpen, setBenchmarkProgressModalOpen] = useState(false)
    const [benchmarkTopicModalOpen, setBenchmarkTopicModalOpen] = useState(false)
    const [selectedBenchmarkTopicIndex, setSelectedBenchmarkTopicIndex] = useState<number | null>(null)

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

    const [legalGateOpen, setLegalGateOpen] = useState(false)
    const [legalGateChecked, setLegalGateChecked] = useState(false)
    const [legalGateLoading, setLegalGateLoading] = useState(true)

    const [autoDemoMode, setAutoDemoMode] = useState<boolean>(() => {
        try {
            return localStorage.getItem('auto.demoMode') === '1'
        } catch {
            return false
        }
    })

    useEffect(() => {
        try {
            localStorage.setItem('auto.demoMode', autoDemoMode ? '1' : '0')
        } catch {
            // ignore
        }
    }, [autoDemoMode])

    const autoStartBtnRef = useRef<HTMLSpanElement | null>(null)
    const autoRefreshBtnRef = useRef<HTMLSpanElement | null>(null)
    const autoDetailBtnRef = useRef<HTMLSpanElement | null>(null)
    const autoProgressCardRef = useRef<HTMLDivElement | null>(null)

    const [communityItems, setCommunityItems] = useState<DigitalHumanCommunityVideo[]>(() => loadDigitalHumanCommunity())
    const [communityPanelOpen, setCommunityPanelOpen] = useState(false)

    // Load community items on mount
    useEffect(() => {
        setCommunityItems(loadDigitalHumanCommunity())
    }, [])

    const handleCommunityUpdate = (items: DigitalHumanCommunityVideo[]) => {
        setCommunityItems(items)
    }

    const handleOpenCommunity = useCallback(() => {
        setCommunityPanelOpen(true)
    }, [])

    const handleClearCommunity = useCallback(() => {
        Modal.confirm({
            title: '确认清空社区素材？',
            content: '此操作将删除所有社区数字人素材，且无法恢复。',
            okText: '清空',
            okType: 'danger',
            cancelText: '取消',
            onOk: () => {
                setCommunityItems([])
                localStorage.removeItem('digitalHuman.community')
                message.success('社区素材已清空')
            },
        })
    }, [])

    const handleAddCommunity = useCallback((item: DigitalHumanCommunityVideo) => {
        const newItems = addDigitalHumanCommunityVideo(item)
        setCommunityItems(newItems)
        message.success('已添加至社区素材')
    }, [])

    const handleUpdateCommunity = useCallback((id: string, updates: Partial<DigitalHumanCommunityVideo>) => {
        const newItems = updateDigitalHumanCommunityVideo(id, updates)
        setCommunityItems(newItems)
        message.success('社区素材已更新')
    }, [])

    const handleRemoveCommunity = useCallback((id: string) => {
        const newItems = removeDigitalHumanCommunityVideo(id)
        setCommunityItems(newItems)
        message.success('社区素材已移除')
    }, [])

    const handleMoveCommunity = useCallback((id: string, direction: 'up' | 'down') => {
        const newItems = moveDigitalHumanCommunityVideo(id, direction)
        setCommunityItems(newItems)
    }, [])

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
            const progressRaw = typeof data?.progress === 'number' ? data.progress : 0
            const progress = Math.max(0, Math.min(100, Math.round(progressRaw)))
            const text = typeof data?.message === 'string' ? data.message : ''
            const st = useAppStore.getState()
            if (st.digitalHumanProgress === progress && st.digitalHumanProgressText === text) return
            st.setDigitalHumanProgress(progress, text)
        })

        return () => {
            if (removeListener) removeListener()
        }
    }, [])

    useEffect(() => {
        const removeListener = window.electronAPI?.on?.('cloud-gpu-download-progress', (data: { progress?: number; message?: string }) => {
            const progressRaw = typeof data?.progress === 'number' ? data.progress : 0
            const progress = Math.max(0, Math.min(100, Math.round(progressRaw)))
            const text = typeof data?.message === 'string' ? data.message : ''
            const st = useAppStore.getState()
            if (st.digitalHumanDownloadProgress === progress && st.digitalHumanDownloadText === text) return
            st.setDigitalHumanDownloadProgress(progress, text)
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
        const checkConsent = async () => {
            try {
                const status = await getLegalConsentStatus()
                if (!status.accepted) setLegalGateOpen(true)
            } finally {
                setLegalGateLoading(false)
            }
        }
        void checkConsent()
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
        setBenchmarkProgressModalOpen(false)
        setBenchmarkTopicModalOpen(false)
        setSelectedBenchmarkTopicIndex(null)
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
            const storedVoiceId = getStoredCloudVoiceId()

            const [voiceStatusRes, voiceModelsRes, gpuStatusRes, avatarRes, configRes] = await Promise.all([
                window.electronAPI.invoke('cloud-voice-check-status'),
                window.electronAPI.invoke('cloud-voice-list-models'),
                window.electronAPI.invoke('cloud-gpu-check-status'),
                window.electronAPI.invoke('cloud-gpu-get-avatars'),
                window.electronAPI.invoke('config-get'),
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
                voiceModelsRes?.success && Array.isArray(voiceModelsRes.data) ? voiceModels.data : []

            const desiredModel = String(configRes?.data?.ALIYUN_COSYVOICE_MODEL || '').trim() || 'cosyvoice-v3-flash'
            const isCompatibleVoiceId = (vid: string) => {
                const id = String(vid || '').trim()
                if (!id) return false
                return id === desiredModel || id.startsWith(`${desiredModel}-`)
            }
            const isReadyStatus = (s: string) => {
                const status = String(s || '').toLowerCase()
                return status === 'ready' || status === 'success' || status === 'completed' || status === 'done' || status === ''
            }
            const toTime = (m: any) => {
                const raw = m?.updatedAt || m?.createdAt
                const t = raw ? Date.parse(String(raw)) : NaN
                return Number.isFinite(t) ? t : 0
            }

            const pickLatestReadyVoiceId = (preferredModel: string): string => {
                const ready = voiceModels.filter((m: any) => isReadyStatus(m?.status))
                const preferred = ready.filter((m: any) => {
                    const id = String(m?.id || '').trim()
                    return id === preferredModel || id.startsWith(`${preferredModel}-`)
                })
                const list = preferred.length ? preferred : ready
                const sorted = [...list].sort((a: any, b: any) => toTime(b) - toTime(a))
                return String(sorted[0]?.id || '').trim()
            }

            let voiceId = storedVoiceId
            const storedModel = voiceId ? voiceModels.find((m) => String(m?.id || '').trim() === voiceId) : undefined
            const storedReady = !!storedModel && isReadyStatus(storedModel.status || '')
            const storedCompatible = !!voiceId && isCompatibleVoiceId(voiceId)

            // 如果本地记忆的 voiceId 不存在/未就绪/与当前模型不兼容，则自动切换到最新可用的目标模型音色
            if (!voiceId || !storedReady || !storedCompatible) {
                const picked = pickLatestReadyVoiceId(desiredModel)
                if (picked) {
                    voiceId = picked
                    try { localStorage.setItem('audio.cloudVoiceId', picked) } catch { /* ignore */ }
                }
            }

            const voiceModel = voiceId ? voiceModels.find((m) => String(m?.id || '').trim() === voiceId) : undefined
            const voiceReady = !!voiceModel && isReadyStatus(voiceModel.status || '') && isCompatibleVoiceId(voiceId)
            setAutoVoiceReady(voiceReady)

            // 让自动模式的“语音服务”提示更明确：当前模型 + 当前音色
            if (voiceReady) {
                const name = String((voiceModel as any)?.name || '').trim()
                const shortId = voiceId.split('-').slice(-1)[0]?.slice(0, 6) || voiceId.slice(-6)
                const label = name ? `${name} (${shortId})` : shortId
                setAutoVoiceStatusText((prev) => {
                    const base = String(prev || '').split('| 默认音色：')[0].trim()
                    const prefix = base ? base : ''
                    return `${prefix}${prefix ? ' | ' : ''}默认音色：${label} | 模型：${desiredModel}`
                })
            } else if (storedVoiceId && storedVoiceId !== voiceId) {
                // storedVoiceId 不兼容/不可用且被自动替换，但最终仍未就绪时给出提示
                setAutoVoiceStatusText((prev) => {
                    const base = String(prev || '').split('| 默认音色：')[0].trim()
                    return `${base ? `${base} | ` : ''}需要一个 ${desiredModel} 的可用音色`
                })
            }

            const avatars: CloudAvatarModel[] =
                avatarRes?.success && Array.isArray(avatarRes.data) ? avatarRes.data : []
            setAutoAvatars(avatars)
            const avatarReady = avatars.length > 0
            setAutoAvatarReady(avatarReady)

            const storedDefaultAvatarId = (() => {
                try { return localStorage.getItem('auto.avatarId') || '' } catch { return '' }
            })()

            let selectedAvatarId = storedDefaultAvatarId || autoSelectedAvatarId
            if (avatarReady) {
                const matched = selectedAvatarId && avatars.some((a) => a.id === selectedAvatarId)
                selectedAvatarId = matched ? selectedAvatarId : String(avatars[0].id || '')
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
        appendAutoLog('auto_legal', '开始 AI 法务检查（约 20 秒）')

        if (autoLegalTimerRef.current) clearInterval(autoLegalTimerRef.current)
        const startAt = Date.now()
        const totalMs = 20000

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
            setAutoStatusText('正在连接视频服务器...')
            setAutoPercent(3)
            appendAutoLog('auto_material', '开始解析素材链接')

            await new Promise(r => setTimeout(r, 800)) // 让用户看到这一步
            setAutoStatusText('正在下载视频文件...')
            setAutoPercent(5)
            appendAutoLog('auto_material', '下载视频中...')

            const downloadRes = await window.electronAPI.invoke('download-video', url)
            if (!downloadRes?.success || !downloadRes.data?.videoPath) {
                throw new Error(downloadRes?.error || '解析失败')
            }
            const sourceVideoPath = String(downloadRes.data.videoPath)
            setAutoSourceVideoPath(sourceVideoPath)
            setVideoPath(sourceVideoPath)
            setPreview('video', sourceVideoPath)

            setAutoStatusText('素材解析完成')
            appendAutoLog('auto_material', '✓ 素材解析完成')
            setAutoPercent(15)
            await new Promise(r => setTimeout(r, 1200)) // 停留让用户看到完成状态

            // 2) 提取文案
            setAutoActiveStep('auto_extract')
            setAutoStatusText('正在初始化语音识别引擎...')
            setAutoPercent(18)
            appendAutoLog('auto_extract', '启动AI语音识别')

            await new Promise(r => setTimeout(r, 1000)) // 视觉过渡
            setAutoStatusText('正在分析音频波形...')
            setAutoPercent(22)

            await new Promise(r => setTimeout(r, 600))
            setAutoStatusText('正在识别语音内容...')
            appendAutoLog('auto_extract', '语音转文字处理中...')

            const asrRes = await window.electronAPI.invoke('transcribe-audio', sourceVideoPath)
            if (!asrRes?.success) {
                throw new Error(asrRes?.error || '提取文案失败')
            }
            const original = String(asrRes.data || '').trim()
            setAutoExtractedCopy(original)
            setOriginalCopy(original)
            setPreview('text', original || '（未识别到有效文字）')

            setAutoStatusText('文案提取完成')
            appendAutoLog('auto_extract', '✓ 成功提取文案（' + original.length + '字）')
            setAutoPercent(32)
            await new Promise(r => setTimeout(r, 1200)) // 让用户看到提取结果

            // 3) AI 变原创
            setAutoActiveStep('auto_rewrite')
            setAutoStatusText('正在连接AI大模型...')
            setAutoPercent(35)
            appendAutoLog('auto_rewrite', '启动AI创作引擎')

            await new Promise(r => setTimeout(r, 800))
            setAutoStatusText('AI正在理解原文内容...')
            setAutoPercent(38)

            await new Promise(r => setTimeout(r, 800))
            setAutoStatusText('AI正在创作原创文案...')
            appendAutoLog('auto_rewrite', 'AI创作中...')

            const rewriteRes = await window.electronAPI.invoke('rewrite-copy', original, 'auto')
            if (!rewriteRes?.success || !rewriteRes.data) {
                throw new Error(rewriteRes?.error || 'AI变原创失败')
            }
            const rewritten = String(rewriteRes.data).trim()
            setAutoRewrittenCopy(rewritten)
            setRewrittenCopy(rewritten)
            setPreview('text', rewritten)

            setAutoStatusText('原创文案生成完成')
            appendAutoLog('auto_rewrite', '✓ 原创文案已生成（' + rewritten.length + '字）')
            setAutoPercent(48)
            await new Promise(r => setTimeout(r, 1200)) // 让用户看到改写结果

            // 4) AI 法务（20 秒）
            setAutoActiveStep('auto_legal')
            setAutoStatusText('正在启动合规审核引擎...')
            setAutoPercent(50)
            appendAutoLog('auto_legal', '开始AI法务审核')

            await new Promise(r => setTimeout(r, 600))
            setAutoStatusText('正在检测敏感词汇...')
            setAutoPercent(52)

            await new Promise(r => setTimeout(r, 600))
            setAutoStatusText('正在进行合规性分析...')

            const report = await runAutoLegalAudit(rewritten)
            const safeText = String(report.suggestedText || rewritten).trim() || rewritten
            if (safeText && safeText !== rewritten) {
                setAutoRewrittenCopy(safeText)
                setRewrittenCopy(safeText)
                setPreview('text', safeText)
                appendAutoLog('auto_legal', '✓ 已优化合规文本')
            } else {
                appendAutoLog('auto_legal', '✓ 内容审核通过')
            }
            setAutoStatusText('合规审核完成')
            setAutoPercent(62)
            await new Promise(r => setTimeout(r, 1000))

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
            setSelectedBenchmarkTopicIndex(null)
            setBenchmarkTopicModalOpen(false)
            setBenchmarkProgressModalOpen(true)
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
            setBenchmarkProgressModalOpen(false)
            setBenchmarkTopicModalOpen(true)
        } catch (e: any) {
            setBenchmarkProgress((prev) => ({
                ...prev,
                percent: Math.max(10, prev.percent),
                title: '学习失败',
                detail: e?.message || '学习失败，请重试',
            }))
            message.error(e?.message || '学习失败')
            setPreview('text', `❌ 学习失败：${e?.message || '请重试'}`)
            setBenchmarkTopicModalOpen(false)
            setBenchmarkProgressModalOpen(true)
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

    const getBenchmarkProgressActionText = () => {
        const percent = Math.max(0, Math.min(100, benchmarkProgress.percent || 0))
        if (benchmarkProgress.title === '学习失败') return '学习失败：请更换样本或重试'
        if (percent >= 100) return '学习完成：已生成 4 个选题，马上选一个开始生成逐字稿'
        if (percent < 10) return '正在准备样本…'
        if (percent < 75) return '正在提取样本逐字稿…'
        if (percent < 95) return '正在总结对标账号打法…'
        return '正在生成选题…'
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

    const autoDemoTargets = useMemo(() => {
        return {
            start: autoStartBtnRef as any,
            refresh: autoRefreshBtnRef as any,
            detail: autoDetailBtnRef as any,
            progress: autoProgressCardRef as any,
        } as Record<string, any>
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const autoDemoTargetKey = useMemo(() => {
        if (workspaceMode !== 'auto' || !autoDemoMode) return ''
        if (!autoRunning && autoPercent <= 0) return 'start'
        if (autoError) return 'detail'
        switch (autoActiveStep) {
            case 'auto_material':
                return 'start'
            case 'auto_extract':
            case 'auto_rewrite':
            case 'auto_legal':
            case 'auto_audio':
            case 'auto_digital':
                return 'progress'
            case 'auto_review':
                return autoFinalVideoPath ? 'detail' : 'progress'
            default:
                return 'progress'
        }
    }, [autoActiveStep, autoDemoMode, autoError, autoFinalVideoPath, autoPercent, autoRunning, workspaceMode])

    const autoDemoSubtitle = useMemo(() => {
        const st = String(autoStatusText || '').trim()
        if (st) return st
        if (autoRunning) return '系统正在自动执行…'
        return '点击开始后，将自动完成下载、改写、合规、配音与出片'
    }, [autoRunning, autoStatusText])

    const autoDemoPulseToken = useMemo(() => `${autoActiveStep}_${autoPercent}_${autoError ? 'err' : ''}`, [autoActiveStep, autoPercent, autoError])

    const demoModalTimerRef = useRef<number | null>(null)
    useEffect(() => {
        if (demoModalTimerRef.current) {
            window.clearTimeout(demoModalTimerRef.current)
            demoModalTimerRef.current = null
        }
        if (!autoDemoMode || workspaceMode !== 'auto' || !autoRunning) return
        if (!['auto_extract', 'auto_audio', 'auto_digital'].includes(autoActiveStep)) return
        setAutoDetailOpen(true)
        demoModalTimerRef.current = window.setTimeout(() => {
            setAutoDetailOpen(false)
            demoModalTimerRef.current = null
        }, 1400)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoDemoMode, workspaceMode, autoRunning, autoActiveStep])



    const renderAutoPanel = () => {
        const urlTrimmed = douyinUrl.trim()
        const voiceId = getStoredCloudVoiceId()
        const avatar = autoAvatars.find((a) => a.id === autoSelectedAvatarId) || autoAvatars[0]

        const disabledReason = (() => {
            if (autoRunning) return '流程运行中'
            if (autoCheckLoading) return '正在检测服务'
            if (!autoVoiceReady) return '音色未就绪（请先克隆/选择）'
            if (!autoAvatarReady) return '形象未就绪（请先创建）'
            if (!voiceId) return '未选择音色'
            if (!avatar?.remoteVideoPath) return '未选择可用形象'
            return ''
        })()

        return (
            <AutoExecutionPanel
                douyinUrl={douyinUrl}
                setDouyinUrl={setDouyinUrl}
                autoRunning={autoRunning}
                startAutoPipeline={startAutoPipeline}
                refreshAutoReadiness={refreshAutoReadiness}
                autoActiveStep={autoActiveStep}
                autoPercent={autoPercent}
                autoStatusText={autoStatusText}
                autoLogs={autoLogs}
                autoError={autoError}
                autoCheckLoading={autoCheckLoading}
                autoVoiceReady={autoVoiceReady}
                autoAvatarReady={autoAvatarReady}
                disabledReason={disabledReason}
                autoExtractedCopy={autoExtractedCopy}
                autoRewrittenCopy={autoRewrittenCopy}
                autoLegalReport={autoLegalReport}
                autoAudioPath={autoAudioPath}
                autoFinalVideoPath={autoFinalVideoPath}
                digitalHumanProgress={digitalHumanProgress}
                setSettingsTab={setSettingsTab}
                setSettingsOpen={setSettingsOpen}
                setWorkspaceMode={setWorkspaceMode}
                setActiveKey={setActiveKey}
                onShowDetail={() => setAutoDetailOpen(true)}
                onPublish={() => {
                    // 设置最终视频路径到半自动模式的状态
                    if (autoFinalVideoPath) {
                        setFinalVideoPath(autoFinalVideoPath)
                    }
                    // 切换到半自动模式并跳转到发布步骤
                    setWorkspaceMode('manual')
                    setActiveKey('publish')
                    message.success('已跳转到预览与发布')
                }}
                onReset={resetAutoSession}
                communityItems={communityItems}
                onOpenCommunity={handleOpenCommunity}
                onClearCommunity={handleClearCommunity}
                industryCount={communityItems.length}
            />
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

                        {parseMode === 'profile' && benchmarkTopics.length > 0 && !benchmarkLearning && (
                            <Card
                                style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid var(--border)',
                                }}
                                bodyStyle={{ padding: 16 }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                                    <div>
                                        <Typography.Text strong style={{ fontSize: 16 }}>对标学习已完成</Typography.Text>
                                        <div style={{ marginTop: 6, fontSize: 12, color: 'rgba(255,255,255,0.68)' }}>
                                            目的：学习对标账号 → 生成适合你复刻的选题方向
                                        </div>
                                    </div>
                                    <Button type="primary" onClick={() => setBenchmarkTopicModalOpen(true)}>
                                        选择选题
                                    </Button>
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
                return (
                    <DigitalHumanPanel
                        communityItems={communityItems}
                        onOpenCommunity={handleOpenCommunity}
                        onClearCommunity={handleClearCommunity}
                        onAddCommunity={handleAddCommunity}
                        onUpdateCommunity={handleUpdateCommunity}
                        onRemoveCommunity={handleRemoveCommunity}
                        onMoveCommunity={handleMoveCommunity}
                    />
                )
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
            {/* AutoPilotOverlay 暂时禁用 - 界面已重新设计 */}
            <AutoPilotOverlay
                enabled={false}
                targetKey={autoDemoTargetKey}
                targets={autoDemoTargets as any}
                title={autoRunning ? 'AI 自动驾驶进行中' : 'AI 自动驾驶演示'}
                subtitle={autoDemoSubtitle}
                pulseToken={autoDemoPulseToken}
            />
            <Modal
                title={LEGAL_DISCLAIMER_TITLE}
                open={!legalGateLoading && legalGateOpen}
                closable={false}
                maskClosable={false}
                centered
                width={860}
                footer={[
                    <div key="footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <Checkbox checked={legalGateChecked} onChange={(e) => setLegalGateChecked(e.target.checked)}>
                            我已阅读并同意以上条款
                        </Checkbox>
                        <Space>
                            <Button
                                onClick={() => {
                                    try {
                                        window.close()
                                    } catch {
                                        // ignore
                                    }
                                }}
                            >
                                退出
                            </Button>
                            <Button
                                type="primary"
                                onClick={async () => {
                                    if (!legalGateChecked) {
                                        message.warning('请先勾选“我已阅读并同意”')
                                        return
                                    }
                                    try {
                                        await acceptLegalConsent({ uiSource: 'app_start', userAgent: navigator.userAgent })
                                        setLegalGateOpen(false)
                                        setLegalGateChecked(false)
                                        message.success('已记录同意')
                                    } catch (e: any) {
                                        message.error(e?.message || '记录失败')
                                    }
                                }}
                            >
                                同意并继续
                            </Button>
                        </Space>
                    </div>,
                ]}
                destroyOnClose
            >
                <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0, maxHeight: '60vh', overflow: 'auto' }}>
                    {LEGAL_DISCLAIMER_TEXT}
                </Typography.Paragraph>
            </Modal>

            <DigitalHumanCommunityModal
                open={communityPanelOpen}
                onClose={() => setCommunityPanelOpen(false)}
                items={communityItems}
                onPlayPath={(videoPath) => {
                    setPreview('video', videoPath)
                }}
                onDelete={(id) => handleCommunityUpdate(removeDigitalHumanCommunityVideo(id))}
                onUpdate={(id, patch) => handleCommunityUpdate(updateDigitalHumanCommunityVideo(id, patch))}
                onMove={(id, dir) => handleCommunityUpdate(moveDigitalHumanCommunityVideo(id, dir))}
            />

            {/* 顶部工具栏 - 新布局：左侧切换 + 中间Logo标题 + 右侧状态 */}
            <header className="header" style={{ justifyContent: 'space-between', position: 'relative' }}>
                {/* 左侧：模式切换 */}
                <div style={{ position: 'absolute', left: 28, top: '50%', transform: 'translateY(-50%)' }}>
                    <Segmented
                        value={workspaceMode}
                        onChange={(value) => setWorkspaceMode(value as WorkspaceMode)}
                        options={[
                            { label: '🛠️ 半自动', value: 'manual' },
                            { label: '🚀 全自动', value: 'auto' },
                        ]}
                        style={{
                            background: 'rgba(255,255,255,0.06)',
                            padding: 4,
                            borderRadius: 10,
                        }}
                    />
                </div>

                {/* 中间：产品名称 - 高端设计 */}
                <div className="header-title" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div className="header-brand-container">
                        {/* 主标题 - 渐变发光效果 */}
                        <div className="header-brand-main">
                            <span className="header-brand-360">360行</span>
                            <span className="header-brand-ai">AI数字获客系统</span>
                            <Tooltip title="点击检查更新">
                                <span
                                    className="header-version-badge"
                                    title={`build: ${__BUILD_TIME__}`}
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
                        {/* 副标题 */}
                        <div className="header-brand-subtitle">一键生成 · 全网分发 · 躺赚流量</div>
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
                {/* 左侧步骤导航 */}
                <aside className="sidebar">
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
                        <div className="auto-steps-marquee-container" style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                            {/* 左侧显示全部7个步骤 - 带跑马灯动画 */}
                            {autoSteps.map((item, idx) => {
                                const isActive = autoActiveIndex === idx
                                const isDone = item.done
                                return (
                                    <div
                                        key={item.key}
                                        onClick={() => setAutoActiveStep(item.key)}
                                        className={`auto-step-card ${isActive ? 'active' : ''}`}
                                        style={{
                                            padding: '16px 16px',
                                            borderRadius: 12,
                                            cursor: 'pointer',
                                            flex: 1,
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'center',
                                            background: isActive
                                                ? 'linear-gradient(135deg, rgba(0,212,170,0.15), rgba(146,84,222,0.08))'
                                                : 'rgba(255, 255, 255, 0.025)',
                                            border: '1px solid rgba(255, 255, 255, 0.08)',
                                            transition: 'all 0.2s ease',
                                            position: 'relative',
                                            overflow: 'hidden'
                                        }}
                                    >
                                        {/* 跑马灯边框元素 */}
                                        <div className="step-border-top"></div>
                                        <div className="step-border-right"></div>
                                        <div className="step-border-bottom"></div>
                                        <div className="step-border-left"></div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative', zIndex: 1 }}>
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                width: 30,
                                                height: 30,
                                                borderRadius: 999,
                                                fontSize: 14,
                                                fontWeight: 700,
                                                flexShrink: 0,
                                                background: isDone ? '#52c41a' : isActive ? '#00d4aa' : 'rgba(255,255,255,0.1)',
                                                color: isDone || isActive ? '#fff' : 'rgba(255,255,255,0.6)',
                                            }}>
                                                {isDone ? '✓' : idx + 1}
                                            </span>
                                            <span style={{
                                                fontSize: 16,
                                                fontWeight: isActive ? 600 : 500,
                                                color: isDone ? '#52c41a' : isActive ? '#fff' : 'rgba(255,255,255,0.8)',
                                            }}>
                                                {item.title}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginLeft: 42, marginTop: 6 }}>
                                            {item.subtitle}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </aside>

                {/* 中间操作区 */}
                <section className="workspace">
                    <div className="step-card">
                        <div className="step-card-title" style={{ fontSize: 28, marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
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

                            {/* Community Works Button (Auto Mode Only) */}
                            {workspaceMode === 'auto' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <Button
                                        type="default"
                                        icon={<ExpandOutlined />}
                                        onClick={() => setCommunityPanelOpen(true)}
                                        style={{
                                            borderRadius: 12,
                                            background: 'rgba(255,255,255,0.06)',
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            color: 'rgba(255,255,255,0.85)'
                                        }}
                                    >
                                        社区作品
                                    </Button>
                                    <div className="community-stats" style={{ display: 'flex', gap: 6 }}>
                                        <div style={{
                                            background: '#1677ff',
                                            color: '#fff',
                                            padding: '2px 8px',
                                            borderRadius: 4,
                                            fontSize: 12,
                                            fontWeight: 600
                                        }}>
                                            {communityItems?.length || 0}
                                        </div>
                                        {(new Set(communityItems.map(i => String(i.industry || '').trim()).filter(Boolean)).size || 0) > 0 && (
                                            <div style={{
                                                background: 'rgba(255,255,255,0.08)',
                                                color: 'rgba(255,255,255,0.65)',
                                                padding: '2px 8px',
                                                borderRadius: 999,
                                                fontSize: 12,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 4
                                            }}>
                                                <TagsOutlined style={{ fontSize: 10 }} />
                                                收录 {new Set(communityItems.map(i => String(i.industry || '').trim()).filter(Boolean)).size} 行业
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {(() => {
                            let reason: string | undefined = undefined;
                            if (!autoVoiceReady) {
                                reason = "请先配置并启用 CosyVoice 语音服务";
                            } else if (!autoAvatarReady) {
                                reason = "请先配置并启用数字人服务";
                            }
                            return (
                                <Card
                                    className="workbench-panel"
                                    styles={{ body: { paddingTop: 18 } }}
                                >
                                    {workspaceMode === 'manual' ? renderActivePanel() : (
                                        <AutoExecutionPanel
                                            douyinUrl={douyinUrl}
                                            setDouyinUrl={setDouyinUrl}
                                            autoRunning={autoRunning}
                                            startAutoPipeline={startAutoPipeline}
                                            refreshAutoReadiness={refreshAutoReadiness}
                                            autoActiveStep={autoActiveStep}
                                            autoPercent={autoPercent}
                                            autoStatusText={autoStatusText}
                                            autoLogs={autoLogs}
                                            autoError={autoError}
                                            autoCheckLoading={autoCheckLoading}
                                            autoVoiceReady={autoVoiceReady}
                                            autoAvatarReady={autoAvatarReady}
                                            disabledReason={reason}
                                            autoExtractedCopy={autoExtractedCopy}
                                            autoRewrittenCopy={autoRewrittenCopy}
                                            autoLegalReport={autoLegalReport}
                                            autoAudioPath={autoAudioPath}
                                            autoFinalVideoPath={autoFinalVideoPath}
                                            digitalHumanProgress={digitalHumanProgress}
                                            setSettingsTab={setSettingsTab}
                                            setSettingsOpen={setSettingsOpen}
                                            setWorkspaceMode={setWorkspaceMode}
                                            setActiveKey={setActiveKey}
                                            onShowDetail={() => setAutoDetailOpen(true)}
                                            onPublish={() => setAutoPublishOpen(true)}
                                            onReset={resetAutoSession}
                                            // Community Props
                                            communityItems={communityItems}
                                            onOpenCommunity={() => setCommunityPanelOpen(true)}
                                            onClearCommunity={handleClearCommunity}
                                            industryCount={new Set(communityItems.map(i => String(i.industry || '').trim()).filter(Boolean)).size}
                                        />
                                    )}
                                </Card>
                            )
                        })()}
                    </div>
                </section>

                {/* 右侧预览区 - 仅半自动模式显示 */}
                {
                    workspaceMode === 'manual' && showPreviewPanel && (
                        <aside className="preview-panel">
                            <PreviewPanel />
                        </aside>
                    )
                }

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
                        { key: 'avatar', label: '数字人形象', children: <AvatarSettings /> },
                        { key: 'legal', label: '法律与合规', children: <LegalComplianceSettings /> },
                        ...(adminEnabled ? [{ key: 'server', label: '服务器设置', children: <ServerSettings /> }] : []),
                    ]}
                />
            </Modal>

            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                            width: 34,
                            height: 34,
                            borderRadius: 12,
                            background: 'linear-gradient(135deg, rgba(146,84,222,0.95), rgba(0,212,170,0.95))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#0b0f14',
                            fontWeight: 900,
                        }}>
                            AI
                        </div>
                        <div>
                            <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>对标博主学习进度</div>
                            <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(255,255,255,0.60)' }}>
                                学习对标账号 → 生成可复刻的选题方向
                            </div>
                        </div>
                    </div>
                }
                open={benchmarkProgressModalOpen}
                centered
                closable={!benchmarkLearning}
                maskClosable={!benchmarkLearning}
                onCancel={() => {
                    if (benchmarkLearning) return
                    setBenchmarkProgressModalOpen(false)
                }}
                width={820}
                styles={{
                    content: {
                        background: 'radial-gradient(1200px 600px at 10% -10%, rgba(146,84,222,0.32), transparent 55%), radial-gradient(900px 500px at 110% 10%, rgba(0,212,170,0.22), transparent 55%), rgba(14,16,22,0.92)',
                        border: '1px solid rgba(255,255,255,0.10)',
                        borderRadius: 22,
                        boxShadow: '0 28px 80px rgba(0,0,0,0.60)',
                        overflow: 'hidden',
                    },
                    header: {
                        background: 'transparent',
                        borderBottom: '1px solid rgba(255,255,255,0.08)',
                        paddingBottom: 14,
                    },
                }}
                footer={
                    benchmarkLearning
                        ? null
                        : [
                            <Button key="close" onClick={() => setBenchmarkProgressModalOpen(false)}>
                                关闭
                            </Button>,
                            benchmarkProgress.title !== '学习失败' && benchmarkProgress.percent >= 100 ? (
                                <Button
                                    key="pick"
                                    type="primary"
                                    onClick={() => {
                                        setBenchmarkProgressModalOpen(false)
                                        setBenchmarkTopicModalOpen(true)
                                    }}
                                >
                                    去选题
                                </Button>
                            ) : null,
                        ].filter(Boolean) as any
                }
                destroyOnClose
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                        <div style={{ fontSize: 44, fontWeight: 900, color: '#fff', letterSpacing: 0.5 }}>
                            {Math.max(0, Math.min(100, benchmarkProgress.percent || 0))}%
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <Tag color={benchmarkProgress.title === '学习失败' ? 'red' : (benchmarkLearning ? 'blue' : (benchmarkProgress.percent >= 100 ? 'green' : undefined))}>
                                {benchmarkProgress.title === '学习失败' ? '失败' : (benchmarkLearning ? '学习中' : (benchmarkProgress.percent >= 100 ? '已完成' : '进行中'))}
                            </Tag>
                            <Tag color="geekblue">样本：{benchmarkSamples.length || 0} 条</Tag>
                        </div>
                    </div>
                    <Progress
                        percent={Math.max(0, Math.min(100, benchmarkProgress.percent || 0))}
                        status={benchmarkProgress.title === '学习失败' ? 'exception' : (benchmarkLearning ? 'active' : (benchmarkProgress.percent >= 100 ? 'success' : 'normal'))}
                        strokeWidth={10}
                        showInfo={false}
                        strokeColor={{ from: '#9254de', to: '#00d4aa' }}
                        trailColor="rgba(255,255,255,0.10)"
                    />
                    <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', lineHeight: 1.5 }}>
                        {getBenchmarkProgressActionText()}
                    </div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.70)', lineHeight: 1.6 }}>
                        {benchmarkProgress.detail || '—'}
                    </div>
                    <div style={{ marginTop: 2, paddingTop: 10, borderTop: '1px dashed rgba(255,255,255,0.12)', fontSize: 12, color: 'rgba(255,255,255,0.58)' }}>
                        我们只学习你选的样本：提取逐字稿 → 总结结构与高频表达 → 生成 4 个可复刻选题。
                    </div>
                </div>
            </Modal>

            <Modal
                title="选择一个选题（标题 + 切入角度）"
                open={benchmarkTopicModalOpen}
                centered
                onCancel={() => {
                    if (benchmarkGeneratingTopicIndex !== null) return
                    setBenchmarkTopicModalOpen(false)
                }}
                maskClosable={benchmarkGeneratingTopicIndex === null}
                width={760}
                footer={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.60)' }}>
                            目的：基于对标学习，为你生成可直接复刻的选题方向
                        </div>
                        <Space>
                            <Button disabled={benchmarkGeneratingTopicIndex !== null} onClick={() => setBenchmarkTopicModalOpen(false)}>
                                取消
                            </Button>
                            <Button
                                type="primary"
                                loading={benchmarkGeneratingTopicIndex !== null}
                                disabled={selectedBenchmarkTopicIndex === null}
                                onClick={() => {
                                    if (selectedBenchmarkTopicIndex === null) return
                                    const topic = benchmarkTopics[selectedBenchmarkTopicIndex]
                                    if (!topic?.title) return
                                    setBenchmarkTopicModalOpen(false)
                                    handleGenerateBenchmarkScript(topic, selectedBenchmarkTopicIndex)
                                }}
                            >
                                确定并生成逐字稿
                            </Button>
                        </Space>
                    </div>
                }
                destroyOnClose
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.70)', lineHeight: 1.6 }}>
                        已从对标主页提取 {benchmarkSamples.length || 0} 条样本脚本，生成 4 个选题方向；选中一个后将生成逐字稿并自动进入「变原创」。
                    </div>
                    <Radio.Group
                        value={selectedBenchmarkTopicIndex}
                        onChange={(e) => setSelectedBenchmarkTopicIndex(e.target.value)}
                        style={{ width: '100%' }}
                    >
                        <Space direction="vertical" style={{ width: '100%' }} size={10}>
                            {benchmarkTopics.slice(0, 4).map((topic, idx) => (
                                <div
                                    key={`${idx}-${topic.title}`}
                                    onClick={() => setSelectedBenchmarkTopicIndex(idx)}
                                    style={{
                                        cursor: 'pointer',
                                        borderRadius: 14,
                                        border: selectedBenchmarkTopicIndex === idx ? '1px solid rgba(0,212,170,0.70)' : '1px solid rgba(255,255,255,0.10)',
                                        background: selectedBenchmarkTopicIndex === idx ? 'rgba(0,212,170,0.10)' : 'rgba(0,0,0,0.20)',
                                        padding: '12px 14px',
                                    }}
                                >
                                    <Radio value={idx} style={{ width: '100%' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            <div style={{ fontSize: 15, fontWeight: 900, color: '#fff', lineHeight: 1.35 }}>
                                                {idx + 1}. {topic.title}
                                            </div>
                                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.72)', lineHeight: 1.6 }}>
                                                切入角度：{topic.angle ? topic.angle : '—'}
                                            </div>
                                        </div>
                                    </Radio>
                                </div>
                            ))}
                        </Space>
                    </Radio.Group>
                </div>
            </Modal>

            <ProfileVideoSelector
                open={profileModalOpen}
                loading={profileLoading}
                videos={profileVideos}
                onBatchSelect={handleBatchVideoSelect}
                onCancel={() => setProfileModalOpen(false)}
                maxSelect={5}
            />

            {/* Global Community Modal */}
            {/* Removed duplicate global modal - already rendered above */}
        </>
    )
}

export default App
