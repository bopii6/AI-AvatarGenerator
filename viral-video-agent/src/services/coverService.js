/**
 * AI 封面生成服务
 * 使用阿里通义万相生成封面图片
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
import crypto from 'crypto';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { generateTitles } from './hunyuanService';
// eslint-disable-next-line @typescript-eslint/no-var-requires
var ffmpegPath = require('ffmpeg-static');
if (ffmpegPath.includes('app.asar') && !ffmpegPath.includes('app.asar.unpacked')) {
    ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
}
function runFFmpeg(args) {
    return new Promise(function (resolve, reject) {
        console.log("[FFmpeg] \u4F7F\u7528\u8DEF\u5F84: ".concat(ffmpegPath));
        console.log("[FFmpeg] \u53C2\u6570: ".concat(args.join(' ')));
        var proc = spawn(ffmpegPath, args, { stdio: 'pipe' });
        var stderr = '';
        proc.stderr.on('data', function (data) {
            stderr += data.toString();
        });
        proc.on('close', function (code) {
            if (code === 0)
                return resolve();
            var trimmed = stderr.length > 4000 ? stderr.slice(-4000) : stderr;
            reject(new Error("FFmpeg failed with code ".concat(code, ": ").concat(trimmed)));
        });
        proc.on('error', reject);
    });
}
function toFfmpegFilterPath(filePath) {
    // FFmpeg filter args need escaping for Windows drive colons.
    // Example: C:/path/file.txt => C\\:/path/file.txt
    return filePath.replace(/\\/g, '/').replace(/:/g, '\\:');
}
function wrapTitleLines(title, maxCharsPerLine, maxLines) {
    var trimmed = (title || '').trim();
    if (!trimmed)
        return ['爆款封面'];
    var chars = Array.from(trimmed);
    var lines = [];
    var idx = 0;
    while (idx < chars.length && lines.length < maxLines) {
        var remaining = chars.length - idx;
        var take = Math.min(maxCharsPerLine, remaining);
        var lineChars = chars.slice(idx, idx + take);
        lines.push(lineChars.join(''));
        idx += take;
    }
    if (idx < chars.length && lines.length > 0) {
        lines[lines.length - 1] = lines[lines.length - 1].replace(/.$/, '…');
    }
    return lines;
}
function generateTencentTextCover(config, prompt, outputDir, options) {
    return __awaiter(this, void 0, void 0, function () {
        var width, height, title, titles, e_1, lines, titleFilePath, outPath, fontFile, textFile, font, vf;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    width = (options === null || options === void 0 ? void 0 : options.width) || 1080;
                    height = (options === null || options === void 0 ? void 0 : options.height) || 1920;
                    title = prompt.trim();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, generateTitles({
                            secretId: config.secretId,
                            secretKey: config.secretKey,
                            region: config.region || 'ap-guangzhou',
                        }, prompt, 1)];
                case 2:
                    titles = _a.sent();
                    if (titles === null || titles === void 0 ? void 0 : titles[0])
                        title = titles[0].trim();
                    return [3 /*break*/, 4];
                case 3:
                    e_1 = _a.sent();
                    console.warn('[Cover] generateTitles failed, fallback to prompt:', e_1);
                    return [3 /*break*/, 4];
                case 4:
                    lines = wrapTitleLines(title, 12, 2);
                    titleFilePath = path.join(outputDir, "cover_title_".concat(Date.now(), ".txt"));
                    fs.writeFileSync(titleFilePath, lines.join('\n'), { encoding: 'utf8' });
                    outPath = path.join(outputDir, "cover_".concat(Date.now(), "_0.png"));
                    fontFile = 'C:/Windows/Fonts/msyh.ttc';
                    textFile = toFfmpegFilterPath(titleFilePath);
                    font = toFfmpegFilterPath(fontFile);
                    vf = [
                        // background + subtle highlight
                        "drawbox=x=0:y=0:w=iw:h=ih:color=#0b1025:t=fill",
                        "drawbox=x=0:y=0:w=iw:h=280:color=#1f3cff@0.10:t=fill",
                        // title text
                        "drawtext=fontfile='".concat(font, "':textfile='").concat(textFile, "':fontsize=88:fontcolor=white:borderw=6:bordercolor=black@0.45:line_spacing=12:x=(w-text_w)/2:y=220"),
                        // small footer tag
                        "drawtext=fontfile='".concat(font, "':text='\u4E00\u952E\u8FFD\u7206':fontsize=44:fontcolor=white@0.9:borderw=4:bordercolor=black@0.35:x=80:y=h-160"),
                    ].join(',');
                    return [4 /*yield*/, runFFmpeg([
                            '-hide_banner',
                            '-f', 'lavfi',
                            '-i',
                            "color=c=#0b1025:s=".concat(width, "x").concat(height, ":d=1"),
                            '-vf', vf,
                            '-frames:v', '1',
                            '-y',
                            outPath,
                        ])];
                case 5:
                    _a.sent();
                    return [2 /*return*/, outPath];
            }
        });
    });
}
var TENCENT_COVER_HOST = 'aiart.tencentcloudapi.com';
var TENCENT_COVER_SERVICE = 'aiart';
var TENCENT_COVER_VERSION = '2022-12-29';
function generateTencentAuthHeaders(config, action, payload) {
    var timestamp = Math.floor(Date.now() / 1000);
    var date = new Date(timestamp * 1000).toISOString().split('T')[0];
    var algorithm = 'TC3-HMAC-SHA256';
    var host = TENCENT_COVER_HOST;
    var service = TENCENT_COVER_SERVICE;
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
        'X-TC-Version': TENCENT_COVER_VERSION,
        'X-TC-Timestamp': timestamp.toString(),
        'X-TC-Region': config.region || 'ap-guangzhou',
        'Authorization': authorization,
    };
}
function callTencentCoverApi(config, prompt, options) {
    return __awaiter(this, void 0, void 0, function () {
        var width, height, resolution, requestBody, payload, headers;
        return __generator(this, function (_a) {
            width = (options === null || options === void 0 ? void 0 : options.width) || 1024;
            height = (options === null || options === void 0 ? void 0 : options.height) || 1024;
            resolution = "".concat(width, ":").concat(height);
            requestBody = {
                Prompt: prompt,
                Resolution: resolution,
                LogoAdd: 0,
                RspImgType: 'base64',
            };
            payload = JSON.stringify(requestBody);
            headers = generateTencentAuthHeaders(config, 'TextToImageLite', payload);
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    var req = https.request({
                        hostname: TENCENT_COVER_HOST,
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
                                    return;
                                }
                                var entries_1 = [];
                                var responseData = result.Response || {};
                                if (responseData.ResultImage) {
                                    var v = String(responseData.ResultImage);
                                    if (/^https?:\/\//i.test(v))
                                        entries_1.push({ url: v });
                                    else
                                        entries_1.push({ base64: v });
                                }
                                var detailList = responseData.ResultDetails || responseData.ResultDetail;
                                if (Array.isArray(detailList)) {
                                    detailList.forEach(function (item) {
                                        if (item.ResultUrl || item.Url) {
                                            entries_1.push({ url: item.ResultUrl || item.Url });
                                        }
                                        else if (item.ResultImage || item.ImageBase64) {
                                            entries_1.push({ base64: item.ResultImage || item.ImageBase64 });
                                        }
                                    });
                                }
                                if (Array.isArray(responseData.ImageResults)) {
                                    responseData.ImageResults.forEach(function (item) {
                                        if (item.Url)
                                            entries_1.push({ url: item.Url });
                                        else if (item.ImageBase64)
                                            entries_1.push({ base64: item.ImageBase64 });
                                    });
                                }
                                else if (Array.isArray(responseData.Results)) {
                                    responseData.Results.forEach(function (item) {
                                        if (item.Url)
                                            entries_1.push({ url: item.Url });
                                        else if (item.ImageBase64)
                                            entries_1.push({ base64: item.ImageBase64 });
                                    });
                                }
                                else if (responseData.ImageUrl && entries_1.length === 0) {
                                    entries_1.push({ url: responseData.ImageUrl });
                                }
                                else if (responseData.ImageBase64 && entries_1.length === 0) {
                                    entries_1.push({ base64: responseData.ImageBase64 });
                                }
                                if (entries_1.length === 0) {
                                    reject(new Error('未返回封面数据'));
                                    return;
                                }
                                resolve({ entries: entries_1, requestId: responseData.RequestId, action: 'TextToImageLite' });
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
 * 生成阿里云签名
 */
function generateSignature(accessKeySecret, stringToSign) {
    return crypto
        .createHmac('sha1', accessKeySecret + '&')
        .update(stringToSign)
        .digest('base64');
}
/**
 * 调用通义万相 API
 */
function callWanxiangApi(config, prompt, options) {
    return __awaiter(this, void 0, void 0, function () {
        var requestBody;
        return __generator(this, function (_a) {
            requestBody = {
                model: 'wanx-v1',
                input: {
                    prompt: prompt,
                },
                parameters: {
                    style: (options === null || options === void 0 ? void 0 : options.style) || '<auto>',
                    size: (options === null || options === void 0 ? void 0 : options.size) || '1024*1024',
                    n: (options === null || options === void 0 ? void 0 : options.n) || 1,
                },
            };
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    var postData = JSON.stringify(requestBody);
                    var req = https.request({
                        hostname: 'dashscope.aliyuncs.com',
                        path: '/api/v1/services/aigc/text2image/image-synthesis',
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': "Bearer ".concat(config.accessKeyId),
                            'X-DashScope-Async': 'enable',
                        },
                    }, function (res) {
                        var data = '';
                        res.on('data', function (chunk) { return data += chunk; });
                        res.on('end', function () {
                            var _a, _b;
                            try {
                                var result = JSON.parse(data);
                                if ((_a = result.output) === null || _a === void 0 ? void 0 : _a.task_id) {
                                    // 异步任务，需要轮询
                                    pollTaskResult(config, result.output.task_id)
                                        .then(resolve)
                                        .catch(reject);
                                }
                                else if ((_b = result.output) === null || _b === void 0 ? void 0 : _b.results) {
                                    resolve(result.output.results.map(function (r) { return r.url; }));
                                }
                                else {
                                    reject(new Error(result.message || '生成失败'));
                                }
                            }
                            catch (e) {
                                reject(e);
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
 * 轮询任务结果
 */
function pollTaskResult(config, taskId) {
    return __awaiter(this, void 0, void 0, function () {
        var maxAttempts, i, result;
        var _a, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    maxAttempts = 60;
                    i = 0;
                    _c.label = 1;
                case 1:
                    if (!(i < maxAttempts)) return [3 /*break*/, 5];
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 2000); })];
                case 2:
                    _c.sent();
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            https.get({
                                hostname: 'dashscope.aliyuncs.com',
                                path: "/api/v1/tasks/".concat(taskId),
                                headers: {
                                    'Authorization': "Bearer ".concat(config.accessKeyId),
                                },
                            }, function (res) {
                                var data = '';
                                res.on('data', function (chunk) { return data += chunk; });
                                res.on('end', function () {
                                    try {
                                        resolve(JSON.parse(data));
                                    }
                                    catch (e) {
                                        reject(e);
                                    }
                                });
                            }).on('error', reject);
                        })];
                case 3:
                    result = _c.sent();
                    if (((_a = result.output) === null || _a === void 0 ? void 0 : _a.task_status) === 'SUCCEEDED') {
                        return [2 /*return*/, result.output.results.map(function (r) { return r.url; })];
                    }
                    else if (((_b = result.output) === null || _b === void 0 ? void 0 : _b.task_status) === 'FAILED') {
                        throw new Error(result.output.message || '生成失败');
                    }
                    _c.label = 4;
                case 4:
                    i++;
                    return [3 /*break*/, 1];
                case 5: throw new Error('生成超时');
            }
        });
    });
}
/**
 * 下载图片到本地
 */
function downloadImage(imageUrl, outputPath) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    var file = fs.createWriteStream(outputPath);
                    https.get(imageUrl, function (response) {
                        response.pipe(file);
                        file.on('finish', function () {
                            file.close();
                            resolve(outputPath);
                        });
                    }).on('error', function (err) {
                        fs.unlink(outputPath, function () { });
                        reject(err);
                    });
                })];
        });
    });
}
function downloadBase64Image(base64, outputPath) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    var data = base64.replace(/^data:image\/[^;]+;base64,/, '');
                    fs.writeFile(outputPath, Buffer.from(data, 'base64'), function (err) {
                        if (err)
                            return reject(err);
                        resolve(outputPath);
                    });
                })];
        });
    });
}
/**
 * 生成AI封面
 */
