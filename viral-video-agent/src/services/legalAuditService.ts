export type LegalAuditSeverity = 'high' | 'medium' | 'low'
export type LegalAuditStatus = 'pass' | 'attention' | 'risk'

export interface LegalAuditHit {
    category: string
    term: string
    count: number
    severity: LegalAuditSeverity
    reason: string
    suggestion: string
}

export interface LegalAuditInstance {
    start: number
    end: number
    term: string
    category: string
    severity: LegalAuditSeverity
}

export interface LegalAuditReport {
    status: LegalAuditStatus
    score: number
    summary: string
    hits: LegalAuditHit[]
    instances: LegalAuditInstance[]
    suggestedText: string
}

export const LEGAL_AUDIT_BASIS = [
    '参考抖音/视频号/小红书等平台公开的社区规范、广告规范与常见审核要点（敏感/违禁/导流/夸大承诺等）',
    '参考《广告法》对“最/第一/百分百/永久/零风险”等绝对化用语的合规要求',
    '结合短视频常见限流触发点：站外导流（微信/二维码/手机号）、功效/医疗承诺、收益承诺等',
    '提示：本检查为风险辅助工具，仅供参考，不构成法律意见；最终以平台审核与实际发布效果为准',
] as const

type RuleBase = {
    id: string
    category: string
    severity: LegalAuditSeverity
    reason: string
    suggestion: string
    replacement?: string | ((match: string) => string)
    hitTerm?: string | ((match: string) => string)
}

type TermsRule = RuleBase & {
    type: 'terms'
    terms: string[]
    flags?: string
}

type RegexRule = RuleBase & {
    type: 'regex'
    regex: RegExp
}

type Rule = TermsRule | RegexRule

const ABSOLUTE_AD_WORD_REPLACEMENTS: Record<string, string> = {
    '全网最好': '更受欢迎',
    '全网最': '更受欢迎',
    '史上最': '相当',
    '第一': '更有优势',
    '唯一': '比较少见',
    '顶级': '高品质',
    '国家级': '更专业的',
    '世界级': '更高水平的',
    '最好': '更合适',
    '最强': '更强',
    '最佳': '更优',
    '最便宜': '更划算',
    '绝对': '更',
    '永久': '长期',
    '永远': '长期',
    '百分百': '更高比例',
    '100%': '更高比例',
    '零风险': '风险更可控',
    '零门槛': '门槛更低',
    '万能': '多场景适用',
}

function getAbsoluteAdWordReplacement(term: string) {
    return ABSOLUTE_AD_WORD_REPLACEMENTS[term] || '更'
}

const MONEY_PROMISE_REPLACEMENTS: Record<string, string> = {
    '稳赚不赔': '风险更可控（仍需评估）',
    '保证赚钱': '更有机会（不保证收益）',
    '稳赚': '更有机会',
    '必赚': '更有机会',
    '躺赚': '更轻松一些',
    '暴富': '提升收入',
    '翻倍': '提升',
    '日入': '每天增加',
    '月入': '每月增加',
    '年入': '每年增加',
}

function getMoneyPromiseReplacement(term: string) {
    return MONEY_PROMISE_REPLACEMENTS[term] || '更有机会'
}

function withAutoReplacements(rules: Rule[]): Rule[] {
    return rules.map((rule) => {
        if (rule.id === 'absolute_ad_words' && rule.type === 'terms' && !rule.replacement) {
            return { ...rule, replacement: (term: string) => getAbsoluteAdWordReplacement(term) }
        }
        if (rule.id === 'money_promises' && rule.type === 'terms' && !rule.replacement) {
            return { ...rule, replacement: (term: string) => getMoneyPromiseReplacement(term) }
        }
        return rule
    })
}

