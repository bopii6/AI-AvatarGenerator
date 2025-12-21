import { Alert, Button, Segmented, Select, Space, Spin, message } from 'antd'
import { SoundOutlined, ReloadOutlined } from '@ant-design/icons'
import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/appStore'

interface VoiceOption {
    voiceType: number
    name: string
    gender: 'male' | 'female' | 'child'
    description: string
}

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
    const [mode, setMode] = useState<'preset' | 'clone'>('preset')
    const [voices, setVoices] = useState<VoiceOption[]>([])
    const [selectedVoice, setSelectedVoice] = useState<number>(101001)
    const [cloudOnline, setCloudOnline] = useState<boolean | null>(null)
    const [cloudOnlineMsg, setCloudOnlineMsg] = useState<string>('')
    const [cloudModels, setCloudModels] = useState<Array<{ id: string; name: string; status: string }>>([])
    const [selectedCloudVoiceId, setSelectedCloudVoiceId] = useState<string>('')
    const [loading, setLoading] = useState(false)
    const { rewrittenCopy, originalCopy, audioPath, setAudioPath, setPreview, setCurrentStep } = useAppStore()

    const textToSpeak = rewrittenCopy || originalCopy

    // 加载音色列表
    useEffect(() => {
        try {
            const savedMode = localStorage.getItem('audio.voiceMode')
            if (savedMode === 'preset' || savedMode === 'clone') setMode(savedMode)
            const savedPreset = localStorage.getItem('audio.presetVoiceId')
            if (savedPreset && /^\d+$/.test(savedPreset)) setSelectedVoice(parseInt(savedPreset, 10))
            const savedCloud = localStorage.getItem('audio.cloudVoiceId')
            if (savedCloud) setSelectedCloudVoiceId(savedCloud)
        } catch { /* ignore */ }
        loadVoices()
    }, [])

    useEffect(() => {
        try { localStorage.setItem('audio.voiceMode', mode) } catch { /* ignore */ }
    }, [mode])

    useEffect(() => {
        try { localStorage.setItem('audio.presetVoiceId', String(selectedVoice)) } catch { /* ignore */ }
    }, [selectedVoice])

    useEffect(() => {
        if (!selectedCloudVoiceId) return
        try { localStorage.setItem('audio.cloudVoiceId', selectedCloudVoiceId) } catch { /* ignore */ }
    }, [selectedCloudVoiceId])

    useEffect(() => {
        if (mode !== 'clone') return
        loadCloudModels()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode])

    const loadVoices = async () => {
        try {
            const result = await window.electronAPI?.invoke('get-voice-options')
            if (result?.success && result.data) {
                setVoices(result.data)
                // 如果当前选择的音色不在列表中，默认选择第一个
                if (result.data.length > 0) {
                    setSelectedVoice(result.data[0].voiceType)
                }
            }
        } catch (error) {
            console.error('加载音色失败:', error)
            message.error('加载音色列表失败')
        }
    }

    const handleGenerate = async () => {
        if (!textToSpeak) return

        setLoading(true)

        try {
            const result = mode === 'preset'
                ? await window.electronAPI?.invoke('generate-speech', textToSpeak, selectedVoice)
                : await window.electronAPI?.invoke('cloud-voice-tts', { voiceId: selectedCloudVoiceId, text: textToSpeak })

            if (result?.success && result.data?.audioPath) {
                setAudioPath(result.data.audioPath)
                setPreview('audio', result.data.audioPath)
                message.success('音频生成成功！')
            } else {
                throw new Error(result?.error || '生成失败')
            }
        } catch (error: any) {
            console.error('生成失败:', error)
            message.error(`生成失败: ${error.message}`)
        } finally {
            setLoading(false)
        }
    }

    const loadCloudModels = async () => {
        try {
            const status = await window.electronAPI?.invoke('cloud-voice-check-status')
            const ok = !!(status?.success && status.data?.online)
            setCloudOnline(ok)
            setCloudOnlineMsg(status?.data?.message || status?.error || '')
            if (!ok) {
                setCloudModels([])
                setSelectedCloudVoiceId('')
                return
            }

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
            }
        } catch {
            setCloudOnline(false)
            setCloudOnlineMsg('')
            setCloudModels([])
            setSelectedCloudVoiceId('')
        }
    }

    const voiceOptions = voices.map(v => ({
        value: v.voiceType,
        label: `${v.name} (${v.description})`
    }))

    return (
        <div>
            <p style={{ marginBottom: 16, color: '#666' }}>
                生成口播音频：支持预置音色（腾讯云）或克隆你的声音（云端 CosyVoice）。
            </p>

            <Space direction="vertical" style={{ width: '100%' }} size="large">
                {!textToSpeak && (
                    <div style={{ padding: 24, background: '#fffbe6', borderRadius: 8, border: '1px solid #ffe58f' }}>
                        ⚠️ 请先完成文案提取或改写步骤
                    </div>
                )}

                <div>
                    <div style={{ marginBottom: 8, fontWeight: 500 }}>声音来源</div>
                    <Segmented
                        value={mode}
                        onChange={(v) => setMode(v as any)}
                        options={[
                            { label: '预置音色', value: 'preset' },
                            { label: '克隆我的声音', value: 'clone' },
                        ]}
                    />
                </div>

                {mode === 'preset' ? (
                    <div>
                        <div style={{ marginBottom: 8, fontWeight: 500 }}>选择音色</div>
                        <Space>
                            <Select
                                value={selectedVoice}
                                onChange={setSelectedVoice}
                                options={voiceOptions}
                                style={{ width: 260 }}
                                size="large"
                                loading={voices.length === 0}
                            />
                            <Button icon={<ReloadOutlined />} onClick={loadVoices}>刷新音色列表</Button>
                        </Space>
                    </div>
                ) : (
                    <div>
                        {cloudOnline === false && (
                            <Alert
                                type="warning"
                                showIcon
                                message="云端声音克隆服务未连接"
                                description={`请在 .env 配置 CLOUD_VOICE_SERVER_URL / CLOUD_VOICE_PORT，并确保服务可访问。${cloudOnlineMsg ? `（${cloudOnlineMsg}）` : ''}`}
                                style={{ marginBottom: 12 }}
                            />
                        )}
                        <div style={{ marginBottom: 8, fontWeight: 500 }}>选择我的声音模型</div>
                        <Space>
                            <Select
                                value={selectedCloudVoiceId}
                                onChange={setSelectedCloudVoiceId}
                                options={cloudModels.filter(m => m.status === 'ready').map(m => ({ value: m.id, label: m.name }))}
                                style={{ width: 260 }}
                                size="large"
                                disabled={!cloudOnline || cloudModels.length === 0}
                            />
                            <Button icon={<ReloadOutlined />} onClick={loadCloudModels}>刷新模型列表</Button>
                        </Space>
                        {cloudOnline && cloudModels.filter(m => m.status === 'ready').length === 0 && (
                            <div style={{ marginTop: 8, color: '#999' }}>
                                暂无可用声音模型：请先在「设置 → 声音克隆」训练你的声音。
                            </div>
                        )}
                    </div>
                )}

                <Button
                    type="primary"
                    icon={<SoundOutlined />}
                    size="large"
                    loading={loading}
                    onClick={handleGenerate}
                    disabled={!textToSpeak || (mode === 'clone' && (!cloudOnline || !selectedCloudVoiceId))}
                >
                    生成音频
                </Button>

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
                            <Button type="primary" onClick={() => setCurrentStep(4)}>
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
