/**
 * Electron IPC 处理器
 * 连接主进程服务和渲染进程
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
import { ipcMain, app, BrowserWindow, dialog, shell, safeStorage } from 'electron';
import path from 'path';
import { downloadDouyinVideo, fetchProfileVideos, isProfileUrl } from '../src/services/douyinService';
import { generateSpeechFile, getVoiceOptions } from '../src/services/ttsService';
import { rewriteCopy, generateTitles, generateHashtags, analyzeCopyPattern } from '../src/services/hunyuanService';
import { getDefaultConfig as getDigitalHumanConfig, generateVideo as generateDigitalHumanVideo, getSavedSourceVideos, checkSystemReady, initializeSystem, saveSourceVideo } from '../src/services/digitalHumanService';
import { burnSubtitles, addBackgroundMusic, captureFrame, extractAudio, sliceAudio, getMediaDuration, generateSrtFile } from '../src/services/ffmpegService';
import { generateCover } from '../src/services/coverService';
import { runPipeline } from '../src/services/pipelineService';
import { spawn, spawnSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import FormData from 'form-data';
import { randomBytes, randomUUID } from 'crypto';
import ffmpegPath from 'ffmpeg-static';
var socialAutoUploadProc = null;
var socialAutoUploadWindow = null;
function uuidv4() {
    if (typeof randomUUID === 'function')
        return randomUUID();
    var bytes = randomBytes(16);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    var hex = bytes.toString('hex');
    return "".concat(hex.slice(0, 8), "-").concat(hex.slice(8, 12), "-").concat(hex.slice(12, 16), "-").concat(hex.slice(16, 20), "-").concat(hex.slice(20));
}
var ffmpegExecutable = ffmpegPath || 'ffmpeg';
function convertAudioToWavIfNeeded(sourcePath) {
    var ext = path.extname(sourcePath).toLowerCase();
    if (ext === '.wav')
        return sourcePath;
    var outputPath = sourcePath.replace(/\.\w+$/, '') + '_cosyvoice.wav';
    var args = [
        '-y',
        '-i', sourcePath,
        '-ar', '22050',
        '-ac', '1',
        '-f', 'wav',
        outputPath,
    ];
    var result = spawnSync(ffmpegExecutable, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status !== 0) {
        var err = (result.stderr || result.stdout || '').toString('utf8');
        throw new Error("\u97F3\u9891\u8F6C\u7801\u5931\u8D25\uFF1A".concat(err.trim()));
    }
    return outputPath;
}
function splitTextForTts(input, maxChunkChars) {
    var text = (input || '').trim();
    if (!text)
        return [];
    if (text.length <= maxChunkChars)
        return [text];
    var rawParts = text
        .replace(/\r\n/g, '\n')
        .split(/(?<=[。！？!?；;，,])|\n+/)
        .map(function (s) { return s.trim(); })
        .filter(Boolean);
    var chunks = [];
    var current = '';
    var pushCurrent = function () {
        var v = current.trim();
        if (v)
            chunks.push(v);
        current = '';
    };
    for (var _i = 0, rawParts_1 = rawParts; _i < rawParts_1.length; _i++) {
        var part = rawParts_1[_i];
        if (!part)
            continue;
        if (part.length > maxChunkChars) {
            pushCurrent();
            for (var i = 0; i < part.length; i += maxChunkChars) {
                chunks.push(part.slice(i, i + maxChunkChars));
            }
            continue;
        }
        var candidate = current ? "".concat(current, " ").concat(part) : part;
        if (candidate.length > maxChunkChars) {
            pushCurrent();
            current = part;
        }
        else {
            current = candidate;
        }
    }
    pushCurrent();
    return chunks.length ? chunks : [text];
}
function concatAudioMp3(inputs, outputPath) {
    var outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir))
        fs.mkdirSync(outputDir, { recursive: true });
    var listFile = path.join(outputDir, "ffmpeg_concat_".concat(Date.now(), ".txt"));
    var content = inputs
        .map(function (p) { return "file '".concat(p.replace(/'/g, "'\\''"), "'"); })
        .join('\n');
    fs.writeFileSync(listFile, content, 'utf8');
    var args = [
        '-y',
        '-f', 'concat',
        '-safe', '0',
        '-i', listFile,
        '-c:a', 'libmp3lame',
        '-q:a', '4',
        outputPath,
    ];
    var result = spawnSync(ffmpegExecutable, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    try {
        fs.unlinkSync(listFile);
    }
    catch ( /* ignore */_a) { /* ignore */ }
    if (result.status !== 0) {
        var err = (result.stderr || result.stdout || '').toString('utf8');
        throw new Error("\u97F3\u9891\u5408\u5E76\u5931\u8D25\uFF1A".concat(err.trim()));
    }
}
var PUBLISH_PLATFORM_TYPE = {
    // 1 小红书 2 视频号 3 抖音 4 快手
    xiaohongshu: 1,
    shipinhao: 2,
    douyin: 3,
    kuaishou: 4,
};
function getPublishCookieStorePath() {
    return path.join(app.getPath('userData'), 'publish_cookies.json');
}
function readPublishCookieStore() {
    try {
        var file = getPublishCookieStorePath();
        if (!fs.existsSync(file))
            return [];
        var raw = fs.readFileSync(file, 'utf-8');
        var parsed = JSON.parse(raw);
        if (!Array.isArray(parsed))
            return [];
        return parsed;
    }
    catch (_a) {
        return [];
    }
}
function writePublishCookieStore(entries) {
    var file = getPublishCookieStorePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(entries, null, 2), 'utf-8');
}
function encryptCookieJson(cookieJson) {
    if (safeStorage.isEncryptionAvailable()) {
        var buf = safeStorage.encryptString(cookieJson);
        return { value: buf.toString('base64'), encrypted: true };
    }
    return { value: cookieJson, encrypted: false };
}
function decryptCookieJson(entry) {
    if (entry.encrypted) {
        var buf = Buffer.from(entry.value, 'base64');
        return safeStorage.decryptString(buf);
    }
    return entry.value;
}
function getPublishLogPath() {
    return path.join(app.getPath('userData'), 'logs', 'publish.log');
}
function logPublish(message, extra) {
    try {
        var payload = __assign({ ts: new Date().toISOString(), message: message }, (extra ? { extra: extra } : {}));
        var line = JSON.stringify(__assign({}, payload), null, 0);
        // 同时输出到终端（不包含 Cookie 内容）
        try {
            // eslint-disable-next-line no-console
            console.log("[publish] ".concat(payload.ts, " ").concat(payload.message).concat(payload.extra ? " ".concat(JSON.stringify(payload.extra)) : ''));
        }
        catch (_a) {
            // ignore
        }
        var file = getPublishLogPath();
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.appendFileSync(file, line + '\n', 'utf-8');
    }
    catch (_b) {
        // ignore
    }
}
function platformDefaultCookieDomain(platform) {
    switch (platform) {
        case 'douyin':
            return '.douyin.com';
        case 'xiaohongshu':
            return '.xiaohongshu.com';
        case 'shipinhao':
            // 视频号常见域名：channels.weixin.qq.com / weixin.qq.com
            return 'channels.weixin.qq.com';
        default:
            return '';
    }
}
function parseCookieHeaderStringToCookieEditorJson(platform, rawCookieHeader) {
    var domain = platformDefaultCookieDomain(platform);
    var pairs = rawCookieHeader
        .split(';')
        .map(function (s) { return s.trim(); })
        .filter(Boolean)
        .map(function (part) {
        var eq = part.indexOf('=');
        if (eq <= 0)
            return null;
        var name = part.slice(0, eq).trim();
        var value = part.slice(eq + 1).trim();
        if (!name)
            return null;
        return { name: name, value: value };
    })
        .filter(Boolean);
    if (pairs.length === 0) {
        throw new Error('未识别到有效 Cookie（示例：a=b; c=d）。如果你导出的是 JSON，请直接粘贴 JSON。');
    }
    var cookies = pairs.map(function (_a) {
        var name = _a.name, value = _a.value;
        return ({
            domain: domain,
            name: name,
            value: value,
            path: '/',
            secure: true,
            httpOnly: false,
            sameSite: 'unspecified',
            hostOnly: !domain.startsWith('.'),
            session: true,
        });
    });
    return { json: JSON.stringify(cookies, null, 2), cookieCount: cookies.length };
}
function normalizeCookieInput(platform, input) {
    var raw = (input || '').trim();
    if (!raw)
        throw new Error('请输入 Cookie（JSON 或 Cookie 字符串）');
    try {
        var parsed = JSON.parse(raw);
        // 允许 array/object，保存为格式化后的 JSON，避免用户粘贴压缩内容难以排查
        return { normalizedJson: JSON.stringify(parsed, null, 2), format: 'json' };
    }
    catch (_a) {
        // 兼容用户粘贴 Request Headers 的 cookie 字符串：a=b; c=d
        var converted = parseCookieHeaderStringToCookieEditorJson(platform, raw);
        return { normalizedJson: converted.json, format: 'cookie-header', cookieCount: converted.cookieCount };
    }
}
function safeErrorMessage(error) {
    var msg = (error && typeof error === 'object' && 'message' in error) ? String(error.message || '') : String(error || '');
    var stack = (error && typeof error === 'object' && 'stack' in error) ? String(error.stack || '') : '';
    return (msg || stack || '未知错误').toString();
}
function getOrCreateDeviceId() {
    var filePath = path.join(app.getPath('userData'), 'device_id.txt');
    try {
        if (fs.existsSync(filePath)) {
            var id_1 = fs.readFileSync(filePath, 'utf-8').trim();
            if (id_1)
                return id_1;
        }
    }
    catch (_a) {
        // ignore
    }
    var id = uuidv4();
    try {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, id, 'utf-8');
    }
    catch (_b) {
        // ignore
    }
    return id;
}
// ========== 配置管理 (动态加载与持久化) ==========
function getServerConfigPath() {
    return path.join(app.getPath('userData'), 'server_config.json');
}
// 默认配置（如果本地文件不存在，且环境变量也未注入时的保底方案）
function getBuiltInConfig() {
    return {
        tencent: {
            secretId: process.env.TENCENT_SECRET_ID || '',
            secretKey: process.env.TENCENT_SECRET_KEY || '',
        },
        aliyun: {
            accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || '',
            accessKeySecret: process.env.ALIYUN_ACCESS_KEY_SECRET || '',
        },
        // 注意：这些 URL 会被本地存储覆盖
        digitalHuman: {
            apiUrl: process.env.CLOUD_GPU_SERVER_URL ? "".concat(process.env.CLOUD_GPU_SERVER_URL, ":").concat(process.env.CLOUD_GPU_VIDEO_PORT || 8383) : 'http://localhost:8080',
        },
        coverProvider: (process.env.COVER_PROVIDER === 'tencent' ? 'tencent' : 'aliyun'),
        // 传递其他全局变量
        extra: {
            cloudGpuServerUrl: process.env.CLOUD_GPU_SERVER_URL || '',
            cloudGpuVideoPort: process.env.CLOUD_GPU_VIDEO_PORT || '8383',
        }
    };
}
function readServerConfig() {
    try {
        var file = getServerConfigPath();
        if (!fs.existsSync(file))
            return {};
        var raw = fs.readFileSync(file, 'utf-8');
        return JSON.parse(raw);
    }
    catch (_a) {
        return {};
    }
}
function saveServerConfig(updated) {
    var file = getServerConfigPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(updated, null, 2), 'utf-8');
}
function getConfig() {
    var builtIn = getBuiltInConfig();
    var runtime = readServerConfig();
    // 合并运行时覆盖 (主要是 IP 和端口)
    var cloudGpuUrl = runtime.CLOUD_GPU_SERVER_URL || process.env.CLOUD_GPU_SERVER_URL || '';
    var cloudGpuPort = runtime.CLOUD_GPU_VIDEO_PORT || process.env.CLOUD_GPU_VIDEO_PORT || '8383';
    // 如果有设置 IP，则构造完整的 API URL
    if (cloudGpuUrl) {
        builtIn.digitalHuman.apiUrl = cloudGpuUrl.startsWith('http') ? "".concat(cloudGpuUrl, ":").concat(cloudGpuPort) : "http://".concat(cloudGpuUrl, ":").concat(cloudGpuPort);
    }
    // 注入额外的配置项供后续组件使用
    if (!builtIn.extra)
        builtIn.extra = {};
    builtIn.extra.cloudGpuServerUrl = cloudGpuUrl;
    builtIn.extra.cloudGpuVideoPort = cloudGpuPort;
    // 输出目录始终位于用户数据文件夹下
    builtIn.outputDir = path.join(app.getPath('userData'), 'output');
    return builtIn;
}
/**
 * 注册所有 IPC 处理器
 */
