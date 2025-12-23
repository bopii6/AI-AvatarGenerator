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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import https from 'https';
import http from 'http';
// Wav2Lip 模型下载地址（使用 hf-mirror.com 镜像）
var WAV2LIP_MODELS = {
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
};
function resolveWav2LipDir() {
    var resourcesPath = process.resourcesPath;
    var candidates = [
        // dev
        path.join(process.cwd(), 'src', 'services', 'Wav2Lip'),
        // running from compiled electron code in repo
        path.join(process.cwd(), 'dist-electron', 'src', 'services', 'Wav2Lip'),
        // packaged: build.extraResources -> resources/Wav2Lip
        resourcesPath ? path.join(resourcesPath, 'Wav2Lip') : '',
        // fallback: same folder as this service file
        path.join(__dirname, 'Wav2Lip'),
    ].filter(Boolean);
    for (var _i = 0, candidates_1 = candidates; _i < candidates_1.length; _i++) {
        var dir = candidates_1[_i];
        if (fs.existsSync(dir))
            return dir;
    }
    throw new Error('找不到 Wav2Lip 源码目录；请确保打包时已将 `src/services/Wav2Lip` 作为 `extraResources` 带上。');
}
function resolvePythonCommand(config) {
    var stripQuotes = function (value) {
        var trimmed = value.trim();
        if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
            (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
            return trimmed.slice(1, -1).trim();
        }
        return trimmed;
    };
    var pythonFromConfig = config.pythonPath ? stripQuotes(config.pythonPath) : '';
    if (pythonFromConfig)
        return pythonFromConfig;
    var pythonFromEnv = stripQuotes(process.env.DIGITAL_HUMAN_PYTHON || process.env.VIRAL_VIDEO_AGENT_PYTHON || '');
    if (pythonFromEnv)
        return pythonFromEnv;
    // 优先尝试 python（失败由 spawn error 处理）
    return 'python';
}
function getEnvDefaults() {
    var resizeFactor = Math.max(1, parseInt(process.env.WAV2LIP_RESIZE_FACTOR || '1', 10) || 1);
    var faceDetBatchSize = Math.max(1, parseInt(process.env.WAV2LIP_FACE_DET_BATCH_SIZE || '8', 10) || 8);
    var wav2lipBatchSize = Math.max(1, parseInt(process.env.WAV2LIP_BATCH_SIZE || '32', 10) || 32);
    return { resizeFactor: resizeFactor, faceDetBatchSize: faceDetBatchSize, wav2lipBatchSize: wav2lipBatchSize };
}
function finiteNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
}
function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
function resolvePreset(config) {
    var env = getEnvDefaults();
    if (config.qualityPreset === 'fast') {
        return {
            resizeFactor: 2,
            faceDetBatchSize: env.faceDetBatchSize,
            wav2lipBatchSize: env.wav2lipBatchSize,
            mouthOnly: false,
        };
    }
    if (config.qualityPreset === 'quality') {
        return {
            resizeFactor: 1,
            faceDetBatchSize: Math.max(1, Math.min(4, env.faceDetBatchSize)),
            wav2lipBatchSize: Math.max(1, Math.min(16, env.wav2lipBatchSize)),
            mouthOnly: true,
        };
    }
    return {
        resizeFactor: env.resizeFactor,
        faceDetBatchSize: env.faceDetBatchSize,
        wav2lipBatchSize: env.wav2lipBatchSize,
        mouthOnly: false,
    };
}
/**
 * 检查模型是否已下载
 */
export function checkModelsExist(modelsDir, options) {
    if (options === void 0) { options = {}; }
    var checkpoint = options.checkpoint || 'wav2lip';
    var wav2lipPath = path.join(modelsDir, WAV2LIP_MODELS[checkpoint].filename);
    var facePath = path.join(modelsDir, WAV2LIP_MODELS.face_detection.filename);
    var minBytes = 10 * 1024 * 1024; // 防止误把重定向/HTML 当作模型文件
    var isValidFile = function (filePath) {
        try {
            return fs.existsSync(filePath) && fs.statSync(filePath).size >= minBytes;
        }
        catch (_a) {
            return false;
        }
    };
    return isValidFile(wav2lipPath) && isValidFile(facePath);
}
/**
 * 下载模型文件
 */