export function generateCover(config, prompt, outputDir, options) {
    return __awaiter(this, void 0, void 0, function () {
        var apiResult, entries, localPaths_1, i, entry, fileName, filePath, e_2, coverPath, enhancedPrompt, imageUrls, localPaths, i, fileName, filePath;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!fs.existsSync(outputDir)) {
                        fs.mkdirSync(outputDir, { recursive: true });
                    }
                    if (!(config.provider === 'tencent' && config.tencent)) return [3 /*break*/, 12];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 9, , 10]);
                    return [4 /*yield*/, callTencentCoverApi(config.tencent, prompt, options)];
                case 2:
                    apiResult = _a.sent();
                    entries = apiResult.entries;
                    localPaths_1 = [];
                    i = 0;
                    _a.label = 3;
                case 3:
                    if (!(i < entries.length)) return [3 /*break*/, 8];
                    entry = entries[i];
                    fileName = "cover_".concat(Date.now(), "_").concat(i, ".png");
                    filePath = path.join(outputDir, fileName);
                    if (!entry.url) return [3 /*break*/, 5];
                    return [4 /*yield*/, downloadImage(entry.url, filePath)];
                case 4:
                    _a.sent();
                    localPaths_1.push(filePath);
                    return [3 /*break*/, 7];
                case 5:
                    if (!entry.base64) return [3 /*break*/, 7];
                    return [4 /*yield*/, downloadBase64Image(entry.base64, filePath)];
                case 6:
                    _a.sent();
                    localPaths_1.push(filePath);
                    _a.label = 7;
                case 7:
                    i++;
                    return [3 /*break*/, 3];
                case 8:
                    if (localPaths_1.length > 0) {
                        console.log('[Cover] tencent aiart ok:', {
                            action: apiResult.action,
                            requestId: apiResult.requestId,
                            count: localPaths_1.length,
                        });
                        return [2 /*return*/, localPaths_1];
                    }
                    return [3 /*break*/, 10];
                case 9:
                    e_2 = _a.sent();
                    console.warn('[Cover] aiart TextToImage failed, fallback to text cover:', e_2);
                    return [3 /*break*/, 10];
                case 10: return [4 /*yield*/, generateTencentTextCover(__assign(__assign({}, config.tencent), { region: config.tencent.region || 'ap-guangzhou' }), prompt, outputDir, { width: options === null || options === void 0 ? void 0 : options.width, height: options === null || options === void 0 ? void 0 : options.height })];
                case 11:
                    coverPath = _a.sent();
                    return [2 /*return*/, [coverPath]];
                case 12:
                    enhancedPrompt = "\u77ED\u89C6\u9891\u5C01\u9762\uFF0C".concat(prompt, "\uFF0C\u9AD8\u6E05\uFF0C\u4E13\u4E1A\uFF0C\u5438\u5F15\u773C\u7403\uFF0C\u9002\u5408\u793E\u4EA4\u5A92\u4F53");
                    return [4 /*yield*/, callWanxiangApi(config.aliyun, enhancedPrompt, {
                            n: (options === null || options === void 0 ? void 0 : options.count) || 1,
                            style: options === null || options === void 0 ? void 0 : options.style,
                            size: "".concat((options === null || options === void 0 ? void 0 : options.width) || 1024, "*").concat((options === null || options === void 0 ? void 0 : options.height) || 1024),
                        })];
                case 13:
                    imageUrls = _a.sent();
                    localPaths = [];
                    i = 0;
                    _a.label = 14;
                case 14:
                    if (!(i < imageUrls.length)) return [3 /*break*/, 17];
                    fileName = "cover_".concat(Date.now(), "_").concat(i, ".png");
                    filePath = path.join(outputDir, fileName);
                    return [4 /*yield*/, downloadImage(imageUrls[i], filePath)];
                case 15:
                    _a.sent();
                    localPaths.push(filePath);
                    _a.label = 16;
                case 16:
                    i++;
                    return [3 /*break*/, 14];
                case 17: return [2 /*return*/, localPaths];
            }
        });
    });
}
/**
 * 为封面添加文字标题
 */
