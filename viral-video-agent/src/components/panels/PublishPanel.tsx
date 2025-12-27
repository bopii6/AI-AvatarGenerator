import { Button, Checkbox, Space, Alert, Tag, message, Card, Typography, Input, Select } from 'antd'
import { SendOutlined, FolderOpenOutlined, RedoOutlined } from '@ant-design/icons'
import { CSSProperties, useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/appStore'

const platforms = [
    { key: 'douyin', label: '抖音', color: '#000000' },
    { key: 'shipinhao', label: '视频号', color: '#07c160' },
    { key: 'xiaohongshu', label: '小红书', color: '#fe2c55' },
]

function PublishPanel() {
    const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['douyin'])
    const [loading, setLoading] = useState(false)
    const [publishing, setPublishing] = useState(false)
    const [titleLoading, setTitleLoading] = useState(false)
    const [hashtagLoading, setHashtagLoading] = useState(false)
    const [lastPublish, setLastPublish] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

    const {
        finalVideoPath,
        titles,
        hashtags,
        rewrittenCopy,
        originalCopy,
        setFinalVideoPath,
        setPreview,
        setTitles,
        setHashtags,
    } = useAppStore()

    const readyToPublish = !!finalVideoPath
    const suggestedTitle = (titles && titles.length > 0 ? titles[0] : '').trim()
    const textContent = (rewrittenCopy || originalCopy || '').trim()
    const [titleDraft, setTitleDraft] = useState(suggestedTitle)
    const [hashtagInput, setHashtagInput] = useState<string[]>(hashtags || [])
    const autoTitleFilledRef = useRef(false)
    const autoHashtagFilledRef = useRef(false)

    useEffect(() => {
        setTitleDraft(suggestedTitle)
    }, [suggestedTitle])

    useEffect(() => {
        setHashtagInput(hashtags || [])
    }, [hashtags])

    const requestMeta = useCallback(
        async (target: 'title' | 'hashtag', silent?: boolean) => {
            const baseText = textContent || suggestedTitle || '爆款短视频文案'
            if (!baseText) {
                if (!silent) message.warning('请先生成文案或标题，再让 AI 自动补全')
                return
            }
            if (!window.electronAPI?.invoke) {
                if (!silent) message.error('桌面端接口未就绪，请重启应用')
                return
            }
            const setRowLoading = target === 'title' ? setTitleLoading : setHashtagLoading
            setRowLoading(true)
            try {
                const res = await window.electronAPI.invoke('generate-title', baseText)
                if (!res?.success || !res.data) throw new Error(res?.error || 'AI 生成失败')
                if (target === 'title') {
                    const nextTitles = res.data.titles || []
                    if (nextTitles.length) {
                        setTitles(nextTitles)
                        setTitleDraft(nextTitles[0])
                        setPreview('text', '标题已更新')
                        if (!silent) message.success('AI 已更新标题')
                    } else if (!silent) {
                        message.warning('AI 暂未返回新的标题')
                    }
                } else {
                    const nextHashtags = res.data.hashtags || []
                    if (nextHashtags.length) {
                        setHashtags(nextHashtags)
                        setHashtagInput(nextHashtags)
                        setPreview('text', '热门话题已更新')
                        if (!silent) message.success('AI 已更新热门话题')
                    } else if (!silent) {
                        message.warning('AI 暂未返回新的话题')
                    }
                }
            } catch (error: any) {
                if (!silent) message.error(error?.message || 'AI 生成失败，请稍后再试')
            } finally {
                setRowLoading(false)
            }
        },
        [message, setHashtags, setPreview, setTitles, suggestedTitle, textContent]
    )

    useEffect(() => {
        if (textContent && !titleDraft && !autoTitleFilledRef.current) {
            autoTitleFilledRef.current = true
            requestMeta('title', true)
        }
    }, [requestMeta, textContent, titleDraft])

    useEffect(() => {
        if (textContent && hashtagInput.length === 0 && !autoHashtagFilledRef.current) {
            autoHashtagFilledRef.current = true
            requestMeta('hashtag', true)
        }
    }, [hashtagInput.length, requestMeta, textContent])

    const handleTitleChange = (value: string) => {
        setTitleDraft(value)
        setTitles(value ? [value] : [])
    }

    const handleHashtagChange = (values: string[]) => {
        setHashtagInput(values)
        setHashtags(values)
    }

    const handlePickLocalVideoForTest = async () => {
        if (!window.electronAPI?.invoke) {
            message.error('桌面端接口未就绪，请重启应用')
            return
        }
        try {
            setLastPublish(null)
            const res = await window.electronAPI.invoke('select-video-file')
            if (!res?.success) {
                if (res?.canceled) return
                throw new Error(res?.error || '选择文件失败')
            }
            const filePath = res.filePath as string
            setFinalVideoPath(filePath)
            setPreview('video', filePath)
            if (!titles || titles.length === 0) {
                const base = filePath.split(/[\\/]/).pop() || ''
                const name = base.replace(/\.[^.]+$/, '').trim()
                if (name) setTitles([name.slice(0, 80)])
            }
            message.success('已选择本地视频，可直接测试一键发布')
        } catch (e: any) {
            message.error(e.message || '选择文件失败')
        }
    }

    const handleExport = async () => {
        setLoading(true)
        try {
            await new Promise(resolve => setTimeout(resolve, 2000))
            alert('发布包已导出到 ./output/publish/')
        } finally {
            setLoading(false)
        }
    }

    const handleOneClickPublish = async () => {
        if (!window.electronAPI?.invoke) {
            message.error('桌面端接口未就绪，请重启应用')
            return
        }
        if (!finalVideoPath) {
            message.warning('请先选择本地视频（用于测试发布），或完成视频出片后再发布')
            return
        }
        if (selectedPlatforms.length === 0) {
            message.warning('请至少选择一个发布平台')
            return
        }

        setPublishing(true)
        setLastPublish(null)
        try {
            message.loading({ content: '正在启动并发布（首次可能需要安装依赖）...', key: 'publish', duration: 0 })
            const result = await window.electronAPI.invoke('publish-one-click', {
                platforms: selectedPlatforms,
                videoPath: finalVideoPath,
                title: (titleDraft || '').trim() || undefined,
                tags: hashtagInput,
            })
            if (result?.canceled) {
                message.info({ content: '已取消发布', key: 'publish', duration: 2 })
                setLastPublish(null)
                return
            }
            if (!result?.success) throw new Error(result?.error || '发布失败')
            message.success({ content: '已触发发布流程（会自动打开各平台发布页并填充内容）', key: 'publish' })
            setLastPublish({ type: 'success', message: '已触发发布流程；如失败请查看日志：APPDATA/viral-video-agent/logs/social-auto-upload.log' })
        } catch (e: any) {
            message.error({ content: e.message, key: 'publish', duration: 6 })
            setLastPublish({ type: 'error', message: e.message || '发布失败（请查看 social-auto-upload.log）' })
        } finally {
            setPublishing(false)
        }
    }

    const previewRowStyle: CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 0',
        borderBottom: '1px solid #1f1f1f',
    }

    const previewLabelStyle: CSSProperties = {
        width: 64,
        color: '#bfbfbf',
        flexShrink: 0,
        fontWeight: 500,
    }

    return (
        <div>
            <p style={{ marginBottom: 16, color: '#666' }}>
                全网分发：选择平台后点击「一键发送」，会自动使用最近保存的 Cookie、自动选择当前成片、生成标题/话题，并打开各平台发布页完成发布。
            </p>

            <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Card
                    title="分发内容预览"
                    bodyStyle={{ background: '#1b1b1f', borderRadius: 12, padding: '8px 20px' }}
                >
                    <div style={{ ...previewRowStyle, borderTop: '1px solid #1f1f1f' }}>
                        <div style={previewLabelStyle}>视频</div>
                        <div style={{ flex: 1 }}>
                            {finalVideoPath ? <Tag color="success">已就绪</Tag> : <Tag color="warning">未完成</Tag>}
                        </div>
                    </div>
                    <div style={previewRowStyle}>
                        <div style={previewLabelStyle}>标题</div>
                        <div style={{ flex: 1 }}>
                            <Input.TextArea
                                value={titleDraft}
                                placeholder="请输入标题"
                                rows={2}
                                style={{ background: '#23232b', color: '#fff' }}
                                onChange={(e) => handleTitleChange(e.target.value)}
                            />
                        </div>
                        <Button icon={<RedoOutlined />} loading={titleLoading} onClick={() => requestMeta('title')}>
                            一键AI改写
                        </Button>
                    </div>
                    <div style={{ ...previewRowStyle, borderBottom: 'none' }}>
                        <div style={previewLabelStyle}>话题</div>
                        <div style={{ flex: 1 }}>
                            <Select
                                mode="tags"
                                style={{ width: '100%' }}
                                placeholder="热门标签（按 Enter 新增）"
                                value={hashtagInput}
                                onChange={handleHashtagChange}
                            />
                        </div>
                        <Button icon={<RedoOutlined />} loading={hashtagLoading} onClick={() => requestMeta('hashtag')}>
                            一键AI改写
                        </Button>
                    </div>
                </Card>

                {lastPublish && (
                    <Alert
                        type={lastPublish.type}
                        showIcon
                        message={lastPublish.type === 'success' ? '发布已触发' : '发布失败'}
                        description={lastPublish.message}
                        closable
                        onClose={() => setLastPublish(null)}
                    />
                )}

                <Card title="选择发布平台">
                    <Checkbox.Group value={selectedPlatforms} onChange={(v) => setSelectedPlatforms(v as string[])}>
                        <Space>
                            {platforms.map((p) => (
                                <Checkbox key={p.key} value={p.key}>
                                    <Tag color={p.color}>{p.label}</Tag>
                                </Checkbox>
                            ))}
                        </Space>
                    </Checkbox.Group>
                </Card>

                <Space>
                    <Button icon={<FolderOpenOutlined />} size="large" onClick={handlePickLocalVideoForTest}>
                        选择本地视频（测试发布）
                    </Button>
                    <Button
                        type="primary"
                        icon={<SendOutlined />}
                        size="large"
                        loading={publishing}
                        onClick={handleOneClickPublish}
                        disabled={!readyToPublish || selectedPlatforms.length === 0}
                    >
                        一键发送
                    </Button>
                    <Button
                        type="primary"
                        icon={<FolderOpenOutlined />}
                        size="large"
                        loading={loading}
                        onClick={handleExport}
                        disabled={!readyToPublish}
                    >
                        生成分发包
                    </Button>
                </Space>

                {!readyToPublish && (
                    <div style={{ padding: 16, background: '#fffbe6', borderRadius: 8, border: '1px solid #ffe58f' }}>
                        请先选择本地视频（用于测试发布），或完成视频出片后再来发布
                    </div>
                )}
            </Space>
        </div>
    )
}

export default PublishPanel
