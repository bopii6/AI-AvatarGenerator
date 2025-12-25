/**
 * 阿里云 DashScope CosyVoice 声音克隆服务
 *
 * 功能：
 * - 创建复刻音色（通过音频 URL）
 * - 语音合成（使用复刻音色）
 * - 查询音色列表
 *
 * API 文档：https://help.aliyun.com/zh/model-studio/cosyvoice-clone-api
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
import fs from 'fs';
import http from 'http';
import path from 'path';
import https from 'https';
import WebSocket from 'ws';
import { randomUUID } from 'crypto';
// ==================== 配置 ====================
var DASHSCOPE_API_URL = 'https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization';
var DASHSCOPE_WEBSOCKET_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';
var DEFAULT_MODEL = 'cosyvoice-v3-flash'; // 性价比最高
var VOICE_ENROLLMENT_MODEL = 'voice-enrollment';
var DEFAULT_TIMEOUT_MS = 60000;
// ==================== 工具函数 ====================
function safeTrim(input) {
    return (input || '').toString().trim();
}
function sanitizePrefix(name) {
    // DashScope 要求：仅允许数字、大小写字母和下划线，不超过10个字符
    return safeTrim(name).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 10) || 'voice';
}
function parseVoiceName(voiceId) {
    // voice_id 格式：cosyvoice-v3-flash-myvoice-xxxxxxxx
    // 提取用户设置的前缀部分
    var parts = voiceId.split('-');
    if (parts.length >= 4) {
        // 返回用户设置的前缀部分（第4个部分）
        return parts[3] || voiceId;
    }
    return voiceId;
}
function mapStatus(status) {
    switch (status) {
        case 'OK':
            return 'ready';
        case 'DEPLOYING':
            return 'pending';
        case 'UNDEPLOYED':
            return 'failed';
        default:
            return 'pending';
    }
}
function requestJSON(url_1, method_1, body_1, apiKey_1) {
    return __awaiter(this, arguments, void 0, function (url, method, body, apiKey, timeoutMs) {
        if (timeoutMs === void 0) { timeoutMs = DEFAULT_TIMEOUT_MS; }
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    var payload = JSON.stringify(body);
                    var parsedUrl = new URL(url);
                    var req = https.request({
                        hostname: parsedUrl.hostname,
                        port: parsedUrl.port || 443,
                        path: parsedUrl.pathname + parsedUrl.search,
                        method: method,
                        timeout: timeoutMs,
                        headers: {
                            'Authorization': "Bearer ".concat(apiKey),
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(payload),
                        },
                    }, function (res) {
                        var data = '';
                        res.on('data', function (chunk) { return data += chunk.toString(); });
                        res.on('end', function () {
                            var status = res.statusCode || 0;
                            var parsed = data;
                            try {
                                parsed = data ? JSON.parse(data) : {};
                            }
                            catch ( /* ignore */_a) { /* ignore */ }
                            if (status >= 200 && status < 300) {
                                resolve(parsed);
                            }
                            else {
                                var errMsg = (parsed === null || parsed === void 0 ? void 0 : parsed.message) || (parsed === null || parsed === void 0 ? void 0 : parsed.error) || "HTTP ".concat(status);
                                reject(new Error("DashScope API \u9519\u8BEF: ".concat(errMsg)));
                            }
                        });
                    });
                    req.on('timeout', function () {
                        req.destroy(new Error('请求超时'));
                    });
                    req.on('error', reject);
                    req.write(payload);
                    req.end();
                })];
        });
    });
}
// ==================== 音频上传辅助 ====================
/**
 * 将本地音频上传到一个“公网可访问”的上传服务，返回可访问的 URL。
 * DashScope CosyVoice Clone 接口要求音频必须通过 URL 提供。
 */
