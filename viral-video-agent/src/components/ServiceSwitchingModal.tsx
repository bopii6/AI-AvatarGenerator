/**
 * 服务切换进度弹窗
 * 
 * 当服务切换时显示友好的进度提示，包含：
 * - 动画进度条
 * - 倒计时
 * - 超时自动关闭（180秒）
 * - 取消按钮
 * 
 * 使用方式：在 App.tsx 中放置一次即可全局生效
 */

import { useEffect, useState, useCallback } from 'react'
import { Modal, Progress, Typography, Alert, Space, Button, message } from 'antd'
import { useGpuScheduler } from '../contexts/GpuSchedulerContext'
import { formatRemainingTime } from '../services/gpuSchedulerService'

const { Title, Text } = Typography

// 超时时间（秒）
const SWITCH_TIMEOUT_SECONDS = 180

export function ServiceSwitchingModal() {
    const { status, pendingSwitch, getSwitchProgress, getServiceName, clearPendingSwitch } = useGpuScheduler()
    const [elapsedSeconds, setElapsedSeconds] = useState(0)
    const [isTimedOut, setIsTimedOut] = useState(false)

    // 判断是否应该显示弹窗
    const isVisible = !status?.apiKeyError && (status?.switching || pendingSwitch) && !isTimedOut

    // 计时器：追踪已等待时间
    useEffect(() => {
        if (!isVisible) {
            setElapsedSeconds(0)
            setIsTimedOut(false)
            return
        }

        const timer = setInterval(() => {
            setElapsedSeconds(prev => {
                const next = prev + 1
                if (next >= SWITCH_TIMEOUT_SECONDS) {
                    setIsTimedOut(true)
                    clearInterval(timer)
                }
                return next
            })
        }, 1000)

        return () => clearInterval(timer)
    }, [isVisible])

    // 超时后自动清理并提示
    useEffect(() => {
        if (isTimedOut) {
            clearPendingSwitch?.()
            message.error('服务切换超时，请稍后重试或检查网络连接')
        }
    }, [isTimedOut, clearPendingSwitch])

    // 用户点击取消
    const handleCancel = useCallback(() => {
        clearPendingSwitch?.()
        message.info('已取消等待')
    }, [clearPendingSwitch])

    if (!isVisible) {
        return null
    }

    const targetService = status?.switchingTarget ?? pendingSwitch?.targetService ?? null
    const targetName = targetService ? getServiceName(targetService) : '目标服务'

    const { percent, remainingSeconds } = status?.switching
        ? getSwitchProgress()
        : { percent: Math.min(95, Math.round((elapsedSeconds / 90) * 100)), remainingSeconds: Math.max(0, 90 - elapsedSeconds) }

    return (
        <Modal
            open={true}
            closable={false}
            footer={null}
            centered
            width={420}
            maskClosable={false}
            styles={{
                mask: { backdropFilter: 'blur(4px)' },
                content: {
                    background: 'linear-gradient(135deg, rgba(22,27,34,0.98) 0%, rgba(13,17,23,0.98) 100%)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 20,
                },
                body: { padding: 32 },
            }}
        >
            <div style={{ textAlign: 'center' }}>
                {/* 动画图标 */}
                <div
                    style={{
                        fontSize: 56,
                        marginBottom: 20,
                        animation: 'pulse 1.5s ease-in-out infinite',
                    }}
                >
                    ⏳
                </div>

                <Title level={4} style={{ marginBottom: 8, color: '#fff' }}>
                    正在准备{targetName}服务
                </Title>

                <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
                    系统正在切换云端 AI 引擎
                </Text>

                {!!status?.unstable && (
                    <Alert
                        type="warning"
                        showIcon
                        message="连接不稳定，正在重试…"
                        style={{
                            marginBottom: 16,
                            textAlign: 'left',
                            background: 'rgba(250,173,20,0.08)',
                            border: '1px solid rgba(250,173,20,0.2)',
                        }}
                    />
                )}

                {/* 进度条 */}
                <Progress
                    percent={percent}
                    status="active"
                    strokeColor={{
                        from: '#1677ff',
                        to: '#52c41a',
                    }}
                    trailColor="rgba(255,255,255,0.08)"
                    style={{ marginBottom: 16 }}
                />

                {/* 剩余时间 */}
                <Space direction="vertical" size={4} style={{ marginBottom: 24 }}>
                    <Text style={{ fontSize: 24, fontWeight: 700, color: '#1677ff' }}>
                        {status?.switching ? formatRemainingTime(remainingSeconds) : `约 ${remainingSeconds} 秒`}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        预计剩余时间（已等待 {elapsedSeconds} 秒）
                    </Text>
                </Space>

                {/* 说明 */}
                <Alert
                    type="info"
                    showIcon
                    message="为什么需要等待？"
                    description={
                        <span style={{ fontSize: 12 }}>
                            由于 GPU 显存限制（8GB），系统同时只能运行一个 AI 服务。
                            切换时需要关闭当前服务并启动新服务，加载 AI 模型需要一定时间。
                        </span>
                    }
                    style={{
                        textAlign: 'left',
                        marginBottom: 20,
                        background: 'rgba(22,119,255,0.08)',
                        border: '1px solid rgba(22,119,255,0.2)',
                    }}
                />

                {/* 取消按钮 */}
                <Button
                    type="text"
                    onClick={handleCancel}
                    style={{
                        color: 'rgba(255,255,255,0.5)',
                        fontSize: 13,
                    }}
                >
                    取消等待
                </Button>
            </div>

            {/* 脉冲动画 CSS */}
            <style>{`
                @keyframes pulse {
                    0%, 100% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.1); opacity: 0.8; }
                }
            `}</style>
        </Modal>
    )
}

export default ServiceSwitchingModal
