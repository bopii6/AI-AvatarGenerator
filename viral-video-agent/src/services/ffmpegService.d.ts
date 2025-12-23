/**
 * FFmpeg 视频处理服务
 * 用于字幕添加、BGM混音、视频截图等
 */
export interface SubtitleStyle {
    fontName: string;
    fontSize: number;
    fontColor: string;
    outlineColor: string;
    outlineWidth: number;
    marginBottom: number;
    alignment: number;
}
export declare function replaceAudioTrack(videoPath: string, audioPath: string, outputPath: string): Promise<string>;
export declare function burnSubtitles(videoPath: string, subtitlePath: string, outputPath: string, style?: Partial<SubtitleStyle>): Promise<string>;
/**
 * 添加背景音乐
 */
export declare function addBackgroundMusic(videoPath: string, bgmPath: string, outputPath: string, options?: {
    bgmVolume?: number;
    loop?: boolean;
}): Promise<string>;
/**
 * 从视频中提取音频
 */
export declare function extractAudio(videoPath: string, outputPath: string, format?: 'mp3' | 'wav', options?: {
    sampleRate?: number;
    channels?: number;
}): Promise<string>;
/**
 * 截取视频帧作为封面
 */
export declare function sliceAudio(inputPath: string, outputPath: string, startTimeInSeconds: number, durationInSeconds: number, format?: 'mp3' | 'wav', options?: {
    sampleRate?: number;
    channels?: number;
}): Promise<string>;
export declare function captureFrame(videoPath: string, outputPath: string, timeInSeconds?: number): Promise<string>;
/**
 * 获取视频时长
 */
export declare function getVideoDuration(videoPath: string): Promise<number>;
/**
 * 生成 SRT 字幕文件
 */
export declare function getMediaDuration(mediaPath: string): Promise<number>;
export declare function generateSrtFile(segments: Array<{
    text: string;
    startTime: number;
    endTime: number;
}>, outputPath: string): string;
/**
 * 合并多个视频
 */
export declare function concatVideos(videoPaths: string[], outputPath: string): Promise<string>;
