/**
 * 腾讯云语音识别 (ASR) 服务
 * 将视频/音频中的语音转换为文字
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
/**
 * 生成腾讯云API签名
 */
function sign(secretKey, signStr) {
    return crypto.createHmac('sha256', secretKey).update(signStr).digest('hex');
}
/**
 * 生成腾讯云API请求头
 */
function generateAuthHeaders(config, action, payload) {
    var timestamp = Math.floor(Date.now() / 1000);
    var date = new Date(timestamp * 1000).toISOString().split('T')[0];
    var service = 'asr';
    var host = 'asr.tencentcloudapi.com';
    var algorithm = 'TC3-HMAC-SHA256';
    // 规范请求串
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
    // 待签名字符串
    var credentialScope = "".concat(date, "/").concat(service, "/tc3_request");
    var hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
    var stringToSign = [
        algorithm,
        timestamp,
        credentialScope,
        hashedCanonicalRequest,
    ].join('\n');
    // 计算签名
    var secretDate = crypto.createHmac('sha256', "TC3".concat(config.secretKey)).update(date).digest();
    var secretService = crypto.createHmac('sha256', secretDate).update(service).digest();
    var secretSigning = crypto.createHmac('sha256', secretService).update('tc3_request').digest();
    var signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');
    // 拼接 Authorization
    var authorization = [
        "".concat(algorithm, " Credential=").concat(config.secretId, "/").concat(credentialScope),
        "SignedHeaders=".concat(signedHeaders),
        "Signature=".concat(signature),
    ].join(', ');
    return {
        'Content-Type': 'application/json',
        'Host': host,
        'X-TC-Action': action,
        'X-TC-Version': '2019-06-14',
        'X-TC-Timestamp': timestamp.toString(),
        'X-TC-Region': config.region || 'ap-guangzhou',
        'Authorization': authorization,
    };
}
/**
 * 调用腾讯云ASR API
 */
function callAsrApi(config, action, params) {
    return __awaiter(this, void 0, void 0, function () {
        var payload, headers;
        return __generator(this, function (_a) {
            payload = JSON.stringify(params);
            headers = generateAuthHeaders(config, action, payload);
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    var req = https.request({
                        hostname: 'asr.tencentcloudapi.com',
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
 * 创建录音文件识别任务
 */
export function createRecognitionTask(config, audioUrl, options) {
    return __awaiter(this, void 0, void 0, function () {
        var params, response;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    params = {
                        EngineModelType: (options === null || options === void 0 ? void 0 : options.engineType) || '16k_zh',
                        ChannelNum: (options === null || options === void 0 ? void 0 : options.channelNum) || 1,
                        ResTextFormat: 0, // 返回识别结果
                        SourceType: 0, // URL方式
                        Url: audioUrl,
                    };
                    return [4 /*yield*/, callAsrApi(config, 'CreateRecTask', params)];
                case 1:
                    response = _b.sent();
                    return [2 /*return*/, (_a = response.Data) === null || _a === void 0 ? void 0 : _a.TaskId];
            }
        });
    });
}
/**
 * 查询录音文件识别结果
 */
export function getRecognitionResult(config, taskId) {
    return __awaiter(this, void 0, void 0, function () {
        var response, status, result;
        var _a, _b, _c;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0: return [4 /*yield*/, callAsrApi(config, 'DescribeTaskStatus', { TaskId: parseInt(taskId) })];
                case 1:
                    response = _d.sent();
                    status = (_a = response.Data) === null || _a === void 0 ? void 0 : _a.Status;
                    if (status === 2) {
                        result = (_b = response.Data) === null || _b === void 0 ? void 0 : _b.Result;
                        return [2 /*return*/, {
                                text: result || '',
                                segments: [], // 腾讯云返回的详细分段需要进一步解析
                            }];
                    }
                    else if (status === 3) {
                        // 识别失败
                        throw new Error('语音识别失败: ' + ((_c = response.Data) === null || _c === void 0 ? void 0 : _c.ErrorMsg));
                    }
                    // 还在处理中
                    return [2 /*return*/, null];
            }
        });
    });
}
/**
 * 完整的语音转文字流程（带轮询）
 */
export function transcribeAudio(config, audioUrl, onProgress) {
    return __awaiter(this, void 0, void 0, function () {
        var taskId, maxAttempts, i, result;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress('正在创建识别任务...');
                    return [4 /*yield*/, createRecognitionTask(config, audioUrl)];
                case 1:
                    taskId = _a.sent();
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress('正在识别语音...');
                    maxAttempts = 60 // 最多等待5分钟
                    ;
                    i = 0;
                    _a.label = 2;
                case 2:
                    if (!(i < maxAttempts)) return [3 /*break*/, 6];
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 5000); })]; // 每5秒查询一次
                case 3:
                    _a.sent(); // 每5秒查询一次
                    return [4 /*yield*/, getRecognitionResult(config, taskId)];
                case 4:
                    result = _a.sent();
                    if (result) {
                        return [2 /*return*/, result];
                    }
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress("\u8BC6\u522B\u4E2D... (".concat(i + 1, "/").concat(maxAttempts, ")"));
                    _a.label = 5;
                case 5:
                    i++;
                    return [3 /*break*/, 2];
                case 6: throw new Error('语音识别超时，请重试');
            }
        });
    });
}
/**
 * 一句话识别（实时）
 */
export function recognizeSentence(config, audioBase64, options) {
    return __awaiter(this, void 0, void 0, function () {
        var params, response;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    params = {
                        EngSerViceType: (options === null || options === void 0 ? void 0 : options.engineType) || '16k_zh', // 引擎服务类型
                        SourceType: 1, // Base64方式
                        VoiceFormat: 'mp3',
                        Data: audioBase64,
                        DataLen: audioBase64.length,
                    };
                    return [4 /*yield*/, callAsrApi(config, 'SentenceRecognition', params)];
                case 1:
                    response = _a.sent();
                    return [2 /*return*/, response.Result || ''];
            }
        });
    });
}
