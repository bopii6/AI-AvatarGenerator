import { Button, Slider, Space, Upload, List } from 'antd'
import { CustomerServiceOutlined, UploadOutlined, ReloadOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useAppStore } from '../../store/appStore'

const bgmList = [
    { id: '1', name: '轻快节奏 - 活力', duration: '2:30' },
    { id: '2', name: '舒缓钢琴 - 治愈', duration: '3:15' },
    { id: '3', name: '电子律动 - 科技', duration: '2:45' },
    { id: '4', name: '古风旋律 - 国潮', duration: '3:00' },
]

function BgmPanel() {
    const [volume, setVolume] = useState(20)
    const [selectedBgm, setSelectedBgm] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const { setFinalVideoPath, setPreview } = useAppStore()

    const handleAddBgm = async () => {
        if (!selectedBgm) return

        setLoading(true)
        try {
            await new Promise(resolve => setTimeout(resolve, 3000))
            setFinalVideoPath('./output/final_with_bgm.mp4')
            setPreview('text', '✅ BGM已添加到视频！')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div>
            <p style={{ marginBottom: 16, color: '#666' }}>
                添加背景音乐，支持自定义音量调节
            </p>

            <Space direction="vertical" style={{ width: '100%' }} size="large">
                <div>
                    <div style={{ marginBottom: 8, fontWeight: 500 }}>BGM 音量 ({volume}%)</div>
                    <Slider value={volume} onChange={setVolume} min={0} max={100} marks={{ 0: '0%', 30: '推荐', 100: '100%' }} />
                </div>

                <div>
                    <div style={{ marginBottom: 8, fontWeight: 500, display: 'flex', justifyContent: 'space-between' }}>
                        <span>选择背景音乐</span>
                        <Button size="small" icon={<ReloadOutlined />}>随机推荐</Button>
                    </div>
                    <List
                        dataSource={bgmList}
                        renderItem={(item) => (
                            <List.Item
                                style={{
                                    cursor: 'pointer',
                                    background: selectedBgm === item.id ? '#e6f7ff' : 'transparent',
                                    padding: '8px 12px',
                                    borderRadius: 4,
                                }}
                                onClick={() => setSelectedBgm(item.id)}
                            >
                                <List.Item.Meta
                                    avatar={<CustomerServiceOutlined />}
                                    title={item.name}
                                    description={item.duration}
                                />
                            </List.Item>
                        )}
                    />
                </div>

                <Upload>
                    <Button icon={<UploadOutlined />}>上传自定义BGM</Button>
                </Upload>

                <Button type="primary" icon={<CustomerServiceOutlined />} loading={loading} onClick={handleAddBgm} disabled={!selectedBgm}>
                    添加背景音乐
                </Button>
            </Space>
        </div>
    )
}

export default BgmPanel
