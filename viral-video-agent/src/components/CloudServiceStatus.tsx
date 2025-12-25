import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Typography, Tooltip } from 'antd'
import { CheckCircleFilled, CloseCircleFilled, SyncOutlined } from '@ant-design/icons'

type ServiceKind = 'voice' | 'gpu'

type ServiceStatus = {
    online: boolean
    message?: string
    endpoint?: string
    provider?: string
}

export default function CloudServiceStatus(props: { kind: ServiceKind; style?: CSSProperties }) {
    const { kind, style } = props
    const [loading, setLoading] = useState(true)
    const [status, setStatus] = useState<ServiceStatus | null>(null)

    const refresh = useCallback(async (opts?: { silent?: boolean }) => {
        if (!opts?.silent) setLoading(true)
        try {
            const channel = kind === 'voice' ? 'cloud-voice-check-status' : 'cloud-gpu-check-status'
            const res = await window.electronAPI?.invoke(channel)
            if (res?.success && res.data) {
                setStatus(res.data)
            } else {
                setStatus({ online: false, message: res?.error || '连接失败' })
            }
        } catch (e: any) {
            setStatus({ online: false, message: e?.message || '连接失败' })
        } finally {
            if (!opts?.silent) setLoading(false)
        }
    }, [kind])

    useEffect(() => {
        refresh()
        const timer = setInterval(() => {
            refresh({ silent: true })
        }, 30000)
        return () => clearInterval(timer)
    }, [refresh])

    const text = (() => {
        if (loading) return '检测中...'
        if (!status?.online) return '未连接'
        return '已连接'
    })()

    const tooltip = (() => {
        if (loading) return undefined
        const serviceName = kind === 'voice' ? '语音服务' : '数字人服务'
        const lines = [serviceName]
        if (status?.message) lines.push(status.message)
        return lines.join('\n')
    })()

    const icon = loading
        ? <SyncOutlined spin style={{ marginRight: 6, color: 'rgba(255,255,255,0.45)' }} />
        : status?.online
            ? <CheckCircleFilled style={{ marginRight: 6, color: '#52c41a' }} />
            : <CloseCircleFilled style={{ marginRight: 6, color: '#ff4d4f' }} />

    const bg = loading
        ? 'rgba(255,255,255,0.06)'
        : status?.online
            ? 'rgba(82,196,26,0.12)'
            : 'rgba(255,77,79,0.10)'

    const border = loading
        ? '1px solid rgba(255,255,255,0.10)'
        : status?.online
            ? '1px solid rgba(82,196,26,0.25)'
            : '1px solid rgba(255,77,79,0.22)'

    const content = (
        <div
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '6px 12px',
                borderRadius: 999,
                background: bg,
                border,
                cursor: 'pointer',
                ...style,
            }}
        >
            {icon}
            <Typography.Text style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
                {kind === 'voice' ? '语音：' : '数字人：'}{text}
            </Typography.Text>
        </div>
    )

    const node = tooltip ? <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{tooltip}</span>}>{content}</Tooltip> : content
    return <span onClick={() => refresh()}>{node}</span>
}
