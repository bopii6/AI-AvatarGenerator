import { Alert, Button, Select, Space, Spin, message } from 'antd'
import { SoundOutlined, ReloadOutlined } from '@ant-design/icons'
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import { isServiceSwitchingError, startServiceSwitchingHint } from '../../utils/serviceSwitchingHint'
import { useGpuScheduler } from '../../contexts/GpuSchedulerContext'
import GpuServiceStatus from '../GpuServiceStatus'

function toFileUrl(filePath: string): string {
    if (filePath.startsWith('file://')) filePath = filePath.slice(7)
    const normalizedPath = filePath.replace(/\\/g, '/')
    const encoded = normalizedPath
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/')
    return `file:///${encoded.replace(/^\/+/, '')}`
}

function AudioPanel() {
    const [cloudModels, setCloudModels] = useState<Array<{ id: string; name: string; status: string }>>([])
    const [selectedCloudVoiceId, setSelectedCloudVoiceId] = useState<string>('')
    const [loading, setLoading] = useState(false)
    const [errorText, setErrorText] = useState('')
    const {
        rewrittenCopy,
        originalCopy,
        batchCopies,
        digitalHumanSelectedCopy,
        digitalHumanScriptConfirmed,
        audioPath,
        setAudioPath,
        setPreview,
        setActiveKey,
        digitalHumanGenerating,
    } = useAppStore()

    const { status: schedulerStatus, isRunning: isServiceRunning, preswitch } = useGpuScheduler()
    const schedulerOnline = !!schedulerStatus?.online
    const cosyvoiceReady = schedulerOnline
        && !schedulerStatus?.switching
        && isServiceRunning('cosyvoice')
        && !!schedulerStatus?.servicesHealth?.cosyvoice
    const pendingLoadModelsRef = useRef(false)

    const needsTranscriptConfirm = batchCopies.length > 1
    const transcriptConfirmed = !needsTranscriptConfirm || digitalHumanScriptConfirmed
    const textToSpeak = (digitalHumanSelectedCopy?.copy || rewrittenCopy || originalCopy || '').trim()

    const generateDisabledReasons: string[] = []
    if (digitalHumanGenerating) generateDisabledReasons.push('正在生成数字人视频中')
    if (!textToSpeak) generateDisabledReasons.push('还没有逐字稿/文案内容')
    if (!transcriptConfirmed) generateDisabledReasons.push('还没确认逐字稿用于出片')
    if (schedulerStatus?.apiKeyError) generateDisabledReasons.push('API 密钥无效或未配置')
    if (!cosyvoiceReady) generateDisabledReasons.push('云端声音服务未就绪（点“刷新模型列表”准备）')
    if (!selectedCloudVoiceId) generateDisabledReasons.push('还没选择声音模型')
    const isGenerateDisabled = generateDisabledReasons.length > 0

    // 读取用户选择的“克隆声音模型”
    useEffect(() => {
        try {
            const savedCloud = localStorage.getItem('audio.cloudVoiceId')
            if (savedCloud) setSelectedCloudVoiceId(savedCloud)
        } catch { /* ignore */ }
    }, [])

    useEffect(() => {
        if (!selectedCloudVoiceId) return
        try { localStorage.setItem('audio.cloudVoiceId', selectedCloudVoiceId) } catch { /* ignore */ }
    }, [selectedCloudVoiceId])

    useEffect(() => {
        if (digitalHumanGenerating) return
        // 仅在服务已就绪时自动拉一次模型列表；不要因为进入页面而触发切换/等待
        if (!cosyvoiceReady) return
        loadCloudModels()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cosyvoiceReady, digitalHumanGenerating])

    const handleGenerate = async () => {
        if (!textToSpeak) return
        if (!transcriptConfirmed) {
            message.warning('请先在「数字人」中选择逐字稿并点击「确认用于出片」')
            return
        }
        if (digitalHumanGenerating) {
            message.warning('正在生成数字人视频，为避免云端服务切换导致失败，请等待完成后再生成音频')
            return
        }
        if (!selectedCloudVoiceId) {
            message.warning('请先选择你的声音模型')
            return
        }
        if (schedulerStatus?.apiKeyError) {
            message.error('API 密钥无效或未配置：请先在右上角「设置」里填写正确的密钥')
            return
        }
        if (!cosyvoiceReady) {
            message.info('正在准备声音克隆服务，请稍候...')
            pendingLoadModelsRef.current = true
            await preswitch('cosyvoice')
            return
        }

        setLoading(true)
        setErrorText('')
        const stopHint = startServiceSwitchingHint('生成音频')

        try {
            const result = await window.electronAPI?.invoke('cloud-voice-tts', { voiceId: selectedCloudVoiceId, text: textToSpeak })

            if (result?.success && result.data?.audioPath) {
                setAudioPath(result.data.audioPath)
                setPreview('audio', result.data.audioPath)
                message.success('音频生成成功！')
            } else {
                throw new Error(result?.error || '生成失败')
            }
        } catch (error: any) {
            console.error('生成失败:', error)
            if (isServiceSwitchingError(error)) {
                const msg = '云端服务正在切换中（单卡省显存模式），请稍等 30–120 秒后再试。'
                setErrorText(msg)
                message.info(msg)
            } else {
                const raw = (error?.message || '').toString()
                const isTimeout = raw.includes('请求超时') || raw.toLowerCase().includes('timeout')
                const msg = isTimeout
                    ? '生成失败：请求超时。通常是云端语音合成耗时较长或网络抖动导致；请稍等 10-20 秒后重试，必要时把逐字稿分段（更短）再生成。'
                    : `生成失败：${error?.message || '未知错误'}`
                setErrorText(msg)
                message.error(msg)
            }
        } finally {
            stopHint()
            setLoading(false)
        }
    }

    const loadCloudModels = async () => {
        const fetchModels = async () => {
            const modelsRes = await window.electronAPI?.invoke('cloud-voice-list-models')
            if (modelsRes?.success && Array.isArray(modelsRes.data)) {
                const models = modelsRes.data
                    .filter((m: any) => m && m.id && m.name)
                    .map((m: any) => ({ id: m.id, name: m.name, status: m.status }))
                setCloudModels(models)
                const ready = models.find((m: any) => m.status === 'ready') || models[0]
                if (!selectedCloudVoiceId && ready) {
                    setSelectedCloudVoiceId(ready.id)
                }
                return
            }

            setCloudModels([])
            setSelectedCloudVoiceId('')
        }

        try {
            if (digitalHumanGenerating) {
                message.warning('正在生成数字人视频，为避免云端服务切换导致失败，暂不加载云端模型列表')
                return
            }
            if (schedulerStatus?.apiKeyError) {
                setCloudModels([])
                setSelectedCloudVoiceId('')
                message.error('API 密钥无效或未配置：请先在右上角「设置」里填写正确的密钥')
                return
            }
            if (!schedulerOnline) {
                setCloudModels([])
                setSelectedCloudVoiceId('')
                message.warning('调度器未连接，请先检查服务器设置')
                return
            }

            if (schedulerStatus?.switching) {
                pendingLoadModelsRef.current = true
                return
            }

            if (!cosyvoiceReady) {
                pendingLoadModelsRef.current = true
                const res = await preswitch('cosyvoice')
                if (res && res.success === false) {
                    pendingLoadModelsRef.current = false
                    message.warning(res.message || '切换声音克隆服务失败')
                    return
                }
                message.info('正在切换到声音克隆服务，请稍候...')
                return
            }

            pendingLoadModelsRef.current = false
            await fetchModels()
        } catch {
            setCloudModels([])
            setSelectedCloudVoiceId('')
        }
    }

    useEffect(() => {
        if (digitalHumanGenerating) return
        if (!pendingLoadModelsRef.current) return
        if (!cosyvoiceReady) return
        pendingLoadModelsRef.current = false
        // 切换完成后自动加载一次
        loadCloudModels()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cosyvoiceReady, digitalHumanGenerating])

    return (
        <div>
            <p style={{ marginBottom: 16, color: '#666' }}>
                生成口播音频：仅支持克隆你的声音（云端 CosyVoice）。
            </p>

            <Space direction="vertical" style={{ width: '100%' }} size="large">
                {digitalHumanGenerating && (
                    <Alert
                        type="warning"
                        showIcon
                        message="正在生成数字人视频"
                        description="为避免云端服务在「声音克隆/数字人」之间来回切换导致失败，音频生成已临时禁用。请等待出片完成后再操作。"
                    />
                )}

                {!!errorText && (
                    <Alert
                        type="error"
                        showIcon
                        message="音频合成失败"
                        description={errorText}
                        closable
                        onClose={() => setErrorText('')}
                    />
                )}
                {needsTranscriptConfirm && !digitalHumanScriptConfirmed && (
                    <Alert
                        type="warning"
                        showIcon
                        message="请先确认逐字稿"
                        description="你当前有多份逐字稿可选：请回到「数字人」面板选择其一并点击「确认用于出片」，再来合成音频。"
                    />
                )}
                {!textToSpeak && (
                    <div style={{ padding: 24, background: '#fffbe6', borderRadius: 8, border: '1px solid #ffe58f' }}>
                        ⚠️ 请先完成文案提取或改写步骤
                    </div>
                )}

                <div>
                    <Alert
                        type="info"
                        showIcon
                        message="为什么有时会等待？"
                        description="如果你用的是单卡 8GB（调度器 9999），系统会在「声音克隆」和「数字人视频」之间自动切换云端服务；首次切换通常需要 30–120 秒，属于正常现象。"
                        style={{ marginBottom: 12 }}
                    />
                    <div style={{ marginBottom: 12 }}>
                        <GpuServiceStatus requiredService="cosyvoice" showDetails />
                    </div>
                    <div style={{ marginBottom: 8, fontWeight: 500 }}>选择我的声音模型</div>
                    <Space>
                        <Select
                            value={selectedCloudVoiceId}
                            onChange={setSelectedCloudVoiceId}
                            options={cloudModels.filter(m => m.status === 'ready').map(m => ({ value: m.id, label: m.name }))}
                            style={{ width: 320 }}
                            size="large"
                            placeholder={cosyvoiceReady ? '请选择你的声音模型' : '等待云端服务就绪...'}
                            disabled={digitalHumanGenerating || !cosyvoiceReady || cloudModels.length === 0}
                        />
                        <Button icon={<ReloadOutlined />} onClick={loadCloudModels} disabled={digitalHumanGenerating}>刷新模型列表</Button>
                    </Space>
                    {cosyvoiceReady && cloudModels.filter(m => m.status === 'ready').length === 0 && (
                        <div style={{ marginTop: 8, color: '#999' }}>
                            暂无可用声音模型：请先在「设置 → 声音克隆」训练你的声音。
                        </div>
                    )}
                </div>

                <Space direction="vertical" style={{ width: '100%' }} size={6}>
                    <Button
                        type="primary"
                        icon={<SoundOutlined />}
                        size="large"
                        loading={loading}
                        onClick={handleGenerate}
                        disabled={isGenerateDisabled}
                        block
                        title={isGenerateDisabled ? generateDisabledReasons.join('；') : undefined}
                    >
                        生成音频
                    </Button>
                    {isGenerateDisabled && (
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                            为什么点不了：{generateDisabledReasons.join('；')}
                        </div>
                    )}
                </Space>

                {loading && (
                    <div style={{ textAlign: 'center', padding: 24 }}>
                        <Spin size="large" />
                        <p style={{ marginTop: 16 }}>正在合成语音...</p>
                    </div>
                )}

                {audioPath && (
                    <div style={{ padding: 16, background: '#f6ffed', borderRadius: 8, border: '1px solid #b7eb8f' }}>
                        <div style={{ marginBottom: 8, fontWeight: 600 }}>
                            <SoundOutlined style={{ marginRight: 8 }} />
                            音频已生成
                        </div>
                        <audio controls style={{ width: '100%' }} src={toFileUrl(audioPath)}>
                            您的浏览器不支持音频播放
                        </audio>
                        <div style={{ marginTop: 12 }}>
                            <Button type="primary" onClick={() => setActiveKey('digitalHuman')}>
                                下一步：生成口播数字人分身
                            </Button>
                        </div>
                    </div>
                )}
            </Space>
        </div>
    )
}

export default AudioPanel