export function registerIpcHandlers(mainWindow) {
    var _this = this;
    var config = getConfig();
    var deviceId = getOrCreateDeviceId();
    var normalizeHttpUrl = function (raw) {
        var trimmed = (raw || '').trim().replace(/\/+$/, '');
        if (!trimmed)
            return '';
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://'))
            return trimmed;
        return "http://".concat(trimmed);
    };
    var getCloudGpuRuntime = function () {
        var _a, _b;
        var serverUrlRaw = ((_a = config.extra) === null || _a === void 0 ? void 0 : _a.cloudGpuServerUrl) || process.env.CLOUD_GPU_SERVER_URL || '';
        var portRaw = ((_b = config.extra) === null || _b === void 0 ? void 0 : _b.cloudGpuVideoPort) || process.env.CLOUD_GPU_VIDEO_PORT || '8383';
        var parsedPort = parseInt(portRaw, 10);
        var videoPort = Number.isFinite(parsedPort) ? parsedPort : 8383;
        return {
            serverUrl: normalizeHttpUrl(serverUrlRaw),
            videoPort: videoPort,
        };
    };
    // ========== 系统配置 IPC ==========
    var getAliyunVoiceRuntime = function () {
        var runtime = readServerConfig();
        var envApiKey = (process.env.ALIYUN_DASHSCOPE_API_KEY || '').trim();
        var envModel = (process.env.ALIYUN_COSYVOICE_MODEL || '').trim();
        var envFallbackModelsRaw = (process.env.ALIYUN_COSYVOICE_FALLBACK_MODELS || '').trim();
        // 如果 .env 提供了新值，优先生效，并同步到本地持久化配置，避免 UI 仍显示旧值
        var shouldSyncRuntime = false;
        if (envApiKey && envApiKey !== (runtime.ALIYUN_DASHSCOPE_API_KEY || '').trim()) {
            runtime = __assign(__assign({}, runtime), { ALIYUN_DASHSCOPE_API_KEY: envApiKey });
            shouldSyncRuntime = true;
        }
        if (envModel && envModel !== (runtime.ALIYUN_COSYVOICE_MODEL || '').trim()) {
            runtime = __assign(__assign({}, runtime), { ALIYUN_COSYVOICE_MODEL: envModel });
            shouldSyncRuntime = true;
        }
        if (envFallbackModelsRaw && envFallbackModelsRaw !== (runtime.ALIYUN_COSYVOICE_FALLBACK_MODELS || '').trim()) {
            runtime = __assign(__assign({}, runtime), { ALIYUN_COSYVOICE_FALLBACK_MODELS: envFallbackModelsRaw });
            shouldSyncRuntime = true;
        }
        if (shouldSyncRuntime) {
            try {
                saveServerConfig(runtime);
            }
            catch (_a) {
                // ignore
            }
        }
        var apiKey = (runtime.ALIYUN_DASHSCOPE_API_KEY || envApiKey || '').trim();
        var model = (runtime.ALIYUN_COSYVOICE_MODEL || envModel || 'cosyvoice-v3-flash').trim();
        // 回退模型列表（逗号分隔）
        var fallbackModelsRaw = (runtime.ALIYUN_COSYVOICE_FALLBACK_MODELS || envFallbackModelsRaw || '').trim();
        var fallbackModels = fallbackModelsRaw ? fallbackModelsRaw.split(',').map(function (m) { return m.trim(); }).filter(Boolean) : [];
        var uploadServerUrl = (runtime.VOICE_AUDIO_UPLOAD_SERVER_URL || process.env.VOICE_AUDIO_UPLOAD_SERVER_URL || '').trim();
        var uploadPortRaw = (runtime.VOICE_AUDIO_UPLOAD_PORT || process.env.VOICE_AUDIO_UPLOAD_PORT || '').trim();
        var uploadPortParsed = parseInt(uploadPortRaw, 10);
        var uploadServerPort = Number.isFinite(uploadPortParsed) ? uploadPortParsed : undefined;
        var cosBucket = (runtime.TENCENT_COS_BUCKET || process.env.TENCENT_COS_BUCKET || '').trim();
        var cosRegion = (runtime.TENCENT_COS_REGION || process.env.TENCENT_COS_REGION || '').trim();
        var cosPrefix = (runtime.TENCENT_COS_VOICE_PREFIX || process.env.TENCENT_COS_VOICE_PREFIX || '').trim();
        var cosExpiresRaw = (runtime.TENCENT_COS_SIGNED_URL_EXPIRES_SECONDS || process.env.TENCENT_COS_SIGNED_URL_EXPIRES_SECONDS || '').trim();
        var cosExpiresParsed = parseInt(cosExpiresRaw, 10);
        var cosSignedUrlExpiresSeconds = Number.isFinite(cosExpiresParsed) ? cosExpiresParsed : undefined;
        return {
            apiKey: apiKey,
            model: model,
            fallbackModels: fallbackModels,
            uploadServerUrl: uploadServerUrl,
            uploadServerPort: uploadServerPort,
            cosBucket: cosBucket,
            cosRegion: cosRegion,
            cosPrefix: cosPrefix,
            cosSignedUrlExpiresSeconds: cosSignedUrlExpiresSeconds,
        };
    };
    ipcMain.handle('config-get', function () { return __awaiter(_this, void 0, void 0, function () {
        var full, _a, apiKey, model, fallbackModels, uploadServerUrl, uploadServerPort, cosBucket, cosRegion, cosPrefix, cosSignedUrlExpiresSeconds;
        var _b, _c;
        return __generator(this, function (_d) {
            full = getConfig();
            _a = getAliyunVoiceRuntime(), apiKey = _a.apiKey, model = _a.model, fallbackModels = _a.fallbackModels, uploadServerUrl = _a.uploadServerUrl, uploadServerPort = _a.uploadServerPort, cosBucket = _a.cosBucket, cosRegion = _a.cosRegion, cosPrefix = _a.cosPrefix, cosSignedUrlExpiresSeconds = _a.cosSignedUrlExpiresSeconds;
            // 过滤掉敏感 Key，只向前端暴露可配置的 IP 和非敏感项
            return [2 /*return*/, {
                    success: true,
                    data: {
                        CLOUD_GPU_SERVER_URL: ((_b = full.extra) === null || _b === void 0 ? void 0 : _b.cloudGpuServerUrl) || '',
                        CLOUD_GPU_VIDEO_PORT: ((_c = full.extra) === null || _c === void 0 ? void 0 : _c.cloudGpuVideoPort) || '8383',
                        ALIYUN_DASHSCOPE_API_KEY: apiKey,
                        ALIYUN_COSYVOICE_MODEL: model,
                        ALIYUN_COSYVOICE_FALLBACK_MODELS: (fallbackModels || []).join(','),
                        VOICE_AUDIO_UPLOAD_SERVER_URL: uploadServerUrl,
                        VOICE_AUDIO_UPLOAD_PORT: uploadServerPort ? String(uploadServerPort) : '',
                        TENCENT_COS_BUCKET: cosBucket,
                        TENCENT_COS_REGION: cosRegion,
                        TENCENT_COS_VOICE_PREFIX: cosPrefix,
                        TENCENT_COS_SIGNED_URL_EXPIRES_SECONDS: cosSignedUrlExpiresSeconds ? String(cosSignedUrlExpiresSeconds) : '',
                        COVER_PROVIDER: full.coverProvider,
                        loadedEnvPath: process.env.VIRAL_VIDEO_AGENT_ENV_PATH_LOADED || 'Built-in'
                    }
                }];
        });
    }); });
    ipcMain.handle('config-update', function (_event, updates) { return __awaiter(_this, void 0, void 0, function () {
        var current, next;
        return __generator(this, function (_a) {
            try {
                current = readServerConfig();
                next = __assign(__assign({}, current), updates);
                saveServerConfig(next);
                // 热更新内存中的配置对象
                config = getConfig();
                return [2 /*return*/, { success: true }];
            }
            catch (error) {
                return [2 /*return*/, { success: false, error: error.message }];
            }
            return [2 /*return*/];
        });
    }); });
    // ========== 全网分发（Cookie 管理）==========
    ipcMain.handle('publish-cookie-list', function () { return __awaiter(_this, void 0, void 0, function () {
        var entries;
        return __generator(this, function (_a) {
            try {
                logPublish('publish-cookie-list:start');
                entries = readPublishCookieStore()
                    .map(function (e) { return ({ platform: e.platform, userName: e.userName, updatedAt: e.updatedAt, encrypted: e.encrypted }); })
                    .sort(function (a, b) { return b.updatedAt - a.updatedAt; });
                logPublish('publish-cookie-list:ok', { count: entries.length });
                return [2 /*return*/, { success: true, data: entries }];
            }
            catch (error) {
                logPublish('publish-cookie-list:error', { error: safeErrorMessage(error) });
                return [2 /*return*/, { success: false, error: error.message }];
            }
            return [2 /*return*/];
        });
    }); });
    ipcMain.handle('publish-cookie-save', function (_event, params) { return __awaiter(_this, void 0, void 0, function () {
        var platform_1, userName_1, cookieJson, normalized, entries, encoded, now, next, merged;
        return __generator(this, function (_a) {
            try {
                platform_1 = params === null || params === void 0 ? void 0 : params.platform;
                userName_1 = ((params === null || params === void 0 ? void 0 : params.userName) || '').trim();
                cookieJson = ((params === null || params === void 0 ? void 0 : params.cookieJson) || '').trim();
                logPublish('publish-cookie-save:start', { platform: platform_1, userName: userName_1 });
                if (!platform_1 || !(platform_1 in PUBLISH_PLATFORM_TYPE)) {
                    throw new Error('请选择平台');
                }
                if (!userName_1) {
                    throw new Error('请输入账号名称');
                }
                normalized = normalizeCookieInput(platform_1, cookieJson);
                logPublish('publish-cookie-save:normalized', { platform: platform_1, userName: userName_1, format: normalized.format, cookieCount: normalized.cookieCount });
                entries = readPublishCookieStore();
                encoded = encryptCookieJson(normalized.normalizedJson);
                now = Date.now();
                next = { platform: platform_1, userName: userName_1, value: encoded.value, encrypted: encoded.encrypted, updatedAt: now };
                merged = entries.filter(function (e) { return !(e.platform === platform_1 && e.userName === userName_1); });
                merged.unshift(next);
                writePublishCookieStore(merged);
                logPublish('publish-cookie-save:ok', { platform: platform_1, userName: userName_1, encrypted: encoded.encrypted, format: normalized.format, cookieCount: normalized.cookieCount });
                return [2 /*return*/, { success: true, data: { encrypted: encoded.encrypted, format: normalized.format, cookieCount: normalized.cookieCount } }];
            }
            catch (error) {
                logPublish('publish-cookie-save:error', { platform: params === null || params === void 0 ? void 0 : params.platform, userName: params === null || params === void 0 ? void 0 : params.userName, error: safeErrorMessage(error) });
                return [2 /*return*/, { success: false, error: error.message }];
            }
            return [2 /*return*/];
        });
    }); });
    ipcMain.handle('publish-cookie-delete', function (_event, params) { return __awaiter(_this, void 0, void 0, function () {
        var platform_2, userName_2, entries, next;
        return __generator(this, function (_a) {
            try {
                platform_2 = params === null || params === void 0 ? void 0 : params.platform;
                userName_2 = ((params === null || params === void 0 ? void 0 : params.userName) || '').trim();
                logPublish('publish-cookie-delete:start', { platform: platform_2, userName: userName_2 });
                if (!platform_2 || !(platform_2 in PUBLISH_PLATFORM_TYPE) || !userName_2) {
                    throw new Error('参数错误');
                }
                entries = readPublishCookieStore();
                next = entries.filter(function (e) { return !(e.platform === platform_2 && e.userName === userName_2); });
                writePublishCookieStore(next);
                logPublish('publish-cookie-delete:ok', { platform: platform_2, userName: userName_2 });
                return [2 /*return*/, { success: true }];
            }
            catch (error) {
                logPublish('publish-cookie-delete:error', { platform: params === null || params === void 0 ? void 0 : params.platform, userName: params === null || params === void 0 ? void 0 : params.userName, error: safeErrorMessage(error) });
                return [2 /*return*/, { success: false, error: error.message }];
            }
            return [2 /*return*/];
        });
    }); });
    // ========== 诊断接口 ==========
    ipcMain.handle('env-get-loaded-path', function () { return __awaiter(_this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, {
                    success: true,
                    data: {
                        loadedPath: process.env.VIRAL_VIDEO_AGENT_ENV_PATH_LOADED || '未加载任何 .env 文件',
                        cwd: process.cwd(),
                        execPath: process.execPath,
                        appPath: app.getAppPath()
                    }
                }];
        });
    }); });
    ipcMain.handle('cloud-voice-check-status', function () { return __awaiter(_this, void 0, void 0, function () {
        var checkStatus, _a, apiKey, model, status_1, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, import('../src/services/aliyunVoiceService')];
                case 1:
                    checkStatus = (_b.sent()).checkStatus;
                    _a = getAliyunVoiceRuntime(), apiKey = _a.apiKey, model = _a.model;
                    return [4 /*yield*/, checkStatus({ apiKey: apiKey, model: model })];
                case 2:
                    status_1 = _b.sent();
                    return [2 /*return*/, {
                            success: true,
                            data: __assign(__assign({}, status_1), { provider: 'aliyun', endpoint: 'dashscope.aliyuncs.com' })
                        }];
                case 3:
                    error_1 = _b.sent();
                    return [2 /*return*/, { success: false, error: error_1.message }];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('cloud-voice-list-models', function () { return __awaiter(_this, void 0, void 0, function () {
        var listVoices, _a, apiKey, model, voices, error_2;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, import('../src/services/aliyunVoiceService')];
                case 1:
                    listVoices = (_b.sent()).listVoices;
                    _a = getAliyunVoiceRuntime(), apiKey = _a.apiKey, model = _a.model;
                    return [4 /*yield*/, listVoices({ apiKey: apiKey, model: model })];
                case 2:
                    voices = _b.sent();
                    return [2 /*return*/, { success: true, data: voices }];
                case 3:
                    error_2 = _b.sent();
                    return [2 /*return*/, { success: false, error: error_2.message }];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('cloud-voice-train', function (_event, params) { return __awaiter(_this, void 0, void 0, function () {
        var name_1, b64, tempDir, safeName, tempAudioPath, audioPathToUpload, _a, createVoice, createVoiceFromFile, uploadVoiceSampleToCos, _b, apiKey, model, uploadServerUrl, uploadServerPort, cosBucket, cosRegion, cosPrefix, cosSignedUrlExpiresSeconds, requestedModel, effectiveModel, _c, serverUrl, videoPort, buffer, cosRes, voiceId_1, voiceId, error_3;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 7, , 8]);
                    name_1 = ((params === null || params === void 0 ? void 0 : params.name) || '').trim();
                    if (!name_1)
                        throw new Error('请填写声音名称');
                    b64 = params === null || params === void 0 ? void 0 : params.audioBufferBase64;
                    if (!b64)
                        throw new Error('音频为空');
                    tempDir = path.join(app.getPath('userData'), 'cloud_voice_data', 'temp');
                    if (!fs.existsSync(tempDir))
                        fs.mkdirSync(tempDir, { recursive: true });
                    safeName = ((params === null || params === void 0 ? void 0 : params.fileName) || "sample_".concat(Date.now(), ".wav")).replace(/[\\\\/:*?"<>|]/g, '_');
                    tempAudioPath = path.join(tempDir, safeName);
                    fs.writeFileSync(tempAudioPath, Buffer.from(b64, 'base64'));
                    audioPathToUpload = tempAudioPath;
                    try {
                        audioPathToUpload = convertAudioToWavIfNeeded(tempAudioPath);
                    }
                    catch (err) {
                        throw new Error("\u97F3\u9891\u8F6C\u7801\u5931\u8D25\uFF1A".concat((err === null || err === void 0 ? void 0 : err.message) || err));
                    }
                    return [4 /*yield*/, import('../src/services/aliyunVoiceService')];
                case 1:
                    _a = _d.sent(), createVoice = _a.createVoice, createVoiceFromFile = _a.createVoiceFromFile;
                    return [4 /*yield*/, import('../src/services/tencentCosService')];
                case 2:
                    uploadVoiceSampleToCos = (_d.sent()).uploadVoiceSampleToCos;
                    _b = getAliyunVoiceRuntime(), apiKey = _b.apiKey, model = _b.model, uploadServerUrl = _b.uploadServerUrl, uploadServerPort = _b.uploadServerPort, cosBucket = _b.cosBucket, cosRegion = _b.cosRegion, cosPrefix = _b.cosPrefix, cosSignedUrlExpiresSeconds = _b.cosSignedUrlExpiresSeconds;
                    requestedModel = ((params === null || params === void 0 ? void 0 : params.model) || '').trim();
                    effectiveModel = requestedModel || model;
                    _c = getCloudGpuRuntime(), serverUrl = _c.serverUrl, videoPort = _c.videoPort;
                    if (!(cosBucket && cosRegion)) return [3 /*break*/, 5];
                    buffer = fs.readFileSync(audioPathToUpload);
                    return [4 /*yield*/, uploadVoiceSampleToCos({
                            secretId: config.tencent.secretId,
                            secretKey: config.tencent.secretKey,
                            bucket: cosBucket,
                            region: cosRegion,
                            prefix: cosPrefix || 'voice-samples/',
                            signedUrlExpiresSeconds: cosSignedUrlExpiresSeconds !== null && cosSignedUrlExpiresSeconds !== void 0 ? cosSignedUrlExpiresSeconds : 3600,
                        }, { buffer: buffer, fileName: safeName, deviceId: deviceId })];
                case 3:
                    cosRes = _d.sent();
                    return [4 /*yield*/, createVoice({ apiKey: apiKey, model: effectiveModel }, { name: name_1, audioUrl: cosRes.signedUrl })];
                case 4:
                    voiceId_1 = (_d.sent()).voiceId;
                    return [2 /*return*/, { success: true, data: { voiceId: voiceId_1 } }];
                case 5: return [4 /*yield*/, createVoiceFromFile({
                        apiKey: apiKey,
                        model: effectiveModel,
                        audioUploadServerUrl: uploadServerUrl || serverUrl,
                        audioUploadServerPort: uploadServerPort || videoPort,
                    }, { name: name_1, audioPath: audioPathToUpload })];
                case 6:
                    voiceId = (_d.sent()).voiceId;
                    return [2 /*return*/, { success: true, data: { voiceId: voiceId } }];
                case 7:
                    error_3 = _d.sent();
                    return [2 /*return*/, { success: false, error: error_3.message }];
                case 8: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('cloud-voice-get-model', function (_event, voiceId) { return __awaiter(_this, void 0, void 0, function () {
        var getVoice, _a, apiKey, model, voice, error_4;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, import('../src/services/aliyunVoiceService')];
                case 1:
                    getVoice = (_b.sent()).getVoice;
                    _a = getAliyunVoiceRuntime(), apiKey = _a.apiKey, model = _a.model;
                    return [4 /*yield*/, getVoice({ apiKey: apiKey, model: model }, voiceId)];
                case 2:
                    voice = _b.sent();
                    return [2 /*return*/, { success: true, data: voice }];
                case 3:
                    error_4 = _b.sent();
                    return [2 /*return*/, { success: false, error: error_4.message }];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('cloud-voice-tts', function (_event, params) { return __awaiter(_this, void 0, void 0, function () {
        var text, voiceId, _a, synthesizeSpeech, getVoice, _b, apiKey, model, voice, checkErr_1, outputDir, outputPath, chunks, audioPath, partPaths, i, partOut, partPath, _i, partPaths_1, p, error_5;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 12, , 13]);
                    text = ((params === null || params === void 0 ? void 0 : params.text) || '').trim();
                    if (!text)
                        throw new Error('文本为空');
                    voiceId = ((params === null || params === void 0 ? void 0 : params.voiceId) || '').trim();
                    if (!voiceId)
                        throw new Error('voiceId 为空');
                    return [4 /*yield*/, import('../src/services/aliyunVoiceService')];
                case 1:
                    _a = _c.sent(), synthesizeSpeech = _a.synthesizeSpeech, getVoice = _a.getVoice;
                    _b = getAliyunVoiceRuntime(), apiKey = _b.apiKey, model = _b.model;
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, getVoice({ apiKey: apiKey, model: model }, voiceId)];
                case 3:
                    voice = _c.sent();
                    if (!voice) {
                        throw new Error('音色不存在或已删除，请在声音克隆里刷新列表');
                    }
                    if (voice.status !== 'ready') {
                        throw new Error("\u97F3\u8272\u4ECD\u5728\u8BAD\u7EC3\u4E2D\uFF08\u5F53\u524D\u72B6\u6001: ".concat(voice.status, "\uFF09"));
                    }
                    return [3 /*break*/, 5];
                case 4:
                    checkErr_1 = _c.sent();
                    throw new Error((checkErr_1 === null || checkErr_1 === void 0 ? void 0 : checkErr_1.message) || '音色状态检查失败，请稍后再试');
                case 5:
                    outputDir = path.join(app.getPath('userData'), 'cloud_voice_data', 'audio');
                    outputPath = path.join(outputDir, "aliyun_voice_".concat(Date.now(), ".mp3"));
                    chunks = splitTextForTts(text, 220);
                    console.log('[cloud-voice-tts] text chars:', text.length, 'chunks:', chunks.length);
                    if (!(chunks.length <= 1)) return [3 /*break*/, 7];
                    return [4 /*yield*/, synthesizeSpeech({ apiKey: apiKey, model: model }, { voiceId: voiceId, text: text, outputPath: outputPath })];
                case 6:
                    audioPath = _c.sent();
                    return [2 /*return*/, { success: true, data: { audioPath: audioPath } }];
                case 7:
                    partPaths = [];
                    i = 0;
                    _c.label = 8;
                case 8:
                    if (!(i < chunks.length)) return [3 /*break*/, 11];
                    partOut = path.join(outputDir, "aliyun_voice_part_".concat(Date.now(), "_").concat(i, ".mp3"));
                    return [4 /*yield*/, synthesizeSpeech({ apiKey: apiKey, model: model }, { voiceId: voiceId, text: chunks[i], outputPath: partOut })];
                case 9:
                    partPath = _c.sent();
                    partPaths.push(partPath);
                    _c.label = 10;
                case 10:
                    i++;
                    return [3 /*break*/, 8];
                case 11:
                    concatAudioMp3(partPaths, outputPath);
                    for (_i = 0, partPaths_1 = partPaths; _i < partPaths_1.length; _i++) {
                        p = partPaths_1[_i];
                        try {
                            fs.unlinkSync(p);
                        }
                        catch ( /* ignore */_d) { /* ignore */ }
                    }
                    return [2 /*return*/, { success: true, data: { audioPath: outputPath } }];
                case 12:
                    error_5 = _c.sent();
                    console.error('[cloud-voice-tts] failed', error_5);
                    return [2 /*return*/, { success: false, error: error_5.message }];
                case 13: return [2 /*return*/];
            }
        });
    }); });
    // ========== 抖音主页获取 ==========
    ipcMain.handle('douyin-fetch-profile-videos', function (_event_1, profileUrl_1) {
        var args_1 = [];
        for (var _i = 2; _i < arguments.length; _i++) {
            args_1[_i - 2] = arguments[_i];
        }
        return __awaiter(_this, __spreadArray([_event_1, profileUrl_1], args_1, true), void 0, function (_event, profileUrl, count) {
            var videos, error_6;
            if (count === void 0) { count = 10; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, fetchProfileVideos(profileUrl, count)];
                    case 1:
                        videos = _a.sent();
                        return [2 /*return*/, { success: true, data: videos }];
                    case 2:
                        error_6 = _a.sent();
                        return [2 /*return*/, { success: false, error: error_6.message }];
                    case 3: return [2 /*return*/];
                }
            });
        });
    });
    ipcMain.handle('douyin-check-url-type', function (_event, url) { return __awaiter(_this, void 0, void 0, function () {
        var isProfile;
        return __generator(this, function (_a) {
            try {
                isProfile = isProfileUrl(url);
                return [2 /*return*/, { success: true, data: { isProfile: isProfile } }];
            }
            catch (error) {
                return [2 /*return*/, { success: false, error: error.message }];
            }
            return [2 /*return*/];
        });
    }); });
    // ========== 视频下载 ==========
    ipcMain.handle('download-video', function (_event, url) { return __awaiter(_this, void 0, void 0, function () {
        var outputDir, result, error_7;
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
                    error_7 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_7.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('select-video-file', function () { return __awaiter(_this, void 0, void 0, function () {
        var _a, canceled, filePaths, error_8;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    if (!mainWindow) {
                        throw new Error('窗口尚未准备');
                    }
                    return [4 /*yield*/, dialog.showOpenDialog(mainWindow, {
                            title: '选择本地视频',
                            properties: ['openFile'],
                            filters: [
                                { name: '视频', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'ts'] },
                            ],
                        })];
                case 1:
                    _a = _b.sent(), canceled = _a.canceled, filePaths = _a.filePaths;
                    if (canceled || !filePaths || filePaths.length === 0) {
                        return [2 /*return*/, { success: false, canceled: true }];
                    }
                    return [2 /*return*/, { success: true, filePath: filePaths[0] }];
                case 2:
                    error_8 = _b.sent();
                    return [2 /*return*/, { success: false, error: error_8.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('select-audio-file', function () { return __awaiter(_this, void 0, void 0, function () {
        var _a, canceled, filePaths, error_9;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    if (!mainWindow) {
                        throw new Error('窗口尚未准备');
                    }
                    return [4 /*yield*/, dialog.showOpenDialog(mainWindow, {
                            title: '选择本地音频',
                            properties: ['openFile'],
                            filters: [
                                { name: '音频', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'] },
                            ],
                        })];
                case 1:
                    _a = _b.sent(), canceled = _a.canceled, filePaths = _a.filePaths;
                    if (canceled || !filePaths || filePaths.length === 0) {
                        return [2 /*return*/, { success: false, canceled: true }];
                    }
                    return [2 /*return*/, { success: true, filePath: filePaths[0] }];
                case 2:
                    error_9 = _b.sent();
                    return [2 /*return*/, { success: false, error: error_9.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('select-text-file', function () { return __awaiter(_this, void 0, void 0, function () {
        var _a, canceled, filePaths, filePath, content, error_10;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    if (!mainWindow) {
                        throw new Error('窗口尚未准备');
                    }
                    return [4 /*yield*/, dialog.showOpenDialog(mainWindow, {
                            title: '选择文案文本',
                            properties: ['openFile'],
                            filters: [
                                { name: '文本', extensions: ['txt', 'md'] },
                            ],
                        })];
                case 1:
                    _a = _b.sent(), canceled = _a.canceled, filePaths = _a.filePaths;
                    if (canceled || !filePaths || filePaths.length === 0) {
                        return [2 /*return*/, { success: false, canceled: true }];
                    }
                    filePath = filePaths[0];
                    content = fs.readFileSync(filePath, 'utf8');
                    return [2 /*return*/, { success: true, data: { filePath: filePath, content: content } }];
                case 2:
                    error_10 = _b.sent();
                    return [2 /*return*/, { success: false, error: error_10.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ========== 语音转文字 ==========
    ipcMain.handle('transcribe-audio', function (_event, videoPath) { return __awaiter(_this, void 0, void 0, function () {
        var loadedPath, audioDir, timestamp, audioPath, ffmpegError_1, duration, _a, recognizeSentence, audioBase64, text, segmentDuration, segmentCount, results, i, startTime, segmentPath, segmentBase64, segmentText, e_1, fullText, error_11, errorMsg;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 21, , 22]);
                    // 检查凭据
                    if (!config.tencent.secretId || !config.tencent.secretKey) {
                        loadedPath = process.env.VIRAL_VIDEO_AGENT_ENV_PATH_LOADED || '（未加载任何 .env 文件）';
                        throw new Error("\u672A\u68C0\u6D4B\u5230\u817E\u8BAF\u4E91\u51ED\u636E\uFF08TENCENT_SECRET_ID/KEY\uFF09\u3002\u5F53\u524D\u52A0\u8F7D\u7684\u73AF\u5883\u6587\u4EF6: ".concat(loadedPath, "\u3002\u8BF7\u786E\u4FDD\u5DF2\u5728\u5BF9\u5E94\u7684 .env \u6587\u4EF6\u4E2D\u6B63\u786E\u914D\u7F6E\u3002"));
                    }
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
                    console.log('[ASR] 正在从视频提取音频:', videoPath);
                    mainWindow.webContents.send('pipeline-progress', 10, '正在提取音频...');
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, extractAudio(videoPath, audioPath, 'mp3', { sampleRate: 16000, channels: 1 })];
                case 2:
                    _b.sent();
                    return [3 /*break*/, 4];
                case 3:
                    ffmpegError_1 = _b.sent();
                    console.error('[ASR] FFmpeg 提取音频失败:', ffmpegError_1);
                    throw new Error("\u97F3\u9891\u63D0\u53D6\u5931\u8D25 (\u53EF\u80FD\u89C6\u9891\u65E0\u58F0\u6216\u7F16\u7801\u4E0D\u652F\u6301): ".concat(ffmpegError_1.message || ffmpegError_1));
                case 4:
                    if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size < 100) {
                        throw new Error('提取出的音频文件无效（文件过小或不存在）');
                    }
                    duration = 0;
                    _b.label = 5;
                case 5:
                    _b.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, getMediaDuration(audioPath)];
                case 6:
                    duration = _b.sent();
                    return [3 /*break*/, 8];
                case 7:
                    _a = _b.sent();
                    duration = 300; // 默认假设 5 分钟
                    return [3 /*break*/, 8];
                case 8:
                    console.log('[ASR] 音频时长:', duration.toFixed(1), '秒');
                    // 检查时长限制（10分钟，放宽一点）
                    if (duration > 600) {
                        if (fs.existsSync(audioPath))
                            fs.unlinkSync(audioPath);
                        throw new Error('视频时长超过 10 分钟，请使用较短的视频');
                    }
                    mainWindow.webContents.send('pipeline-progress', 20, '正在识别语音...');
                    return [4 /*yield*/, import('../src/services/asrService')
                        // 如果音频短于 50 秒，直接识别
                    ];
                case 9:
                    recognizeSentence = (_b.sent()).recognizeSentence;
                    if (!(duration <= 50)) return [3 /*break*/, 11];
                    console.log('[ASR] 使用一句话识别模式（短音频）');
                    audioBase64 = fs.readFileSync(audioPath).toString('base64');
                    return [4 /*yield*/, recognizeSentence(config.tencent, audioBase64)];
                case 10:
                    text = _b.sent();
                    if (fs.existsSync(audioPath))
                        fs.unlinkSync(audioPath);
                    if (!text)
                        console.warn('[ASR] 识别结果为空');
                    return [2 /*return*/, { success: true, data: text || '（未识别到文字）' }];
                case 11:
                    // 长音频：分段处理
                    console.log('[ASR] 使用分段识别模式（长音频）');
                    segmentDuration = 50 // 每段 50 秒
                    ;
                    segmentCount = Math.ceil(duration / segmentDuration);
                    results = [];
                    i = 0;
                    _b.label = 12;
                case 12:
                    if (!(i < segmentCount)) return [3 /*break*/, 20];
                    startTime = i * segmentDuration;
                    segmentPath = path.join(audioDir, "segment_".concat(timestamp, "_").concat(i, ".mp3"));
                    mainWindow.webContents.send('pipeline-progress', 20 + (i / segmentCount) * 70, "\u8BC6\u522B\u4E2D... (".concat(i + 1, "/").concat(segmentCount, ")"));
                    _b.label = 13;
                case 13:
                    _b.trys.push([13, 17, 18, 19]);
                    return [4 /*yield*/, sliceAudio(audioPath, segmentPath, startTime, segmentDuration, 'mp3', { sampleRate: 16000, channels: 1 })];
                case 14:
                    _b.sent();
                    if (!fs.existsSync(segmentPath)) return [3 /*break*/, 16];
                    segmentBase64 = fs.readFileSync(segmentPath).toString('base64');
                    return [4 /*yield*/, recognizeSentence(config.tencent, segmentBase64)];
                case 15:
                    segmentText = _b.sent();
                    if (segmentText)
                        results.push(segmentText);
                    console.log("[ASR] \u5206\u6BB5 ".concat(i + 1, " \u8BC6\u522B\u5B8C\u6210:"), segmentText.slice(0, 20) + '...');
                    _b.label = 16;
                case 16: return [3 /*break*/, 19];
                case 17:
                    e_1 = _b.sent();
                    console.error("[ASR] \u5206\u6BB5 ".concat(i + 1, " \u5904\u7406\u5931\u8D25:"), e_1.message || e_1);
                    return [3 /*break*/, 19];
                case 18:
                    // 删除分段文件
                    if (fs.existsSync(segmentPath)) {
                        fs.unlinkSync(segmentPath);
                    }
                    return [7 /*endfinally*/];
                case 19:
                    i++;
                    return [3 /*break*/, 12];
                case 20:
                    // 清理原始音频
                    if (fs.existsSync(audioPath)) {
                        fs.unlinkSync(audioPath);
                    }
                    fullText = results.join(' ');
                    console.log('[ASR] 转录完成，总长度:', fullText.length);
                    mainWindow.webContents.send('pipeline-progress', 100, '识别完成');
                    return [2 /*return*/, { success: true, data: fullText || '（未从长音频中识别到有效文字）' }];
                case 21:
                    error_11 = _b.sent();
                    console.error('[ASR] 全局错误:', error_11);
                    errorMsg = error_11.message || String(error_11);
                    return [2 /*return*/, { success: false, error: errorMsg }];
                case 22: return [2 /*return*/];
            }
        });
    }); });
    // ========== TTS 语音合成 ==========
    ipcMain.handle('generate-speech', function (_event, text, voiceType) { return __awaiter(_this, void 0, void 0, function () {
        var outputDir, audioPath, error_12;
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
                    error_12 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_12.message }];
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
        var result, error_13;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, rewriteCopy(config.tencent, text, mode, instruction)];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, { success: true, data: result }];
                case 2:
                    error_13 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_13.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ========== 文案模式分析 ==========
    ipcMain.handle('analyze-copy-pattern', function (_event, copies) { return __awaiter(_this, void 0, void 0, function () {
        var result, error_14;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, analyzeCopyPattern(config.tencent, copies)];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, { success: true, data: result }];
                case 2:
                    error_14 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_14.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ========== 标题和话题生成 ==========
    ipcMain.handle('generate-title', function (_event, content) { return __awaiter(_this, void 0, void 0, function () {
        var titles, hashtags, error_15;
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
                    error_15 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_15.message }];
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
        var result, error_16;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, generateDigitalHumanVideo(digitalHumanConfig, {
                            sourceVideoPath: params.sourceVideoPath,
                            audioPath: params.audioPath,
                            text: params.text,
                            qualityPreset: params.qualityPreset,
                        }, function (progress) {
                            mainWindow.webContents.send('digital-human-progress', progress);
                        })];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, { success: true, data: result }];
                case 2:
                    error_16 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_16.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // 检查系统状态 (新增)
    ipcMain.handle('digital-human-check-system', function (_event, params) { return __awaiter(_this, void 0, void 0, function () {
        var status_2, error_17;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, checkSystemReady(digitalHumanConfig, { qualityPreset: params === null || params === void 0 ? void 0 : params.qualityPreset })];
                case 1:
                    status_2 = _a.sent();
                    return [2 /*return*/, { success: true, data: status_2 }];
                case 2:
                    error_17 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_17.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // 初始化系统
    ipcMain.handle('digital-human-initialize', function (_event, params) { return __awaiter(_this, void 0, void 0, function () {
        var error_18;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, initializeSystem(digitalHumanConfig, function (progress) {
                            mainWindow.webContents.send('digital-human-progress', progress);
                        }, { qualityPreset: params === null || params === void 0 ? void 0 : params.qualityPreset })];
                case 1:
                    _a.sent();
                    return [2 /*return*/, { success: true }];
                case 2:
                    error_18 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_18.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // 保存源视频
    ipcMain.handle('digital-human-save-source', function (_event, params) { return __awaiter(_this, void 0, void 0, function () {
        var buffer, path_1, error_19;
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
                    error_19 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_19.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ========== 封面生成 ==========
    ipcMain.handle('generate-cover', function (_event, prompt) { return __awaiter(_this, void 0, void 0, function () {
        var outputDir, coverRequest, covers, isFallbackTextCover, error_20;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    outputDir = path.join(config.outputDir, 'covers');
                    coverRequest = {
                        provider: config.coverProvider,
                        aliyun: config.aliyun,
                        tencent: {
                            secretId: config.tencent.secretId,
                            secretKey: config.tencent.secretKey,
                            region: process.env.COVER_TENCENT_REGION,
                        },
                    };
                    return [4 /*yield*/, generateCover(coverRequest, prompt, outputDir)];
                case 1:
                    covers = _a.sent();
                    isFallbackTextCover = covers.length === 1 && /cover_\d+_0\.png$/i.test(covers[0]);
                    console.log('[Cover] prompt:', prompt, 'result:', covers);
                    return [2 /*return*/, {
                            success: true,
                            data: {
                                coverPaths: covers,
                                provider: config.coverProvider,
                                source: config.coverProvider === 'tencent'
                                    ? (isFallbackTextCover ? 'tencent-fallback-ffmpeg' : 'tencent-aiart')
                                    : 'aliyun-wanxiang',
                            },
                        }];
                case 2:
                    error_20 = _a.sent();
                    console.error('[Cover] failed:', error_20);
                    return [2 /*return*/, { success: false, error: error_20.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ========== 全自动流水线 ==========
    ipcMain.handle('run-pipeline', function (_event, params) { return __awaiter(_this, void 0, void 0, function () {
        var pipelineConfig, result, error_21;
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
                    error_21 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_21.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('capture-frame', function (_event, videoPath, time) { return __awaiter(_this, void 0, void 0, function () {
        var outputDir, coverPath, error_22;
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
                    error_22 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_22.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    var pad = function (value, length) {
        if (length === void 0) { length = 2; }
        return value.toString().padStart(length, '0');
    };
    var formatTimestamp = function (seconds) {
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        var s = Math.floor(seconds % 60);
        var ms = Math.floor((seconds % 1) * 1000);
        return "".concat(pad(h), ":").concat(pad(m), ":").concat(pad(s), ",").concat(pad(ms, 3));
    };
    // ========== 字幕文件生成 ==========
    ipcMain.handle('generate-subtitle-file', function (_event, params) { return __awaiter(_this, void 0, void 0, function () {
        var subtitlesDir, subtitlePath, srtPath, raw, defaultLine, lines, durationPerLine_1, fallbackSegments, srtContent;
        return __generator(this, function (_a) {
            try {
                subtitlesDir = path.join(config.outputDir, 'subtitles');
                if (!fs.existsSync(subtitlesDir)) {
                    fs.mkdirSync(subtitlesDir, { recursive: true });
                }
                subtitlePath = path.join(subtitlesDir, "subtitle_".concat(Date.now(), ".srt"));
                if ((params === null || params === void 0 ? void 0 : params.segments) && params.segments.length > 0) {
                    srtPath = generateSrtFile(params.segments, subtitlePath);
                    return [2 /*return*/, { success: true, data: { subtitlePath: srtPath } }];
                }
                raw = ((params === null || params === void 0 ? void 0 : params.text) || '').trim();
                defaultLine = '这是自动生成的字幕';
                lines = raw
                    ? raw.split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean)
                    : [];
                if (lines.length === 0) {
                    lines.push(defaultLine);
                }
                durationPerLine_1 = 4;
                fallbackSegments = lines.map(function (line, index) { return ({
                    startTime: index * durationPerLine_1,
                    endTime: (index + 1) * durationPerLine_1,
                    text: line,
                }); });
                srtContent = fallbackSegments.map(function (seg, idx) { return ("".concat(idx + 1, "\n").concat(formatTimestamp(seg.startTime), " --> ").concat(formatTimestamp(seg.endTime), "\n").concat(seg.text, "\n")); }).join('\n');
                fs.writeFileSync(subtitlePath, srtContent, 'utf-8');
                return [2 /*return*/, { success: true, data: { subtitlePath: subtitlePath } }];
            }
            catch (error) {
                return [2 /*return*/, { success: false, error: error.message }];
            }
            return [2 /*return*/];
        });
    }); });
    ipcMain.handle('get-video-duration', function (_event, videoPath) { return __awaiter(_this, void 0, void 0, function () {
        var duration, error_23;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    if (!videoPath)
                        throw new Error('videoPath 为空');
                    return [4 /*yield*/, getMediaDuration(videoPath)];
                case 1:
                    duration = _a.sent();
                    return [2 /*return*/, { success: true, data: duration }];
                case 2:
                    error_23 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_23.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ========== 视频处理 ==========
    ipcMain.handle('add-subtitles', function (_event, videoPath, subtitlePath) { return __awaiter(_this, void 0, void 0, function () {
        var outputDir, outputPath, error_24;
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
                    error_24 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_24.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('add-bgm', function (_event, videoPath, bgmPath, volume) { return __awaiter(_this, void 0, void 0, function () {
        var outputDir, outputPath, error_25;
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
                    error_25 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_25.message }];
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
    // ========== 保存文件到桌面（用于“下载”体验）==========
    ipcMain.handle('save-to-desktop', function (_event, params) { return __awaiter(_this, void 0, void 0, function () {
        var fs_1, sourcePath, desktopDir, baseName, parsed, ext, name_2, destPath, error_26;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, import('fs')];
                case 1:
                    fs_1 = _a.sent();
                    sourcePath = params === null || params === void 0 ? void 0 : params.sourcePath;
                    if (!sourcePath) {
                        throw new Error('sourcePath 为空');
                    }
                    if (!fs_1.existsSync(sourcePath)) {
                        throw new Error('文件不存在: ' + sourcePath);
                    }
                    desktopDir = app.getPath('desktop');
                    baseName = ((params === null || params === void 0 ? void 0 : params.fileName) || path.basename(sourcePath) || "video_".concat(Date.now(), ".mp4")).trim();
                    parsed = path.parse(baseName);
                    ext = parsed.ext || path.extname(sourcePath) || '.mp4';
                    name_2 = parsed.name || 'video';
                    destPath = path.join(desktopDir, "".concat(name_2).concat(ext));
                    if (fs_1.existsSync(destPath)) {
                        destPath = path.join(desktopDir, "".concat(name_2, "_").concat(Date.now()).concat(ext));
                    }
                    fs_1.copyFileSync(sourcePath, destPath);
                    try {
                        shell.showItemInFolder(destPath);
                    }
                    catch (_b) {
                        // ignore
                    }
                    return [2 /*return*/, { success: true, data: { destPath: destPath } }];
                case 2:
                    error_26 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_26.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // ========== 保存文件到“社区作品库”（用于直播展示）==========
    ipcMain.handle('save-to-community', function (_event, params) { return __awaiter(_this, void 0, void 0, function () {
        var fs_2, sourcePath, communityDir, rawTitle, safeTitle, baseName, ext, destPath, error_27;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, import('fs')];
                case 1:
                    fs_2 = _a.sent();
                    sourcePath = String(((params === null || params === void 0 ? void 0 : params.sourcePath) || '')).trim();
                    if (!sourcePath) {
                        throw new Error('sourcePath 为空');
                    }
                    if (!fs_2.existsSync(sourcePath)) {
                        throw new Error('文件不存在: ' + sourcePath);
                    }
                    communityDir = path.join(config.outputDir, 'community');
                    if (!fs_2.existsSync(communityDir))
                        fs_2.mkdirSync(communityDir, { recursive: true });
                    rawTitle = String(((params === null || params === void 0 ? void 0 : params.title) || '')).trim();
                    safeTitle = rawTitle
                        .replace(/[\\\\/:*?"<>|]+/g, '_')
                        .replace(/\\s+/g, ' ')
                        .trim()
                        .slice(0, 60);
                    baseName = safeTitle || 'digital_human';
                    ext = path.extname(sourcePath) || '.mp4';
                    destPath = path.join(communityDir, "".concat(baseName).concat(ext));
                    if (fs_2.existsSync(destPath)) {
                        destPath = path.join(communityDir, "".concat(baseName, "_").concat(Date.now()).concat(ext));
                    }
                    fs_2.copyFileSync(sourcePath, destPath);
                    return [2 /*return*/, { success: true, data: { destPath: destPath } }];
                case 2:
                    error_27 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_27.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    var ensureSocialAutoUploadRunning = function () { return __awaiter(_this, void 0, void 0, function () {
        var defaultRepoUrls, repoUrls, repoUrlsToTry, allowGitee, before, removed, installDir, venvDir, venvPython, backendPy, confPy, confExamplePy, dbFile, run, getPipMirrorArgs, waitForHttp, bundledDir, bundledMarker, dbDir, createTablePy, e_2, msg, depsMarker, pipMirror;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    defaultRepoUrls = [
                        // 官方源
                        'https://github.com/dreammis/social-auto-upload',
                        // 国内常见 GitHub 加速（可用性依网络而定）
                        'https://ghproxy.com/https://github.com/dreammis/social-auto-upload',
                        'https://mirror.ghproxy.com/https://github.com/dreammis/social-auto-upload',
                        'https://hub.njuu.cf/dreammis/social-auto-upload',
                    ];
                    repoUrls = (process.env.SOCIAL_AUTO_UPLOAD_REPO_URLS || '')
                        .split(/[;,\s]+/g)
                        .map(function (s) { return s.trim(); })
                        .filter(Boolean);
                    repoUrlsToTry = repoUrls.length > 0 ? repoUrls : defaultRepoUrls;
                    allowGitee = (process.env.SOCIAL_AUTO_UPLOAD_ALLOW_GITEE || '').trim() === '1';
                    if (!allowGitee) {
                        before = repoUrlsToTry.length;
                        repoUrlsToTry = repoUrlsToTry.filter(function (u) { return !/^https?:\/\/gitee\.com\//i.test(u); });
                        removed = before - repoUrlsToTry.length;
                        if (removed > 0)
                            logPublish('social-auto-upload:repoUrls:skip-gitee', { removed: removed });
                    }
                    installDir = path.join(app.getPath('userData'), 'social-auto-upload');
                    venvDir = path.join(installDir, '.venv');
                    venvPython = process.platform === 'win32'
                        ? path.join(venvDir, 'Scripts', 'python.exe')
                        : path.join(venvDir, 'bin', 'python');
                    backendPy = path.join(installDir, 'sau_backend.py');
                    confPy = path.join(installDir, 'conf.py');
                    confExamplePy = path.join(installDir, 'conf.example.py');
                    dbFile = path.join(installDir, 'db', 'database.db');
                    run = function (command, args, cwd) { return new Promise(function (resolve, reject) {
                        var _a;
                        var child = spawn(command, args, {
                            cwd: cwd,
                            stdio: 'pipe',
                            env: __assign(__assign({}, process.env), { 
                                // 避免弹出 Git Credential Manager / 交互式认证窗口（客户体验灾难）
                                // 失败应当直接返回错误提示，由应用引导用户配置镜像或离线包。
                                GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never', GIT_ASKPASS: 'echo', 
                                // Windows 默认控制台编码可能是 GBK，会导致 social-auto-upload 的 createTable.py 打印 emoji 时报错
                                PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }),
                        });
                        var stderr = '';
                        (_a = child.stderr) === null || _a === void 0 ? void 0 : _a.on('data', function (d) { return stderr += d.toString(); });
                        child.on('error', function (err) {
                            if ((err === null || err === void 0 ? void 0 : err.code) === 'ENOENT') {
                                if (command === 'git') {
                                    reject(new Error('未检测到 Git：请先安装 Git 并加入 PATH，然后重试'));
                                    return;
                                }
                                if (command === 'python' || command === 'python3' || command === 'py' || command.endsWith('python.exe')) {
                                    reject(new Error('未检测到 Python：请先安装 Python 3 并勾选 “Add to PATH”，然后重试'));
                                    return;
                                }
                            }
                            reject(err);
                        });
                        child.on('close', function (code) {
                            if (code === 0)
                                resolve();
                            else
                                reject(new Error("".concat(command, " ").concat(args.join(' '), " failed (code ").concat(code, ")").concat(stderr ? ": ".concat(stderr.slice(0, 500)) : '')));
                        });
                    }); };
                    getPipMirrorArgs = function () {
                        var indexUrl = (process.env.SOCIAL_AUTO_UPLOAD_PIP_INDEX_URL || 'https://mirrors.aliyun.com/pypi/simple/').trim();
                        if (!indexUrl)
                            return { indexUrl: '', args: [] };
                        var host = '';
                        try {
                            host = new URL(indexUrl).host;
                        }
                        catch (_a) {
                            host = '';
                        }
                        var trustedHosts = (process.env.SOCIAL_AUTO_UPLOAD_PIP_TRUSTED_HOSTS || host).trim();
                        var trustedArgs = trustedHosts
                            ? trustedHosts
                                .split(/[;,\s]+/g)
                                .map(function (s) { return s.trim(); })
                                .filter(Boolean)
                                .flatMap(function (h) { return ['--trusted-host', h]; })
                            : [];
                        return {
                            indexUrl: indexUrl,
                            args: __spreadArray(['-i', indexUrl], trustedArgs, true),
                        };
                    };
                    waitForHttp = function (url, timeoutMs) {
                        if (timeoutMs === void 0) { timeoutMs = 30000; }
                        return new Promise(function (resolve, reject) {
                            var started = Date.now();
                            var tick = function () {
                                var req = http.get(url, function (res) {
                                    res.resume();
                                    if ((res.statusCode || 0) >= 200 && (res.statusCode || 0) < 500) {
                                        resolve();
                                        return;
                                    }
                                    if (Date.now() - started > timeoutMs)
                                        reject(new Error('分发服务启动超时'));
                                    else
                                        setTimeout(tick, 500);
                                });
                                req.on('error', function () {
                                    if (Date.now() - started > timeoutMs)
                                        reject(new Error('分发服务启动超时'));
                                    else
                                        setTimeout(tick, 500);
                                });
                            };
                            tick();
                        });
                    };
                    if (!fs.existsSync(backendPy)) {
                        fs.mkdirSync(path.dirname(installDir), { recursive: true });
                        bundledDir = path.join(app.getAppPath(), 'python', 'social-auto-upload');
                        bundledMarker = path.join(bundledDir, 'requirements.txt');
                        if (fs.existsSync(bundledMarker)) {
                            logPublish('social-auto-upload:copy-bundled', { from: bundledDir, to: installDir });
                            fs.cpSync(bundledDir, installDir, { recursive: true });
                        }
                        else {
                            throw new Error("\u5206\u53D1\u4E2D\u5FC3\u7EC4\u4EF6\u672A\u627E\u5230\u3002\n" +
                                "\u8BF7\u786E\u8BA4\u9879\u76EE\u5305\u542B python/social-auto-upload \u76EE\u5F55\u3002\n" +
                                "\u67E5\u627E\u8DEF\u5F84: ".concat(bundledDir));
                        }
                    }
                    if (!fs.existsSync(confPy) && fs.existsSync(confExamplePy)) {
                        fs.copyFileSync(confExamplePy, confPy);
                    }
                    if (!!fs.existsSync(dbFile)) return [3 /*break*/, 7];
                    dbDir = path.join(installDir, 'db');
                    fs.mkdirSync(dbDir, { recursive: true });
                    createTablePy = path.join(dbDir, 'createTable.py');
                    if (!fs.existsSync(createTablePy)) return [3 /*break*/, 7];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 7]);
                    return [4 /*yield*/, run(process.env.PYTHON || 'python', [createTablePy], dbDir)];
                case 2:
                    _a.sent();
                    return [3 /*break*/, 7];
                case 3:
                    e_2 = _a.sent();
                    msg = safeErrorMessage(e_2);
                    if (!(msg.includes('UnicodeEncodeError') || msg.includes('gbk'))) return [3 /*break*/, 5];
                    logPublish('social-auto-upload:createTable:retry-utf8', { reason: 'UnicodeEncodeError/gbk' });
                    return [4 /*yield*/, run(process.env.PYTHON || 'python', ['-X', 'utf8', createTablePy], dbDir)];
                case 4:
                    _a.sent();
                    return [3 /*break*/, 6];
                case 5: throw e_2;
                case 6: return [3 /*break*/, 7];
                case 7:
                    depsMarker = path.join(venvDir, '.deps_installed');
                    if (!!fs.existsSync(depsMarker)) return [3 /*break*/, 12];
                    if (!!fs.existsSync(venvPython)) return [3 /*break*/, 9];
                    return [4 /*yield*/, run(process.env.PYTHON || 'python', ['-m', 'venv', venvDir], installDir)];
                case 8:
                    _a.sent();
                    _a.label = 9;
                case 9:
                    pipMirror = getPipMirrorArgs();
                    logPublish('social-auto-upload:pip:mirror', { indexUrl: pipMirror.indexUrl });
                    return [4 /*yield*/, run(venvPython, __spreadArray(['-m', 'pip', 'install', '--upgrade', 'pip'], pipMirror.args, true), installDir)];
                case 10:
                    _a.sent();
                    return [4 /*yield*/, run(venvPython, __spreadArray(['-m', 'pip', 'install', '-r', path.join(installDir, 'requirements.txt')], pipMirror.args, true), installDir)];
                case 11:
                    _a.sent();
                    fs.writeFileSync(depsMarker, new Date().toISOString());
                    _a.label = 12;
                case 12:
                    if (!socialAutoUploadProc || socialAutoUploadProc.killed) {
                        socialAutoUploadProc = spawn(venvPython, [backendPy], {
                            cwd: installDir,
                            stdio: 'ignore',
                            windowsHide: true,
                            env: __assign(__assign({}, process.env), { PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }),
                        });
                        socialAutoUploadProc.on('exit', function () {
                            socialAutoUploadProc = null;
                        });
                    }
                    return [4 /*yield*/, waitForHttp('http://127.0.0.1:5409/')];
                case 13:
                    _a.sent();
                    return [2 /*return*/, { installDir: installDir, venvPython: venvPython, dbFile: dbFile }];
            }
        });
    }); };
    var runCapture = function (command, args, cwd) { return new Promise(function (resolve, reject) {
        var _a, _b;
        var child = spawn(command, args, {
            cwd: cwd,
            stdio: 'pipe',
            env: __assign(__assign({}, process.env), { PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }),
        });
        var stderr = '';
        var stdout = '';
        (_a = child.stdout) === null || _a === void 0 ? void 0 : _a.on('data', function (d) { return stdout += d.toString(); });
        (_b = child.stderr) === null || _b === void 0 ? void 0 : _b.on('data', function (d) { return stderr += d.toString(); });
        child.on('error', reject);
        child.on('close', function (code) {
            if (code === 0)
                resolve({ stdout: stdout, stderr: stderr });
            else
                reject(new Error("".concat(command, " ").concat(args.join(' '), " failed (code ").concat(code, ")").concat(stderr ? ": ".concat(stderr.slice(0, 500)) : '')));
        });
    }); };
    var upsertSocialAutoUploadAccount = function (meta, params) { return __awaiter(_this, void 0, void 0, function () {
        var type, py, stdout, parsed;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    type = PUBLISH_PLATFORM_TYPE[params.platform];
                    py = "\nimport sqlite3, json, re\nfrom pathlib import Path\ndb = Path(".concat(JSON.stringify(meta.dbFile), ")\ndb.parent.mkdir(parents=True, exist_ok=True)\nconn = sqlite3.connect(str(db))\ncur = conn.cursor()\ncur.execute(\"\"\"\nCREATE TABLE IF NOT EXISTS user_info (\n    id INTEGER PRIMARY KEY AUTOINCREMENT,\n    type INTEGER NOT NULL,\n    filePath TEXT NOT NULL,\n    userName TEXT NOT NULL,\n    status INTEGER DEFAULT 0\n)\n\"\"\")\nplatform = ").concat(JSON.stringify(params.platform), "\ntype_ = int(").concat(JSON.stringify(type), ")\nuserName = ").concat(JSON.stringify(params.userName), "\ncur.execute(\"SELECT id, filePath FROM user_info WHERE type = ? AND userName = ? LIMIT 1\", (type_, userName))\nrow = cur.fetchone()\ndef safe_name(s: str) -> str:\n    s = re.sub(r\"[\\\\/:*?\\\"<>|\\s]+\", \"_\", s.strip())\n    return s[:40] if s else \"account\"\nif row:\n    id_, filePath = int(row[0]), row[1]\n    if not filePath:\n        filePath = f\"{platform}/{safe_name(userName)}_{id_}.json\"\n        cur.execute(\"UPDATE user_info SET filePath = ?, status = 1 WHERE id = ?\", (filePath, id_))\nelse:\n    cur.execute(\"INSERT INTO user_info(type, filePath, userName, status) VALUES(?, ?, ?, ?)\", (type_, \"\", userName, 1))\n    id_ = int(cur.lastrowid)\n    filePath = f\"{platform}/{safe_name(userName)}_{id_}.json\"\n    cur.execute(\"UPDATE user_info SET filePath = ?, status = 1 WHERE id = ?\", (filePath, id_))\nconn.commit()\nconn.close()\nprint(json.dumps({\"id\": id_, \"filePath\": filePath}, ensure_ascii=False))\n").trim();
                    return [4 /*yield*/, runCapture(meta.venvPython, ['-c', py], meta.installDir)];
                case 1:
                    stdout = (_a.sent()).stdout;
                    parsed = JSON.parse(stdout.trim());
                    if (!(parsed === null || parsed === void 0 ? void 0 : parsed.filePath))
                        throw new Error('写入分发账号失败：未返回 filePath');
                    return [2 /*return*/, parsed];
            }
        });
    }); };
    var writeSocialAutoUploadCookieFile = function (meta, filePath, cookieJson) {
        var cookieAbs = path.join(meta.installDir, 'cookiesFile', filePath);
        fs.mkdirSync(path.dirname(cookieAbs), { recursive: true });
        fs.writeFileSync(cookieAbs, cookieJson, 'utf-8');
        return cookieAbs;
    };
    var syncSavedPublishCookiesToSocialAutoUpload = function (meta) { return __awaiter(_this, void 0, void 0, function () {
        var entries, applied, _i, entries_1, entry, cookieJson, account, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    entries = readPublishCookieStore();
                    applied = 0;
                    _i = 0, entries_1 = entries;
                    _b.label = 1;
                case 1:
                    if (!(_i < entries_1.length)) return [3 /*break*/, 6];
                    entry = entries_1[_i];
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, 4, , 5]);
                    cookieJson = decryptCookieJson(entry);
                    return [4 /*yield*/, upsertSocialAutoUploadAccount(meta, { platform: entry.platform, userName: entry.userName })];
                case 3:
                    account = _b.sent();
                    writeSocialAutoUploadCookieFile(meta, account.filePath, cookieJson);
                    applied += 1;
                    return [3 /*break*/, 5];
                case 4:
                    _a = _b.sent();
                    return [3 /*break*/, 5];
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6: return [2 /*return*/, applied];
            }
        });
    }); };
    var uploadToSocialAutoUpload = function (filePath, filenameBase) { return __awaiter(_this, void 0, void 0, function () {
        var stat, form;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    stat = fs.statSync(filePath);
                    if (!stat.isFile())
                        throw new Error('不是有效文件: ' + filePath);
                    form = new FormData();
                    form.append('file', fs.createReadStream(filePath));
                    if (filenameBase)
                        form.append('filename', filenameBase);
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            var req = http.request('http://127.0.0.1:5409/uploadSave', {
                                method: 'POST',
                                headers: form.getHeaders(),
                            }, function (res) {
                                var data = '';
                                res.on('data', function (c) { return data += c.toString(); });
                                res.on('end', function () {
                                    if ((res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300)
                                        resolve();
                                    else
                                        reject(new Error("\u4E0A\u4F20\u5230\u5206\u53D1\u4E2D\u5FC3\u5931\u8D25 (HTTP ".concat(res.statusCode, ") ").concat(data.slice(0, 200))));
                                });
                            });
                            req.on('error', reject);
                            form.pipe(req);
                        })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    }); };
    ipcMain.handle('social-auto-upload-open', function (_event, params) { return __awaiter(_this, void 0, void 0, function () {
        var meta, base, error_27;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 8, , 9]);
                    return [4 /*yield*/, ensureSocialAutoUploadRunning()];
                case 1:
                    meta = _a.sent();
                    return [4 /*yield*/, syncSavedPublishCookiesToSocialAutoUpload(meta)];
                case 2:
                    _a.sent();
                    if (!((params === null || params === void 0 ? void 0 : params.videoPath) && fs.existsSync(params.videoPath))) return [3 /*break*/, 4];
                    base = params.title ? params.title.replace(/[\\\\/:*?"<>|]/g, '').slice(0, 50) : undefined;
                    return [4 /*yield*/, uploadToSocialAutoUpload(params.videoPath, base)];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4:
                    if (!(socialAutoUploadWindow && !socialAutoUploadWindow.isDestroyed())) return [3 /*break*/, 5];
                    socialAutoUploadWindow.focus();
                    return [3 /*break*/, 7];
                case 5:
                    socialAutoUploadWindow = new BrowserWindow({
                        width: 1200,
                        height: 850,
                        title: '全网分发中心',
                        webPreferences: {
                            nodeIntegration: false,
                            contextIsolation: true,
                            webSecurity: false,
                        },
                    });
                    socialAutoUploadWindow.on('closed', function () { socialAutoUploadWindow = null; });
                    return [4 /*yield*/, socialAutoUploadWindow.loadURL('http://127.0.0.1:5409/')];
                case 6:
                    _a.sent();
                    _a.label = 7;
                case 7: return [2 /*return*/, { success: true }];
                case 8:
                    error_27 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_27.message }];
                case 9: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('publish-cookie-apply', function (_event, params) { return __awaiter(_this, void 0, void 0, function () {
        var platform_3, userName_3, entry, meta, cookieJson, account, fileAbs, error_28;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    platform_3 = params === null || params === void 0 ? void 0 : params.platform;
                    userName_3 = ((params === null || params === void 0 ? void 0 : params.userName) || '').trim();
                    logPublish('publish-cookie-apply:start', { platform: platform_3, userName: userName_3 });
                    if (!platform_3 || !(platform_3 in PUBLISH_PLATFORM_TYPE) || !userName_3) {
                        throw new Error('参数错误');
                    }
                    entry = readPublishCookieStore().find(function (e) { return e.platform === platform_3 && e.userName === userName_3; });
                    if (!entry)
                        throw new Error('未找到该账号的 Cookie，请先保存');
                    return [4 /*yield*/, ensureSocialAutoUploadRunning()];
                case 1:
                    meta = _a.sent();
                    logPublish('publish-cookie-apply:ensureSocialAutoUploadRunning:ok', { platform: platform_3, userName: userName_3, installDir: meta.installDir });
                    cookieJson = decryptCookieJson(entry);
                    return [4 /*yield*/, upsertSocialAutoUploadAccount(meta, { platform: platform_3, userName: userName_3 })];
                case 2:
                    account = _a.sent();
                    fileAbs = writeSocialAutoUploadCookieFile(meta, account.filePath, cookieJson);
                    logPublish('publish-cookie-apply:ok', { platform: platform_3, userName: userName_3, filePath: account.filePath });
                    return [2 /*return*/, { success: true, data: { filePath: account.filePath, fileAbs: fileAbs } }];
                case 3:
                    error_28 = _a.sent();
                    logPublish('publish-cookie-apply:error', { platform: params === null || params === void 0 ? void 0 : params.platform, userName: params === null || params === void 0 ? void 0 : params.userName, error: safeErrorMessage(error_28) });
                    return [2 /*return*/, { success: false, error: error_28.message }];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('heygem-check-status', function () { return __awaiter(_this, void 0, void 0, function () {
        var checkServiceStatus, isRunning, error_29;
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
                    error_29 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_29.message }];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('heygem-get-models', function () { return __awaiter(_this, void 0, void 0, function () {
        var getTrainedModels, models, error_30;
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
                    error_30 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_30.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('heygem-train-model', function (_event, params) { return __awaiter(_this, void 0, void 0, function () {
        var trainAvatarModel, fs_2, tempDir, tempVideoPath, model, error_31;
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
                    fs_2 = _a.sent();
                    tempDir = path.join(config.outputDir, 'temp');
                    if (!fs_2.existsSync(tempDir)) {
                        fs_2.mkdirSync(tempDir, { recursive: true });
                    }
                    tempVideoPath = path.join(tempDir, "upload_".concat(Date.now(), ".mp4"));
                    fs_2.writeFileSync(tempVideoPath, Buffer.from(params.videoBuffer, 'base64'));
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
                    error_31 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_31.message }];
                case 5: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('heygem-generate-video', function (_event, params) { return __awaiter(_this, void 0, void 0, function () {
        var _a, getTrainedModels, textToDigitalHumanVideo, models, model, outputDir, videoPath, error_32;
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
                    error_32 = _b.sent();
                    return [2 /*return*/, { success: false, error: error_32.message }];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    ipcMain.handle('heygem-synthesize-audio', function (_event, params) { return __awaiter(_this, void 0, void 0, function () {
        var _a, getTrainedModels, synthesizeAudio, models, model, text, outputDir, fs_3, audioPath, error_33;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 4, , 5]);
                    return [4 /*yield*/, import('../src/services/heygemService')];
                case 1:
                    _a = _b.sent(), getTrainedModels = _a.getTrainedModels, synthesizeAudio = _a.synthesizeAudio;
                    models = getTrainedModels({ dataPath: process.env.HEYGEM_DATA_PATH });
                    model = models.find(function (m) { return m.id === params.modelId; });
                    if (!model) {
                        throw new Error('找不到指定的声音模型');
                    }
                    text = (params.text || '').trim();
                    if (!text) {
                        throw new Error('文本为空');
                    }
                    outputDir = path.join(config.outputDir, 'audio');
                    return [4 /*yield*/, import('fs')];
                case 2:
                    fs_3 = _b.sent();
                    if (!fs_3.existsSync(outputDir)) {
                        fs_3.mkdirSync(outputDir, { recursive: true });
                    }
                    audioPath = path.join(outputDir, "voice_clone_".concat(model.id, "_").concat(Date.now(), ".wav"));
                    return [4 /*yield*/, synthesizeAudio({
                            baseUrl: process.env.HEYGEM_BASE_URL,
                            audioPort: parseInt(process.env.HEYGEM_AUDIO_PORT || '18180'),
                            videoPort: parseInt(process.env.HEYGEM_VIDEO_PORT || '8383'),
                            dataPath: process.env.HEYGEM_DATA_PATH,
                        }, model, text, audioPath)];
                case 3:
                    _b.sent();
                    return [2 /*return*/, { success: true, data: { audioPath: audioPath } }];
                case 4:
                    error_33 = _b.sent();
                    return [2 /*return*/, { success: false, error: error_33.message }];
                case 5: return [2 /*return*/];
            }
        });
    }); });
    // ========== 云端 GPU 数字人服务 ==========
    // 检查云端 GPU 服务器状态
    ipcMain.handle('cloud-gpu-check-status', function () { return __awaiter(_this, void 0, void 0, function () {
        var checkCloudGpuStatus, _a, serverUrl, videoPort, status_3, error_34;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, import('../src/services/cloudGpuService')];
                case 1:
                    checkCloudGpuStatus = (_b.sent()).checkCloudGpuStatus;
                    _a = getCloudGpuRuntime(), serverUrl = _a.serverUrl, videoPort = _a.videoPort;
                    return [4 /*yield*/, checkCloudGpuStatus({
                            serverUrl: serverUrl,
                            videoPort: videoPort,
                            localDataPath: path.join(app.getPath('userData'), 'cloud_gpu_data'),
                        })];
                case 2:
                    status_3 = _b.sent();
                    return [2 /*return*/, { success: true, data: __assign(__assign({}, status_3), { endpoint: "".concat(serverUrl, ":").concat(videoPort) }) }];
                case 3:
                    error_34 = _b.sent();
                    return [2 /*return*/, { success: false, error: error_34.message }];
                case 4: return [2 /*return*/];
            }
        });
    }); });
    // 获取已保存的云端形象列表
    ipcMain.handle('cloud-gpu-get-avatars', function () { return __awaiter(_this, void 0, void 0, function () {
        var getCloudAvatarModels, models, error_35;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, import('../src/services/cloudGpuService')];
                case 1:
                    getCloudAvatarModels = (_a.sent()).getCloudAvatarModels;
                    models = getCloudAvatarModels({
                        localDataPath: path.join(app.getPath('userData'), 'cloud_gpu_data'),
                    });
                    return [2 /*return*/, { success: true, data: models }];
                case 2:
                    error_35 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_35.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // 保存形象视频信息（用户上传形象视频后调用）
    ipcMain.handle('cloud-gpu-save-avatar', function (_event, params) { return __awaiter(_this, void 0, void 0, function () {
        var fs_4, uuidv4_1, localDataPath, avatarsDir, modelId, localPreviewDir, localPreviewPath, model_1, _a, serverUrl, videoPort, uploadAvatarVideo, uploaded, model, error_36;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 6, , 7]);
                    return [4 /*yield*/, import('fs')];
                case 1:
                    fs_4 = _b.sent();
                    return [4 /*yield*/, new Function('return import("uuid")')()];
                case 2:
                    uuidv4_1 = (_b.sent()).v4;
                    localDataPath = path.join(app.getPath('userData'), 'cloud_gpu_data');
                    avatarsDir = path.join(localDataPath, 'cloud_avatars');
                    if (!fs_4.existsSync(avatarsDir)) {
                        fs_4.mkdirSync(avatarsDir, { recursive: true });
                    }
                    modelId = uuidv4_1();
                    localPreviewDir = path.join(localDataPath, 'previews');
                    if (!fs_4.existsSync(localPreviewDir)) {
                        fs_4.mkdirSync(localPreviewDir, { recursive: true });
                    }
                    localPreviewPath = path.join(localPreviewDir, "".concat(modelId, ".mp4"));
                    fs_4.writeFileSync(localPreviewPath, Buffer.from(params.videoBuffer, 'base64'));
                    // 如果用户手动指定了服务端路径，则直接保存本地记录即可
                    if (params.remoteVideoPath) {
                        model_1 = {
                            id: modelId,
                            name: params.avatarName,
                            remoteVideoPath: params.remoteVideoPath,
                            localPreviewPath: localPreviewPath,
                            createdAt: new Date().toISOString(),
                        };
                        fs_4.writeFileSync(path.join(avatarsDir, "".concat(modelId, ".json")), JSON.stringify(model_1, null, 2));
                        return [2 /*return*/, { success: true, data: model_1 }];
                    }
                    _a = getCloudGpuRuntime(), serverUrl = _a.serverUrl, videoPort = _a.videoPort;
                    if (!serverUrl) return [3 /*break*/, 5];
                    return [4 /*yield*/, import('../src/services/cloudGpuService')];
                case 3:
                    uploadAvatarVideo = (_b.sent()).uploadAvatarVideo;
                    return [4 /*yield*/, uploadAvatarVideo({
                            serverUrl: serverUrl,
                            videoPort: videoPort,
                            localDataPath: localDataPath,
                        }, localPreviewPath, params.avatarName, undefined, modelId)
                        // uploadAvatarVideo 已写入 modelsDir 的 JSON；这里返回给渲染进程即可
                    ];
                case 4:
                    uploaded = _b.sent();
                    // uploadAvatarVideo 已写入 modelsDir 的 JSON；这里返回给渲染进程即可
                    return [2 /*return*/, {
                            success: true,
                            data: __assign(__assign({}, uploaded), { createdAt: uploaded.createdAt instanceof Date ? uploaded.createdAt.toISOString() : uploaded.createdAt }),
                        }];
                case 5:
                    model = {
                        id: modelId,
                        name: params.avatarName,
                        remoteVideoPath: "/code/data/avatar_".concat(modelId, ".mp4"),
                        localPreviewPath: localPreviewPath,
                        createdAt: new Date().toISOString(),
                    };
                    fs_4.writeFileSync(path.join(avatarsDir, "".concat(modelId, ".json")), JSON.stringify(model, null, 2));
                    return [2 /*return*/, { success: true, data: model }];
                case 6:
                    error_36 = _b.sent();
                    return [2 /*return*/, { success: false, error: error_36.message }];
                case 7: return [2 /*return*/];
            }
        });
    }); });
    // 删除云端形象
    ipcMain.handle('cloud-gpu-delete-avatar', function (_event, modelId) { return __awaiter(_this, void 0, void 0, function () {
        var deleteCloudAvatarModel, deleted, error_37;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, import('../src/services/cloudGpuService')];
                case 1:
                    deleteCloudAvatarModel = (_a.sent()).deleteCloudAvatarModel;
                    deleted = deleteCloudAvatarModel({
                        localDataPath: path.join(app.getPath('userData'), 'cloud_gpu_data'),
                    }, modelId);
                    return [2 /*return*/, { success: true, data: deleted }];
                case 2:
                    error_37 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_37.message }];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // 生成云端数字人视频
    ipcMain.handle('cloud-gpu-generate-video', function (_event, params) { return __awaiter(_this, void 0, void 0, function () {
        var generateCloudVideoWithLocalPaths, videoPath, error_38;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, import('../src/services/cloudGpuService')];
                case 1:
                    generateCloudVideoWithLocalPaths = (_a.sent()).generateCloudVideoWithLocalPaths;
                    return [4 /*yield*/, generateCloudVideoWithLocalPaths(__assign(__assign({}, getCloudGpuRuntime()), { localDataPath: path.join(app.getPath('userData'), 'cloud_gpu_data') }), params.avatarVideoPath, params.audioPath, function (progress, message) {
                            mainWindow.webContents.send('cloud-gpu-progress', { progress: progress, message: message });
                        })];
                case 2:
                    videoPath = _a.sent();
                    return [2 /*return*/, { success: true, data: { videoPath: videoPath } }];
                case 3:
                    error_38 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_38.message }];
                case 4: return [2 /*return*/];
            }
        });
    }); });
}
