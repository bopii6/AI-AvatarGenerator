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
