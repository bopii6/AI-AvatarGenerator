/**
 * 口播数字人分身 - 简化版
 * 
 * 设计原则：
 * - 去掉技术术语（CPU、GPU、Python）
 * - 三步流程：选形象 → 录音频 → 生成视频
 * - 高级质感，值 2000 元/年
 */

import { Button, Upload, Space, Progress, Card, message, Input, Modal, Typography, Empty, Tooltip } from 'antd'
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
} from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'

interface AvatarModel {
    id: string
    name: string
    remoteVideoPath: string
    localPreviewPath?: string
    createdAt: string
}

interface ServerStatus {
    online: boolean
    message: string
}

function getBasename(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/')
    return normalized.split('/').pop() || filePath
}

function getSavedAudioPrefs(): { mode: 'preset' | 'clone'; presetVoiceId?: number; cloudVoiceId?: string } {
    try {
        const modeRaw = (localStorage.getItem('audio.voiceMode') || '').trim()
        const mode = modeRaw === 'clone' ? 'clone' : 'preset'
        const presetRaw = (localStorage.getItem('audio.presetVoiceId') || '').trim()
        const presetVoiceId = /^\d+$/.test(presetRaw) ? parseInt(presetRaw, 10) : undefined
        const cloudVoiceId = (localStorage.getItem('audio.cloudVoiceId') || '').trim() || undefined
        return { mode, presetVoiceId, cloudVoiceId }
    } catch {
        return { mode: 'preset' }
    }
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
        setAudioPath,
        setPreview,
        setDigitalHumanVideoPath,
        setCurrentStep,
    } = useAppStore()

    // 状态
    const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null)
    const [avatars, setAvatars] = useState<AvatarModel[]>([])
    const [selectedAvatarId, setSelectedAvatarId] = useState<string>('')
    const [showNewAvatarModal, setShowNewAvatarModal] = useState(false)
    const [newAvatarName, setNewAvatarName] = useState('')
    const [newAvatarFile, setNewAvatarFile] = useState<File | null>(null)
    const [isSavingAvatar, setIsSavingAvatar] = useState(false)

    const [isGenerating, setIsGenerating] = useState(false)
    const [progress, setProgress] = useState(0)
    const [progressText, setProgressText] = useState('')
    const [isSavingToDesktop, setIsSavingToDesktop] = useState(false)

    // 当前步骤
    const selectedAvatar = avatars.find(a => a.id === selectedAvatarId)
    const hasAvatar = !!selectedAvatar
    const hasAudio = !!audioPath
    const textToSpeak = (rewrittenCopy || originalCopy || '').trim()
    const hasText = textToSpeak.length > 0

    // 初始化
    useEffect(() => {
        checkServer()
        loadAvatars()

        const removeListener = window.electronAPI?.on('cloud-gpu-progress', (data: any) => {
            setProgress(data?.progress ?? 0)
            setProgressText(data?.message ?? '')
        })

        return () => {
            if (removeListener) removeListener()
        }
    }, [])

