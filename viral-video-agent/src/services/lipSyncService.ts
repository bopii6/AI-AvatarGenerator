/**
 * 唇形同步服务 - 基于 Wav2Lip
 *
 * 说明：
 * - 该实现使用 Python + PyTorch 进行推理（CPU 可跑，速度较慢但无需 GPU）
 * - FFmpeg 使用 ffmpeg-static（无需系统安装）
 *
 * 运行时依赖（Python 侧需安装）：
 * - torch, numpy, scipy, opencv-python, librosa, soundfile, tqdm
 */

import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import https from 'https'
import http from 'http'

export interface LipSyncConfig {
    modelsDir: string // 模型存放目录
    tempDir: string // 临时目录（可写）
    ffmpegPath?: string // FFmpeg 路径（可选，默认 ffmpeg-static）
    pythonPath?: string // Python 解释器路径（可选，优先级最高）
    qualityPreset?: 'quality' | 'fast' // 推理质量预设
}

export interface LipSyncProgress {
    stage: 'downloading' | 'extracting' | 'processing' | 'synthesizing' | 'complete'
    progress: number
    message: string
}

// Wav2Lip 模型下载地址（使用 hf-mirror.com 镜像）
const WAV2LIP_MODELS = {
    wav2lip: {
        url: 'https://hf-mirror.com/camenduru/wav2lip/resolve/main/checkpoints/wav2lip.pth',
        filename: 'wav2lip.pth',
        size: '435MB',
    },
    wav2lip_gan: {
        url: 'https://hf-mirror.com/camenduru/wav2lip/resolve/main/checkpoints/wav2lip_gan.pth',
        filename: 'wav2lip_gan.pth',
        size: '416MB',
    },
    face_detection: {
        url: 'https://hf-mirror.com/camenduru/wav2lip/resolve/main/face_detection/detection/sfd/s3fd.pth',
        filename: 's3fd.pth',
        size: '85MB',
    },
}

export type Wav2LipCheckpoint = 'wav2lip' | 'wav2lip_gan'

function resolveWav2LipDir(): string {
    const resourcesPath = (process as any).resourcesPath as string | undefined

    const candidates = [
        // dev
        path.join(process.cwd(), 'src', 'services', 'Wav2Lip'),
        // running from compiled electron code in repo
        path.join(process.cwd(), 'dist-electron', 'src', 'services', 'Wav2Lip'),
        // packaged: build.extraResources -> resources/Wav2Lip
        resourcesPath ? path.join(resourcesPath, 'Wav2Lip') : '',
        // fallback: same folder as this service file
        path.join(__dirname, 'Wav2Lip'),
    ].filter(Boolean)

    for (const dir of candidates) {
        if (fs.existsSync(dir)) return dir
    }

    throw new Error(
        '找不到 Wav2Lip 源码目录；请确保打包时已将 `src/services/Wav2Lip` 作为 `extraResources` 带上。'
    )
}