const RULES: Rule[] = withAutoReplacements([
    {
        id: 'private_traffic_keywords',
        type: 'regex',
        category: '引流/联系方式',
        severity: 'high',
        reason: '站外导流/留联系方式通常会触发平台风控或限流',
        suggestion: '建议删除站外联系方式，改为“平台内咨询/私信/评论区领取”（尽量避免明示加好友/二维码）。',
        regex: /(加\s*(微信|威信|v信|vx|v)|微信号|vx号|v信|威信|微\s*信|vx[:：]|微信[:：]|二维码|wechat|weixin)/gi,
        hitTerm: '站外导流/联系方式',
        replacement: '（请在平台内咨询）',
    },
    {
        id: 'private_traffic_phone',
        type: 'regex',
        category: '引流/联系方式',
        severity: 'high',
        reason: '直接出现手机号/固话会显著提升风控与限流概率',
        suggestion: '建议删除号码或用“平台内咨询/私信”替代，不要直接暴露联系方式。',
        regex: /\b(1[3-9]\d{9}|\d{3,4}-?\d{7,8})\b/g,
        hitTerm: '手机号/电话',
        replacement: '（联系方式已隐藏）',
    },
    {
        id: 'gambling_drugs_weapons',
        type: 'terms',
        category: '高风险违禁内容',
        severity: 'high',
        reason: '涉黄赌毒枪等违禁内容可能导致限流/封禁',
        suggestion: '建议立即删除相关表述，避免触碰平台红线。',
        terms: [
            '赌博',
            '博彩',
            '六合彩',
            '百家乐',
            '时时彩',
            '老虎机',
            '大麻',
            '冰毒',
            'K粉',
            '枪',
            '炸药',
        ],
    },
    {
        id: 'medical_claims',
        type: 'terms',
        category: '功效/医疗承诺',
        severity: 'high',
        reason: '医疗功效/治疗承诺属于高风险，极易触发审核',
        suggestion: '避免“治疗/治愈/根治/无副作用”等承诺，可改为体验分享与主观感受描述，并增加“因人而异”。',
        terms: [
            '包治百病',
            '药到病除',
            '治疗',
            '治愈',
            '根治',
            '无副作用',
            '立竿见影',
            '三天见效',
        ],
    },
    {
        id: 'absolute_ad_words',
        type: 'terms',
        category: '广告法绝对化用语',
        severity: 'medium',
        reason: '绝对化/最高级用语可能引发合规风险或降低推荐',
        suggestion: '建议用相对表达替代（如“更/比较/不少人觉得”），避免“最/第一/顶级/百分百”等绝对表述。',
        terms: [
            '全网最低',
            '全网最',
            '史上最',
            '第一',
            '唯一',
            '顶级',
            '国家级',
            '世界级',
            '最佳',
            '最强',
            '最好',
            '最便宜',
            '绝对',
            '永久',
            '永远',
            '百分百',
            '100%',
            '零风险',
            '零门槛',
            '万能',
        ],
    },
    {
        id: 'money_promises',
        type: 'terms',
        category: '收益/承诺用语',
        severity: 'medium',
        reason: '“稳赚/必赚/暴富”等收益承诺容易触发风控',
        suggestion: '建议避免收益承诺，改为过程分享与风险提示（如“仅供参考”“不构成建议”）。',
        terms: [
            '稳赚',
            '必赚',
            '躺赚',
            '暴富',
            '翻倍',
            '日入',
            '月入',
            '年入',
            '稳赚不赔',
            '保证赚钱',
        ],
    },
    {
        id: 'engagement_cta',
        type: 'terms',
        category: '疑似限流引导语',
        severity: 'low',
        reason: '过强的互动/引导语在部分场景可能影响推荐或触发审核',
        suggestion: '建议把“强指令”改为自然表达（如“欢迎交流/一起讨论”），避免反复引导。',
        terms: [
            '点赞关注',
            '关注我',
            '点个关注',
            '点个赞',
            '转发',
            '收藏',
            '点我头像',
            '进主页',
            '评论区',
            '置顶',
            '私信我',
            '私信',
            '加群',
        ],
    },
])

