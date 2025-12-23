/**
 * 数字人服务（本地版）
 * 基于开源 Wav2Lip 实现唇形同步，支持 CPU 推理（速度较慢但无需 GPU）
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
import { execFile } from 'child_process';
import { checkModelsExist, downloadModels, runLipSync, } from './lipSyncService';
/**
 * 获取默认配置
 */
export function getDefaultConfig(appDataPath) {
    return {
        modelsDir: path.join(appDataPath, 'models', 'wav2lip'),
        tempDir: path.join(appDataPath, 'temp'),
        outputDir: path.join(appDataPath, 'output', 'digital_human'),
        pythonPath: (process.env.DIGITAL_HUMAN_PYTHON || process.env.VIRAL_VIDEO_AGENT_PYTHON || undefined),
    };
}
function checkPython(pythonPath) {
    var cmd = (pythonPath === null || pythonPath === void 0 ? void 0 : pythonPath.trim()) || 'python';
    return new Promise(function (resolve) {
        execFile(cmd, ['--version'], function (error) { return resolve(!error); });
    });
}
function hasBundledFFmpeg() {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        var ffmpegPath = require('ffmpeg-static');
        if (ffmpegPath.includes('app.asar') && !ffmpegPath.includes('app.asar.unpacked')) {
            ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
        }
        return typeof ffmpegPath === 'string' && fs.existsSync(ffmpegPath);
    }
    catch (_a) {
        return false;
    }
}
/**
 * 检查系统是否已准备好
 */
export function checkSystemReady(config, options) {
    return __awaiter(this, void 0, void 0, function () {
        var checkpoint, modelsDownloaded, pythonInstalled, ffmpegInstalled;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    checkpoint = (options === null || options === void 0 ? void 0 : options.qualityPreset) === 'quality' ? 'wav2lip_gan' : 'wav2lip';
                    modelsDownloaded = checkModelsExist(config.modelsDir, { checkpoint: checkpoint });
                    return [4 /*yield*/, checkPython(config.pythonPath)];
                case 1:
                    pythonInstalled = _a.sent();
                    ffmpegInstalled = hasBundledFFmpeg();
                    return [2 /*return*/, {
                            ready: modelsDownloaded && pythonInstalled && ffmpegInstalled,
                            modelsDownloaded: modelsDownloaded,
                            pythonInstalled: pythonInstalled,
                            ffmpegInstalled: ffmpegInstalled,
                        }];
            }
        });
    });
}
/**
 * 初始化系统（下载模型）
 */
export function initializeSystem(config, onProgress, options) {
    return __awaiter(this, void 0, void 0, function () {
        var _i, _a, dir, checkpoint;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    for (_i = 0, _a = [config.modelsDir, config.tempDir, config.outputDir]; _i < _a.length; _i++) {
                        dir = _a[_i];
                        if (!fs.existsSync(dir))
                            fs.mkdirSync(dir, { recursive: true });
                    }
                    checkpoint = (options === null || options === void 0 ? void 0 : options.qualityPreset) === 'quality' ? 'wav2lip_gan' : 'wav2lip';
                    if (!!checkModelsExist(config.modelsDir, { checkpoint: checkpoint })) return [3 /*break*/, 2];
                    return [4 /*yield*/, downloadModels(config.modelsDir, onProgress, { checkpoint: checkpoint })];
                case 1:
                    _b.sent();
                    return [2 /*return*/];
                case 2:
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress({
                        stage: 'complete',
                        progress: 100,
                        message: '模型已就绪',
                    });
                    return [2 /*return*/];
            }
        });
    });
}
/**
 * 生成数字人视频
 */
export function generateVideo(config, options, onProgress) {
    return __awaiter(this, void 0, void 0, function () {
        var startTime, outputPath, lipSyncConfig, duration;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    startTime = Date.now();
                    if (!fs.existsSync(options.sourceVideoPath)) {
                        throw new Error('源视频文件不存在');
                    }
                    if (!fs.existsSync(options.audioPath)) {
                        throw new Error('音频文件不存在');
                    }
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress({
                        stage: 'processing',
                        progress: 5,
                        message: '准备处理...',
                    });
                    if (!fs.existsSync(config.outputDir)) {
                        fs.mkdirSync(config.outputDir, { recursive: true });
                    }
                    outputPath = path.join(config.outputDir, "digital_human_".concat(Date.now(), ".mp4"));
                    lipSyncConfig = {
                        modelsDir: config.modelsDir,
                        tempDir: config.tempDir,
                        pythonPath: config.pythonPath,
                        qualityPreset: options.qualityPreset,
                    };
                    return [4 /*yield*/, runLipSync(lipSyncConfig, options.sourceVideoPath, options.audioPath, outputPath, onProgress)];
                case 1:
                    _a.sent();
                    duration = (Date.now() - startTime) / 1000;
                    return [2 /*return*/, {
                            videoPath: outputPath,
                            duration: duration,
                            success: true,
                        }];
            }
        });
    });
}
/**
 * 获取已保存的源视频列表
 */
export function getSavedSourceVideos(config) {
    var sourceDir = path.join(config.outputDir, 'sources');
    if (!fs.existsSync(sourceDir))
        return [];
    return fs
        .readdirSync(sourceDir)
        .filter(function (f) { return f.endsWith('.mp4') || f.endsWith('.mov') || f.endsWith('.avi'); })
        .map(function (f) { return path.join(sourceDir, f); });
}
/**
 * 保存用户上传的源视频
 */
export function saveSourceVideo(config, videoBuffer, name) {
    return __awaiter(this, void 0, void 0, function () {
        var sourceDir, filename, filepath;
        return __generator(this, function (_a) {
            sourceDir = path.join(config.outputDir, 'sources');
            if (!fs.existsSync(sourceDir))
                fs.mkdirSync(sourceDir, { recursive: true });
            filename = "".concat(name, "_").concat(Date.now(), ".mp4");
            filepath = path.join(sourceDir, filename);
            fs.writeFileSync(filepath, videoBuffer);
            return [2 /*return*/, filepath];
        });
    });
}
