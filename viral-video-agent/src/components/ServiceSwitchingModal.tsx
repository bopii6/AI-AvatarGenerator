/**
 * 服务切换进度弹窗
 * 
 * 当服务切换时显示友好的进度提示，包含：
 * - 动画进度条
 * - 倒计时
 * - 切换原因说明
 * 
 * 使用方式：在 App.tsx 中放置一次即可全局生效
 */

import { Modal, Progress, Typography, Alert, Space } from 'antd'
import { useGpuScheduler } from '../contexts/GpuSchedulerContext'
import { formatRemainingTime } from '../services/gpuSchedulerService'

const { Title, Text } = Typography

export function ServiceSwitchingModal() {
    const { status, getSwitchProgress, getServiceName } = useGpuScheduler()

    // 不显示条件：不在切换中，或状态未加载
    if (!status?.switching || status?.unstable) {
        return null
    }

    const { percent, remainingSeconds } = getSwitchProgress()
    const targetName = status.switchingTarget ? getServiceName(status.switchingTarget) : '目标服务'

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
                        {formatRemainingTime(remainingSeconds)}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        预计剩余时间
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
                        background: 'rgba(22,119,255,0.08)',
                        border: '1px solid rgba(22,119,255,0.2)',
                    }}
                />
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
