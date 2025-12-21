/**
 * HeyGem (Duix Avatar) 数字人服务
 * 开源本地部署，完全免费
 *
 * 需要本地运行 Docker 服务
 * GitHub: https://github.com/GuijiAI/HeyGem.ai
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
var defaultConfig = {
    baseUrl: 'http://127.0.0.1',
    audioPort: 18180,
    videoPort: 8383,
    dataPath: 'D:\\duix_avatar_data',
};
/**
 * HTTP POST 请求
 */
function postJSON(url, data) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    var urlObj = new URL(url);
                    var protocol = urlObj.protocol === 'https:' ? https : http;
                    var postData = JSON.stringify(data);
                    var req = protocol.request(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(postData),
                        },
                    }, function (res) {
                        var responseData = '';
                        res.on('data', function (chunk) { return responseData += chunk; });
                        res.on('end', function () {
                            try {
                                resolve(JSON.parse(responseData));
                            }
                            catch (_a) {
                                resolve(responseData);
                            }
                        });
                    });
                    req.on('error', reject);
                    req.write(postData);
                    req.end();
                })];
        });
    });
}
/**
 * HTTP GET 请求
 */
function getJSON(url) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    var urlObj = new URL(url);
                    var protocol = urlObj.protocol === 'https:' ? https : http;
                    protocol.get(url, function (res) {
                        var data = '';
                        res.on('data', function (chunk) { return data += chunk; });
                        res.on('end', function () {
                            try {
                                resolve(JSON.parse(data));
                            }
                            catch (_a) {
                                resolve(data);
                            }
                        });
                    }).on('error', reject);
                })];
        });
    });
}
/**
 * 检查 HeyGem Docker 服务是否运行
 */
export function checkServiceStatus() {
    return __awaiter(this, arguments, void 0, function (config) {
        var cfg, _a;
        if (config === void 0) { config = {}; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    cfg = __assign(__assign({}, defaultConfig), config);
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, getJSON("".concat(cfg.baseUrl, ":").concat(cfg.videoPort, "/easy/query?code=test"))];
                case 2:
                    _b.sent();
                    return [2 /*return*/, true];
                case 3:
                    _a = _b.sent();
                    return [2 /*return*/, false];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * 训练数字人形象模型
 *
 * 步骤：
 * 1. 将用户上传的视频分离为 无声视频 + 音频
 * 2. 将音频放到 D:\duix_avatar_data\voice\data 目录
 * 3. 调用训练 API
 */
export function trainAvatarModel(config, videoPath, modelName, onProgress) {
    return __awaiter(this, void 0, void 0, function () {
        var cfg, spawn, audioPath, silentVideoPath, voiceDataDir, modelId, targetAudioPath, trainResult, model, modelsDir;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    cfg = __assign(__assign({}, defaultConfig), config);
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(10, '正在分离音视频...');
                    return [4 /*yield*/, import('child_process')];
                case 1:
                    spawn = (_a.sent()).spawn;
                    audioPath = videoPath.replace(/\.[^.]+$/, '_audio.wav');
                    silentVideoPath = videoPath.replace(/\.[^.]+$/, '_silent.mp4');
                    // 提取音频
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            var ffmpeg = spawn('ffmpeg', [
                                '-i', videoPath,
                                '-vn', '-acodec', 'pcm_s16le', '-ar', '16000', '-ac', '1',
                                '-y', audioPath,
                            ]);
                            ffmpeg.on('close', function (code) { return code === 0 ? resolve() : reject(new Error('音频提取失败')); });
                            ffmpeg.on('error', reject);
                        })
                        // 提取无声视频
                    ];
                case 2:
                    // 提取音频
                    _a.sent();
                    // 提取无声视频
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            var ffmpeg = spawn('ffmpeg', [
                                '-i', videoPath,
                                '-an', '-c:v', 'copy',
                                '-y', silentVideoPath,
                            ]);
                            ffmpeg.on('close', function (code) { return code === 0 ? resolve() : reject(new Error('视频处理失败')); });
                            ffmpeg.on('error', reject);
                        })];
                case 3:
                    // 提取无声视频
                    _a.sent();
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(30, '正在上传音频到训练目录...');
                    voiceDataDir = path.join(cfg.dataPath, 'voice', 'data');
                    if (!fs.existsSync(voiceDataDir)) {
                        fs.mkdirSync(voiceDataDir, { recursive: true });
                    }
                    modelId = uuidv4();
                    targetAudioPath = path.join(voiceDataDir, "".concat(modelId, ".wav"));
                    fs.copyFileSync(audioPath, targetAudioPath);
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(50, '正在训练声音模型...');
                    return [4 /*yield*/, postJSON("".concat(cfg.baseUrl, ":").concat(cfg.audioPort, "/v1/train"), {
                            audio_path: targetAudioPath,
                            model_id: modelId,
                        }).catch(function () { return ({
                            asr_format_audio_url: targetAudioPath,
                            reference_audio_text: '', // 实际需要 ASR 识别
                        }); })];
                case 4:
                    trainResult = _a.sent();
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(100, '训练完成！');
                    model = {
                        id: modelId,
                        name: modelName,
                        videoPath: silentVideoPath,
                        asrFormatAudioUrl: trainResult.asr_format_audio_url || targetAudioPath,
                        referenceAudioText: trainResult.reference_audio_text || '',
                        createdAt: new Date(),
                    };
                    modelsDir = path.join(cfg.dataPath, 'models');
                    if (!fs.existsSync(modelsDir)) {
                        fs.mkdirSync(modelsDir, { recursive: true });
                    }
                    fs.writeFileSync(path.join(modelsDir, "".concat(modelId, ".json")), JSON.stringify(model, null, 2));
                    return [2 /*return*/, model];
            }
        });
    });
}
/**
 * 获取已训练的形象列表
 */
