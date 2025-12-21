import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Divider, Input, List, message, Progress, Space, Tag, Typography, Upload } from 'antd'
import { ReloadOutlined, UploadOutlined } from '@ant-design/icons'

type CloudVoiceModel = {
    id: string
    name: string
    status: 'pending' | 'training' | 'ready' | 'failed'
    createdAt?: string
    updatedAt?: string
    error?: string
}

function fileToBase64Raw(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            const result = reader.result
            if (typeof result !== 'string') {
                reject(new Error('读取文件失败'))
                return
            }
            const comma = result.indexOf(',')
            resolve(comma >= 0 ? result.slice(comma + 1) : result)
        }
        reader.onerror = () => reject(reader.error || new Error('读取文件失败'))
        reader.readAsDataURL(file)
    })
}

export default function VoiceCloneSettings() {
    const [online, setOnline] = useState<boolean | null>(null)
    const [onlineMsg, setOnlineMsg] = useState<string>('')
    const [models, setModels] = useState<CloudVoiceModel[]>([])
    const [trainingName, setTrainingName] = useState('')
    const [trainingFile, setTrainingFile] = useState<File | null>(null)
    const [training, setTraining] = useState(false)
    const [trainingVoiceId, setTrainingVoiceId] = useState<string>('')
    const [progress, setProgress] = useState<number>(0)
    const [progressText, setProgressText] = useState<string>('')

    const readyCount = useMemo(() => models.filter(m => m.status === 'ready').length, [models])

    const refreshStatus = async () => {
        try {
            const res = await window.electronAPI?.invoke('cloud-voice-check-status')
            if (res?.success && res.data) {
                setOnline(!!res.data.online)
                setOnlineMsg(res.data.message || '')
            } else {
                setOnline(false)
                setOnlineMsg(res?.error || '')
            }
        } catch {
            setOnline(false)
            setOnlineMsg('')
        }
    }

    const refreshModels = async () => {
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
        refreshStatus()
        refreshModels()
    }, [])

    const handleUpload = (file: File) => {
        setTrainingFile(file)
        return false
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
        if (!trainingFile) {
            message.warning('请先上传一段声音样本')
            return
        }
        const name = trainingName.trim()
        if (!name) {
            message.warning('请填写声音名称')
            return
        }

        setTraining(true)
        setTrainingVoiceId('')
        setProgress(0)
        setProgressText('准备上传...')

        try {
            const audioBufferBase64 = await fileToBase64Raw(trainingFile)
            const res = await window.electronAPI?.invoke('cloud-voice-train', {
                name,
                audioBufferBase64,
                fileName: trainingFile.name,
            })
            if (!res?.success) throw new Error(res?.error || '提交训练失败')
            const voiceId = res.data?.voiceId
            if (!voiceId) throw new Error('未返回 voiceId')

            setTrainingVoiceId(voiceId)
            await pollTraining(voiceId)
            message.success('声音克隆训练完成')
            setTrainingName('')
            setTrainingFile(null)
            await refreshModels()
        } catch (e: any) {
            message.error(e.message)
        } finally {
            setTraining(false)
        }
    }

    return (
        <Card size="small" title="声音克隆（云端 CosyVoice）" style={{ borderRadius: 12 }}>
            <Typography.Text type="secondary">
                当前不做登录：系统会为每台设备生成一个本地设备ID，用它来隔离你的云端声音模型。
            </Typography.Text>
            <Divider style={{ margin: '12px 0' }} />

            {online === false && (
                <Alert
                    type="warning"
                    showIcon
                    message="云端声音服务未连接"
                    description={`请配置 CLOUD_VOICE_SERVER_URL / CLOUD_VOICE_PORT 并确保服务可访问。${onlineMsg ? `（${onlineMsg}）` : ''}`}
                    style={{ marginBottom: 12 }}
                />
            )}
            {online === true && (
                <Alert
                    type="success"
                    showIcon
                    message="云端声音服务已连接"
                    description={onlineMsg || `已就绪（可用模型：${readyCount}）`}
                    style={{ marginBottom: 12 }}
                />
            )}

            <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Card size="small" title="训练我的声音">
                    <Space direction="vertical" style={{ width: '100%' }}>
                        <Input
                            placeholder="给声音起个名字（例如：张三-口播）"
                            value={trainingName}
                            onChange={(e) => setTrainingName(e.target.value)}
                        />
                        <Upload
                            accept="audio/*"
                            beforeUpload={handleUpload}
                            showUploadList={false}
                            disabled={training || online !== true}
                        >
                            <Button icon={<UploadOutlined />} block disabled={training || online !== true}>
                                {trainingFile ? trainingFile.name : '上传声音样本（建议 30-90 秒，清晰无噪）'}
                            </Button>
                        </Upload>
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
                            disabled={online !== true || !trainingFile || !trainingName.trim()}
                            block
                        >
                            开始训练
                        </Button>
                    </Space>
                </Card>

                <Card
                    size="small"
                    title="我的声音列表"
                    extra={<Button icon={<ReloadOutlined />} onClick={() => { refreshStatus(); refreshModels() }} />}
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
