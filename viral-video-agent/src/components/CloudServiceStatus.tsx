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

    const refresh = useCallback(async () => {
        setLoading(true)
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
            setLoading(false)
        }
    }, [kind])

    useEffect(() => {
        refresh()
    }, [refresh])

    const text = (() => {
        if (loading) return '检测中...'
        if (!status?.online) return '未连接'
        return '已连接'
    })()

    const tooltip = (() => {
        if (loading) return undefined
        const endpoint = (status?.endpoint || '').trim()
        const provider = (status?.provider || '').trim()
        const parts = [
            kind === 'voice' ? '语音服务' : '数字人服务',
            provider ? `provider=${provider}` : null,
            endpoint ? `endpoint=${endpoint}` : null,
            status?.message ? `message=${status.message}` : null,
        ].filter(Boolean)
        return parts.join('\n')
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
                ...style,
            }}
        >
            {icon}
            <Typography.Text style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>
                {kind === 'voice' ? '语音：' : '数字人：'}{text}
            </Typography.Text>
        </div>
    )

    return tooltip ? <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{tooltip}</span>}>{content}</Tooltip> : content
}
