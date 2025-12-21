import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Card, Divider, Input, List, message, Space, Tag, Typography } from 'antd'

const platforms = [
    { key: 'douyin', label: '抖音', color: '#000000' },
    { key: 'shipinhao', label: '视频号', color: '#07c160' },
    { key: 'xiaohongshu', label: '小红书', color: '#fe2c55' },
]

type PlatformKey = 'douyin' | 'shipinhao' | 'xiaohongshu'

export default function CookieSettings() {
    const [cookiePlatform, setCookiePlatform] = useState<PlatformKey>('douyin')
    const [cookieUserName, setCookieUserName] = useState('')
    const [cookieJson, setCookieJson] = useState('')
    const [savingCookie, setSavingCookie] = useState(false)
    const [cookieList, setCookieList] = useState<Array<{ platform: string; userName: string; updatedAt: number; encrypted: boolean }>>([])

    const platformLabel = useMemo(() => {
        const map: Record<string, string> = { douyin: '抖音', shipinhao: '视频号', xiaohongshu: '小红书' }
        return map[cookiePlatform] || cookiePlatform
    }, [cookiePlatform])

    const refreshCookieList = async () => {
        try {
            const res = await window.electronAPI?.invoke('publish-cookie-list')
            if (res?.success && Array.isArray(res.data)) setCookieList(res.data)
        } catch {
            // ignore
        }
    }

    useEffect(() => {
        refreshCookieList()
    }, [])

    const [applyingCookie, setApplyingCookie] = useState(false)

    // 仅保存 Cookie（快速）
    const handleSaveCookie = async () => {
        setSavingCookie(true)
        try {
            const userName = cookieUserName.trim()
            const json = cookieJson.trim()
            if (!userName) throw new Error('请输入账号名称')
            if (!json) throw new Error('请输入 Cookie（JSON 或 Cookie 字符串）')
            if (!window.electronAPI?.invoke) throw new Error('桌面端接口未就绪，请重启应用')

            const saveRes = await window.electronAPI?.invoke('publish-cookie-save', {
                platform: cookiePlatform,
                userName,
                cookieJson: json,
            })
            if (!saveRes?.success) throw new Error(saveRes?.error || '保存失败')

            const formatHint = saveRes?.data?.format === 'cookie-header' ? '（已自动转换格式）' : ''
            message.success(`${platformLabel} Cookie 已保存${formatHint}`)
            setCookieJson('')
            await refreshCookieList()
        } catch (e: any) {
            message.error(e?.message || '保存失败')
        } finally {
            setSavingCookie(false)
        }
    }

    // 应用到分发中心（慢，需要安装 Python 依赖）
    const handleApplyToDistribution = async (platform: string, userName: string) => {
        setApplyingCookie(true)
        try {
            if (!window.electronAPI?.invoke) throw new Error('桌面端接口未就绪')
            message.loading({ content: '正在应用到分发中心（首次需要安装依赖，请耐心等待）...', key: 'apply', duration: 0 })
            const res = await window.electronAPI?.invoke('publish-cookie-apply', { platform, userName })
            message.destroy('apply')
            if (!res?.success) throw new Error(res?.error || '应用失败')
            message.success('已应用到分发中心')
        } catch (e: any) {
            message.destroy('apply')
            message.error({ content: e?.message || '应用失败', duration: 8 })
        } finally {
            setApplyingCookie(false)
        }
    }

    const handleDeleteCookie = async (platform: string, userName: string) => {
        try {
            const res = await window.electronAPI?.invoke('publish-cookie-delete', { platform, userName })
            if (!res?.success) throw new Error(res?.error || '删除失败')
            message.success('已删除本地 Cookie 记录')
            await refreshCookieList()
        } catch (e: any) {
            message.error(e.message)
        }
    }

    return (
        <Card size="small" title="账号登录（Cookie）" style={{ borderRadius: 12 }}>
            <Typography.Text type="secondary">
                不需要在后台配置 Cookie。每个用户只需首次登录时在本机粘贴一次 Cookie（JSON），系统会加密保存并同步到分发中心。
            </Typography.Text>
            <Divider style={{ margin: '12px 0' }} />

            <Alert
                type="info"
                showIcon
                message="提示"
                description="Cookie 属于敏感信息，请勿分享。建议使用平台官方账号/企业号发布，定期更新 Cookie。"
                style={{ marginBottom: 12 }}
            />

            <Space direction="vertical" style={{ width: '100%' }}>
                <Space wrap>
                    {platforms.map(p => (
                        <Button
                            key={p.key}
                            size="small"
                            type={cookiePlatform === p.key ? 'primary' : 'default'}
                            onClick={() => setCookiePlatform(p.key as PlatformKey)}
                        >
                            {p.label}
                        </Button>
                    ))}
                </Space>

                <Input
                    placeholder="账号名称（用于区分多个账号，例如：张三-主号）"
                    value={cookieUserName}
                    onChange={(e) => setCookieUserName(e.target.value)}
                />

                <Input.TextArea
                    placeholder="粘贴 Cookie JSON（推荐：插件导出）或 Cookie 字符串（形如 a=b; c=d）"
                    value={cookieJson}
                    onChange={(e) => setCookieJson(e.target.value)}
                    autoSize={{ minRows: 4, maxRows: 10 }}
                />

                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    推荐使用浏览器插件导出 JSON（Cookie-Editor / EditThisCookie）。如果你只有一串 Cookie（a=b; c=d），也可以直接粘贴，系统会自动转换。
                </Typography.Text>

                <Space>
                    <Button type="primary" loading={savingCookie} onClick={handleSaveCookie}>
                        保存
                    </Button>
                    <Button onClick={() => setCookieJson('')} disabled={!cookieJson}>
                        清空
                    </Button>
                </Space>

                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    💡 保存后即可用于抖音视频下载。如需使用「全网分发」功能，请在下方账号列表点击「应用到分发中心」。
                </Typography.Text>

                {cookieList.length > 0 && (
                    <>
                        <Divider style={{ margin: '12px 0' }} />
                        <div style={{ fontWeight: 500, marginBottom: 8 }}>已保存的账号</div>
                        <List
                            size="small"
                            dataSource={cookieList}
                            renderItem={(item) => (
                                <List.Item
                                    actions={[
                                        <Button
                                            key="apply"
                                            size="small"
                                            type="link"
                                            loading={applyingCookie}
                                            onClick={() => handleApplyToDistribution(item.platform, item.userName)}
                                        >
                                            应用到分发中心
                                        </Button>,
                                        <Button
                                            key="delete"
                                            size="small"
                                            danger
                                            onClick={() => handleDeleteCookie(item.platform, item.userName)}
                                        >
                                            删除
                                        </Button>
                                    ]}
                                >
                                    <Space>
                                        <Tag color="blue">{item.platform}</Tag>
                                        <span>{item.userName}</span>
                                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                            {new Date(item.updatedAt).toLocaleString()}
                                        </Typography.Text>
                                    </Space>
                                </List.Item>
                            )}
                        />
                    </>
                )}
            </Space>
        </Card>
    )
}
