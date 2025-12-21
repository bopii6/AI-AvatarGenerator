/**
 * 腾讯云语音识别 (ASR) 服务
 * 将视频/音频中的语音转换为文字
 */

import crypto from 'crypto'
import https from 'https'

export interface AsrConfig {
    secretId: string
    secretKey: string
    region?: string
}

export interface TranscriptionResult {
    text: string
    segments: Array<{
        text: string
        startTime: number
        endTime: number
    }>
}

/**
 * 生成腾讯云API签名
 */
function sign(
    secretKey: string,
    signStr: string
): string {
    return crypto.createHmac('sha256', secretKey).update(signStr).digest('hex')
}

/**
 * 生成腾讯云API请求头
 */
function generateAuthHeaders(
    config: AsrConfig,
    action: string,
    payload: string
): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000)
    const date = new Date(timestamp * 1000).toISOString().split('T')[0]

    const service = 'asr'
    const host = 'asr.tencentcloudapi.com'
    const algorithm = 'TC3-HMAC-SHA256'

    // 规范请求串
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

    // 待签名字符串
    const credentialScope = `${date}/${service}/tc3_request`
    const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex')
    const stringToSign = [
        algorithm,
        timestamp,
        credentialScope,
        hashedCanonicalRequest,
    ].join('\n')

    // 计算签名
    const secretDate = crypto.createHmac('sha256', `TC3${config.secretKey}`).update(date).digest()
    const secretService = crypto.createHmac('sha256', secretDate).update(service).digest()
    const secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest()
    const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex')

    // 拼接 Authorization
    const authorization = [
        `${algorithm} Credential=${config.secretId}/${credentialScope}`,
        `SignedHeaders=${signedHeaders}`,
        `Signature=${signature}`,
    ].join(', ')

    return {
        'Content-Type': 'application/json',
        'Host': host,
        'X-TC-Action': action,
        'X-TC-Version': '2019-06-14',
        'X-TC-Timestamp': timestamp.toString(),
        'X-TC-Region': config.region || 'ap-guangzhou',
        'Authorization': authorization,
    }
}

/**
 * 调用腾讯云ASR API
 */
async function callAsrApi(
    config: AsrConfig,
    action: string,
    params: Record<string, any>
): Promise<any> {
    const payload = JSON.stringify(params)
    const headers = generateAuthHeaders(config, action, payload)

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'asr.tencentcloudapi.com',
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
                        resolve(result.Response)
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
 * 创建录音文件识别任务
 */
export async function createRecognitionTask(
    config: AsrConfig,
    audioUrl: string,
    options?: {
        engineType?: string
        channelNum?: number
    }
): Promise<string> {
    const params = {
        EngineModelType: options?.engineType || '16k_zh',
        ChannelNum: options?.channelNum || 1,
        ResTextFormat: 0, // 返回识别结果
        SourceType: 0, // URL方式
        Url: audioUrl,
    }

    const response = await callAsrApi(config, 'CreateRecTask', params)
    return response.Data?.TaskId
}

/**
 * 查询录音文件识别结果
 */
export async function getRecognitionResult(
    config: AsrConfig,
    taskId: string
): Promise<TranscriptionResult | null> {
    const response = await callAsrApi(config, 'DescribeTaskStatus', { TaskId: parseInt(taskId) })

    const status = response.Data?.Status

    if (status === 2) {
        // 识别成功
        const result = response.Data?.Result
        return {
            text: result || '',
            segments: [], // 腾讯云返回的详细分段需要进一步解析
        }
    } else if (status === 3) {
        // 识别失败
        throw new Error('语音识别失败: ' + response.Data?.ErrorMsg)
    }

    // 还在处理中
    return null
}

/**
 * 完整的语音转文字流程（带轮询）
 */
export async function transcribeAudio(
    config: AsrConfig,
    audioUrl: string,
    onProgress?: (status: string) => void
): Promise<TranscriptionResult> {
    onProgress?.('正在创建识别任务...')

    const taskId = await createRecognitionTask(config, audioUrl)

    onProgress?.('正在识别语音...')

    // 轮询获取结果
    const maxAttempts = 60 // 最多等待5分钟
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000)) // 每5秒查询一次

        const result = await getRecognitionResult(config, taskId)
        if (result) {
            return result
        }

        onProgress?.(`识别中... (${i + 1}/${maxAttempts})`)
    }

    throw new Error('语音识别超时，请重试')
}

/**
 * 一句话识别（实时）
 */
export async function recognizeSentence(
    config: AsrConfig,
    audioBase64: string,
    options?: {
        engineType?: string
    }
): Promise<string> {
    const audioBuffer = Buffer.from(audioBase64, 'base64')
    const params = {
        EngSerViceType: options?.engineType || '16k_zh', // 引擎服务类型
        SourceType: 1, // Base64方式
        VoiceFormat: 'mp3',
        Data: audioBase64,
        DataLen: audioBuffer.length,
    }

    const response = await callAsrApi(config, 'SentenceRecognition', params)
    return response.Result || ''
}
