/**
 * Electron IPC 处理器
 * 连接主进程服务和渲染进程
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
import { ipcMain, app } from 'electron';
import path from 'path';
import { downloadDouyinVideo } from '../src/services/douyinService';
import { generateSpeechFile, getVoiceOptions } from '../src/services/ttsService';
import { rewriteCopy, generateTitles, generateHashtags } from '../src/services/hunyuanService';
import { getDefaultConfig as getDigitalHumanConfig, generateVideo as generateDigitalHumanVideo, getSavedSourceVideos, checkSystemReady, initializeSystem, saveSourceVideo } from '../src/services/digitalHumanService';
import { burnSubtitles, addBackgroundMusic, captureFrame } from '../src/services/ffmpegService';
import { generateCover } from '../src/services/coverService';
import { runPipeline } from '../src/services/pipelineService';
// 配置管理（实际应从设置文件或环境变量读取）
function getConfig() {
    return {
        tencent: {
            secretId: process.env.TENCENT_SECRET_ID || '',
            secretKey: process.env.TENCENT_SECRET_KEY || '',
        },
        aliyun: {
            accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || '',
            accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || '',
        },
        digitalHuman: {
            apiUrl: process.env.DIGITAL_HUMAN_API_URL || 'http://localhost:8080',
            apiKey: process.env.DIGITAL_HUMAN_API_KEY,
        },
        outputDir: path.join(app.getPath('userData'), 'output'),
        // FFmpeg 完整路径（winget 安装位置）
        ffmpegPath: process.env.FFMPEG_PATH || 'C:\\Users\\wang\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.0.1-full_build\\bin\\ffmpeg.exe',
    };
}
/**
 * 注册所有 IPC 处理器
 */
