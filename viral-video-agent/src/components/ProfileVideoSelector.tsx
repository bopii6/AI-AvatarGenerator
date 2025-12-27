import { useState } from 'react'
import { Modal, List, Card, Typography, Spin, Empty, Checkbox, Button, Space } from 'antd'
import { PlayCircleOutlined, CheckCircleOutlined } from '@ant-design/icons'

// Multi-select video component - v2
const { Text } = Typography

interface ProfileVideo {
    id: string
    url: string
    title: string
    cover?: string
}

interface ProfileVideoSelectorProps {
    open: boolean
    loading: boolean
    videos: ProfileVideo[]
    onBatchSelect: (videos: ProfileVideo[]) => void
    onCancel: () => void
    maxSelect?: number
}

function ProfileVideoSelector({
    open,
    loading,
    videos,
    onBatchSelect,
    onCancel,
    maxSelect = 5
}: ProfileVideoSelectorProps) {
    const [selectedVideos, setSelectedVideos] = useState<ProfileVideo[]>([])

    const isSelected = (video: ProfileVideo) => selectedVideos.some(v => v.id === video.id)

    const toggleSelect = (video: ProfileVideo) => {
        if (isSelected(video)) {
            setSelectedVideos(prev => prev.filter(v => v.id !== video.id))
        } else if (selectedVideos.length < maxSelect) {
            setSelectedVideos(prev => [...prev, video])
        }
    }

    const handleConfirm = () => {
        if (selectedVideos.length > 0) {
            onBatchSelect(selectedVideos)
            setSelectedVideos([]) // 重置选择
        }
    }

    const handleCancel = () => {
        setSelectedVideos([])
        onCancel()
    }

    return (
        <Modal
            title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: 32 }}>
                    <span>选择要学习的样本视频（最多 {maxSelect} 个）</span>
                    <Text type="secondary" style={{ fontSize: 14, fontWeight: 400 }}>
                        已选 <Text strong style={{ color: 'var(--primary-color)' }}>{selectedVideos.length}</Text> / {maxSelect}
                    </Text>
                </div>
            }
            open={open}
            onCancel={handleCancel}
            width={900}
            footer={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text type="secondary">
                        💡 选择多个作品，AI 会学习对标博主的打法并生成原创选题
                    </Text>
                    <Space>
                        <Button onClick={handleCancel}>取消</Button>
                        <Button
                            type="primary"
                            disabled={selectedVideos.length === 0}
                            onClick={handleConfirm}
                        >
                            开始学习（已选 {selectedVideos.length} 个）
                        </Button>
                    </Space>
                </div>
            }
            styles={{ body: { maxHeight: '65vh', overflowY: 'auto', padding: '16px 24px' } }}
        >
            {loading ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                    <Spin size="large" />
                    <div style={{ marginTop: 16, color: 'var(--text-secondary)' }}>正在抓取主页视频列表...</div>
                </div>
            ) : videos.length > 0 ? (
                <List
                    grid={{ gutter: 16, column: 3 }}
                    dataSource={videos}
                    renderItem={(item) => {
                        const selected = isSelected(item)
                        const disabled = !selected && selectedVideos.length >= maxSelect

                        return (
                            <List.Item>
                                <Card
                                    hoverable={!disabled}
                                    style={{
                                        opacity: disabled ? 0.5 : 1,
                                        border: selected ? '2px solid var(--primary-color)' : '1px solid var(--border)',
                                        transition: 'all 0.2s ease'
                                    }}
                                    cover={
                                        <div style={{ position: 'relative', height: 160, overflow: 'hidden', background: '#000' }}>
                                            <img
                                                alt={item.title}
                                                src={item.cover}
                                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                            />
                                            {/* 选中标记 */}
                                            {selected && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: 8,
                                                    right: 8,
                                                    background: 'var(--primary-color)',
                                                    borderRadius: '50%',
                                                    width: 28,
                                                    height: 28,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                }}>
                                                    <CheckCircleOutlined style={{ fontSize: 18, color: '#fff' }} />
                                                </div>
                                            )}
                                            {/* Hover 播放图标 */}
                                            <div style={{
                                                position: 'absolute',
                                                top: 0,
                                                left: 0,
                                                width: '100%',
                                                height: '100%',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: 'rgba(0,0,0,0.3)',
                                                opacity: 0,
                                                transition: 'opacity 0.3s',
                                            }} className="hover-overlay">
                                                <PlayCircleOutlined style={{ fontSize: 36, color: '#fff' }} />
                                            </div>
                                        </div>
                                    }
                                    onClick={() => !disabled && toggleSelect(item)}
                                    bodyStyle={{ padding: 12 }}
                                >
                                    <Card.Meta
                                        title={
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <Checkbox
                                                    checked={selected}
                                                    disabled={disabled}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onChange={() => toggleSelect(item)}
                                                />
                                                <Text ellipsis={{ tooltip: item.title }} style={{ flex: 1 }}>
                                                    {item.title}
                                                </Text>
                                            </div>
                                        }
                                    />
                                </Card>
                            </List.Item>
                        )
                    }}
                />
            ) : (
                <Empty description="未能抓取到视频列表，请确认主页地址正确" />
            )}

            <style>{`
                .ant-card:hover .hover-overlay {
                    opacity: 1 !important;
                }
            `}</style>
        </Modal>
    )
}

export default ProfileVideoSelector
