import { Button, Space, Spin, message } from 'antd'
import { AudioOutlined, FileTextOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useAppStore } from '../../store/appStore'

function CopywritingPanel() {
    const [loading, setLoading] = useState(false)
    const { videoPath, finalVideoPath, digitalHumanVideoPath, sourceVideoPath, inputAudioPath, originalCopy, setOriginalCopy, setPreview } = useAppStore()

    const asrSourcePath = finalVideoPath || digitalHumanVideoPath || videoPath || sourceVideoPath || inputAudioPath

    const handleExtract = async () => {
        if (!asrSourcePath) return

        setLoading(true)

        try {
            // 调用后端 ASR API 进行语音转文字
            const result = await window.electronAPI?.invoke('transcribe-audio', asrSourcePath)

            if (result?.success) {
                const transcribedText = result.data || ''
                setOriginalCopy(transcribedText)
                setPreview('text', transcribedText)
                if (transcribedText) {
                    message.success('文案提取成功！')
                } else {
                    message.warning('文案提取完成，但未识别到有效文字')
                }
            } else {
                throw new Error(result?.error || '服务器未返回识别结果')
            }
        } catch (error: any) {
            console.error('提取失败:', error)
            message.error(`提取失败: ${error.message}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div>
            <p style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>
                使用腾讯云语音识别 (ASR) 将视频音频转换为文字
            </p>

            <Space direction="vertical" style={{ width: '100%' }} size="large">
                {!asrSourcePath && (
                    <div style={{ padding: 18, background: 'rgba(255, 255, 255, 0.06)', borderRadius: 12, border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                        ⚠️ 请先准备素材：抖音视频或本地音频/视频
                    </div>
                )}

                <Button
                    type="primary"
                    icon={<AudioOutlined />}
                    size="large"
                    loading={loading}
                    onClick={handleExtract}
                    disabled={!asrSourcePath}
                >
                    提取音频文案
                </Button>

                {loading && (
                    <div style={{ textAlign: 'center', padding: 24 }}>
                        <Spin size="large" />
                        <p style={{ marginTop: 16 }}>正在识别语音...</p>
                    </div>
                )}

                {originalCopy && (
                    <div style={{ padding: 16, background: 'rgba(255, 255, 255, 0.04)', borderRadius: 12, border: '1px solid var(--border)' }}>
                        <div style={{ marginBottom: 8, fontWeight: 700, color: 'var(--text-primary)' }}>
                            <FileTextOutlined style={{ marginRight: 8 }} />
                            提取结果
                        </div>
                        <pre style={{ whiteSpace: 'pre-wrap', margin: 0, color: 'var(--text-primary)' }}>{originalCopy}</pre>
                    </div>
                )}
            </Space>
        </div>
    )
}

export default CopywritingPanel
