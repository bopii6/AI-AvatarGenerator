/**
 * 数字人服务（本地版）
 * 基于开源 Wav2Lip 实现唇形同步，支持 CPU 推理（速度较慢但无需 GPU）
 */

import path from 'path'
import fs from 'fs'
import { execFile } from 'child_process'
import {
    LipSyncConfig,
    LipSyncProgress,
    checkModelsExist,
    downloadModels,
    runLipSync,
} from './lipSyncService'

export interface DigitalHumanConfig {
    modelsDir: string
    tempDir: string
    outputDir: string
    pythonPath?: string
}

export interface GenerationOptions {
    sourceVideoPath: string // 用户上传的视频（10-30 秒，含人脸）
    audioPath: string // TTS 生成的音频
    text?: string // 口播文案（可选，仅用于日志）
    qualityPreset?: 'quality' | 'fast'
}

export interface GenerationResult {
    videoPath: string
    duration: number
    success: boolean
}

/**
 * 获取默认配置
 */
export function getDefaultConfig(appDataPath: string): DigitalHumanConfig {
    return {
        modelsDir: path.join(appDataPath, 'models', 'wav2lip'),
        tempDir: path.join(appDataPath, 'temp'),
        outputDir: path.join(appDataPath, 'output', 'digital_human'),
        pythonPath: (process.env.DIGITAL_HUMAN_PYTHON || process.env.VIRAL_VIDEO_AGENT_PYTHON || undefined),
    }
}

function checkPython(pythonPath?: string): Promise<boolean> {
    const cmd = pythonPath?.trim() || 'python'
    return new Promise((resolve) => {
        execFile(cmd, ['--version'], (error) => resolve(!error))
    })
}

function hasBundledFFmpeg(): boolean {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        let ffmpegPath = require('ffmpeg-static') as string
        if (ffmpegPath.includes('app.asar') && !ffmpegPath.includes('app.asar.unpacked')) {
            ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked')
        }
        return typeof ffmpegPath === 'string' && fs.existsSync(ffmpegPath)
    } catch {
        return false
    }
}

/**
 * 检查系统是否已准备好
 */
export async function checkSystemReady(
    config: DigitalHumanConfig,
    options?: { qualityPreset?: 'quality' | 'fast' }
): Promise<{
    ready: boolean
    modelsDownloaded: boolean
    pythonInstalled: boolean
    ffmpegInstalled: boolean
}> {
    const checkpoint = options?.qualityPreset === 'quality' ? 'wav2lip_gan' : 'wav2lip'
    const modelsDownloaded = checkModelsExist(config.modelsDir, { checkpoint })
    const pythonInstalled = await checkPython(config.pythonPath)
    const ffmpegInstalled = hasBundledFFmpeg()

    return {
        ready: modelsDownloaded && pythonInstalled && ffmpegInstalled,
        modelsDownloaded,
        pythonInstalled,
        ffmpegInstalled,
    }
}

/**
 * 初始化系统（下载模型）
 */
export async function initializeSystem(
    config: DigitalHumanConfig,
    onProgress?: (progress: LipSyncProgress) => void,
    options?: { qualityPreset?: 'quality' | 'fast' }
): Promise<void> {
    for (const dir of [config.modelsDir, config.tempDir, config.outputDir]) {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    }

    const checkpoint = options?.qualityPreset === 'quality' ? 'wav2lip_gan' : 'wav2lip'

    if (!checkModelsExist(config.modelsDir, { checkpoint })) {
        await downloadModels(config.modelsDir, onProgress, { checkpoint })
        return
    }

    onProgress?.({
        stage: 'complete',
        progress: 100,
        message: '模型已就绪',
    })
}

/**
 * 生成数字人视频
 */
export async function generateVideo(
    config: DigitalHumanConfig,
    options: GenerationOptions,
    onProgress?: (progress: LipSyncProgress) => void
): Promise<GenerationResult> {
    const startTime = Date.now()

    if (!fs.existsSync(options.sourceVideoPath)) {
        throw new Error('源视频文件不存在')
    }
    if (!fs.existsSync(options.audioPath)) {
        throw new Error('音频文件不存在')
    }

    onProgress?.({
        stage: 'processing',
        progress: 5,
        message: '准备处理...',
    })

    if (!fs.existsSync(config.outputDir)) {
        fs.mkdirSync(config.outputDir, { recursive: true })
    }

    const outputPath = path.join(config.outputDir, `digital_human_${Date.now()}.mp4`)

    const lipSyncConfig: LipSyncConfig = {
        modelsDir: config.modelsDir,
        tempDir: config.tempDir,
        pythonPath: config.pythonPath,
        qualityPreset: options.qualityPreset,
    }

    await runLipSync(
        lipSyncConfig,
        options.sourceVideoPath,
        options.audioPath,
        outputPath,
        onProgress
    )

    const duration = (Date.now() - startTime) / 1000
    return {
        videoPath: outputPath,
        duration,
        success: true,
    }
}

/**
 * 获取已保存的源视频列表
 */
export function getSavedSourceVideos(config: DigitalHumanConfig): string[] {
    const sourceDir = path.join(config.outputDir, 'sources')
    if (!fs.existsSync(sourceDir)) return []

    return fs
        .readdirSync(sourceDir)
        .filter((f) => f.endsWith('.mp4') || f.endsWith('.mov') || f.endsWith('.avi'))
        .map((f) => path.join(sourceDir, f))
}

/**
 * 保存用户上传的源视频
 */
export async function saveSourceVideo(
    config: DigitalHumanConfig,
    videoBuffer: Buffer,
    name: string
): Promise<string> {
    const sourceDir = path.join(config.outputDir, 'sources')
    if (!fs.existsSync(sourceDir)) fs.mkdirSync(sourceDir, { recursive: true })

    const filename = `${name}_${Date.now()}.mp4`
    const filepath = path.join(sourceDir, filename)
    fs.writeFileSync(filepath, videoBuffer)
    return filepath
}
