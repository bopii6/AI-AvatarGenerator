/**
 * FFmpeg 视频处理服务
 * 用于字幕添加、BGM混音、视频截图等
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
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
// 使用 ffmpeg-static 获取 FFmpeg 可执行文件路径
// eslint-disable-next-line @typescript-eslint/no-var-requires
var ffmpegPath = require('ffmpeg-static');
if (ffmpegPath.includes('app.asar') && !ffmpegPath.includes('app.asar.unpacked')) {
    ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
}
var defaultSubtitleStyle = {
    fontName: 'Microsoft YaHei',
    fontSize: 24,
    fontColor: 'ffffff',
    outlineColor: '000000',
    outlineWidth: 2,
    marginBottom: 50,
    alignment: 2,
};
/**
 * 执行 FFmpeg 命令
 */
function runFFmpeg(args) {
    return new Promise(function (resolve, reject) {
        console.log("[FFmpeg] \u4F7F\u7528\u8DEF\u5F84: ".concat(ffmpegPath));
        console.log("[FFmpeg] \u53C2\u6570: ".concat(args.join(' ')));
        var ffmpeg = spawn(ffmpegPath, args, { stdio: 'pipe' });
        var stderr = '';
        ffmpeg.stderr.on('data', function (data) {
            stderr += data.toString();
        });
        ffmpeg.on('close', function (code) {
            if (code === 0) {
                resolve();
            }
            else {
                // Keep error payload small to avoid noisy IPC/console output
                var trimmed = stderr.length > 4000 ? stderr.slice(-4000) : stderr;
                reject(new Error("FFmpeg failed with code ".concat(code, ": ").concat(trimmed)));
            }
        });
        ffmpeg.on('error', reject);
    });
}
/**
 * 在视频上烧录字幕
 */
function parseDurationFromFfmpegStderr(stderr) {
    var durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
    if (!durationMatch)
        return null;
    var hours = parseInt(durationMatch[1], 10);
    var minutes = parseInt(durationMatch[2], 10);
    var seconds = parseInt(durationMatch[3], 10);
    var ms = parseInt(durationMatch[4], 10) / 100;
    return hours * 3600 + minutes * 60 + seconds + ms;
}
function getMediaInfoStderr(mediaPath) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, new Promise(function (resolve, reject) {
                        // `ffmpeg -i <file>` will exit non-zero because no output is specified; stderr contains stream info.
                        var ffmpeg = spawn(ffmpegPath, ['-hide_banner', '-i', mediaPath], { stdio: ['ignore', 'pipe', 'pipe'] });
                        var stderr = '';
                        ffmpeg.stderr.on('data', function (data) {
                            stderr += data.toString();
                        });
                        ffmpeg.on('close', function () { return resolve(stderr); });
                        ffmpeg.on('error', reject);
                    })];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
function assertHasAudioStream(videoPath) {
    return __awaiter(this, void 0, void 0, function () {
        var stderr, hasAudio;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, getMediaInfoStderr(videoPath)
                    // Typical lines look like: "Stream #0:1: Audio: aac ..."
                ];
                case 1:
                    stderr = _a.sent();
                    hasAudio = /Stream\s+#\d+:\d+.*Audio:/i.test(stderr) || /Audio:/i.test(stderr);
                    if (!hasAudio) {
                        throw new Error('未检测到音频轨道：原视频可能是静音/无声视频，无法进行语音转文字');
                    }
                    return [2 /*return*/];
            }
        });
    });
}
export function replaceAudioTrack(videoPath, audioPath, outputPath) {
    return __awaiter(this, void 0, void 0, function () {
        var args, dir;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    args = [
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
                    ];
                    dir = path.dirname(outputPath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    return [4 /*yield*/, runFFmpeg(args)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, outputPath];
            }
        });
    });
}
export function burnSubtitles(videoPath, subtitlePath, outputPath, style) {
    return __awaiter(this, void 0, void 0, function () {
        var s, escapeFilterValue, subtitleFilter, args, dir;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    s = __assign(__assign({}, defaultSubtitleStyle), style);
                    escapeFilterValue = function (value) {
                        return value
                            .replace(/\\/g, '/')
                            .replace(/:/g, '\\:')
                            .replace(/'/g, "\\'");
                    };
                    subtitleFilter = "subtitles='".concat(escapeFilterValue(subtitlePath), "':force_style='FontName=").concat(s.fontName, ",FontSize=").concat(s.fontSize, ",PrimaryColour=&H").concat(s.fontColor, "&,OutlineColour=&H").concat(s.outlineColor, "&,Outline=").concat(s.outlineWidth, ",MarginV=").concat(s.marginBottom, ",Alignment=").concat(s.alignment, "'");
                    args = [
                        '-i', videoPath,
                        '-vf', subtitleFilter,
                        '-c:a', 'copy',
                        '-y',
                        outputPath,
                    ];
                    dir = path.dirname(outputPath);
                    if (!fs.existsSync(dir)) {
                        fs.mkdirSync(dir, { recursive: true });
                    }
                    return [4 /*yield*/, runFFmpeg(args)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, outputPath];
            }
        });
    });
}
/**
 * 添加背景音乐
 */
