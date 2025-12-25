/**
 * 口播数字人分身 - 简化版
 * 
 * 设计原则：
 * - 去掉技术术语（CPU、GPU、Python）
 * - 三步流程：选形象 → 录音频 → 生成视频
 * - 高级质感，值 2000 元/年
 */

import { Button, Upload, Space, Progress, Card, message, Input, Modal, Typography, Empty, Tooltip, Select, Tag } from 'antd'
import {
    UploadOutlined,
    DownloadOutlined,
    PlusOutlined,
    ReloadOutlined,
    RocketOutlined,
    UserOutlined,
    PlayCircleOutlined,
    SoundOutlined,
    CheckCircleFilled,
    VideoCameraOutlined,
    DeleteOutlined,
    AudioOutlined,
    FileTextOutlined,
} from '@ant-design/icons'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import CloudServiceStatus from '../CloudServiceStatus'

interface AvatarModel {
    id: string
    name: string
    remoteVideoPath: string
    localPreviewPath?: string
    createdAt: string
}

function getBasename(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/')
    return normalized.split('/').pop() || filePath
}

function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            const result = reader.result as string
            resolve(result.split(',')[1])
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
    })
}

// ============================================
// 步骤组件
// ============================================

function StepIndicator({ stepNumber, title, completed, active }: {
    stepNumber: number
    title: string
    completed: boolean
    active: boolean
}) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderRadius: 12,
            background: active
                ? 'linear-gradient(135deg, rgba(22,119,255,0.15) 0%, rgba(118,75,162,0.1) 100%)'
                : completed
                    ? 'rgba(82,196,26,0.08)'
                    : 'rgba(255,255,255,0.02)',
            border: active
                ? '2px solid rgba(22,119,255,0.4)'
                : '1px solid rgba(255,255,255,0.06)',
            transition: 'all 0.3s ease',
        }}>
            <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: completed
                    ? 'linear-gradient(135deg, #52c41a, #73d13d)'
                    : active
                        ? 'linear-gradient(135deg, #1677ff, #4096ff)'
                        : 'rgba(255,255,255,0.08)',
                color: '#fff',
                fontWeight: 700,
                fontSize: 14,
            }}>
                {completed ? <CheckCircleFilled /> : stepNumber}
            </div>
            <Typography.Text style={{
                fontSize: 15,
                fontWeight: active ? 600 : 400,
                color: active ? '#fff' : completed ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.45)',
            }}>
                {title}
            </Typography.Text>
        </div>
    )
}

// ============================================
// 主组件
// ============================================

