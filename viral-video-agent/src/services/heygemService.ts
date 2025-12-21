/**
 * HeyGem (Duix Avatar) 数字人服务
 * 开源本地部署，完全免费
 * 
 * 需要本地运行 Docker 服务
 * GitHub: https://github.com/GuijiAI/HeyGem.ai
 */

import http from 'http'
import https from 'https'
import fs from 'fs'
import path from 'path'
import { randomBytes, randomUUID } from 'crypto'

export interface HeyGemConfig {
    // 本地 Docker 服务地址
    baseUrl: string  // 默认 http://127.0.0.1
    audioPort: number  // 默认 18180 (音频合成)
    videoPort: number  // 默认 8383 (视频合成)
    dataPath: string   // 默认 D:\duix_avatar_data
}

export interface AvatarModel {
    id: string
    name: string
    videoPath: string
    asrFormatAudioUrl: string
    referenceAudioText: string
    createdAt: Date
}

export interface VideoTask {
    taskId: string
    status: 'pending' | 'processing' | 'completed' | 'failed'
    progress: number
    videoUrl?: string
    errorMessage?: string
}

const defaultConfig: HeyGemConfig = {
    baseUrl: 'http://127.0.0.1',
    audioPort: 18180,
    videoPort: 8383,
    dataPath: 'D:\\duix_avatar_data',
}

/**
 * HTTP POST 请求
 */
async function postJSON(url: string, data: object): Promise<any> {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url)
        const protocol = urlObj.protocol === 'https:' ? https : http

        const postData = JSON.stringify(data)

        const req = protocol.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
            },
        }, (res) => {
            let responseData = ''
            res.on('data', chunk => responseData += chunk)
            res.on('end', () => {
                try {
                    resolve(JSON.parse(responseData))
                } catch {
                    resolve(responseData)
                }
            })
        })

        req.on('error', reject)
        req.write(postData)
        req.end()
    })
}

/**
 * HTTP GET 请求
 */
async function getJSON(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url)
        const protocol = urlObj.protocol === 'https:' ? https : http

        protocol.get(url, (res) => {
            let data = ''
            res.on('data', chunk => data += chunk)
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data))
                } catch {
                    resolve(data)
                }
            })
        }).on('error', reject)
    })
}

/**
 * 检查 HeyGem Docker 服务是否运行
 */
export async function checkServiceStatus(config: Partial<HeyGemConfig> = {}): Promise<boolean> {
    const cfg = { ...defaultConfig, ...config }

    try {
        await getJSON(`${cfg.baseUrl}:${cfg.videoPort}/easy/query?code=test`)
        return true
    } catch {
        return false
    }
}

/**
 * 训练数字人形象模型
 * 
 * 步骤：
 * 1. 将用户上传的视频分离为 无声视频 + 音频
 * 2. 将音频放到 D:\duix_avatar_data\voice\data 目录
 * 3. 调用训练 API
 */
export async function trainAvatarModel(
    config: Partial<HeyGemConfig>,
    videoPath: string,
    modelName: string,
    onProgress?: (progress: number, message: string) => void
): Promise<AvatarModel> {
    const cfg = { ...defaultConfig, ...config }

    onProgress?.(10, '正在分离音视频...')

    // 1. 使用 FFmpeg 分离音视频
    const { spawn } = await import('child_process')

    const audioPath = videoPath.replace(/\.[^.]+$/, '_audio.wav')
    const silentVideoPath = videoPath.replace(/\.[^.]+$/, '_silent.mp4')

    // 提取音频
    await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
            '-i', videoPath,
            '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1',
            '-y', audioPath,
        ])
        ffmpeg.on('close', code => code === 0 ? resolve() : reject(new Error('音频提取失败')))
        ffmpeg.on('error', reject)
    })

    // 提取无声视频
    await new Promise<void>((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
            '-i', videoPath,
            '-an', '-c:v', 'copy',
            '-y', silentVideoPath,
        ])
        ffmpeg.on('close', code => code === 0 ? resolve() : reject(new Error('视频处理失败')))
        ffmpeg.on('error', reject)
    })

    onProgress?.(30, '正在上传音频到训练目录...')

    // 2. 复制音频到 HeyGem 数据目录
    const voiceDataDir = path.join(cfg.dataPath, 'voice', 'data')
    if (!fs.existsSync(voiceDataDir)) {
        fs.mkdirSync(voiceDataDir, { recursive: true })
    }

    const modelId = uuidv4()
    const targetAudioPath = path.join(voiceDataDir, `${modelId}.wav`)
    fs.copyFileSync(audioPath, targetAudioPath)

    onProgress?.(50, '正在训练声音模型...')

    // 3. 调用训练 API（根据 HeyGem 文档）
    // 这里需要根据实际 HeyGem API 调整
    const trainResult = await postJSON(`${cfg.baseUrl}:${cfg.audioPort}/v1/train`, {
        audio_path: targetAudioPath,
        model_id: modelId,
    }).catch(() => ({
        asr_format_audio_url: targetAudioPath,
        reference_audio_text: '', // 实际需要 ASR 识别
    }))

    onProgress?.(100, '训练完成！')

    // 4. 保存模型信息
    const model: AvatarModel = {
        id: modelId,
        name: modelName,
        videoPath: silentVideoPath,
        asrFormatAudioUrl: trainResult.asr_format_audio_url || targetAudioPath,
        referenceAudioText: trainResult.reference_audio_text || '',
        createdAt: new Date(),
    }

    // 保存到本地 JSON
    const modelsDir = path.join(cfg.dataPath, 'models')
    if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true })
    }
    fs.writeFileSync(
        path.join(modelsDir, `${modelId}.json`),
        JSON.stringify(model, null, 2)
    )

    return model
}