export function addBackgroundMusic(videoPath, bgmPath, outputPath, options) {
    return __awaiter(this, void 0, void 0, function () {
        var bgmVolume, filterComplex, args;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    bgmVolume = (_a = options === null || options === void 0 ? void 0 : options.bgmVolume) !== null && _a !== void 0 ? _a : 0.2;
                    filterComplex = "[1:a]volume=".concat(bgmVolume, "[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=2[a]");
                    args = [
                        '-i', videoPath,
                        '-i', bgmPath,
                        '-filter_complex', filterComplex,
                        '-map', '0:v',
                        '-map', '[a]',
                        '-c:v', 'copy',
                        '-shortest',
                        '-y',
                        outputPath,
                    ];
                    return [4 /*yield*/, runFFmpeg(args)];
                case 1:
                    _b.sent();
                    return [2 /*return*/, outputPath];
            }
        });
    });
}
/**
 * 从视频中提取音频
 */
export function extractAudio(videoPath_1, outputPath_1) {
    return __awaiter(this, arguments, void 0, function (videoPath, outputPath, format, options) {
        var args;
        if (format === void 0) { format = 'mp3'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, assertHasAudioStream(videoPath)];
                case 1:
                    _a.sent();
                    args = __spreadArray(__spreadArray(__spreadArray([
                        '-i', videoPath,
                        '-vn',
                        '-acodec', format === 'mp3' ? 'libmp3lame' : 'pcm_s16le'
                    ], ((options === null || options === void 0 ? void 0 : options.sampleRate) ? ['-ar', String(options.sampleRate)] : []), true), ((options === null || options === void 0 ? void 0 : options.channels) ? ['-ac', String(options.channels)] : []), true), [
                        '-y',
                        outputPath,
                    ], false);
                    return [4 /*yield*/, runFFmpeg(args)];
                case 2:
                    _a.sent();
                    return [2 /*return*/, outputPath];
            }
        });
    });
}
/**
 * 截取视频帧作为封面
 */
export function sliceAudio(inputPath_1, outputPath_1, startTimeInSeconds_1, durationInSeconds_1) {
    return __awaiter(this, arguments, void 0, function (inputPath, outputPath, startTimeInSeconds, durationInSeconds, format, options) {
        var args;
        if (format === void 0) { format = 'mp3'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    args = __spreadArray(__spreadArray(__spreadArray([
                        '-i', inputPath,
                        '-ss', String(startTimeInSeconds),
                        '-t', String(durationInSeconds),
                        '-vn',
                        '-acodec', format === 'mp3' ? 'libmp3lame' : 'pcm_s16le'
                    ], ((options === null || options === void 0 ? void 0 : options.sampleRate) ? ['-ar', String(options.sampleRate)] : []), true), ((options === null || options === void 0 ? void 0 : options.channels) ? ['-ac', String(options.channels)] : []), true), [
                        '-y',
                        outputPath,
                    ], false);
                    return [4 /*yield*/, runFFmpeg(args)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, outputPath];
            }
        });
    });
}
export function captureFrame(videoPath_1, outputPath_1) {
    return __awaiter(this, arguments, void 0, function (videoPath, outputPath, timeInSeconds) {
        var args;
        if (timeInSeconds === void 0) { timeInSeconds = 1; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    args = [
                        '-i', videoPath,
                        '-ss', timeInSeconds.toString(),
                        '-vframes', '1',
                        '-y',
                        outputPath,
                    ];
                    return [4 /*yield*/, runFFmpeg(args)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, outputPath];
            }
        });
    });
}
/**
 * 获取视频时长
 */
