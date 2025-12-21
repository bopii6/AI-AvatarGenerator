/**
 * 一键追爆流水线服务
 * 串联所有模块，实现全自动化流程
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
import path from 'path';
import fs from 'fs';
import { downloadDouyinVideo } from './douyinService';
import { transcribeAudio } from './asrService';
import { generateSpeechFile } from './ttsService';
import { rewriteCopy, generateTitles, generateHashtags } from './hunyuanService';
import { generateVideo, getDefaultConfig as getDigitalHumanConfig } from './digitalHumanService';
import { burnSubtitles, addBackgroundMusic, extractAudio, captureFrame, generateSrtFile } from './ffmpegService';
import { generateCover } from './coverService';
/**
 * 执行完整的一键追爆流水线
 */
export function runPipeline(config, douyinUrl, options, onProgress) {
    return __awaiter(this, void 0, void 0, function () {
        var outputDir, tempDir, tencentConfig, downloadResult, originalVideoPath, audioPath, transcription, originalCopy, rewrittenCopy, speechPath, digitalHumanConfig, digitalHumanResult, digitalHumanVideoPath, sentences, avgDuration_1, subtitleSegments, srtPath, videoWithSubtitle, finalVideoPath, coverPath, covers, e_1, titles, hashtags;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    outputDir = config.outputDir;
                    tempDir = path.join(outputDir, 'temp');
                    // 确保目录存在
                    if (!fs.existsSync(outputDir)) {
                        fs.mkdirSync(outputDir, { recursive: true });
                    }
                    if (!fs.existsSync(tempDir)) {
                        fs.mkdirSync(tempDir, { recursive: true });
                    }
                    tencentConfig = {
                        secretId: config.tencent.secretId,
                        secretKey: config.tencent.secretKey,
                    };
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, , 19, 20]);
                    // ========== 1. 下载视频 ==========
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress({ stage: 'download', progress: 0, message: '正在下载抖音视频...' });
                    return [4 /*yield*/, downloadDouyinVideo(douyinUrl, tempDir, function (percent, message) { return onProgress === null || onProgress === void 0 ? void 0 : onProgress({ stage: 'download', progress: percent, message: message }); })];
                case 2:
                    downloadResult = _a.sent();
                    if (!downloadResult.success || !downloadResult.videoPath) {
                        throw new Error(downloadResult.error || '下载失败');
                    }
                    originalVideoPath = downloadResult.videoPath;
                    // ========== 2. 提取音频 ==========
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress({ stage: 'extract_audio', progress: 0, message: '正在提取音频...' });
                    audioPath = path.join(tempDir, 'original_audio.mp3');
                    return [4 /*yield*/, extractAudio(originalVideoPath, audioPath)
                        // ========== 3. 语音转文字 ==========
                    ];
                case 3:
                    _a.sent();
                    // ========== 3. 语音转文字 ==========
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress({ stage: 'transcribe', progress: 0, message: '正在识别语音...' });
                    return [4 /*yield*/, transcribeAudio(tencentConfig, "file://".concat(audioPath), // 实际需要上传到OSS
                        function (status) { return onProgress === null || onProgress === void 0 ? void 0 : onProgress({ stage: 'transcribe', progress: 50, message: status }); })];
                case 4:
                    transcription = _a.sent();
                    originalCopy = transcription.text;
                    // ========== 4. 文案改写 ==========
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress({ stage: 'rewrite', progress: 0, message: '正在改写文案...' });
                    return [4 /*yield*/, rewriteCopy(tencentConfig, originalCopy, options.rewriteMode || 'auto', options.customInstruction)
                        // ========== 5. TTS语音合成 ==========
                    ];
                case 5:
                    rewrittenCopy = _a.sent();
                    // ========== 5. TTS语音合成 ==========
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress({ stage: 'tts', progress: 0, message: '正在生成语音...' });
                    return [4 /*yield*/, generateSpeechFile(tencentConfig, rewrittenCopy, tempDir, { voiceType: options.voiceType })
                        // ========== 6. 数字人视频生成 ==========
                    ];
                case 6:
                    speechPath = _a.sent();
                    // ========== 6. 数字人视频生成 ==========
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress({ stage: 'digital_human', progress: 0, message: '正在生成数字人视频...' });
                    digitalHumanConfig = getDigitalHumanConfig(config.outputDir);
                    return [4 /*yield*/, generateVideo(digitalHumanConfig, {
                            sourceVideoPath: originalVideoPath, // 使用原视频作为源
                            audioPath: speechPath,
                            text: rewrittenCopy,
                        }, function (p) { return onProgress === null || onProgress === void 0 ? void 0 : onProgress({ stage: 'digital_human', progress: p.progress, message: p.message }); })];
                case 7:
                    digitalHumanResult = _a.sent();
                    digitalHumanVideoPath = digitalHumanResult.videoPath;
                    // ========== 7. 添加字幕 ==========
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress({ stage: 'subtitle', progress: 0, message: '正在添加字幕...' });
                    sentences = rewrittenCopy.split(/[。！？]/).filter(function (s) { return s.trim(); });
                    avgDuration_1 = 3 // 平均每句3秒
                    ;
                    subtitleSegments = sentences.map(function (text, i) { return ({
                        text: text,
                        startTime: i * avgDuration_1,
                        endTime: (i + 1) * avgDuration_1,
                    }); });
                    srtPath = path.join(tempDir, 'subtitle.srt');
                    generateSrtFile(subtitleSegments, srtPath);
                    videoWithSubtitle = path.join(tempDir, 'video_with_subtitle.mp4');
                    return [4 /*yield*/, burnSubtitles(digitalHumanVideoPath, srtPath, videoWithSubtitle)
                        // ========== 8. 添加BGM ==========
                    ];
                case 8:
                    _a.sent();
                    // ========== 8. 添加BGM ==========
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress({ stage: 'bgm', progress: 0, message: '正在添加背景音乐...' });
                    finalVideoPath = videoWithSubtitle;
                    if (!(options.bgmPath && fs.existsSync(options.bgmPath))) return [3 /*break*/, 10];
                    finalVideoPath = path.join(outputDir, "final_".concat(Date.now(), ".mp4"));
                    return [4 /*yield*/, addBackgroundMusic(videoWithSubtitle, options.bgmPath, finalVideoPath, { bgmVolume: options.bgmVolume || 0.2 })];
                case 9:
                    _a.sent();
                    return [3 /*break*/, 11];
                case 10:
                    // 复制到输出目录
                    finalVideoPath = path.join(outputDir, "final_".concat(Date.now(), ".mp4"));
                    fs.copyFileSync(videoWithSubtitle, finalVideoPath);
                    _a.label = 11;
                case 11:
                    // ========== 9. 生成封面 ==========
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress({ stage: 'cover', progress: 0, message: '正在生成封面...' });
                    coverPath = void 0;
                    _a.label = 12;
                case 12:
                    _a.trys.push([12, 14, , 16]);
                    return [4 /*yield*/, generateCover(config.aliyun, rewrittenCopy.slice(0, 100), // 使用文案前100字作为提示
                        outputDir)];
                case 13:
                    covers = _a.sent();
                    coverPath = covers[0];
                    return [3 /*break*/, 16];
                case 14:
                    e_1 = _a.sent();
                    // 如果AI生成失败，使用视频截图
                    coverPath = path.join(outputDir, "cover_".concat(Date.now(), ".jpg"));
                    return [4 /*yield*/, captureFrame(finalVideoPath, coverPath, 2)];
                case 15:
                    _a.sent();
                    return [3 /*break*/, 16];
                case 16:
                    // ========== 10. 生成标题和话题 ==========
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress({ stage: 'title', progress: 0, message: '正在生成标题...' });
                    return [4 /*yield*/, generateTitles(tencentConfig, rewrittenCopy)];
                case 17:
                    titles = _a.sent();
                    return [4 /*yield*/, generateHashtags(tencentConfig, rewrittenCopy)
                        // ========== 完成 ==========
                    ];
                case 18:
                    hashtags = _a.sent();
                    // ========== 完成 ==========
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress({ stage: 'complete', progress: 100, message: '处理完成！' });
                    return [2 /*return*/, {
                            videoPath: finalVideoPath,
                            coverPath: coverPath,
                            titles: titles,
                            hashtags: hashtags,
                            originalCopy: originalCopy,
                            rewrittenCopy: rewrittenCopy,
                        }];
                case 19: return [7 /*endfinally*/];
                case 20: return [2 /*return*/];
            }
        });
    });
}
