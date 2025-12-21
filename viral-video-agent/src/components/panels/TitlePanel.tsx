import { Button, Space, List, Tag } from 'antd'
import { TagsOutlined, CopyOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useAppStore } from '../../store/appStore'

function TitlePanel() {
    const [loading, setLoading] = useState(false)
    const { rewrittenCopy, originalCopy, titles, hashtags, setTitles, setHashtags, setPreview } = useAppStore()

    const textContent = rewrittenCopy || originalCopy

    const handleGenerate = async () => {
        if (!textContent) return

        setLoading(true)
        try {
            await new Promise(resolve => setTimeout(resolve, 2000))

            setTitles([
                '🔥 这个方法太绝了！学会立马涨粉10万',
                '💡 99%的人都不知道的秘密技巧',
                '⚡ 震惊！原来一直都做错了',
            ])
            setHashtags(['涨粉', '干货', '技巧', '必看', '收藏'])
            setPreview('text', '✅ 标题和话题已生成！')
        } finally {
            setLoading(false)
        }
    }

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
    }

    return (
        <div>
            <p style={{ marginBottom: 16, color: '#666' }}>
                使用腾讯混元生成爆款标题和热门话题标签
            </p>

            <Space direction="vertical" style={{ width: '100%' }} size="large">
                {!textContent && (
                    <div style={{ padding: 24, background: '#fffbe6', borderRadius: 8, border: '1px solid #ffe58f' }}>
                        ⚠️ 请先完成文案提取或改写步骤
                    </div>
                )}

                <Button type="primary" icon={<TagsOutlined />} loading={loading} onClick={handleGenerate} disabled={!textContent}>
                    生成标题和话题
                </Button>

                {titles.length > 0 && (
                    <div>
                        <div style={{ marginBottom: 8, fontWeight: 500 }}>推荐标题</div>
                        <List
                            dataSource={titles}
                            renderItem={(title, index) => (
                                <List.Item
                                    actions={[
                                        <Button size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(title)}>
                                            复制
                                        </Button>
                                    ]}
                                >
                                    <span style={{ fontWeight: index === 0 ? 600 : 400 }}>{title}</span>
                                </List.Item>
                            )}
                        />
                    </div>
                )}

                {hashtags.length > 0 && (
                    <div>
                        <div style={{ marginBottom: 8, fontWeight: 500 }}>热门话题</div>
                        <Space wrap>
                            {hashtags.map((tag) => (
                                <Tag key={tag} color="blue" style={{ cursor: 'pointer' }} onClick={() => copyToClipboard(`#${tag}`)}>
                                    #{tag}
                                </Tag>
                            ))}
                        </Space>
                    </div>
                )}
            </Space>
        </div>
    )
}

export default TitlePanel
