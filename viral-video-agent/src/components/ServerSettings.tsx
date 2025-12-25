import { Form, Input, Button, Card, Space, Divider, Typography, message, Select } from 'antd'
import { DatabaseOutlined, SaveOutlined, SoundOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'

const { Title, Text } = Typography

export default function ServerSettings() {
    const [form] = Form.useForm()
    const [loading, setLoading] = useState(false)
    const [currentEnv, setCurrentEnv] = useState('')

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
                    这里只配置数字人 GPU 服务器地址和端口；语音克隆走阿里云 DashScope API，无需再部署语音服务或调度器。
                </Text>
            </div>

            <Form
                form={form}
                layout="vertical"
                onFinish={onFinish}
                initialValues={{
                    CLOUD_GPU_VIDEO_PORT: '8383',
                    TENCENT_COS_VOICE_PREFIX: 'voice-samples/',
                    TENCENT_COS_SIGNED_URL_EXPIRES_SECONDS: '3600',
                    ALIYUN_COSYVOICE_MODEL: 'cosyvoice-v3-flash',
                    ALIYUN_COSYVOICE_FALLBACK_MODELS: 'cosyvoice-clone-v1,cosyvoice-v3-plus',
                }}
            >
                <Card
                    size="small"
                    title={<Space><DatabaseOutlined /> GPU 算力服务器（数字人）</Space>}
                    style={{ marginBottom: 16, borderRadius: 8, border: '1px solid var(--border)' }}
                >
                    <Space style={{ width: '100%' }} align="start">
                        <Form.Item
                            label="服务器地址"
                            name="CLOUD_GPU_SERVER_URL"
                            rules={[{ required: true, message: '请输入服务器 IP 或域名' }]}
                            style={{ flex: 1, minWidth: 320 }}
                            extra="示例: http://111.229.185.xxx"
                        >
                            <Input placeholder="http://1.2.3.4" />
                        </Form.Item>
                        <Form.Item
                            label="端口"
                            name="CLOUD_GPU_VIDEO_PORT"
                            rules={[{ required: true, message: '端口' }]}
                            style={{ width: 100 }}
                        >
                            <Input placeholder="8383" />
                        </Form.Item>
                    </Space>
                </Card>

                <Card
                    size="small"
                    title={<Space><DatabaseOutlined /> 语音样本存储（推荐：腾讯云 COS）</Space>}
                    style={{ marginBottom: 16, borderRadius: 8, border: '1px solid var(--border)' }}
                >
                    <Text type="secondary">
                        DashScope CosyVoice 声音克隆要求“录音样本”必须是公网可访问的 URL。
                        最简单稳定的方式是上传到 COS（私有读也支持预签名 URL）。
                    </Text>
                    <div style={{ height: 12 }} />
                    <Space style={{ width: '100%' }} align="start" wrap>
                        <Form.Item
                            label="COS Bucket"
                            name="TENCENT_COS_BUCKET"
                            style={{ minWidth: 320, flex: 1 }}
                            extra="示例: cosyvoice-backup-1370883689"
                        >
                            <Input placeholder="bucket-name-appid" />
                        </Form.Item>
                        <Form.Item
                            label="COS Region"
                            name="TENCENT_COS_REGION"
                            style={{ width: 220 }}
                            extra="示例: ap-shanghai"
                        >
                            <Input placeholder="ap-shanghai" />
                        </Form.Item>
                        <Form.Item
                            label="对象前缀"
                            name="TENCENT_COS_VOICE_PREFIX"
                            style={{ minWidth: 320, flex: 1 }}
                            extra="默认: voice-samples/（将按日期/设备分层）"
                        >
                            <Input placeholder="voice-samples/" />
                        </Form.Item>
                        <Form.Item
                            label="预签名有效期(秒)"
                            name="TENCENT_COS_SIGNED_URL_EXPIRES_SECONDS"
                            style={{ width: 220 }}
                            extra="默认 3600"
                        >
                            <Input placeholder="3600" />
                        </Form.Item>
                    </Space>
                </Card>

                <Card
                    size="small"
                    title={<Space><DatabaseOutlined /> 语音样本上传服务（兜底，可选）</Space>}
                    style={{ marginBottom: 16, borderRadius: 8, border: '1px solid var(--border)' }}
                >
                    <Text type="secondary">
                        若你不使用 COS，也可以配置一个公网上传服务（提供 /upload 并返回 {'{ url }'}）。未填写时会兜底复用 GPU 服务器地址。
                    </Text>
                    <div style={{ height: 12 }} />
                    <Space style={{ width: '100%' }} align="start">
                        <Form.Item
                            label="上传服务地址"
                            name="VOICE_AUDIO_UPLOAD_SERVER_URL"
                            style={{ flex: 1, minWidth: 320 }}
                            extra="示例: http://111.229.185.xxx（需提供 /upload 接口并返回 { url }）"
                        >
                            <Input placeholder="http://1.2.3.4" />
                        </Form.Item>
                        <Form.Item
                            label="端口"
                            name="VOICE_AUDIO_UPLOAD_PORT"
                            style={{ width: 100 }}
                        >
                            <Input placeholder="8383" />
                        </Form.Item>
                    </Space>
                </Card>

                <Card
                    size="small"
                    title={<Space><SoundOutlined /> 语音合成模型配置</Space>}
                    style={{ marginBottom: 16, borderRadius: 8, border: '1px solid var(--border)' }}
                >
                    <Text type="secondary">
                        配置阿里云 DashScope CosyVoice 语音合成模型。当主模型额度耗尽时，自动切换到回退模型。
                    </Text>
                    <div style={{ height: 12 }} />
                    <Space style={{ width: '100%' }} align="start" wrap>
                        <Form.Item
                            label="主模型"
                            name="ALIYUN_COSYVOICE_MODEL"
                            style={{ minWidth: 280 }}
                            extra="性价比优先选 flash"
                        >
                            <Select
                                placeholder="选择主模型"
                                options={[
                                    { value: 'cosyvoice-v3-flash', label: 'cosyvoice-v3-flash (性价比)' },
                                    { value: 'cosyvoice-v3-plus', label: 'cosyvoice-v3-plus (高质量)' },
                                    { value: 'cosyvoice-clone-v1', label: 'cosyvoice-clone-v1 (克隆专用)' },
                                ]}
                                allowClear={false}
                            />
                        </Form.Item>
                        <Form.Item
                            label="回退模型"
                            name="ALIYUN_COSYVOICE_FALLBACK_MODELS"
                            style={{ flex: 1, minWidth: 320 }}
                            extra="逗号分隔，按优先级排序，可添加新模型名称"
                        >
                            <Input placeholder="cosyvoice-clone-v1,cosyvoice-v3-plus" />
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
                调试信息：当前环境基准路径[{currentEnv}]
            </Text>
        </div>
    )
}
