import { useEffect, useRef, useState } from 'react'
import { Alert, Button, Card, Divider, Input, List, message, Progress, Space, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { isServiceSwitchingError, startServiceSwitchingHint } from '../utils/serviceSwitchingHint'
import GpuServiceStatus from './GpuServiceStatus'
import { useGpuScheduler } from '../contexts/GpuSchedulerContext'
import { useAppStore } from '../store/appStore'

type CloudVoiceModel = {
    id: string
    name: string
    status: 'pending' | 'training' | 'ready' | 'failed'
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

export default function VoiceCloneSettings() {
    const digitalHumanGenerating = useAppStore((s) => s.digitalHumanGenerating)
    const [models, setModels] = useState<CloudVoiceModel[]>([])
    const [trainingName, setTrainingName] = useState('')
    const [recording, setRecording] = useState(false)
    const [recordSeconds, setRecordSeconds] = useState(0)
    const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null)
    const [recordedUrl, setRecordedUrl] = useState<string>('')
    const [training, setTraining] = useState(false)
    const [trainingVoiceId, setTrainingVoiceId] = useState<string>('')
    const [progress, setProgress] = useState<number>(0)
    const [progressText, setProgressText] = useState<string>('')

    const recorderRef = useRef<MediaRecorder | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const chunksRef = useRef<BlobPart[]>([])
    const timerRef = useRef<number | null>(null)
    const recordedUrlRef = useRef<string>('')
    const pendingRefreshModelsRef = useRef(false)

    const { status: schedulerStatus, isRunning: isServiceRunning, preswitch } = useGpuScheduler()
    const schedulerOnline = !!schedulerStatus?.online
    const cosyvoiceReady = schedulerOnline
        && !schedulerStatus?.switching
        && isServiceRunning('cosyvoice')
        && !!schedulerStatus?.servicesHealth?.cosyvoice

    const refreshModels = async () => {
        if (digitalHumanGenerating) return
        if (!cosyvoiceReady) {
            setModels([])
            return
        }
        try {
            const res = await window.electronAPI?.invoke('cloud-voice-list-models')
            if (res?.success && Array.isArray(res.data)) {
                setModels(res.data)
            } else {
                setModels([])
            }
        } catch {
            setModels([])
        }
    }

    useEffect(() => {
        if (!cosyvoiceReady) return
        refreshModels()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cosyvoiceReady])

    useEffect(() => {
        if (!pendingRefreshModelsRef.current) return
        if (!cosyvoiceReady) return
        pendingRefreshModelsRef.current = false
        refreshModels()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cosyvoiceReady])

    const connectCosyvoice = async () => {
        if (digitalHumanGenerating) {
            message.warning('正在生成数字人视频，为避免云端切换导致失败，请等待完成后再切换服务')
            return
        }
        if (!schedulerOnline) {
            message.warning('调度器未连接，请先到「服务器设置」检查地址/网络')
            return
        }
        pendingRefreshModelsRef.current = true
        const res = await preswitch('cosyvoice')
        if (res && res.success === false) {
            pendingRefreshModelsRef.current = false
            message.warning(res.message || '切换声音克隆服务失败')
            return
        }
        message.info('正在切换到声音克隆服务，请稍候...')
    }

    useEffect(() => {
        return () => {
            if (timerRef.current) window.clearInterval(timerRef.current)
            timerRef.current = null
            try {
                recorderRef.current?.stop()
            } catch {
                // ignore
            }
            recorderRef.current = null
            streamRef.current?.getTracks()?.forEach(t => t.stop())
            streamRef.current = null
            if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current)
            recordedUrlRef.current = ''
        }
    }, [])

    const resetRecording = () => {
        setRecording(false)
        setRecordSeconds(0)
        setRecordedBlob(null)
        if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current)
        recordedUrlRef.current = ''
        setRecordedUrl('')
    }

    const startRecording = async () => {
        try {
            if (recording) return
            if (!navigator.mediaDevices?.getUserMedia) {
                message.error('当前环境不支持麦克风录音')
                return
            }

            resetRecording()
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            streamRef.current = stream
            chunksRef.current = []

            const mimeType = pickRecorderMimeType()
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
            recorderRef.current = recorder

            recorder.ondataavailable = (ev) => {
                if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data)
            }

            recorder.onstop = () => {
                const blobType = recorder.mimeType || mimeType || 'audio/webm'
                const blob = new Blob(chunksRef.current, { type: blobType })
                setRecordedBlob(blob)
                const url = URL.createObjectURL(blob)
                if (recordedUrlRef.current) URL.revokeObjectURL(recordedUrlRef.current)
                recordedUrlRef.current = url
                setRecordedUrl(url)

                streamRef.current?.getTracks()?.forEach(t => t.stop())
                streamRef.current = null
                recorderRef.current = null
                chunksRef.current = []
            }

            recorder.start()
            setRecording(true)
            setRecordSeconds(0)
            if (timerRef.current) window.clearInterval(timerRef.current)
            timerRef.current = window.setInterval(() => setRecordSeconds(s => s + 1), 1000)
        } catch (e: any) {
            message.error(e?.message || '启动录音失败')
            streamRef.current?.getTracks()?.forEach(t => t.stop())
            streamRef.current = null
            recorderRef.current = null
            chunksRef.current = []
        }
    }

    const stopRecording = () => {
        if (!recording) return
        try {
            recorderRef.current?.stop()
        } catch {
            // ignore
        } finally {
            setRecording(false)
            if (timerRef.current) window.clearInterval(timerRef.current)
            timerRef.current = null
        }
    }

    const pollTraining = async (voiceId: string) => {
        const started = Date.now()
        const timeoutMs = 10 * 60 * 1000
        setProgress(10)
        setProgressText('训练中...')

        while (Date.now() - started < timeoutMs) {
            await new Promise(r => setTimeout(r, 4000))
            const res = await window.electronAPI?.invoke('cloud-voice-get-model', voiceId)
            if (res?.success && res.data) {
                const m = res.data as CloudVoiceModel
                if (m.status === 'ready') {
                    setProgress(100)
                    setProgressText('训练完成')
                    return true
                }
                if (m.status === 'failed') {
                    throw new Error(m.error || '训练失败')
                }
                const elapsed = Date.now() - started
                const pct = Math.min(95, 10 + Math.floor(elapsed / 8000) * 5)
                setProgress(pct)
            }
        }
        throw new Error('训练超时，请稍后在列表中刷新查看状态')
    }

    const handleTrain = async () => {
        if (digitalHumanGenerating) {
            message.warning('正在生成数字人视频，为避免云端切换导致失败，请等待完成后再训练音色')
            return
        }
        if (!recordedBlob) {
            message.warning('请先录一段声音样本')
            return
        }
        const name = trainingName.trim()
        if (!name) {
            message.warning('请填写音色名称')
            return
        }

        setTraining(true)
        setTrainingVoiceId('')
        setProgress(0)
        setProgressText('准备上传...')
        const stopHint = startServiceSwitchingHint('提交训练')

        try {
            const audioBufferBase64 = await blobToBase64Raw(recordedBlob)
            const ext = extFromMime(recordedBlob.type)
            const res = await window.electronAPI?.invoke('cloud-voice-train', {
                name,
                audioBufferBase64,
                fileName: `record_${Date.now()}.${ext}`,
            })
            if (!res?.success) throw new Error(res?.error || '提交训练失败')
            const voiceId = res.data?.voiceId
            if (!voiceId) throw new Error('未返回 voiceId')

            setTrainingVoiceId(voiceId)
            await pollTraining(voiceId)
            message.success('声音克隆训练完成')
            setTrainingName('')
            resetRecording()
            await refreshModels()
        } catch (e: any) {
            if (isServiceSwitchingError(e)) {
                message.info('云端服务正在切换中（单卡省显存模式），请稍等 30–120 秒后再试。')
            } else {
                message.error(e.message)
            }
        } finally {
            stopHint()
            setTraining(false)
        }
    }

    return (
        <Card size="small" title="🎙️ 专属AI声音" style={{ borderRadius: 12 }}>
            <Typography.Text type="secondary">
                打造独一无二的AI配音师，秒级克隆您的声音，无限次使用 ⚡
            </Typography.Text>
            <Divider style={{ margin: '12px 0' }} />

            {/* 统一的 GPU 服务状态显示 */}
            <div style={{ marginBottom: 12 }}>
                <GpuServiceStatus requiredService="cosyvoice" showDetails />
            </div>

            {digitalHumanGenerating && (
                <Alert
                    type="warning"
                    showIcon
                    message="正在生成数字人视频"
                    description="为避免云端服务在「声音克隆/数字人」之间来回切换导致失败，声音克隆已临时禁用。请等待出片完成后再操作。"
                    style={{ marginBottom: 12 }}
                />
            )}

            {!cosyvoiceReady && schedulerOnline && !schedulerStatus?.switching && (
                <div style={{ marginBottom: 12 }}>
                    <Button type="primary" onClick={connectCosyvoice} disabled={digitalHumanGenerating} block>
                        切换到声音克隆服务
                    </Button>
                </div>
            )}

            <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Alert
                    type="info"
                    showIcon
                    message="为什么有时会等待？"
                    description="如果你用的是单卡 8GB（调度器 9999），系统会在「声音克隆」和「数字人视频」之间自动切换云端服务，同一时间只运行一个以避免显存不足；首次切换通常需要 30–120 秒。"
                />
                <Card size="small" title="🚀 秒级克隆">
                    <Space direction="vertical" style={{ width: '100%' }}>
                        <Input
                            placeholder="给声音起个名字（例如：商务口播）"
                            value={trainingName}
                            onChange={(e) => setTrainingName(e.target.value)}
                            disabled={digitalHumanGenerating}
                        />
                        <Space direction="vertical" style={{ width: '100%' }} size="middle">
                            <Space wrap>
                                {!recording ? (
                                    <Button type="primary" onClick={startRecording} disabled={digitalHumanGenerating || training || !cosyvoiceReady}>
                                        开始录音
                                    </Button>
                                ) : (
                                    <Button danger onClick={stopRecording} disabled={digitalHumanGenerating || training || !cosyvoiceReady}>
                                        停止录音
                                    </Button>
                                )}
                                <Typography.Text type="secondary">
                                    建议 30-90 秒，环境安静，连续说话
                                </Typography.Text>
                                {(recording || recordSeconds > 0) && (
                                    <Tag color={recording ? 'blue' : 'default'}>
                                        {recording ? '录音中' : '已录制'} {String(Math.floor(recordSeconds / 60)).padStart(2, '0')}:
                                        {String(recordSeconds % 60).padStart(2, '0')}
                                    </Tag>
                                )}
                            </Space>
                            {recordedUrl && (
                                <div>
                                    <audio src={recordedUrl} controls style={{ width: '100%' }} />
                                    <div style={{ marginTop: 8 }}>
                                        <Button onClick={startRecording} disabled={digitalHumanGenerating || training || !cosyvoiceReady}>
                                            重录
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </Space>
                        {training && (
                            <div>
                                <Progress percent={progress} status="active" />
                                <div style={{ color: '#666' }}>
                                    {progressText} {trainingVoiceId ? `（${trainingVoiceId}）` : ''}
                                </div>
                            </div>
                        )}
                        <Button
                            type="primary"
                            loading={training}
                            onClick={handleTrain}
                            disabled={digitalHumanGenerating || !cosyvoiceReady || recording || !recordedBlob || !trainingName.trim()}
                            block
                        >
                            开始克隆
                        </Button>
                    </Space>
                </Card>

                <Card
                    size="small"
                    title="🎤 我的专属声音"
                    extra={<Button icon={<ReloadOutlined />} disabled={digitalHumanGenerating} onClick={() => (cosyvoiceReady ? refreshModels() : connectCosyvoice())} />}
                >
                    {models.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#999', padding: 12 }}>
                            暂无模型
                        </div>
                    ) : (
                        <List
                            size="small"
                            dataSource={models}
                            renderItem={(m) => (
                                <List.Item>
                                    <Space>
                                        <Tag color={m.status === 'ready' ? 'green' : m.status === 'failed' ? 'red' : 'blue'}>
                                            {m.status}
                                        </Tag>
                                        <span style={{ fontWeight: 600 }}>{m.name}</span>
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
