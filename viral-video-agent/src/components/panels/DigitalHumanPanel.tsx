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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { useGpuScheduler } from '../../contexts/GpuSchedulerContext'
import GpuServiceStatus from '../GpuServiceStatus'

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
        setDigitalHumanSelectedCopy,
        setDigitalHumanScriptConfirmed,
        setDigitalHumanGenerating,
        setDigitalHumanProgress,
        setActiveKey,
    } = useAppStore()

    const { status: schedulerStatus, isRunning: isServiceRunning, preswitch } = useGpuScheduler()
    const schedulerOnline = !!schedulerStatus?.online

    // 状态
    const [avatars, setAvatars] = useState<AvatarModel[]>([])
    const [selectedAvatarId, setSelectedAvatarId] = useState<string>('')
    const [showNewAvatarModal, setShowNewAvatarModal] = useState(false)
    const [newAvatarName, setNewAvatarName] = useState('')
    const [newAvatarFile, setNewAvatarFile] = useState<File | null>(null)
    const [isSavingAvatar, setIsSavingAvatar] = useState(false)

    const [isSavingToDesktop, setIsSavingToDesktop] = useState(false)

    // 当前步骤
    const selectedAvatar = avatars.find(a => a.id === selectedAvatarId)
    const hasAvatar = !!selectedAvatar
    const hasAudio = !!audioPath

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

    const needsTranscriptConfirm = transcriptCandidates.length > 1
    const transcriptConfirmed = !needsTranscriptConfirm || digitalHumanScriptConfirmed

    const textToSpeak = (digitalHumanSelectedCopy?.copy || rewrittenCopy || originalCopy || '').trim()
    const hasText = textToSpeak.length > 0

    const didAutoLoadAvatarsRef = useRef(false)

    useEffect(() => {
        if (transcriptCandidates.length === 0) return

        const currentTitle = (digitalHumanSelectedCopy?.title || '').trim()
        const matched = currentTitle && transcriptCandidates.some(c => c.title === currentTitle)

        if (!matched) {
            setDigitalHumanSelectedCopy({ title: transcriptCandidates[0].title, copy: transcriptCandidates[0].copy })
            if (transcriptCandidates.length <= 1) {
                setDigitalHumanScriptConfirmed(true)
            }
            return
        }

        if (transcriptCandidates.length <= 1 && !digitalHumanScriptConfirmed) {
            setDigitalHumanScriptConfirmed(true)
        }
    }, [
        digitalHumanScriptConfirmed,
        digitalHumanSelectedCopy?.title,
        setDigitalHumanScriptConfirmed,
        setDigitalHumanSelectedCopy,
        transcriptCandidates,
    ])

    const ensureDuixReady = useCallback(async (): Promise<boolean> => {
        if (!schedulerOnline) {
            message.warning('调度器未连接，请先检查服务器设置')
            return false
        }
        if (schedulerStatus?.switching) {
            message.info('云端服务正在切换中，请稍候...')
            return false
        }
        if (isServiceRunning('duix')) return true

        const res = await preswitch('duix')
        if (!res?.success) {
            message.warning(res?.message || '切换数字人服务失败')
            return false
        }
        return false
    }, [isServiceRunning, preswitch, schedulerOnline, schedulerStatus?.switching])

    const loadAvatars = useCallback(async () => {
        try {
            const result = await window.electronAPI?.invoke('cloud-gpu-get-avatars')
            if (result?.success) {
                setAvatars(result.data || [])
                if (result.data?.length > 0 && !selectedAvatarId) {
                    setSelectedAvatarId(result.data[0].id)
                }
            }
        } catch (e) {
            console.error('加载形象失败:', e)
        }
    }, [selectedAvatarId])

    const refreshAvatars = useCallback(async () => {
        const ready = await ensureDuixReady()
        if (!ready) return
        await loadAvatars()
    }, [ensureDuixReady, loadAvatars])

    // 初始化：尝试加载形象（必要时先切换到 duix）
    useEffect(() => {
        refreshAvatars()
    }, [refreshAvatars])

    // 若启动时先触发了切换，切换完成后自动拉一次形象列表（仅一次）
    useEffect(() => {
        if (didAutoLoadAvatarsRef.current) return
        if (!schedulerOnline) return
        if (schedulerStatus?.switching) return
        if (!isServiceRunning('duix')) return
        didAutoLoadAvatarsRef.current = true
        loadAvatars()
    }, [loadAvatars, isServiceRunning, schedulerOnline, schedulerStatus?.switching, schedulerStatus?.currentService])

    const handleSaveNewAvatar = async () => {
        if (!newAvatarFile || !newAvatarName.trim()) {
            message.warning('请输入形象名称并选择视频')
            return
        }

        setIsSavingAvatar(true)
        try {
            const ready = await ensureDuixReady()
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
            const ready = await ensureDuixReady()
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

    const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

    const waitForServiceReady = useCallback(async (service: 'cosyvoice' | 'duix', timeoutMs: number = 120_000) => {
        const startedAt = Date.now()

        while (Date.now() - startedAt < timeoutMs) {
            const res = await window.electronAPI?.invoke('scheduler-get-status')
            const data = res?.data

            if (res?.success && data?.online) {
                const isReadyNow = !data.switching
                    && data.current_service === service
                    && data.services_health?.[service] === true

                if (isReadyNow) return
            }

            await sleep(1500)
        }

        throw new Error('云端服务准备超时，请稍后再试')
    }, [])

    const ensureCloudService = useCallback(async (service: 'cosyvoice' | 'duix', label: string) => {
        if (!window.electronAPI?.invoke) {
            throw new Error('桌面端接口未就绪，请重启应用')
        }

        const statusRes = await window.electronAPI.invoke('scheduler-get-status')
        const data = statusRes?.data

        if (!statusRes?.success || !data?.online) {
            throw new Error(statusRes?.error || '调度器未连接，请先检查服务器设置')
        }

        if (data.switching) {
            if (data.switching_target === service) {
                await waitForServiceReady(service)
                return
            }
            throw new Error('云端服务正在切换中，请稍候再试')
        }

        if (data.current_service === service && data.services_health?.[service] === true) {
            return
        }

        const switchRes = await window.electronAPI.invoke('scheduler-preswitch', service)
        if (switchRes && switchRes.success === false) {
            throw new Error(switchRes.error || `切换${label}服务失败`)
        }

        await waitForServiceReady(service)
    }, [waitForServiceReady])

    const generateVideo = useCallback(async (params: { avatarVideoPath: string; audioPath: string }) => {
        const result = await window.electronAPI?.invoke('cloud-gpu-generate-video', params)

        if (result?.success && result.data?.videoPath) {
            setDigitalHumanVideoPath(result.data.videoPath)
            setPreview('video', result.data.videoPath)
            return result.data.videoPath as string
        }

        throw new Error(result?.error || '生成失败')
    }, [setDigitalHumanVideoPath, setPreview])

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
            message.warning('请先确认要用于出片的逐字稿')
            return
        }

        setDigitalHumanGenerating(true)
        setDigitalHumanProgress(0, '准备数字人服务...')

        try {
            await ensureCloudService('duix', '数字人')

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
                            ✨ 口播数字人分身
                        </div>
                        <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                            选择形象 → 准备音频 → 一键生成专业口播视频
                        </Typography.Text>
                    </div>
                    <GpuServiceStatus requiredService="duix" />
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
                    title="选择形象"
                    completed={hasAvatar}
                    active={!hasAvatar}
                />
                <StepIndicator
                    stepNumber={2}
                    title="准备音频"
                    completed={hasAudio}
                    active={hasAvatar && !hasAudio}
                />
                <StepIndicator
                    stepNumber={3}
                    title="生成视频"
                    completed={false}
                    active={hasAvatar && hasAudio}
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
                            先在这里准备语音，再进入数字人阶段，可避免 GPU 来回切换
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
                                        {needsTranscriptConfirm && (
                                            <Tag color={transcriptConfirmed ? 'green' : 'orange'} style={{ marginInlineStart: 4 }}>
                                                {transcriptConfirmed ? '已确认' : '待确认'}
                                            </Tag>
                                        )}
                                    </div>
                                    <Space size={8}>
                                        <Button
                                            size="small"
                                            onClick={async () => {
                                                const text = (digitalHumanSelectedCopy?.copy || '').trim()
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
                                        {needsTranscriptConfirm && !digitalHumanScriptConfirmed && (
                                            <Button
                                                type="primary"
                                                size="small"
                                                onClick={() => {
                                                    if (!textToSpeak) {
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
                                        setDigitalHumanSelectedCopy({ title, copy: e.target.value })
                                    }}
                                    placeholder="这里会展示逐字稿内容（可编辑）。多份逐字稿时请先选择并确认。"
                                    autoSize={{ minRows: 6, maxRows: 12 }}
                                />

                                {needsTranscriptConfirm && !digitalHumanScriptConfirmed && (
                                    <Typography.Text type="secondary" style={{ display: 'block', marginTop: 10, fontSize: 12 }}>
                                        为避免选错文案：请选择逐字稿后，点击上方「确认用于出片」再进入音频生成。
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
                            音色就绪后在此挑选形象并生成视频，减少重复等待
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
                                    <Button
                                        type="primary"
                                        icon={<PlusOutlined />}
                                        onClick={() => setShowNewAvatarModal(true)}
                                        style={{
                                            borderRadius: 8,
                                            background: 'linear-gradient(135deg, #1677ff, #4096ff)',
                                            border: 'none',
                                        }}
                                    >
                                        创建新形象
                                    </Button>
                                </div>

                                {avatars.length === 0 ? (
                                    <Empty
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description={
                                            <div>
                                                <div style={{ marginBottom: 8 }}>还没有数字人形象</div>
                                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                                    点击"创建新形象"上传一段说话视频，即可克隆你的数字分身
                                                </Typography.Text>
                                            </div>
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

                                <Button
                                    type="primary"
                                    size="large"
                                    icon={<RocketOutlined />}
                                    onClick={handleGenerate}
                                    loading={digitalHumanGenerating}
                                    disabled={!hasAvatar || !hasAudio || !schedulerOnline || !transcriptConfirmed}
                                    block
                                    style={{
                                        height: 52,
                                        borderRadius: 12,
                                        fontSize: 16,
                                        fontWeight: 600,
                                        background: (hasAvatar && hasAudio && schedulerOnline)
                                            ? 'linear-gradient(135deg, #1677ff, #722ed1)'
                                            : undefined,
                                        border: 'none',
                                        boxShadow: (hasAvatar && hasAudio && schedulerOnline)
                                            ? '0 8px 24px rgba(22,119,255,0.3)'
                                            : undefined,
                                    }}
                                >
                                    {digitalHumanGenerating ? '正在生成中...' : '生成视频'}
                                </Button>

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

                                {!schedulerOnline && (
                                    <div style={{
                                        marginTop: 12,
                                        padding: 10,
                                        borderRadius: 8,
                                        background: 'rgba(255,77,79,0.1)',
                                        border: '1px solid rgba(255,77,79,0.2)',
                                        display: 'flex',
                                        alignItems: 'flex-start',
                                        gap: 8
                                    }}>
                                        <span style={{ fontSize: 16 }}>⚠️</span>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <Typography.Text type="danger" style={{ fontWeight: 600, fontSize: 13 }}>
                                                调度器未连接
                                            </Typography.Text>
                                            <Typography.Text type="danger" style={{ fontSize: 12, opacity: 0.85 }}>
                                                {schedulerStatus?.error || '无法连接调度器服务，请检查服务器配置与网络'}
                                            </Typography.Text>
                                        </div>
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