export function registerIpcHandlers(mainWindow) {
    var _this = this;
    var config = getConfig();
    // ========== 视频下载 ==========
    ipcMain.handle('download-video', function (_event, url) { return __awaiter(_this, void 0, void 0, function () {
        var outputDir, result, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    outputDir = path.join(config.outputDir, 'downloads');
                    return [4 /*yield*/, downloadDouyinVideo(url, outputDir, function (percent, message) {
                            mainWindow.webContents.send('download-progress', { percent: percent, message: message });
                        })
                        // 返回格式需要符合前端期望: { success, data: { videoPath, title } }
                    ];
                case 1:
                    result = _a.sent();
                    // 返回格式需要符合前端期望: { success, data: { videoPath, title } }
                    if (result.success) {
                        return [2 /*return*/, { success: true, data: { videoPath: result.videoPath, title: result.title } }];
                    }
                    else {
                        return [2 /*return*/, { success: false, error: result.error }];
                    }
                    return [3 /*break*/, 3];
                case 2:
                    error_1 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_1.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ========== 语音转文字 ==========
    ipcMain.handle('transcribe-audio', function (_event, videoPath) { return __awaiter(_this, void 0, void 0, function () {
        var fs, execSync, audioDir, timestamp, audioPath, duration, probeOutput, recognizeSentence, audioBase64, text, segmentDuration, segmentCount, results, i, startTime, segmentPath, segmentBase64, segmentText, e_1, fullText, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 13, , 14]);
                    return [4 /*yield*/, import('fs')];
                case 1:
                    fs = _a.sent();
                    return [4 /*yield*/, import('child_process')
                        // 检查视频文件是否存在
                    ];
                case 2:
                    execSync = (_a.sent()).execSync;
                    // 检查视频文件是否存在
                    if (!fs.existsSync(videoPath)) {
                        throw new Error('视频文件不存在: ' + videoPath);
                    }
                    audioDir = path.join(config.outputDir, 'audio');
                    if (!fs.existsSync(audioDir)) {
                        fs.mkdirSync(audioDir, { recursive: true });
                    }
                    timestamp = Date.now();
                    audioPath = path.join(audioDir, "temp_audio_".concat(timestamp, ".mp3"));
                    console.log('[ASR] 正在从视频提取音频...');
                    mainWindow.webContents.send('pipeline-progress', 10, '正在提取音频...');
                    try {
                        execSync("\"".concat(config.ffmpegPath, "\" -y -i \"").concat(videoPath, "\" -vn -acodec libmp3lame -ar 16000 -ac 1 \"").concat(audioPath, "\""), {
                            stdio: 'pipe'
                        });
                    }
                    catch (ffmpegError) {
                        throw new Error('FFmpeg 提取音频失败，请确保已安装 FFmpeg');
                    }
                    duration = 0;
                    try {
                        probeOutput = execSync("\"".concat(config.ffmpegPath.replace('ffmpeg.exe', 'ffprobe.exe'), "\" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 \"").concat(audioPath, "\""), {
                            encoding: 'utf-8'
                        });
                        duration = parseFloat(probeOutput.trim());
                    }
                    catch (_b) {
                        duration = 300; // 默认假设 5 分钟
                    }
                    console.log('[ASR] 音频时长:', duration.toFixed(1), '秒');
                    // 检查时长限制（5分钟 = 300秒）
                    if (duration > 300) {
                        fs.unlinkSync(audioPath);
                        throw new Error('视频时长超过 5 分钟，请使用较短的视频');
                    }
                    mainWindow.webContents.send('pipeline-progress', 20, '正在识别语音...');
                    return [4 /*yield*/, import('../src/services/asrService')
                        // 如果音频短于 50 秒，直接识别
                    ];
                case 3:
                    recognizeSentence = (_a.sent()).recognizeSentence;
                    if (!(duration <= 50)) return [3 /*break*/, 5];
                    console.log('[ASR] 使用一句话识别模式（短音频）');
                    audioBase64 = fs.readFileSync(audioPath).toString('base64');
                    return [4 /*yield*/, recognizeSentence(config.tencent, audioBase64)];
                case 4:
                    text = _a.sent();
                    fs.unlinkSync(audioPath);
                    return [2 /*return*/, { success: true, data: text }];
                case 5:
                    // 长音频：分段处理
                    console.log('[ASR] 使用分段识别模式（长音频）');
                    segmentDuration = 50 // 每段 50 秒
                    ;
                    segmentCount = Math.ceil(duration / segmentDuration);
                    results = [];
                    i = 0;
                    _a.label = 6;
                case 6:
                    if (!(i < segmentCount)) return [3 /*break*/, 12];
                    startTime = i * segmentDuration;
                    segmentPath = path.join(audioDir, "segment_".concat(timestamp, "_").concat(i, ".mp3"));
                    mainWindow.webContents.send('pipeline-progress', 20 + (i / segmentCount) * 70, "\u8BC6\u522B\u4E2D... (".concat(i + 1, "/").concat(segmentCount, ")"));
                    // 用 FFmpeg 切分音频
                    try {
                        execSync("\"".concat(config.ffmpegPath, "\" -y -i \"").concat(audioPath, "\" -ss ").concat(startTime, " -t ").concat(segmentDuration, " -acodec libmp3lame \"").concat(segmentPath, "\""), {
                            stdio: 'pipe'
                        });
                    }
                    catch (_c) {
                        console.error("[ASR] \u5206\u6BB5 ".concat(i, " \u5207\u5206\u5931\u8D25"));
                        return [3 /*break*/, 11];
                    }
                    _a.label = 7;
                case 7:
                    _a.trys.push([7, 9, , 10]);
                    segmentBase64 = fs.readFileSync(segmentPath).toString('base64');
                    return [4 /*yield*/, recognizeSentence(config.tencent, segmentBase64)];
                case 8:
                    segmentText = _a.sent();
                    results.push(segmentText);
                    console.log("[ASR] \u5206\u6BB5 ".concat(i + 1, " \u8BC6\u522B\u5B8C\u6210"));
                    return [3 /*break*/, 10];
                case 9:
                    e_1 = _a.sent();
                    console.error("[ASR] \u5206\u6BB5 ".concat(i + 1, " \u8BC6\u522B\u5931\u8D25:"), e_1.message);
                    return [3 /*break*/, 10];
                case 10:
                    // 删除分段文件
                    if (fs.existsSync(segmentPath)) {
                        fs.unlinkSync(segmentPath);
                    }
                    _a.label = 11;
                case 11:
                    i++;
                    return [3 /*break*/, 6];
                case 12:
                    // 清理原始音频
                    if (fs.existsSync(audioPath)) {
                        fs.unlinkSync(audioPath);
                    }
                    fullText = results.join('');
                    console.log('[ASR] 转录完成，总长度:', fullText.length);
                    mainWindow.webContents.send('pipeline-progress', 100, '识别完成');
                    return [2 /*return*/, { success: true, data: fullText }];
                case 13:
                    error_2 = _a.sent();
                    console.error('[ASR] 转录失败:', error_2);
                    return [2 /*return*/, { success: false, error: error_2.message }];
                case 14: return [2 /*return*/];
            }
        });
    }); });
    // ========== TTS 语音合成 ==========
    ipcMain.handle('generate-speech', function (_event, text, voiceType) { return __awaiter(_this, void 0, void 0, function () {
        var outputDir, audioPath, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    outputDir = path.join(config.outputDir, 'audio');
                    return [4 /*yield*/, generateSpeechFile(config.tencent, text, outputDir, { voiceType: voiceType })];
                case 1:
                    audioPath = _a.sent();
                    return [2 /*return*/, { success: true, data: { audioPath: audioPath } }];
                case 2:
                    error_3 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_3.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('get-voice-options', function () { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, { success: true, data: getVoiceOptions() }];
        });
    }); });
    // ========== 文案改写 ==========
    ipcMain.handle('rewrite-copy', function (_event, text, mode, instruction) { return __awaiter(_this, void 0, void 0, function () {
        var result, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, rewriteCopy(config.tencent, text, mode, instruction)];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, { success: true, data: result }];
                case 2:
                    error_4 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_4.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ========== 标题和话题生成 ==========
    ipcMain.handle('generate-title', function (_event, content) { return __awaiter(_this, void 0, void 0, function () {
        var titles, hashtags, error_5;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, generateTitles(config.tencent, content)];
                case 1:
                    titles = _a.sent();
                    return [4 /*yield*/, generateHashtags(config.tencent, content)];
                case 2:
                    hashtags = _a.sent();
                    return [2 /*return*/, { success: true, data: { titles: titles, hashtags: hashtags } }];
                case 3:
                    error_5 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_5.message }];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    // ========== 数字人视频 ==========
    var digitalHumanConfig = getDigitalHumanConfig(app.getPath('userData'));
    ipcMain.handle('get-avatar-list', function () { return __awaiter(_this, void 0, void 0, function () {
        var avatars;
        return __generator(this, function (_a) {
            try {
                avatars = getSavedSourceVideos(digitalHumanConfig);
                return [2 /*return*/, { success: true, data: avatars }];
            }
            catch (error) {
                return [2 /*return*/, { success: false, error: error.message }];
            }
            return [2 /*return*/];
        });
    }); });
    ipcMain.handle('generate-digital-human', function (_event, params) { return __awaiter(_this, void 0, void 0, function () {
        var result, error_6;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, generateDigitalHumanVideo(digitalHumanConfig, {
                            sourceVideoPath: params.sourceVideoPath,
                            audioPath: params.audioPath,
                            text: params.text,
                        }, function (progress) {
                            mainWindow.webContents.send('digital-human-progress', progress);
                        })];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, { success: true, data: result }];
                case 2:
                    error_6 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_6.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // 检查系统状态 (新增)
    ipcMain.handle('digital-human-check-system', function () { return __awaiter(_this, void 0, void 0, function () {
        var status_1, error_7;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, checkSystemReady(digitalHumanConfig)];
                case 1:
                    status_1 = _a.sent();
                    return [2 /*return*/, { success: true, data: status_1 }];
                case 2:
                    error_7 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_7.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // 初始化系统
    ipcMain.handle('digital-human-initialize', function () { return __awaiter(_this, void 0, void 0, function () {
        var error_8;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, initializeSystem(digitalHumanConfig, function (progress) {
                            mainWindow.webContents.send('digital-human-progress', progress);
                        })];
                case 1:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
                case 2:
                    error_8 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_8.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // 保存源视频
    ipcMain.handle('digital-human-save-source', function (_event, params) { return __awaiter(_this, void 0, void 0, function () {
        var buffer, path_1, error_9;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    buffer = Buffer.from(params.videoBuffer, 'base64');
                    return [4 /*yield*/, saveSourceVideo(digitalHumanConfig, buffer, params.name)];
                case 1:
                    path_1 = _a.sent();
                    return [2 /*return*/, { success: true, data: path_1 }];
                case 2:
                    error_9 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_9.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ========== 封面生成 ==========
    ipcMain.handle('generate-cover', function (_event, prompt) { return __awaiter(_this, void 0, void 0, function () {
        var outputDir, covers, error_10;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    outputDir = path.join(config.outputDir, 'covers');
                    return [4 /*yield*/, generateCover(config.aliyun, prompt, outputDir)];
                case 1:
                    covers = _a.sent();
                    return [2 /*return*/, { success: true, data: { coverPaths: covers } }];
                case 2:
                    error_10 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_10.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ========== 全自动流水线 ==========
    ipcMain.handle('run-pipeline', function (_event, params) { return __awaiter(_this, void 0, void 0, function () {
        var pipelineConfig, result, error_11;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    pipelineConfig = getConfig();
                    return [4 /*yield*/, runPipeline(pipelineConfig, params.douyinUrl, {
                            rewriteMode: 'auto', // 默认自动改写
                            voiceType: 101001, // 默认音色
                        }, function (progress) {
                            mainWindow.webContents.send('pipeline-progress', progress);
                        })];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, { success: true, data: result }];
                case 2:
                    error_11 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_11.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('capture-frame', function (_event, videoPath, time) { return __awaiter(_this, void 0, void 0, function () {
        var outputDir, coverPath, error_12;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    outputDir = path.join(config.outputDir, 'covers');
                    coverPath = path.join(outputDir, "frame_".concat(Date.now(), ".jpg"));
                    return [4 /*yield*/, captureFrame(videoPath, coverPath, time)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, { success: true, data: { coverPath: coverPath } }];
                case 2:
                    error_12 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_12.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ========== 视频处理 ==========
    ipcMain.handle('add-subtitles', function (_event, videoPath, subtitlePath) { return __awaiter(_this, void 0, void 0, function () {
        var outputDir, outputPath, error_13;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    outputDir = path.join(config.outputDir, 'video');
                    outputPath = path.join(outputDir, "subtitled_".concat(Date.now(), ".mp4"));
                    return [4 /*yield*/, burnSubtitles(videoPath, subtitlePath, outputPath)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, { success: true, data: { videoPath: outputPath } }];
                case 2:
                    error_13 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_13.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('add-bgm', function (_event, videoPath, bgmPath, volume) { return __awaiter(_this, void 0, void 0, function () {
        var outputDir, outputPath, error_14;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    outputDir = path.join(config.outputDir, 'video');
                    outputPath = path.join(outputDir, "with_bgm_".concat(Date.now(), ".mp4"));
                    return [4 /*yield*/, addBackgroundMusic(videoPath, bgmPath, outputPath, { bgmVolume: volume })];
                case 1:
                    _a.sent();
                    return [2 /*return*/, { success: true, data: { videoPath: outputPath } }];
                case 2:
                    error_14 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_14.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ========== 通用 ==========
    ipcMain.handle('get-app-path', function () {
        return app.getPath('userData');
    });
    ipcMain.handle('get-output-dir', function () {
        return config.outputDir;
    });
    // ========== HeyGem 数字人 ==========
    ipcMain.handle('heygem-check-status', function () { return __awaiter(_this, void 0, void 0, function () {
        var checkServiceStatus, isRunning, error_15;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, import('../src/services/heygemService')];
                case 1:
                    checkServiceStatus = (_a.sent()).checkServiceStatus;
                    return [4 /*yield*/, checkServiceStatus({
                            baseUrl: process.env.HEYGEM_BASE_URL,
                            audioPort: parseInt(process.env.HEYGEM_AUDIO_PORT || '18180'),
                            videoPort: parseInt(process.env.HEYGEM_VIDEO_PORT || '8383'),
                        })];
                case 2:
                    isRunning = _a.sent();
                    return [2 /*return*/, { success: true, data: isRunning }];
                case 3:
                    error_15 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_15.message }];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('heygem-get-models', function () { return __awaiter(_this, void 0, void 0, function () {
        var getTrainedModels, models, error_16;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, import('../src/services/heygemService')];
                case 1:
                    getTrainedModels = (_a.sent()).getTrainedModels;
                    models = getTrainedModels({
                        dataPath: process.env.HEYGEM_DATA_PATH,
                    });
                    return [2 /*return*/, { success: true, data: models }];
                case 2:
                    error_16 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_16.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('heygem-train-model', function (_event, params) { return __awaiter(_this, void 0, void 0, function () {
        var trainAvatarModel, fs, tempDir, tempVideoPath, model, error_17;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, import('../src/services/heygemService')];
                case 1:
                    trainAvatarModel = (_a.sent()).trainAvatarModel;
                    return [4 /*yield*/, import('fs')
                        // 保存视频到临时文件
                    ];
                case 2:
                    fs = _a.sent();
                    tempDir = path.join(config.outputDir, 'temp');
                    if (!fs.existsSync(tempDir)) {
                        fs.mkdirSync(tempDir, { recursive: true });
                    }
                    tempVideoPath = path.join(tempDir, "upload_".concat(Date.now(), ".mp4"));
                    fs.writeFileSync(tempVideoPath, Buffer.from(params.videoBuffer, 'base64'));
                    return [4 /*yield*/, trainAvatarModel({
                            baseUrl: process.env.HEYGEM_BASE_URL,
                            audioPort: parseInt(process.env.HEYGEM_AUDIO_PORT || '18180'),
                            videoPort: parseInt(process.env.HEYGEM_VIDEO_PORT || '8383'),
                            dataPath: process.env.HEYGEM_DATA_PATH,
                        }, tempVideoPath, params.modelName, function (progress, message) {
                            mainWindow.webContents.send('heygem-progress', progress, message);
                        })];
                case 3:
                    model = _a.sent();
                    return [2 /*return*/, { success: true, data: model }];
                case 4:
                    error_17 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_17.message }];
                case 5: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('heygem-generate-video', function (_event, params) { return __awaiter(_this, void 0, void 0, function () {
        var _a, getTrainedModels, textToDigitalHumanVideo, models, model, outputDir, videoPath, error_18;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, import('../src/services/heygemService')];
                case 1:
                    _a = _b.sent(), getTrainedModels = _a.getTrainedModels, textToDigitalHumanVideo = _a.textToDigitalHumanVideo;
                    models = getTrainedModels({ dataPath: process.env.HEYGEM_DATA_PATH });
                    model = models.find(function (m) { return m.id === params.modelId; });
                    if (!model) {
                        throw new Error('找不到指定的数字人形象');
                    }
                    outputDir = path.join(config.outputDir, 'heygem_videos');
                    return [4 /*yield*/, textToDigitalHumanVideo({
                            baseUrl: process.env.HEYGEM_BASE_URL,
                            audioPort: parseInt(process.env.HEYGEM_AUDIO_PORT || '18180'),
                            videoPort: parseInt(process.env.HEYGEM_VIDEO_PORT || '8383'),
                            dataPath: process.env.HEYGEM_DATA_PATH,
                        }, model, params.text, outputDir, function (progress, message) {
                            mainWindow.webContents.send('heygem-progress', progress, message);
                        })];
                case 2:
                    videoPath = _b.sent();
                    return [2 /*return*/, { success: true, data: { videoPath: videoPath } }];
                case 3:
                    error_18 = _b.sent();
                    return [2 /*return*/, { success: false, error: error_18.message }];
                case 4: return [2 /*return*/];
            }
        });
    }); });
}