function uploadAudioToGpuServer(audioPath, serverUrl, serverPort) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    var FormData = require('form-data');
                    var form = new FormData();
                    form.append('audio', fs.createReadStream(audioPath));
                    var parsedUrl = new URL(serverUrl);
                    var isHttps = parsedUrl.protocol === 'https:';
                    var port = serverPort || (parsedUrl.port ? parseInt(parsedUrl.port, 10) : (isHttps ? 443 : 80));
                    var basePath = (parsedUrl.pathname || '').replace(/\/+$/, '');
                    var uploadPath = "".concat(basePath, "/upload") || '/upload';
                    var client = isHttps ? https : http;
                    var req = client.request({
                        hostname: parsedUrl.hostname,
                        port: port,
                        path: uploadPath,
                        method: 'POST',
                        headers: form.getHeaders(),
                        timeout: 120000,
                    }, function (res) {
                        var data = '';
                        res.on('data', function (chunk) { return data += chunk.toString('utf8'); });
                        res.on('end', function () {
                            try {
                                var parsed = JSON.parse(data);
                                if (parsed.url || parsed.audio_url) {
                                    resolve(parsed.url || parsed.audio_url);
                                }
                                else {
                                    reject(new Error('上传成功但未返回 URL'));
                                }
                            }
                            catch (_a) {
                                reject(new Error('上传响应解析失败'));
                            }
                        });
                    });
                    req.on('error', reject);
                    req.on('timeout', function () {
                        req.destroy();
                        reject(new Error('上传超时'));
                    });
                    form.pipe(req);
                })];
        });
    });
}
// ==================== 核心 API ====================
/**
 * 创建复刻音色
 *
 * @param config 配置
 * @param params.name 音色名称（会被清洗为合法前缀）
 * @param params.audioUrl 音频 URL（公网可访问）
 * @returns voice_id
 */
export function createVoice(config, params) {
    return __awaiter(this, void 0, void 0, function () {
        var apiKey, prefix, targetModel, body, result, voiceId;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    apiKey = safeTrim(config.apiKey);
                    if (!apiKey)
                        throw new Error('未配置阿里云 DashScope API Key (ALIYUN_DASHSCOPE_API_KEY)');
                    prefix = sanitizePrefix(params.name);
                    targetModel = config.model || DEFAULT_MODEL;
                    body = {
                        model: VOICE_ENROLLMENT_MODEL,
                        input: {
                            action: 'create_voice',
                            target_model: targetModel,
                            prefix: prefix,
                            url: params.audioUrl,
                        },
                    };
                    return [4 /*yield*/, requestJSON(DASHSCOPE_API_URL, 'POST', body, apiKey)];
                case 1:
                    result = _b.sent();
                    voiceId = (_a = result === null || result === void 0 ? void 0 : result.output) === null || _a === void 0 ? void 0 : _a.voice_id;
                    if (!voiceId)
                        throw new Error('创建音色失败：未返回 voice_id');
                    return [2 /*return*/, { voiceId: voiceId }];
            }
        });
    });
}
/**
 * 从本地音频文件创建复刻音色
 * 需要先上传到云端服务器获取 URL
 */
export function createVoiceFromFile(config, params) {
    return __awaiter(this, void 0, void 0, function () {
        var serverUrl, serverPort, audioUrl;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    // 确保音频文件存在
                    if (!fs.existsSync(params.audioPath)) {
                        throw new Error("\u97F3\u9891\u6587\u4EF6\u4E0D\u5B58\u5728: ".concat(params.audioPath));
                    }
                    serverUrl = safeTrim(config.audioUploadServerUrl);
                    serverPort = config.audioUploadServerPort || 8383;
                    if (!serverUrl) {
                        throw new Error('DashScope CosyVoice 要求音频通过公网 URL 提供。请配置 VOICE_AUDIO_UPLOAD_SERVER_URL（推荐）或 CLOUD_GPU_SERVER_URL（兜底），或改为直接提供音频 URL。');
                    }
                    console.log('[AliyunVoice] 上传音频到上传服务...');
                    return [4 /*yield*/, uploadAudioToGpuServer(params.audioPath, serverUrl, serverPort)];
                case 1:
                    audioUrl = _a.sent();
                    console.log('[AliyunVoice] 音频上传成功:', audioUrl);
                    return [2 /*return*/, createVoice(config, { name: params.name, audioUrl: audioUrl })];
            }
        });
    });
}
/**
 * 查询音色列表
 */