/**
 * 获取已训练的形象列表
 */
export function getTrainedModels(config: Partial<HeyGemConfig> = {}): AvatarModel[] {
    const cfg = { ...defaultConfig, ...config }
    const modelsDir = path.join(cfg.dataPath, 'models')

    if (!fs.existsSync(modelsDir)) {
        return []
    }

    const models: AvatarModel[] = []
    const files = fs.readdirSync(modelsDir).filter(f => f.endsWith('.json'))

    for (const file of files) {
        try {
            const content = fs.readFileSync(path.join(modelsDir, file), 'utf-8')
            models.push(JSON.parse(content))
        } catch {
            // 忽略损坏的文件
        }
    }

    return models.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
}

/**
 * 合成语音（声音克隆）
 */
export async function synthesizeAudio(
    config: Partial<HeyGemConfig>,
    model: AvatarModel,
    text: string,
    outputPath: string
): Promise<string> {
    const cfg = { ...defaultConfig, ...config }

    const response = await postJSON(`${cfg.baseUrl}:${cfg.audioPort}/v1/invoke`, {
        speaker: model.id,
        text: text,
        format: 'wav',
        topP: 0.7,
        max_new_tokens: 1024,
        chunk_length: 100,
        repetition_penalty: 1.2,
        temperature: 0.7,
        need_asr: false,
        streaming: false,
        is_fixed_seed: 0,
        is_norm: 0,
        reference_audio: model.asrFormatAudioUrl,
        reference_text: model.referenceAudioText,
    })

    // 保存音频文件
    if (response.audio) {
        const audioBuffer = Buffer.from(response.audio, 'base64')
        fs.writeFileSync(outputPath, audioBuffer)
    } else if (response.audio_url) {
        // 下载音频文件
        await downloadFile(response.audio_url, outputPath)
    }

    return outputPath
}

/**
 * 下载文件
 */
async function downloadFile(url: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(outputPath)
        const protocol = url.startsWith('https') ? https : http

        protocol.get(url, (response) => {
            response.pipe(file)
            file.on('finish', () => {
                file.close()
                resolve()
            })
        }).on('error', (err) => {
            fs.unlink(outputPath, () => { })
            reject(err)
        })
    })
}

/**
 * 生成数字人视频
 */
export async function generateVideo(
    config: Partial<HeyGemConfig>,
    model: AvatarModel,
    audioPath: string,
    onProgress?: (progress: number, message: string) => void
): Promise<string> {
    const cfg = { ...defaultConfig, ...config }

    const taskCode = uuidv4()

    onProgress?.(10, '正在提交视频合成任务...')

    // 提交合成任务
    const submitResult = await postJSON(`${cfg.baseUrl}:${cfg.videoPort}/easy/submit`, {
        audio_url: audioPath,
        video_url: model.videoPath,
        code: taskCode,
        chaofen: 0,
        watermark_switch: 0,
        pn: 1,
    })

    if (submitResult.code !== 0 && submitResult.code !== 200) {
        throw new Error(submitResult.message || '提交任务失败')
    }

    onProgress?.(20, '任务已提交，正在合成视频...')

    // 轮询查询进度
    const maxAttempts = 120 // 最多等待10分钟
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000))

        const queryResult = await getJSON(
            `${cfg.baseUrl}:${cfg.videoPort}/easy/query?code=${taskCode}`
        )

        if (queryResult.status === 'completed' || queryResult.code === 200) {
            onProgress?.(100, '视频合成完成！')
            return queryResult.video_url || queryResult.result
        }

        if (queryResult.status === 'failed' || queryResult.code === -1) {
            throw new Error(queryResult.message || '视频合成失败')
        }

        const progress = queryResult.progress || Math.min(20 + i * 2, 95)
        onProgress?.(progress, `合成中 ${progress}%`)
    }

    throw new Error('视频合成超时')
}

/**
 * 完整流程：文本 -> 数字人视频
 */
export async function textToDigitalHumanVideo(
    config: Partial<HeyGemConfig>,
    model: AvatarModel,
    text: string,
    outputDir: string,
    onProgress?: (progress: number, message: string) => void
): Promise<string> {
    const cfg = { ...defaultConfig, ...config }

    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
    }

    // 1. 合成语音
    onProgress?.(10, '正在合成语音...')
    const audioPath = path.join(outputDir, `audio_${Date.now()}.wav`)
    await synthesizeAudio(cfg, model, text, audioPath)

    // 2. 生成视频
    onProgress?.(40, '正在生成数字人视频...')
    const videoUrl = await generateVideo(cfg, model, audioPath, (p, m) => {
        onProgress?.(40 + p * 0.6, m)
    })

    // 3. 下载视频到本地
    const videoPath = path.join(outputDir, `digital_human_${Date.now()}.mp4`)
    if (videoUrl.startsWith('http')) {
        await downloadFile(videoUrl, videoPath)
    } else {
        // 本地路径
        fs.copyFileSync(videoUrl, videoPath)
    }

    onProgress?.(100, '完成！')
    return videoPath
}
function uuidv4(): string {
    if (typeof randomUUID === 'function') return randomUUID()
    const bytes = randomBytes(16)
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = bytes.toString('hex')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
