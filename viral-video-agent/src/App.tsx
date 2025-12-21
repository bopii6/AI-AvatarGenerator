import { useEffect, useState } from 'react'
import { Input, Button, message, Modal, Spin, Tabs, Card, Space, Typography } from 'antd'
import {
    RocketOutlined,
    DownloadOutlined,
    FileTextOutlined,
    SoundOutlined,
    UserOutlined,
    SettingOutlined,
} from '@ant-design/icons'
import { useAppStore } from './store/appStore'
import CookieSettings from './components/CookieSettings'
import VoiceCloneSettings from './components/VoiceCloneSettings'
import ServerSettings from './components/ServerSettings'
import ProfileVideoSelector from './components/ProfileVideoSelector'

// 步骤面板组件
import CopywritingPanel from './components/panels/CopywritingPanel'
import RewritePanel from './components/panels/RewritePanel'
import AudioPanel from './components/panels/AudioPanel'
import DigitalHumanPanel from './components/panels/DigitalHumanPanel'
import SubtitlePanel from './components/panels/SubtitlePanel'
import CoverPanel from './components/panels/CoverPanel'
import TitlePanel from './components/panels/TitlePanel'
import PublishPanel from './components/panels/PublishPanel'
import PreviewPanel from './components/PreviewPanel'

