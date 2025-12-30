import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Card, Divider, Input, List, message, Modal, Progress, Select, Space, Steps, Tag, Typography } from 'antd'
import { AudioOutlined, CloudUploadOutlined, ReloadOutlined, SoundOutlined } from '@ant-design/icons'
import CloudServiceStatus from './CloudServiceStatus'
import { auditLog } from '../services/auditLog'
import { toMediaUrl } from '../utils/mediaUrl'

type VoiceModel = {
    id: string
    name: string
    status: 'pending' | 'ready' | 'failed'
    createdAt?: string
    updatedAt?: string
    error?: string
}

const MIN_RECORD_SECONDS = 10
const MAX_RECORD_SECONDS = 20
const DEFAULT_COSYVOICE_MODEL = 'cosyvoice-v3-flash'

const PRESET_TEXTS: Array<{ group: string; text: string }> = [
    { group: '直播带货', text: '欢迎大家来到直播间，今天我们给大家带来超值好物，满300减100，优惠券发不停，拼手速哦！' },
    { group: '教育培训', text: '《母鸡萝丝去散步》是一本非常有趣的绘本故事，它讲述了一只名叫萝丝的母鸡和一只狐狸之间的故事。' },
    { group: '小说朗读', text: '满纸荒唐言，一把辛酸泪。都云作者痴，谁解其中味？' },
    { group: '影视配音', text: '这是2024年最值得观看的美剧之一，Netflix最新出品，它讲述了主人公小美意外发现能够穿越时空的技术。' },
]

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
    if (mt.includes('mp4')) return 'mp4'
    if (mt.includes('quicktime')) return 'mov'
    return 'webm'
}

function pickFile(accept: string): Promise<File | null> {
    return new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = accept
        input.style.display = 'none'
        input.addEventListener('change', () => {
            const file = input.files && input.files[0] ? input.files[0] : null
            resolve(file)
            input.remove()
        })
        document.body.appendChild(input)
        input.click()
    })
}

async function getDurationFromFile(file: File, timeoutMs: number = 8000): Promise<number | null> {
    const url = URL.createObjectURL(file)
    try {
        const duration = await new Promise<number>((resolve, reject) => {
            const el = document.createElement('video')
            el.preload = 'metadata'

            const cleanup = () => {
                el.onloadedmetadata = null
                el.onerror = null
                try {
                    el.src = ''
                } catch {
                    // ignore
                }
            }

            const timer = window.setTimeout(() => {
                cleanup()
                reject(new Error('Read duration timeout'))
            }, timeoutMs)

            el.onloadedmetadata = () => {
                window.clearTimeout(timer)
                const d = Number(el.duration)
                cleanup()
                resolve(d)
            }
            el.onerror = () => {
                window.clearTimeout(timer)
                cleanup()
                reject(new Error('Read media metadata failed'))
            }

            el.src = url
        })
        return Number.isFinite(duration) && duration > 0 ? duration : null
    } catch {
        return null
    } finally {
        URL.revokeObjectURL(url)
    }
}

