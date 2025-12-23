import { Alert, Button, Select, Space, Spin, message } from 'antd'
import { SoundOutlined, ReloadOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { useAppStore } from '../../store/appStore'
import CloudServiceStatus from '../CloudServiceStatus'

function toFileUrl(filePath: string): string {
    if (filePath.startsWith('file://')) filePath = filePath.slice(7)
    const normalizedPath = filePath.replace(/\\/g, '/')
    const encoded = normalizedPath
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/')
    return `file:///${encoded.replace(/^\/+/, '')}`
}

type VoiceModel = { id: string; name: string; status: string }

export default function AudioPanel() {
    const [models, setModels] = useState<VoiceModel[]>([])
    const [selectedVoiceId, setSelectedVoiceId] = useState<string>('')
    const [loading, setLoading] = useState(false)

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
    } = useAppStore()

    const needsTranscriptConfirm = batchCopies.length > 1
    const transcriptConfirmed = !needsTranscriptConfirm || digitalHumanScriptConfirmed
    const textToSpeak = (digitalHumanSelectedCopy?.copy || rewrittenCopy || originalCopy || '').trim()

    useEffect(() => {
        try {
            const saved = localStorage.getItem('audio.cloudVoiceId')
            if (saved) setSelectedVoiceId(saved)
        } catch { /* ignore */ }
    }, [])

    useEffect(() => {
        if (!selectedVoiceId) return
        try { localStorage.setItem('audio.cloudVoiceId', selectedVoiceId) } catch { /* ignore */ }
    }, [selectedVoiceId])

    const loadModels = async () => {
        try {
            const res = await window.electronAPI?.invoke('cloud-voice-list-models')
            if (res?.success && Array.isArray(res.data)) {
                setModels(res.data)
                return
            }
            setModels([])
        } catch {
            setModels([])
        }
    }

    useEffect(() => {
        void loadModels()
    }, [])

    const handleGenerate = async () => {
        if (!textToSpeak) {
            message.warning('还没有逐字稿内容')
            return
        }
        if (!transcriptConfirmed) {
            message.warning('请先在「数字人」中确认要用于出片的逐字稿')
            return
        }
        if (!selectedVoiceId) {
            message.warning('请选择音色')
            return
        }

        setLoading(true)
        try {
            const res = await window.electronAPI?.invoke('cloud-voice-tts', {
                voiceId: selectedVoiceId,
                text: textToSpeak,
            })
            if (!res?.success) throw new Error(res?.error || '生成失败')

            const nextPath = res.data?.audioPath
            if (!nextPath) throw new Error('未返回音频路径')

            setAudioPath(nextPath)
            setPreview('audio', nextPath)
            message.success('音频已生成')
        } catch (e: any) {
            message.error(e?.message || '生成失败')
        } finally {
            setLoading(false)
        }
    }

    const readyModels = models.filter(m => m.status === 'ready')

    return (
        <div style={{ padding: 0 }}>
            <Space direction="vertical" style={{ width: '100%' }} size={14}>
                <CloudServiceStatus kind="voice" />

                {!transcriptConfirmed && (
                    <div style={{ padding: 12, background: '#fffbe6', borderRadius: 8, border: '1px solid #ffe58f' }}>
                        请先在「数字人」里确认逐字稿（出片用哪一条）。
                    </div>
                )}

                <Alert
                    type="info"
                    showIcon
                    message="选择音色并一键配音"
                    description="音频生成与数字人生成互不影响，无需再等待云端切换。"
                />

                <div>
                    <div style={{ marginBottom: 12 }}>
                        <div style={{ marginBottom: 8, fontWeight: 500 }}>选择我的音色</div>
                        <Space wrap>
                            <Select
                                value={selectedVoiceId}
                                onChange={setSelectedVoiceId}
                                options={readyModels.map(m => ({ value: m.id, label: m.name }))}
                                style={{ width: 320 }}
                                size="large"
                                placeholder="请选择音色"
                                disabled={readyModels.length === 0}
                            />
                            <Button icon={<ReloadOutlined />} onClick={loadModels}>
                                刷新列表
                            </Button>
                        </Space>
                        {readyModels.length === 0 && (
                            <div style={{ marginTop: 8, color: 'rgba(255,255,255,0.55)' }}>
                                暂无可用音色：请先在「设置 → 声音克隆」创建一个音色。
                            </div>
                        )}
                    </div>

                    <Button
                        type="primary"
                        icon={<SoundOutlined />}
                        size="large"
                        loading={loading}
                        onClick={handleGenerate}
                        disabled={!textToSpeak || !transcriptConfirmed || !selectedVoiceId}
                        block
                    >
                        生成音频
                    </Button>
                </div>

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

