import { useState, useEffect } from 'react'
import { Card, Space, Select, Typography, Button, List, message, Alert, Tag, Modal, Image } from 'antd'
import { ReloadOutlined, DeleteOutlined, UserOutlined } from '@ant-design/icons'
import CloudServiceStatus from './CloudServiceStatus'

interface CloudAvatarModel {
    id: string
    name: string
    remoteVideoPath: string
    localPreviewPath?: string
    createdAt: string
}

export default function AvatarSettings() {
    const [avatars, setAvatars] = useState<CloudAvatarModel[]>([])
    const [loading, setLoading] = useState(false)
    const [defaultAvatarId, setDefaultAvatarId] = useState<string>(() => {
        try {
            return localStorage.getItem('auto.avatarId') || ''
        } catch {
            return ''
        }
    })

    const loadAvatars = async () => {
        if (loading) return
        setLoading(true)
        try {
            if (!window.electronAPI?.invoke) return
            const result = await window.electronAPI.invoke('cloud-gpu-get-avatars')
            if (result?.success) {
                setAvatars(result.data || [])
            }
        } catch (e) {
            console.error('Failed to load avatars', e)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        void loadAvatars()
    }, [])

    const handleSetDefault = (id: string) => {
        try {
            localStorage.setItem('auto.avatarId', id)
            setDefaultAvatarId(id)
            message.success('已更新全自动默认形象')
            // Trigger storage event for other components to update if needed
            window.dispatchEvent(new Event('storage'))
        } catch {
            message.error('保存失败')
        }
    }

    const handleDelete = async (id: string) => {
        Modal.confirm({
            title: '确认删除该形象？',
            content: '删除后无法恢复，任何使用该形象的草稿可能无法正常生成视频。',
            okText: '删除',
            okButtonProps: { danger: true },
            cancelText: '取消',
            onOk: async () => {
                try {
                    await window.electronAPI.invoke('cloud-gpu-delete-avatar', id)
                    message.success('已删除')
                    if (defaultAvatarId === id) {
                        handleSetDefault('')
                    }
                    await loadAvatars()
                } catch (e: any) {
                    message.error(e.message || '删除失败')
                }
            }
        })
    }

    return (
        <Card title="数字人形象管理" bordered={false}>
            <Space direction="vertical" style={{ width: '100%' }} size={16}>
                <CloudServiceStatus kind="gpu" />

                {/* 全自动默认形象设置 */}
                <Card
                    size="small"
                    title="🚀 全自动模式默认形象"
                    style={{ borderRadius: 8 }}
                >
                    <Space direction="vertical" style={{ width: '100%' }} size={12}>
                        <Typography.Text type="secondary">
                            设置全自动视频生成时使用的默认数字人形象。
                        </Typography.Text>
                        <Space wrap>
                            <Typography.Text>默认形象：</Typography.Text>
                            <Select
                                value={defaultAvatarId || undefined}
                                onChange={handleSetDefault}
                                style={{ minWidth: 320 }}
                                placeholder="选择默认形象"
                                allowClear
                                options={avatars.map((a) => ({
                                    value: a.id,
                                    label: a.name || a.id
                                }))}
                            />
                            <Button icon={<ReloadOutlined />} onClick={loadAvatars} loading={loading}>
                                刷新
                            </Button>
                        </Space>
                        {avatars.length === 0 && (
                            <Alert type="warning" showIcon message="没有可用的形象，请先在「数字人」面板克隆一个形象" />
                        )}
                    </Space>
                </Card>

                <Card size="small" title="云端形象列表" style={{ borderRadius: 8 }}>
                    <List
                        loading={loading}
                        dataSource={avatars}
                        locale={{ emptyText: '暂无云端形象' }}
                        renderItem={(item) => (
                            <List.Item
                                actions={[
                                    <Button
                                        size="small"
                                        danger
                                        icon={<DeleteOutlined />}
                                        onClick={() => handleDelete(item.id)}
                                    >
                                        删除
                                    </Button>
                                ]}
                            >
                                <List.Item.Meta
                                    avatar={
                                        <div style={{
                                            width: 48,
                                            height: 48,
                                            background: '#f0f0f0',
                                            borderRadius: 4,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            overflow: 'hidden'
                                        }}>
                                            {item.localPreviewPath ? (
                                                <video src={`media://${item.localPreviewPath}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            ) : (
                                                <UserOutlined />
                                            )}
                                        </div>
                                    }
                                    title={
                                        <Space>
                                            {item.name}
                                            {defaultAvatarId === item.id && <Tag color="blue">默认</Tag>}
                                        </Space>
                                    }
                                    description={
                                        <Space direction="vertical" size={0}>
                                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>ID: {item.id}</Typography.Text>
                                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>创建于: {new Date(item.createdAt).toLocaleString()}</Typography.Text>
                                        </Space>
                                    }
                                />
                            </List.Item>
                        )}
                    />
                </Card>
            </Space>
        </Card>
    )
}
