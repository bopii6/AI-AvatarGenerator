/**
 * AI 封面生成服务
 * 使用阿里通义万相生成封面图片
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
/**
 * 生成AI封面
 */
export function generateCover(config, prompt, outputDir, options) {
    return __awaiter(this, void 0, void 0, function () {
        var enhancedPrompt, imageUrls, localPaths, i, fileName, filePath;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!fs.existsSync(outputDir)) {
                        fs.mkdirSync(outputDir, { recursive: true });
                    }
                    enhancedPrompt = "\u77ED\u89C6\u9891\u5C01\u9762\uFF0C".concat(prompt, "\uFF0C\u9AD8\u6E05\uFF0C\u4E13\u4E1A\uFF0C\u5438\u5F15\u773C\u7403\uFF0C\u9002\u5408\u793E\u4EA4\u5A92\u4F53");
                    return [4 /*yield*/, callWanxiangApi(config, enhancedPrompt, {
                            n: (options === null || options === void 0 ? void 0 : options.count) || 1,
                            style: options === null || options === void 0 ? void 0 : options.style,
                        })
                        // 下载所有图片
                    ];
                case 1:
                    imageUrls = _a.sent();
                    localPaths = [];
                    i = 0;
                    _a.label = 2;
                case 2:
                    if (!(i < imageUrls.length)) return [3 /*break*/, 5];
                    fileName = "cover_".concat(Date.now(), "_").concat(i, ".png");
                    filePath = path.join(outputDir, fileName);
                    return [4 /*yield*/, downloadImage(imageUrls[i], filePath)];
                case 3:
                    _a.sent();
                    localPaths.push(filePath);
                    _a.label = 4;
                case 4:
                    i++;
                    return [3 /*break*/, 2];
                case 5: return [2 /*return*/, localPaths];
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