export function downloadModels(modelsDir_1, onProgress_1) {
    return __awaiter(this, arguments, void 0, function (modelsDir, onProgress, options) {
        var checkpoint, models, _loop_1, i;
        if (options === void 0) { options = {}; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!fs.existsSync(modelsDir)) {
                        fs.mkdirSync(modelsDir, { recursive: true });
                    }
                    checkpoint = options.checkpoint || 'wav2lip';
                    models = [WAV2LIP_MODELS[checkpoint], WAV2LIP_MODELS.face_detection];
                    _loop_1 = function (i) {
                        var model, targetPath, minBytes;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    model = models[i];
                                    targetPath = path.join(modelsDir, model.filename);
                                    if (fs.existsSync(targetPath)) {
                                        onProgress === null || onProgress === void 0 ? void 0 : onProgress({
                                            stage: 'downloading',
                                            progress: ((i + 1) / models.length) * 100,
                                            message: "".concat(model.filename, " \u5DF2\u5B58\u5728\uFF0C\u8DF3\u8FC7"),
                                        });
                                        return [2 /*return*/, "continue"];
                                    }
                                    onProgress === null || onProgress === void 0 ? void 0 : onProgress({
                                        stage: 'downloading',
                                        progress: (i / models.length) * 100,
                                        message: "\u6B63\u5728\u4E0B\u8F7D ".concat(model.filename, " (").concat(model.size, ")..."),
                                    });
                                    minBytes = model.filename.endsWith('.pth') ? 10 * 1024 * 1024 : 0;
                                    return [4 /*yield*/, downloadFile(model.url, targetPath, function (percent) {
                                            onProgress === null || onProgress === void 0 ? void 0 : onProgress({
                                                stage: 'downloading',
                                                progress: (i / models.length) * 100 + (percent / models.length),
                                                message: "\u4E0B\u8F7D ".concat(model.filename, ": ").concat(percent.toFixed(1), "%"),
                                            });
                                        }, { minBytes: minBytes })];
                                case 1:
                                    _b.sent();
                                    return [2 /*return*/];
                            }
                        });
                    };
                    i = 0;
                    _a.label = 1;
                case 1:
                    if (!(i < models.length)) return [3 /*break*/, 4];
                    return [5 /*yield**/, _loop_1(i)];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3:
                    i++;
                    return [3 /*break*/, 1];
                case 4:
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress({
                        stage: 'downloading',
                        progress: 100,
                        message: '模型下载完成！',
                    });
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 下载单个文件
 */
