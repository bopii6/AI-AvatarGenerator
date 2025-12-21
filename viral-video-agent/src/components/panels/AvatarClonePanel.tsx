import { Button, Upload, Input, Space, Progress, Alert, List, Card } from 'antd'
import { UserOutlined, UploadOutlined, VideoCameraOutlined, DeleteOutlined } from '@ant-design/icons'
import { useState, useEffect } from 'react'

interface AvatarModel {
    id: string
    name: string
    videoPath: string
    createdAt: Date
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

function AvatarClonePanel() {
    const [modelName, setModelName] = useState('')
    const [videoFile, setVideoFile] = useState<File | null>(null)
    const [training, setTraining] = useState(false)
    const [progress, setProgress] = useState(0)
    const [progressText, setProgressText] = useState('')
    const [models, setModels] = useState<AvatarModel[]>([])
    const [selectedModel, setSelectedModel] = useState<string | null>(null)
    const [serviceStatus, setServiceStatus] = useState<boolean | null>(null)

    // 检查服务状态
    useEffect(() => {
        window.electronAPI?.invoke('heygem-check-status').then((result: any) => {
            setServiceStatus(result.success && result.data)
        }).catch(() => setServiceStatus(false))

        // 加载已有模型
        window.electronAPI?.invoke('heygem-get-models').then((result: any) => {
            if (result.success) {
                setModels(result.data)
            }
        })
    }, [])

    const handleUpload = (file: File) => {
        setVideoFile(file)
        return false // 阻止自动上传
    }

    const handleTrain = async () => {
        if (!videoFile || !modelName.trim()) return

        setTraining(true)
        setProgress(0)
        setProgressText('准备训练...')

        try {
            // 将文件转为路径（需要先保存到临时目录）
            const result = await window.electronAPI?.invoke('heygem-train-model', {
                videoBuffer: await fileToBase64Raw(videoFile),
                modelName: modelName.trim(),
            })

            if (result.success) {
                setModels(prev => [result.data, ...prev])
                setSelectedModel(result.data.id)
                setModelName('')
                setVideoFile(null)
            } else {
                throw new Error(result.error)
            }
        } catch (error: any) {
            console.error('训练失败:', error)
        } finally {
            setTraining(false)
            setProgress(0)
        }
    }

    const handleDelete = async (modelId: string) => {
        await window.electronAPI?.invoke('heygem-delete-model', modelId)
        setModels(prev => prev.filter(m => m.id !== modelId))
        if (selectedModel === modelId) {
            setSelectedModel(null)
        }
    }

    return (
        <div>
            <p style={{ marginBottom: 16, color: '#666' }}>
                上传您的视频（10-30秒），克隆专属数字人形象
            </p>

            {serviceStatus === false && (
                <Alert
                    message="HeyGem 服务未启动"
                    description={
                        <div>
                            <p>请先启动 HeyGem Docker 服务：</p>
                            <code>docker-compose up -d</code>
                            <p style={{ marginTop: 8 }}>详见：<a href="https://github.com/GuijiAI/HeyGem.ai" target="_blank">HeyGem 部署指南</a></p>
                        </div>
                    }
                    type="warning"
                    showIcon
                    style={{ marginBottom: 16 }}
                />
            )}

            {serviceStatus === true && (
                <Alert
                    message="HeyGem 服务已连接"
                    type="success"
                    showIcon
                    style={{ marginBottom: 16 }}
                />
            )}

            <Space direction="vertical" style={{ width: '100%' }} size="large">
                {/* 克隆新形象 */}
                <Card title="克隆新形象" size="small">
                    <Space direction="vertical" style={{ width: '100%' }}>
                        <Input
                            placeholder="给形象起个名字（如：商务形象）"
                            value={modelName}
                            onChange={(e) => setModelName(e.target.value)}
                            prefix={<UserOutlined />}
                        />

                        <Upload
                            accept="video/*"
                            beforeUpload={handleUpload}
                            showUploadList={false}
                            disabled={training}
                        >
                            <Button icon={<UploadOutlined />} block>
                                {videoFile ? videoFile.name : '选择视频文件（10-30秒）'}
                            </Button>
                        </Upload>

                        <div style={{ fontSize: 12, color: '#999' }}>
                            要求：正面露脸、光线充足、背景简洁、有少量说话内容
                        </div>

                        {training && (
                            <div>
                                <Progress percent={progress} status="active" />
                                <div style={{ textAlign: 'center', color: '#666' }}>{progressText}</div>
                            </div>
                        )}

                        <Button
                            type="primary"
                            icon={<VideoCameraOutlined />}
                            onClick={handleTrain}
                            loading={training}
                            disabled={!videoFile || !modelName.trim() || serviceStatus !== true}
                            block
                        >
                            开始克隆
                        </Button>
                    </Space>
                </Card>

                {/* 已有形象列表 */}
                <Card title="我的数字形象" size="small">
                    {models.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#999', padding: 24 }}>
                            暂无形象，请先克隆一个
                        </div>
                    ) : (
                        <List
                            dataSource={models}
                            renderItem={(model) => (
                                <List.Item
                                    style={{
                                        cursor: 'pointer',
                                        background: selectedModel === model.id ? '#e6f7ff' : 'transparent',
                                        padding: '8px 12px',
                                        borderRadius: 4,
                                    }}
                                    onClick={() => setSelectedModel(model.id)}
                                    actions={[
                                        <Button
                                            size="small"
                                            danger
                                            icon={<DeleteOutlined />}
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                handleDelete(model.id)
                                            }}
                                        />
                                    ]}
                                >
                                    <List.Item.Meta
                                        avatar={<UserOutlined style={{ fontSize: 24 }} />}
                                        title={model.name}
                                        description={new Date(model.createdAt).toLocaleDateString()}
                                    />
                                </List.Item>
                            )}
                        />
                    )}
                </Card>

                {selectedModel && (
                    <Alert
                        message={`已选择形象：${models.find(m => m.id === selectedModel)?.name}`}
                        type="info"
                        showIcon
                    />
                )}
            </Space>
        </div>
    )
}

export default AvatarClonePanel