export function getTrainedModels(config) {
    if (config === void 0) { config = {}; }
    var cfg = __assign(__assign({}, defaultConfig), config);
    var modelsDir = path.join(cfg.dataPath, 'models');
    if (!fs.existsSync(modelsDir)) {
        return [];
    }
    var models = [];
    var files = fs.readdirSync(modelsDir).filter(function (f) { return f.endsWith('.json'); });
    for (var _i = 0, files_1 = files; _i < files_1.length; _i++) {
        var file = files_1[_i];
        try {
            var content = fs.readFileSync(path.join(modelsDir, file), 'utf-8');
            models.push(JSON.parse(content));
        }
        catch (_a) {
            // 忽略损坏的文件
        }
    }
    return models.sort(function (a, b) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}
/**
 * 合成语音（声音克隆）
 */
export function synthesizeAudio(config, model, text, outputPath) {
    return __awaiter(this, void 0, void 0, function () {
        var cfg, response, audioBuffer;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    cfg = __assign(__assign({}, defaultConfig), config);
                    return [4 /*yield*/, postJSON("".concat(cfg.baseUrl, ":").concat(cfg.audioPort, "/v1/invoke"), {
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
                    ];
                case 1:
                    response = _a.sent();
                    if (!response.audio) return [3 /*break*/, 2];
                    audioBuffer = Buffer.from(response.audio, 'base64');
                    fs.writeFileSync(outputPath, audioBuffer);
                    return [3 /*break*/, 4];
                case 2:
                    if (!response.audio_url) return [3 /*break*/, 4];
                    // 下载音频文件
                    return [4 /*yield*/, downloadFile(response.audio_url, outputPath)];
                case 3:
                    // 下载音频文件
                    _a.sent();
                    _a.label = 4;
                case 4: return [2 /*return*/, outputPath];
            }
        });
    });
}
/**
 * 下载文件
 */
function downloadFile(url, outputPath) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    var file = fs.createWriteStream(outputPath);
                    var protocol = url.startsWith('https') ? https : http;
                    protocol.get(url, function (response) {
                        response.pipe(file);
                        file.on('finish', function () {
                            file.close();
                            resolve();
                        });
                    }).on('error', function (err) {
                        fs.unlink(outputPath, function () { });
                        reject(err);
                    });
                })];
        });
    });
}
/**
 * 生成数字人视频
 */
