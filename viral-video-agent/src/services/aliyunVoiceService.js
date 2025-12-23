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
        var apiKey, text, voiceId, model, outputDir;
        return __generator(this, function (_a) {
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
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    var taskId = randomUUID();
                    var audioChunks = [];
                    var resolved = false;
                    // WebSocket 连接
                    var ws = new WebSocket(DASHSCOPE_WEBSOCKET_URL, {
                        headers: {
                            'Authorization': "Bearer ".concat(apiKey),
                        },
                    });
                    var timeout = setTimeout(function () {
                        if (!resolved) {
                            resolved = true;
                            ws.close();
                            reject(new Error('语音合成超时'));
                        }
                    }, 180000); // 3 分钟超时
                    ws.on('open', function () {
                        // 发送 run-task 消息
                        var message = {
                            header: {
                                action: 'run-task',
                                task_id: taskId,
                                streaming: 'duplex',
                            },
                            payload: {
                                task_group: 'audio',
                                task: 'tts',
                                function: 'SpeechSynthesizer',
                                model: model,
                                parameters: {
                                    voice: voiceId,
                                    format: 'mp3',
                                    sample_rate: 22050,
                                },
                                input: {
                                    text: text,
                                },
                            },
                        };
                        ws.send(JSON.stringify(message));
                    });
                    ws.on('message', function (data) {
                        var _a, _b, _c, _d;
                        try {
                            // 尝试解析为 JSON（控制消息）
                            var str = data.toString('utf8');
                            if (str.startsWith('{')) {
                                var msg = JSON.parse(str);
                                var event_1 = (_a = msg === null || msg === void 0 ? void 0 : msg.header) === null || _a === void 0 ? void 0 : _a.event;
                                if (event_1 === 'task-started') {
                                    console.log('[AliyunVoice] 语音合成任务开始');
                                }
                                else if (event_1 === 'task-finished') {
                                    console.log('[AliyunVoice] 语音合成任务完成');
                                    // 任务完成，发送 finish-task
                                    ws.send(JSON.stringify({
                                        header: {
                                            action: 'finish-task',
                                            task_id: taskId,
                                        },
                                    }));
                                }
                                else if (event_1 === 'result-generated') {
                                    // 音频数据在 payload 中
                                    var audio = (_c = (_b = msg === null || msg === void 0 ? void 0 : msg.payload) === null || _b === void 0 ? void 0 : _b.output) === null || _c === void 0 ? void 0 : _c.audio;
                                    if (audio) {
                                        audioChunks.push(Buffer.from(audio, 'base64'));
                                    }
                                }
                                else if (event_1 === 'task-failed') {
                                    var errMsg = ((_d = msg === null || msg === void 0 ? void 0 : msg.payload) === null || _d === void 0 ? void 0 : _d.message) || '合成失败';
                                    if (!resolved) {
                                        resolved = true;
                                        clearTimeout(timeout);
                                        ws.close();
                                        reject(new Error(errMsg));
                                    }
                                }
                            }
                            else {
                                // 二进制音频数据
                                audioChunks.push(data);
                            }
                        }
                        catch (_e) {
                            // 可能是二进制数据
                            audioChunks.push(data);
                        }
                    });
                    ws.on('close', function () {
                        clearTimeout(timeout);
                        if (!resolved) {
                            resolved = true;
                            if (audioChunks.length > 0) {
                                var audioBuffer = Buffer.concat(audioChunks);
                                fs.writeFileSync(params.outputPath, audioBuffer);
                                console.log('[AliyunVoice] 音频保存到:', params.outputPath);
                                resolve(params.outputPath);
                            }
                            else {
                                reject(new Error('未收到音频数据'));
                            }
                        }
                    });
                    ws.on('error', function (err) {
                        clearTimeout(timeout);
                        if (!resolved) {
                            resolved = true;
                            reject(new Error("WebSocket \u9519\u8BEF: ".concat(err.message)));
                        }
                    });
                })];
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
