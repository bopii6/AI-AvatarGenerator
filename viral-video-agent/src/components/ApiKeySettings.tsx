import { Button, Card, Form, Input, Space, Typography, message } from 'antd'
import { KeyOutlined, SaveOutlined, SafetyCertificateOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { useGpuScheduler } from '../contexts/GpuSchedulerContext'

const { Title, Text } = Typography

export default function ApiKeySettings() {
    const [form] = Form.useForm()
    const [loading, setLoading] = useState(false)
    const [currentEnv, setCurrentEnv] = useState('')
    const { refresh, preswitch, clearPendingSwitch } = useGpuScheduler()

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const res = await window.electronAPI?.invoke('config-get')
                if (res?.success) {
                    form.setFieldsValue({ GPU_API_KEY: res.data?.GPU_API_KEY || '' })
                    setCurrentEnv(res.data.loadedEnvPath || '内置配置')
                }
            } catch (err) {
                console.error('获取配置失败:', err)
            }
        }
        fetchConfig()
    }, [form])

    const onFinish = async (values: any) => {
        const apiKey = String(values?.GPU_API_KEY || '').trim()
        if (!apiKey) {
            message.warning('请输入 API 密钥')
            return
        }

        const msgKey = 'api-key-validate-save'
        setLoading(true)
        try {
            message.loading({ key: msgKey, duration: 0, content: '正在验证密钥…' })

            let verify: any
            try {
                verify = await window.electronAPI?.invoke('scheduler-validate-key', apiKey)
            } catch (e: any) {
                const raw = String(e?.message || e || '')
                if (raw.includes("No handler registered for 'scheduler-validate-key'")) {
                    message.error({ key: msgKey, content: '当前桌面端版本未包含“验证密钥”功能：请重启应用或重新运行/重新打包后再试' })
                    return
                }
                throw e
            }
            if (!verify?.success) {
                message.error({ key: msgKey, content: verify?.error || '密钥验证失败' })
                return
            }

            const save = await window.electronAPI?.invoke('config-update', { GPU_API_KEY: apiKey })
            if (!save?.success) {
                message.error({ key: msgKey, content: save?.error || '保存失败' })
                return
            }

            clearPendingSwitch()
            await refresh()
            message.success({ key: msgKey, content: '密钥已保存，验证通过' })

            // 非阻塞后台预热：减少首次做音频/克隆的等待
            void preswitch('cosyvoice')
        } catch (err: any) {
            message.error({ key: msgKey, content: err?.message || '保存失败' })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ padding: '8px 0' }}>
            <div style={{ marginBottom: 24 }}>
                <Title level={5}>授权 / 密钥</Title>
                <Text type="secondary">
                    只在这里配置云端 GPU 服务的访问密钥。保存时会先验证密钥是否正确，通过后才写入本地配置。
                </Text>
            </div>

            <Form form={form} layout="vertical" onFinish={onFinish}>
                <Card
                    size="small"
                    title={<Space><KeyOutlined /> GPU API 密钥</Space>}
                    style={{ marginBottom: 16, borderRadius: 8, border: '1px solid var(--border)' }}
                >
                    <Form.Item
                        label="API 密钥"
                        name="GPU_API_KEY"
                        rules={[{ required: true, message: '请输入 API 密钥' }]}
                        extra="密钥错误时不会影响你进入各页面，但在进行“生成音频/训练声音/生成数字人”等操作时将无法访问云端。"
                    >
                        <Input.Password placeholder="请输入云端服务密钥" />
                    </Form.Item>

                    <Button
                        type="primary"
                        htmlType="submit"
                        icon={<SafetyCertificateOutlined />}
                        loading={loading}
                        block
                    >
                        验证并保存
                    </Button>
                </Card>

                <Button
                    type="default"
                    icon={<SaveOutlined />}
                    onClick={async () => {
                        try {
                            setLoading(true)
                            clearPendingSwitch()
                            await refresh()
                            message.success('已刷新云端状态')
                        } finally {
                            setLoading(false)
                        }
                    }}
                    disabled={loading}
                    block
                >
                    刷新状态
                </Button>
            </Form>

            <div style={{ marginTop: 16 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                    调试信息：当前环境基准路径 [{currentEnv}]
                </Text>
            </div>
        </div>
    )
}