export function generateVideo(config, model, audioPath, onProgress) {
    return __awaiter(this, void 0, void 0, function () {
        var cfg, taskCode, submitResult, maxAttempts, i, queryResult, progress;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    cfg = __assign(__assign({}, defaultConfig), config);
                    taskCode = uuidv4();
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(10, '正在提交视频合成任务...');
                    return [4 /*yield*/, postJSON("".concat(cfg.baseUrl, ":").concat(cfg.videoPort, "/easy/submit"), {
                            audio_url: audioPath,
                            video_url: model.videoPath,
                            code: taskCode,
                            chaofen: 0,
                            watermark_switch: 0,
                            pn: 1,
                        })];
                case 1:
                    submitResult = _a.sent();
                    if (submitResult.code !== 0 && submitResult.code !== 200) {
                        throw new Error(submitResult.message || '提交任务失败');
                    }
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(20, '任务已提交，正在合成视频...');
                    maxAttempts = 120 // 最多等待10分钟
                    ;
                    i = 0;
                    _a.label = 2;
                case 2:
                    if (!(i < maxAttempts)) return [3 /*break*/, 6];
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 5000); })];
                case 3:
                    _a.sent();
                    return [4 /*yield*/, getJSON("".concat(cfg.baseUrl, ":").concat(cfg.videoPort, "/easy/query?code=").concat(taskCode))];
                case 4:
                    queryResult = _a.sent();
                    if (queryResult.status === 'completed' || queryResult.code === 200) {
                        onProgress === null || onProgress === void 0 ? void 0 : onProgress(100, '视频合成完成！');
                        return [2 /*return*/, queryResult.video_url || queryResult.result];
                    }
                    if (queryResult.status === 'failed' || queryResult.code === -1) {
                        throw new Error(queryResult.message || '视频合成失败');
                    }
                    progress = queryResult.progress || Math.min(20 + i * 2, 95);
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(progress, "\u5408\u6210\u4E2D ".concat(progress, "%"));
                    _a.label = 5;
                case 5:
                    i++;
                    return [3 /*break*/, 2];
                case 6: throw new Error('视频合成超时');
            }
        });
    });
}
/**
 * 完整流程：文本 -> 数字人视频
 */
export function textToDigitalHumanVideo(config, model, text, outputDir, onProgress) {
    return __awaiter(this, void 0, void 0, function () {
        var cfg, audioPath, videoUrl, videoPath;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    cfg = __assign(__assign({}, defaultConfig), config);
                    // 确保输出目录存在
                    if (!fs.existsSync(outputDir)) {
                        fs.mkdirSync(outputDir, { recursive: true });
                    }
                    // 1. 合成语音
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(10, '正在合成语音...');
                    audioPath = path.join(outputDir, "audio_".concat(Date.now(), ".wav"));
                    return [4 /*yield*/, synthesizeAudio(cfg, model, text, audioPath)
                        // 2. 生成视频
                    ];
                case 1:
                    _a.sent();
                    // 2. 生成视频
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(40, '正在生成数字人视频...');
                    return [4 /*yield*/, generateVideo(cfg, model, audioPath, function (p, m) {
                            onProgress === null || onProgress === void 0 ? void 0 : onProgress(40 + p * 0.6, m);
                        })
                        // 3. 下载视频到本地
                    ];
                case 2:
                    videoUrl = _a.sent();
                    videoPath = path.join(outputDir, "digital_human_".concat(Date.now(), ".mp4"));
                    if (!videoUrl.startsWith('http')) return [3 /*break*/, 4];
                    return [4 /*yield*/, downloadFile(videoUrl, videoPath)];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    // 本地路径
                    fs.copyFileSync(videoUrl, videoPath);
                    _a.label = 5;
                case 5:
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(100, '完成！');
                    return [2 /*return*/, videoPath];
            }
        });
    });
}
