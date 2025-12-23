import { Form, Input, Button, Card, Space, Divider, Typography, message } from 'antd'
import { DatabaseOutlined, ApartmentOutlined, SaveOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { useGpuScheduler } from '../contexts/GpuSchedulerContext'

const { Title, Text } = Typography

function ServerSettings() {
    const [form] = Form.useForm()
    const [loading, setLoading] = useState(false)
    const [currentEnv, setCurrentEnv] = useState('')
    const { clearPendingSwitch, refresh } = useGpuScheduler()

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const res = await window.electronAPI?.invoke('config-get')
                if (res?.success) {
                    form.setFieldsValue(res.data)
                    setCurrentEnv(res.data.loadedEnvPath || '内置配置')
                }
            } catch (err) {
                console.error('获取配置失败:', err)
            }
        }
        fetchConfig()
    }, [form])

    const onFinish = async (values: any) => {
        setLoading(true)
        try {
            const res = await window.electronAPI?.invoke('config-update', values)
            if (res?.success) {
                message.success('服务器设置已保存，即时生效！')
                // 配置更改后清除切换状态并刷新
                clearPendingSwitch()
                setTimeout(() => refresh(), 500)
            } else {
                throw new Error(res?.error || '保存失败')
            }
        } catch (err: any) {
            message.error(`保存失败: ${err.message}`)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ padding: '8px 0' }}>
            <div style={{ marginBottom: 24 }}>
                <Title level={5}>后端服务器配置</Title>
                <Text type="secondary">
                    这里仅修改服务器地址与端口；云端访问密钥请到「授权/密钥」单独配置。
                </Text>
            </div>

            <Form
                form={form}
                layout="vertical"
                onFinish={onFinish}
                initialValues={{
                    CLOUD_GPU_VIDEO_PORT: '8383',
                    CLOUD_VOICE_PORT: '9090'
                }}
            >
                <Card
                    size="small"
                    title={<Space><DatabaseOutlined /> GPU 算力服务器 (DUIX/HeyGem)</Space>}
                    style={{ marginBottom: 16, borderRadius: 8, border: '1px solid var(--border)' }}
                >
                    <Space style={{ width: '100%' }} align="start">
                        <Form.Item
                            label="服务器地址"
                            name="CLOUD_GPU_SERVER_URL"
                            rules={[{ required: true, message: '请输入服务器 IP 或域名' }]}
                            style={{ flex: 1, minWidth: 300 }}
                            extra="示例: http://111.229.185.xxx"
                        >
                            <Input placeholder="http://1.2.3.4" />
                        </Form.Item>
                        <Form.Item
                            label="端口"
                            name="CLOUD_GPU_VIDEO_PORT"
                            rules={[{ required: true, message: '端口' }]}
                            style={{ width: 80 }}
                        >
                            <Input placeholder="8383" />
                        </Form.Item>
                    </Space>
                </Card>

                <Card
                    size="small"
                    title={<Space><ApartmentOutlined /> 语音服务器 (CosyVoice)</Space>}
                    style={{ marginBottom: 24, borderRadius: 8, border: '1px solid var(--border)' }}
                >
                    <Space style={{ width: '100%' }} align="start">
                        <Form.Item
                            label="服务器地址"
                            name="CLOUD_VOICE_SERVER_URL"
                            rules={[{ required: true, message: '请输入语音服务器 IP 或域名' }]}
                            style={{ flex: 1, minWidth: 400 }}
                            extra="示例: http://111.229.185.xxx"
                        >
                            <Input placeholder="http://1.2.3.4" />
                        </Form.Item>
                        <Form.Item
                            label="端口"
                            name="CLOUD_VOICE_PORT"
                            rules={[{ required: true, message: '端口' }]}
                            style={{ width: 100 }}
                        >
                            <Input placeholder="9090" />
                        </Form.Item>
                    </Space>
                </Card>

                <Form.Item>
                    <Button
                        type="primary"
                        htmlType="submit"
                        icon={<SaveOutlined />}
                        size="large"
                        loading={loading}
                        block
                    >
                        保存配置
                    </Button>
                </Form.Item>
            </Form>

            <Divider />
            <Text type="secondary" style={{ fontSize: 12 }}>
                调试信息：当前环境基准路径 [{currentEnv}]
            </Text>
        </div>
    )
}

export default ServerSettings
