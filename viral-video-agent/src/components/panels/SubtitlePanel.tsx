import { Button, Input, InputNumber, Space, ColorPicker, Typography, message } from 'antd'
import { FontColorsOutlined, UploadOutlined } from '@ant-design/icons'
import { useState } from 'react'
import { useAppStore } from '../../store/appStore'

interface SubtitleSegment {
    start: number
    end: number
    text: string
}

function SubtitlePanel() {
    const [fontSize, setFontSize] = useState(24)
    const [fontColor, setFontColor] = useState('#ffffff')
    const [strokeColor, setStrokeColor] = useState('#000000')
    const [bottomMargin, setBottomMargin] = useState(50)
    const [charsPerLine, setCharsPerLine] = useState(15)
    const [loading, setLoading] = useState(false)
    const [importingVideo, setImportingVideo] = useState(false)
    const [subtitleText, setSubtitleText] = useState('')

    const {
        subtitlePath,
        finalVideoPath,
        sourceVideoPath,
        digitalHumanVideoPath,
        setSubtitlePath,
        setFinalVideoPath,
        setPreview,
    } = useAppStore()

    const createSubtitleFile = async (segments: SubtitleSegment[]) => {
        if (!window.electronAPI?.generateSubtitleFile) {
            throw new Error('桌面接口未就绪')
        }
        const result = await window.electronAPI.generateSubtitleFile({ segments })
        if (!result?.success || !result.data?.subtitlePath) {
            throw new Error(result?.error || '生成字幕文件失败')
        }
        return result.data.subtitlePath
    }

    const transcribeVideo = async (videoPath: string): Promise<string> => {
        if (!window.electronAPI?.invoke) {
            throw new Error('桌面接口未就绪，无法识别视频')
        }

        const result = await window.electronAPI.invoke('transcribe-audio', videoPath)
        if (!result?.success || typeof result.data !== 'string') {
            throw new Error(result?.error || '识别失败')
        }
        return result.data
    }

    const postProcessTranscription = (text: string) => {
        let trimmed = (text || '').trim()
        if (!trimmed) return '这是自动生成的字幕'
        trimmed = trimmed.replace(/([。！？?!])/g, '$1\n')
        trimmed = trimmed.replace(/\n{2,}/g, '\n')
        return trimmed
    }

    const buildSegments = (text: string, duration: number): SubtitleSegment[] => {
        const clean = text.replace(/\s+/g, ' ').trim()
        const rawSegments = clean
            ? clean.split(/(?<=[。！？?!])/).map(line => line.trim()).filter(Boolean)
            : ['这是自动生成的字幕']

        const totalLength = rawSegments.reduce((sum, line) => sum + line.length, 0) || rawSegments.length
        const targetDuration = Math.max(duration, rawSegments.length * 1.5, 1)
        const minSegmentDuration = 0.8

        const segments: SubtitleSegment[] = []
        let cursor = 0
        rawSegments.forEach((line, index) => {
            const proportion = line.length / totalLength || 1 / rawSegments.length
            let segmentDuration = targetDuration * proportion
            segmentDuration = Math.max(segmentDuration, minSegmentDuration)
            const start = cursor
            const end = index === rawSegments.length - 1 ? targetDuration : Math.min(targetDuration, cursor + segmentDuration)
            segments.push({ start, end, text: line })
            cursor = end
        })

        // ensure last segment ends at targetDuration
        if (segments.length > 0) {
            segments[segments.length - 1].end = targetDuration
        }

        return segments
    }

    const burnSubtitlesForVideo = async (videoPath: string, text: string) => {
        const processedText = postProcessTranscription(text)
        setSubtitleText(processedText)

        let duration = 1
        if (window.electronAPI?.getVideoDuration) {
            const durationRes = await window.electronAPI.getVideoDuration(videoPath)
            if (durationRes?.success && typeof durationRes.data === 'number' && durationRes.data > 0) {
                duration = durationRes.data
            }
        }

        const segments = buildSegments(processedText, duration)
        const subtitleFile = await createSubtitleFile(segments)
        setSubtitlePath(subtitleFile)

        if (!window.electronAPI?.invoke) {
            throw new Error('桌面接口未就绪，无法烧录字幕')
        }
        const burnResult = await window.electronAPI.invoke('add-subtitles', videoPath, subtitleFile)
        if (!burnResult?.success || !burnResult.data?.videoPath) {
            throw new Error(burnResult?.error || '添加字幕失败')
        }
        return burnResult.data.videoPath
    }

    const handleGenerateSubtitle = async () => {
        const videoSource = finalVideoPath || digitalHumanVideoPath || sourceVideoPath
        if (!videoSource) {
            message.warning('请先生成或上传视频后再生成字幕')
            return null
        }
        setLoading(true)
        try {
            const text = await transcribeVideo(videoSource)
            const subtitledVideoPath = await burnSubtitlesForVideo(videoSource, text)
            setFinalVideoPath(subtitledVideoPath)
            setPreview('video', subtitledVideoPath)
            message.success('根据视频内容生成并嵌入了字幕')
            return subtitledVideoPath
        } catch (error: any) {
            message.error(error?.message || '生成字幕失败')
            return null
        } finally {
            setLoading(false)
        }
    }

    const handleImportVideo = async () => {
        if (!window.electronAPI?.invoke) {
            message.error('桌面接口未就绪，请重启应用后重试')
            return
        }
        setImportingVideo(true)
        try {
            const result = await window.electronAPI.invoke('select-video-file')
            if (!result) {
                throw new Error('未返回任何结果')
            }
            if (result.success && result.filePath) {
                setFinalVideoPath(result.filePath)
                setPreview('video', result.filePath)
                message.success('已载入本地视频，可直接继续爆款剪辑后续测试')
            } else if (!result.canceled) {
                throw new Error(result.error || '未选择视频')
            }
        } catch (error: any) {
            message.error(error?.message || '导入视频失败')
        } finally {
            setImportingVideo(false)
        }
    }

    return (
        <div>
            <p style={{ marginBottom: 16, color: '#666' }}>
                爆款剪辑台：生成字幕/花字并一键叠加到视频，支持自定义样式
            </p>

            <Space direction="vertical" style={{ width: '100%' }} size="large">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div>
                        <div style={{ marginBottom: 8 }}>字号</div>
                        <InputNumber value={fontSize} onChange={(v) => setFontSize(v || 24)} min={12} max={72} style={{ width: '100%' }} />
                    </div>
                    <div>
                        <div style={{ marginBottom: 8 }}>每行字数</div>
                        <InputNumber value={charsPerLine} onChange={(v) => setCharsPerLine(v || 15)} min={5} max={30} style={{ width: '100%' }} />
                    </div>
                    <div>
                        <div style={{ marginBottom: 8 }}>字体颜色</div>
                        <ColorPicker value={fontColor} onChange={(c) => setFontColor(c.toHexString())} />
                    </div>
                    <div>
                        <div style={{ marginBottom: 8 }}>描边颜色</div>
                        <ColorPicker value={strokeColor} onChange={(c) => setStrokeColor(c.toHexString())} />
                    </div>
                    <div>
                        <div style={{ marginBottom: 8 }}>底部距离 (px)</div>
                        <InputNumber value={bottomMargin} onChange={(v) => setBottomMargin(v || 50)} min={0} max={200} style={{ width: '100%' }} />
                    </div>
                    <div>
                        <div style={{ marginBottom: 8 }}>关键词高亮</div>
                        <Input placeholder="用逗号隔关键词" />
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ marginBottom: 4, fontWeight: 500 }}>字幕内容（可自定义）</div>
                    <Input.TextArea
                        value={subtitleText}
                        onChange={(event) => setSubtitleText(event.target.value)}
                        placeholder="默认会使用修改后的文案作为字幕，必要时可以手动调整这里的内容"
                        autoSize={{ minRows: 3, maxRows: 5 }}
                    />
                    {subtitlePath && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: subtitlePath }}>
                            当前字幕文件：{subtitlePath}
                        </Typography.Text>
                    )}
                </div>

                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                    <Button
                        icon={<UploadOutlined />}
                        onClick={handleImportVideo}
                        loading={importingVideo}
                        block
                    >
                        上传本地视频用于剪辑测试
                    </Button>
                    {finalVideoPath && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: finalVideoPath }}>
                            当前用于预览的视频：{finalVideoPath}
                        </Typography.Text>
                    )}
                </Space>

                <Space>
                    <Button type="primary" icon={<FontColorsOutlined />} loading={loading} onClick={handleGenerateSubtitle}>
                        生成字幕
                    </Button>
                </Space>
            </Space>
        </div>
    )
}

export default SubtitlePanel
