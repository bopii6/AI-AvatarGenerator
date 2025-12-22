/**
 * GPU 服务状态显示组件
 * 
 * 根据调度器状态显示统一的服务状态，避免用户困惑：
 * - 调度器在线 + 当前服务匹配 → 绿色"云端已连接"
 * - 调度器在线 + 当前服务不匹配 → 黄色"云端就绪（需切换，约 30-120 秒）"
 * - 调度器切换中 → 蓝色"切换中... 剩余 X 秒"
 * - 调度器离线 → 红色"云端未连接"
 */

import React from 'react'
import { Typography, Tooltip, Progress } from 'antd'
import { SyncOutlined, CheckCircleFilled, CloseCircleFilled, ClockCircleOutlined } from '@ant-design/icons'
import { useGpuScheduler } from '../contexts/GpuSchedulerContext'
import { ServiceType } from '../services/gpuSchedulerService'

interface GpuServiceStatusProps {
    /** 当前功能需要的服务类型 */
    requiredService: ServiceType
    /** 是否显示详细信息 */
    showDetails?: boolean
    /** 自定义样式 */
    style?: React.CSSProperties
}

type StatusType = 'online' | 'ready' | 'switching' | 'offline'

interface StatusBadgeProps {
    type: StatusType
    text: string
    percent?: number
    tooltip?: string
}

function StatusBadge({ type, text, percent, tooltip }: StatusBadgeProps) {
    const styles: Record<StatusType, { bg: string; border: string; color: string; icon: React.ReactNode }> = {
        online: {
            bg: 'rgba(82,196,26,0.15)',
            border: '1px solid rgba(82,196,26,0.28)',
            color: '#52c41a',
            icon: <CheckCircleFilled style={{ marginRight: 6 }} />,
        },
        ready: {
            bg: 'rgba(250,173,20,0.15)',
            border: '1px solid rgba(250,173,20,0.28)',
            color: '#faad14',
            icon: <ClockCircleOutlined style={{ marginRight: 6 }} />,
        },
        switching: {
            bg: 'rgba(22,119,255,0.15)',
            border: '1px solid rgba(22,119,255,0.28)',
            color: '#1677ff',
            icon: <SyncOutlined spin style={{ marginRight: 6 }} />,
        },
        offline: {
            bg: 'rgba(255,77,79,0.15)',
            border: '1px solid rgba(255,77,79,0.28)',
            color: '#ff4d4f',
            icon: <CloseCircleFilled style={{ marginRight: 6 }} />,
        },
    }

    const style = styles[type]

    const content = (
        <div
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '6px 12px',
                borderRadius: 999,
                background: style.bg,
                border: style.border,
                whiteSpace: 'nowrap',
            }}
        >
            {style.icon}
            <Typography.Text
                style={{
                    fontSize: 12,
                    color: style.color,
                    fontWeight: 600,
                }}
            >
                {text}
            </Typography.Text>
            {type === 'switching' && percent !== undefined && (
                <Progress
                    type="circle"
                    percent={percent}
                    size={16}
                    strokeColor={style.color}
                    trailColor="rgba(255,255,255,0.1)"
                    showInfo={false}
                    style={{ marginLeft: 8 }}
                />
            )}
        </div>
    )

    if (tooltip) {
        return <Tooltip title={tooltip}>{content}</Tooltip>
    }

    return content
}

export function GpuServiceStatus({ requiredService, showDetails = false, style }: GpuServiceStatusProps) {
    const { status, loading, getSwitchProgress, getServiceName } = useGpuScheduler()

    if (loading || !status) {
        return (
            <div style={style}>
                <StatusBadge type="offline" text="检测中..." />
            </div>
        )
    }

    // 调度器离线
    if (!status.online) {
        return (
            <div style={style}>
                <StatusBadge
                    type="offline"
                    text="云端未连接"
                    tooltip={status.error || '无法连接调度器服务：请检查服务器配置与网络；如开启代理（如 Clash/7890），请将服务器 IP 加入直连/NO_PROXY'}
                />
            </div>
        )
    }

    // 正在切换中
    if (status.switching) {
        const { percent, remainingSeconds } = getSwitchProgress()
        const targetName = status.switchingTarget ? getServiceName(status.switchingTarget) : '目标服务'
        return (
            <div style={style}>
                <StatusBadge
                    type="switching"
                    text={`切换至${targetName}... ${remainingSeconds > 0 ? `${remainingSeconds}秒` : ''}`}
                    percent={percent}
                    tooltip="GPU 显存有限，正在切换云端服务，请稍候"
                />
            </div>
        )
    }

    // 连接不稳定：短暂失败但近期曾成功
    if (status.unstable) {
        return (
            <div style={style}>
                <StatusBadge
                    type="ready"
                    text="连接不稳定，重试中..."
                    tooltip={status.error || '网络抖动导致短暂失败，正在自动重试'}
                />
            </div>
        )
    }

    // 当前服务正是所需服务
    if (status.currentService === requiredService) {
        return (
            <div style={style}>
                <StatusBadge type="online" text="云端已连接" />
            </div>
        )
    }

    // 当前服务与所需服务不同，但调度器在线
    const currentName = status.currentService ? getServiceName(status.currentService) : '无'
    const requiredName = getServiceName(requiredService)

    return (
        <div style={style}>
            <StatusBadge
                type="ready"
                text="云端就绪"
                tooltip={`当前运行「${currentName}」服务，使用「${requiredName}」功能时将自动切换，首次约 30-120 秒`}
            />
            {showDetails && (
                <Typography.Text
                    type="secondary"
                    style={{ fontSize: 11, marginLeft: 8 }}
                >
                    首次使用需切换，约 30-120 秒
                </Typography.Text>
            )}
        </div>
    )
}

export default GpuServiceStatus