function downloadFile(url_1, outputPath_1, onProgress_1) {
    return __awaiter(this, arguments, void 0, function (url, outputPath, onProgress, options) {
        if (options === void 0) { options = {}; }
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    var minBytes = options.minBytes || 0;
                    var maxRedirects = typeof options.maxRedirects === 'number' ? options.maxRedirects : 8;
                    var visit = function (currentUrl, redirectsLeft) {
                        var protocol = currentUrl.startsWith('https') ? https : http;
                        var request = protocol.get(currentUrl, function (response) {
                            var code = response.statusCode || 0;
                            // 处理重定向（hf-mirror 常见 307/302）
                            if ([301, 302, 303, 307, 308].includes(code) && response.headers.location) {
                                if (redirectsLeft <= 0) {
                                    response.resume();
                                    reject(new Error('下载失败：重定向次数过多'));
                                    return;
                                }
                                var nextUrl = new URL(response.headers.location, currentUrl).toString();
                                response.resume();
                                visit(nextUrl, redirectsLeft - 1);
                                return;
                            }
                            if (code < 200 || code >= 300) {
                                response.resume();
                                reject(new Error("\u4E0B\u8F7D\u5931\u8D25\uFF1AHTTP ".concat(code)));
                                return;
                            }
                            var totalSize = parseInt(response.headers['content-length'] || '0', 10);
                            var downloadedSize = 0;
                            var file = fs.createWriteStream(outputPath);
                            response.on('data', function (chunk) {
                                downloadedSize += chunk.length;
                                if (totalSize > 0) {
                                    onProgress === null || onProgress === void 0 ? void 0 : onProgress((downloadedSize / totalSize) * 100);
                                }
                            });
                            response.pipe(file);
                            file.on('finish', function () {
                                file.close();
                                try {
                                    var stat = fs.statSync(outputPath);
                                    if (minBytes > 0 && stat.size < minBytes) {
                                        fs.unlinkSync(outputPath);
                                        reject(new Error("\u4E0B\u8F7D\u7684\u6587\u4EF6\u5F02\u5E38\uFF08".concat(stat.size, "B\uFF09\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC/\u955C\u50CF\u5730\u5740")));
                                        return;
                                    }
                                    resolve();
                                }
                                catch (err) {
                                    reject(err);
                                }
                            });
                            file.on('error', function (err) {
                                fs.unlink(outputPath, function () { });
                                reject(err);
                            });
                        });
                        request.on('error', reject);
                    };
                    visit(url, maxRedirects);
                })];
        });
    });
}
/**
 * 使用 Python 运行 Wav2Lip（CPU 可跑）
 */