export function listVoices(config, options) {
    return __awaiter(this, void 0, void 0, function () {
        var apiKey, body, result, voiceList;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    apiKey = safeTrim(config.apiKey);
                    if (!apiKey)
                        throw new Error('未配置阿里云 DashScope API Key');
                    body = {
                        model: VOICE_ENROLLMENT_MODEL,
                        input: {
                            action: 'list_voice',
                            page_index: (_a = options === null || options === void 0 ? void 0 : options.pageIndex) !== null && _a !== void 0 ? _a : 0,
                            page_size: (_b = options === null || options === void 0 ? void 0 : options.pageSize) !== null && _b !== void 0 ? _b : 100,
                        },
                    };
                    if (options === null || options === void 0 ? void 0 : options.prefix) {
                        body.input.prefix = options.prefix;
                    }
                    return [4 /*yield*/, requestJSON(DASHSCOPE_API_URL, 'POST', body, apiKey)];
                case 1:
                    result = _d.sent();
                    voiceList = ((_c = result === null || result === void 0 ? void 0 : result.output) === null || _c === void 0 ? void 0 : _c.voice_list) || [];
                    return [2 /*return*/, voiceList.map(function (v) { return ({
                            id: v.voice_id,
                            name: parseVoiceName(v.voice_id),
                            status: mapStatus(v.status),
                            createdAt: v.gmt_create,
                            updatedAt: v.gmt_modified,
                        }); })];
            }
        });
    });
}
/**
 * 查询指定音色
 */