function App() {
    const [oneClickReady, setOneClickReady] = useState(false)
    const [isTracking, setIsTracking] = useState(false)
    const [serviceStatus] = useState<'ready' | 'busy' | 'warn'>('ready')
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [activeKey, setActiveKey] = useState<string>('material')
    const [parseMode, setParseMode] = useState<'single' | 'profile' | null>(null)
    const [profileModalOpen, setProfileModalOpen] = useState(false)
    const [profileLoading, setProfileLoading] = useState(false)
    const [profileVideos, setProfileVideos] = useState<any[]>([])
    // 预留：云端服务状态可接后端心跳，这里先写死为 ready

    const {
        isRunning,
        douyinUrl,
        setDouyinUrl,
        startPipeline,
        stopPipeline,
        setVideoPath,
        setPreview,
        setOriginalCopy,
        setRewrittenCopy,
        setInputAudioPath,
        setFinalVideoPath,
        setCoverPath,
        setTitles,
        setHashtags,
        videoPath,
        inputAudioPath,
        originalCopy,
        rewrittenCopy,
        audioPath,
        digitalHumanVideoPath,
        subtitlePath,
        finalVideoPath,
        coverPath,
        titles,
    } = useAppStore()

    useEffect(() => {
        let cancelled = false
        const checkReady = async () => {
            try {
                const [avatarsRes, voicesRes] = await Promise.all([
                    window.electronAPI?.invoke('cloud-gpu-get-avatars'),
                    window.electronAPI?.invoke('cloud-voice-list-models'),
                ])

                const hasAvatars = !!(avatarsRes?.success && Array.isArray(avatarsRes.data) && avatarsRes.data.length > 0)
                const hasVoiceModels = !!(voicesRes?.success && Array.isArray(voicesRes.data) && voicesRes.data.some((m: any) => m?.status === 'ready'))

                if (!cancelled) setOneClickReady(hasAvatars && hasVoiceModels)
            } catch {
                if (!cancelled) setOneClickReady(false)
            }
        }

        checkReady()

        // 轮询：避免用户在当前页创建分身后，按钮状态不刷新
        const timer = setInterval(() => {
            if (!cancelled) checkReady()
        }, 3000)

        return () => {
            cancelled = true
            clearInterval(timer)
        }
    }, [])

    const handleDownloadSingle = async (overrideUrl?: string) => {
        const targetUrl = overrideUrl || douyinUrl
        if (!targetUrl) {
            message.warning('请输入抖音分享链接')
            return
        }

        setIsTracking(true)
        const hide = message.loading('正在提取视频内容...', 0)
        try {
            const result = await window.electronAPI?.invoke('download-video', targetUrl)
            if (result?.success && result.data?.videoPath) {
                setVideoPath(result.data.videoPath)
                setFinalVideoPath(result.data.videoPath)
                setPreview('video', result.data.videoPath)
                message.success(`抓取完成：${result.data.title || '抖音视频'}`)
                setActiveKey('copywriting')
            } else {
                throw new Error(result?.error || '解析失败')
            }
        } catch (e: any) {
            message.error(e.message)
        } finally {
            hide()
            setIsTracking(false)
        }
    }

    const handleFetchProfile = async () => {
        if (!douyinUrl) {
            message.warning('请输入博主主页链接')
            return
        }

        setIsTracking(true)
        const hide = message.loading('正在抓取主页...', 0)
        try {
            setProfileModalOpen(true)
            setProfileLoading(true)
            const listRes = await window.electronAPI?.invoke('douyin-fetch-profile-videos', douyinUrl)
            if (listRes?.success) {
                setProfileVideos(listRes.data)
            } else {
                message.error(listRes.error || '抓取主页视频失败')
                setProfileModalOpen(false)
            }
        } catch (e: any) {
            message.error('请求失败')
            setProfileModalOpen(false)
        } finally {
            hide()
            setProfileLoading(false)
            setIsTracking(false)
        }
    }

    const handleBatchVideoSelect = async (videos: any[]) => {
        setProfileModalOpen(false)

        if (videos.length === 0) return

        // 批量下载并提取文案
        setIsTracking(true)

        // 初始化预览区
        setPreview('text', `🔍 正在批量解析 ${videos.length} 个视频...\n\n请耐心等待，每个视频间隔约 5-8 秒以确保安全`)

        try {
            const allCopies: { title: string; copy: string }[] = []

            for (let i = 0; i < videos.length; i++) {
                const video = videos[i]
                const videoTitle = video.title || `视频 ${i + 1}`

                // 更新预览区显示当前进度
                const progressText = `🔍 正在解析第 ${i + 1}/${videos.length} 个视频...\n\n📹 ${videoTitle}\n\n` +
                    (allCopies.length > 0 ?
                        `---\n\n✅ 已完成:\n${allCopies.map((c, idx) => `\n【视频 ${idx + 1}】${c.title}\n${c.copy.substring(0, 100)}...`).join('\n')}`
                        : '')
                setPreview('text', progressText)

                // 下载单个视频
                const result = await window.electronAPI?.invoke('download-video', video.url)
                if (result?.success && result.data?.videoPath) {
                    // 设置视频路径到状态
                    if (i === 0) {
                        setVideoPath(result.data.videoPath)
                    }

                    // 提取文案
                    const asrResult = await window.electronAPI?.invoke('transcribe-audio', result.data.videoPath)
                    if (asrResult?.success && asrResult.data) {
                        allCopies.push({ title: videoTitle, copy: asrResult.data })

                        // 渐进式更新预览区 - 每解析完一个就展示
                        const completedText = `✅ 已解析 ${allCopies.length}/${videos.length} 个视频\n\n` +
                            allCopies.map((c, idx) =>
                                `━━━━━━━━━━━━━━━━━━━━━━\n📹 【视频 ${idx + 1}】\n${c.title}\n━━━━━━━━━━━━━━━━━━━━━━\n\n${c.copy}`
                            ).join('\n\n') +
                            (i < videos.length - 1 ? `\n\n⏳ 正在解析下一个...` : '')
                        setPreview('text', completedText)
                    }
                }

                // 随机延迟 5-8 秒避免反爬（更安全）
                if (i < videos.length - 1) {
                    const delay = 5000 + Math.random() * 3000 // 5-8秒随机
                    await new Promise(resolve => setTimeout(resolve, delay))
                }
            }

            if (allCopies.length > 0) {
                // 保存所有文案到状态
                const combinedCopy = allCopies.map((c, i) => `【视频${i + 1}】${c.title}\n${c.copy}`).join('\n\n---\n\n')
                setOriginalCopy(combinedCopy)

                // 最终展示 - 不自动跳转，让用户确认
                const finalText = `🎉 批量解析完成！共提取 ${allCopies.length} 个视频的文案\n\n` +
                    allCopies.map((c, idx) =>
                        `━━━━━━━━━━━━━━━━━━━━━━\n📹 【视频 ${idx + 1}】\n${c.title}\n━━━━━━━━━━━━━━━━━━━━━━\n\n${c.copy}`
                    ).join('\n\n') +
                    `\n\n━━━━━━━━━━━━━━━━━━━━━━\n\n✅ 解析完成！请查看以上文案\n👉 确认无误后，点击左侧【变原创】进入下一步`
                setPreview('text', finalText)
                message.success(`批量解析完成！共提取 ${allCopies.length} 个视频的文案`)

                // 不自动跳转，让用户自己决定
                // setActiveKey('rewrite') -- 移除自动跳转
            } else {
                message.warning('未能提取到任何文案')
                setPreview('text', '❌ 未能提取到任何文案，请检查视频链接是否有效')
            }
        } catch (e: any) {
            message.error(`批量解析失败: ${e.message}`)
            setPreview('text', `❌ 批量解析失败: ${e.message}`)
        } finally {
            setIsTracking(false)
        }
    }

    const handleOneClickRun = async () => {
        if (!douyinUrl) {
            message.warning('请输入抖音分享链接')
            return
        }
        if (!oneClickReady) {
            message.warning('请先完成「口播数字人分身」与「声音克隆」配置，再开启全自动一键追爆')
            setActiveKey('digitalHuman')
            return
        }

        startPipeline(douyinUrl)

        try {
            const result = await window.electronAPI?.invoke('run-pipeline', { douyinUrl })

            if (result?.success) {
                const data = result.data
                // 更新所有状态
                setOriginalCopy(data.originalCopy)
                setRewrittenCopy(data.rewrittenCopy)
                setFinalVideoPath(data.videoPath)
                setCoverPath(data.coverPath)
                setTitles(data.titles)
                setHashtags(data.hashtags)

                message.success('全自动流程完成！')
                setActiveKey('publish')
            } else {
                throw new Error(result?.error || '未知错误')
            }
        } catch (e: any) {
            message.error('流程失败: ' + e.message)
        } finally {
            stopPipeline()
        }
    }

    const renderStatusText = () => {
        switch (serviceStatus) {
            case 'busy': return '云引擎 · 调度中'
            case 'warn': return '云引擎 · 请稍后'
            default: return '云引擎 · 就绪'
        }
    }

    const handleImportVideo = async () => {
        try {
            const result = await window.electronAPI?.invoke('select-video-file')
            if (result?.success && result.filePath) {
                setVideoPath(result.filePath)
                setFinalVideoPath(result.filePath)
                setPreview('video', result.filePath)
                message.success('已导入本地视频')
                setActiveKey('copywriting')
            } else if (!result?.canceled) {
                throw new Error(result?.error || '未选择视频')
            }
        } catch (e: any) {
            message.error(e.message || '导入视频失败')
        }
    }

    const handleImportAudio = async () => {
        try {
            const result = await window.electronAPI?.invoke('select-audio-file')
            if (result?.success && result.filePath) {
                setInputAudioPath(result.filePath)
                setPreview('audio', result.filePath)
                message.success('已导入本地音频')
                setActiveKey('copywriting')
            } else if (!result?.canceled) {
                throw new Error(result?.error || '未选择音频')
            }
        } catch (e: any) {
            message.error(e.message || '导入音频失败')
        }
    }

    const handleImportCopy = async () => {
        try {
            const result = await window.electronAPI?.invoke('select-text-file')
            if (result?.success && result.data?.content) {
                setOriginalCopy(result.data.content)
                setPreview('text', result.data.content)
                message.success('已导入文案')
                setActiveKey('rewrite')
            } else if (!result?.canceled) {
                throw new Error(result?.error || '未选择文案文件')
            }
        } catch (e: any) {
            message.error(e.message || '导入文案失败')
        }
    }

    const progressItems = [
        { key: 'material', title: '🔍 找对标', subtitle: '找到爆款视频', done: !!(videoPath || finalVideoPath || inputAudioPath) },
        { key: 'rewrite', title: '✨ 变原创', subtitle: 'AI改写成你的', done: !!rewrittenCopy },
        { key: 'digitalHuman', title: '🎭 做数字人', subtitle: '生成AI分身', done: !!digitalHumanVideoPath },
        { key: 'publish', title: '🚀 一键发', subtitle: '全网自动分发', done: !!(coverPath && titles?.length) },
    ]

    const activeIndex = Math.max(0, progressItems.findIndex((i) => i.key === activeKey))

    const currentItemTitle = progressItems.find((i) => i.key === activeKey)?.title || '步骤'

    const orderedKeys = progressItems.map((i) => i.key)
    const nextKey = activeIndex >= 0 && activeIndex < orderedKeys.length - 1 ? orderedKeys[activeIndex + 1] : null
    const prevKey = activeIndex > 0 ? orderedKeys[activeIndex - 1] : null
    const canGoNext = progressItems[activeIndex]?.done ?? false

    const renderActivePanel = () => {
        switch (activeKey) {
            case 'material':
                return (
                    <Space direction="vertical" style={{ width: '100%' }} size={24}>
                        {/* 模式选择 */}
                        {!parseMode ? (
                            <>
                                <Typography.Text strong style={{ fontSize: 20, display: 'block', color: 'var(--text-primary)' }}>
                                    请选择找对标的方式
                                </Typography.Text>
                                <div style={{ display: 'flex', gap: 20 }}>
                                    {/* 选项1：解析单个视频 */}
                                    <div
                                        onClick={() => setParseMode('single')}
                                        style={{
                                            flex: 1,
                                            padding: 32,
                                            borderRadius: 16,
                                            background: 'linear-gradient(135deg, rgba(0, 212, 170, 0.08), rgba(0, 184, 148, 0.04))',
                                            border: '2px solid rgba(0, 212, 170, 0.2)',
                                            cursor: 'pointer',
                                            textAlign: 'center',
                                            transition: 'all 0.2s ease',
                                        }}
                                    >
                                        <DownloadOutlined style={{ fontSize: 48, color: 'var(--primary-color)', marginBottom: 16 }} />
                                        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                                            解析单个视频
                                        </div>
                                        <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                                            粘贴一个抖音视频链接，下载视频并提取文案
                                        </div>
                                    </div>

                                    {/* 选项2：解析博主主页 */}
                                    <div
                                        onClick={() => setParseMode('profile')}
                                        style={{
                                            flex: 1,
                                            padding: 32,
                                            borderRadius: 16,
                                            background: 'linear-gradient(135deg, rgba(0, 212, 170, 0.08), rgba(0, 184, 148, 0.04))',
                                            border: '2px solid rgba(0, 212, 170, 0.2)',
                                            cursor: 'pointer',
                                            textAlign: 'center',
                                            transition: 'all 0.2s ease',
                                        }}
                                    >
                                        <UserOutlined style={{ fontSize: 48, color: 'var(--primary-color)', marginBottom: 16 }} />
                                        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
                                            解析博主主页
                                        </div>
                                        <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                                            粘贴博主主页链接，批量获取他的所有视频
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                {/* 返回按钮 */}
                                <Button
                                    type="link"
                                    onClick={() => setParseMode(null)}
                                    style={{ padding: 0, color: 'var(--text-secondary)' }}
                                >
                                    ← 返回选择
                                </Button>

                                {/* 输入区域 */}
                                <div style={{
                                    background: 'linear-gradient(135deg, rgba(0, 212, 170, 0.1), rgba(0, 184, 148, 0.05))',
                                    borderRadius: 16,
                                    padding: 24,
                                    border: '1px solid rgba(0, 212, 170, 0.2)'
                                }}>
                                    <Typography.Text strong style={{ fontSize: 18, marginBottom: 16, display: 'block', color: 'var(--accent)' }}>
                                        {parseMode === 'single' ? '粘贴抖音视频链接' : '粘贴博主主页链接'}
                                    </Typography.Text>
                                    <Input
                                        placeholder={parseMode === 'single' ? '例如：https://v.douyin.com/xxxxx' : '例如：https://www.douyin.com/user/xxxxx'}
                                        size="large"
                                        value={douyinUrl}
                                        onChange={(e) => setDouyinUrl(e.target.value)}
                                        style={{
                                            borderRadius: 12,
                                            fontSize: 16,
                                            padding: '14px 18px',
                                            marginBottom: 16
                                        }}
                                    />
                                    <Button
                                        type="primary"
                                        size="large"
                                        icon={parseMode === 'single' ? <DownloadOutlined /> : <UserOutlined />}
                                        disabled={!douyinUrl}
                                        loading={isTracking}
                                        onClick={parseMode === 'single' ? () => handleDownloadSingle() : handleFetchProfile}
                                        style={{ height: 48, fontSize: 16 }}
                                    >
                                        {parseMode === 'single' ? '开始解析视频' : '获取博主视频列表'}
                                    </Button>
                                </div>
                            </>
                        )}

                        {/* 或者导入本地文件 */}
                        <div>
                            <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
                                或者导入本地素材：
                            </Typography.Text>
                            <Space wrap>
                                <Button icon={<DownloadOutlined />} onClick={handleImportVideo}>
                                    导入本地视频
                                </Button>
                                <Button icon={<SoundOutlined />} onClick={handleImportAudio}>
                                    导入本地音频
                                </Button>
                                <Button icon={<FileTextOutlined />} onClick={handleImportCopy}>
                                    导入文案（txt/md）
                                </Button>
                            </Space>
                        </div>

                        <Card size="small" title="当前素材状态">
                            <Space direction="vertical" style={{ width: '100%' }} size={6}>
                                <Typography.Text type="secondary">视频：{finalVideoPath || videoPath || '未选择'}</Typography.Text>
                                <Typography.Text type="secondary">音频：{inputAudioPath || '未选择'}</Typography.Text>
                                <Typography.Text type="secondary">文案：{originalCopy ? `已导入/提取（${originalCopy.length}字）` : '未导入'}</Typography.Text>
                            </Space>
                        </Card>
                    </Space>
                )
            case 'copywriting':
                return <CopywritingPanel />
            case 'rewrite':
                return <RewritePanel />
            case 'audio':
                return <AudioPanel />
            case 'digitalHuman':
                return <DigitalHumanPanel />
            case 'subtitle':
                return <SubtitlePanel />
            case 'cover':
                return <CoverPanel />
            case 'title':
                return <TitlePanel />
            case 'publish':
                return <PublishPanel />
            default:
                return null
        }
    }

    return (
        <>
            {/* 顶部工具栏 - 简化版 */}
            <header className="header" style={{ justifyContent: 'center', position: 'relative' }}>
                <div className="header-title" style={{ flex: 'none', justifyContent: 'center' }}>
                    <div className="brand-pill" style={{ fontSize: 16, padding: '8px 16px' }}>AI</div>
                    <div style={{ textAlign: 'center' }}>
                        <div className="brand-name" style={{ fontSize: 28, fontWeight: 800 }}>360行 AI智能体大脑</div>
                        <div className="brand-subtitle" style={{ fontSize: 14 }}>一键生成 · 全网分发 · 躺赚流量</div>
                    </div>
                </div>
                <div className="header-actions" style={{ position: 'absolute', right: 28, top: '50%', transform: 'translateY(-50%)' }}>
                    <Button
                        size="large"
                        icon={<SettingOutlined />}
                        onClick={() => setSettingsOpen(true)}
                    >
                        设置
                    </Button>
                </div>
            </header>

            {/* 主内容区 */}
            <main className="main-content">
                {/* 左侧步骤导航 - 大字版 */}
                <aside className="sidebar">
                    <div style={{ marginBottom: 32 }}>
                        <Typography.Text strong style={{ fontSize: 16, color: 'var(--accent)' }}>
                            当前第 {activeIndex + 1} 步 / 共 {progressItems.length} 步
                        </Typography.Text>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {progressItems.map((item, idx) => (
                            <div
                                key={item.key}
                                onClick={() => setActiveKey(item.key)}
                                style={{
                                    padding: '16px 20px',
                                    borderRadius: 12,
                                    cursor: 'pointer',
                                    background: activeIndex === idx
                                        ? 'linear-gradient(135deg, rgba(0, 212, 170, 0.2), rgba(0, 184, 148, 0.1))'
                                        : 'rgba(255, 255, 255, 0.03)',
                                    border: activeIndex === idx
                                        ? '2px solid var(--primary-color)'
                                        : '1px solid rgba(255, 255, 255, 0.08)',
                                    transition: 'all 0.2s ease',
                                    opacity: item.done ? 1 : (activeIndex === idx ? 1 : 0.6),
                                }}
                            >
                                <div style={{
                                    fontSize: 22,
                                    fontWeight: 700,
                                    color: activeIndex === idx ? 'var(--primary-color)' : 'var(--text-primary)',
                                    marginBottom: 4
                                }}>
                                    {item.title}
                                </div>
                                <div style={{
                                    fontSize: 13,
                                    color: 'var(--text-secondary)',
                                }}>
                                    {(item as any).subtitle || ''}
                                </div>
                                {item.done && (
                                    <div style={{
                                        fontSize: 12,
                                        color: '#52c41a',
                                        marginTop: 6
                                    }}>
                                        ✓ 已完成
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </aside>

                {/* 中间操作区 */}
                <section className="workspace">
                    <div className="step-card">
                        <div className="step-card-title" style={{ fontSize: 28, marginBottom: 28, display: 'flex', alignItems: 'center' }}>
                            <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 48,
                                height: 48,
                                borderRadius: '50%',
                                background: 'linear-gradient(135deg, #00d4aa, #00b894)',
                                marginRight: 16,
                                fontSize: 22,
                                fontWeight: 700,
                                boxShadow: '0 4px 20px rgba(0, 212, 170, 0.35)'
                            }}>
                                {activeIndex + 1}
                            </span>
                            <span style={{ fontWeight: 700 }}>{currentItemTitle}</span>
                        </div>

                        <Card
                            className="workbench-panel"
                            styles={{ body: { paddingTop: 18 } }}
                        >
                            {renderActivePanel()}
                        </Card>
                    </div>
                </section>

                {/* 右侧预览区 */}
                <aside className="preview-panel">
                    <PreviewPanel />
                </aside>
            </main>

            <Modal
                title="设置"
                open={settingsOpen}
                onCancel={() => setSettingsOpen(false)}
                footer={null}
                width={720}
                destroyOnClose
            >
                <Tabs
                    items={[
                        { key: 'cookie', label: '全网分发账号', children: <CookieSettings /> },
                        { key: 'voice', label: '声音克隆', children: <VoiceCloneSettings /> },
                        { key: 'server', label: '服务器设置', children: <ServerSettings /> },
                    ]}
                />
            </Modal>

            <ProfileVideoSelector
                open={profileModalOpen}
                loading={profileLoading}
                videos={profileVideos}
                onBatchSelect={handleBatchVideoSelect}
                onCancel={() => setProfileModalOpen(false)}
                maxSelect={5}
            />
        </>
    )
}

export default App