export function runLipSync(config, videoPath, audioPath, outputPath, onProgress) {
    return __awaiter(this, void 0, void 0, function () {
        var checkpoint, wav2lipDir, inferenceScript, runId, workDir, wav2lipModelPath, s3fdModelPath, ffmpegStaticPath, ffmpegPath, perf, pythonCommand, mouthOnlyRatio, mouthBlendSigma, sharpenAmount, sharpenSigma;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    checkpoint = config.qualityPreset === 'quality' ? 'wav2lip_gan' : 'wav2lip';
                    if (!!checkModelsExist(config.modelsDir, { checkpoint: checkpoint })) return [3 /*break*/, 2];
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress({
                        stage: 'downloading',
                        progress: 0,
                        message: "\u6B63\u5728\u4E0B\u8F7D\u6A21\u578B\uFF08".concat(checkpoint, "\uFF0C\u9996\u6B21\u8FD0\u884C\uFF09..."),
                    });
                    return [4 /*yield*/, downloadModels(config.modelsDir, onProgress, { checkpoint: checkpoint })];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2:
                    wav2lipDir = resolveWav2LipDir();
                    inferenceScript = path.join(wav2lipDir, 'inference.py');
                    if (!fs.existsSync(inferenceScript)) {
                        throw new Error("\u627E\u4E0D\u5230 Wav2Lip \u63A8\u7406\u811A\u672C: ".concat(inferenceScript));
                    }
                    // 3. 准备可写工作目录（避免打包后 resources 不可写）
                    if (!fs.existsSync(config.tempDir))
                        fs.mkdirSync(config.tempDir, { recursive: true });
                    runId = Date.now();
                    workDir = path.join(config.tempDir, "wav2lip_run_".concat(runId));
                    fs.mkdirSync(path.join(workDir, 'temp'), { recursive: true });
                    wav2lipModelPath = path.join(config.modelsDir, WAV2LIP_MODELS[checkpoint].filename);
                    s3fdModelPath = path.join(config.modelsDir, WAV2LIP_MODELS.face_detection.filename);
                    ffmpegStaticPath = require('ffmpeg-static');
                    if (ffmpegStaticPath.includes('app.asar') && !ffmpegStaticPath.includes('app.asar.unpacked')) {
                        ffmpegStaticPath = ffmpegStaticPath.replace('app.asar', 'app.asar.unpacked');
                    }
                    ffmpegPath = config.ffmpegPath || ffmpegStaticPath;
                    perf = resolvePreset(config);
                    pythonCommand = resolvePythonCommand(config);
                    mouthOnlyRatio = clampNumber(finiteNumber(parseFloat(process.env.WAV2LIP_MOUTH_ONLY_RATIO || '0.70'), 0.7), 0.0, 1.0);
                    mouthBlendSigma = Math.max(0, finiteNumber(parseFloat(process.env.WAV2LIP_MOUTH_BLEND_SIGMA || '3.0'), 3.0));
                    sharpenAmount = Math.max(0, finiteNumber(parseFloat(process.env.WAV2LIP_SHARPEN_AMOUNT || '0.35'), 0.35));
                    sharpenSigma = Math.max(0.1, finiteNumber(parseFloat(process.env.WAV2LIP_SHARPEN_SIGMA || '1.0'), 1.0));
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress({
                        stage: 'processing',
                        progress: 10,
                        message: '初始化推理环境...',
                    });
                    return [2 /*return*/, new Promise(function (resolve, reject) {
                            var pythonProcess = spawn(pythonCommand, __spreadArray([
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
                                String(perf.wav2lipBatchSize)
                            ], (perf.mouthOnly
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
                                : []), true), {
                                cwd: workDir,
                                env: __assign(__assign({}, process.env), { 
                                    // 让 sfd_detector 从 modelsDir 读取模型，避免向 resources 目录写入
                                    WAV2LIP_S3FD_PATH: s3fdModelPath, PYTHONIOENCODING: 'utf-8' }),
                                shell: false,
                                windowsHide: true,
                            });
                            var stdout = '';
                            var stderr = '';
                            pythonProcess.stdout.on('data', function (data) {
                                var output = data.toString();
                                stdout += output;
                                // 解析进度: "Progress: 50%"
                                var progressMatch = output.match(/Progress:\s*(\d+)%/);
                                if (progressMatch) {
                                    var percent = parseInt(progressMatch[1], 10);
                                    var totalProgress = 20 + percent * 0.8;
                                    onProgress === null || onProgress === void 0 ? void 0 : onProgress({
                                        stage: 'synthesizing',
                                        progress: totalProgress,
                                        message: "\u5507\u5F62\u5408\u6210\u4E2D ".concat(percent, "%"),
                                    });
                                }
                            });
                            pythonProcess.stderr.on('data', function (data) {
                                stderr += data.toString();
                                console.log("[Wav2Lip Error]: ".concat(data));
                            });
                            pythonProcess.on('close', function (code) {
                                if (code === 0 && fs.existsSync(outputPath)) {
                                    onProgress === null || onProgress === void 0 ? void 0 : onProgress({
                                        stage: 'complete',
                                        progress: 100,
                                        message: '唇形同步完成！',
                                    });
                                    resolve(outputPath);
                                    return;
                                }
                                console.error('Wav2Lip STDOUT:', stdout);
                                console.error('Wav2Lip STDERR:', stderr);
                                reject(new Error("Wav2Lip \u63A8\u7406\u5931\u8D25\uFF08\u9000\u51FA\u7801 ".concat(code, "\uFF09\u3002\u8BF7\u67E5\u770B\u63A7\u5236\u53F0\u65E5\u5FD7\u3002")));
                            });
                            pythonProcess.on('error', reject);
                        })];
            }
        });
    });
}
/**
 * 完整的数字人视频生成流程
 * 文本 →（TTS）→ 音频 → 唇形同步 → 输出
 */
export function generateDigitalHumanVideo(config, sourceVideoPath, 
// text: string, // 预留：可用于日志/字幕等
_text, ttsAudioPath, onProgress) {
    return __awaiter(this, void 0, void 0, function () {
        var outputPath;
        return __generator(this, function (_a) {
            if (!fs.existsSync(config.tempDir)) {
                fs.mkdirSync(config.tempDir, { recursive: true });
            }
            outputPath = path.join(config.tempDir, "digital_human_".concat(Date.now(), ".mp4"));
            return [2 /*return*/, runLipSync(config, sourceVideoPath, ttsAudioPath, outputPath, onProgress)];
        });
    });
}
