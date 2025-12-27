/**
 * 腾讯混元大模型服务
 * 用于文案改写和标题生成
 */

import crypto from 'crypto'
import https from 'https'

export interface HunyuanConfig {
    secretId: string
    secretKey: string
    region?: string
}

export type RewriteMode = 'auto' | 'custom' | 'same'

/**
 * 生成腾讯云API签名
 */
function generateAuthHeaders(
    config: HunyuanConfig,
    action: string,
    payload: string
): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000)
    const date = new Date(timestamp * 1000).toISOString().split('T')[0]

    const service = 'hunyuan'
    const host = 'hunyuan.tencentcloudapi.com'
    const algorithm = 'TC3-HMAC-SHA256'

    const httpRequestMethod = 'POST'
    const canonicalUri = '/'
    const canonicalQueryString = ''
    const canonicalHeaders = `content-type:application/json\nhost:${host}\n`
    const signedHeaders = 'content-type;host'
    const hashedRequestPayload = crypto.createHash('sha256').update(payload).digest('hex')
    const canonicalRequest = [
        httpRequestMethod,
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        hashedRequestPayload,
    ].join('\n')

    const credentialScope = `${date}/${service}/tc3_request`
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    const stringToSign = [
        algorithm,
        timestamp,
        credentialScope,
        hashedCanonicalRequest,
    ].join('\n')

    const secretDate = crypto.createHmac('sha256', `TC3${config.secretKey}`).update(date).digest()
    const secretService = crypto.createHmac('sha256', secretDate).update(service).digest()
    const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest()
    const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex')

    const authorization = [
        `${algorithm} Credential=${config.secretId}/${credentialScope}`,
        `SignedHeaders=${signedHeaders}`,
        `Signature=${signature}`,
    ].join(', ')

    return {
        'Content-Type': 'application/json',
        'Host': host,
        'X-TC-Action': action,
        'X-TC-Version': '2023-09-01',
        'X-TC-Timestamp': timestamp.toString(),
        'X-TC-Region': config.region || 'ap-guangzhou',
        'Authorization': authorization,
    }
}

/**
 * 调用腾讯混元API
 */
async function callHunyuanApi(
    config: HunyuanConfig,
    messages: Array<{ Role: string; Content: string }>,
    model: string = 'hunyuan-lite'
): Promise<string> {
    const params = {
        Model: model,
        Messages: messages,
    }

    const payload = JSON.stringify(params)
    const headers = generateAuthHeaders(config, 'ChatCompletions', payload)

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'hunyuan.tencentcloudapi.com',
            method: 'POST',
            headers,
        }, (res) => {
            let data = ''
            res.on('data', chunk => data += chunk)
            res.on('end', () => {
                try {
                    const result = JSON.parse(data)
                    if (result.Response?.Error) {
                        reject(new Error(result.Response.Error.Message))
                    } else {
                        const content = result.Response?.Choices?.[0]?.Message?.Content || ''
                        resolve(content)
                    }
                } catch (e) {
                    reject(e)
                }
            })
        })

        req.on('error', reject)
        req.write(payload)
        req.end()
    })
}

/**
 * 文案改写
 */
export async function rewriteCopy(
    config: HunyuanConfig,
    originalText: string,
    mode: RewriteMode,
    customInstruction?: string
): Promise<string> {
    if (mode === 'same') {
        return originalText
    }

    let prompt: string

    if (mode === 'auto') {
        prompt = `你是一位专业的短视频文案写手。请仿写以下文案，保持原文的风格、语气和结构，但用不同的表达方式重新创作。

原文案：
${originalText}

要求：
1. 保持相似的长度
2. 保持相同的主题和核心信息
3. 使用更吸引人的表达
4. 适合短视频口播

请直接输出改写后的文案，不要有额外说明。`
    } else {
        prompt = `请根据以下指令改写文案：

改写指令：${customInstruction}

原文案：
${originalText}

请直接输出改写后的文案，不要有额外说明。`
    }

    const messages = [
        { Role: 'user', Content: prompt }
    ]

    return callHunyuanApi(config, messages)
}

/**
 * 生成爆款标题
 */
export async function generateTitles(
    config: HunyuanConfig,
    content: string,
    count: number = 3
): Promise<string[]> {
    const prompt = `你是一位抖音爆款标题专家。请根据以下内容生成${count}个吸引人的标题。

内容：
${content}

要求：
1. 标题要有吸引力，引发好奇心
2. 可以使用emoji表情
3. 适合抖音平台风格
4. 每个标题一行

请直接输出${count}个标题，每行一个，不要编号。`

    const messages = [
        { Role: 'user', Content: prompt }
    ]

    const result = await callHunyuanApi(config, messages)
    return result.split('\n').filter(line => line.trim()).slice(0, count)
}

/**
 * 生成热门话题标签
 */
