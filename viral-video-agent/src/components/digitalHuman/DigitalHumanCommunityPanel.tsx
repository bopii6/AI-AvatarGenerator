import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, ExpandOutlined, PlayCircleOutlined, TagsOutlined, VideoCameraOutlined, AppstoreOutlined } from '@ant-design/icons'
import { Button, Empty, Input, Modal, Select, Space, Tag, Tooltip, Typography, message } from 'antd'
import { useMemo, useState } from 'react'
import type { DigitalHumanCommunityVideo } from '../../services/digitalHumanCommunity'
import { toMediaUrl } from '../../utils/mediaUrl'

const LIVE_MODE_KEY = 'digitalHuman.community.liveMode.v1'
const MY_INDUSTRY_KEY = 'digitalHuman.community.myIndustry.v1'
const UNTAGGED_FILTER = '__untagged__'

function formatTime(iso: string): string {
    try {
        const d = new Date(iso)
        if (Number.isNaN(d.getTime())) return iso
        return d.toLocaleString()
    } catch {
        return iso
    }
}

function VideoTile(props: {
    item: DigitalHumanCommunityVideo
    onPlay: (item: DigitalHumanCommunityVideo) => void
    onDelete: (id: string) => void
}) {
    const { item, onPlay, onDelete } = props
    const src = toMediaUrl(item.videoPath)
    const [hover, setHover] = useState(false)

    return (
        <div
            style={{
                position: 'relative',
                borderRadius: 12,
                overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.1)',
                background: '#000',
                aspectRatio: '9/16',
                cursor: 'pointer',
            }}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
            onClick={() => onPlay(item)}
        >
            <video
                src={src}
                muted
                playsInline
                preload="metadata"
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: 'block',
                    opacity: hover ? 0.7 : 1,
                    transition: 'opacity 0.2s'
                }}
                onLoadedMetadata={(e) => {
                    const el = e.currentTarget
                    if (el.currentTime < 0.1) el.currentTime = 0.1
                }}
            />

            {/* Hover Overlay */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(0,0,0,0.2)',
                    opacity: hover ? 1 : 0,
                    transition: 'opacity 0.2s',
                    pointerEvents: 'none',
                }}
            >
                <PlayCircleOutlined style={{ fontSize: 48, color: '#fff', filter: 'drop-shadow(0 0 15px rgba(0,0,0,0.6))' }} />
            </div>

            {/* AI Visual Badge (Always Visible) */}
            <div
                style={{
                    position: 'absolute',
                    top: 8,
                    left: 8,
                    background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(4px)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 4,
                    padding: '2px 6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    pointerEvents: 'none',
                }}
            >
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00d4aa', boxShadow: '0 0 8px #00d4aa' }} />
                <span style={{ color: '#fff', fontSize: 10, fontWeight: 600 }}>AI 数字人</span>
            </div>

            {/* Quick Actions (Delete) */}
            <div
                style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    opacity: hover ? 1 : 0,
                    transition: 'all 0.2s',
                    transform: hover ? 'translateY(0)' : 'translateY(-5px)',
                }}
            >
                <Tooltip title="从列表移除">
                    <Button
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', borderColor: 'rgba(255,255,255,0.1)' }}
                        onClick={(e) => {
                            e.stopPropagation()
                            onDelete(item.id)
                        }}
                    />
                </Tooltip>
            </div>
        </div>
    )
}

/**
 * 社区作品触发器组件
 * 包含：打开按钮 + 统计标签 + 清空按钮
 */
export function DigitalHumanCommunityTrigger(props: {
    items: DigitalHumanCommunityVideo[]
    onOpen: () => void
    onClear: () => void
    industryCount: number
}) {
    const { items, onOpen, onClear, industryCount } = props
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Button type="default" icon={<ExpandOutlined />} onClick={onOpen} style={{ borderRadius: 12 }}>
                社区作品
            </Button>
            <Tag color="blue" style={{ marginInlineStart: 0 }}>
                {items.length}
            </Tag>
            {industryCount > 0 && (
                <Tag
                    icon={<TagsOutlined />}
                    color="default"
                    style={{
                        marginInlineStart: 0,
                        border: 'none',
                        background: 'rgba(255,255,255,0.06)',
                        borderRadius: 999,
                        padding: '2px 10px',
                        color: 'rgba(255,255,255,0.7)',
                    }}
                >
                    已收录 {industryCount} 个行业
                </Tag>
            )}
            <Tooltip title="清空（不删除本地文件，仅移除列表）">
                <Button size="small" danger onClick={onClear} disabled={items.length === 0}>
                    清空
                </Button>
            </Tooltip>
        </div>
    )
}