const checkServer = async () => {
        try {
            const result = await window.electronAPI?.invoke('cloud-gpu-check-status')
            if (result?.success) {
                setServerStatus(result.data)
            } else {
                setServerStatus({ online: false, message: result?.error || '检测服务器失败' })
            }
        } catch (e: any) {
            setServerStatus({ online: false, message: e?.message || '无法连接' })
        }
    }

    const loadAvatars = async () => {
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
    }

    const handleSaveNewAvatar = async () => {
        if (!newAvatarFile || !newAvatarName.trim()) {
            message.warning('请输入形象名称并选择视频')
            return
        }

        setIsSavingAvatar(true)
        try {
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
                await loadAvatars()
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
            await window.electronAPI?.invoke('cloud-gpu-delete-avatar', avatarId)
            message.success('已删除')
            await loadAvatars()
            if (selectedAvatarId === avatarId) {
                setSelectedAvatarId('')
            }
        } catch (e: any) {
            message.error(e.message)
        }
    }

    const handleGenerate = async () => {
        if (!selectedAvatar) {
            message.error('请先选择或创建一个数字人形象')
            return
        }
        if (!hasText && !audioPath) {
            message.error('还没有可用文案：请先完成「文案提取 / 一键原创改写」')
            setCurrentStep(2)
            return
        }

        setIsGenerating(true)
        setProgress(0)
        setProgressText('准备中...')

        try {
            const ensureAudioReady = async (): Promise<string> => {
                if (audioPath) return audioPath
                if (!hasText) throw new Error('文案为空，无法自动生成音频')

                if (!window.electronAPI?.invoke) {
                    throw new Error('桌面端接口未就绪，请重启应用')
                }

                const prefs = getSavedAudioPrefs()

                setProgress(3)
                setProgressText('正在合成语音...')

                if (prefs.mode === 'clone') {
                    if (!prefs.cloudVoiceId) {
                        setCurrentStep(3)
                        throw new Error('未选择声音模型：请到「音频生成」选择我的声音，或到「设置 → 声音克隆」先训练')
                    }

                    const ttsResult = await window.electronAPI.invoke('cloud-voice-tts', {
                        voiceId: prefs.cloudVoiceId,
                        text: textToSpeak,
                    })

                    if (!ttsResult?.success || !ttsResult.data?.audioPath) {
                        throw new Error(ttsResult?.error || '云端声音合成失败')
                    }

                    setAudioPath(ttsResult.data.audioPath)
                    setPreview('audio', ttsResult.data.audioPath)
                    return ttsResult.data.audioPath
                }

                const voiceType = prefs.presetVoiceId ?? 101001
                const ttsResult = await window.electronAPI.invoke('generate-speech', textToSpeak, voiceType)

                if (!ttsResult?.success || !ttsResult.data?.audioPath) {
                    throw new Error(ttsResult?.error || '音频生成失败')
                }

                setAudioPath(ttsResult.data.audioPath)
                setPreview('audio', ttsResult.data.audioPath)
                return ttsResult.data.audioPath
            }

            const readyAudioPath = await ensureAudioReady()

            setProgress(8)
            setProgressText('正在提交视频任务...')

            const result = await window.electronAPI?.invoke('cloud-gpu-generate-video', {
                avatarVideoPath: selectedAvatar.remoteVideoPath,
                audioPath: readyAudioPath,
            })

            if (result?.success && result.data?.videoPath) {
                message.success('视频生成成功！')
                setDigitalHumanVideoPath(result.data.videoPath)
                setPreview('video', result.data.videoPath)
            } else {
                throw new Error(result?.error || '生成失败')
            }
        } catch (e: any) {
            message.error(e.message)
        } finally {
            setIsGenerating(false)
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
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 16px',
                        borderRadius: 20,
                        background: serverStatus?.online
                            ? 'rgba(82,196,26,0.15)'
                            : 'rgba(255,77,79,0.15)',
                        border: serverStatus?.online
                            ? '1px solid rgba(82,196,26,0.3)'
                            : '1px solid rgba(255,77,79,0.3)',
                    }}>
                        <div style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: serverStatus?.online ? '#52c41a' : '#ff4d4f',
                            boxShadow: serverStatus?.online
                                ? '0 0 8px rgba(82,196,26,0.6)'
                                : '0 0 8px rgba(255,77,79,0.6)',
                        }} />
                        <Typography.Text style={{
                            fontSize: 13,
                            color: serverStatus?.online ? '#52c41a' : '#ff4d4f',
                        }}>
                            {serverStatus?.online ? '云端服务已连接' : '等待连接服务器'}
                        </Typography.Text>
                    </div>
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

            {/* 第二步：准备音频 */}
            <Card
                style={{
                    marginBottom: 16,
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
                            准备音频
                        </Typography.Text>
                    </div>
                    {audioPath ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
                        </div>
                    ) : (
                        <Button
                            type="default"
                            icon={<AudioOutlined />}
                            onClick={() => setCurrentStep(3)}
                        >
                            去录制音频
                        </Button>
                    )}
                </div>
                {!audioPath && (
                    <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 13 }}>
                        💡 提示：没有音频也没关系，点击下方「一键出片」会按你在“音频生成”里选的声音自动配音
                    </Typography.Text>
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

                {isGenerating && (
                    <div style={{ marginBottom: 20 }}>
                        <Progress
                            percent={progress}
                            status="active"
                            strokeColor={{
                                '0%': '#1677ff',
                                '100%': '#722ed1',
                            }}
                            style={{ marginBottom: 8 }}
                        />
                        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.65)' }}>
                            {progressText}
                        </div>
                    </div>
                )}

                <Button
                    type="primary"
                    size="large"
                    icon={<RocketOutlined />}
                    onClick={handleGenerate}
                    loading={isGenerating}
                    disabled={!hasAvatar || (!hasAudio && !hasText) || !serverStatus?.online}
                    block
                    style={{
                        height: 52,
                        borderRadius: 12,
                        fontSize: 16,
                        fontWeight: 600,
                        background: (hasAvatar && (hasAudio || hasText) && serverStatus?.online)
                            ? 'linear-gradient(135deg, #1677ff, #722ed1)'
                            : undefined,
                        border: 'none',
                        boxShadow: (hasAvatar && (hasAudio || hasText) && serverStatus?.online)
                            ? '0 8px 24px rgba(22,119,255,0.3)'
                            : undefined,
                    }}
                >
                    {isGenerating ? '正在生成中...' : '一键出片（自动配音+生成视频）'}
                </Button>

                {digitalHumanVideoPath && !isGenerating && (
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

                {!serverStatus?.online && (
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
                                云端服务器未连接
                            </Typography.Text>
                            <Typography.Text type="danger" style={{ fontSize: 12, opacity: 0.85 }}>
                                {serverStatus?.message || '未知错误'}
                            </Typography.Text>
                        </div>
                    </div>
                )}
            </Card>

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
