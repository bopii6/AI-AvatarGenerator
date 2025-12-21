/**
 * 多平台自动上传服务
 * 基于 social-auto-upload 开源项目
 *
 * 支持平台：抖音、小红书、视频号
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
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
/**
 * 获取平台对应的上传脚本
 */
function getUploadScript(platform) {
    var scripts = {
        'douyin': 'upload_video_to_douyin.py',
        'xiaohongshu': 'upload_video_to_xhs.py',
        'shipinhao': 'upload_video_to_tencent.py',
    };
    return scripts[platform];
}
/**
 * 检查平台 Cookie 是否存在
 */
export function checkCookieExists(config, platform) {
    var cookiePaths = {
        'douyin': path.join(config.cookiesDir, 'douyin_uploader', 'account.json'),
        'xiaohongshu': path.join(config.cookiesDir, 'xhs_uploader', 'account.json'),
        'shipinhao': path.join(config.cookiesDir, 'tencent_uploader', 'account.json'),
    };
    return fs.existsSync(cookiePaths[platform]);
}
/**
 * 获取所有已配置的平台
 */
export function getConfiguredPlatforms(config) {
    var platforms = ['douyin', 'xiaohongshu', 'shipinhao'];
    return platforms.filter(function (p) { return checkCookieExists(config, p); });
}
/**
 * 上传视频到指定平台
 */
export function uploadToPlatform(config, options, onProgress) {
    return __awaiter(this, void 0, void 0, function () {
        var platform, videoPath, title, tags, coverPath, scriptPath;
        return __generator(this, function (_a) {
            platform = options.platform, videoPath = options.videoPath, title = options.title, tags = options.tags, coverPath = options.coverPath;
            // 检查视频文件
            if (!fs.existsSync(videoPath)) {
                return [2 /*return*/, { success: false, platform: platform, error: '视频文件不存在' }];
            }
            // 检查 Cookie
            if (!checkCookieExists(config, platform)) {
                return [2 /*return*/, { success: false, platform: platform, error: "\u8BF7\u5148\u914D\u7F6E ".concat(platform, " \u7684\u767B\u5F55 Cookie") }];
            }
            scriptPath = path.join(config.socialUploadDir, getUploadScript(platform));
            if (!fs.existsSync(scriptPath)) {
                return [2 /*return*/, { success: false, platform: platform, error: '上传脚本不存在' }];
            }
            onProgress === null || onProgress === void 0 ? void 0 : onProgress("\u6B63\u5728\u4E0A\u4F20\u5230 ".concat(platform, "..."));
            return [2 /*return*/, new Promise(function (resolve) {
                    var args = [
                        scriptPath,
                        videoPath,
                        coverPath || '',
                        title,
                        tags.map(function (t) { return "#".concat(t); }).join(','),
                    ];
                    var proc = spawn(config.pythonPath, args, {
                        cwd: config.socialUploadDir,
                        env: __assign({}, process.env),
                    });
                    var stdout = '';
                    var stderr = '';
                    proc.stdout.on('data', function (data) {
                        var text = data.toString();
                        stdout += text;
                        // 解析进度信息
                        if (text.includes('登录成功')) {
                            onProgress === null || onProgress === void 0 ? void 0 : onProgress('登录成功');
                        }
                        else if (text.includes('开始上传')) {
                            onProgress === null || onProgress === void 0 ? void 0 : onProgress('开始上传视频');
                        }
                        else if (text.includes('上传成功') || text.includes('视频上传成功')) {
                            onProgress === null || onProgress === void 0 ? void 0 : onProgress('上传成功！');
                        }
                    });
                    proc.stderr.on('data', function (data) {
                        stderr += data.toString();
                    });
                    proc.on('close', function (code) {
                        if (code === 0 && (stdout.includes('上传成功') || stdout.includes('视频上传成功'))) {
                            resolve({ success: true, platform: platform });
                        }
                        else {
                            resolve({
                                success: false,
                                platform: platform,
                                error: stderr || '上传失败，请检查网络和登录状态',
                            });
                        }
                    });
                    proc.on('error', function (err) {
                        resolve({ success: false, platform: platform, error: err.message });
                    });
                })];
        });
    });
}
/**
 * 批量上传到多个平台
 */
export function uploadToMultiplePlatforms(config, options, platforms, onProgress) {
    return __awaiter(this, void 0, void 0, function () {
        var results, _loop_1, _i, platforms_1, platform;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    results = [];
                    _loop_1 = function (platform) {
                        var result;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(platform, "\u5F00\u59CB\u4E0A\u4F20\u5230 ".concat(platform));
                                    return [4 /*yield*/, uploadToPlatform(config, __assign(__assign({}, options), { platform: platform }), function (msg) { return onProgress === null || onProgress === void 0 ? void 0 : onProgress(platform, msg); })];
                                case 1:
                                    result = _b.sent();
                                    results.push(result);
                                    // 平台之间间隔一下
                                    return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, 2000); })];
                                case 2:
                                    // 平台之间间隔一下
                                    _b.sent();
                                    return [2 /*return*/];
                            }
                        });
                    };
                    _i = 0, platforms_1 = platforms;
                    _a.label = 1;
                case 1:
                    if (!(_i < platforms_1.length)) return [3 /*break*/, 4];
                    platform = platforms_1[_i];
                    return [5 /*yield**/, _loop_1(platform)];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3:
                    _i++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/, results];
            }
        });
    });
}
/**
 * 启动 Cookie 获取流程（打开浏览器让用户登录）
 */
export function startCookieSetup(config, platform, onProgress) {
    return __awaiter(this, void 0, void 0, function () {
        var scripts, scriptPath;
        return __generator(this, function (_a) {
            scripts = {
                'douyin': 'get_douyin_cookie.py',
                'xiaohongshu': 'get_xhs_cookie.py',
                'shipinhao': 'get_tencent_cookie.py',
            };
            scriptPath = path.join(config.socialUploadDir, scripts[platform]);
            if (!fs.existsSync(scriptPath)) {
                onProgress === null || onProgress === void 0 ? void 0 : onProgress('Cookie 获取脚本不存在');
                return [2 /*return*/, false];
            }
            onProgress === null || onProgress === void 0 ? void 0 : onProgress("\u6B63\u5728\u6253\u5F00 ".concat(platform, " \u767B\u5F55\u9875\u9762..."));
            return [2 /*return*/, new Promise(function (resolve) {
                    var proc = spawn(config.pythonPath, [scriptPath], {
                        cwd: config.socialUploadDir,
                    });
                    proc.stdout.on('data', function (data) {
                        var text = data.toString();
                        if (text.includes('Cookie') || text.includes('成功')) {
                            onProgress === null || onProgress === void 0 ? void 0 : onProgress(text.trim());
                        }
                    });
                    proc.on('close', function (code) {
                        if (code === 0) {
                            onProgress === null || onProgress === void 0 ? void 0 : onProgress('Cookie 保存成功！');
                            resolve(true);
                        }
                        else {
                            onProgress === null || onProgress === void 0 ? void 0 : onProgress('Cookie 获取失败');
                            resolve(false);
                        }
                    });
                    proc.on('error', function () { return resolve(false); });
                })];
        });
    });
}
