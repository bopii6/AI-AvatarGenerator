import { useEffect, useState, useCallback } from 'react'
import { Input, Button, message, Modal, Spin, Tabs, Card, Space, Typography, Tooltip } from 'antd'
import {
    DownloadOutlined,
    UserOutlined,
    SettingOutlined,
    CopyOutlined,
    RocketOutlined,
    LockOutlined,
    DownOutlined,
} from '@ant-design/icons'
import { useAppStore } from './store/appStore'
import CookieSettings from './components/CookieSettings'
import VoiceCloneSettings from './components/VoiceCloneSettings'
import ServerSettings from './components/ServerSettings'
import ProfileVideoSelector from './components/ProfileVideoSelector'
import CloudServiceStatus from './components/CloudServiceStatus'

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
    const [isTracking, setIsTracking] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [adminEnabled, setAdminEnabled] = useState(false)
    const [parseMode, setParseMode] = useState<'single' | 'profile' | null>(null)
    const [profileModalOpen, setProfileModalOpen] = useState(false)
    const [profileLoading, setProfileLoading] = useState(false)
    const [profileVideos, setProfileVideos] = useState<any[]>([])
    const [batchResults, setBatchResults] = useState<{ title: string; copy: string; status: 'loading' | 'success' }[]>([])
    // 预留：云端服务状态可接后端心跳，这里先写死为 ready

    const {
        activeKey,
        setActiveKey,
        douyinUrl,
        setDouyinUrl,
        setVideoPath,
        setBatchVideos,
        setPreview,
        setOriginalCopy,
        setFinalVideoPath,
        setBatchCopies,
        setBatchRewrittenCopies,
        setDigitalHumanSelectedCopy,
        videoPath,
        inputAudioPath,
        rewrittenCopy,
        digitalHumanVideoPath,
        digitalHumanGenerating,
        digitalHumanProgress,
        digitalHumanProgressText,
        finalVideoPath,
    } = useAppStore()

    useEffect(() => {
        const removeListener = window.electronAPI?.on('cloud-gpu-progress', (data: any) => {
            const progress = data?.progress ?? 0
            const text = data?.message ?? ''
            useAppStore.getState().setDigitalHumanProgress(progress, text)
        })

        return () => {
            if (removeListener) removeListener()
        }
    }, [])

    useEffect(() => {
        const removeListener = window.electronAPI?.on?.('cloud-gpu-download-progress', (data: { progress?: number; message?: string }) => {
            const progress = typeof data?.progress === 'number' ? data.progress : 0
            const text = typeof data?.message === 'string' ? data.message : ''
            useAppStore.getState().setDigitalHumanDownloadProgress(Math.max(0, Math.min(100, progress)), text)
        })
        return () => {
            if (typeof removeListener === 'function') removeListener()
        }
    }, [])

    useEffect(() => {
        const loadRuntimeFlags = async () => {
            try {
                const res = await window.electronAPI?.invoke('config-get')
                if (res?.success && res.data) {
                    setAdminEnabled(!!res.data.adminEnabled)
                }
            } catch {
                // ignore
            }
        }
        loadRuntimeFlags()
    }, [])

    // Tab 切换（语音走云端 API，数字人走独立 GPU 服务，无需服务切换/等待）
    const handleTabChange = useCallback((key: string) => {
        if (key === activeKey) return
        setActiveKey(key)
    }, [activeKey, setActiveKey])

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
                setBatchVideos([])
                setBatchRewrittenCopies([])
                setDigitalHumanSelectedCopy(null)
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

        setBatchVideos([])
        setBatchRewrittenCopies([])
        setDigitalHumanSelectedCopy(null)

        // 1. 初始化批量结果状态
        setBatchResults(videos.map(v => ({
            title: v.title || '视频',
            copy: '',
            status: 'loading'
        })))

        // 2. 更新预览区（仍然保留预览区的进度提示，作为双重反馈）
        setPreview('text', `🔍 [v3.1] 正在批量解析 ${videos.length} 个视频...\n\n请关注下方「批量解析结果」区域`)

        setIsTracking(true)

        try {
            const allCopies: { title: string; copy: string }[] = []
            const allVideos: { title: string; videoPath: string }[] = []

            for (let i = 0; i < videos.length; i++) {
                const video = videos[i]
                const videoTitle = video.title || `视频 ${i + 1}`

                // 下载单个视频
                const result = await window.electronAPI?.invoke('download-video', video.url)
                if (result?.success && result.data?.videoPath) {
                    if (i === 0) setVideoPath(result.data.videoPath)
                    allVideos.push({ title: videoTitle, videoPath: result.data.videoPath })
                    setBatchVideos([...allVideos])

                    // 提取文案
                    const asrResult = await window.electronAPI?.invoke('transcribe-audio', result.data.videoPath)
                    if (asrResult?.success && asrResult.data) {
                        const copy = asrResult.data
                        allCopies.push({ title: videoTitle, copy })

                        // 3. 更新单个结果状态
                        setBatchResults(prev => {
                            const newResults = [...prev]
                            newResults[i] = { ...newResults[i], copy, status: 'success' }
                            return newResults
                        })
                    }
                }

                // 随机延迟 5-8 秒
                if (i < videos.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 5000 + Math.random() * 3000))
                }
            }

            if (allCopies.length > 0) {
                // 保存所有文案到状态
                const combinedCopy = allCopies.map((c, i) => `【视频${i + 1}】${c.title}\n${c.copy}`).join('\n\n---\n\n')
                setOriginalCopy(combinedCopy)
                setBatchCopies(allCopies) // 保存到全局状态
                setBatchVideos(allVideos)
                setPreview('text', `✅ 解析完成！\n\n请查看下方列表，每条文案都可单独复制。\n点击下方「下一步：变原创」继续。`)
                message.success(`批量解析完成！`)
            } else {
                message.warning('未能提取到任何文案')
            }
        } catch (e: any) {
            message.error(`批量解析失败: ${e.message}`)
        } finally {
            setIsTracking(false)
        }
    }



    const progressItems = [
        { key: 'material', title: '🔍 找对标', subtitle: '找到爆款视频', done: !!(videoPath || finalVideoPath || inputAudioPath) },
        { key: 'rewrite', title: '✨ 变原创', subtitle: 'AI改写成你的', done: !!rewrittenCopy },
        { key: 'digitalHuman', title: '🎭 数字人', subtitle: '生成AI分身', done: !!digitalHumanVideoPath },
        { key: 'publish', title: '🚀 一键发', subtitle: '全网自动分发', done: !!finalVideoPath },
    ]

    // audio 面板属于「数字人」步骤的子流程：侧栏仍高亮在数字人，避免用户误以为跳回“找对标”
    const sidebarKey = activeKey === 'audio' ? 'digitalHuman' : activeKey

    const activeIndex = Math.max(0, progressItems.findIndex((i) => i.key === sidebarKey))
    const maxUnlockedIndex = (() => {
        let idx = 0
        for (let i = 1; i < progressItems.length; i += 1) {
            if (progressItems[i - 1].done) idx = i
            else break
        }
        return idx
    })()

    const currentItemTitle = progressItems.find((i) => i.key === sidebarKey)?.title || '步骤'
    const showPreviewPanel = sidebarKey !== 'digitalHuman'


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

                        {/* 批量解析结果展示区 */}
                        {batchResults.length > 0 && (
                            <div style={{ marginTop: 24 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <Typography.Title level={4} style={{ margin: 0, color: 'var(--accent)' }}>
                                        批量解析结果 ({batchResults.filter(r => r.status === 'success').length}/{batchResults.length})
                                    </Typography.Title>
                                    <Button
                                        type="primary"
                                        onClick={() => setActiveKey('rewrite')}
                                        disabled={batchResults.every(r => r.status === 'loading')}
                                    >
                                        下一步：变原创 →
                                    </Button>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                    {batchResults.map((result, index) => (
                                        <Card
                                            key={index}
                                            style={{
                                                background: 'var(--bg-secondary)',
                                                borderColor: result.status === 'success' ? 'var(--primary-color)' : 'var(--border)'
                                            }}
                                            bodyStyle={{ padding: 16 }}
                                        >
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{
                                                        background: 'var(--primary-color)',
                                                        color: '#000',
                                                        borderRadius: '50%',
                                                        width: 24,
                                                        height: 24,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontWeight: 'bold'
                                                    }}>{index + 1}</span>
                                                    <Typography.Text strong style={{ fontSize: 16 }}>{result.title}</Typography.Text>
                                                </div>
                                                {result.status === 'success' ? (
                                                    <Button
                                                        size="small"
                                                        icon={<CopyOutlined />}
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(result.copy)
                                                            message.success('已复制文案')
                                                        }}
                                                    >
                                                        复制文案
                                                    </Button>
                                                ) : (
                                                    <Spin size="small" />
                                                )}
                                            </div>
                                            {result.status === 'success' ? (
                                                <div style={{
                                                    background: '#000',
                                                    padding: 12,
                                                    borderRadius: 8,
                                                    maxHeight: 150,
                                                    overflowY: 'auto',
                                                    fontSize: 14,
                                                    color: 'rgba(255,255,255,0.85)',
                                                    lineHeight: 1.6
                                                }}>
                                                    {result.copy}
                                                </div>
                                            ) : (
                                                <div style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                                                    正在解析视频并提取文案...
                                                </div>
                                            )}
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )}
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
                <div className="header-title" style={{ flex: 'none', justifyContent: 'center', paddingRight: 280 }}>
                    <div className="brand-pill" style={{ fontSize: 16, padding: '8px 16px' }}>AI</div>
                    <div style={{ textAlign: 'center' }}>
                        <div className="brand-name" style={{ fontSize: 28, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                            360行 AI智能体大脑
                            <Tooltip title="点击检查更新">
                                <span
                                    title={`build: ${__BUILD_TIME__}`}
                                    style={{ fontSize: 10, backgroundColor: 'rgba(0, 212, 170, 0.1)', color: '#00d4aa', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(0, 212, 170, 0.3)', verticalAlign: 'middle', fontWeight: 400, cursor: 'pointer' }}
                                    onClick={async () => {
                                        const hide = message.loading('正在检查更新...', 0)
                                        try {
                                            const res = await window.electronAPI?.invoke('check-for-updates')
                                            hide()
                                            if (res?.success && res.data) {
                                                if (res.data.hasUpdate) {
                                                    Modal.confirm({
                                                        title: '发现新版本',
                                                        content: res.data.message,
                                                        okText: '立即下载',
                                                        cancelText: '稍后',
                                                        onOk: () => {
                                                            window.open(res.data.downloadUrl, '_blank')
                                                        },
                                                    })
                                                } else {
                                                    message.success(res.data.message)
                                                }
                                            } else {
                                                message.error(res?.data?.message || res?.error || '检查更新失败')
                                            }
                                        } catch (e: any) {
                                            hide()
                                            message.error('检查更新失败')
                                        }
                                    }}
                                >
                                    v{__APP_VERSION__}
                                </span>
                            </Tooltip>
                        </div>
                        <div className="brand-subtitle" style={{ fontSize: 14 }}>一键生成 · 全网分发 · 躺赚流量</div>
                    </div>
                </div>
                <div className="header-actions" style={{ position: 'absolute', right: 28, top: '50%', transform: 'translateY(-50%)' }}>
                    {digitalHumanGenerating && (
                        <Tooltip title={digitalHumanProgressText || '正在生成数字人视频...'}>
                            <Button
                                size="large"
                                icon={<RocketOutlined />}
                                onClick={() => setActiveKey('digitalHuman')}
                                style={{ marginRight: 12 }}
                            >
                                出片中 {Math.round(digitalHumanProgress)}%
                            </Button>
                        </Tooltip>
                    )}
                    <Space size={8} style={{ marginRight: 12 }}>
                        <CloudServiceStatus kind="voice" />
                        <CloudServiceStatus kind="gpu" />
                    </Space>
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
                        {progressItems.map((item, idx) => {
                            const locked = idx > maxUnlockedIndex && idx !== activeIndex
                            const connectorColor = item.done
                                ? 'rgba(82,196,26,0.75)'
                                : (activeIndex === idx ? 'rgba(0, 212, 170, 0.85)' : 'rgba(255,255,255,0.18)')
                            const connectorDim = locked ? 'rgba(255,255,255,0.10)' : connectorColor

                            return (
                                <div key={item.key}>
                                    <div
                                        onClick={() => {
                                            if (locked) {
                                                const prev = progressItems[idx - 1]
                                                message.warning(`请先完成上一步：${prev?.title || ''}`.trim())
                                                return
                                            }
                                            handleTabChange(item.key)
                                        }}
                                        style={{
                                            padding: '16px 20px',
                                            borderRadius: 12,
                                            cursor: locked ? 'not-allowed' : 'pointer',
                                            background: activeIndex === idx
                                                ? 'linear-gradient(135deg, rgba(0, 212, 170, 0.2), rgba(0, 184, 148, 0.1))'
                                                : 'rgba(255, 255, 255, 0.03)',
                                            border: activeIndex === idx
                                                ? '2px solid var(--primary-color)'
                                                : '1px solid rgba(255, 255, 255, 0.08)',
                                            transition: 'all 0.2s ease',
                                            opacity: locked ? 0.45 : (item.done ? 1 : (activeIndex === idx ? 1 : 0.72)),
                                        }}
                                    >
                                        <div style={{
                                            fontSize: 22,
                                            fontWeight: 700,
                                            color: activeIndex === idx ? 'var(--primary-color)' : 'var(--text-primary)',
                                            marginBottom: 4
                                        }}>
                                            <span style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                width: 26,
                                                height: 26,
                                                borderRadius: 999,
                                                fontSize: 13,
                                                fontWeight: 800,
                                                marginRight: 10,
                                                background: item.done
                                                    ? 'rgba(82,196,26,0.15)'
                                                    : activeIndex === idx
                                                        ? 'rgba(0, 212, 170, 0.18)'
                                                        : 'rgba(255,255,255,0.06)',
                                                border: `1px solid ${item.done
                                                    ? 'rgba(82,196,26,0.28)'
                                                    : activeIndex === idx
                                                        ? 'rgba(0, 212, 170, 0.28)'
                                                        : 'rgba(255,255,255,0.10)'}`,
                                                color: item.done ? '#52c41a' : activeIndex === idx ? 'var(--primary-color)' : 'rgba(255,255,255,0.65)',
                                            }}>
                                                {idx + 1}
                                            </span>
                                            {item.title}
                                        </div>
                                        <div style={{
                                            fontSize: 13,
                                            color: 'var(--text-secondary)',
                                        }}>
                                            {(item as any).subtitle || ''}
                                        </div>
                                        {locked ? (
                                            <div style={{
                                                fontSize: 12,
                                                color: 'rgba(255,255,255,0.55)',
                                                marginTop: 6,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6,
                                            }}>
                                                <LockOutlined />
                                                请先完成上一步
                                            </div>
                                        ) : item.done ? (
                                            <div style={{
                                                fontSize: 12,
                                                color: '#52c41a',
                                                marginTop: 6
                                            }}>
                                                ✓ 已完成
                                            </div>
                                        ) : null}
                                    </div>

                                    {idx < progressItems.length - 1 && (
                                        <div style={{
                                            height: 18,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: connectorDim,
                                            userSelect: 'none',
                                        }}>
                                            <DownOutlined />
                                        </div>
                                    )}
                                </div>
                            )
                        })}
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
                {showPreviewPanel && (
                    <aside className="preview-panel">
                        <PreviewPanel />
                    </aside>
                )}
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
                        ...(adminEnabled ? [{ key: 'server', label: '服务器设置', children: <ServerSettings /> }] : []),
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
