import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Card, Divider, Input, List, message, Progress, Space, Tag, Typography } from 'antd'
import { ReloadOutlined, AudioOutlined } from '@ant-design/icons'
import CloudServiceStatus from './CloudServiceStatus'

type VoiceModel = {
    id: string
    name: string
    status: 'pending' | 'ready' | 'failed'
    createdAt?: string
    updatedAt?: string
    error?: string
}

function blobToBase64Raw(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            const result = reader.result
            if (typeof result !== 'string') {
                reject(new Error('读取音频失败'))
                return
            }
            const comma = result.indexOf(',')
            resolve(comma >= 0 ? result.slice(comma + 1) : result)
        }
        reader.onerror = () => reject(reader.error || new Error('读取音频失败'))
        reader.readAsDataURL(blob)
    })
}

function pickRecorderMimeType(): string | undefined {
    if (typeof MediaRecorder === 'undefined') return undefined
    const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']
    for (const t of candidates) {
        if (MediaRecorder.isTypeSupported(t)) return t
    }
    return undefined
}

function extFromMime(mimeType: string | undefined): string {
    const mt = (mimeType || '').toLowerCase()
    if (mt.includes('ogg')) return 'ogg'
    if (mt.includes('wav')) return 'wav'
    if (mt.includes('mpeg') || mt.includes('mp3')) return 'mp3'
    return 'webm'
}

const MIN_RECORD_SECONDS = 30