export function getVoice(config, voiceId) {
    return __awaiter(this, void 0, void 0, function () {
        var apiKey, body, result, v, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    apiKey = safeTrim(config.apiKey);
                    if (!apiKey)
                        throw new Error('未配置阿里云 DashScope API Key');
                    body = {
                        model: VOICE_ENROLLMENT_MODEL,
                        input: {
                            action: 'query_voice',
                            voice_id: voiceId,
                        },
                    };
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, requestJSON(DASHSCOPE_API_URL, 'POST', body, apiKey)];
                case 2:
                    result = _b.sent();
                    v = result === null || result === void 0 ? void 0 : result.output;
                    if (!v)
                        return [2 /*return*/, null];
                    return [2 /*return*/, {
                            id: v.voice_id || voiceId,
                            name: parseVoiceName(v.voice_id || voiceId),
                            status: mapStatus(v.status),
                            createdAt: v.gmt_create,
                            updatedAt: v.gmt_modified,
                        }];
                case 3:
                    _a = _b.sent();
                    return [2 /*return*/, null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * 删除音色
 */
export function deleteVoice(config, voiceId) {
    return __awaiter(this, void 0, void 0, function () {
        var apiKey, body, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    apiKey = safeTrim(config.apiKey);
                    if (!apiKey)
                        throw new Error('未配置阿里云 DashScope API Key');
                    body = {
                        model: VOICE_ENROLLMENT_MODEL,
                        input: {
                            action: 'delete_voice',
                            voice_id: voiceId,
                        },
                    };
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, requestJSON(DASHSCOPE_API_URL, 'POST', body, apiKey)];
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
 * 使用复刻音色合成语音（WebSocket API）
 *
 * DashScope CosyVoice 语音合成使用 WebSocket 实时流式接口
 */
export function synthesizeSpeech(config, params) {
    return __awaiter(this, void 0, void 0, function () {
        var apiKey, text, voiceId, model, outputDir, debugWs, runOnce, e1_1, msg;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    apiKey = safeTrim(config.apiKey);
                    if (!apiKey)
                        throw new Error('未配置阿里云 DashScope API Key');
                    text = safeTrim(params.text);
                    if (!text)
                        throw new Error('合成文本为空');
                    voiceId = safeTrim(params.voiceId);
                    if (!voiceId)
                        throw new Error('voice_id 为空');
                    model = config.model || DEFAULT_MODEL;
                    outputDir = path.dirname(params.outputPath);
                    if (!fs.existsSync(outputDir)) {
                        fs.mkdirSync(outputDir, { recursive: true });
                    }
                    debugWs = (process.env.DASHSCOPE_DEBUG_WS || '').trim() === '1';
                    runOnce = function (options) { return __awaiter(_this, void 0, void 0, function () {
                        return __generator(this, function (_a) {
                            return [2 /*return*/, new Promise(function (resolve, reject) {
                                    var taskId = randomUUID();
                                    var audioChunks = [];
                                    var resolved = false;
                                    var ws = new WebSocket(DASHSCOPE_WEBSOCKET_URL, {
                                        headers: { 'Authorization': "Bearer ".concat(apiKey) },
                                    });
                                    var timeout = setTimeout(function () {
                                        if (!resolved) {
                                            resolved = true;
                                            ws.close();
                                            reject(new Error('语音合成超时'));
                                        }
                                    }, 180000);
                                    var fail = function (msg) {
                                        if (resolved)
                                            return;
                                        resolved = true;
                                        clearTimeout(timeout);
                                        try {
                                            ws.close();
                                        }
                                        catch ( /* ignore */_a) { /* ignore */ }
                                        reject(new Error(msg));
                                    };
                                    ws.on('open', function () {
                                        // DashScope tts_v2 协议：run-task(start) -> continue-task(text) -> finish-task
                                        var startMsg = {
                                            header: {
                                                action: 'run-task',
                                                task_id: taskId,
                                                streaming: 'duplex',
                                            },
                                            payload: {
                                                model: model,
                                                task_group: 'audio',
                                                task: 'tts',
                                                function: 'SpeechSynthesizer',
                                                input: {},
                                                parameters: {
                                                    voice: voiceId,
                                                    volume: 50,
                                                    text_type: 'PlainText',
                                                    sample_rate: options.sampleRate,
                                                    rate: 1.0,
                                                    format: options.format,
                                                    pitch: 1.0,
                                                    seed: 0,
                                                    type: 0,
                                                },
                                            },
                                        };
                                        var continueMsg = {
                                            header: {
                                                action: 'continue-task',
                                                task_id: taskId,
                                                streaming: 'duplex',
                                            },
                                            payload: {
                                                model: model,
                                                task_group: 'audio',
                                                task: 'tts',
                                                function: 'SpeechSynthesizer',
                                                input: { text: text },
                                            },
                                        };
                                        var finishMsg = {
                                            header: {
                                                action: 'finish-task',
                                                task_id: taskId,
                                                streaming: 'duplex',
                                            },
                                            payload: { input: {} },
                                        };
                                        if (debugWs)
                                            console.log('[AliyunVoice] WS start:', JSON.stringify(startMsg));
                                        ws.send(JSON.stringify(startMsg));
                                        if (debugWs)
                                            console.log('[AliyunVoice] WS continue:', JSON.stringify(continueMsg));
                                        ws.send(JSON.stringify(continueMsg));
                                        if (debugWs)
                                            console.log('[AliyunVoice] WS finish:', JSON.stringify(finishMsg));
                                        ws.send(JSON.stringify(finishMsg));
                                    });
                                    ws.on('message', function (data) {
                                        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
                                        var str = data.toString('utf8');
                                        if (str.startsWith('{')) {
                                            var msg = void 0;
                                            try {
                                                msg = JSON.parse(str);
                                            }
                                            catch (_l) {
                                                audioChunks.push(data);
                                                return;
                                            }
                                            var event_1 = ((_a = msg === null || msg === void 0 ? void 0 : msg.header) === null || _a === void 0 ? void 0 : _a.event) || ((_b = msg === null || msg === void 0 ? void 0 : msg.header) === null || _b === void 0 ? void 0 : _b.status);
                                            if (debugWs)
                                                console.log('[AliyunVoice] WS event:', event_1, 'raw:', str.slice(0, 500));
                                            if (event_1 === 'task-started') {
                                                console.log('[AliyunVoice] 语音合成任务开始');
                                                return;
                                            }
                                            if (event_1 === 'result-generated') {
                                                var audio = ((_e = (_d = (_c = msg === null || msg === void 0 ? void 0 : msg.payload) === null || _c === void 0 ? void 0 : _c.output) === null || _d === void 0 ? void 0 : _d.audio) === null || _e === void 0 ? void 0 : _e.data) ||
                                                    ((_g = (_f = msg === null || msg === void 0 ? void 0 : msg.payload) === null || _f === void 0 ? void 0 : _f.output) === null || _g === void 0 ? void 0 : _g.audio) ||
                                                    ((_h = msg === null || msg === void 0 ? void 0 : msg.payload) === null || _h === void 0 ? void 0 : _h.audio) ||
                                                    ((_k = (_j = msg === null || msg === void 0 ? void 0 : msg.payload) === null || _j === void 0 ? void 0 : _j.output) === null || _k === void 0 ? void 0 : _k.data);
                                                if (typeof audio === 'string' && audio) {
                                                    audioChunks.push(Buffer.from(audio, 'base64'));
                                                }
                                                else if (Array.isArray(audio)) {
                                                    for (var _i = 0, audio_1 = audio; _i < audio_1.length; _i++) {
                                                        var a = audio_1[_i];
                                                        if (typeof a === 'string' && a)
                                                            audioChunks.push(Buffer.from(a, 'base64'));
                                                    }
                                                }
                                                return;
                                            }
                                            if (event_1 === 'task-finished') {
                                                if (debugWs)
                                                    console.log('[AliyunVoice] WS task-finished');
                                                try {
                                                    ws.close();
                                                }
                                                catch ( /* ignore */_m) { /* ignore */ }
                                                return;
                                            }
                                            if (event_1 === 'task-failed' || event_1 === 'error') {
                                                var payload = msg === null || msg === void 0 ? void 0 : msg.payload;
                                                var header = msg === null || msg === void 0 ? void 0 : msg.header;
                                                var errCode = (payload === null || payload === void 0 ? void 0 : payload.code) || (payload === null || payload === void 0 ? void 0 : payload.error_code) || (payload === null || payload === void 0 ? void 0 : payload.reason) || (header === null || header === void 0 ? void 0 : header.code) || (header === null || header === void 0 ? void 0 : header.error_code);
                                                var errMsgRaw = (payload === null || payload === void 0 ? void 0 : payload.message) ||
                                                    (payload === null || payload === void 0 ? void 0 : payload.error_msg) ||
                                                    (header === null || header === void 0 ? void 0 : header.message) ||
                                                    (header === null || header === void 0 ? void 0 : header.error_message) ||
                                                    (header === null || header === void 0 ? void 0 : header.status_message) ||
                                                    '合成失败';
                                                var errMsg = errCode ? "[".concat(errCode, "] ").concat(errMsgRaw) : errMsgRaw;
                                                console.error('[AliyunVoice] 任务失败:', str.slice(0, 1200));
                                                fail(errMsg);
                                                return;
                                            }
                                            return;
                                        }
                                        audioChunks.push(data);
                                    });
                                    ws.on('close', function () {
                                        clearTimeout(timeout);
                                        if (resolved)
                                            return;
                                        resolved = true;
                                        if (audioChunks.length > 0) {
                                            var audioBuffer = Buffer.concat(audioChunks);
                                            fs.writeFileSync(params.outputPath, audioBuffer);
                                            resolve(params.outputPath);
                                        }
                                        else {
                                            reject(new Error('未收到音频数据'));
                                        }
                                    });
                                    ws.on('error', function (err) {
                                        clearTimeout(timeout);
                                        fail("WebSocket \u9519\u8BEF: ".concat(err.message));
                                    });
                                })];
                        });
                    }); };
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 6]);
                    return [4 /*yield*/, runOnce({ format: 'wav', sampleRate: 16000 })];
                case 2: return [2 /*return*/, _a.sent()];
                case 3:
                    e1_1 = _a.sent();
                    msg = String((e1_1 === null || e1_1 === void 0 ? void 0 : e1_1.message) || e1_1);
                    if (!(msg.includes('timeout') || msg.includes('InvalidParameter') || msg.includes('task-failed'))) return [3 /*break*/, 5];
                    return [4 /*yield*/, runOnce({ format: 'mp3', sampleRate: 22050 })];
                case 4: return [2 /*return*/, _a.sent()];
                case 5: throw e1_1;
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 检查阿里云 CosyVoice 服务状态
 */
export function checkStatus(config) {
    return __awaiter(this, void 0, void 0, function () {
        var apiKey, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    apiKey = safeTrim(config.apiKey);
                    if (!apiKey) {
                        return [2 /*return*/, { online: false, message: '未配置阿里云 DashScope API Key' }];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    // 尝试列出音色来验证 API Key 是否有效
                    return [4 /*yield*/, listVoices(config, { pageSize: 1 })];
                case 2:
                    // 尝试列出音色来验证 API Key 是否有效
                    _a.sent();
                    return [2 /*return*/, { online: true, message: 'ok' }];
                case 3:
                    e_1 = _a.sent();
                    return [2 /*return*/, { online: false, message: e_1.message }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
