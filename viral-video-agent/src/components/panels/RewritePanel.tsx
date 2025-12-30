import { Button, Input, Space, message, Typography, Divider, Tag, Progress, Modal } from 'antd'
import { BulbOutlined, CopyOutlined, DownOutlined, RightOutlined, ThunderboltOutlined, FireOutlined, CheckCircleOutlined, SyncOutlined } from '@ant-design/icons'
import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore'
import { auditCopyText, LEGAL_AUDIT_BASIS, type LegalAuditReport } from '../../services/legalAuditService'

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

    const [legalAuditRunning, setLegalAuditRunning] = useState<Record<number, boolean>>({})
    const [legalAuditProgress, setLegalAuditProgress] = useState<Record<number, number>>({})
    const [legalAuditReports, setLegalAuditReports] = useState<Record<number, LegalAuditReport>>({})
    const [legalOptimizeRunning, setLegalOptimizeRunning] = useState<Record<number, boolean>>({})
    const legalAuditTimersRef = useRef<Record<number, ReturnType<typeof setInterval>>>({})
    const [legalAuditModalIndex, setLegalAuditModalIndex] = useState<number | null>(null)

    const { batchCopies, originalCopy, setRewrittenCopy, setPreview, updateBatchRewrittenCopy, setDigitalHumanSelectedCopy } = useAppStore()

    const clearLegalAuditTimer = (index: number) => {
        const timer = legalAuditTimersRef.current[index]
        if (timer) clearInterval(timer)
        delete legalAuditTimersRef.current[index]
    }

    useEffect(() => {
        return () => {
            Object.keys(legalAuditTimersRef.current).forEach((key) => {
                const idx = Number(key)
                const timer = legalAuditTimersRef.current[idx]
                if (timer) clearInterval(timer)
            })
            legalAuditTimersRef.current = {}
        }
    }, [])

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

    const getAuditStatusTag = (status: LegalAuditReport['status']) => {
        if (status === 'pass') return <Tag color="green">通过</Tag>
        if (status === 'attention') return <Tag color="gold">建议优化</Tag>
        return <Tag color="red">高风险</Tag>
    }

    const getLegalAuditPhaseText = (percent: number) => {
        if (percent < 20) return '正在加载各平台规则库与广告法要点...'
        if (percent < 45) return '正在扫描违禁词/敏感词/导流表达...'
        if (percent < 70) return '正在核验绝对化用语、收益承诺、医疗功效等高风险点...'
        if (percent < 90) return '正在结合常见限流触发点进行二次交叉检查...'
        return '正在生成合规建议与替换方案...'
    }

    const getLegalAuditCheckSteps = (percent: number) => {
        const steps = [
            { until: 15, title: '加载规则库', desc: '社区规范 / 广告法 / 常见审核点' },
            { until: 35, title: '扫描引流&联系方式', desc: '微信 / 二维码 / 手机号 / 站外导流' },
            { until: 55, title: '扫描敏感/违禁词', desc: '涉赌涉黄涉毒、武器等高风险内容' },
            { until: 75, title: '核验高风险承诺', desc: '功效/医疗承诺、收益承诺、绝对化用语' },
            { until: 90, title: '复核限流触发点', desc: '强指令引导、夸大对比等常见触发点' },
            { until: 100, title: '生成合规建议', desc: '替换建议 + 一键优化' },
        ]

        const prevUntil = (i: number) => (i <= 0 ? 0 : steps[i - 1].until)
        return steps.map((s, i) => {
            const done = percent >= s.until
            const active = !done && percent >= prevUntil(i)
            return { ...s, done, active }
        })
    }

    const startLegalAudit = (index: number) => {
        if (legalAuditRunning[index]) return
        const sourceText = String(rewrittenResults[index] || '').trim()
        if (!sourceText) {
            message.warning('请先生成原创文案，再进行一键法务检查')
            return
        }

        const report = auditCopyText(sourceText)
        setLegalAuditReports((prev) => ({ ...prev, [index]: report }))
        setLegalAuditRunning((prev) => ({ ...prev, [index]: true }))
        setLegalAuditProgress((prev) => ({ ...prev, [index]: 0 }))
        setLegalAuditModalIndex(index)

        clearLegalAuditTimer(index)
        const startAt = Date.now()
        const totalMs = 20000

        legalAuditTimersRef.current[index] = setInterval(() => {
            const elapsed = Date.now() - startAt
            const percent = Math.min(99, Math.floor((elapsed / totalMs) * 100))
            setLegalAuditProgress((prev) => ({ ...prev, [index]: percent }))

            if (elapsed >= totalMs) {
                clearLegalAuditTimer(index)
                setLegalAuditProgress((prev) => ({ ...prev, [index]: 100 }))
                setLegalAuditRunning((prev) => ({ ...prev, [index]: false }))
                setLegalAuditModalIndex((prev) => (prev === index ? null : prev))

                if (report.status === 'pass') message.success('法务体检完成：未发现明显违禁/限流风险词（仅供参考）')
                else if (report.status === 'attention') message.warning('法务体检完成：发现可优化表达，建议一键优化后再发布')
                else message.error('法务体检完成：发现高风险表达，建议先一键优化再发布')
            }
        }, 120)
    }

    const applyLegalAuditSuggestion = (index: number) => {
        if (legalAuditRunning[index] || legalOptimizeRunning[index]) return

        const report = legalAuditReports[index]
        const currentText = String(rewrittenResults[index] || '')
        const suggestedText = String(report?.suggestedText || '').trim()

        const applyNextText = (nextText: string) => {
            const title = String(copies[index]?.title || '逐字稿').trim() || '逐字稿'
            setRewrittenResults((prev) => ({ ...prev, [index]: nextText }))
            setRewrittenCopy(nextText)
            setPreview('text', nextText)
            setDigitalHumanSelectedCopy({ title, copy: nextText })
            if (batchCopies.length > 0) {
                updateBatchRewrittenCopy(index, title, nextText)
            }
        }

        // 1) 有可直接替换的建议：优先走规则替换（最快）
        if (suggestedText && suggestedText !== currentText.trim()) {
            applyNextText(suggestedText)
            message.success('已应用法务替换建议')
            return
        }

        // 2) 否则：对“命中句子”做局部 AI 改写（不重写全文）
        const instances = Array.isArray(report?.instances) ? report!.instances : []
        if (instances.length === 0) {
            message.warning('暂无可优化的命中内容')
            return
        }
        if (!window.electronAPI?.rewriteCopy) {
            message.error('AI 接口未就绪，请重启应用')
            return
        }

        const punctuation = new Set(['。', '！', '？', '!', '?', '\n', '…', '；', ';'])
        const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
        const findSentenceStart = (text: string, pos: number) => {
            const p = clamp(pos, 0, text.length)
            for (let i = p - 1; i >= 0; i--) {
                if (punctuation.has(text[i])) return i + 1
            }
            return 0
        }
        const findSentenceEnd = (text: string, pos: number) => {
            const p = clamp(pos, 0, text.length)
            for (let i = p; i < text.length; i++) {
                if (punctuation.has(text[i])) return i + 1
            }
            return text.length
        }

        const rangesMap = new Map<string, { start: number; end: number; terms: string[] }>()
        for (const inst of instances) {
            const s = findSentenceStart(currentText, inst.start)
            const e = findSentenceEnd(currentText, inst.end)
            const key = `${s}-${e}`
            const entry = rangesMap.get(key) || { start: s, end: e, terms: [] }
            const term = String(inst.term || '').trim()
            if (term && !entry.terms.includes(term)) entry.terms.push(term)
            rangesMap.set(key, entry)
        }

        const ranges = Array.from(rangesMap.values())
            .filter((r) => r.end > r.start)
            .sort((a, b) => b.start - a.start)
            .slice(0, 5)

        if (ranges.length === 0) {
            message.warning('暂无可优化的句子片段')
            return
        }

        setLegalOptimizeRunning((prev) => ({ ...prev, [index]: true }))
        ;(async () => {
            try {
                let nextText = currentText
                for (const r of ranges) {
                    const sentence = nextText.slice(r.start, r.end).trim()
                    if (!sentence) continue
                    const termsText = r.terms.length > 0 ? `重点处理这些词：${r.terms.join('、')}。` : ''
                    const instruction = [
                        '你是短视频平台合规编辑。',
                        '请只改写下面这句话，使其合规。',
                        termsText,
                        '要求：',
                        '1) 保留原意和语气，尽量少改字；',
                        '2) 不扩写，不新增信息，不改写其它句子；',
                        '3) 避免导流/联系方式/站外引导；',
                        '4) 避免绝对化承诺与收益承诺；',
                        '5) 只输出改写后的这句话，不要解释。',
                    ].filter(Boolean).join('\n')

                    const rewrittenSentenceRaw = await window.electronAPI.rewriteCopy(sentence, 'custom', instruction)
                    const rewrittenSentence = String(rewrittenSentenceRaw || '').trim()
                    if (!rewrittenSentence) continue
                    nextText = nextText.slice(0, r.start) + rewrittenSentence + nextText.slice(r.end)
                }

                const finalText = String(nextText || '').trim()
                if (!finalText || finalText === currentText.trim()) {
                    message.warning('未生成可替换的优化结果，可尝试重新检查或手动修改')
                    return
                }
                applyNextText(finalText)
                message.success('已按命中句子完成 AI 合规优化')
            } catch (e: any) {
                message.error(`AI 优化失败：${e?.message || '请重试'}`)
            } finally {
                setLegalOptimizeRunning((prev) => ({ ...prev, [index]: false }))
            }
        })()
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
            <Modal
                open={legalAuditModalIndex !== null && !!legalAuditRunning[legalAuditModalIndex]}
                centered
                footer={null}
                closable
                maskClosable
                onCancel={() => setLegalAuditModalIndex(null)}
                width={760}
                styles={{
                    content: {
                        background: 'linear-gradient(135deg, rgba(146,84,222,0.20), rgba(0,212,170,0.10))',
                        border: '1px solid rgba(146,84,222,0.28)',
                        borderRadius: 18,
                        color: '#fff',
                    },
                }}
            >
                {legalAuditModalIndex !== null && (
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            <div>
                                <div style={{ fontSize: 22, fontWeight: 900, color: '#fff' }}>🛡️ 一键法务检查进行中</div>
                                <div style={{ marginTop: 6, fontSize: 16, color: 'rgba(255,255,255,0.80)', lineHeight: 1.6 }}>
                                    我们把每一步“检查什么”都展示出来，约 20 秒，让你能看清楚、也更放心发布。
                                </div>
                            </div>
                            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', fontWeight: 800 }}>
                                {Math.max(0, legalAuditProgress[legalAuditModalIndex] || 0)}%
                            </div>
                        </div>

                        <div style={{ marginTop: 16 }}>
                            <Progress
                                percent={legalAuditProgress[legalAuditModalIndex] || 0}
                                status="active"
                                strokeColor={{ from: '#9254de', to: '#00d4aa' }}
                                trailColor="rgba(255,255,255,0.10)"
                                strokeWidth={10}
                            />
                            <div style={{ marginTop: 10, fontSize: 16, color: 'rgba(255,255,255,0.86)', lineHeight: 1.65 }}>
                                {getLegalAuditPhaseText(legalAuditProgress[legalAuditModalIndex] || 0)}
                            </div>
                        </div>

                        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            {getLegalAuditCheckSteps(legalAuditProgress[legalAuditModalIndex] || 0).map((s) => (
                                <div
                                    key={s.title}
                                    style={{
                                        padding: 12,
                                        borderRadius: 14,
                                        border: '1px solid rgba(255,255,255,0.10)',
                                        background: s.active ? 'rgba(0,212,170,0.10)' : 'rgba(0,0,0,0.18)',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        {s.done ? (
                                            <CheckCircleOutlined style={{ color: '#00d4aa', fontSize: 16 }} />
                                        ) : s.active ? (
                                            <SyncOutlined spin style={{ color: '#d3adf7', fontSize: 16 }} />
                                        ) : (
                                            <RightOutlined style={{ color: 'rgba(255,255,255,0.45)', fontSize: 14 }} />
                                        )}
                                        <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>{s.title}</div>
                                    </div>
                                    <div style={{ marginTop: 6, fontSize: 14, color: 'rgba(255,255,255,0.70)', lineHeight: 1.55 }}>{s.desc}</div>
                                </div>
                            ))}
                        </div>

                        <div style={{ marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                            提示：本检查为风险辅助工具，仅供参考；最终以平台审核为准。
                        </div>
                    </div>
                )}
            </Modal>
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

                                                        {/* 预设风格标签 - 仅在自定义模式下显示 */}
                                                        {rewriteMode[index] === 'custom' && (
                                                            <div>
                                                                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginBottom: 10 }}>您可以点击下方标签快速填充创作指令：</div>
                                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                                                    {PRESET_STYLES.map(style => (
                                                                        <Tag
                                                                            key={style.label}
                                                                            style={{ cursor: 'pointer', padding: '6px 16px', borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', fontSize: 14 }}
                                                                            onClick={() => {
                                                                                setCustomInstructions(prev => ({ ...prev, [index]: style.value }));
                                                                            }}
                                                                        >
                                                                            {style.label}
                                                                        </Tag>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

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

                                                {/* 第四层：AI 法务检查 */}
                                                {rewrittenResults[index] && (
                                                    <div style={{
                                                        marginTop: 16,
                                                        background: 'linear-gradient(135deg, rgba(146,84,222,0.10), rgba(0,212,170,0.06))',
                                                        border: '1px solid rgba(146,84,222,0.22)',
                                                        borderRadius: 18,
                                                        padding: 20,
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                                            <div>
                                                                <div style={{ fontSize: 18, fontWeight: 900, color: '#d3adf7' }}>🛡️ 一键AI法务检查</div>
                                                                <div style={{ marginTop: 6, fontSize: 13, color: 'rgba(255,255,255,0.60)' }}>
                                                                    扫描违禁词/敏感词、导流表达、绝对化用语、常见限流句式，输出替换建议。
                                                                </div>
                                                            </div>
                                                            <Button
                                                                type="primary"
                                                                loading={!!legalAuditRunning[index]}
                                                                onClick={() => startLegalAudit(index)}
                                                                style={{
                                                                    height: 44,
                                                                    padding: '0 18px',
                                                                    borderRadius: 12,
                                                                    border: 'none',
                                                                    fontWeight: 900,
                                                                    background: 'linear-gradient(135deg, #9254de, #00d4aa)',
                                                                }}
                                                            >
                                                                {legalAuditProgress[index] === 100 ? '重新检查' : '一键法务'}
                                                            </Button>
                                                        </div>

                                                        {legalAuditRunning[index] ? (
                                                            <div style={{ marginTop: 14 }}>
                                                                <Progress
                                                                    percent={legalAuditProgress[index] || 0}
                                                                    status="active"
                                                                    strokeColor={{ from: '#9254de', to: '#00d4aa' }}
                                                                    trailColor="rgba(255,255,255,0.08)"
                                                                />
                                                                <div style={{ marginTop: 8, fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.80)' }}>
                                                                    {getLegalAuditPhaseText(legalAuditProgress[index] || 0)}
                                                                </div>
                                                                <div style={{ marginTop: 12, fontSize: 13, color: 'rgba(255,255,255,0.60)' }}>
                                                                    <div style={{ fontWeight: 700, marginBottom: 8, color: 'rgba(255,255,255,0.72)' }}>检查依据（来源）：</div>
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                                        {LEGAL_AUDIT_BASIS.map((item) => (
                                                                            <div key={item} style={{ display: 'flex', gap: 8, lineHeight: 1.6 }}>
                                                                                <span style={{ color: '#d3adf7' }}>•</span>
                                                                                <span>{item}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : legalAuditProgress[index] === 100 && legalAuditReports[index] ? (
                                                            <div style={{ marginTop: 14 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                                                    {getAuditStatusTag(legalAuditReports[index].status)}
                                                                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)' }}>
                                                                        风险分：<span style={{ color: '#fff', fontWeight: 800 }}>{legalAuditReports[index].score}</span>/100
                                                                    </span>
                                                                </div>
                                                                <div style={{ marginTop: 10, color: 'rgba(255,255,255,0.86)', lineHeight: 1.6 }}>
                                                                    {legalAuditReports[index].summary}
                                                                </div>

                                                                {legalAuditReports[index].hits?.length > 0 && (
                                                                    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                                        {legalAuditReports[index].hits.slice(0, 6).map((hit, i) => (
                                                                            <div
                                                                                key={`${hit.category}-${hit.term}-${i}`}
                                                                                style={{
                                                                                    background: 'rgba(255,255,255,0.03)',
                                                                                    border: '1px solid rgba(255,255,255,0.08)',
                                                                                    borderRadius: 14,
                                                                                    padding: '12px 14px',
                                                                                }}
                                                                            >
                                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                                                                    <div style={{ fontWeight: 800, color: 'rgba(255,255,255,0.88)' }}>{hit.category}</div>
                                                                                    <Tag color={hit.severity === 'high' ? 'red' : hit.severity === 'medium' ? 'gold' : 'blue'}>
                                                                                        {hit.severity.toUpperCase()}
                                                                                    </Tag>
                                                                                </div>
                                                                                <div style={{ marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.72)' }}>
                                                                                    命中：<span style={{ color: '#fff', fontWeight: 800 }}>{hit.term}</span> × {hit.count}
                                                                                </div>
                                                                                <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.58)', lineHeight: 1.6 }}>
                                                                                    建议：{hit.suggestion}
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {legalAuditReports[index]?.status !== 'pass' && (
                                                                    <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                                                                        {String(legalAuditReports[index].suggestedText || '').trim() && (
                                                                            <Button
                                                                                onClick={() => {
                                                                                    navigator.clipboard.writeText(String(legalAuditReports[index].suggestedText || ''))
                                                                                    message.success('已复制合规建议文案')
                                                                                }}
                                                                            >
                                                                                复制建议文本
                                                                            </Button>
                                                                        )}
                                                                        <Button
                                                                            type="primary"
                                                                            loading={!!legalOptimizeRunning[index]}
                                                                            disabled={
                                                                                (() => {
                                                                                    const report = legalAuditReports[index]
                                                                                    const currentText = String(rewrittenResults[index] || '').trim()
                                                                                    const suggestedText = String(report?.suggestedText || '').trim()
                                                                                    const hasSuggestionDiff = !!suggestedText && suggestedText !== currentText
                                                                                    const hasInstances = (report?.instances?.length || 0) > 0
                                                                                    return !(hasSuggestionDiff || hasInstances)
                                                                                })()
                                                                            }
                                                                            title={
                                                                                (() => {
                                                                                    const report = legalAuditReports[index]
                                                                                    const currentText = String(rewrittenResults[index] || '').trim()
                                                                                    const suggestedText = String(report?.suggestedText || '').trim()
                                                                                    const hasSuggestionDiff = !!suggestedText && suggestedText !== currentText
                                                                                    const hasInstances = (report?.instances?.length || 0) > 0
                                                                                    return hasSuggestionDiff || hasInstances ? undefined : '暂无可优化的命中内容'
                                                                                })()
                                                                            }
                                                                            onClick={() => applyLegalAuditSuggestion(index)}
                                                                            style={{
                                                                                borderRadius: 12,
                                                                                border: 'none',
                                                                                fontWeight: 900,
                                                                                background: 'linear-gradient(135deg, #9254de, #00d4aa)',
                                                                            }}
                                                                        >
                                                                            AI一键优化
                                                                        </Button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <div style={{ marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                                                                点击「一键法务」后，将以约 20 秒进度条展示完整合规核验过程，让你能看清每一步在检查什么。
                                                            </div>
                                                        )}
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
