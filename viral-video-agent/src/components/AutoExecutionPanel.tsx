import { useEffect, useRef } from 'react'
import { Button, Input, Progress, message } from 'antd'
import {
    PlayCircleOutlined,
    ReloadOutlined,
    CheckCircleFilled,
    DownloadOutlined,
    EditOutlined,
    SafetyCertificateOutlined,
    SoundOutlined,
    VideoCameraOutlined,
    SendOutlined,
    SearchOutlined,
    ExclamationCircleOutlined,
    SettingOutlined
} from '@ant-design/icons'

// 定义工作流程步骤
const WORKFLOW_STEPS = [
    { key: 'auto_material', label: '解析素材', desc: '正在下载并解析视频内容...', icon: <DownloadOutlined /> },
    { key: 'auto_extract', label: '提取文案', desc: '正在通过AI识别视频中的语音...', icon: <SearchOutlined /> },
    { key: 'auto_rewrite', label: 'AI改写', desc: '正在将内容改写为原创文案...', icon: <EditOutlined /> },
    { key: 'auto_legal', label: '合规审核', desc: '正在检查敏感词和违规内容...', icon: <SafetyCertificateOutlined /> },
    { key: 'auto_audio', label: 'AI配音', desc: '正在使用您的声音生成配音...', icon: <SoundOutlined /> },
    { key: 'auto_digital', label: '数字人渲染', desc: '正在生成数字人视频...', icon: <VideoCameraOutlined /> },
    { key: 'auto_review', label: '完成', desc: '视频已生成，可以预览和发布', icon: <SendOutlined /> },
] as const

type AutoStepKey = typeof WORKFLOW_STEPS[number]['key']

// 高级音效合成（使用 Web Audio API）
const playSound = (type: 'start' | 'step' | 'complete' | 'error') => {
    try {
        const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext
        const ctx = new AudioContextClass() as AudioContext

        if (ctx.state === 'suspended') { ctx.resume().catch(() => { }) }

        const createTone = (freq: number, startTime: number, duration: number, volume: number, oscType: OscillatorType = 'sine') => {
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.type = oscType
            osc.frequency.setValueAtTime(freq, startTime)

            gain.gain.setValueAtTime(volume, startTime)
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration)

            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.start(startTime)
            osc.stop(startTime + duration)
        }

        const now = ctx.currentTime
        switch (type) {
            case 'start':
                createTone(523.25, now, 0.4, 0.1) // C5
                break
            case 'step':
                // 类似苹果风格清脆音：两个快速上升音 (D6 -> G6)
                createTone(1174.66, now, 0.15, 0.1) // D6
                createTone(1567.98, now + 0.1, 0.25, 0.08) // G6
                break
            case 'complete':
                // 庆祝性大三和弦 (C5 E5 G5 C6)
                createTone(523.25, now, 1.0, 0.05)
                createTone(659.25, now + 0.05, 1.0, 0.05)
                createTone(783.99, now + 0.1, 1.0, 0.05)
                createTone(1046.50, now + 0.15, 1.2, 0.08)
                break
            case 'error':
                createTone(220, now, 0.15, 0.1, 'sawtooth')
                createTone(110, now + 0.15, 0.4, 0.1, 'sawtooth')
                break
        }
    } catch (e) {
        // 静默失败
    }
}

interface AutoExecutionPanelProps {
    douyinUrl: string
    setDouyinUrl: (url: string) => void
    autoRunning: boolean
    startAutoPipeline: () => void
    refreshAutoReadiness: () => void
    autoActiveStep: AutoStepKey
    autoPercent: number
    autoStatusText: string
    autoLogs: Array<{ time: string; step: string; message: string }>
    autoError: string
    autoCheckLoading: boolean
    autoVoiceReady: boolean
    autoAvatarReady: boolean
    disabledReason: string
    autoExtractedCopy: string
    autoRewrittenCopy: string
    autoLegalReport: any
    autoAudioPath: string
    autoFinalVideoPath: string
    digitalHumanProgress: number
    setSettingsTab: (tab: string) => void
    setSettingsOpen: (open: boolean) => void
    setWorkspaceMode: (mode: 'manual' | 'auto') => void
    setActiveKey: (key: string) => void
    onShowDetail: () => void
    onPublish: () => void
    onReset: () => void
}

