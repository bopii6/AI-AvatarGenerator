/**
 * 腾讯云语音合成 (TTS) 服务
 * 将文字转换为语音
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
import crypto from 'crypto';
import https from 'https';
import fs from 'fs';
import path from 'path';
// 腾讯云TTS免费音色列表
export var VOICE_OPTIONS = [
    { voiceType: 101001, name: '智瑜', gender: 'female', description: '通用女声' },
    { voiceType: 101002, name: '智聆', gender: 'female', description: '通用女声' },
    { voiceType: 101003, name: '智美', gender: 'female', description: '客服女声' },
    { voiceType: 101004, name: '智云', gender: 'male', description: '通用男声' },
    { voiceType: 101005, name: '智莉', gender: 'female', description: '通用女声' },
    { voiceType: 101006, name: '智言', gender: 'female', description: '助手女声' },
    { voiceType: 101007, name: '智娜', gender: 'female', description: '客服女声' },
    { voiceType: 101008, name: '智琪', gender: 'female', description: '客服女声' },
    { voiceType: 101009, name: '智芸', gender: 'female', description: '知性女声' },
    { voiceType: 101010, name: '智华', gender: 'male', description: '通用男声' },
];
/**
 * 生成腾讯云API签名
 */
function generateAuthHeaders(config, action, payload) {
    var timestamp = Math.floor(Date.now() / 1000);
    var date = new Date(timestamp * 1000).toISOString().split('T')[0];
    var service = 'tts';
    var host = 'tts.tencentcloudapi.com';
    var algorithm = 'TC3-HMAC-SHA256';
    var httpRequestMethod = 'POST';
    var canonicalUri = '/';
    var canonicalQueryString = '';
    var canonicalHeaders = "content-type:application/json\nhost:".concat(host, "\n");
    var signedHeaders = 'content-type;host';
    var hashedRequestPayload = crypto.createHash('sha256').update(payload).digest('hex');
    var canonicalRequest = [
        httpRequestMethod,
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        hashedRequestPayload,
    ].join('\n');
    var credentialScope = "".concat(date, "/").concat(service, "/tc3_request");
    var hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    var stringToSign = [
        algorithm,
        timestamp,
        credentialScope,
        hashedCanonicalRequest,
    ].join('\n');
    var secretDate = crypto.createHmac('sha256', "TC3".concat(config.secretKey)).update(date).digest();
    var secretService = crypto.createHmac('sha256', secretDate).update(service).digest();
    var secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest();
    var signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');
    var authorization = [
        "".concat(algorithm, " Credential=").concat(config.secretId, "/").concat(credentialScope),
        "SignedHeaders=".concat(signedHeaders),
        "Signature=".concat(signature),
    ].join(', ');
    return {
        'Content-Type': 'application/json',
        'Host': host,
        'X-TC-Action': action,
        'X-TC-Version': '2019-08-23',
        'X-TC-Timestamp': timestamp.toString(),
        'X-TC-Region': config.region || 'ap-guangzhou',
        'Authorization': authorization,
    };
}
/**
 * 调用腾讯云TTS API
 */
function callTtsApi(config, action, params) {
    return __awaiter(this, void 0, void 0, function () {
        var payload, headers;
        return __generator(this, function (_a) {
            payload = JSON.stringify(params);
            headers = generateAuthHeaders(config, action, payload);
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    var req = https.request({
                        hostname: 'tts.tencentcloudapi.com',
                        method: 'POST',
                        headers: headers,
                    }, function (res) {
                        var data = '';
                        res.on('data', function (chunk) { return data += chunk; });
                        res.on('end', function () {
                            var _a;
                            try {
                                var result = JSON.parse(data);
                                if ((_a = result.Response) === null || _a === void 0 ? void 0 : _a.Error) {
                                    reject(new Error(result.Response.Error.Message));
                                }
                                else {
                                    resolve(result.Response);
                                }
                            }
                            catch (e) {
                                reject(e);
                            }
                        });
                    });
                    req.on('error', reject);
                    req.write(payload);
                    req.end();
                })];
        });
    });
}
/**
 * 基础语音合成
 */
export function synthesizeSpeech(config, text, options) {
    return __awaiter(this, void 0, void 0, function () {
        var params, response;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    params = {
                        Text: text,
                        SessionId: "session_".concat(Date.now()),
                        VoiceType: (options === null || options === void 0 ? void 0 : options.voiceType) || 101001,
                        Speed: (options === null || options === void 0 ? void 0 : options.speed) || 0,
                        Volume: (options === null || options === void 0 ? void 0 : options.volume) || 5,
                        Codec: (options === null || options === void 0 ? void 0 : options.codec) || 'mp3',
                        ModelType: 1,
                    };
                    return [4 /*yield*/, callTtsApi(config, 'TextToVoice', params)];
                case 1:
                    response = _a.sent();
                    return [2 /*return*/, response.Audio]; // Base64编码的音频数据
            }
        });
    });
}
/**
 * 生成语音并保存到文件
 */
export function generateSpeechFile(config, text, outputDir, options) {
    return __awaiter(this, void 0, void 0, function () {
        var maxLength, segments, i, audioBuffers, _i, segments_1, segment, audioBase64, combinedAudio, fileName, filePath;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    // 确保输出目录存在
                    if (!fs.existsSync(outputDir)) {
                        fs.mkdirSync(outputDir, { recursive: true });
                    }
                    maxLength = 150;
                    segments = [];
                    for (i = 0; i < text.length; i += maxLength) {
                        segments.push(text.slice(i, i + maxLength));
                    }
                    audioBuffers = [];
                    _i = 0, segments_1 = segments;
                    _a.label = 1;
                case 1:
                    if (!(_i < segments_1.length)) return [3 /*break*/, 4];
                    segment = segments_1[_i];
                    if (!segment.trim()) return [3 /*break*/, 3];
                    return [4 /*yield*/, synthesizeSpeech(config, segment, options)];
                case 2:
                    audioBase64 = _a.sent();
                    audioBuffers.push(Buffer.from(audioBase64, 'base64'));
                    _a.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4:
                    combinedAudio = Buffer.concat(audioBuffers);
                    fileName = "speech_".concat(Date.now(), ".mp3");
                    filePath = path.join(outputDir, fileName);
                    fs.writeFileSync(filePath, combinedAudio);
                    return [2 /*return*/, filePath];
            }
        });
    });
}
/**
 * 获取可用音色列表
 */
export function getVoiceOptions() {
    return VOICE_OPTIONS;
}
