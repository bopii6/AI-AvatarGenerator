/**
 * FFmpeg 视频处理服务
 * 用于字幕添加、BGM混音、视频截图等
 */

import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

// 使用 ffmpeg-static 获取 FFmpeg 可执行文件路径
// eslint-disable-next-line @typescript-eslint/no-var-requires
let ffmpegPath = require('ffmpeg-static') as string
if (ffmpegPath.includes('app.asar') && !ffmpegPath.includes('app.asar.unpacked')) {
    ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked')
}

export interface SubtitleStyle {
    fontName: string
    fontSize: number
    fontColor: string      // 如 "ffffff" (白色)
    outlineColor: string   // 描边颜色
    outlineWidth: number
    marginBottom: number   // 距离底部像素
    alignment: number      // 字幕位置 (2=底部居中)
}

const defaultSubtitleStyle: SubtitleStyle = {
    fontName: 'Microsoft YaHei',
    fontSize: 24,
    fontColor: 'ffffff',
    outlineColor: '000000',
    outlineWidth: 2,
    marginBottom: 50,
    alignment: 2,
}

/**
 * 执行 FFmpeg 命令
 */
function runFFmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
        console.log(`[FFmpeg] 使用路径: ${ffmpegPath}`)
        console.log(`[FFmpeg] 参数: ${args.join(' ')}`)
        const ffmpeg = spawn(ffmpegPath, args, { stdio: 'pipe' })

        let stderr = ''
        ffmpeg.stderr.on('data', (data) => {
            stderr += data.toString()
        })

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                resolve()
            } else {
                // Keep error payload small to avoid noisy IPC/console output
                const trimmed = stderr.length > 4000 ? stderr.slice(-4000) : stderr
                reject(new Error(`FFmpeg failed with code ${code}: ${trimmed}`))
            }
        })

        ffmpeg.on('error', reject)
    })
}

/**
 * 在视频上烧录字幕
 */
function parseDurationFromFfmpegStderr(stderr: string): number | null {
    const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/)
    if (!durationMatch) return null
    const hours = parseInt(durationMatch[1], 10)
    const minutes = parseInt(durationMatch[2], 10)
    const seconds = parseInt(durationMatch[3], 10)
    const ms = parseInt(durationMatch[4], 10) / 100
    return hours * 3600 + minutes * 60 + seconds + ms
}

async function getMediaInfoStderr(mediaPath: string): Promise<string> {
    return await new Promise((resolve, reject) => {
        // `ffmpeg -i <file>` will exit non-zero because no output is specified; stderr contains stream info.
        const ffmpeg = spawn(ffmpegPath, ['-hide_banner', '-i', mediaPath], { stdio: ['ignore', 'pipe', 'pipe'] })

        let stderr = ''
        ffmpeg.stderr.on('data', (data) => {
            stderr += data.toString()
        })

        ffmpeg.on('close', () => resolve(stderr))
        ffmpeg.on('error', reject)
    })
}

async function assertHasAudioStream(videoPath: string): Promise<void> {
    const stderr = await getMediaInfoStderr(videoPath)
    // Typical lines look like: "Stream #0:1: Audio: aac ..."
    const hasAudio = /Stream\s+#\d+:\d+.*Audio:/i.test(stderr) || /Audio:/i.test(stderr)
    if (!hasAudio) {
        throw new Error('未检测到音频轨道：原视频可能是静音/无声视频，无法进行语音转文字')
    }
}

export async function replaceAudioTrack(
    videoPath: string,
    audioPath: string,
    outputPath: string
): Promise<string> {
    const args = [
        '-i', videoPath,
        '-i', audioPath,
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-shortest',
        '-y',
        outputPath,
    ]

    const dir = path.dirname(outputPath)
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }

    await runFFmpeg(args)
    return outputPath
}

export async function burnSubtitles(
    videoPath: string,
    subtitlePath: string,
    outputPath: string,
    style?: Partial<SubtitleStyle>
): Promise<string> {
    const s = { ...defaultSubtitleStyle, ...style }

    // 构建 ASS 样式过滤器
    const escapeFilterValue = (value: string) => {
        return value
            .replace(/\\/g, '/')
            .replace(/:/g, '\\:')
            .replace(/'/g, "\\'")
    }

    const subtitleFilter = `subtitles='${escapeFilterValue(subtitlePath)}':force_style='FontName=${s.fontName},FontSize=${s.fontSize},PrimaryColour=&H${s.fontColor}&,OutlineColour=&H${s.outlineColor}&,Outline=${s.outlineWidth},MarginV=${s.marginBottom},Alignment=${s.alignment}'`

    const args = [
        '-i', videoPath,
        '-vf', subtitleFilter,
        '-c:a', 'copy',
        '-y',
        outputPath,
    ]

    const dir = path.dirname(outputPath)
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
    }
    await runFFmpeg(args)
    return outputPath
}

/**
 * 添加背景音乐
 */
export async function addBackgroundMusic(
    videoPath: string,
    bgmPath: string,
    outputPath: string,
    options?: {
        bgmVolume?: number   // 0.0 - 1.0, 默认 0.2
        loop?: boolean       // 是否循环BGM
    }
): Promise<string> {
    const bgmVolume = options?.bgmVolume ?? 0.2

    // 使用 amix 混合原视频音频和 BGM
    const filterComplex = `[1:a]volume=${bgmVolume}[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[a]`

    const args = [
        '-i', videoPath,
        '-i', bgmPath,
        '-filter_complex', filterComplex,
        '-map', '0:v',
        '-map', '[a]',
        '-c:v', 'copy',
        '-shortest',
        '-y',
        outputPath,
    ]

    await runFFmpeg(args)
    return outputPath
}