export default function AutoExecutionPanel(props: AutoExecutionPanelProps) {
    const {
        douyinUrl, setDouyinUrl, autoRunning, startAutoPipeline, refreshAutoReadiness,
        autoActiveStep, autoPercent, autoStatusText, autoError, autoCheckLoading,
        autoVoiceReady, autoAvatarReady, disabledReason, autoFinalVideoPath,
        setSettingsTab, setSettingsOpen, onPublish, onReset
    } = props

    const prevStepRef = useRef<string>('')

    // 步骤切换时播放音效
    useEffect(() => {
        if (autoActiveStep !== prevStepRef.current && autoRunning) {
            if (autoActiveStep === 'auto_review' && autoFinalVideoPath) {
                playSound('complete')
            } else {
                playSound('step')
            }
            prevStepRef.current = autoActiveStep
        }
    }, [autoActiveStep, autoRunning, autoFinalVideoPath])

    // 错误时播放音效
    useEffect(() => {
        if (autoError) {
            playSound('error')
            message.error(`执行失败: ${autoError}`)
        }
    }, [autoError])

    // 获取当前步骤索引和配置
    const currentStepIndex = WORKFLOW_STEPS.findIndex(s => s.key === autoActiveStep)
    const currentStep = WORKFLOW_STEPS[currentStepIndex] || WORKFLOW_STEPS[0]

    // 判断是否未开始
    const isIdle = !autoRunning && !autoFinalVideoPath
    // 判断是否已完成
    const isComplete = autoFinalVideoPath && !autoRunning

    // 步骤特有的视觉动画渲染
    const renderStepVisual = () => {
        switch (autoActiveStep) {
            // 解析素材 - 视频帧下载动画
            case 'auto_material':
                return (
                    <div className="step-visual step-visual-download">
                        <div className="video-frame-stack">
                            <div className="video-frame frame-1" />
                            <div className="video-frame frame-2" />
                            <div className="video-frame frame-3" />
                        </div>
                        <div className="download-arrow">
                            <DownloadOutlined />
                        </div>
                    </div>
                )

            // 提取文案 - 语音波形转文字
            case 'auto_extract':
                return (
                    <div className="step-visual step-visual-extract">
                        <div className="sound-wave">
                            {[...Array(18)].map((_, i) => (
                                <div key={i} className="wave-bar" style={{ animationDelay: `${i * 0.05}s` }} />
                            ))}
                        </div>
                        <div className="text-appear">
                            <span className="typing-text">正在识别语音内容...</span>
                        </div>
                    </div>
                )

            // AI变原创 - 魔法粒子变换
            case 'auto_rewrite':
                return (
                    <div className="step-visual step-visual-rewrite">
                        <div className="magic-transform">
                            <div className="text-original">原文</div>
                            <div className="magic-particles">
                                {[...Array(12)].map((_, i) => (
                                    <div key={i} className="particle" style={{
                                        animationDelay: `${i * 0.12}s`,
                                        left: `${10 + i * 7}%`,
                                        top: `${Math.random() * 40}%`
                                    }} />
                                ))}
                            </div>
                            <div className="text-new">原创</div>
                        </div>
                    </div>
                )

            // AI法务 - 扫描线检测
            case 'auto_legal':
                return (
                    <div className="step-visual step-visual-legal">
                        <div className="scan-container">
                            <div className="scan-document">
                                <div className="doc-lines">
                                    {[...Array(6)].map((_, i) => (
                                        <div key={i} className="doc-line" />
                                    ))}
                                </div>
                                <div className="scan-line" />
                            </div>
                            <div className="check-marks">
                                <SafetyCertificateOutlined />
                            </div>
                        </div>
                    </div>
                )

            // AI配音 - 音频波纹
            case 'auto_audio':
                return (
                    <div className="step-visual step-visual-audio">
                        <div className="audio-visualizer">
                            <div className="speaker-icon">
                                <SoundOutlined />
                            </div>
                            <div className="audio-waves">
                                <div className="wave-ring ring-1" />
                                <div className="wave-ring ring-2" />
                                <div className="wave-ring ring-3" />
                            </div>
                        </div>
                    </div>
                )

            // 数字人出片 - 人形渲染
            case 'auto_digital':
                return (
                    <div className="step-visual step-visual-digital">
                        <div className="digital-human-render">
                            <div className="human-silhouette">
                                <div className="render-progress" style={{ height: `${Math.min(100, autoPercent * 1.5)}%` }} />
                            </div>
                            <div className="render-particles">
                                {[...Array(10)].map((_, i) => (
                                    <div
                                        key={i}
                                        className="render-dot"
                                        style={{
                                            animationDelay: `${i * 0.15}s`,
                                            left: `${Math.random() * 80 + 10}%`,
                                            top: `${Math.random() * 80 + 10}%`,
                                            '--x': `${(Math.random() - 0.5) * 40}px`,
                                            '--y': `${(Math.random() - 0.5) * 40}px`
                                        } as any}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )

            // 完成 - 成功动画
            case 'auto_review':
                return (
                    <div className="step-visual step-visual-complete">
                        <div className="success-ripples">
                            <div className="ripple" style={{ animationDelay: '0s' }} />
                            <div className="ripple" style={{ animationDelay: '0.4s' }} />
                            <div className="ripple" style={{ animationDelay: '0.8s' }} />
                        </div>
                        <CheckCircleFilled className="complete-success-icon" />
                        <div style={{ marginTop: 30, fontSize: 28, fontWeight: 'bold', color: '#52c41a', textShadow: '0 0 20px rgba(82,196,26,0.4)' }}>
                            🎉 生成完成
                        </div>
                    </div>
                )

            default:
                return null
        }
    }

    // 开始流程（带音效）
    const handleStart = () => {
        playSound('start')
        startAutoPipeline()
    }

    // 渲染等待开始状态
    const renderIdleState = () => (
        <div className="auto-idle-container">
            {/* 输入区域 */}
            <div className="auto-idle-input">
                <h2 className="auto-idle-title">全自动视频生成</h2>
                <p className="auto-idle-subtitle">粘贴视频链接，一键生成原创数字人视频</p>

                <div className="auto-input-group">
                    <Input
                        placeholder="粘贴抖音、快手等短视频链接"
                        value={douyinUrl}
                        onChange={(e) => setDouyinUrl(e.target.value)}
                        size="large"
                        prefix={<SearchOutlined style={{ color: 'rgba(255,255,255,0.35)' }} />}
                        className="auto-main-input"
                    />
                    <Button
                        type="primary"
                        size="large"
                        icon={<PlayCircleOutlined />}
                        onClick={handleStart}
                        disabled={!!disabledReason}
                        className="auto-main-btn"
                    >
                        开始生成
                    </Button>
                </div>

                {disabledReason && (
                    <div className="auto-hint-bar">
                        <ExclamationCircleOutlined />
                        <span>{disabledReason}</span>
                        {!autoVoiceReady && (
                            <Button type="link" size="small" icon={<SettingOutlined />}
                                onClick={() => { setSettingsTab('voice'); setSettingsOpen(true) }}>
                                配置音色
                            </Button>
                        )}
                        {autoVoiceReady && !autoAvatarReady && (
                            <Button type="link" size="small" icon={<SettingOutlined />}
                                onClick={() => { setSettingsTab('avatar'); setSettingsOpen(true) }}>
                                配置形象
                            </Button>
                        )}
                    </div>
                )}
            </div>

            {/* 就绪状态 */}
            <div className="auto-ready-status">
                <div className="auto-ready-item" onClick={() => { setSettingsTab('voice'); setSettingsOpen(true) }}>
                    <SoundOutlined />
                    <span>音色</span>
                    {autoVoiceReady ? (
                        <CheckCircleFilled style={{ color: '#52c41a' }} />
                    ) : (
                        <ExclamationCircleOutlined style={{ color: '#faad14' }} />
                    )}
                </div>
                <div className="auto-ready-item" onClick={() => { setSettingsTab('avatar'); setSettingsOpen(true) }}>
                    <VideoCameraOutlined />
                    <span>形象</span>
                    {autoAvatarReady ? (
                        <CheckCircleFilled style={{ color: '#52c41a' }} />
                    ) : (
                        <ExclamationCircleOutlined style={{ color: '#faad14' }} />
                    )}
                </div>
                <Button
                    size="small"
                    icon={<ReloadOutlined />}
                    loading={autoCheckLoading}
                    onClick={refreshAutoReadiness}
                    style={{ marginLeft: 'auto' }}
                >
                    刷新
                </Button>
            </div>
        </div>
    )

    // 渲染执行中状态
    const renderRunningState = () => (
        <div className="auto-running-container">
            {/* 步骤指示器 - 简化版 */}
            <div className="auto-step-dots">
                {WORKFLOW_STEPS.map((step, idx) => (
                    <div
                        key={step.key}
                        className={`auto-dot ${idx < currentStepIndex ? 'done' : ''} ${idx === currentStepIndex ? 'active' : ''}`}
                        title={step.label}
                    />
                ))}
            </div>

            {/* 当前步骤 - 大字展示 */}
            <div className="auto-current-step">
                <div className="auto-step-icon-large">
                    {currentStep.icon}
                </div>
                <h1 className="auto-step-title">{currentStep.label}</h1>
                <p className="auto-step-desc">{autoStatusText || currentStep.desc}</p>
            </div>

            {/* 步骤特有视觉动画 */}
            {renderStepVisual()}

            {/* 进度条 */}
            <div className="auto-progress-bar">
                <Progress
                    percent={autoPercent}
                    status="active"
                    strokeColor={{
                        '0%': '#00d4aa',
                        '100%': '#00b894',
                    }}
                    showInfo={false}
                    strokeWidth={6}
                />
                <span className="auto-progress-text">{autoPercent}%</span>
            </div>
        </div>
    )

    // 渲染完成状态
    const renderCompleteState = () => (
        <div className="auto-complete-container">
            <div className="auto-complete-icon">
                <CheckCircleFilled />
            </div>
            <h1 className="auto-complete-title">视频已生成</h1>
            <p className="auto-complete-desc">原创数字人视频已准备就绪</p>

            <div className="auto-complete-actions">
                <Button
                    type="primary"
                    size="large"
                    icon={<PlayCircleOutlined />}
                    onClick={onPublish}
                    className="auto-preview-btn"
                >
                    预览并发布
                </Button>
                <Button
                    size="large"
                    onClick={() => {
                        onReset()
                        message.success('已重置，可以开始新的视频生成')
                    }}
                >
                    生成新视频
                </Button>
            </div>
        </div>
    )

    return (
        <div className="auto-fullscreen-container">
            {isIdle && renderIdleState()}
            {autoRunning && renderRunningState()}
            {isComplete && renderCompleteState()}
        </div>
    )
}
