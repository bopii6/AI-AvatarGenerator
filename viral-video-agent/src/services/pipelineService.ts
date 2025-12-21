/**
 * 一键追爆流水线服务
 * 串联所有模块，实现全自动化流程
 */

import path from 'path'
import fs from 'fs'
import { downloadDouyinVideo } from './douyinService'
import { transcribeAudio, AsrConfig } from './asrService'
import { generateSpeechFile, TtsConfig } from './ttsService'
import { rewriteCopy, generateTitles, generateHashtags, HunyuanConfig } from './hunyuanService'
import { generateVideo, DigitalHumanConfig, getDefaultConfig as getDigitalHumanConfig } from './digitalHumanService'
import { burnSubtitles, addBackgroundMusic, extractAudio, captureFrame, generateSrtFile } from './ffmpegService'
import { generateCover, WanxiangConfig, CoverServiceConfig, CoverProvider } from './coverService'

export interface PipelineConfig {
    tencent: {
        secretId: string
        secretKey: string
    }
    aliyun: {
        accessKeyId: string
        accessKeySecret: string
    }
    coverProvider: CoverProvider
    digitalHuman: {
        apiUrl: string
        apiKey?: string
    }
    outputDir: string
    extra?: {
        cloudGpuServerUrl?: string
        cloudGpuVideoPort?: string
        cloudVoiceServerUrl?: string
        cloudVoicePort?: string
    }
}

export interface PipelineResult {
    videoPath: string
    coverPath: string
    titles: string[]
    hashtags: string[]
    originalCopy: string
    rewrittenCopy: string
}

export type PipelineStage =
    | 'download'
    | 'extract_audio'
    | 'transcribe'
    | 'rewrite'
    | 'tts'
    | 'digital_human'
    | 'subtitle'
    | 'bgm'
    | 'cover'
    | 'title'
    | 'complete'

export interface PipelineProgress {
    stage: PipelineStage
    progress: number
    message: string
}

/**
 * 执行完整的一键追爆流水线
 */