function resolvePythonCommand(config: LipSyncConfig): string {
    const stripQuotes = (value: string) => {
        const trimmed = value.trim()
        if (
            (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'"))
        ) {
            return trimmed.slice(1, -1).trim()
        }
        return trimmed
    }

    const pythonFromConfig = config.pythonPath ? stripQuotes(config.pythonPath) : ''
    if (pythonFromConfig) return pythonFromConfig

    const pythonFromEnv = stripQuotes(process.env.DIGITAL_HUMAN_PYTHON || process.env.VIRAL_VIDEO_AGENT_PYTHON || '')
    if (pythonFromEnv) return pythonFromEnv

    // 优先尝试 python（失败由 spawn error 处理）
    return 'python'
}

function getEnvDefaults(): { resizeFactor: number; faceDetBatchSize: number; wav2lipBatchSize: number } {
    const resizeFactor = Math.max(1, parseInt(process.env.WAV2LIP_RESIZE_FACTOR || '1', 10) || 1)
    const faceDetBatchSize = Math.max(1, parseInt(process.env.WAV2LIP_FACE_DET_BATCH_SIZE || '8', 10) || 8)
    const wav2lipBatchSize = Math.max(1, parseInt(process.env.WAV2LIP_BATCH_SIZE || '32', 10) || 32)

    return { resizeFactor, faceDetBatchSize, wav2lipBatchSize }
}

function finiteNumber(value: number, fallback: number): number {
    return Number.isFinite(value) ? value : fallback
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
}

function resolvePreset(config: LipSyncConfig): {
    resizeFactor: number
    faceDetBatchSize: number
    wav2lipBatchSize: number
    mouthOnly: boolean
} {
    const env = getEnvDefaults()

    if (config.qualityPreset === 'fast') {
        return {
            resizeFactor: 2,
            faceDetBatchSize: env.faceDetBatchSize,
            wav2lipBatchSize: env.wav2lipBatchSize,
            mouthOnly: false,
        }
    }

    if (config.qualityPreset === 'quality') {
        return {
            resizeFactor: 1,
            faceDetBatchSize: Math.max(1, Math.min(4, env.faceDetBatchSize)),
            wav2lipBatchSize: Math.max(1, Math.min(16, env.wav2lipBatchSize)),
            mouthOnly: true,
        }
    }

    return {
        resizeFactor: env.resizeFactor,
        faceDetBatchSize: env.faceDetBatchSize,
        wav2lipBatchSize: env.wav2lipBatchSize,
        mouthOnly: false,
    }
}

/**
 * 检查模型是否已下载
 */
export function checkModelsExist(
    modelsDir: string,
    options: { checkpoint?: Wav2LipCheckpoint } = {}
): boolean {
    const checkpoint = options.checkpoint || 'wav2lip'
    const wav2lipPath = path.join(modelsDir, WAV2LIP_MODELS[checkpoint].filename)
    const facePath = path.join(modelsDir, WAV2LIP_MODELS.face_detection.filename)

    const minBytes = 10 * 1024 * 1024 // 防止误把重定向/HTML 当作模型文件
    const isValidFile = (filePath: string) => {
        try {
            return fs.existsSync(filePath) && fs.statSync(filePath).size >= minBytes
        } catch {
            return false
        }
    }

    return isValidFile(wav2lipPath) && isValidFile(facePath)
}

/**
 * 下载模型文件
 */
export async function downloadModels(
    modelsDir: string,
    onProgress?: (progress: LipSyncProgress) => void,
    options: { checkpoint?: Wav2LipCheckpoint } = {}
): Promise<void> {
    if (!fs.existsSync(modelsDir)) {
        fs.mkdirSync(modelsDir, { recursive: true })
    }

    const checkpoint = options.checkpoint || 'wav2lip'
    const models = [WAV2LIP_MODELS[checkpoint], WAV2LIP_MODELS.face_detection]

    for (let i = 0; i < models.length; i++) {
        const model = models[i]
        const targetPath = path.join(modelsDir, model.filename)

        if (fs.existsSync(targetPath)) {
            onProgress?.({
                stage: 'downloading',
                progress: ((i + 1) / models.length) * 100,
                message: `${model.filename} 已存在，跳过`,
            })
            continue
        }

        onProgress?.({
            stage: 'downloading',
            progress: (i / models.length) * 100,
            message: `正在下载 ${model.filename} (${model.size})...`,
        })

        const minBytes = model.filename.endsWith('.pth') ? 10 * 1024 * 1024 : 0
        await downloadFile(model.url, targetPath, (percent) => {
            onProgress?.({
                stage: 'downloading',
                progress: (i / models.length) * 100 + (percent / models.length),
                message: `下载 ${model.filename}: ${percent.toFixed(1)}%`,
            })
        }, { minBytes })
    }

    onProgress?.({
        stage: 'downloading',
        progress: 100,
        message: '模型下载完成！',
    })
}

/**
 * 下载单个文件
 */
async function downloadFile(
    url: string,
    outputPath: string,
    onProgress?: (percent: number) => void,
    options: { minBytes?: number; maxRedirects?: number } = {}
): Promise<void> {
    return new Promise((resolve, reject) => {
        const minBytes = options.minBytes || 0
        const maxRedirects = typeof options.maxRedirects === 'number' ? options.maxRedirects : 8

        const visit = (currentUrl: string, redirectsLeft: number) => {
            const protocol = currentUrl.startsWith('https') ? https : http

            const request = protocol.get(currentUrl, (response) => {
                const code = response.statusCode || 0

                // 处理重定向（hf-mirror 常见 307/302）
                if ([301, 302, 303, 307, 308].includes(code) && response.headers.location) {
                    if (redirectsLeft <= 0) {
                        response.resume()
                        reject(new Error('下载失败：重定向次数过多'))
                        return
                    }

                    const nextUrl = new URL(response.headers.location, currentUrl).toString()
                    response.resume()
                    visit(nextUrl, redirectsLeft - 1)
                    return
                }

                if (code < 200 || code >= 300) {
                    response.resume()
                    reject(new Error(`下载失败：HTTP ${code}`))
                    return
                }

                const totalSize = parseInt(response.headers['content-length'] || '0', 10)
                let downloadedSize = 0

                const file = fs.createWriteStream(outputPath)

                response.on('data', (chunk) => {
                    downloadedSize += chunk.length
                    if (totalSize > 0) {
                        onProgress?.((downloadedSize / totalSize) * 100)
                    }
                })

                response.pipe(file)

                file.on('finish', () => {
                    file.close()
                    try {
                        const stat = fs.statSync(outputPath)
                        if (minBytes > 0 && stat.size < minBytes) {
                            fs.unlinkSync(outputPath)
                            reject(new Error(`下载的文件异常（${stat.size}B），请检查网络/镜像地址`))
                            return
                        }
                        resolve()
                    } catch (err: any) {
                        reject(err)
                    }
                })

                file.on('error', (err) => {
                    fs.unlink(outputPath, () => { })
                    reject(err)
                })
            })

            request.on('error', reject)
        }

        visit(url, maxRedirects)
    })
}

/**
 * 使用 Python 运行 Wav2Lip（CPU 可跑）
 */
export async function runLipSync(
    config: LipSyncConfig,
    videoPath: string,
    audioPath: string,
    outputPath: string,
    onProgress?: (progress: LipSyncProgress) => void
): Promise<string> {
    const checkpoint: Wav2LipCheckpoint = config.qualityPreset === 'quality' ? 'wav2lip_gan' : 'wav2lip'

    // 1. 检查/下载模型
    if (!checkModelsExist(config.modelsDir, { checkpoint })) {
        onProgress?.({
            stage: 'downloading',
            progress: 0,
            message: `正在下载模型（${checkpoint}，首次运行）...`,
        })
        await downloadModels(config.modelsDir, onProgress, { checkpoint })
    }

    // 2. 准备 Wav2Lip 代码目录（只读即可）
    const wav2lipDir = resolveWav2LipDir()
    const inferenceScript = path.join(wav2lipDir, 'inference.py')
    if (!fs.existsSync(inferenceScript)) {
        throw new Error(`找不到 Wav2Lip 推理脚本: ${inferenceScript}`)
    }

    // 3. 准备可写工作目录（避免打包后 resources 不可写）
    if (!fs.existsSync(config.tempDir)) fs.mkdirSync(config.tempDir, { recursive: true })
    const runId = Date.now()
    const workDir = path.join(config.tempDir, `wav2lip_run_${runId}`)
    fs.mkdirSync(path.join(workDir, 'temp'), { recursive: true })

    // 4. 组装参数
    const wav2lipModelPath = path.join(config.modelsDir, WAV2LIP_MODELS[checkpoint].filename)
    const s3fdModelPath = path.join(config.modelsDir, WAV2LIP_MODELS.face_detection.filename)

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    let ffmpegStaticPath = require('ffmpeg-static') as string
    if (ffmpegStaticPath.includes('app.asar') && !ffmpegStaticPath.includes('app.asar.unpacked')) {
        ffmpegStaticPath = ffmpegStaticPath.replace('app.asar', 'app.asar.unpacked')
    }
    const ffmpegPath = config.ffmpegPath || ffmpegStaticPath

    const perf = resolvePreset(config)
    const pythonCommand = resolvePythonCommand(config)

    const mouthOnlyRatio = clampNumber(finiteNumber(parseFloat(process.env.WAV2LIP_MOUTH_ONLY_RATIO || '0.70'), 0.7), 0.0, 1.0)
    const mouthBlendSigma = Math.max(0, finiteNumber(parseFloat(process.env.WAV2LIP_MOUTH_BLEND_SIGMA || '3.0'), 3.0))
    const sharpenAmount = Math.max(0, finiteNumber(parseFloat(process.env.WAV2LIP_SHARPEN_AMOUNT || '0.35'), 0.35))
    const sharpenSigma = Math.max(0.1, finiteNumber(parseFloat(process.env.WAV2LIP_SHARPEN_SIGMA || '1.0'), 1.0))

    onProgress?.({
        stage: 'processing',
        progress: 10,
        message: '初始化推理环境...',
    })

    return new Promise((resolve, reject) => {
        const pythonProcess = spawn(
            pythonCommand,
            [
                inferenceScript,
                '--checkpoint_path',
                wav2lipModelPath,
                '--face',
                videoPath,
                '--audio',
                audioPath,
                '--outfile',
                outputPath,
                '--ffmpeg_path',
                ffmpegPath,
                '--resize_factor',
                String(perf.resizeFactor),
                '--face_det_batch_size',
                String(perf.faceDetBatchSize),
                '--wav2lip_batch_size',
                String(perf.wav2lipBatchSize),
                ...(perf.mouthOnly
                    ? [
                        '--mouth_only',
                        '--mouth_only_ratio',
                        String(mouthOnlyRatio),
                        '--mouth_blend_sigma',
                        String(mouthBlendSigma),
                        '--sharpen_amount',
                        String(sharpenAmount),
                        '--sharpen_sigma',
                        String(sharpenSigma),
                        '--pads',
                        '0',
                        '0',
                        '0',
                        '0',
                    ]
                    : []),
            ],
            {
                cwd: workDir,
                env: {
                    ...process.env,
                    // 让 sfd_detector 从 modelsDir 读取模型，避免向 resources 目录写入
                    WAV2LIP_S3FD_PATH: s3fdModelPath,
                    PYTHONIOENCODING: 'utf-8',
                },
                shell: false,
                windowsHide: true,
            }
        )

        let stdout = ''
        let stderr = ''

        pythonProcess.stdout.on('data', (data) => {
            const output = data.toString()
            stdout += output

            // 解析进度: "Progress: 50%"
            const progressMatch = output.match(/Progress:\s*(\d+)%/)
            if (progressMatch) {
                const percent = parseInt(progressMatch[1], 10)
                const totalProgress = 20 + percent * 0.8
                onProgress?.({
                    stage: 'synthesizing',
                    progress: totalProgress,
                    message: `唇形合成中 ${percent}%`,
                })
            }
        })

        pythonProcess.stderr.on('data', (data) => {
            stderr += data.toString()
            console.log(`[Wav2Lip Error]: ${data}`)
        })

        pythonProcess.on('close', (code) => {
            if (code === 0 && fs.existsSync(outputPath)) {
                onProgress?.({
                    stage: 'complete',
                    progress: 100,
                    message: '唇形同步完成！',
                })
                resolve(outputPath)
                return
            }

            console.error('Wav2Lip STDOUT:', stdout)
            console.error('Wav2Lip STDERR:', stderr)
            reject(new Error(`Wav2Lip 推理失败（退出码 ${code}）。请查看控制台日志。`))
        })

        pythonProcess.on('error', reject)
    })
}

/**
 * 完整的数字人视频生成流程
 * 文本 →（TTS）→ 音频 → 唇形同步 → 输出
 */
export async function generateDigitalHumanVideo(
    config: LipSyncConfig,
    sourceVideoPath: string,
    // text: string, // 预留：可用于日志/字幕等
    _text: string,
    ttsAudioPath: string,
    onProgress?: (progress: LipSyncProgress) => void
): Promise<string> {
    if (!fs.existsSync(config.tempDir)) {
        fs.mkdirSync(config.tempDir, { recursive: true })
    }

    const outputPath = path.join(config.tempDir, `digital_human_${Date.now()}.mp4`)
    return runLipSync(config, sourceVideoPath, ttsAudioPath, outputPath, onProgress)
}
