import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Divider, Modal, Space, Typography, message } from 'antd'
import { LEGAL_DISCLAIMER_TEXT, LEGAL_DISCLAIMER_TITLE, LEGAL_DISCLAIMER_VERSION } from '../legal/disclaimer'
import { getLegalConsentStatus } from '../services/legalConsent'

type AuditPaths = {
    deviceId?: string
    consentFile?: string
    auditLogFile?: string
    auditLogDir?: string
}

export default function LegalComplianceSettings() {
    const [open, setOpen] = useState(false)
    const [consentInfo, setConsentInfo] = useState<{ accepted: boolean; acceptedAt?: string; source?: string; deviceId?: string }>({
        accepted: false,
    })
    const [paths, setPaths] = useState<AuditPaths>({})
    const [loadingPaths, setLoadingPaths] = useState(false)

    const refresh = async () => {
        const status = await getLegalConsentStatus()
        setConsentInfo({ accepted: status.accepted, acceptedAt: status.acceptedAt, source: status.source, deviceId: status.deviceId })
        if (!window.electronAPI?.invoke) return
        setLoadingPaths(true)
        try {
            const res = await window.electronAPI.invoke('legal-audit-get-paths')
            if (res?.success) setPaths(res.data || {})
        } catch {
            // ignore
        } finally {
            setLoadingPaths(false)
        }
    }

    useEffect(() => {
        void refresh()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const consentText = useMemo(() => {
        if (!consentInfo.accepted) return '未同意（将限制使用）'
        const at = consentInfo.acceptedAt ? `，时间：${consentInfo.acceptedAt}` : ''
        const src = consentInfo.source ? `，记录来源：${consentInfo.source}` : ''
        return `已同意${at}${src}`
    }, [consentInfo.accepted, consentInfo.acceptedAt, consentInfo.source])

    return (
        <Card size="small" title="法律与合规" style={{ borderRadius: 12 }}>
            <Alert
                type="warning"
                showIcon
                message="重要提示"
                description="数字人/克隆能力存在法律与合规风险。使用前请确保已获得必要授权，并严格禁止用于冒充、诈骗、侵权等违法用途。"
            />

            <Divider style={{ margin: '12px 0' }} />

            <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <div>
                    <Typography.Text strong>条款版本：</Typography.Text>
                    <Typography.Text>{LEGAL_DISCLAIMER_VERSION}</Typography.Text>
                </div>
                <div>
                    <Typography.Text strong>同意状态：</Typography.Text>
                    <Typography.Text>{consentText}</Typography.Text>
                </div>
                {consentInfo.deviceId ? (
                    <div>
                        <Typography.Text strong>设备标识：</Typography.Text>
                        <Typography.Text code>{consentInfo.deviceId}</Typography.Text>
                    </div>
                ) : null}

                <Space wrap>
                    <Button onClick={() => setOpen(true)}>查看完整条款</Button>
                    <Button onClick={() => void refresh()}>刷新</Button>
                </Space>

                <Divider style={{ margin: '8px 0' }} />

                <Typography.Text type="secondary">
                    审计日志用于“留证”。桌面端会写入到本机用户数据目录；如你配置了服务端接收端点，也可同步到服务器。
                </Typography.Text>

                <Space wrap>
                    <Button
                        disabled={!window.electronAPI?.invoke}
                        loading={loadingPaths}
                        onClick={async () => {
                            try {
                                const res = await window.electronAPI?.invoke('legal-audit-open-log-folder')
                                if (!res?.success) throw new Error(res?.error || '打开失败')
                            } catch (e: any) {
                                message.error(e?.message || '打开失败')
                            }
                        }}
                    >
                        打开审计日志目录
                    </Button>
                    <Button
                        disabled={!paths.auditLogFile}
                        onClick={async () => {
                            try {
                                await navigator.clipboard.writeText(paths.auditLogFile || '')
                                message.success('已复制日志路径')
                            } catch {
                                message.warning('复制失败，请手动复制')
                            }
                        }}
                    >
                        复制日志路径
                    </Button>
                    <Button
                        disabled={!paths.consentFile}
                        onClick={async () => {
                            try {
                                await navigator.clipboard.writeText(paths.consentFile || '')
                                message.success('已复制同意记录路径')
                            } catch {
                                message.warning('复制失败，请手动复制')
                            }
                        }}
                    >
                        复制同意记录路径
                    </Button>
                </Space>

                {(paths.auditLogFile || paths.consentFile) ? (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {paths.auditLogFile ? `audit: ${paths.auditLogFile} ` : ''}
                        {paths.consentFile ? `consent: ${paths.consentFile}` : ''}
                    </Typography.Text>
                ) : null}
            </Space>

            <Modal
                title={LEGAL_DISCLAIMER_TITLE}
                open={open}
                onCancel={() => setOpen(false)}
                footer={[
                    <Button key="close" type="primary" onClick={() => setOpen(false)}>
                        关闭
                    </Button>,
                ]}
                width={820}
                destroyOnClose
            >
                <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                    {LEGAL_DISCLAIMER_TEXT}
                </Typography.Paragraph>
            </Modal>
        </Card>
    )
}

