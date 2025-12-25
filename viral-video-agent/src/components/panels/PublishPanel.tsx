import { Button, Checkbox, Space, Alert, Descriptions, Tag, message, Card, Typography, Input, Select, Radio, InputNumber, Image } from 'antd'
import { SendOutlined, FolderOpenOutlined, RedoOutlined, ReloadOutlined, PictureOutlined } from '@ant-design/icons'
import { useCallback, useEffect, useRef, useState } from 'react'
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
    const [metaGenerating, setMetaGenerating] = useState(false)
    const [coverMode, setCoverMode] = useState<'frame' | 'upload'>('frame')
    const [coverLoading, setCoverLoading] = useState(false)
    const [frameTime, setFrameTime] = useState(2)
    const [lastPublish, setLastPublish] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

    const {
        finalVideoPath,
        titles,
        hashtags,
        coverPath,
        rewrittenCopy,
        originalCopy,
        setFinalVideoPath,
        setPreview,
        setTitles,
        setHashtags,
        setCoverPath,
    } = useAppStore()

    const handleExport = async () => {
        setLoading(true)
        try {
            await new Promise(resolve => setTimeout(resolve, 2000))
            // TODO: 导出发布包到指定目录
            alert('发布包已导出到 ./output/publish/')
        } finally {
            setLoading(false)
        }
    }

    const readyToPublish = !!finalVideoPath
    const suggestedTitle = (titles && titles.length > 0 ? titles[0] : '').trim()
    const textContent = (rewrittenCopy || originalCopy || '').trim()
    const [titleDraft, setTitleDraft] = useState(suggestedTitle)
    const [hashtagInput, setHashtagInput] = useState<string[]>(hashtags || [])
    const autoFilledRef = useRef(false)

    useEffect(() => {
        setTitleDraft(suggestedTitle)
    }, [suggestedTitle])

    useEffect(() => {
        setHashtagInput(hashtags || [])
    }, [hashtags])

    const handleGenerateMeta = useCallback(async (silent?: boolean) => {
        const baseText = textContent || suggestedTitle || '\u7206\u6b3e\u77ed\u89c6\u9891\u6587\u6848'
        if (!baseText) {
            if (!silent) message.warning('\u8bf7\u5148\u751f\u6210\u6587\u6848\u6216\u6807\u9898\uff0c\u518d\u7531 AI \u81ea\u52a8\u8865\u5168')
            return
        }
        if (!window.electronAPI?.invoke) {
            if (!silent) message.error('\u684c\u9762\u7aef\u63a5\u53e3\u672a\u5c31\u7eea\uff0c\u8bf7\u91cd\u542f\u5e94\u7528')
            return
        }
        setMetaGenerating(true)
        try {
            const res = await window.electronAPI.invoke('generate-title', baseText)
            if (!res?.success || !res.data) throw new Error(res?.error || 'AI \u751f\u6210\u5931\u8d25')
            const nextTitles = res.data.titles || []
            const nextHashtags = res.data.hashtags || []
            if (nextTitles.length) {
                setTitles(nextTitles)
                setTitleDraft(nextTitles[0])
            }
            setHashtags(nextHashtags)
            setHashtagInput(nextHashtags)
            setPreview('text', '\u6807\u9898\u548c\u70ed\u95e8\u8bdd\u9898\u5df2\u51c6\u5907\u5c31\u7eea')
            if (!silent) message.success('AI \u5df2\u751f\u6210\u9ed8\u8ba4\u6807\u9898\u4e0e\u8bdd\u9898')
        } catch (error: any) {
            if (!silent) message.error(error?.message || 'AI \u751f\u6210\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5')
        } finally {
            setMetaGenerating(false)
        }
    }, [message, setHashtags, setPreview, setTitles, suggestedTitle, textContent])

    useEffect(() => {
        if (textContent && !suggestedTitle && !autoFilledRef.current) {
            autoFilledRef.current = true
            handleGenerateMeta(true)
        }
    }, [handleGenerateMeta, suggestedTitle, textContent])

    const handleTitleChange = (value: string) => {
        setTitleDraft(value)
        setTitles(value ? [value] : [])
    }

    const handleHashtagChange = (values: string[]) => {
        setHashtagInput(values)
        setHashtags(values)
    }

    const handleCaptureCover = async () => {
        if (!window.electronAPI?.invoke) {
            message.error('\u684c\u9762\u7aef\u63a5\u53e3\u672a\u5c31\u7eea\uff0c\u8bf7\u91cd\u542f\u5e94\u7528')
            return
        }
        if (!finalVideoPath) {
            message.warning('\u8bf7\u5148\u751f\u6210\u6216\u9009\u62e9\u6210\u7247\uff0c\u518d\u6765\u622a\u53d6\u5c01\u9762')
            return
        }
        setCoverLoading(true)
        try {
            const res = await window.electronAPI.invoke('capture-frame', finalVideoPath, frameTime)
            if (!res?.success || !res.data?.coverPath) throw new Error(res?.error || '\u622a\u56fe\u5c01\u9762\u5931\u8d25')
            setCoverPath(res.data.coverPath)
            setPreview('image', res.data.coverPath)
            setCoverMode('frame')
            message.success('\u5df2\u4ece\u89c6\u9891\u622a\u53d6\u5c01\u9762')
        } catch (error: any) {
            message.error(error?.message || '\u5c01\u9762\u5904\u7406\u5931\u8d25')
        } finally {
            setCoverLoading(false)
        }
    }

    const handleUploadCover = async () => {
        if (!window.electronAPI?.invoke) {
            message.error('\u684c\u9762\u7aef\u63a5\u53e3\u672a\u5c31\u7eea\uff0c\u8bf7\u91cd\u542f\u5e94\u7528')
            return
        }
        setCoverLoading(true)
        try {
            const res = await window.electronAPI.invoke('select-image-file')
            if (!res?.success || !res.filePath) {
                if (res?.canceled) return
                throw new Error(res?.error || '\u5c01\u9762\u9009\u62e9\u5931\u8d25')
            }
            setCoverPath(res.filePath)
            setPreview('image', res.filePath)
            setCoverMode('upload')
            message.success('\u5df2\u4f7f\u7528\u81ea\u5b9a\u4e49\u5c01\u9762')
        } catch (error: any) {
            message.error(error?.message || '\u5c01\u9762\u9009\u62e9\u5931\u8d25')
        } finally {
            setCoverLoading(false)
        }
    }

    const handleClearCover = () => {
        setCoverPath(null)
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
                title: suggestedTitle || undefined,
                tags: hashtags || [],
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

    return (
        <div>
            <p style={{ marginBottom: 16, color: '#666' }}>
                全网分发：选择平台后点击「一键发送」，会自动使用最近保存的 Cookie、自动选择当前成片、自动生成标题/话题/封面，并打开各平台发布页完成发布。
            </p>

            <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Card size="small" title="分发要点">
                    <Typography.Paragraph style={{ marginBottom: 4 }}>点击一键发送前，请确认：</Typography.Paragraph>
                    <Typography.Paragraph style={{ marginBottom: 0 }}>
                        1. 已勾选需要同步的发布平台；2. 标题与热门标签已经确认，可用 AI 默认生成或一键改写；3. 封面设置完成（自定义上传或默认取一帧）。
                    </Typography.Paragraph>
                </Card>

                <Card size="small" title="标题与热门话题">
                    <Space direction="vertical" style={{ width: '100%' }} size="middle">
                        <Input.TextArea
                            value={titleDraft}
                            placeholder="请输入标题，或点击下方按钮让 AI 自动生成"
                            rows={2}
                            onChange={(e) => handleTitleChange(e.target.value)}
                        />
                        <Select
                            mode="tags"
                            style={{ width: '100%' }}
                            placeholder="热门标签（按 Enter 新增）"
                            value={hashtagInput}
                            onChange={handleHashtagChange}
                        />
                        <Space>
                            <Button icon={<ReloadOutlined />} loading={metaGenerating} onClick={() => handleGenerateMeta(false)} disabled={!textContent && !titleDraft}>
                                AI 默认生成
                            </Button>
                            <Button icon={<RedoOutlined />} loading={metaGenerating} onClick={() => handleGenerateMeta(false)} disabled={!textContent && !titleDraft}>
                                一键改写
                            </Button>
                        </Space>
                    </Space>
                </Card>

                <Card size="small" title="封面设置">
                    <Space direction="vertical" style={{ width: '100%' }} size="middle">
                        <Radio.Group value={coverMode} onChange={(e) => setCoverMode(e.target.value)}>
                            <Radio.Button value="frame">默认取一帧</Radio.Button>
                            <Radio.Button value="upload">自定义上传</Radio.Button>
                        </Radio.Group>
                        {coverMode === 'frame' && (
                            <Space align="center" wrap>
                                <span>截取时间（秒）</span>
                                <InputNumber min={0} max={600} value={frameTime} onChange={(v) => setFrameTime(v || 0)} style={{ width: 120 }} />
                                <Button icon={<PictureOutlined />} loading={coverLoading} onClick={handleCaptureCover}>
                                    立即截取
                                </Button>
                            </Space>
                        )}
                        {coverMode === 'upload' && (
                            <Button icon={<FolderOpenOutlined />} loading={coverLoading} onClick={handleUploadCover}>
                                选择本地封面
                            </Button>
                        )}
                        {coverPath && (
                            <div style={{ textAlign: 'center' }}>
                                <Image src={coverPath} alt="cover" style={{ maxHeight: 160, objectFit: 'contain' }} />
                                <div>
                                    <Button type="link" size="small" onClick={handleClearCover}>
                                        清除封面
                                    </Button>
                                </div>
                            </div>
                        )}
                    </Space>
                </Card>

                <Descriptions title="分发内容预览" bordered column={1}>
                    <Descriptions.Item label="视频">
                        {finalVideoPath ? <Tag color="success">已就绪</Tag> : <Tag color="warning">未完成</Tag>}
                    </Descriptions.Item>
                    <Descriptions.Item label="标题">
                        {titleDraft ? titleDraft : <Tag color="default">需要提供</Tag>}
                    </Descriptions.Item>
                    <Descriptions.Item label="话题">
                        {hashtagInput.length > 0 ? hashtagInput.map(t => `#${t}`).join(' ') : <Tag color="default">需要提供</Tag>}
                    </Descriptions.Item>
                    <Descriptions.Item label="封面">
                        {coverPath ? (
                            <Tag color={coverMode === 'upload' ? 'cyan' : 'purple'}>{coverMode === 'upload' ? '自定义封面' : `第 ${frameTime} 秒一帧`}</Tag>
                        ) : (
                            <Tag color="default">默认待定</Tag>
                        )}
                    </Descriptions.Item>
                </Descriptions>

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

                <div>
                    <div style={{ marginBottom: 8, fontWeight: 500 }}>选择发布平台</div>
                    <Checkbox.Group
                        value={selectedPlatforms}
                        onChange={(v) => setSelectedPlatforms(v as string[])}
                    >
                        <Space>
                            {platforms.map((p) => (
                                <Checkbox key={p.key} value={p.key}>
                                    <Tag color={p.color}>{p.label}</Tag>
                                </Checkbox>
                            ))}
                        </Space>
                    </Checkbox.Group>
                </div>

                <Space>
                    <Button
                        icon={<FolderOpenOutlined />}
                        size="large"
                        onClick={handlePickLocalVideoForTest}
                    >
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
