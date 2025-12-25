import { Button, Card, Form, Input, Select, Space, Typography, message } from 'antd'
import { SafetyCertificateOutlined, KeyOutlined, CloudOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'

const { Title, Text } = Typography

const MODEL_OPTIONS = [
    { value: 'cosyvoice-v3-flash', label: 'cosyvoice-v3-flash（更快更省）' },
    { value: 'cosyvoice-v3-plus', label: 'cosyvoice-v3-plus（音质更好）' },
    { value: 'cosyvoice-clone-v1', label: 'cosyvoice-clone-v1（克隆专用）' },
]

export default function ApiKeySettings() {
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

    const validateCurrent = async () => {
        const msgKey = 'dashscope-validate'
        try {
            message.loading({ key: msgKey, duration: 0, content: '正在检测 DashScope...' })
            const res = await window.electronAPI?.invoke('cloud-voice-check-status')
            if (res?.success && res.data?.online) {
                message.success({ key: msgKey, content: 'DashScope 已连接' })
                return true
            }
            message.error({ key: msgKey, content: res?.data?.message || res?.error || 'DashScope 未连接' })
            return false
        } catch (e: any) {
            message.error({ key: msgKey, content: e?.message || 'DashScope 未连接' })
            return false
        }
    }

    const onFinish = async (values: any) => {
        const apiKey = String(values?.ALIYUN_DASHSCOPE_API_KEY || '').trim()
        const model = String(values?.ALIYUN_COSYVOICE_MODEL || 'cosyvoice-v3-flash').trim()
        const fallbackModels = String(values?.ALIYUN_COSYVOICE_FALLBACK_MODELS || '').trim()

        if (!apiKey) {
            message.warning('请输入 DashScope API Key')
            return
        }

        setLoading(true)
        try {
            const save = await window.electronAPI?.invoke('config-update', {
                ALIYUN_DASHSCOPE_API_KEY: apiKey,
                ALIYUN_COSYVOICE_MODEL: model,
                ALIYUN_COSYVOICE_FALLBACK_MODELS: fallbackModels,
            })
            if (!save?.success) throw new Error(save?.error || '保存失败')

            const ok = await validateCurrent()
            if (!ok) return

            message.success('已保存并验证通过')
        } catch (err: any) {
            message.error(err?.message || '保存失败')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div style={{ padding: '8px 0' }}>
            <div style={{ marginBottom: 24 }}>
                <Title level={5}>语音服务（阿里云 DashScope）</Title>
                <Text type="secondary">
                    声音克隆与配音使用阿里云 CosyVoice API（无需本地/GPU部署）。
                </Text>
            </div>

            <Form
                form={form}
                layout="vertical"
                onFinish={onFinish}
                initialValues={{
                    ALIYUN_COSYVOICE_MODEL: 'cosyvoice-v3-flash',
                    ALIYUN_COSYVOICE_FALLBACK_MODELS: 'cosyvoice-clone-v1,cosyvoice-v3-plus',
                }}
            >
                <Card
                    size="small"
                    title={<Space><CloudOutlined /> DashScope 配置</Space>}
                    style={{ marginBottom: 16, borderRadius: 8, border: '1px solid var(--border)' }}
                >
                    <Form.Item
                        label="DashScope API Key"
                        name="ALIYUN_DASHSCOPE_API_KEY"
                        rules={[{ required: true, message: '请输入 DashScope API Key' }]}
                        extra="获取地址：https://bailian.console.aliyun.com/"
                    >
                        <Input.Password placeholder="sk-..." />
                    </Form.Item>

                    <Form.Item label="主模型" name="ALIYUN_COSYVOICE_MODEL" extra="性价比优先选 flash">
                        <Select options={MODEL_OPTIONS} />
                    </Form.Item>

                    <Form.Item
                        label="回退模型"
                        name="ALIYUN_COSYVOICE_FALLBACK_MODELS"
                        extra="逗号分隔，按优先级排序。主模型额度耗尽时自动切换"
                    >
                        <Input placeholder="cosyvoice-clone-v1,cosyvoice-v3-plus" />
                    </Form.Item>

                    <Space style={{ width: '100%' }} direction="vertical">
                        <Button
                            type="primary"
                            htmlType="submit"
                            icon={<SafetyCertificateOutlined />}
                            loading={loading}
                            block
                        >
                            保存并验证
                        </Button>

                        <Button
                            icon={<KeyOutlined />}
                            onClick={validateCurrent}
                            disabled={loading}
                            block
                        >
                            仅检测连接
                        </Button>
                    </Space>
                </Card>

                <div style={{ marginTop: 16 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        调试信息：当前环境基准路径[{currentEnv}]
                    </Text>
                </div>
            </Form>
        </div>
    )
}