/**
 * 社区作品模态框组件
 * 包含：模态框的所有逻辑（直播模式、筛选、排序、播放等）
 */
export function DigitalHumanCommunityModal(props: {
    items: DigitalHumanCommunityVideo[]
    open: boolean
    onClose: () => void
    onPlayPath: (videoPath: string) => void
    onDelete: (id: string) => void
    onUpdate: (id: string, patch: Partial<Pick<DigitalHumanCommunityVideo, 'industry' | 'sortOrder' | 'title'>>) => void
    onMove: (id: string, direction: 'up' | 'down') => void
}) {
    const { items, open, onClose, onPlayPath, onDelete, onUpdate, onMove } = props
    const [playerOpen, setPlayerOpen] = useState(false)
    const [playerItem, setPlayerItem] = useState<DigitalHumanCommunityVideo | null>(null)
    const [query, setQuery] = useState('')
    const [sortMode, setSortMode] = useState<'industry' | 'newest' | 'manual'>('industry')
    const [industryFilter, setIndustryFilter] = useState<string>('all')
    const [industryEditingId, setIndustryEditingId] = useState<string | null>(null)
    const [industryDraft, setIndustryDraft] = useState('')
    const [myIndustry, setMyIndustry] = useState<string>(() => {
        try {
            return String(localStorage.getItem(MY_INDUSTRY_KEY) || '').trim()
        } catch {
            return ''
        }
    })
    const [myIndustryDraft, setMyIndustryDraft] = useState('')

    // 直播展示模式 state
    const [liveMode, setLiveMode] = useState<boolean>(() => {
        try {
            return localStorage.getItem(LIVE_MODE_KEY) === 'true'
        } catch {
            return false
        }
    })

    const toggleLiveMode = () => {
        const next = !liveMode
        setLiveMode(next)
        try {
            localStorage.setItem(LIVE_MODE_KEY, String(next))
        } catch {
            // ignore
        }
        // 切换到直播模式时重置筛选
        if (next) {
            setQuery('')
            setIndustryFilter('all')
        }
    }

    const industries = useMemo(() => {
        const list = Array.from(new Set(items.map((it) => String(it.industry || '').trim()).filter(Boolean)))
        return list.sort((a, b) => a.localeCompare(b, 'zh-CN'))
    }, [items])

    const industryStats = useMemo(() => {
        const counts = new Map<string, number>()
        let untagged = 0
        for (const it of items) {
            const ind = String(it.industry || '').trim()
            if (!ind) {
                untagged += 1
                continue
            }
            counts.set(ind, (counts.get(ind) || 0) + 1)
        }
        const sorted = Array.from(counts.entries())
            .map(([industry, count]) => ({ industry, count }))
            .sort((a, b) => (b.count - a.count) || a.industry.localeCompare(b.industry, 'zh-CN'))
        return { sorted, untagged, industryCount: counts.size, total: items.length }
    }, [items])

    const pickIndustryColor = (name: string): string => {
        const palette = ['geekblue', 'purple', 'cyan', 'magenta', 'gold', 'lime', 'volcano', 'green']
        let hash = 0
        for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
        return palette[hash % palette.length]
    }

    const sorted = useMemo(() => {
        const list = [...items]
        if (sortMode === 'manual') {
            return list.sort((a, b) => {
                const d = (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
                if (d !== 0) return d
                return String(b.createdAt).localeCompare(String(a.createdAt))
            })
        }
        if (sortMode === 'industry') {
            return list.sort((a, b) => {
                const ai = String(a.industry || '').trim()
                const bi = String(b.industry || '').trim()
                if (ai && !bi) return -1
                if (!ai && bi) return 1
                const d = ai.localeCompare(bi, 'zh-CN')
                if (d !== 0) return d
                return String(b.createdAt).localeCompare(String(a.createdAt))
            })
        }
        return list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    }, [items, sortMode])

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        const base = industryFilter === 'all'
            ? sorted
            : industryFilter === UNTAGGED_FILTER
                ? sorted.filter((it) => !String(it.industry || '').trim())
                : sorted.filter((it) => String(it.industry || '').trim() === industryFilter)
        if (!q) return base
        return base.filter((it) => `${it.title} ${it.avatarName || ''} ${it.industry || ''}`.toLowerCase().includes(q))
    }, [industryFilter, query, sorted])

    const saveMyIndustry = (value: string) => {
        const next = String(value || '').trim()
        setMyIndustry(next)
        setMyIndustryDraft(next)
        try {
            if (next) localStorage.setItem(MY_INDUSTRY_KEY, next)
            else localStorage.removeItem(MY_INDUSTRY_KEY)
        } catch {
            // ignore
        }
    }

    const applyMyIndustryFilter = () => {
        const next = String(myIndustryDraft || '').trim()
        if (!next) {
            message.warning('请先输入你的行业')
            return
        }
        saveMyIndustry(next)
        setIndustryFilter(next)
        if (!industries.includes(next)) {
            message.info(`社区暂未收录「${next}」，你可以先给自己的作品设置行业标签（点作品下方“设置行业”）`)
        }
    }

    const handlePlay = (item: DigitalHumanCommunityVideo) => {
        setPlayerItem(item)
        setPlayerOpen(true)
    }

    return (
        <>
            <Modal
                title={
                    liveMode ? (
                        /* 直播模式：品牌标题居中 + 模式切换按钮右侧 */
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', paddingRight: 32 }}>
                            <div className="live-mode-brand-header">
                                <span className="live-mode-brand-360">360行</span>
                                <span className="live-mode-brand-ai">AI数字获客系统</span>
                            </div>
                            <div
                                className={`live-mode-toggle active`}
                                onClick={toggleLiveMode}
                                style={{ position: 'absolute', right: 32, top: '50%', transform: 'translateY(-50%)' }}
                            >
                                <AppstoreOutlined className="live-mode-toggle-icon" />
                                <span className="live-mode-toggle-text">普通模式</span>
                            </div>
                        </div>
                    ) : (
                        /* 普通模式：显示标题和切换按钮 */
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 32 }}>
                            <span>社区作品库</span>
                            <div
                                className="live-mode-toggle"
                                onClick={toggleLiveMode}
                            >
                                <VideoCameraOutlined className="live-mode-toggle-icon" />
                                <span className="live-mode-toggle-text">直播展示</span>
                            </div>
                        </div>
                    )
                }
                open={open}
                onCancel={onClose}
                footer={null}
                width={liveMode ? '95vw' : 1120}
                style={liveMode ? { top: 20 } : undefined}
                styles={{
                    body: { paddingTop: liveMode ? 16 : 12 },
                    content: liveMode ? { maxWidth: 1600, margin: '0 auto' } : undefined
                }}
            >
                {liveMode ? (
                    /* ========== 直播展示模式 ========== */
                    <div className="live-mode-container">
                        {/* DeepSeek 合作徽章 */}
                        <div style={{ textAlign: 'center', marginBottom: 16 }}>
                            <div className="live-mode-deepseek-badge">
                                <span>联合</span>
                                <img src="https://chat.deepseek.com/favicon.svg" alt="DeepSeek" className="deepseek-logo" />
                                <span className="deepseek-text">deepseek</span>
                                <span>创作</span>
                            </div>
                        </div>
                        {/* 超大行业按钮网格 - 核心展示区 */}
                        <div className="live-mode-industry-grid">
                            <div
                                className={`live-mode-industry-btn ${industryFilter === 'all' ? 'active' : ''}`}
                                onClick={() => setIndustryFilter('all')}
                            >
                                <span className="live-mode-industry-name">全部行业</span>
                            </div>
                            {industryStats.sorted.map(({ industry }) => (
                                <div
                                    key={industry}
                                    className={`live-mode-industry-btn ${industryFilter === industry ? 'active' : ''}`}
                                    onClick={() => setIndustryFilter(industry)}
                                >
                                    <span className="live-mode-industry-name">{industry}</span>
                                </div>
                            ))}
                        </div>

                        {/* 大尺寸视频网格 */}
                        {filtered.length === 0 ? (
                            <div className="live-mode-empty">
                                <VideoCameraOutlined className="live-mode-empty-icon" />
                                <div className="live-mode-empty-text">
                                    {industryFilter !== 'all' ? `暂无「${industryFilter}」行业的作品` : '暂无作品'}
                                </div>
                            </div>
                        ) : (
                            <div className="live-mode-video-grid">
                                {filtered.map((it) => (
                                    <div
                                        key={it.id}
                                        className="live-mode-video-tile"
                                        onClick={() => handlePlay(it)}
                                    >
                                        {/* AI数字人标识角标 */}
                                        <div className="live-mode-video-ai-badge">AI数字人</div>
                                        <video
                                            src={toMediaUrl(it.videoPath)}
                                            muted
                                            playsInline
                                            preload="metadata"
                                            onLoadedMetadata={(e) => {
                                                const el = e.currentTarget
                                                if (el.currentTime < 0.1) el.currentTime = 0.1
                                            }}
                                        />
                                        <PlayCircleOutlined className="live-mode-play-icon" />
                                        <div className="live-mode-video-overlay">
                                            <div className="live-mode-video-title">{it.title || '未命名'}</div>
                                            {it.industry && (
                                                <div className="live-mode-video-industry">{it.industry}</div>
                                            )}
                                        </div>
                                        {/* 底部光效装饰 */}
                                        <div className="live-mode-video-glow" />
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* 版权声明 */}
                        <div className="live-mode-disclaimer">
                            此克隆视频，不做商业用途，只做AI编程教学
                        </div>
                    </div>
                ) : (
                    /* ========== 普通模式 ========== */
                    <>
                        <div
                            style={{
                                borderRadius: 14,
                                padding: 16,
                                marginBottom: 18,
                                border: '1px solid rgba(255,255,255,0.08)',
                                background: 'linear-gradient(135deg, rgba(47,84,235,0.14), rgba(114,46,209,0.08))',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                <div style={{ minWidth: 280, flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <TagsOutlined style={{ color: 'rgba(255,255,255,0.9)' }} />
                                        <Typography.Text strong style={{ fontSize: 15, color: 'rgba(255,255,255,0.9)' }}>
                                            行业总览
                                        </Typography.Text>
                                        <Tag
                                            color="default"
                                            style={{
                                                margin: 0,
                                                border: 'none',
                                                background: 'rgba(0,0,0,0.25)',
                                                borderRadius: 999,
                                                padding: '2px 10px',
                                            }}
                                        >
                                            已收录 {industryStats.industryCount} 个行业 · 共 {industryStats.total} 条作品
                                        </Tag>
                                    </div>

                                    <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                        <Input
                                            placeholder="输入你的行业（例：保险 / 房产 / 医美 / 教培）"
                                            value={myIndustryDraft}
                                            onChange={(e) => setMyIndustryDraft(e.target.value)}
                                            allowClear
                                            style={{ maxWidth: 360, borderRadius: 10 }}
                                        />
                                        <Button onClick={() => saveMyIndustry(myIndustryDraft)} disabled={!myIndustryDraft.trim()}>
                                            设为我的行业
                                        </Button>
                                        <Button type="primary" onClick={applyMyIndustryFilter} disabled={!myIndustryDraft.trim()}>
                                            按我的行业展示
                                        </Button>
                                        {myIndustry ? (
                                            <Tag
                                                color={industries.includes(myIndustry) ? pickIndustryColor(myIndustry) : 'default'}
                                                style={{ margin: 0, borderRadius: 999, padding: '3px 10px' }}
                                            >
                                                我的行业：{myIndustry}
                                            </Tag>
                                        ) : null}
                                    </div>

                                    <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        {industryStats.sorted.slice(0, 16).map(({ industry, count }) => (
                                            <Tag
                                                key={industry}
                                                color={pickIndustryColor(industry)}
                                                style={{
                                                    margin: 0,
                                                    cursor: 'pointer',
                                                    borderRadius: 999,
                                                    padding: '4px 10px',
                                                    fontSize: 13,
                                                    border: industryFilter === industry ? '1px solid rgba(255,255,255,0.55)' : 'none',
                                                }}
                                                onClick={() => setIndustryFilter(industry)}
                                            >
                                                {industry} · {count}
                                            </Tag>
                                        ))}
                                        {industryStats.untagged > 0 && (
                                            <Tag
                                                color="default"
                                                style={{
                                                    margin: 0,
                                                    cursor: 'pointer',
                                                    borderRadius: 999,
                                                    padding: '4px 10px',
                                                    fontSize: 13,
                                                    background: 'rgba(0,0,0,0.25)',
                                                    border: industryFilter === UNTAGGED_FILTER ? '1px solid rgba(255,255,255,0.55)' : 'none',
                                                }}
                                                onClick={() => setIndustryFilter(UNTAGGED_FILTER)}
                                            >
                                                未设置行业 · {industryStats.untagged}
                                            </Tag>
                                        )}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <Tag
                                        color="default"
                                        style={{
                                            margin: 0,
                                            border: 'none',
                                            background: 'rgba(0,0,0,0.25)',
                                            borderRadius: 999,
                                            padding: '2px 10px',
                                        }}
                                    >
                                        提示：点作品下方「设置行业」可补齐标签
                                    </Tag>
                                    <Button
                                        size="small"
                                        onClick={() => {
                                            setIndustryFilter('all')
                                            setQuery('')
                                        }}
                                    >
                                        重置筛选
                                    </Button>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
                            <Input
                                placeholder="搜索 标题 / 形象 / 行业"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                allowClear
                                style={{ maxWidth: 400, borderRadius: 8 }}
                            />
                            <Space size={12} wrap>
                                <Select
                                    value={sortMode}
                                    onChange={(v) => setSortMode(v)}
                                    style={{ width: 120 }}
                                    bordered={false}
                                    dropdownStyle={{ borderRadius: 12 }}
                                    options={[
                                        { label: '按行业', value: 'industry' },
                                        { label: '最新优先', value: 'newest' },
                                        { label: '手动排序', value: 'manual' },
                                    ]}
                                />
                                <Select
                                    value={industryFilter}
                                    onChange={(v) => setIndustryFilter(v)}
                                    style={{ width: 130 }}
                                    bordered={false}
                                    dropdownStyle={{ borderRadius: 12 }}
                                    options={[
                                        { label: '全部行业', value: 'all' },
                                        { label: industryStats.untagged > 0 ? `未设置行业 (${industryStats.untagged})` : '未设置行业', value: UNTAGGED_FILTER },
                                        ...industries.map((it) => ({ label: it, value: it })),
                                    ]}
                                />
                                <Tag color="default" style={{ border: 'none', background: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: '2px 12px' }}>
                                    共 {filtered.length} 条
                                </Tag>
                            </Space>
                        </div>

                        {filtered.length === 0 ? (
                            <Empty
                                description={
                                    industryFilter !== 'all' && industryFilter !== UNTAGGED_FILTER
                                        ? `暂无「${industryFilter}」行业的作品（你可以先给自己的作品打上行业标签）`
                                        : '暂无作品'
                                }
                                style={{ margin: '60px 0' }}
                            />
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 24 }}>
                                {filtered.map((it) => (
                                    <div key={it.id} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <VideoTile item={it} onPlay={handlePlay} onDelete={onDelete} />
                                        <div style={{ minWidth: 0, paddingLeft: 4 }}>
                                            <div style={{
                                                fontSize: 14,
                                                fontWeight: 600,
                                                color: 'rgba(255,255,255,0.9)',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                {it.title || '未命名'}
                                            </div>
                                            <div style={{
                                                fontSize: 12,
                                                color: 'rgba(255,255,255,0.45)',
                                                marginTop: 2
                                            }}>
                                                {formatTime(it.createdAt)}
                                            </div>
                                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                                                {it.avatarName ? (
                                                    <Tag color="purple" style={{ margin: 0, fontSize: 11, borderRadius: 4, background: 'rgba(146,84,222,0.1)', border: 'none' }}>
                                                        {it.avatarName}
                                                    </Tag>
                                                ) : null}
                                                <Tag
                                                    color={it.industry ? 'geekblue' : 'default'}
                                                    style={{
                                                        margin: 0,
                                                        fontSize: 12,
                                                        borderRadius: 999,
                                                        cursor: 'pointer',
                                                        background: it.industry ? 'rgba(47,84,235,0.1)' : 'rgba(255,255,255,0.05)',
                                                        border: it.industry ? '1px solid rgba(47,84,235,0.18)' : 'none',
                                                        padding: '2px 10px',
                                                    }}
                                                    onClick={() => {
                                                        setIndustryEditingId(it.id)
                                                        setIndustryDraft(String(it.industry || ''))
                                                    }}
                                                >
                                                    {it.industry ? it.industry : '设置行业'}
                                                </Tag>

                                                {sortMode === 'manual' && (
                                                    <Space size={4} style={{ marginLeft: 'auto' }}>
                                                        <Button size="small" type="text" icon={<ArrowUpOutlined style={{ fontSize: 12 }} />} onClick={() => onMove(it.id, 'up')} />
                                                        <Button size="small" type="text" icon={<ArrowDownOutlined style={{ fontSize: 12 }} />} onClick={() => onMove(it.id, 'down')} />
                                                    </Space>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </Modal>

            <Modal
                title={playerItem?.title ? `播放：${playerItem.title}` : '播放'}
                open={playerOpen}
                onCancel={() => {
                    setPlayerOpen(false)
                    setPlayerItem(null)
                }}
                footer={null}
                width={400} // Narrower for vertical
                destroyOnClose
            >
                {playerItem ? (
                    <>
                        <video
                            src={toMediaUrl(playerItem.videoPath)}
                            controls
                            autoPlay
                            style={{
                                width: '100%',
                                maxHeight: '75vh', // Prevent overflow on short screens
                                borderRadius: 10,
                                background: '#000',
                                display: 'block'
                            }}
                            onError={() => {
                                message.error('视频播放失败：请确认文件存在且格式为 mp4')
                            }}
                        />
                        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: playerItem.videoPath }}>
                                {playerItem.videoPath}
                            </Typography.Text>
                            <Button
                                size="small"
                                onClick={() => {
                                    onPlayPath(playerItem.videoPath)
                                    setPlayerOpen(false)
                                    setPlayerItem(null)
                                    onClose()
                                }}
                            >
                                在预览区打开
                            </Button>
                        </div>
                    </>
                ) : null}
            </Modal>

            <Modal
                title="设置行业"
                open={industryEditingId !== null}
                onCancel={() => setIndustryEditingId(null)}
                onOk={() => {
                    if (!industryEditingId) return
                    const next = industryDraft.trim()
                    onUpdate(industryEditingId, { industry: next || undefined })
                    setIndustryEditingId(null)
                }}
                okText="保存"
                cancelText="取消"
                destroyOnClose
            >
                <Input
                    placeholder="例如：教育 / 财税 / 医美 / 情感..."
                    value={industryDraft}
                    onChange={(e) => setIndustryDraft(e.target.value)}
                    allowClear
                />
                <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {industries.slice(0, 12).map((it) => (
                        <Tag key={it} style={{ cursor: 'pointer' }} onClick={() => setIndustryDraft(it)}>
                            {it}
                        </Tag>
                    ))}
                </div>
            </Modal>
        </>
    )
}

// 默认导出（为了兼容，可能需要，但我们主要使用命名导出）
export default function DigitalHumanCommunityPanel(props: {
    items: DigitalHumanCommunityVideo[]
    onPlayPath: (videoPath: string) => void
    onDelete: (id: string) => void
    onClear: () => void
    onUpdate: (id: string, patch: Partial<Pick<DigitalHumanCommunityVideo, 'industry' | 'sortOrder' | 'title'>>) => void
    onMove: (id: string, direction: 'up' | 'down') => void
}) {
    // 这是一个组合组件，用于兼容以前的用法
    const [open, setOpen] = useState(false)
    const { items, onPlayPath, onDelete, onClear, onUpdate, onMove } = props

    // 计算 industryCount (逻辑复用)
    const industryCount = useMemo(() => {
        const set = new Set(items.map((it) => String(it.industry || '').trim()).filter(Boolean))
        return set.size
    }, [items])

    return (
        <>
            <DigitalHumanCommunityTrigger
                items={items}
                onOpen={() => setOpen(true)}
                onClear={onClear}
                industryCount={industryCount}
            />
            <DigitalHumanCommunityModal
                items={items}
                open={open}
                onClose={() => setOpen(false)}
                onPlayPath={onPlayPath}
                onDelete={onDelete}
                onUpdate={onUpdate}
                onMove={onMove}
            />
        </>
    )
}
