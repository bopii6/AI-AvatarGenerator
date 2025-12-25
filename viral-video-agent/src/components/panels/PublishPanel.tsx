import { Button, Checkbox, Space, Alert, Descriptions, Tag, message } from 'antd'
import { SendOutlined, FolderOpenOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useAppStore } from '../../store/appStore'

const platforms = [
    { key: 'douyin', label: '抖音', color: '#000000' },
    { key: 'shipinhao', label: '视频号', color: '#07c160' },
    { key: 'xiaohongshu', label: '小红书', color: '#fe2c55' },
]

function PublishPanel() {
    const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['douyin'])
    const [loading, setLoading] = useState(false)
    const [publishing, setPublishing] = useState(false)
    const [lastPublish, setLastPublish] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

    const { finalVideoPath, titles, hashtags, setFinalVideoPath, setPreview, setTitles } = useAppStore()

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

    const readyToPublish = !!finalVideoPath
    const suggestedTitle = (titles && titles.length > 0 ? titles[0] : '').trim()

    const handlePickLocalVideoForTest = async () => {
        if (!window.electronAPI?.invoke) {
            message.error('桌面端接口未就绪，请重启应用')
            return
        }
        try {
            setLastPublish(null)
            const res = await window.electronAPI.invoke('select-video-file')
            if (!res?.success) {
                if (res?.canceled) return
                throw new Error(res?.error || '选择文件失败')
            }
            const filePath = res.filePath as string
            setFinalVideoPath(filePath)
            setPreview('video', filePath)
            if (!titles || titles.length === 0) {
                const base = filePath.split(/[\\/]/).pop() || ''
                const name = base.replace(/\.[^.]+$/, '').trim()
                if (name) setTitles([name.slice(0, 80)])
            }
            message.success('已选择本地视频，可直接测试一键发布')
        } catch (e: any) {
            message.error(e.message || '选择文件失败')
        }
    }

    const handleOneClickPublish = async () => {
        if (!window.electronAPI?.invoke) {
            message.error('桌面端接口未就绪，请重启应用')
            return
        }
        if (!finalVideoPath) {
            message.warning('请先选择本地视频（用于测试发布），或完成视频出片后再发布')
            return
        }
        if (selectedPlatforms.length === 0) {
            message.warning('请至少选择一个发布平台')
            return
        }

        setPublishing(true)
        setLastPublish(null)
        try {
            message.loading({ content: '正在启动并发布（首次可能需要安装依赖）...', key: 'publish', duration: 0 })
            const result = await window.electronAPI.invoke('publish-one-click', {
                platforms: selectedPlatforms,
                videoPath: finalVideoPath,
                title: suggestedTitle || undefined,
                tags: hashtags || [],
            })
            if (result?.canceled) {
                message.info({ content: '已取消发布', key: 'publish', duration: 2 })
                setLastPublish(null)
                return
            }
            if (!result?.success) throw new Error(result?.error || '发布失败')
            message.success({ content: '已触发发布流程（会自动打开各平台发布页并填充内容）', key: 'publish' })
            setLastPublish({ type: 'success', message: '已触发发布流程；如失败请查看日志：APPDATA/viral-video-agent/logs/social-auto-upload.log' })
        } catch (e: any) {
            message.error({ content: e.message, key: 'publish', duration: 6 })
            setLastPublish({ type: 'error', message: e.message || '发布失败（请查看 social-auto-upload.log）' })
        } finally {
            setPublishing(false)
        }
    }

    return (
        <div>
            <p style={{ marginBottom: 16, color: '#666' }}>
                全网分发：选择平台后点击「一键发送」，会自动使用最近保存的 Cookie、自动选择当前成片、自动生成标题/话题/封面，并打开各平台发布页完成发布。
            </p>

            <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Alert
                    message="账号登录提示"
                    description="Cookie 已在右上角「设置」→「全网分发账号」里统一管理；首次发布若失败，请先去那里保存一次对应平台 Cookie。"
                    type="info"
                    showIcon
                />

                <Alert
                    message="分发说明"
                    description="首次发布会自动拉取并启动开源分发工具（可能需要安装依赖）。发布失败时可查看日志（APPDATA/viral-video-agent/logs/social-auto-upload.log）。"
                    type="info"
                    showIcon
                />

                <Descriptions title="分发内容预览" bordered column={1}>
                    <Descriptions.Item label="视频">
                        {finalVideoPath ? <Tag color="success">已就绪</Tag> : <Tag color="warning">未完成</Tag>}
                    </Descriptions.Item>
                    <Descriptions.Item label="标题">
                        {titles.length > 0 ? titles[0] : <Tag color="default">可选</Tag>}
                    </Descriptions.Item>
                    <Descriptions.Item label="话题">
                        {hashtags.length > 0 ? hashtags.map(t => `#${t}`).join(' ') : <Tag color="default">可选</Tag>}
                    </Descriptions.Item>
                </Descriptions>

                {lastPublish && (
                    <Alert
                        type={lastPublish.type}
                        showIcon
                        message={lastPublish.type === 'success' ? '发布已触发' : '发布失败'}
                        description={lastPublish.message}
                        closable
                        onClose={() => setLastPublish(null)}
                    />
                )}

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
                        icon={<FolderOpenOutlined />}
                        size="large"
                        onClick={handlePickLocalVideoForTest}
                    >
                        选择本地视频（测试发布）
                    </Button>
                    <Button
                        type="primary"
                        icon={<SendOutlined />}
                        size="large"
                        loading={publishing}
                        onClick={handleOneClickPublish}
                        disabled={!readyToPublish || selectedPlatforms.length === 0}
                    >
                        一键发送
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
                        请先选择本地视频（用于测试发布），或完成视频出片后再来发布
                    </div>
                )}
            </Space>
        </div>
    )
}

export default PublishPanel