export function addTextToCover(imagePath, text, outputPath, options) {
    return __awaiter(this, void 0, void 0, function () {
        var spawn, fontSize, fontColor, y;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, import('child_process')];
                case 1:
                    spawn = (_a.sent()).spawn;
                    fontSize = (options === null || options === void 0 ? void 0 : options.fontSize) || 48;
                    fontColor = (options === null || options === void 0 ? void 0 : options.fontColor) || 'white';
                    y = (options === null || options === void 0 ? void 0 : options.position) === 'top' ? '50' : (options === null || options === void 0 ? void 0 : options.position) === 'center' ? '(h-text_h)/2' : 'h-text_h-50';
                    return [2 /*return*/, new Promise(function (resolve, reject) {
                            var ffmpeg = spawn('ffmpeg', [
                                '-i', imagePath,
                                '-vf',
                                "drawtext=text='".concat(text, "':fontsize=").concat(fontSize, ":fontcolor=").concat(fontColor, ":x=(w-text_w)/2:y=").concat(y, ":shadowcolor=black:shadowx=2:shadowy=2"),
                                '-y',
                                outputPath,
                            ]);
                            ffmpeg.on('close', function (code) {
                                if (code === 0) {
                                    resolve(outputPath);
                                }
                                else {
                                    reject(new Error('添加文字失败'));
                                }
                            });
                            ffmpeg.on('error', reject);
                        })];
            }
        });
    });
}