function escapeRegExp(input: string) {
    return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function ensureGlobal(regex: RegExp) {
    const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`
    return new RegExp(regex.source, flags)
}

function collectMatches(content: string, regex: RegExp) {
    const globalRegex = regex.global ? regex : ensureGlobal(regex)
    globalRegex.lastIndex = 0
    const matches: RegExpExecArray[] = []
    let match: RegExpExecArray | null

    while ((match = globalRegex.exec(content)) !== null) {
        matches.push(match)

        if (match[0] === '') {
            globalRegex.lastIndex += 1
        }
    }

    globalRegex.lastIndex = 0
    return matches
}

function severityRank(severity: LegalAuditSeverity) {
    switch (severity) {
        case 'high':
            return 3
        case 'medium':
            return 2
        case 'low':
            return 1
        default:
            return 0
    }
}

function getHitTerm(rule: Rule, match: string) {
    if (typeof rule.hitTerm === 'function') return rule.hitTerm(match)
    if (typeof rule.hitTerm === 'string') return rule.hitTerm
    return match
}

function getReplacement(rule: Rule, match: string) {
    if (typeof rule.replacement === 'function') return rule.replacement(match)
    return rule.replacement
}

export function auditCopyText(text: string): LegalAuditReport {
    const content = (text || '').toString()
    const instances: LegalAuditInstance[] = []
    const hitsByKey = new Map<string, LegalAuditHit>()

    if (!content.trim()) {
        return {
            status: 'pass',
            score: 0,
            summary: '暂无可检查的文案',
            hits: [],
            instances: [],
            suggestedText: '',
        }
    }

    let suggestedText = content

    for (const rule of RULES) {
        if (rule.type === 'terms') {
            const flags = rule.flags || 'g'
            for (const term of rule.terms) {
                const regex = new RegExp(escapeRegExp(term), flags.includes('g') ? flags : `${flags}g`)
                const matches = collectMatches(content, regex)
                if (matches.length === 0) continue

                for (const m of matches) {
                    if (typeof m.index !== 'number') continue
                    instances.push({
                        start: m.index,
                        end: m.index + m[0].length,
                        term: m[0],
                        category: rule.category,
                        severity: rule.severity,
                    })
                }

                const hitTerm = getHitTerm(rule, term)
                const key = `${rule.id}::${hitTerm}`
                const prev = hitsByKey.get(key)
                if (prev) {
                    prev.count += matches.length
                } else {
                    hitsByKey.set(key, {
                        category: rule.category,
                        term: hitTerm,
                        count: matches.length,
                        severity: rule.severity,
                        reason: rule.reason,
                        suggestion: rule.suggestion,
                    })
                }

                const replacement = getReplacement(rule, term)
                if (replacement) {
                    suggestedText = suggestedText.replace(regex, replacement as any)
                }
            }
            continue
        }

        const regex = ensureGlobal(rule.regex)
        const matches = collectMatches(content, regex)
        if (matches.length === 0) continue

        for (const m of matches) {
            if (typeof m.index !== 'number') continue
            instances.push({
                start: m.index,
                end: m.index + m[0].length,
                term: m[0],
                category: rule.category,
                severity: rule.severity,
            })
        }

        const hitTerm = getHitTerm(rule, matches[0]?.[0] || '')
        const key = `${rule.id}::${hitTerm}`
        const prev = hitsByKey.get(key)
        if (prev) {
            prev.count += matches.length
        } else {
            hitsByKey.set(key, {
                category: rule.category,
                term: hitTerm,
                count: matches.length,
                severity: rule.severity,
                reason: rule.reason,
                suggestion: rule.suggestion,
            })
        }

        const replacement = getReplacement(rule, matches[0]?.[0] || '')
        if (replacement) {
            suggestedText = suggestedText.replace(regex, replacement as any)
        }
    }

    const hits: LegalAuditHit[] = []
    hitsByKey.forEach((value) => hits.push(value))
    hits.sort((a, b) => {
        const s = severityRank(b.severity) - severityRank(a.severity)
        if (s !== 0) return s
        return b.count - a.count
    })

    const totalHigh = hits.filter((h) => h.severity === 'high').reduce((sum, h) => sum + h.count, 0)
    const totalMedium = hits.filter((h) => h.severity === 'medium').reduce((sum, h) => sum + h.count, 0)
    const totalLow = hits.filter((h) => h.severity === 'low').reduce((sum, h) => sum + h.count, 0)
    const score = Math.min(100, totalHigh * 35 + totalMedium * 15 + totalLow * 6)

    const status: LegalAuditStatus =
        totalHigh > 0 || score >= 60 ? 'risk' : (totalMedium > 0 || totalLow > 0 || score > 0 ? 'attention' : 'pass')

    const summary = (() => {
        if (status === 'pass') return '未发现明显违禁/限流风险词（仅供参考，发布前建议再快速人工复核一遍）'
        if (status === 'risk') return `检测到 ${totalHigh} 处高风险表达，建议先修改再发布（下方给出命中点与替换建议）`
        return `检测到 ${totalMedium + totalLow} 处可能触发限流/合规风险的表达，建议按下方建议优化后再发布`
    })()

    const normalizedInstances = instances
        .filter((i) => i.end > i.start)
        .sort((a, b) => {
            const d = a.start - b.start
            if (d !== 0) return d
            return b.end - a.end
        })

    return {
        status,
        score,
        summary,
        hits,
        instances: normalizedInstances,
        suggestedText,
    }
}
