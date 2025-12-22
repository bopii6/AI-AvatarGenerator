import { useAppStore } from '../store/appStore'
import { PlayCircleOutlined, SoundOutlined, PictureOutlined, FileTextOutlined, CopyOutlined, DownloadOutlined } from '@ant-design/icons'
import { Button, Empty, Space, Tag, Typography, message } from 'antd'
import { useMemo } from 'react'

// 将本地文件路径转换为正确编码的 file:// URL
function toFileUrl(filePath: string): string {
    // 如果已经是 file:// URL，先解析出路径
    if (filePath.startsWith('file://')) {
        filePath = filePath.slice(7)
    }
    // 将反斜杠转换为正斜杠，并对每个路径段进行 URL 编码
    const normalizedPath = filePath.replace(/\\/g, '/')
    const encoded = normalizedPath
        .split('/')
        .map(segment => encodeURIComponent(segment))
        .join('/')
    return `file:///${encoded.replace(/^\/+/, '')}`
}

function PreviewPanel() {
    const {
        previewType,
        previewContent,
        batchVideos,
        videoPath,
        inputAudioPath,
        audioPath,
        coverPath,
        digitalHumanVideoPath,
        finalVideoPath,
        originalCopy,
        rewrittenCopy,
    } = useAppStore()

    const resolved = useMemo(() => {
        if (previewType && previewContent) {
            return { type: previewType as 'video' | 'audio' | 'image' | 'text', content: previewContent, label: '手动预览' }
        }
        if (finalVideoPath) return { type: 'video' as const, content: finalVideoPath, label: '最终视频' }
        if (digitalHumanVideoPath) return { type: 'video' as const, content: digitalHumanVideoPath, label: '口播数字人分身视频' }
        if (batchVideos.length > 0) return { type: 'video' as const, content: batchVideos[0].videoPath, label: `源视频（批量 ${batchVideos.length}）` }
        if (videoPath) return { type: 'video' as const, content: videoPath, label: '源视频' }
        if (inputAudioPath) return { type: 'audio' as const, content: inputAudioPath, label: '导入音频' }
        if (audioPath) return { type: 'audio' as const, content: audioPath, label: '音频' }
        if (coverPath) return { type: 'image' as const, content: coverPath, label: '封面' }
        if (rewrittenCopy || originalCopy) return { type: 'text' as const, content: rewrittenCopy || originalCopy, label: '文案' }
        return null
    }, [audioPath, batchVideos, coverPath, digitalHumanVideoPath, finalVideoPath, inputAudioPath, originalCopy, previewContent, previewType, rewrittenCopy, videoPath])

    const headerMeta = useMemo(() => {
        if (!resolved) return { icon: <PlayCircleOutlined style={{ marginRight: 8 }} />, title: '实时预览', tag: null as null | { color: string; text: string } }

        switch (resolved.type) {
            case 'video':
                return { icon: <PlayCircleOutlined style={{ marginRight: 8 }} />, title: resolved.label, tag: { color: 'blue', text: '视频' } }
            case 'audio':
                return { icon: <SoundOutlined style={{ marginRight: 8 }} />, title: resolved.label, tag: { color: 'purple', text: '音频' } }
            case 'image':
                return { icon: <PictureOutlined style={{ marginRight: 8 }} />, title: resolved.label, tag: { color: 'gold', text: '图片' } }
            case 'text':
                return { icon: <FileTextOutlined style={{ marginRight: 8 }} />, title: resolved.label, tag: { color: 'green', text: '文本' } }
        }
    }, [resolved])

    const handleCopy = async () => {
        if (!resolved) return
        try {
            await navigator.clipboard.writeText(resolved.content)
            message.success(resolved.type === 'text' ? '已复制文本' : '已复制路径')
        } catch {
            message.error('复制失败，请手动复制')
        }
    }

    const saveVideoToDesktop = async (filePath: string, fileNameHint?: string, opts?: { silent?: boolean }) => {
        const normalized = filePath.replace(/\\/g, '/')
        const rawName = normalized.split('/').pop() || 'video.mp4'
        const fileName = fileNameHint ? `${fileNameHint}-${rawName}` : rawName

        try {
            const result = await window.electronAPI?.invoke('save-to-desktop', {
                sourcePath: filePath,
                fileName,
            })
            if (result?.success) {
                if (!opts?.silent) message.success('已保存到桌面')
            } else {
                throw new Error(result?.error || '保存失败')
            }
        } catch (e: any) {
            message.error(e.message)
        }
    }

    const handleSaveToDesktop = async () => {
        if (!resolved || resolved.type !== 'video') return
        await saveVideoToDesktop(resolved.content)
    }

    const handleSaveAllToDesktop = async () => {
        if (batchVideos.length === 0) return
        const hide = message.loading(`正在保存 ${batchVideos.length} 个视频到桌面...`, 0)
        try {
            for (let i = 0; i < batchVideos.length; i++) {
                const v = batchVideos[i]
                await saveVideoToDesktop(v.videoPath, `${i + 1}`, { silent: true })
            }
            message.success('已全部保存到桌面')
        } finally {
            hide()
        }
    }

    const renderPreview = () => {
        if (!resolved) return <Empty description="暂无预览内容" />

        switch (resolved.type) {
            case 'video':
                return (
                    <video
                        src={toFileUrl(resolved.content)}
                        controls
                        style={{ width: '100%', maxHeight: 320, borderRadius: 12, background: '#000' }}
                    />
                )
            case 'audio':
                return (
                    <div style={{ width: '100%' }}>
                        <audio src={toFileUrl(resolved.content)} controls style={{ width: '100%' }} />
                    </div>
                )
            case 'image':
                return (
                    <img
                        src={toFileUrl(resolved.content)}
                        alt="预览"
                        style={{ maxWidth: '100%', maxHeight: 320, borderRadius: 12 }}
                    />
                )
            case 'text':
                return (
                    <div style={{ padding: 14, background: 'rgba(255, 255, 255, 0.04)', borderRadius: 12, border: '1px solid var(--border)', maxHeight: 320, overflow: 'auto' }}>
                        <pre style={{ whiteSpace: 'pre-wrap', margin: 0, color: 'var(--text-primary)' }}>{resolved.content}</pre>
                    </div>
                )
        }
    }

    return (
        <>
            <div className="preview-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <Space size={8}>
                    {headerMeta.icon}
                    <span>{headerMeta.title}</span>
                    {headerMeta.tag && <Tag color={headerMeta.tag.color}>{headerMeta.tag.text}</Tag>}
                </Space>
                {resolved && (
                    <Space size={8}>
                        {resolved.type === 'video' && (
                            <Button size="small" icon={<DownloadOutlined />} onClick={handleSaveToDesktop}>
                                下载到桌面
                            </Button>
                        )}
                        <Button size="small" icon={<CopyOutlined />} onClick={handleCopy}>
                            {resolved.type === 'text' ? '复制' : '复制路径'}
                        </Button>
                    </Space>
                )}
            </div>
            <div className="preview-content" style={{ padding: 12, flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', gap: 10 }}>
                {resolved?.type === 'video' && batchVideos.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                批量视频（{batchVideos.length}）
                            </Typography.Text>
                            {batchVideos.length > 1 && (
                                <Button size="small" icon={<DownloadOutlined />} onClick={handleSaveAllToDesktop}>
                                    全部保存到桌面
                                </Button>
                            )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 560, overflow: 'auto' }}>
                            {batchVideos.map((v, i) => (
                                <div key={`${v.videoPath}-${i}`} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 10, background: 'rgba(255, 255, 255, 0.03)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                                        <Typography.Text style={{ color: 'var(--text-primary)' }} ellipsis>
                                            {i + 1}. {v.title || '视频'}
                                        </Typography.Text>
                                        <Space size={6}>
                                            <Button size="small" icon={<DownloadOutlined />} onClick={() => saveVideoToDesktop(v.videoPath, `${i + 1}`)}>
                                                保存到桌面
                                            </Button>
                                            <Button
                                                size="small"
                                                icon={<CopyOutlined />}
                                                onClick={async () => {
                                                    await navigator.clipboard.writeText(v.videoPath)
                                                    message.success('已复制路径')
                                                }}
                                            >
                                                复制路径
                                            </Button>
                                        </Space>
                                    </div>
                                    <video src={toFileUrl(v.videoPath)} controls style={{ width: '100%', maxHeight: 180, borderRadius: 10, background: '#000' }} />
                                    <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                                        {v.videoPath}
                                    </Typography.Text>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {!(resolved?.type === 'video' && batchVideos.length > 0) && (
                    <>
                        {renderPreview()}
                        {resolved && resolved.type !== 'text' && (
                            <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                                {resolved.content}
                            </Typography.Text>
                        )}
                    </>
                )}
            </div>
        </>
    )
}

export default PreviewPanel