export async function runPipeline(
    config: PipelineConfig,
    douyinUrl: string,
    options: {
        rewriteMode?: 'auto' | 'custom' | 'same'
        customInstruction?: string
        voiceType?: number
        avatarId?: string
        bgmPath?: string
        bgmVolume?: number
    },
    onProgress?: (progress: PipelineProgress) => void
): Promise<PipelineResult> {
    const outputDir = config.outputDir
    const tempDir = path.join(outputDir, 'temp')

    // 确保目录存在
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
    }
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
    }

    // 配置对象
    const tencentConfig = {
        secretId: config.tencent.secretId,
        secretKey: config.tencent.secretKey,
    }

    try {
        // ========== 1. 下载视频 ==========
        onProgress?.({ stage: 'download', progress: 0, message: '正在下载抖音视频...' })

        const downloadResult = await downloadDouyinVideo(
            douyinUrl,
            tempDir,
            (percent, message) => onProgress?.({ stage: 'download', progress: percent, message })
        )
        if (!downloadResult.success || !downloadResult.videoPath) {
            throw new Error(downloadResult.error || '下载失败')
        }
        const originalVideoPath = downloadResult.videoPath

        // ========== 2. 提取音频 ==========
        onProgress?.({ stage: 'extract_audio', progress: 0, message: '正在提取音频...' })

        const audioPath = path.join(tempDir, 'original_audio.mp3')
        await extractAudio(originalVideoPath, audioPath)

        // ========== 3. 语音转文字 ==========
        onProgress?.({ stage: 'transcribe', progress: 0, message: '正在识别语音...' })

        // 需要将音频上传到可访问的URL（这里简化处理）
        const transcription = await transcribeAudio(
            tencentConfig as AsrConfig,
            `file://${audioPath}`, // 实际需要上传到OSS
            (status) => onProgress?.({ stage: 'transcribe', progress: 50, message: status })
        )
        const originalCopy = transcription.text

        // ========== 4. 文案改写 ==========
        onProgress?.({ stage: 'rewrite', progress: 0, message: '正在改写文案...' })

        const rewrittenCopy = await rewriteCopy(
            tencentConfig as HunyuanConfig,
            originalCopy,
            options.rewriteMode || 'auto',
            options.customInstruction
        )

        // ========== 5. TTS语音合成 ==========
        onProgress?.({ stage: 'tts', progress: 0, message: '正在生成语音...' })

        const speechPath = await generateSpeechFile(
            tencentConfig as TtsConfig,
            rewrittenCopy,
            tempDir,
            { voiceType: options.voiceType }
        )

        // ========== 6. 数字人视频生成 ==========
        onProgress?.({ stage: 'digital_human', progress: 0, message: '正在生成数字人视频...' })

        // 使用默认数字人配置
        const digitalHumanConfig = getDigitalHumanConfig(config.outputDir)
        const digitalHumanResult = await generateVideo(
            digitalHumanConfig,
            {
                sourceVideoPath: originalVideoPath, // 使用原视频作为源
                audioPath: speechPath,
                text: rewrittenCopy,
            },
            (p) => onProgress?.({ stage: 'digital_human', progress: p.progress, message: p.message })
        )
        const digitalHumanVideoPath = digitalHumanResult.videoPath

        // ========== 7. 添加字幕 ==========
        onProgress?.({ stage: 'subtitle', progress: 0, message: '正在添加字幕...' })

        // 生成字幕文件（简化处理，按句子分割）
        const sentences = rewrittenCopy.split(/[。！？]/).filter(s => s.trim())
        const avgDuration = 3 // 平均每句3秒
        const subtitleSegments = sentences.map((text, i) => ({
            text,
            startTime: i * avgDuration,
            endTime: (i + 1) * avgDuration,
        }))

        const srtPath = path.join(tempDir, 'subtitle.srt')
        generateSrtFile(subtitleSegments, srtPath)

        const videoWithSubtitle = path.join(tempDir, 'video_with_subtitle.mp4')
        await burnSubtitles(digitalHumanVideoPath, srtPath, videoWithSubtitle)

        // ========== 8. 添加BGM ==========
        onProgress?.({ stage: 'bgm', progress: 0, message: '正在添加背景音乐...' })

        let finalVideoPath = videoWithSubtitle
        if (options.bgmPath && fs.existsSync(options.bgmPath)) {
            finalVideoPath = path.join(outputDir, `final_${Date.now()}.mp4`)
            await addBackgroundMusic(
                videoWithSubtitle,
                options.bgmPath,
                finalVideoPath,
                { bgmVolume: options.bgmVolume || 0.2 }
            )
        } else {
            // 复制到输出目录
            finalVideoPath = path.join(outputDir, `final_${Date.now()}.mp4`)
            fs.copyFileSync(videoWithSubtitle, finalVideoPath)
        }

        // ========== 9. 生成封面 ==========
        onProgress?.({ stage: 'cover', progress: 0, message: '正在生成封面...' })

        let coverPath: string
        try {
            const coverConfig: CoverServiceConfig = {
                provider: config.coverProvider,
                aliyun: config.aliyun,
                tencent: {
                    secretId: config.tencent.secretId,
                    secretKey: config.tencent.secretKey,
                },
            }
            const covers = await generateCover(
                coverConfig,
                rewrittenCopy.slice(0, 100), // 使用文案前100字作为提示
                outputDir
            )
            coverPath = covers[0]
        } catch (e) {
            // 如果AI生成失败，使用视频截图
            coverPath = path.join(outputDir, `cover_${Date.now()}.jpg`)
            await captureFrame(finalVideoPath, coverPath, 2)
        }

        // ========== 10. 生成标题和话题 ==========
        onProgress?.({ stage: 'title', progress: 0, message: '正在生成标题...' })

        const titles = await generateTitles(tencentConfig as HunyuanConfig, rewrittenCopy)
        const hashtags = await generateHashtags(tencentConfig as HunyuanConfig, rewrittenCopy)

        // ========== 完成 ==========
        onProgress?.({ stage: 'complete', progress: 100, message: '处理完成！' })

        return {
            videoPath: finalVideoPath,
            coverPath,
            titles,
            hashtags,
            originalCopy,
            rewrittenCopy,
        }

    } finally {
        // 清理临时文件（可选）
        // fs.rmSync(tempDir, { recursive: true, force: true })
    }
}
