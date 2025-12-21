import { Button, Input, InputNumber, Radio, Space, Image, message } from 'antd'
import { PictureOutlined, ScissorOutlined, RobotOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useAppStore } from '../../store/appStore'

function CoverPanel() {
    const [mode, setMode] = useState<'screenshot' | 'ai'>('ai')
    const [screenshotTime, setScreenshotTime] = useState(3)
    const [prompt, setPrompt] = useState('')
    const [loading, setLoading] = useState(false)
    const [statusText, setStatusText] = useState<string | null>(null)
    const { coverPath, setCoverPath, setPreview, finalVideoPath } = useAppStore()

    const handleGenerate = async () => {
        setLoading(true)
        try {
            let resultPath: string | null = null
            let logDetail = ''

            if (mode === 'screenshot') {
                if (!finalVideoPath) {
                    message.warning('请先生成或上传视频，以便截图封面')
                    return
                }
                const res = await window.electronAPI?.invoke('capture-frame', finalVideoPath, screenshotTime)
                logDetail = `截图时间 ${screenshotTime}s`
                if (!res?.success || !res.data?.coverPath) {
                    throw new Error(res?.error || '截图封面失败')
                }
                resultPath = res.data.coverPath
            } else {
                const aiPrompt = prompt.trim() || '爆款短视频封面，科技感、人物清晰、背景简洁'
                const res = await window.electronAPI?.invoke('generate-cover', aiPrompt)
                logDetail = `AI 提示词：${aiPrompt}`
                if (!res?.success || !res.data?.coverPaths?.length) {
                    throw new Error(res?.error || 'AI 生成封面失败')
                }
                resultPath = res.data.coverPaths[0]
            }

            if (resultPath) {
                setCoverPath(resultPath)
                setPreview('image', resultPath)
                setStatusText(`封面路径：${resultPath}（${logDetail}）`)
                message.success('封面已生成，预览右侧查看')
            }
        } catch (error: any) {
            message.error(error?.message || '封面生成失败')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div>
            <p style={{ marginBottom: 16, color: '#666' }}>
                生成视频封面，支持自动截图或 AI 智能生成
            </p>

            <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Radio.Group value={mode} onChange={(e) => setMode(e.target.value)} buttonStyle="solid">
                    <Radio.Button value="screenshot">
                        <ScissorOutlined /> 视频截图
                    </Radio.Button>
                    <Radio.Button value="ai">
                        <RobotOutlined /> AI 生成
                    </Radio.Button>
                </Radio.Group>

                {mode === 'screenshot' && (
                    <div>
                        <div style={{ marginBottom: 8 }}>截图时间（秒）</div>
                        <InputNumber value={screenshotTime} onChange={(v) => setScreenshotTime(v || 3)} min={0} style={{ width: 200 }} />
                    </div>
                )}

                {mode === 'ai' && (
                    <div>
                        <div style={{ marginBottom: 8 }}>AI 生成提示词（可选）</div>
                        <Input.TextArea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="描述您想要的封面风格，例如：科技感、高对比度人像、简洁背景"
                            rows={3}
                        />
                    </div>
                )}

                <Button type="primary" icon={<PictureOutlined />} loading={loading} onClick={handleGenerate}>
                    {mode === 'screenshot' ? '截取封面' : '生成 AI 封面'}
                </Button>

                {coverPath && (
                    <div style={{ padding: 16, background: '#f6ffed', borderRadius: 8, border: '1px solid #b7eb8f' }}>
                        <div style={{ marginBottom: 8, fontWeight: 600 }}>
                            <PictureOutlined style={{ marginRight: 8 }} />
                            封面已生成
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <Image src={coverPath} style={{ maxWidth: '100%', maxHeight: 200 }} />
                        </div>
                        {statusText && (
                            <div style={{ marginTop: 8, fontSize: 12, color: '#389e0d' }}>
                                {statusText}
                            </div>
                        )}
                    </div>
                )}
            </Space>
        </div>
    )
}

export default CoverPanel
