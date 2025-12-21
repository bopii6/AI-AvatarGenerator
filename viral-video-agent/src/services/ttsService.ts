/**
 * 腾讯云语音合成 (TTS) 服务
 * 将文字转换为语音
 */

import crypto from 'crypto'
import https from 'https'
import fs from 'fs'
import path from 'path'

export interface TtsConfig {
    secretId: string
    secretKey: string
    region?: string
}

export interface VoiceOption {
    voiceType: number
    name: string
    gender: 'male' | 'female' | 'child'
    description: string
}

// 腾讯云TTS免费音色列表
export const VOICE_OPTIONS: VoiceOption[] = [
    { voiceType: 101001, name: '智瑜', gender: 'female', description: '通用女声' },
    { voiceType: 101002, name: '智聆', gender: 'female', description: '通用女声' },
    { voiceType: 101003, name: '智美', gender: 'female', description: '客服女声' },
    { voiceType: 101004, name: '智云', gender: 'male', description: '通用男声' },
    { voiceType: 101005, name: '智莉', gender: 'female', description: '通用女声' },
    { voiceType: 101006, name: '智言', gender: 'female', description: '助手女声' },
    { voiceType: 101007, name: '智娜', gender: 'female', description: '客服女声' },
    { voiceType: 101008, name: '智琪', gender: 'female', description: '客服女声' },
    { voiceType: 101009, name: '智芸', gender: 'female', description: '知性女声' },
    { voiceType: 101010, name: '智华', gender: 'male', description: '通用男声' },
]

/**
 * 生成腾讯云API签名
 */
function generateAuthHeaders(
    config: TtsConfig,
    action: string,
    payload: string
): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000)
    const date = new Date(timestamp * 1000).toISOString().split('T')[0]

    const service = 'tts'
    const host = 'tts.tencentcloudapi.com'
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
        'X-TC-Version': '2019-08-23',
        'X-TC-Timestamp': timestamp.toString(),
        'X-TC-Region': config.region || 'ap-guangzhou',
        'Authorization': authorization,
    }
}

/**
 * 调用腾讯云TTS API
 */
async function callTtsApi(
    config: TtsConfig,
    action: string,
    params: Record<string, any>
): Promise<any> {
    const payload = JSON.stringify(params)
    const headers = generateAuthHeaders(config, action, payload)

    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'tts.tencentcloudapi.com',
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
 * 基础语音合成
 */
export async function synthesizeSpeech(
    config: TtsConfig,
    text: string,
    options?: {
        voiceType?: number
        speed?: number      // 语速 -2 ~ 2
        volume?: number     // 音量 0 ~ 10
        codec?: string      // 'mp3' | 'wav' | 'pcm'
    }
): Promise<string> {
    const params = {
        Text: text,
        SessionId: `session_${Date.now()}`,
        VoiceType: options?.voiceType || 101001,
        Speed: options?.speed || 0,
        Volume: options?.volume || 5,
        Codec: options?.codec || 'mp3',
        ModelType: 1,
    }

    const response = await callTtsApi(config, 'TextToVoice', params)
    return response.Audio // Base64编码的音频数据
}

/**
 * 生成语音并保存到文件
 */
export async function generateSpeechFile(
    config: TtsConfig,
    text: string,
    outputDir: string,
    options?: {
        voiceType?: number
        speed?: number
        volume?: number
    }
): Promise<string> {
    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
    }

    // 长文本分段处理（腾讯云单次最多150字）
    const maxLength = 150
    const segments: string[] = []

    for (let i = 0; i < text.length; i += maxLength) {
        segments.push(text.slice(i, i + maxLength))
    }

    // 合成每个片段
    const audioBuffers: Buffer[] = []
    for (const segment of segments) {
        if (segment.trim()) {
            const audioBase64 = await synthesizeSpeech(config, segment, options)
            audioBuffers.push(Buffer.from(audioBase64, 'base64'))
        }
    }

    // 合并音频（简单拼接，实际可能需要更复杂的处理）
    const combinedAudio = Buffer.concat(audioBuffers)

    const fileName = `speech_${Date.now()}.mp3`
    const filePath = path.join(outputDir, fileName)

    fs.writeFileSync(filePath, combinedAudio)

    return filePath
}

/**
 * 获取可用音色列表
 */
export function getVoiceOptions(): VoiceOption[] {
    return VOICE_OPTIONS
}
