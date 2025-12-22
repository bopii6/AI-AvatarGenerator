import { Button, Input, Space, message, Typography, Divider, Tag } from 'antd'
import { BulbOutlined, CopyOutlined, DownOutlined, RightOutlined, ThunderboltOutlined, FireOutlined, CheckCircleOutlined, SyncOutlined } from '@ant-design/icons'
import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/appStore'

const { TextArea } = Input

type RewriteMode = 'auto' | 'custom'

// 预设指令风格
const PRESET_STYLES = [
    { label: '🔥 爆款带货', value: '用极其夸张和抓人的语调改写，强调产品痛点和即刻下单的冲动感，适合短视频带货。' },
    { label: '😂 幽默反转', value: '在文案中加入冷幽默或意想不到的情节反转，让观众在笑声中看完视频，增加完播率。' },
    { label: '🎓 专业科普', value: '用通俗易懂但显得专业的口吻改写，建立行业权威感，适合知识分享类账号。' },
    { label: '🎭 情感共鸣', value: '走心风格，挖掘人性深处的情感需求，引发观众强烈的评论和转发欲望。' },
    { label: '⚡ 极简干货', value: '去冗长、提重点，用最短的文字传达最高的信息量，节奏感极强。' }
]

function RewritePanel() {
    const [expandedIndex, setExpandedIndex] = useState<number | null>(0)
    const [rewriteMode, setRewriteMode] = useState<{ [key: number]: RewriteMode }>({})
    const [customInstructions, setCustomInstructions] = useState<{ [key: number]: string }>({})
    const [loadingIndex, setLoadingIndex] = useState<number | null>(null)
    const [rewrittenResults, setRewrittenResults] = useState<{ [key: number]: string }>({})
    const [analyzing, setAnalyzing] = useState(false)
    const [analysisResult, setAnalysisResult] = useState<string>('')
    const [syncTime, setSyncTime] = useState<string>('')

    const { batchCopies, originalCopy, setRewrittenCopy, setPreview, updateBatchRewrittenCopy, setDigitalHumanSelectedCopy } = useAppStore()

    // 记录同步时间
    useEffect(() => {
        setSyncTime(new Date().toLocaleTimeString())
    }, [])

    useEffect(() => {
        setPreview('text', '')
    }, [setPreview])

    const copies = batchCopies.length > 0
        ? batchCopies
        : originalCopy
            ? [{ title: '已抓取视频', copy: originalCopy }]
            : []

    const parseAnalysis = (text: string) => {
        if (!text) return [];
        const sections = [
            { title: '🎯 核心钩子', key: '【核心钩子】' },
            { title: '📈 爆款公式', key: '【爆款公式】' },
            { title: '🧠 情绪锚点', key: '【情绪锚点】' },
            { title: '📝 金句模板', key: '【金句模板】' },
        ];

        const results: { title: string; content: string }[] = [];
        sections.forEach((s, i) => {
            const nextKey = sections[i + 1]?.key;
            let start = text.indexOf(s.key);
            if (start !== -1) {
                start += s.key.length;
                let end = nextKey ? text.indexOf(nextKey) : text.length;
                if (end === -1 || (nextKey && end < start)) end = text.length;
                const chunk = text.substring(start, end).trim();
                if (chunk) results.push({ title: s.title, content: chunk });
            }
        });

        if (results.length === 0) return [{ title: 'AI 分析摘要', content: text }];
        return results;
    }

    const handleAnalyze = async () => {
        if (copies.length === 0) {
            message.warning('没有可分析的文案')
            return
        }

        setAnalyzing(true)
        try {
            const allCopyText = copies.map((c, i) => `【视频${i + 1}】${c.title}\n${c.copy}`).join('\n\n---\n\n')
            const result = await window.electronAPI?.invoke('analyze-copy-pattern', allCopyText)
            if (result?.success && result.data) {
                setAnalysisResult(result.data)
                setPreview('text', `🔍 智能分析结果\n\n${result.data}`)
                message.success('分析完成!')
            } else {
                throw new Error(result?.error || '分析失败')
            }
        } catch (error: any) {
            message.error(`分析失败: ${error.message}`)
        } finally {
            setAnalyzing(false)
        }
    }

    const handleRewrite = async (index: number) => {
        const copy = copies[index]
        if (!copy) return

        const mode = rewriteMode[index] || 'auto'
        let instruction = customInstructions[index]

        // 如果是一键仿写模式，且有分析结果，则组合指令
        if (mode === 'auto' && analysisResult) {
            instruction = `请参考以下爆款规律进行仿写改写：\n${analysisResult}\n\n要求：保持原意核心，但应用上述规律提升表达张力。`
        }

        setLoadingIndex(index)
        try {
            const result = await window.electronAPI?.rewriteCopy(
                copy.copy,
                mode,
                instruction
            )

            if (result?.success && result.data) {
                setRewrittenResults(prev => ({ ...prev, [index]: result.data! }))
                setRewrittenCopy(result.data)
                updateBatchRewrittenCopy(index, copy.title, result.data)
                setDigitalHumanSelectedCopy({ title: copy.title, copy: result.data })
                setPreview('text', `✅ 改写结果（${copy.title}）\n\n${result.data}`)
                message.success('改写成功！')
            } else {
                throw new Error(result?.error || '改写失败')
            }
        } catch (error: any) {
            message.error(`改写失败: ${error.message}`)
        } finally {
            setLoadingIndex(null)
        }
    }

    if (copies.length === 0) {
        return (
            <div style={{ background: '#12141a', padding: '100px 40px', textAlign: 'center', borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)', margin: '20px', color: '#fff' }}>
                <div style={{ fontSize: 60, marginBottom: 20, opacity: 0.3 }}>🧊</div>
                <Typography.Title level={4} style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 400 }}>暂无待处理素材</Typography.Title>
            </div>
        )
    }

    const analyzedSections = parseAnalysis(analysisResult);

    return (
        <div style={{ backgroundColor: '#12141a', minHeight: '100%', padding: '24px', color: '#fff', position: 'relative' }}>
            {/* 同步状态验证器 */}
            <div style={{ position: 'absolute', top: 5, right: 10, display: 'flex', alignItems: 'center', gap: 6, opacity: 0.4 }}>
                <SyncOutlined spin={analyzing} style={{ fontSize: 10, color: '#00d4aa' }} />
                <span style={{ fontSize: 10, color: '#00d4aa', fontWeight: 700 }}>v2.4 SYNCED @ {syncTime}</span>
            </div>

            <Space direction="vertical" style={{ width: '100%' }} size={32}>

                {/* --- 智能规律展示 (分析区) --- */}
                <div style={{
                    backgroundColor: 'rgba(20, 22, 26, 0.95)',
                    borderRadius: 16,
                    padding: '24px',
                    border: '1px solid rgba(255, 215, 0, 0.25)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{ background: 'linear-gradient(135deg, #ffd700, #ffa500)', width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <BulbOutlined style={{ fontSize: 24, color: '#000' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>智能爆款规律分析</div>
                                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>自动拆解对标视频的火爆基因</div>
                            </div>
                        </div>
                        <Button
                            type="primary"
                            onClick={handleAnalyze}
                            loading={analyzing}
                            icon={<ThunderboltOutlined />}
                            style={{ height: 48, padding: '0 32px', background: 'linear-gradient(135deg, #ffd700, #f39c12)', borderColor: 'transparent', color: '#000', fontWeight: 900, borderRadius: 10 }}
                        >
                            {analysisResult ? '重新深度分析' : '一键总结爆款规律'}
                        </Button>
                    </div>

                    {analysisResult ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                            {analyzedSections.map((s, i) => (
                                <div key={i} style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: '16px 20px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                                    <div style={{ color: '#ffd700', fontWeight: 800, fontSize: 15, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>{s.title}</div>
                                    <div style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(255,255,255,0.9)', whiteSpace: 'pre-wrap' }}>{s.content}</div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,0.3)', backgroundColor: 'rgba(255,255,255,0.01)', borderRadius: 12, border: '1px dashed rgba(255,255,255,0.1)' }}>
                            点上方按钮，AI 即可拆解出这些视频的“钩子”与“模板”
                        </div>
                    )}
                </div>

                {/* --- 文案改写清单 (工作区) --- */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
                        <FireOutlined style={{ fontSize: 24, color: 'var(--primary-color)' }} />
                        <span style={{ fontSize: 22, fontWeight: 900 }}>改写工作台 ({copies.length})</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        {copies.map((copy, index) => {
                            const isExpanded = expandedIndex === index
                            const hasResult = !!rewrittenResults[index]

                            return (
                                <div key={index} style={{
                                    backgroundColor: isExpanded ? '#1e2128' : '#16181c',
                                    borderRadius: 20,
                                    border: `1px solid ${hasResult ? 'rgba(0,212,170,0.5)' : 'rgba(255,255,255,0.1)'}`,
                                    overflow: 'hidden',
                                    transition: 'all 0.3s ease'
                                }}>
                                    <div onClick={() => setExpandedIndex(isExpanded ? null : index)} style={{ padding: '24px 30px', display: 'flex', alignItems: 'center', gap: 20, cursor: 'pointer' }}>
                                        <div style={{ background: hasResult ? 'var(--primary-color)' : 'rgba(255,255,255,0.1)', color: hasResult ? '#000' : '#fff', width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 16 }}>
                                            {index + 1}
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 18, fontWeight: 700, color: isExpanded ? 'var(--primary-color)' : '#fff' }}>{copy.title}</div>
                                            {!isExpanded && <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 500 }}>{copy.copy.substring(0, 150)}...</div>}
                                        </div>
                                        {hasResult && <Tag color="success" icon={<CheckCircleOutlined />}>已改写</Tag>}
                                        {isExpanded ? <DownOutlined style={{ opacity: 0.5 }} /> : <RightOutlined style={{ opacity: 0.3 }} />}
                                    </div>

                                    {isExpanded && (
                                        <div style={{ padding: '0 30px 30px 30px', animation: 'fadeIn 0.3s ease' }}>
                                            <Divider style={{ borderColor: 'rgba(255,255,255,0.06)', margin: '0 0 24px 0' }} />

                                            {/* v2.4 垂直堆叠布局：彻底解决遮挡 */}
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

                                                {/* 第一层：视频原文 */}
                                                <div>
                                                    <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 12 }}>🎬 视频原文：</div>
                                                    <div style={{
                                                        background: '#0a0b0d',
                                                        padding: '20px',
                                                        borderRadius: 14,
                                                        maxHeight: 200,
                                                        overflowY: 'auto',
                                                        fontSize: 15,
                                                        lineHeight: 1.8,
                                                        color: 'rgba(255,255,255,0.85)',
                                                        border: '1px solid rgba(255,255,255,0.05)'
                                                    }}>
                                                        {copy.copy}
                                                    </div>
                                                    <Button icon={<CopyOutlined />} size="small" style={{ marginTop: 12, background: 'rgba(255,255,255,0.05)', border: 'none', color: '#888' }} onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(copy.copy); message.success('已复制原型') }}>复制原文</Button>
                                                </div>

                                                {/* 第二层：创作策略与操作按钮 (全宽显示，防遮挡) */}
                                                <div style={{ backgroundColor: 'rgba(255,255,255,0.02)', padding: '24px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <div style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>🛠️ 创作策略配置：</div>

                                                    <Space direction="vertical" style={{ width: '100%' }} size={20}>
                                                        {/* 模式切换 */}
                                                        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                                                            <Button
                                                                type={rewriteMode[index] !== 'custom' ? 'primary' : 'default'}
                                                                onClick={() => setRewriteMode(prev => ({ ...prev, [index]: 'auto' }))}
                                                                style={{ height: 44, flex: '1 1 220px', minWidth: 0, borderRadius: 10, fontWeight: 800, fontSize: 15 }}
                                                            >
                                                                ✨ 一键智能仿写 (全自动)
                                                            </Button>
                                                            <Button
                                                                type={rewriteMode[index] === 'custom' ? 'primary' : 'default'}
                                                                onClick={() => setRewriteMode(prev => ({ ...prev, [index]: 'custom' }))}
                                                                style={{ height: 44, flex: '1 1 220px', minWidth: 0, borderRadius: 10, fontWeight: 800, fontSize: 15 }}
                                                            >
                                                                ✍️ 自定义创作要求
                                                            </Button>
                                                        </div>

                                                        {/* 预设风格标签 */}
                                                        <div>
                                                            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginBottom: 10 }}>您可以点击下方标签快速填充创作指令：</div>
                                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                                                {PRESET_STYLES.map(style => (
                                                                    <Tag
                                                                        key={style.label}
                                                                        style={{ cursor: 'pointer', padding: '6px 16px', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', fontSize: 14 }}
                                                                        onClick={() => {
                                                                            setRewriteMode(prev => ({ ...prev, [index]: 'custom' }));
                                                                            setCustomInstructions(prev => ({ ...prev, [index]: style.value }));
                                                                        }}
                                                                    >
                                                                        {style.label}
                                                                    </Tag>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {rewriteMode[index] === 'custom' && (
                                                            <TextArea
                                                                placeholder="在此输入您的改写要求，例如：用反向吐槽的方式来写..."
                                                                rows={4}
                                                                value={customInstructions[index] || ''}
                                                                onChange={(e) => setCustomInstructions(prev => ({ ...prev, [index]: e.target.value }))}
                                                                style={{ background: 'rgba(0,0,0,0.3)', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: 12, padding: 16, fontSize: 15 }}
                                                            />
                                                        )}

                                                        <Button
                                                            type="primary"
                                                            icon={<ThunderboltOutlined />}
                                                            loading={loadingIndex === index}
                                                            onClick={() => handleRewrite(index)}
                                                            block
                                                            style={{
                                                                height: 56,
                                                                fontSize: 18,
                                                                fontWeight: 900,
                                                                background: 'linear-gradient(135deg, #00d4aa, #00b894)',
                                                                border: 'none',
                                                                boxShadow: '0 10px 30px rgba(0,212,170,0.4)',
                                                                borderRadius: 14
                                                            }}
                                                        >
                                                            立即生成优质原创文案
                                                        </Button>
                                                    </Space>
                                                </div>

                                                {/* 第三层：生成结果 */}
                                                {rewrittenResults[index] && (
                                                    <div style={{ animation: 'slideUp 0.3s ease', backgroundColor: 'rgba(0, 212, 170, 0.05)', padding: '24px', borderRadius: 18, border: '1px solid rgba(0, 212, 170, 0.2)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                                            <span style={{ fontSize: 16, color: '#00d4aa', fontWeight: 900 }}>🏆 AI 改写成品：</span>
                                                            <Button icon={<CopyOutlined />} type="link" style={{ color: '#00d4aa' }} onClick={() => { navigator.clipboard.writeText(rewrittenResults[index]); message.success('成品已复制') }}>复制成品全文</Button>
                                                        </div>
                                                        <div style={{ fontSize: 16, lineHeight: 1.9, color: '#fff' }}>
                                                            {rewrittenResults[index]}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                </div>
            </Space>

            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
                .ant-tag-clickable:hover { background-color: var(--primary-color) !important; color: #000 !important; cursor: pointer; }
                .ant-btn-default { background: rgba(255,255,255,0.05) !important; border: 1px solid rgba(255,255,255,0.1) !important; color: rgba(255,255,255,0.6) !important; }
                .ant-btn-default:hover { color: #fff !important; border-color: rgba(255,255,255,0.3) !important; }
            `}</style>
        </div>
    )
}

export default RewritePanel