function DigitalHumanPanel() {
    const {
        audioPath,
        digitalHumanVideoPath,
        finalVideoPath,
        originalCopy,
        rewrittenCopy,
        batchCopies,
        batchRewrittenCopies,
        digitalHumanSelectedCopy,
        digitalHumanScriptConfirmed,
        digitalHumanGenerating,
        digitalHumanProgress,
        digitalHumanProgressText,
        setAudioPath,
        setPreview,
        setDigitalHumanVideoPath,
        setFinalVideoPath,
        setDigitalHumanSelectedCopy,
        setDigitalHumanScriptConfirmed,
        setDigitalHumanGenerating,
        setDigitalHumanProgress,
        setActiveKey,
    } = useAppStore()

    // 状态
    const [avatars, setAvatars] = useState<AvatarModel[]>([])
    const [selectedAvatarId, setSelectedAvatarId] = useState<string>('')
    const [avatarsLoaded, setAvatarsLoaded] = useState(false)
    const [avatarsLoading, setAvatarsLoading] = useState(false)
    const [showNewAvatarModal, setShowNewAvatarModal] = useState(false)
    const [newAvatarName, setNewAvatarName] = useState('')
    const [newAvatarFile, setNewAvatarFile] = useState<File | null>(null)
    const [isSavingAvatar, setIsSavingAvatar] = useState(false)

    const [isSavingToDesktop, setIsSavingToDesktop] = useState(false)

    // 分阶段状态：合成完成后显示下载按钮
    const [synthesisResult, setSynthesisResult] = useState<{
        remoteVideoPath: string
        tempAudioPath?: string
    } | null>(null)
    const [isDownloading, setIsDownloading] = useState(false)
    const [downloadProgress, setDownloadProgress] = useState(0)
    const [downloadProgressText, setDownloadProgressText] = useState('')

    // 当前步骤
    const selectedAvatar = avatars.find(a => a.id === selectedAvatarId)
    const hasAvatar = !!selectedAvatar
    const hasAudio = !!audioPath
    const hasVideo = !!digitalHumanVideoPath

    const selectedCloudVoiceId = useMemo(() => {
        try {
            return (localStorage.getItem('audio.cloudVoiceId') || '').trim()
        } catch {
            return ''
        }
    }, [])

    const transcriptCandidates = useMemo(() => {
        if (batchCopies.length > 0) {
            return batchCopies.map((item, idx) => {
                const rewrittenItem = batchRewrittenCopies[idx]
                const rewrittenText = (rewrittenItem?.copy || '').trim()
                const originalText = (item?.copy || '').trim()
                const useRewritten = !!rewrittenText
                return {
                    key: String(idx),
                    title: (item?.title || `视频 ${idx + 1}`).trim(),
                    copy: useRewritten ? rewrittenText : originalText,
                    source: useRewritten ? 'rewritten' as const : 'original' as const,
                }
            })
        }

        const fallbackText = (digitalHumanSelectedCopy?.copy || rewrittenCopy || originalCopy || '').trim()
        if (!fallbackText) return []
        return [{
            key: 'single',
            title: (digitalHumanSelectedCopy?.title || '逐字稿').trim(),
            copy: fallbackText,
            source: rewrittenCopy ? 'rewritten' as const : 'original' as const,
        }]
    }, [batchCopies, batchRewrittenCopies, digitalHumanSelectedCopy?.copy, digitalHumanSelectedCopy?.title, originalCopy, rewrittenCopy])

    // 逐字稿始终需要用户点击确认：编辑完成后再“确认用于合成”，才会进入音频/视频生成
    const transcriptConfirmed = digitalHumanScriptConfirmed

    const textToSpeak = (digitalHumanSelectedCopy?.copy || rewrittenCopy || originalCopy || '').trim()
    const hasText = textToSpeak.length > 0
    const readyForVideo = transcriptConfirmed && hasAudio

    useEffect(() => {
        const unsub = window.electronAPI?.on?.('cloud-gpu-download-progress', (_event: any, data: { progress: number; message: string }) => {
            if (typeof data?.progress === 'number' && !Number.isNaN(data.progress)) {
                setDownloadProgress(Math.max(0, Math.min(100, data.progress)))
            }
            if (typeof data?.message === 'string') {
                setDownloadProgressText(data.message)
            }
        })
        return () => {
            if (typeof unsub === 'function') unsub()
        }
    }, [])

    useEffect(() => {
        if (transcriptCandidates.length === 0) return

        const currentTitle = (digitalHumanSelectedCopy?.title || '').trim()
        const matched = currentTitle && transcriptCandidates.some(c => c.title === currentTitle)

        if (!matched) {
            setDigitalHumanSelectedCopy({ title: transcriptCandidates[0].title, copy: transcriptCandidates[0].copy })
            return
        }
    }, [
        digitalHumanSelectedCopy?.title,
        setDigitalHumanSelectedCopy,
        transcriptCandidates,
    ])

    const ensureCloudGpuReady = useCallback(async (): Promise<boolean> => {
        if (!window.electronAPI?.invoke) {
            message.error('桌面端接口未就绪，请重启应用')
            return false
        }

        const res = await window.electronAPI.invoke('cloud-gpu-check-status')
        if (!res?.success) {
            message.warning(res?.error || '无法检测数字人服务')
            return false
        }
        if (!res?.data?.online) {
            message.warning(res?.data?.message || '数字人服务未连接，请先检查服务器设置')
            return false
        }
        return true
    }, [])

    const loadAvatars = useCallback(async () => {
        try {
            const result = await window.electronAPI?.invoke('cloud-gpu-get-avatars')
            if (result?.success) {
                setAvatars(result.data || [])
                setAvatarsLoaded(true)
                if (result.data?.length > 0 && !selectedAvatarId) {
                    setSelectedAvatarId(result.data[0].id)
                }
            }
        } catch (e) {
            console.error('加载形象失败:', e)
        }
    }, [selectedAvatarId])

    const refreshAvatars = useCallback(async () => {
        if (avatarsLoading) return
        setAvatarsLoading(true)
        try {
            const ready = await ensureCloudGpuReady()
            if (!ready) return
            await loadAvatars()
            setAvatarsLoaded(true)
        } finally {
            setAvatarsLoading(false)
        }
    }, [avatarsLoading, ensureCloudGpuReady, loadAvatars])

    const handleSaveNewAvatar = async () => {
        if (!newAvatarFile || !newAvatarName.trim()) {
            message.warning('请输入形象名称并选择视频')
            return
        }

        setIsSavingAvatar(true)
        try {
            const ready = await ensureCloudGpuReady()
            if (!ready) return

            const base64Data = await fileToBase64(newAvatarFile)
            const result = await window.electronAPI?.invoke('cloud-gpu-save-avatar', {
                videoBuffer: base64Data,
                avatarName: newAvatarName.trim(),
            })

            if (result?.success) {
                message.success('形象保存成功！')
                setShowNewAvatarModal(false)
                setNewAvatarName('')
                setNewAvatarFile(null)
                await refreshAvatars()
                setSelectedAvatarId(result.data.id)
            } else {
                throw new Error(result?.error || '保存失败')
            }
        } catch (e: any) {
            message.error(e.message)
        } finally {
            setIsSavingAvatar(false)
        }
    }

    const handleDeleteAvatar = async (avatarId: string) => {
        try {
            const ready = await ensureCloudGpuReady()
            if (!ready) return

            await window.electronAPI?.invoke('cloud-gpu-delete-avatar', avatarId)
            message.success('已删除')
            await refreshAvatars()
            if (selectedAvatarId === avatarId) {
                setSelectedAvatarId('')
            }
        } catch (e: any) {
            message.error(e.message)
        }
    }

    const generateVideo = useCallback(async (params: { avatarVideoPath: string; audioPath: string }) => {
        const result = await window.electronAPI?.invoke('cloud-gpu-generate-video', params)

        if (result?.success && result.data?.videoPath) {
            setDigitalHumanVideoPath(result.data.videoPath)
            setFinalVideoPath(result.data.videoPath)
            setPreview('video', result.data.videoPath)
            return result.data.videoPath as string
        }

        throw new Error(result?.error || '生成失败')
    }, [setDigitalHumanVideoPath, setFinalVideoPath, setPreview])

    // 第一阶段：仅合成（不下载）
    const handleSynthesizeOnly = async () => {
        if (digitalHumanGenerating) {
            message.info('正在合成中，请稍候...')
            return
        }
        if (!selectedAvatar) {
            message.error('请先选择或创建一个数字人形象')
            return
        }
        if (!audioPath) {
            message.error('请先准备音频：进入「音频生成」录制/合成（克隆你的声音）')
            return
        }
        if (!transcriptConfirmed) {
            message.warning('请先编辑逐字稿并点击「确认用于出片」')
            return
        }

        setDigitalHumanGenerating(true)
        setDigitalHumanProgress(0, '准备数字人服务...')
        setSynthesisResult(null)  // 清空之前的合成结果

        try {
            const ready = await ensureCloudGpuReady()
            if (!ready) return

            setDigitalHumanProgress(5, '正在提交合成任务...')
            const result = await window.electronAPI?.invoke('cloud-gpu-synthesize-only', {
                avatarVideoPath: selectedAvatar.remoteVideoPath,
                audioPath,
            })

            console.log('[DigitalHumanPanel] Synthesis result:', JSON.stringify(result, null, 2))

            if (result?.success && result.data?.remoteVideoPath) {
                console.log('[DigitalHumanPanel] Setting synthesisResult:', result.data.remoteVideoPath)
                setSynthesisResult({
                    remoteVideoPath: result.data.remoteVideoPath,
                    tempAudioPath: result.data.tempAudioPath,
                })
                setDigitalHumanProgress(100, '✅ 合成完成！请点击下方「下载视频」按钮')
                message.success('视频合成完成！请点击「下载视频」按钮获取视频')
            } else {
                throw new Error(result?.error || '合成失败')
            }
        } catch (e: any) {
            console.error('[DigitalHumanPanel] Synthesis error:', e)
            message.error(e.message)
        } finally {
            setDigitalHumanGenerating(false)
        }
    }

    // 第二阶段：下载已合成的视频
    const handleDownloadVideo = async () => {
        if (!synthesisResult?.remoteVideoPath) {
            message.warning('请先完成视频合成')
            return
        }
        if (isDownloading) {
            message.info('正在下载中，请稍候...')
            return
        }

        setIsDownloading(true)
        setDownloadProgress(0)
        setDownloadProgressText('准备下载...请稍候')

        try {
            const result = await window.electronAPI?.invoke('cloud-gpu-download-video', {
                remoteVideoPath: synthesisResult.remoteVideoPath,
                tempAudioPath: synthesisResult.tempAudioPath,
            })

            if (result?.success && result.data?.videoPath) {
                setDigitalHumanVideoPath(result.data.videoPath)
                setFinalVideoPath(result.data.videoPath)
                setPreview('video', result.data.videoPath)
                setSynthesisResult(null)  // 清空合成结果
                setDownloadProgress(100)
                setDownloadProgressText('✅ 下载完成！')
                message.success('视频下载完成！')
            } else {
                throw new Error(result?.error || '下载失败')
            }
        } catch (e: any) {
            message.error(e.message)
        } finally {
            setIsDownloading(false)
        }
    }

    // 保留原有的一键生成功能（用于兼容）
    const handleGenerate = async () => {
        if (digitalHumanGenerating) {
            message.info('正在生成中，请稍候...')
            return
        }
        if (!selectedAvatar) {
            message.error('请先选择或创建一个数字人形象')
            return
        }
        if (!audioPath) {
            message.error('请先准备音频：进入「音频生成」录制/合成（克隆你的声音）')
            return
        }
        if (!transcriptConfirmed) {
            message.warning('请先编辑逐字稿并点击「确认用于出片」')
            return
        }

        setDigitalHumanGenerating(true)
        setDigitalHumanProgress(0, '准备数字人服务...')

        try {
            const ready = await ensureCloudGpuReady()
            if (!ready) return

            setDigitalHumanProgress(5, '正在提交视频任务...')
            await generateVideo({
                avatarVideoPath: selectedAvatar.remoteVideoPath,
                audioPath,
            })
            setDigitalHumanProgress(100, '生成完成')
            message.success('视频生成成功！')
        } catch (e: any) {
            message.error(e.message)
        } finally {
            setDigitalHumanGenerating(false)
        }
    }

    const handleSaveResultToDesktop = async () => {
        if (!digitalHumanVideoPath) return
        setIsSavingToDesktop(true)
        try {
            const result = await window.electronAPI?.invoke('save-to-desktop', {
                sourcePath: digitalHumanVideoPath,
                fileName: getBasename(digitalHumanVideoPath),
            })
            if (result?.success) {
                message.success(`已保存到桌面：${getBasename(result.data.destPath)}`)
            } else {
                throw new Error(result?.error || '保存失败')
            }
        } catch (e: any) {
            message.error(e.message)
        } finally {
            setIsSavingToDesktop(false)
        }
    }

    return (
        <div style={{ padding: 0 }}>
            {/* 标题区域 */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(22,119,255,0.12) 0%, rgba(118,75,162,0.08) 100%)',
                borderRadius: 16,
                padding: 20,
                marginBottom: 20,
                border: '1px solid rgba(22,119,255,0.15)',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{
                            fontSize: 22,
                            fontWeight: 700,
                            background: 'linear-gradient(90deg, #fff, #a5b4fc)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            marginBottom: 6,
                        }}>
                            🎬 口播数字人分身
                        </div>
                        <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                            确认逐字稿 → 准备音频 → 一键生成口播视频
                        </Typography.Text>
                    </div>
                    <CloudServiceStatus kind="gpu" />
                </div>
            </div>

            {/* 步骤指示器 */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 12,
                marginBottom: 24,
            }}>
                <StepIndicator
                    stepNumber={1}
                    title="确认逐字稿"
                    completed={transcriptConfirmed}
                    active={!transcriptConfirmed}
                />
                <StepIndicator
                    stepNumber={2}
                    title="准备音频"
                    completed={hasAudio}
                    active={transcriptConfirmed && !hasAudio}
                />
                <StepIndicator
                    stepNumber={3}
                    title="生成视频"
                    completed={hasVideo}
                    active={transcriptConfirmed && hasAudio && !hasVideo}
                />
            </div>







            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
                    gap: 24,
                    alignItems: 'flex-start',
                }}
            >
                <div
                    style={{
                        borderRadius: 20,
                        border: '1px solid rgba(255,255,255,0.08)',
                        background: 'rgba(255,255,255,0.02)',
                        padding: 24,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 16,
                    }}
                >
                    <div style={{ marginBottom: 12 }}>
                        <Typography.Title level={5} style={{ color: '#fff', margin: 0 }}>
                            克隆音色
                        </Typography.Title>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            先确认逐字稿并生成音频，再回到这里生成数字人视频
                        </Typography.Text>
                    </div>
                    {/* 第一步：逐字稿（先确认内容） */}
                    <Card
                        style={{
                            borderRadius: 16,
                            border: '1px solid rgba(255,255,255,0.06)',
                            background: 'rgba(255,255,255,0.02)',
                        }}
                        bodyStyle={{ padding: 20 }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <FileTextOutlined style={{ fontSize: 18, color: '#faad14' }} />
                                <Typography.Text style={{ fontSize: 16, fontWeight: 600 }}>
                                    逐字稿（先确认）
                                </Typography.Text>
                                <Tag color={transcriptConfirmed ? 'green' : 'orange'} style={{ marginInlineStart: 4 }}>
                                    {transcriptConfirmed ? '已确认' : '待确认'}
                                </Tag>
                            </div>
                            <Space size={8}>
                                <Button
                                    size="small"
                                    onClick={async () => {
                                        const text = (digitalHumanSelectedCopy?.copy || textToSpeak || '').trim()
                                        if (!text) {
                                            message.warning('没有可复制的逐字稿')
                                            return
                                        }
                                        try {
                                            await navigator.clipboard.writeText(text)
                                            message.success('已复制逐字稿')
                                        } catch {
                                            message.error('复制失败，请手动复制')
                                        }
                                    }}
                                >
                                    复制
                                </Button>
                                {!digitalHumanScriptConfirmed && (
                                    <Button
                                        type="primary"
                                        size="small"
                                        onClick={() => {
                                            const draftText = (digitalHumanSelectedCopy?.copy || rewrittenCopy || originalCopy || '').trim()
                                            if (!draftText) {
                                                message.warning('逐字稿为空，无法确认')
                                                return
                                            }
                                            setDigitalHumanScriptConfirmed(true)
                                            message.success('已确认逐字稿，将用于本次出片')
                                        }}
                                    >
                                        确认用于出片
                                    </Button>
                                )}
                            </Space>
                        </div>

                        {transcriptCandidates.length > 1 && (
                            <div style={{ marginBottom: 12 }}>
                                <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>
                                    你有 {transcriptCandidates.length} 份逐字稿，本次只能选择 1 份出片
                                </Typography.Text>
                                <Select
                                    value={(digitalHumanSelectedCopy?.title || transcriptCandidates[0]?.title || '').trim()}
                                    onChange={(title) => {
                                        const next = transcriptCandidates.find(c => c.title === title)
                                        if (!next) return
                                        if (audioPath) setAudioPath(null)
                                        if (digitalHumanVideoPath) {
                                            const previousVideoPath = digitalHumanVideoPath
                                            setDigitalHumanVideoPath(null)
                                            if (finalVideoPath === previousVideoPath) {
                                                setFinalVideoPath(null)
                                            }
                                        }
                                        setDigitalHumanSelectedCopy({ title: next.title, copy: next.copy })
                                    }}
                                    style={{ width: '100%' }}
                                    options={transcriptCandidates.map((c) => ({
                                        value: c.title,
                                        label: (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {c.title}
                                                </span>
                                                <Tag color={c.source === 'rewritten' ? 'green' : 'default'} style={{ margin: 0 }}>
                                                    {c.source === 'rewritten' ? '原创' : '原文'}
                                                </Tag>
                                            </div>
                                        ),
                                    }))}
                                />
                            </div>
                        )}

                        <Input.TextArea
                            value={digitalHumanSelectedCopy?.copy ?? textToSpeak}
                            onChange={(e) => {
                                const title = (digitalHumanSelectedCopy?.title || transcriptCandidates[0]?.title || '逐字稿').trim()
                                // 文案变更后，必须重新确认；已生成的音频/视频也会失效，避免出片内容不一致
                                if (audioPath) setAudioPath(null)
                                if (digitalHumanVideoPath) {
                                    const previousVideoPath = digitalHumanVideoPath
                                    setDigitalHumanVideoPath(null)
                                    if (finalVideoPath === previousVideoPath) {
                                        setFinalVideoPath(null)
                                    }
                                }
                                setDigitalHumanSelectedCopy({ title, copy: e.target.value })
                            }}
                            placeholder="这里会展示逐字稿内容（可编辑）。编辑完成后请点击上方「确认用于出片」。"
                            autoSize={{ minRows: 6, maxRows: 12 }}
                        />

                        {!digitalHumanScriptConfirmed && (
                            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 10, fontSize: 12 }}>
                                编辑好逐字稿后，点击上方「确认用于出片」再进入音频生成。
                            </Typography.Text>
                        )}
                    </Card>

                    {/* 第二步：准备音频（克隆我的声音） */}
                    <Card
                        style={{
                            marginTop: 16,
                            borderRadius: 16,
                            border: '1px solid rgba(255,255,255,0.06)',
                            background: 'rgba(255,255,255,0.02)',
                        }}
                        bodyStyle={{ padding: 20 }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <SoundOutlined style={{ fontSize: 18, color: '#722ed1' }} />
                                <Typography.Text style={{ fontSize: 16, fontWeight: 600 }}>
                                    准备音频（克隆我的声音）
                                </Typography.Text>
                            </div>
                            {audioPath ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '6px 12px',
                                        borderRadius: 8,
                                        background: 'rgba(82,196,26,0.1)',
                                        border: '1px solid rgba(82,196,26,0.2)',
                                    }}>
                                        <CheckCircleFilled style={{ color: '#52c41a' }} />
                                        <Typography.Text style={{ color: '#52c41a', fontSize: 13 }}>
                                            {getBasename(audioPath)}
                                        </Typography.Text>
                                    </div>
                                    <Button
                                        size="small"
                                        icon={<PlayCircleOutlined />}
                                        onClick={() => setPreview('audio', audioPath)}
                                    >
                                        试听
                                    </Button>
                                    <Button
                                        size="small"
                                        type="primary"
                                        onClick={() => setActiveKey('audio')}
                                        disabled={digitalHumanGenerating}
                                    >
                                        更换音色/重新合成
                                    </Button>
                                    <Button
                                        size="small"
                                        danger
                                        onClick={() => {
                                            Modal.confirm({
                                                title: '重做音频？',
                                                content: '将清空当前已生成的音频文件，并跳转到「音频生成」重新合成。',
                                                okText: '清空并前往',
                                                cancelText: '取消',
                                                onOk: () => {
                                                    setAudioPath(null)
                                                    setActiveKey('audio')
                                                },
                                            })
                                        }}
                                        disabled={digitalHumanGenerating}
                                    >
                                        重做
                                    </Button>
                                </div>
                            ) : (
                                <Button
                                    type="primary"
                                    icon={<AudioOutlined />}
                                    onClick={() => setActiveKey('audio')}
                                    disabled={!transcriptConfirmed || digitalHumanGenerating}
                                >
                                    去录制/合成音频
                                </Button>
                            )}
                        </div>
                        {!!selectedCloudVoiceId && (
                            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 10, fontSize: 12 }}>
                                当前选择的声音模型：{selectedCloudVoiceId}
                            </Typography.Text>
                        )}
                        {!audioPath && (
                            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 13 }}>
                                💡 提示：先确认逐字稿，再合成音频，避免生成错内容
                            </Typography.Text>
                        )}
                    </Card>
                </div>

                <div
                    style={{
                        borderRadius: 20,
                        border: '1px solid rgba(255,255,255,0.08)',
                        background: 'rgba(255,255,255,0.02)',
                        padding: 24,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 16,
                    }}
                >
                    <div style={{ marginBottom: 12 }}>
                        <Typography.Title level={5} style={{ color: '#fff', margin: 0 }}>
                            数字人合成
                        </Typography.Title>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            音频就绪后在此挑选形象并生成视频
                        </Typography.Text>
                    </div>
                    {/* 第一步：选择形象 */}
                    <Card
                        style={{
                            marginBottom: 16,
                            borderRadius: 16,
                            border: '1px solid rgba(255,255,255,0.06)',
                            background: 'rgba(255,255,255,0.02)',
                        }}
                        bodyStyle={{ padding: 20 }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <UserOutlined style={{ fontSize: 18, color: '#1677ff' }} />
                                <Typography.Text style={{ fontSize: 16, fontWeight: 600 }}>
                                    我的数字人形象
                                </Typography.Text>
                            </div>
                            <Space>
                                <Tooltip title={!readyForVideo ? '先完成左侧逐字稿确认 + 音频' : '首次加载可能需要一点时间'}>
                                    <span>
                                        <Button
                                            icon={<ReloadOutlined />}
                                            onClick={() => {
                                                setAvatarsLoaded(false)
                                                void refreshAvatars()
                                            }}
                                            disabled={!readyForVideo || digitalHumanGenerating || avatarsLoading}
                                            style={{ borderRadius: 8 }}
                                        >
                                            {avatarsLoaded ? '刷新列表' : '加载形象'}
                                        </Button>
                                    </span>
                                </Tooltip>

                                <Tooltip title={!readyForVideo ? '先完成左侧逐字稿确认 + 音频' : undefined}>
                                    <span>
                                        <Button
                                            type="primary"
                                            icon={<PlusOutlined />}
                                            onClick={() => setShowNewAvatarModal(true)}
                                            disabled={!readyForVideo || digitalHumanGenerating || avatarsLoading}
                                            style={{
                                                borderRadius: 8,
                                                background: 'linear-gradient(135deg, #1677ff, #4096ff)',
                                                border: 'none',
                                                opacity: (!readyForVideo || digitalHumanGenerating || avatarsLoading) ? 0.6 : 1,
                                            }}
                                        >
                                            创建新形象
                                        </Button>
                                    </span>
                                </Tooltip>
                            </Space>
                        </div>

                        {avatars.length === 0 ? (
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description={
                                    !readyForVideo ? (
                                        <div>
                                            <div style={{ marginBottom: 8 }}>先完成左侧步骤</div>
                                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                                确认逐字稿并准备好音频后，点击右上角「加载形象」即可加载列表。
                                            </Typography.Text>
                                        </div>
                                    ) : avatarsLoading ? (
                                        <div>
                                            <div style={{ marginBottom: 8 }}>正在加载形象…</div>
                                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                                首次加载可能需要一点时间；如长时间无响应，可点击右上角「设置」检查服务器配置。
                                            </Typography.Text>
                                        </div>
                                    ) : !avatarsLoaded ? (
                                        <div>
                                            <div style={{ marginBottom: 10 }}>还没加载形象列表</div>
                                            <Button
                                                icon={<ReloadOutlined />}
                                                onClick={() => {
                                                    setAvatarsLoaded(false)
                                                    void refreshAvatars()
                                                }}
                                                disabled={digitalHumanGenerating}
                                                style={{ borderRadius: 8 }}
                                            >
                                                立即加载
                                            </Button>
                                        </div>
                                    ) : (
                                        <div>
                                            <div style={{ marginBottom: 8 }}>还没有数字人形象</div>
                                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                                点击“创建新形象”上传一段说话视频，即可克隆你的数字分身
                                            </Typography.Text>
                                        </div>
                                    )
                                }
                            />
                        ) : (
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                                gap: 12,
                            }}>
                                {avatars.map(avatar => (
                                    <div
                                        key={avatar.id}
                                        onClick={() => setSelectedAvatarId(avatar.id)}
                                        style={{
                                            position: 'relative',
                                            padding: 12,
                                            borderRadius: 12,
                                            border: selectedAvatarId === avatar.id
                                                ? '2px solid #1677ff'
                                                : '1px solid rgba(255,255,255,0.08)',
                                            background: selectedAvatarId === avatar.id
                                                ? 'rgba(22,119,255,0.1)'
                                                : 'rgba(255,255,255,0.02)',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                        }}
                                    >
                                        <div style={{
                                            width: '100%',
                                            aspectRatio: '16/9',
                                            borderRadius: 8,
                                            background: 'linear-gradient(135deg, rgba(22,119,255,0.2), rgba(118,75,162,0.2))',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            marginBottom: 8,
                                            overflow: 'hidden',
                                        }}>
                                            {avatar.localPreviewPath ? (
                                                <video
                                                    src={`file://${avatar.localPreviewPath}`}
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                    muted
                                                />
                                            ) : (
                                                <UserOutlined style={{ fontSize: 32, color: 'rgba(255,255,255,0.3)' }} />
                                            )}
                                        </div>
                                        <div style={{
                                            fontSize: 14,
                                            fontWeight: 500,
                                            color: '#fff',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}>
                                            {avatar.name}
                                        </div>
                                        {selectedAvatarId === avatar.id && (
                                            <CheckCircleFilled style={{
                                                position: 'absolute',
                                                top: 8,
                                                right: 8,
                                                fontSize: 18,
                                                color: '#1677ff',
                                            }} />
                                        )}
                                        <Tooltip title="删除">
                                            <Button
                                                type="text"
                                                size="small"
                                                icon={<DeleteOutlined />}
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    handleDeleteAvatar(avatar.id)
                                                }}
                                                style={{
                                                    position: 'absolute',
                                                    bottom: 8,
                                                    right: 8,
                                                    color: 'rgba(255,255,255,0.3)',
                                                }}
                                            />
                                        </Tooltip>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>

                    {/* 第三步：生成视频 */}
                    <Card
                        style={{
                            borderRadius: 16,
                            border: (hasAvatar && (hasAudio || hasText))
                                ? '2px solid rgba(22,119,255,0.4)'
                                : '1px solid rgba(255,255,255,0.06)',
                            background: (hasAvatar && (hasAudio || hasText))
                                ? 'linear-gradient(135deg, rgba(22,119,255,0.08) 0%, rgba(118,75,162,0.05) 100%)'
                                : 'rgba(255,255,255,0.02)',
                        }}
                        bodyStyle={{ padding: 24 }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                            <VideoCameraOutlined style={{ fontSize: 18, color: '#1677ff' }} />
                            <Typography.Text style={{ fontSize: 16, fontWeight: 600 }}>
                                生成口播视频（分身出镜）
                            </Typography.Text>
                        </div>


                        {digitalHumanGenerating && (
                            <div style={{ marginBottom: 20 }}>
                                <Progress
                                    percent={digitalHumanProgress}
                                    status="active"
                                    strokeColor={{
                                        '0%': '#1677ff',
                                        '100%': '#722ed1',
                                    }}
                                    style={{ marginBottom: 8 }}
                                />
                                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.65)' }}>
                                    {digitalHumanProgressText}
                                </div>
                            </div>
                        )}

                        {/* 下载进度条 */}
                        {isDownloading && (
                            <div style={{ marginBottom: 20 }}>
                                <Progress
                                    percent={downloadProgress}
                                    status="active"
                                    strokeColor={{
                                        '0%': '#52c41a',
                                        '100%': '#73d13d',
                                    }}
                                    style={{ marginBottom: 8 }}
                                />
                                <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.65)' }}>
                                    {downloadProgressText}
                                </div>
                            </div>
                        )}

                        {/* 合成完成提示 + 下载按钮 */}
                        {synthesisResult && !digitalHumanGenerating && !isDownloading && (
                            <div style={{
                                marginBottom: 16,
                                padding: 16,
                                borderRadius: 12,
                                background: 'rgba(82,196,26,0.1)',
                                border: '1px solid rgba(82,196,26,0.3)',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                    <CheckCircleFilled style={{ color: '#52c41a', fontSize: 18 }} />
                                    <Typography.Text style={{ color: '#52c41a', fontWeight: 600 }}>
                                        视频合成完成！
                                    </Typography.Text>
                                </div>
                                <Button
                                    type="primary"
                                    size="large"
                                    icon={<DownloadOutlined />}
                                    onClick={handleDownloadVideo}
                                    block
                                    style={{
                                        height: 48,
                                        borderRadius: 10,
                                        fontSize: 15,
                                        fontWeight: 600,
                                        background: 'linear-gradient(135deg, #52c41a, #73d13d)',
                                        border: 'none',
                                    }}
                                >
                                    下载视频到本地
                                </Button>
                            </div>
                        )}

                        {/* 合成按钮 - 仅当没有合成结果时显示 */}
                        {!synthesisResult && (
                            <Button
                                type="primary"
                                size="large"
                                icon={<RocketOutlined />}
                                onClick={handleSynthesizeOnly}
                                loading={digitalHumanGenerating}
                                disabled={!hasAvatar || !hasAudio || !transcriptConfirmed || isDownloading}
                                block
                                style={{
                                    height: 52,
                                    borderRadius: 12,
                                    fontSize: 16,
                                    fontWeight: 600,
                                    background: (hasAvatar && hasAudio)
                                        ? 'linear-gradient(135deg, #1677ff, #722ed1)'
                                        : undefined,
                                    border: 'none',
                                    boxShadow: (hasAvatar && hasAudio)
                                        ? '0 8px 24px rgba(22,119,255,0.3)'
                                        : undefined,
                                }}
                            >
                                {digitalHumanGenerating ? '正在合成中...' : '开始合成视频'}
                            </Button>
                        )}

                        {digitalHumanVideoPath && !digitalHumanGenerating && (
                            <div style={{
                                marginTop: 14,
                                padding: 12,
                                borderRadius: 12,
                                background: 'rgba(82,196,26,0.08)',
                                border: '1px solid rgba(82,196,26,0.18)',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: 12,
                            }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                                    <Typography.Text style={{ color: 'rgba(255,255,255,0.88)', fontWeight: 600 }}>
                                        生成完成
                                    </Typography.Text>
                                    <Typography.Text style={{
                                        color: 'rgba(255,255,255,0.65)',
                                        fontSize: 12,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {getBasename(digitalHumanVideoPath)}
                                    </Typography.Text>
                                </div>
                                <Space>
                                    <Button
                                        size="small"
                                        icon={<PlayCircleOutlined />}
                                        onClick={() => setPreview('video', digitalHumanVideoPath)}
                                    >
                                        预览
                                    </Button>
                                    <Button
                                        size="small"
                                        type="primary"
                                        icon={<DownloadOutlined />}
                                        loading={isSavingToDesktop}
                                        onClick={handleSaveResultToDesktop}
                                    >
                                        下载到桌面
                                    </Button>
                                </Space>
                            </div>
                        )}


                    </Card>
                </div>
            </div>

            {/* 创建形象弹窗 */}
            <Modal
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <UserOutlined style={{ color: '#1677ff' }} />
                        创建数字人形象
                    </div>
                }
                open={showNewAvatarModal}
                onCancel={() => {
                    setShowNewAvatarModal(false)
                    setNewAvatarName('')
                    setNewAvatarFile(null)
                }}
                footer={null}
                width={480}
            >
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    <div>
                        <div style={{ marginBottom: 8, fontWeight: 500 }}>形象名称</div>
                        <Input
                            placeholder="例如：我的数字分身"
                            value={newAvatarName}
                            onChange={e => setNewAvatarName(e.target.value)}
                            size="large"
                        />
                    </div>

                    <div>
                        <div style={{ marginBottom: 8, fontWeight: 500 }}>上传形象视频</div>
                        <Upload
                            accept="video/*"
                            beforeUpload={(file) => {
                                setNewAvatarFile(file)
                                return false
                            }}
                            showUploadList={false}
                            disabled={isSavingAvatar}
                        >
                            <Button
                                icon={<UploadOutlined />}
                                size="large"
                                block
                                style={{ height: 48 }}
                            >
                                {newAvatarFile ? newAvatarFile.name : '选择视频文件'}
                            </Button>
                        </Upload>
                        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
                            💡 建议：10-30秒、正面露脸、有说话动作、光线充足的视频效果最佳
                        </Typography.Text>
                    </div>

                    <Button
                        type="primary"
                        size="large"
                        onClick={handleSaveNewAvatar}
                        loading={isSavingAvatar}
                        disabled={!newAvatarFile || !newAvatarName.trim()}
                        block
                        style={{ marginTop: 8, height: 48 }}
                    >
                        保存形象
                    </Button>
                </Space>
            </Modal>
        </div>
    )
}

export default DigitalHumanPanel
