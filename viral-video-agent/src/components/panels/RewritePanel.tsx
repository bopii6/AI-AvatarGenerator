import { Button, Radio, Input, Space, message } from 'antd'
import { EditOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useAppStore } from '../../store/appStore'

const { TextArea } = Input

type RewriteMode = 'auto' | 'custom' | 'same'

function RewritePanel() {
    const [mode, setMode] = useState<RewriteMode>('auto')
    const [customInstruction, setCustomInstruction] = useState('')
    const [loading, setLoading] = useState(false)
    const { originalCopy, rewrittenCopy, setRewrittenCopy, setPreview } = useAppStore()

    const handleRewrite = async () => {
        if (!originalCopy) return

        // 如果是自定义指令模式，必须有指令内容
        if (mode === 'custom' && !customInstruction.trim()) {
            message.warning('请输入改写指令')
            return
        }

        setLoading(true)

        try {
            // 调用腾讯混元 API
            const result = await window.electronAPI?.rewriteCopy(
                originalCopy,
                mode,
                mode === 'custom' ? customInstruction : undefined
            )

            if (result?.success && result.data) {
                setRewrittenCopy(result.data)
                setPreview('text', result.data)
                message.success('文案改写成功！')
            } else {
                throw new Error(result?.error || '改写失败')
            }
        } catch (error: any) {
            console.error('改写失败:', error)
            message.error(`改写失败: ${error.message}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div>
            <p style={{ marginBottom: 16, color: 'var(--text-secondary)' }}>
                一键原创改写：保留核心观点与结构，显著降低重复风险
            </p>

            <Space direction="vertical" style={{ width: '100%' }} size="large">
                {!originalCopy && (
                    <div style={{ padding: 18, background: 'rgba(255, 255, 255, 0.06)', borderRadius: 12, border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                        ⚠️ 请先完成文案提取步骤
                    </div>
                )}

                <Radio.Group
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                    buttonStyle="solid"
                >
                    <Radio.Button value="auto">一键原创改写</Radio.Button>
                    <Radio.Button value="custom">自定义指令</Radio.Button>
                    <Radio.Button value="same">完全一致</Radio.Button>
                </Radio.Group>

                {mode === 'custom' && (
                    <TextArea
                        placeholder="输入改写指令，例如：请将文案改写成更轻松幽默的风格..."
                        rows={3}
                        value={customInstruction}
                        onChange={(e) => setCustomInstruction(e.target.value)}
                    />
                )}

                <Button
                    type="primary"
                    icon={<EditOutlined />}
                    size="large"
                    loading={loading}
                    onClick={handleRewrite}
                    disabled={!originalCopy}
                >
                    执行改写
                </Button>

                {rewrittenCopy && (
                    <div style={{ padding: 16, background: 'rgba(255, 255, 255, 0.04)', borderRadius: 12, border: '1px solid var(--border)' }}>
                        <div style={{ marginBottom: 8, fontWeight: 700, color: 'var(--text-primary)' }}>
                            <EditOutlined style={{ marginRight: 8 }} />
                            改写结果
                        </div>
                        <pre style={{ whiteSpace: 'pre-wrap', margin: 0, color: 'var(--text-primary)' }}>{rewrittenCopy}</pre>
                    </div>
                )}
            </Space>
        </div>
    )
}

export default RewritePanel