export async function generateHashtags(
    config: HunyuanConfig,
    content: string,
    count: number = 5
): Promise<string[]> {
    const prompt = `请根据以下内容生成${count}个相关的抖音热门话题标签。

内容：
${content}

要求：
1. 标签要简洁有力
2. 选择热门、易被搜索的词
3. 不要加#号
4. 每个标签一行

请直接输出${count}个标签，每行一个。`

    const messages = [
        { Role: 'user', Content: prompt }
    ]

    const result = await callHunyuanApi(config, messages)
    return result.split('\n').filter(line => line.trim()).slice(0, count)
}

/**
 * 分析文案的爆款规律
 */
export async function analyzeCopyPattern(
    config: HunyuanConfig,
    copies: string
): Promise<string> {
    const prompt = `你是一位资深的短视频文案分析专家。请分析以下这一组爆款视频文案，总结它们的成功规律。
你的目标是让普通用户一眼就能看懂这些视频为什么能火，并能直接模仿。

文案内容：
${copies}

请严格按照以下格式输出你的分析结果，不要有任何开场白或结尾，确保每个部分都有实质性、可操作的建议：

【核心钩子】
(在这里深入分析头3秒的抓人技巧，使用 1. 2. 3. 列表形式)

【爆款公式】
(在这里总结文案的底层逻辑结构，例如：建立共鸣 -> 揭示痛点 -> 给出干货 -> 引导点赞)

【情绪锚点】
(在这里解释为什么用户会有情绪波动，触动了什么样的心理心理)

【金句模板】
(在这里提供 1-2 个具体的句式模板，使用 [填空] 的方式，让用户能直接复制使用)
`

    const messages = [
        { Role: 'user', Content: prompt }
    ]

    return callHunyuanApi(config, messages)
}

export interface BenchmarkSample {
    title: string
    transcript: string
}

export interface BenchmarkTopic {
    title: string
    hook?: string
    angle?: string
}

function safeParseJson<T>(text: string): T | null {
    const raw = String(text || '').trim()
    if (!raw) return null

    try {
        return JSON.parse(raw) as T
    } catch {
        // ignore
    }

    const arrayStart = raw.indexOf('[')
    const arrayEnd = raw.lastIndexOf(']')
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
        const sliced = raw.slice(arrayStart, arrayEnd + 1)
        try {
            return JSON.parse(sliced) as T
        } catch {
            // ignore
        }
    }

    const objStart = raw.indexOf('{')
    const objEnd = raw.lastIndexOf('}')
    if (objStart >= 0 && objEnd > objStart) {
        const sliced = raw.slice(objStart, objEnd + 1)
        try {
            return JSON.parse(sliced) as T
        } catch {
            // ignore
        }
    }

    return null
}

export async function generateBenchmarkTopics(
    config: HunyuanConfig,
    input: { profileUrl?: string; samples: BenchmarkSample[] },
    count: number = 4
): Promise<BenchmarkTopic[]> {
    const normalizedSamples = (input.samples || [])
        .filter((s) => (s?.transcript || '').trim())
        .slice(0, 5)
        .map((s) => ({
            title: String(s.title || '').slice(0, 80),
            transcript: String(s.transcript || '').slice(0, 1600),
        }))

    if (normalizedSamples.length === 0) {
        throw new Error('缺少可用于学习的样本逐字稿')
    }

    const samplesJson = JSON.stringify(normalizedSamples)
    const profileUrl = input.profileUrl ? String(input.profileUrl).slice(0, 200) : ''

    const prompt = `你是一位短视频账号增长与文案策略专家。

我会提供一个“对标账号”的近期作品样本（标题 + 逐字稿/字幕转写）。你的任务是：学习这个账号稳定的创作规律，并据此生成【${count} 个】同类型但不抄袭的选题。

重要原则（必须遵守）：
1) 只能学习“风格/结构/受众/选题方向/表达节奏”，严禁复用样本中的具体句子、段子、案例、专有名词、数据、人物、地点等细节
2) 每个选题都要保证原创、可拍、符合对标账号的受众与内容支柱
3) 输出必须是严格 JSON（不能有 Markdown/解释/代码块/多余字符），便于 JSON.parse

对标账号主页链接（可为空）：${profileUrl}
样本（JSON 数组）：${samplesJson}

请严格输出如下格式的 JSON 数组（共 ${count} 项）：
[
  { "title": "选题标题/一句话主题", "hook": "3秒开头钩子（1句话）", "angle": "切入角度（1句话）" }
]`

    const messages = [{ Role: 'user', Content: prompt }]
    const raw = await callHunyuanApi(config, messages)

    const parsed = safeParseJson<unknown>(raw)
    const items: any[] = Array.isArray(parsed) ? parsed : []
    const topics = items
        .map((item) => ({
            title: String(item?.title || '').trim(),
            hook: String(item?.hook || '').trim() || undefined,
            angle: String(item?.angle || '').trim() || undefined,
        }))
        .filter((t) => t.title)
        .slice(0, count)

    if (topics.length === 0) {
        const fallback = String(raw || '')
            .split('\n')
            .map((line) => line.replace(/^[\s*\-\d.、]+/, '').trim())
            .filter(Boolean)
            .slice(0, count)
            .map((title) => ({ title }))
        if (fallback.length > 0) return fallback
        throw new Error('生成选题失败：模型输出无法解析')
    }

    return topics
}

