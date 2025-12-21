import { Button, Input, Progress, Space, message } from 'antd'
import { DownloadOutlined, LinkOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useAppStore } from '../../store/appStore'

function VideoDownloadPanel() {
    const [loading, setLoading] = useState(false)
    const [progress, setProgress] = useState(0)
    const [statusText, setStatusText] = useState('')
    const { douyinUrl, setVideoPath, setPreview } = useAppStore()

    const handleDownload = async () => {
        if (!douyinUrl) {
            message.warning('请先在顶部输入抖音分享链接')
            return
        }

        setLoading(true)
        setProgress(0)
        setStatusText('正在解析链接...')

        try {
            // 调用 Electron IPC 进行下载
            const result = await window.electronAPI?.invoke('download-video', douyinUrl)

            if (result?.success) {
                setProgress(100)
                setStatusText('下载完成！')

                // 设置下载完成的视频路径
                if (result.data?.videoPath) {
                    setVideoPath(result.data.videoPath)
                    setPreview('video', result.data.videoPath)
                    message.success(`视频下载成功: ${result.data.title || '抖音视频'}`)
                } else {
                    setPreview('text', '✅ 视频下载完成！')
                    message.success('视频下载完成！')
                }
            } else {
                throw new Error(result?.error || '下载失败')
            }
        } catch (error: any) {
            console.error('下载失败:', error)
            message.error(`下载失败: ${error.message}`)
            setPreview('text', `❌ 下载失败: ${error.message}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div>
            <p style={{ marginBottom: 16, color: '#666' }}>
                粘贴对标账号/爆款视频链接，一键追踪并下载无水印高清视频
            </p>

            <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Input
                    prefix={<LinkOutlined />}
                    placeholder="抖音分享链接已从顶部获取..."
                    value={douyinUrl}
                    disabled
                    size="large"
                />

                {loading && (
                    <div>
                        <Progress percent={progress} status="active" />
                        <div style={{ textAlign: 'center', color: '#666', marginTop: 8 }}>
                            {statusText}
                        </div>
                    </div>
                )}

                <Button
                    type="primary"
                    icon={<DownloadOutlined />}
                    size="large"
                    loading={loading}
                    onClick={handleDownload}
                    disabled={!douyinUrl}
                >
                    开始追踪
                </Button>
            </Space>
        </div>
    )
}

export default VideoDownloadPanel