export default function VoiceCloneSettings() {
    const [models, setModels] = useState<VoiceModel[]>([])
    const [loadingModels, setLoadingModels] = useState(false)
    const [aliases, setAliases] = useState<Record<string, string>>({})

    const [modelQuery, setModelQuery] = useState('')
    const [onlyV3Flash, setOnlyV3Flash] = useState(true)
    const [onlyReady, setOnlyReady] = useState(false)

    const [activeStep, setActiveStep] = useState(0)

    const [voiceName, setVoiceName] = useState('')
    const [recording, setRecording] = useState(false)
    const [recordSeconds, setRecordSeconds] = useState(0)
    const [recordModalOpen, setRecordModalOpen] = useState(false)
    const [recordPhase, setRecordPhase] = useState<'idle' | 'recording' | 'done'>('idle')
    const [recordGuideGroup, setRecordGuideGroup] = useState<string>(PRESET_TEXTS[0]?.group || '')

    const [sampleFile, setSampleFile] = useState<File | null>(null)
    const [sampleDurationSec, setSampleDurationSec] = useState<number | null>(null)
    const [samplePreviewUrl, setSamplePreviewUrl] = useState('')

    const [creating, setCreating] = useState(false)
    const [creatingVoiceId, setCreatingVoiceId] = useState<string>('')
    const [progress, setProgress] = useState<number>(0)
    const [progressText, setProgressText] = useState<string>('')

    const [previewVoiceId, setPreviewVoiceId] = useState<string>('')
    const [previewText, setPreviewText] = useState<string>(PRESET_TEXTS[0]?.text || '')
    const [previewAudioPath, setPreviewAudioPath] = useState<string>('')
    const [previewLoading, setPreviewLoading] = useState(false)

    const recorderRef = useRef<MediaRecorder | null>(null)
    const streamRef = useRef<MediaStream | null>(null)
    const chunksRef = useRef<BlobPart[]>([])
    const timerRef = useRef<number | null>(null)

    const recordGuideText = useMemo(() => {
        return PRESET_TEXTS.find((p) => p.group === recordGuideGroup)?.text || PRESET_TEXTS[0]?.text || ''
    }, [recordGuideGroup])

    const formatTime = (sec: number | null) => {
        if (sec == null) return '未知'
        const s = Math.max(0, Math.floor(sec || 0))
        return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
    }

    const clearSamplePreview = () => {
        if (samplePreviewUrl) {
            try { URL.revokeObjectURL(samplePreviewUrl) } catch { /* ignore */ }
        }
        setSamplePreviewUrl('')
    }

    const cleanupRecording = () => {
        if (timerRef.current) {
            window.clearInterval(timerRef.current)
            timerRef.current = null
        }
        setRecording(false)
        setRecordSeconds(0)
        chunksRef.current = []
        recorderRef.current = null
        if (streamRef.current) {
            for (const t of streamRef.current.getTracks()) t.stop()
            streamRef.current = null
        }
    }

    useEffect(() => {
        return () => {
            clearSamplePreview()
            cleanupRecording()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        try {
            const raw = localStorage.getItem('voice.aliases')
            if (raw) setAliases(JSON.parse(raw) || {})
        } catch {
            setAliases({})
        }
    }, [])

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

    const filteredModels = useMemo(() => {
        const q = modelQuery.trim().toLowerCase()
        const statusRank = (s: string) => (s === 'ready' ? 0 : s === 'pending' ? 1 : s === 'failed' ? 2 : 3)
        const timeValue = (m: VoiceModel) => {
            const raw = m.updatedAt || m.createdAt
            const t = raw ? Date.parse(raw) : NaN
            return Number.isFinite(t) ? t : 0
        }
        return [...models]
            .filter((m) => {
                if (onlyReady && m.status !== 'ready') return false
                if (onlyV3Flash && !String(m.id || '').startsWith('cosyvoice-v3-flash')) return false
                if (!q) return true
                const alias = (aliases[m.id] || '').toLowerCase()
                const name = String(m.name || '').toLowerCase()
                const id = String(m.id || '').toLowerCase()
                return alias.includes(q) || name.includes(q) || id.includes(q)
            })
            .sort((a, b) => {
                const tv = timeValue(b) - timeValue(a)
                if (tv !== 0) return tv
                const sr = statusRank(a.status) - statusRank(b.status)
                if (sr !== 0) return sr
                return String(a.id || '').localeCompare(String(b.id || ''))
            })
    }, [aliases, modelQuery, models, onlyReady, onlyV3Flash])

    const readyModels = useMemo(() => filteredModels.filter((m) => m.status === 'ready'), [filteredModels])

    const setSampleFromFile = async (file: File) => {
        cleanupRecording()
        clearSamplePreview()
        setSampleFile(file)
        setSampleDurationSec(null)
        const url = URL.createObjectURL(file)
        setSamplePreviewUrl(url)
        const dur = await getDurationFromFile(file)
        setSampleDurationSec(dur != null ? Math.floor(dur) : null)
        setActiveStep(1)
        setPreviewAudioPath('')
    }

    const startRecording = async () => {
        setRecordPhase('recording')
        cleanupRecording()
        clearSamplePreview()
        setSampleFile(null)
        setSampleDurationSec(null)
        setPreviewAudioPath('')
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
            recorder.onstop = async () => {
                const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
                const file = new File([blob], `record_${Date.now()}.${extFromMime(blob.type)}`, { type: blob.type })
                await setSampleFromFile(file)
                setRecordPhase('done')
            }

            recorder.start()
            setRecording(true)
            setRecordSeconds(0)
            timerRef.current = window.setInterval(() => {
                setRecordSeconds((s) => {
                    const next = s + 1
                    if (next >= MAX_RECORD_SECONDS) {
                        window.setTimeout(() => stopRecording(), 0)
                    }
                    return next
                })
            }, 1000)
        } catch (e: any) {
            message.error(e?.message || '无法访问麦克风')
            cleanupRecording()
            setRecordPhase('idle')
        }
    }

    const stopRecording = () => {
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
                throw new Error(model.error || '复刻失败')
            }

            const elapsed = Date.now() - started
            const pct = Math.min(95, 10 + Math.floor(elapsed / 6000) * 5)
            setProgress(pct)
            setProgressText('正在复刻音色…')

            await new Promise<void>((resolve) => window.setTimeout(resolve, 2500))
        }

        throw new Error('复刻超时：请稍后在列表中刷新查看状态')
    }

    const handleCreate = async () => {
        const name = voiceName.trim()
        if (!name) {
            message.warning('请给音色起个名字')
            return
        }
        if (!sampleFile) {
            message.warning('请先录音或上传一个音频/视频样本')
            return
        }

        const durationOk = sampleDurationSec == null || sampleDurationSec >= MIN_RECORD_SECONDS
        if (!durationOk) {
            message.warning(`样本至少 ${MIN_RECORD_SECONDS}s，当前仅 ${sampleDurationSec}s`)
            return
        }

        const ok = await new Promise<boolean>((resolve) => {
            Modal.confirm({
                title: '合规确认（声音复刻）',
                content: (
                    <div style={{ lineHeight: 1.7 }}>
                        <div>请确认你对该声音样本拥有必要、明确、可证明的授权与同意。</div>
                        <div>严禁用于冒充他人、诈骗、侵权、骚扰或任何违法用途。</div>
                        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                            提示：你的确认与关键操作会写入审计日志，用于合规留痕。
                        </div>
                    </div>
                ),
                okText: '我已获得授权并承诺合法使用',
                cancelText: '取消',
                onOk: () => resolve(true),
                onCancel: () => resolve(false),
            })
        })
        if (!ok) return

        await auditLog('user_legal_confirm', { action: 'voice_clone_train' })

        setCreating(true)
        setCreatingVoiceId('')
        setProgress(0)
        setProgressText('准备上传…')

        try {
            const b64 = await blobToBase64Raw(sampleFile)
            const res = await window.electronAPI?.invoke('cloud-voice-train', {
                name,
                model: DEFAULT_COSYVOICE_MODEL,
                audioBufferBase64: b64,
                fileName: sampleFile.name || `sample_${Date.now()}.${extFromMime(sampleFile.type)}`,
            })
            if (!res?.success) throw new Error(res?.error || '提交失败')

            const voiceId = String(res.data?.voiceId || '').trim()
            if (!voiceId) throw new Error('未返回 voiceId')
            setCreatingVoiceId(voiceId)
            setProgress(10)
            setProgressText('复刻任务已提交…')

            await pollReady(voiceId)
            setProgress(100)
            setProgressText('复刻完成')

            try {
                setAliases((prev) => {
                    const next = { ...prev, [voiceId]: name }
                    try {
                        localStorage.setItem('voice.aliases', JSON.stringify(next))
                    } catch {
                        // ignore
                    }
                    return next
                })
            } catch {
                // ignore
            }

            setPreviewVoiceId(voiceId)
            setActiveStep(2)
            message.success('音色已就绪（ready）')
            void loadModels()
        } catch (e: any) {
            message.error(e?.message || '复刻失败')
        } finally {
            setCreating(false)
        }
    }

    const handleGeneratePreview = async () => {
        const voiceId = (previewVoiceId || '').trim()
        const text = (previewText || '').trim()
        if (!voiceId) {
            message.warning('请先选择一个音色')
            return
        }
        if (!text) {
            message.warning('请输入要合成的文本')
            return
        }

        setPreviewLoading(true)
        try {
            const res = await window.electronAPI?.invoke('cloud-voice-tts', { voiceId, text })
            if (!res?.success) throw new Error(res?.error || '合成失败')
            const audioPath = String(res.data?.audioPath || '').trim()
            if (!audioPath) throw new Error('未返回音频路径')
            setPreviewAudioPath(audioPath)
            message.success('试听音频已生成')
        } catch (e: any) {
            message.error(e?.message || '合成失败')
        } finally {
            setPreviewLoading(false)
        }
    }

    const canProceedStep1 = !!sampleFile && !recording
    const canProceedStep2 = canProceedStep1 && !!voiceName.trim()

    useEffect(() => {
        if (activeStep === 0 && canProceedStep1) setActiveStep(1)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canProceedStep1])

    useEffect(() => {
        if (!previewVoiceId && readyModels.length > 0) {
            setPreviewVoiceId(readyModels[0].id)
        }
    }, [previewVoiceId, readyModels])

    const recordCountdown = Math.max(0, MAX_RECORD_SECONDS - recordSeconds)

    const openRecordModal = () => {
        if (creating) return
        setRecordPhase('idle')
        setRecordModalOpen(true)
    }

    const pickUploadSample = async () => {
        try {
            const file = await pickFile('audio/*,video/mp4,video/*')
            if (!file) return
            if (file.size > 50 * 1024 * 1024) {
                message.warning('文件较大，建议裁剪到 10–20 秒再上传以提高成功率')
            }
            await setSampleFromFile(file)
        } catch (e: any) {
            message.error(e?.message || '选择文件失败')
        }
    }

    return (
        <Card title="专属 AI 声音" bordered={false}>
            <Space direction="vertical" style={{ width: '100%' }} size={14}>
                <CloudServiceStatus kind="voice" />

                <Alert
                    type="info"
                    showIcon
                    message="声音复刻 + 声音合成（CosyVoice）"
                    description={
                        <div>
                            <div>默认模型版本：{DEFAULT_COSYVOICE_MODEL}（复刻与合成统一使用）</div>
                            <div>建议录音 10–20 秒，环境安静，连续说话（普通话更稳）。</div>
                        </div>
                    }
                />

                <Card size="small" title="复刻声音" style={{ borderRadius: 8 }}>
                    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        <div style={{ minWidth: 260 }}>
                            <Steps
                                direction="vertical"
                                size="small"
                                current={activeStep}
                                items={[
                                    { title: '原始音频' },
                                    { title: '选择复刻模型' },
                                    { title: '试听合成' },
                                ]}
                            />
                        </div>

                        <div style={{ flex: 1, minWidth: 360 }}>
                            {activeStep === 0 && (
                                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                                    <Typography.Text strong>声音样本</Typography.Text>

                                    <Input
                                        placeholder="给音色起个名字（例：商务口播）"
                                        value={voiceName}
                                        onChange={(e) => setVoiceName(e.target.value)}
                                        disabled={creating}
                                        style={{ maxWidth: 520 }}
                                    />
                                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                        提示：上面输入的“音色名称”将作为该音色的显示名；音色 ID 由云端生成，可在列表中复制使用。
                                    </Typography.Text>

                                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                        <Card
                                            hoverable
                                            style={{ flex: 1, minWidth: 320, borderRadius: 12, textAlign: 'center', padding: 12 }}
                                            onClick={() => {
                                                if (sampleFile) {
                                                    Modal.confirm({
                                                        title: '确定要重新录音吗？',
                                                        content: '您已选择了样本，继续录音将覆盖当前内容。',
                                                        okText: '确定',
                                                        cancelText: '取消',
                                                        onOk: openRecordModal,
                                                    })
                                                    return
                                                }
                                                openRecordModal()
                                            }}
                                        >
                                            <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                                <div
                                                    style={{
                                                        width: 72,
                                                        height: 72,
                                                        borderRadius: 999,
                                                        background: 'rgba(105, 174, 255, 0.12)',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        margin: '0 auto',
                                                    }}
                                                >
                                                    <AudioOutlined style={{ fontSize: 34, color: 'rgba(105, 174, 255, 0.95)' }} />
                                                </div>
                                                <Typography.Text strong style={{ fontSize: 16 }}>
                                                    开始实时录音
                                                </Typography.Text>
                                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                                    录音时长 {MAX_RECORD_SECONDS}s 以内，请在弹出的浏览器提示中点击“允许”。
                                                </Typography.Text>
                                                <Button
                                                    type="primary"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        if (sampleFile) {
                                                            Modal.confirm({
                                                                title: '确定要重新录音吗？',
                                                                content: '您已选择了样本，继续录音将覆盖当前内容。',
                                                                okText: '确定',
                                                                cancelText: '取消',
                                                                onOk: openRecordModal,
                                                            })
                                                            return
                                                        }
                                                        openRecordModal()
                                                    }}
                                                >
                                                    开始录音
                                                </Button>
                                            </Space>
                                        </Card>

                                        <Card
                                            hoverable
                                            style={{ flex: 1, minWidth: 320, borderRadius: 12, textAlign: 'center', padding: 12 }}
                                            onClick={() => {
                                                if (sampleFile) {
                                                    Modal.confirm({
                                                        title: '确定要上传吗？',
                                                        content: '您已完成录音/选择样本，若继续上传音频，将覆盖并删除您当前已录制/已选择的内容。请确定是否上传。',
                                                        okText: '确定',
                                                        cancelText: '取消',
                                                        onOk: pickUploadSample,
                                                    })
                                                    return
                                                }
                                                void pickUploadSample()
                                            }}
                                        >
                                            <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                                <div
                                                    style={{
                                                        width: 72,
                                                        height: 72,
                                                        borderRadius: 999,
                                                        background: 'rgba(167, 122, 255, 0.12)',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        margin: '0 auto',
                                                    }}
                                                >
                                                    <CloudUploadOutlined style={{ fontSize: 34, color: 'rgba(167, 122, 255, 0.95)' }} />
                                                </div>
                                                <Typography.Text strong style={{ fontSize: 16 }}>
                                                    上传音频文件
                                                </Typography.Text>
                                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                                    支持 `wav/mp3/m4a`，单/双声道，16kHz 及以上采样率；也支持 `mp4` 自动提取音频。
                                                </Typography.Text>
                                                <Button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        if (sampleFile) {
                                                            Modal.confirm({
                                                                title: '确定要上传吗？',
                                                                content:
                                                                    '您已完成录音/选择样本，若继续上传音频，将覆盖并删除您当前已录制/已选择的内容。请确定是否上传。',
                                                                okText: '确定',
                                                                cancelText: '取消',
                                                                onOk: pickUploadSample,
                                                            })
                                                            return
                                                        }
                                                        void pickUploadSample()
                                                    }}
                                                >
                                                    上传音频文件
                                                </Button>
                                            </Space>
                                        </Card>
                                    </div>

                                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                        说明：录音 / 文件上传用途相同，任选其一作为“声音样本”，系统会自动提取音色。
                                    </Typography.Text>
                                </Space>
                            )}

                            {activeStep >= 1 && (
                                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                                        <Card size="small" style={{ flex: 1, minWidth: 320 }}>
                                            <Space direction="vertical" style={{ width: '100%' }} size={8}>
                                                <Typography.Text strong>样本预览</Typography.Text>
                                                {sampleFile ? (
                                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>
                                                        <div>文件：{sampleFile.name}</div>
                                                        <div>
                                                            时长：{formatTime(sampleDurationSec)}{' '}
                                                            {sampleDurationSec == null ? (
                                                                <Tag color="blue">待检测</Tag>
                                                            ) : (
                                                                <Tag color={sampleDurationSec >= MIN_RECORD_SECONDS ? 'green' : 'orange'}>
                                                                    {sampleDurationSec >= MIN_RECORD_SECONDS ? '可用' : `不足 ${MIN_RECORD_SECONDS}s`}
                                                                </Tag>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <Typography.Text type="secondary">尚未选择样本</Typography.Text>
                                                )}

                                                {samplePreviewUrl && sampleFile && (
                                                    <div>
                                                        {String(sampleFile.type || '').startsWith('video/') ? (
                                                            <video src={samplePreviewUrl} controls style={{ width: '100%', maxHeight: 220 }} />
                                                        ) : (
                                                            <audio src={samplePreviewUrl} controls style={{ width: '100%' }} />
                                                        )}
                                                    </div>
                                                )}

                                                <Space wrap>
                                                    <Button onClick={() => setActiveStep(0)} disabled={creating || recording}>
                                                        重新选择
                                                    </Button>
                                                    <Button
                                                        onClick={() => {
                                                            cleanupRecording()
                                                            clearSamplePreview()
                                                            setSampleFile(null)
                                                            setSampleDurationSec(null)
                                                            setActiveStep(0)
                                                        }}
                                                        disabled={creating || recording}
                                                    >
                                                        清空
                                                    </Button>
                                                </Space>
                                            </Space>
                                        </Card>

                                        <Card size="small" style={{ flex: 1, minWidth: 320 }}>
                                            <Space direction="vertical" style={{ width: '100%' }} size={10}>
                                                <Typography.Text strong>选择复刻模型</Typography.Text>

                                                <Space wrap>
                                                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                                        模型版本
                                                    </Typography.Text>
                                                    <Select
                                                        value={DEFAULT_COSYVOICE_MODEL}
                                                        style={{ minWidth: 220 }}
                                                        disabled
                                                        options={[{ value: DEFAULT_COSYVOICE_MODEL, label: DEFAULT_COSYVOICE_MODEL }]}
                                                    />
                                                </Space>

                                                <Input
                                                    placeholder="音色名称（例：商务口播）"
                                                    value={voiceName}
                                                    onChange={(e) => setVoiceName(e.target.value)}
                                                    disabled={creating}
                                                />

                                                {creating && (
                                                    <div>
                                                        <Progress percent={progress} status="active" />
                                                        <div style={{ color: 'rgba(255,255,255,0.65)' }}>
                                                            {progressText}{creatingVoiceId ? `（${creatingVoiceId}）` : ''}
                                                        </div>
                                                    </div>
                                                )}

                                                <Button type="primary" onClick={handleCreate} disabled={!canProceedStep2 || creating} loading={creating} block>
                                                    开始复刻
                                                </Button>
                                            </Space>
                                        </Card>
                                    </div>
                                </Space>
                            )}

                            {activeStep >= 2 && (
                                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                                    <Card size="small" title="试听合成" extra={<Tag color="blue">模型：{DEFAULT_COSYVOICE_MODEL}</Tag>}>
                                        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                            <div style={{ flex: 1, minWidth: 420 }}>
                                                <Space direction="vertical" style={{ width: '100%' }} size={10}>
                                                    <Space wrap>
                                                        <Typography.Text>选择音色</Typography.Text>
                                                        <Select
                                                            value={previewVoiceId}
                                                            onChange={setPreviewVoiceId}
                                                            style={{ minWidth: 260 }}
                                                            options={readyModels.map((m) => ({
                                                                value: m.id,
                                                                label: aliases[m.id] || m.name || m.id,
                                                            }))}
                                                            showSearch
                                                            optionFilterProp="label"
                                                        />
                                                        <Button icon={<ReloadOutlined />} onClick={loadModels} loading={loadingModels}>
                                                            刷新
                                                        </Button>
                                                        <Button
                                                            icon={<SoundOutlined />}
                                                            type="primary"
                                                            onClick={handleGeneratePreview}
                                                            loading={previewLoading}
                                                            disabled={!previewVoiceId || !previewText.trim()}
                                                        >
                                                            生成试听
                                                        </Button>
                                                    </Space>

                                                    <Input.TextArea
                                                        value={previewText}
                                                        onChange={(e) => setPreviewText(e.target.value)}
                                                        rows={5}
                                                        placeholder="输入文本，转换成逼真的语音"
                                                        maxLength={1000}
                                                        showCount
                                                    />

                                                    {previewAudioPath && (
                                                        <div>
                                                            <audio src={toMediaUrl(previewAudioPath)} controls style={{ width: '100%' }} />
                                                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                                                文件：{previewAudioPath}
                                                            </Typography.Text>
                                                        </div>
                                                    )}
                                                </Space>
                                            </div>

                                            <div style={{ width: 360, minWidth: 320 }}>
                                                <Card size="small" title="内容参考">
                                                    <Space wrap>
                                                        {PRESET_TEXTS.map((p) => {
                                                            const active = PRESET_TEXTS.find((x) => x.text === previewText)?.group === p.group
                                                            return (
                                                                <Button key={p.group} size="small" type={active ? 'primary' : 'default'} onClick={() => setPreviewText(p.text)}>
                                                                    {p.group}
                                                                </Button>
                                                            )
                                                        })}
                                                    </Space>
                                                    <Divider style={{ margin: '10px 0' }} />
                                                    <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                                                        {PRESET_TEXTS.find((x) => x.text === previewText)?.text || PRESET_TEXTS[0]?.text}
                                                    </Typography.Paragraph>
                                                </Card>
                                            </div>
                                        </div>
                                    </Card>
                                </Space>
                            )}
                        </div>
                    </div>
                </Card>

                <Modal
                    open={recordModalOpen}
                    footer={null}
                    centered
                    width={940}
                    maskClosable={!recording}
                    closable={!recording}
                    onCancel={() => {
                        if (recording) return
                        setRecordModalOpen(false)
                        if (recordPhase === 'done') setActiveStep(1)
                    }}
                >
                    <div style={{ display: 'flex', minHeight: 420 }}>
                        <div
                            style={{
                                flex: 1,
                                padding: 24,
                                borderRight: '1px solid rgba(0,0,0,0.06)',
                                background: 'rgba(245, 247, 255, 0.55)',
                            }}
                        >
                            <Space direction="vertical" align="center" style={{ width: '100%' }} size={14}>
                                <div
                                    style={{
                                        width: 92,
                                        height: 92,
                                        borderRadius: 999,
                                        background: recordPhase === 'recording' ? 'rgba(105, 174, 255, 0.22)' : 'rgba(0,0,0,0.06)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
                                    }}
                                >
                                    <AudioOutlined style={{ fontSize: 42, color: recordPhase === 'recording' ? '#1677ff' : 'rgba(0,0,0,0.55)' }} />
                                </div>

                                {recordPhase === 'idle' && (
                                    <>
                                        <Typography.Text strong style={{ fontSize: 18 }}>
                                            麦克风未开启
                                        </Typography.Text>
                                        <Typography.Text type="secondary" style={{ textAlign: 'center', maxWidth: 340 }}>
                                            请在弹出的浏览器提示中点击“允许”，以继续体验实时录音功能。
                                        </Typography.Text>
                                        <Typography.Text type="secondary" style={{ fontSize: 12, textAlign: 'center', maxWidth: 360 }}>
                                            录音时长 {MAX_RECORD_SECONDS}s，录音时尽量模拟真实应用场景说话风格、语速、语调，避免读稿或噪音干扰。
                                        </Typography.Text>
                                        <Button type="primary" onClick={() => void startRecording()} disabled={creating}>
                                            开始录音
                                        </Button>
                                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                            <span style={{ color: 'rgba(0,0,0,0.35)' }}>●</span> 麦克风未启用
                                        </Typography.Text>
                                    </>
                                )}

                                {recordPhase === 'recording' && (
                                    <>
                                        <Typography.Text strong style={{ fontSize: 18 }}>
                                            录音中，剩余 {recordCountdown} 秒
                                        </Typography.Text>
                                        <div style={{ width: 360 }}>
                                            <Progress percent={Math.min(100, Math.round((recordSeconds / MAX_RECORD_SECONDS) * 100))} status="active" />
                                        </div>
                                        <Space>
                                            <Button danger onClick={stopRecording}>
                                                停止录音
                                            </Button>
                                        </Space>
                                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                            <span style={{ color: '#52c41a' }}>●</span> 麦克风已启用
                                        </Typography.Text>
                                    </>
                                )}

                                {recordPhase === 'done' && (
                                    <>
                                        <Typography.Text strong style={{ fontSize: 18 }}>
                                            录音完成，可以开始复刻
                                        </Typography.Text>
                                        <div style={{ width: '100%', maxWidth: 420 }}>
                                            {samplePreviewUrl ? (
                                                <audio src={samplePreviewUrl} controls style={{ width: '100%' }} />
                                            ) : (
                                                <Typography.Text type="secondary">未找到录音文件</Typography.Text>
                                            )}
                                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                                {sampleFile?.name || ''} {sampleDurationSec != null ? `（${formatTime(sampleDurationSec)}）` : ''}
                                            </Typography.Text>
                                        </div>
                                        <Space>
                                            <Button icon={<ReloadOutlined />} onClick={() => void startRecording()} disabled={creating}>
                                                重新录音
                                            </Button>
                                            <Button
                                                type="primary"
                                                onClick={() => {
                                                    setRecordModalOpen(false)
                                                    setActiveStep(1)
                                                }}
                                            >
                                                关闭
                                            </Button>
                                        </Space>
                                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                            <span style={{ color: '#52c41a' }}>●</span> 麦克风已启用
                                        </Typography.Text>
                                    </>
                                )}
                            </Space>
                        </div>

                        <div style={{ width: 420, padding: 24 }}>
                            <Typography.Text strong style={{ fontSize: 16 }}>
                                内容参考
                            </Typography.Text>
                            <div style={{ marginTop: 10 }}>
                                <Space wrap>
                                    {PRESET_TEXTS.map((p) => (
                                        <Button
                                            key={p.group}
                                            size="small"
                                            type={recordGuideGroup === p.group ? 'primary' : 'default'}
                                            onClick={() => setRecordGuideGroup(p.group)}
                                        >
                                            {p.group}
                                        </Button>
                                    ))}
                                </Space>
                            </div>
                            <Card size="small" style={{ marginTop: 12 }}>
                                <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
                                    {recordGuideText}
                                </Typography.Paragraph>
                            </Card>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                建议朗读上面的内容参考，保证语速自然、发音清晰，有助于提高复刻效果。
                            </Typography.Text>
                        </div>
                    </div>
                </Modal>

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
                        <Space direction="vertical" style={{ width: '100%' }} size={10}>
                            <Space wrap style={{ width: '100%' }}>
                                <Input
                                    allowClear
                                    value={modelQuery}
                                    onChange={(e) => setModelQuery(e.target.value)}
                                    placeholder="搜索音色名 / ID"
                                    style={{ width: 260 }}
                                />
                                <Button size="small" type={onlyV3Flash ? 'primary' : 'default'} onClick={() => setOnlyV3Flash((v) => !v)}>
                                    只看 v3-flash
                                </Button>
                                <Button size="small" type={onlyReady ? 'primary' : 'default'} onClick={() => setOnlyReady((v) => !v)}>
                                    只看 ready
                                </Button>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                    {filteredModels.length}/{models.length}
                                </Typography.Text>
                            </Space>

                            <List
                                size="small"
                                dataSource={filteredModels}
                                pagination={{ pageSize: 10, size: 'small', showSizeChanger: true, pageSizeOptions: ['10', '20', '50'] }}
                                renderItem={(m) => {
                                    const displayName = aliases[m.id] || m.name
                                    return (
                                        <List.Item>
                                            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                                <Space size={8}>
                                                    <Tag color={m.status === 'ready' ? 'green' : m.status === 'failed' ? 'red' : 'blue'}>
                                                        {m.status}
                                                    </Tag>
                                                    <Typography.Text strong ellipsis={{ tooltip: displayName }} style={{ maxWidth: 220 }}>
                                                        {displayName}
                                                    </Typography.Text>
                                                    {m.error && (
                                                        <Typography.Text type="danger" style={{ fontSize: 12 }} ellipsis={{ tooltip: m.error }}>
                                                            {m.error}
                                                        </Typography.Text>
                                                    )}
                                                </Space>

                                                <Typography.Text
                                                    type="secondary"
                                                    style={{ fontSize: 12, maxWidth: 520 }}
                                                    ellipsis={{ tooltip: m.id }}
                                                    copyable={{ text: m.id }}
                                                >
                                                    {m.id}
                                                </Typography.Text>
                                            </Space>
                                        </List.Item>
                                    )
                                }}
                            />
                        </Space>
                    )}
                </Card>

                {/* 全自动默认音色设置 */}
                <Card size="small" title="🚀 全自动模式默认音色" style={{ borderRadius: 8 }}>
                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                        <Typography.Text type="secondary">
                            设置全自动视频生成时使用的默认声音克隆音色。只有状态为 "ready" 的音色才可选择。
                        </Typography.Text>
                        <Space wrap>
                            <Typography.Text>默认音色：</Typography.Text>
                            <Select
                                value={(() => {
                                    try {
                                        return localStorage.getItem('audio.cloudVoiceId') || undefined
                                    } catch {
                                        return undefined
                                    }
                                })()}
                                onChange={(value) => {
                                    try {
                                        if (value) {
                                            localStorage.setItem('audio.cloudVoiceId', value)
                                            message.success('已设置为全自动默认音色')
                                        }
                                    } catch {
                                        message.error('保存失败')
                                    }
                                }}
                                style={{ minWidth: 320 }}
                                placeholder="选择默认音色"
                                allowClear
                                showSearch
                                optionFilterProp="label"
                                options={readyModels.map((m) => ({
                                    value: m.id,
                                    label: `${aliases[m.id] || m.name || m.id} (${m.id.slice(-8)})`,
                                }))}
                            />
                            <Button icon={<ReloadOutlined />} onClick={loadModels} loading={loadingModels}>
                                刷新
                            </Button>
                        </Space>
                        {readyModels.length === 0 && (
                            <Alert type="warning" showIcon message="没有可用的音色，请先完成声音克隆" />
                        )}
                    </Space>
                </Card>

                <Divider style={{ margin: '6px 0' }} />

                <Alert
                    type="warning"
                    showIcon
                    message="提示"
                    description="如果你切换了 ALIYUN_COSYVOICE_MODEL，已创建的历史音色仍保留原来的 voice_id 前缀；新建音色会使用新模型。"
                />
            </Space>
        </Card>
    )
}