/**
 * 从视频中提取音频
 */
export async function extractAudio(
    videoPath: string,
    outputPath: string,
    format: 'mp3' | 'wav' = 'mp3',
    options?: { sampleRate?: number; channels?: number }
): Promise<string> {
    await assertHasAudioStream(videoPath)

    const args = [
        '-i', videoPath,
        '-vn',
        '-acodec', format === 'mp3' ? 'libmp3lame' : 'pcm_s16le',
        ...(options?.sampleRate ? ['-ar', String(options.sampleRate)] : []),
        ...(options?.channels ? ['-ac', String(options.channels)] : []),
        '-y',
        outputPath,
    ]

    await runFFmpeg(args)
    return outputPath
}

/**
 * 截取视频帧作为封面
 */
export async function sliceAudio(
    inputPath: string,
    outputPath: string,
    startTimeInSeconds: number,
    durationInSeconds: number,
    format: 'mp3' | 'wav' = 'mp3',
    options?: { sampleRate?: number; channels?: number }
): Promise<string> {
    const args = [
        '-i', inputPath,
        '-ss', String(startTimeInSeconds),
        '-t', String(durationInSeconds),
        '-vn',
        '-acodec', format === 'mp3' ? 'libmp3lame' : 'pcm_s16le',
        ...(options?.sampleRate ? ['-ar', String(options.sampleRate)] : []),
        ...(options?.channels ? ['-ac', String(options.channels)] : []),
        '-y',
        outputPath,
    ]

    await runFFmpeg(args)
    return outputPath
}

export async function captureFrame(
    videoPath: string,
    outputPath: string,
    timeInSeconds: number = 1
): Promise<string> {
    const args = [
        '-i', videoPath,
        '-ss', timeInSeconds.toString(),
        '-vframes', '1',
        '-y',
        outputPath,
    ]

    await runFFmpeg(args)
    return outputPath
}

/**
 * 获取视频时长
 */
export async function getVideoDuration(videoPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        // 使用 ffmpeg 获取时长 (ffprobe 不在 ffmpeg-static 中)
        const ffmpeg = spawn(ffmpegPath, [
            '-i', videoPath,
            '-f', 'null',
            '-'
        ], { stdio: ['pipe', 'pipe', 'pipe'] })

        let stderr = ''
        ffmpeg.stderr.on('data', (data) => {
            stderr += data.toString()
        })

        ffmpeg.on('close', () => {
            // 从 ffmpeg 输出中解析时长
            const durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/)
            if (durationMatch) {
                const hours = parseInt(durationMatch[1], 10)
                const minutes = parseInt(durationMatch[2], 10)
                const seconds = parseInt(durationMatch[3], 10)
                const ms = parseInt(durationMatch[4], 10) / 100
                resolve(hours * 3600 + minutes * 60 + seconds + ms)
            } else {
                reject(new Error('Failed to parse video duration'))
            }
        })

        ffmpeg.on('error', reject)
    })
}

/**
 * 生成 SRT 字幕文件
 */
export async function getMediaDuration(mediaPath: string): Promise<number> {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn(ffmpegPath, ['-i', mediaPath, '-f', 'null', '-'], { stdio: ['pipe', 'pipe', 'pipe'] })

        let stderr = ''
        ffmpeg.stderr.on('data', (data) => {
            stderr += data.toString()
        })

        ffmpeg.on('close', () => {
            const duration = parseDurationFromFfmpegStderr(stderr)
            if (duration != null) resolve(duration)
            else reject(new Error('Failed to parse media duration'))
        })

        ffmpeg.on('error', reject)
    })
}

export function generateSrtFile(
    segments: Array<{ text: string; startTime: number; endTime: number }>,
    outputPath: string
): string {
    const srtContent = segments.map((seg, index) => {
        const formatTime = (seconds: number) => {
            const h = Math.floor(seconds / 3600)
            const m = Math.floor((seconds % 3600) / 60)
            const s = Math.floor(seconds % 60)
            const ms = Math.floor((seconds % 1) * 1000)
            return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`
        }

        return `${index + 1}
${formatTime(seg.startTime)} --> ${formatTime(seg.endTime)}
${seg.text}
`
    }).join('\n')

    fs.writeFileSync(outputPath, srtContent, 'utf-8')
    return outputPath
}

/**
 * 合并多个视频
 */
export async function concatVideos(
    videoPaths: string[],
    outputPath: string
): Promise<string> {
    // 创建临时文件列表
    const listFile = outputPath + '.txt'
    const listContent = videoPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n')
    fs.writeFileSync(listFile, listContent)

    const args = [
        '-f', 'concat',
        '-safe', '0',
        '-i', listFile,
        '-c', 'copy',
        '-y',
        outputPath,
    ]

    try {
        await runFFmpeg(args)
        fs.unlinkSync(listFile)
        return outputPath
    } catch (e) {
        fs.unlinkSync(listFile)
        throw e
    }
}