export function getVideoDuration(videoPath) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    // 使用 ffmpeg 获取时长 (ffprobe 不在 ffmpeg-static 中)
                    var ffmpeg = spawn(ffmpegPath, [
                        '-i', videoPath,
                        '-f', 'null',
                        '-'
                    ], { stdio: ['pipe', 'pipe', 'pipe'] });
                    var stderr = '';
                    ffmpeg.stderr.on('data', function (data) {
                        stderr += data.toString();
                    });
                    ffmpeg.on('close', function () {
                        // 从 ffmpeg 输出中解析时长
                        var durationMatch = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
                        if (durationMatch) {
                            var hours = parseInt(durationMatch[1], 10);
                            var minutes = parseInt(durationMatch[2], 10);
                            var seconds = parseInt(durationMatch[3], 10);
                            var ms = parseInt(durationMatch[4], 10) / 100;
                            resolve(hours * 3600 + minutes * 60 + seconds + ms);
                        }
                        else {
                            reject(new Error('Failed to parse video duration'));
                        }
                    });
                    ffmpeg.on('error', reject);
                })];
        });
    });
}
/**
 * 生成 SRT 字幕文件
 */
export function getMediaDuration(mediaPath) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    var ffmpeg = spawn(ffmpegPath, ['-i', mediaPath, '-f', 'null', '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
                    var stderr = '';
                    ffmpeg.stderr.on('data', function (data) {
                        stderr += data.toString();
                    });
                    ffmpeg.on('close', function () {
                        var duration = parseDurationFromFfmpegStderr(stderr);
                        if (duration != null)
                            resolve(duration);
                        else
                            reject(new Error('Failed to parse media duration'));
                    });
                    ffmpeg.on('error', reject);
                })];
        });
    });
}
export function generateSrtFile(segments, outputPath) {
    var srtContent = segments.map(function (seg, index) {
        var formatTime = function (seconds) {
            var h = Math.floor(seconds / 3600);
            var m = Math.floor((seconds % 3600) / 60);
            var s = Math.floor(seconds % 60);
            var ms = Math.floor((seconds % 1) * 1000);
            return "".concat(h.toString().padStart(2, '0'), ":").concat(m.toString().padStart(2, '0'), ":").concat(s.toString().padStart(2, '0'), ",").concat(ms.toString().padStart(3, '0'));
        };
        return "".concat(index + 1, "\n").concat(formatTime(seg.startTime), " --> ").concat(formatTime(seg.endTime), "\n").concat(seg.text, "\n");
    }).join('\n');
    fs.writeFileSync(outputPath, srtContent, 'utf-8');
    return outputPath;
}
/**
 * 合并多个视频
 */
export function concatVideos(videoPaths, outputPath) {
    return __awaiter(this, void 0, void 0, function () {
        var listFile, listContent, args, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    listFile = outputPath + '.txt';
                    listContent = videoPaths.map(function (p) { return "file '".concat(p.replace(/\\/g, '/'), "'"); }).join('\n');
                    fs.writeFileSync(listFile, listContent);
                    args = [
                        '-f', 'concat',
                        '-safe', '0',
                        '-i', listFile,
                        '-c', 'copy',
                        '-y',
                        outputPath,
                    ];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, runFFmpeg(args)];
                case 2:
                    _a.sent();
                    fs.unlinkSync(listFile);
                    return [2 /*return*/, outputPath];
                case 3:
                    e_1 = _a.sent();
                    fs.unlinkSync(listFile);
                    throw e_1;
                case 4: return [2 /*return*/];
            }
        });
    });
}