export async function generateBenchmarkScript(
    config: HunyuanConfig,
    input: { profileUrl?: string; samples: BenchmarkSample[]; topic: string }
): Promise<string> {
    const topic = String(input.topic || '').trim()
    if (!topic) throw new Error('缺少选题')

    const normalizedSamples = (input.samples || [])
        .filter((s) => (s?.transcript || '').trim())
        .slice(0, 5)
        .map((s) => ({
            title: String(s.title || '').slice(0, 80),
            transcript: String(s.transcript || '').slice(0, 1600),
        }))

    if (normalizedSamples.length === 0) {
        throw new Error('缺少可用于学习的样本逐字稿')
    }

    const samplesJson = JSON.stringify(normalizedSamples)
    const profileUrl = input.profileUrl ? String(input.profileUrl).slice(0, 200) : ''

    const prompt = `你是一位短视频口播文案编剧。

我会提供一个“对标账号”的作品样本（标题 + 逐字稿）。请你模仿这个账号的表达风格、节奏与结构，但必须保证原创，不要复用样本中的任何具体句子/案例/专有名词/数据/人物。

对标账号主页链接（可为空）：${profileUrl}
样本（JSON 数组）：${samplesJson}

现在要写的选题：${topic}

要求：
1) 输出中文【口播逐字稿】，适合 45-60 秒短视频
2) 必须包含：开头钩子（1-2句）→ 主体（3-5段，每段1-2句）→ 结尾 CTA（1句，合规自然）
3) 文案要信息密度高、节奏快、像真人在说话
4) 不要输出标题，不要 Markdown，不要解释，不要列表编号（除非是账号风格里常见且自然）

请直接输出逐字稿正文：`

    const messages = [{ Role: 'user', Content: prompt }]
    return callHunyuanApi(config, messages)
}

export interface AccountDiagnosisSample {
    title: string
    transcript: string
}

export interface AccountDiagnosisRequest {
    profileUrl?: string
    samples: AccountDiagnosisSample[]
}

export async function diagnoseAccount(
    config: HunyuanConfig,
    input: AccountDiagnosisRequest
): Promise<string> {
    const normalizedSamples = (input.samples || [])
        .filter((s) => (s?.transcript || '').trim())
        .slice(0, 10)
        .map((s) => ({
            title: String(s.title || '').slice(0, 80),
            transcript: String(s.transcript || '').slice(0, 1600),
        }))

    if (normalizedSamples.length === 0) {
        throw new Error('缺少可用于诊断的样本逐字稿')
    }

    const samplesJson = JSON.stringify(normalizedSamples)
    const profileUrl = input.profileUrl ? String(input.profileUrl).slice(0, 200) : ''

    const prompt = `你是一位资深的「抖音账号诊断顾问」。
你的目标：让创作者看得清楚、知道下一步怎么做；建议要可执行、可复用。

我会给你账号近期作品样本（标题 + 口播/字幕转写）。请只基于样本做判断，不要臆造不存在的数据（例如粉丝数、播放量、转化率等）。
可以合理推断定位/受众/表达风格，但必须用“从样本看/推测”表述。

账号主页链接（可为空）：${profileUrl}
作品样本（JSON 数组）：${samplesJson}

请严格只输出「有效 JSON」（不要 Markdown/解释/代码块/多余字符），字段如下（如无法判断可填空字符串/空数组，但不要省略字段）：
{
  "version": "1.0",
  "overview": {
    "positioning": "",
    "audience": "",
    "tone": "",
    "mainValue": ""
  },
  "strengths": [
    { "title": "", "evidence": "", "howToAmplify": "" }
  ],
  "bottlenecks": [
    { "title": "", "impact": "", "why": "", "fix": "", "exampleRewrite": "" }
  ],
  "contentPillars": [
    { "pillar": "", "ratio": 0, "whatToDoMore": "", "exampleTopics": [""] }
  ],
  "templates": {
    "hook": [""],
    "structure": [""],
    "cta": [""]
  },
  "next4Topics": [
    { "title": "", "hook": "", "outline": [""] }
  ],
  "note": ""
}`

    const messages = [{ Role: 'user', Content: prompt }]
    return callHunyuanApi(config, messages)
}