export default function VoiceCloneSettings() {
    const [models, setModels] = useState<VoiceModel[]>([])
    const [loadingModels, setLoadingModels] = useState(false)
    const [aliases, setAliases] = useState<Record<string, string>>({})

    const [voiceName, setVoiceName] = useState('')

    const [recording, setRecording] = useState(false)
    const [recordSeconds, setRecordSeconds] = useState(0)
    const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
    const [recordedUrl, setRecordedUrl] = useState<string>('')

    const [creating, setCreating] = useState(false)
    const [creatingVoiceId, setCreatingVoiceId] = useState<string>('')
    const [progress, setProgress] = useState<number>(0)
    const [progressText, setProgressText] = useState<string>('')

    const recorderRef = useRef<MediaRecorder | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const chunksRef = useRef<BlobPart[]>([])
    const timerRef = useRef<number | null>(null)
    const recordedUrlRef = useRef<string>('')

    const canCreate = useMemo(() => {
        return (
            !!recordedBlob &&
            recordSeconds >= MIN_RECORD_SECONDS &&
            !!voiceName.trim() &&
            !recording &&
            !creating
        )
    }, [creating, recording, recordedBlob, recordSeconds, voiceName])

    const cleanupRecording = () => {
        if (timerRef.current) {
            window.clearInterval(timerRef.current)
            timerRef.current = null
        }
        if (recordedUrlRef.current) {
            URL.revokeObjectURL(recordedUrlRef.current)
            recordedUrlRef.current = ''
        }
        setRecording(false)
        setRecordSeconds(0)
        setRecordedBlob(null)
        setRecordedUrl('')
        chunksRef.current = []
        recorderRef.current = null
        if (streamRef.current) {
            for (const t of streamRef.current.getTracks()) t.stop()
            streamRef.current = null
        }
    }

    useEffect(() => () => cleanupRecording(), [])

    useEffect(() => {
        try {
            const raw = localStorage.getItem('voice.aliases')
            if (raw) setAliases(JSON.parse(raw) || {})
        } catch {
            setAliases({})
        }
    }, [])

    const upsertAlias = (voiceId: string, nextName: string) => {
        const trimmed = (nextName || '').trim()
        setAliases((prev) => {
            const next = { ...prev }
            if (!trimmed) delete next[voiceId]
            else next[voiceId] = trimmed
            try { localStorage.setItem('voice.aliases', JSON.stringify(next)) } catch { /* ignore */ }
            return next
        })
    }

    const loadModels = async () => {
        if (loadingModels) return
        setLoadingModels(true)
        try {
            const res = await window.electronAPI?.invoke('cloud-voice-list-models')
            if (res?.success && Array.isArray(res.data)) {
                setModels(res.data)
            } else {
                setModels([])
            }
        } catch {
            setModels([])
        } finally {
            setLoadingModels(false)
        }
    }

    useEffect(() => {
        void loadModels()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const startRecording = async () => {
        cleanupRecording()
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            streamRef.current = stream
            const mimeType = pickRecorderMimeType()
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
            recorderRef.current = recorder
            chunksRef.current = []

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
            }
            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
                setRecordedBlob(blob)
                const url = URL.createObjectURL(blob)
                recordedUrlRef.current = url
                setRecordedUrl(url)
            }

            recorder.start()
            setRecording(true)
            setRecordSeconds(0)
            timerRef.current = window.setInterval(() => setRecordSeconds((s) => s + 1), 1000)
        } catch (e: any) {
            message.error(e?.message || '无法访问麦克风')
            cleanupRecording()
        }
    }

    const stopRecording = async () => {
        if (!recorderRef.current) return
        try {
            recorderRef.current.stop()
        } finally {
            if (timerRef.current) {
                window.clearInterval(timerRef.current)
                timerRef.current = null
            }
            if (streamRef.current) {
                for (const t of streamRef.current.getTracks()) t.stop()
                streamRef.current = null
            }
            setRecording(false)
        }
    }

    const pollReady = async (voiceId: string) => {
        const started = Date.now()
        const timeoutMs = 5 * 60 * 1000

        while (Date.now() - started < timeoutMs) {
            const res = await window.electronAPI?.invoke('cloud-voice-get-model', voiceId)
            const model = res?.success ? (res.data as VoiceModel | null) : null

            if (model?.status === 'ready') return
            if (model?.status === 'failed') {
                throw new Error(model.error || '创建失败')
            }

            const elapsed = Date.now() - started
            const pct = Math.min(95, 10 + Math.floor(elapsed / 6000) * 5)
            setProgress(pct)
            setProgressText('正在创建音色...')

            await new Promise<void>((resolve) => window.setTimeout(resolve, 2500))
        }

        throw new Error('创建超时：请稍后在列表中刷新查看状态')
    }

    const handleCreate = async () => {
        if (!recordedBlob) {
            message.warning('请先录一段声音样本')
            return
        }
        const name = voiceName.trim()
        if (!name) {
            message.warning('请填写音色名称')
            return
        }
        if (recordSeconds < MIN_RECORD_SECONDS) {
            const remaining = Math.max(0, MIN_RECORD_SECONDS - recordSeconds)
            message.warning(
                remaining > 0
                    ? `DashScope 要求录音至少 ${MIN_RECORD_SECONDS} 秒，请继续录制 ${remaining} 秒。`
                    : `DashScope 要求录音至少 ${MIN_RECORD_SECONDS} 秒。`
            )
            return
        }

        setCreating(true)
        setCreatingVoiceId('')
        setProgress(0)
        setProgressText('准备上传...')

        try {
            const audioBufferBase64 = await blobToBase64Raw(recordedBlob)
            const ext = extFromMime(recordedBlob.type)
            const res = await window.electronAPI?.invoke('cloud-voice-train', {
                name,
                audioBufferBase64,
                fileName: `record_${Date.now()}.${ext}`,
            })
            if (!res?.success) throw new Error(res?.error || '提交失败')
            const voiceId = String(res.data?.voiceId || '').trim()
            if (!voiceId) throw new Error('未返回 voiceId')

            // 用用户输入的名字作为“显示名”（本地持久化），实现一一对应
            upsertAlias(voiceId, name)

            setCreatingVoiceId(voiceId)
            setProgress(10)
            setProgressText('已提交，等待创建...')
            await pollReady(voiceId)
            setProgress(100)
            setProgressText('创建完成')
            message.success('音色创建完成')

            setVoiceName('')
            cleanupRecording()
            await loadModels()
        } catch (e: any) {
            message.error(e?.message || '创建失败')
        } finally {
            setCreating(false)
        }
    }

    return (
        <Card size="small" title="专属 AI 声音" style={{ borderRadius: 12 }}>
            <Typography.Text type="secondary">
                声音克隆与配音由阿里云 DashScope CosyVoice 提供，无需本地/GPU部署。
            </Typography.Text>
            <Divider style={{ margin: '12px 0' }} />

            <div style={{ marginBottom: 12 }}>
                <CloudServiceStatus kind="voice" />
            </div>

            <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Alert
                    type="info"
                    showIcon
                    message="录音建议"
                    description="建议 30-90 秒，环境安静，连续说话（普通话更稳定）。"
                />

                <Card size="small" title="录制声音样本">
                    <Space direction="vertical" style={{ width: '100%' }} size="middle">
                        <Input
                            placeholder="给音色起个名字（例：商务口播）"
                            value={voiceName}
                            onChange={(e) => setVoiceName(e.target.value)}
                            disabled={creating}
                        />

                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            提示：上面输入的“音色名称”就是该录音生成的音色显示名；云端只保存一个受限前缀（最多 10 位），但本地会用你输入的名字来展示，列表里同时显示 ID 方便区分。
                        </Typography.Text>

                        <Space wrap>
                            {!recording ? (
                                <Button type="primary" icon={<AudioOutlined />} onClick={startRecording} disabled={creating}>
                                    开始录音
                                </Button>
                            ) : (
                                <Button danger onClick={stopRecording}>
                                    停止录音
                                </Button>
                            )}

                            {(recording || recordSeconds > 0) && (
                                <Tag color={recording ? 'blue' : recordSeconds >= MIN_RECORD_SECONDS ? 'green' : 'orange'}>
                                    {recording ? '录音中' : '已录制'} {String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:
                                    {String(recordSeconds % 60).padStart(2, '0')}
                                </Tag>
                            )}
                        </Space>

                        {recordedBlob && recordSeconds < MIN_RECORD_SECONDS && (
                            <Typography.Text type="danger" style={{ fontSize: 12 }}>
                                录音至少 {MIN_RECORD_SECONDS} 秒，当前仅 {recordSeconds} 秒，请继续说话保持安静环境。
                            </Typography.Text>
                        )}

                        {recordedUrl && (
                            <div>
                                <audio src={recordedUrl} controls style={{ width: '100%' }} />
                                <div style={{ marginTop: 8 }}>
                                    <Button onClick={startRecording} disabled={creating}>
                                        重录
                                    </Button>
                                </div>
                            </div>
                        )}

                        {creating && (
                            <div>
                                <Progress percent={progress} status="active" />
                                <div style={{ color: 'rgba(255,255,255,0.65)' }}>
                                    {progressText}{creatingVoiceId ? `（${creatingVoiceId}）` : ''}
                                </div>
                            </div>
                        )}

                        <Button type="primary" onClick={handleCreate} disabled={!canCreate} loading={creating} block>
                            创建音色
                        </Button>
                    </Space>
                </Card>

                <Card
                    size="small"
                    title="我的音色列表"
                    extra={<Button icon={<ReloadOutlined />} onClick={loadModels} loading={loadingModels} />}
                >
                    {models.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.55)', padding: 12 }}>
                            暂无音色
                        </div>
                    ) : (
                        <List
                            size="small"
                            dataSource={models}
                            renderItem={(m) => (
                                <List.Item>
                                    <Space wrap>
                                        <Tag color={m.status === 'ready' ? 'green' : m.status === 'failed' ? 'red' : 'blue'}>
                                            {m.status}
                                        </Tag>
                                        <Typography.Text strong>{aliases[m.id] || m.name}</Typography.Text>
                                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                            {m.id}
                                        </Typography.Text>
                                        {m.error && (
                                            <Typography.Text type="danger" style={{ fontSize: 12 }}>
                                                {m.error}
                                            </Typography.Text>
                                        )}
                                    </Space>
                                </List.Item>
                            )}
                        />
                    )}
                </Card>
            </Space>
        </Card>
    )
}
