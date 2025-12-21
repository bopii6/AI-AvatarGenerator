import { Button, Checkbox, Space, Alert, Descriptions, Tag, message } from 'antd'
import { SendOutlined, FolderOpenOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useAppStore } from '../../store/appStore'
import CookieSettings from '../CookieSettings'

const platforms = [
    { key: 'douyin', label: '抖音', color: '#000000' },
    { key: 'shipinhao', label: '视频号', color: '#07c160' },
    { key: 'xiaohongshu', label: '小红书', color: '#fe2c55' },
]

function PublishPanel() {
    const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['douyin'])
    const [loading, setLoading] = useState(false)
    const [openingCenter, setOpeningCenter] = useState(false)

    const { finalVideoPath, coverPath, titles, hashtags } = useAppStore()

    const handleExport = async () => {
        setLoading(true)
        try {
            await new Promise(resolve => setTimeout(resolve, 2000))
            // TODO: 导出发布包到指定目录
            alert('发布包已导出到 ./output/publish/')
        } finally {
            setLoading(false)
        }
    }

    const readyToPublish = finalVideoPath && coverPath && titles.length > 0
    const suggestedTitle = (titles && titles.length > 0 ? titles[0] : '').trim()

    const handleOpenDistributionCenter = async () => {
        setOpeningCenter(true)
        try {
            const result = await window.electronAPI?.invoke('social-auto-upload-open', {
                videoPath: finalVideoPath || undefined,
                title: suggestedTitle || undefined,
            })
            if (result?.success) {
                message.success('已打开全网分发中心')
                if (!finalVideoPath) {
                    message.info('可先在「爆款剪辑台」生成成片后，再来这里一键导入发布')
                }
            } else {
                throw new Error(result?.error || '打开失败')
            }
        } catch (e: any) {
            message.error(e.message)
        } finally {
            setOpeningCenter(false)
        }
    }

    return (
        <div>
            <p style={{ marginBottom: 16, color: '#666' }}>
                全网分发：一键打开发布中心（首次会自动安装/启动），并自动导入当前成片，支持抖音/小红书/视频号等平台
            </p>

            <Space direction="vertical" style={{ width: '100%' }} size="large">
                <CookieSettings />

                <Alert
                    message="分发说明"
                    description="首次打开会自动拉取并启动开源分发工具；登录各平台账号后即可批量发布。我们会自动把当前成片导入到分发中心。"
                    type="info"
                    showIcon
                />

                <Descriptions title="分发内容预览" bordered column={1}>
                    <Descriptions.Item label="视频">
                        {finalVideoPath ? <Tag color="success">已就绪</Tag> : <Tag color="warning">未完成</Tag>}
                    </Descriptions.Item>
                    <Descriptions.Item label="封面">
                        {coverPath ? <Tag color="success">已就绪</Tag> : <Tag color="warning">未完成</Tag>}
                    </Descriptions.Item>
                    <Descriptions.Item label="标题">
                        {titles.length > 0 ? titles[0] : <Tag color="warning">未生成</Tag>}
                    </Descriptions.Item>
                    <Descriptions.Item label="话题">
                        {hashtags.length > 0 ? hashtags.map(t => `#${t}`).join(' ') : <Tag color="warning">未生成</Tag>}
                    </Descriptions.Item>
                </Descriptions>

                <div>
                    <div style={{ marginBottom: 8, fontWeight: 500 }}>选择发布平台</div>
                    <Checkbox.Group
                        value={selectedPlatforms}
                        onChange={(v) => setSelectedPlatforms(v as string[])}
                    >
                        <Space>
                            {platforms.map((p) => (
                                <Checkbox key={p.key} value={p.key}>
                                    <Tag color={p.color}>{p.label}</Tag>
                                </Checkbox>
                            ))}
                        </Space>
                    </Checkbox.Group>
                </div>

                <Space>
                    <Button
                        type="primary"
                        icon={<SendOutlined />}
                        size="large"
                        loading={openingCenter}
                        onClick={handleOpenDistributionCenter}
                    >
                        打开分发中心
                    </Button>
                    <Button
                        type="primary"
                        icon={<FolderOpenOutlined />}
                        size="large"
                        loading={loading}
                        onClick={handleExport}
                        disabled={!readyToPublish}
                    >
                        生成分发包
                    </Button>
                </Space>

                {!readyToPublish && (
                    <div style={{ padding: 16, background: '#fffbe6', borderRadius: 8, border: '1px solid #ffe58f' }}>
                        ⚠️ 请先完成所有前置步骤（视频、封面、标题）
                    </div>
                )}
            </Space>
        </div>
    )
}

export default PublishPanel
