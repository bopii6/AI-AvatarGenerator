/**
 * 云端 GPU 数字人服务
 *
 * 连接远程 GPU 服务器（腾讯云/阿里云等），使用 Duix Avatar 生成数字人视频。
 * 用户只需：
 *   1. 上传形象视频（本地文件）
 *   2. 上传/录制音频
 *   3. 调用生成接口
 *
 * GitHub: https://github.com/duixcom/Duix-Avatar
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
import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { replaceAudioTrack } from './ffmpegService';
var DEFAULT_DOWNLOAD_TIMEOUT_MS = (function () {
    var raw = (process.env.CLOUD_GPU_DOWNLOAD_TIMEOUT_MS || '').trim();
    var parsed = raw && /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 30 * 60 * 1000; // 30 分钟
})();
var DEFAULT_QUERY_TIMEOUT_MS = (function () {
    var raw = (process.env.CLOUD_GPU_QUERY_TIMEOUT_MS || '').trim();
    var parsed = raw && /^\d+$/.test(raw) ? parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 120 * 1000; // 120 秒（跨境/弱网更稳）
})();
// 动态导入 uuid 避免 CommonJS require 报错
function getUuidV4() {
    return __awaiter(this, void 0, void 0, function () {
        var v4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, new Function('return import("uuid")')()];
                case 1:
                    v4 = (_a.sent()).v4;
                    return [2 /*return*/, v4()];
            }
        });
    });
}
// ============================================
// 默认配置
// ============================================
var defaultConfig = {
    serverUrl: 'http://127.0.0.1', // 需要用户配置为实际的 GPU 服务器 IP
    videoPort: 8383,
    localDataPath: '', // 运行时设置
};
// ============================================
// HTTP 工具函数
// ============================================
/**
 * HTTP POST JSON 请求
 */
function postJSON(url_1, data_1) {
    return __awaiter(this, arguments, void 0, function (url, data, timeout, retryCount) {
        if (timeout === void 0) { timeout = 30000; }
        if (retryCount === void 0) { retryCount = 0; }
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    var urlObj = new URL(url);
                    var protocol = urlObj.protocol === 'https:' ? https : http;
                    var postData = JSON.stringify(data);
                    var req = protocol.request(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Content-Length': Buffer.byteLength(postData),
                        },
                        timeout: timeout,
                    }, function (res) {
                        var responseData = '';
                        res.on('data', function (chunk) { return responseData += chunk; });
                        res.on('end', function () {
                            // 503 = 服务切换中，自动重试（最多等待 2 分钟）
                            if (res.statusCode === 503 && retryCount < 12) {
                                console.log("[cloudGpuService] Service switching, retry in 10s... (".concat(retryCount + 1, "/12)"));
                                setTimeout(function () {
                                    postJSON(url, data, timeout, retryCount + 1).then(resolve).catch(reject);
                                }, 10000);
                                return;
                            }
                            try {
                                resolve(JSON.parse(responseData));
                            }
                            catch (_a) {
                                resolve(responseData);
                            }
                        });
                    });
                    req.on('timeout', function () {
                        req.destroy();
                        reject(new Error('请求超时'));
                    });
                    req.on('error', reject);
                    req.write(postData);
                    req.end();
                })];
        });
    });
}
/**
 * HTTP GET 请求
 */
function getJSON(url_1) {
    return __awaiter(this, arguments, void 0, function (url, timeout, retryCount) {
        if (timeout === void 0) { timeout = 30000; }
        if (retryCount === void 0) { retryCount = 0; }
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    var urlObj = new URL(url);
                    var protocol = urlObj.protocol === 'https:' ? https : http;
                    var req = protocol.get(url, { timeout: timeout }, function (res) {
                        var data = '';
                        res.on('data', function (chunk) { return data += chunk; });
                        res.on('end', function () {
                            // 503 = 服务切换中，自动重试（最多等待 2 分钟）
                            if (res.statusCode === 503 && retryCount < 12) {
                                console.log("[cloudGpuService] Service switching, retry in 10s... (".concat(retryCount + 1, "/12)"));
                                setTimeout(function () {
                                    getJSON(url, timeout, retryCount + 1).then(resolve).catch(reject);
                                }, 10000);
                                return;
                            }
                            try {
                                resolve(JSON.parse(data));
                            }
                            catch (_a) {
                                resolve(data);
                            }
                        });
                    });
                    req.on('timeout', function () {
                        req.destroy();
                        reject(new Error('请求超时'));
                    });
                    req.on('error', reject);
                })];
        });
    });
}
/**
 * 上传文件到服务器
 */
function uploadFile(url_1, filePath_1) {
    return __awaiter(this, arguments, void 0, function (url, filePath, fieldName, onProgress, remoteFileName, retryCount) {
        if (fieldName === void 0) { fieldName = 'file'; }
        if (retryCount === void 0) { retryCount = 0; }
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    var fileSize = fs.statSync(filePath).size;
                    var fileName = remoteFileName || path.basename(filePath);
                    var urlObj = new URL(url);
                    var protocol = urlObj.protocol === 'https:' ? https : http;
                    // 构建 multipart/form-data
                    var boundary = "----FormBoundary".concat(Date.now());
                    var header = "--".concat(boundary, "\r\nContent-Disposition: form-data; name=\"").concat(fieldName, "\"; filename=\"").concat(fileName, "\"\r\nContent-Type: application/octet-stream\r\n\r\n");
                    var footer = "\r\n--".concat(boundary, "--\r\n");
                    var settled = false;
                    var safeResolve = function (value) {
                        if (settled)
                            return;
                        settled = true;
                        resolve(value);
                    };
                    var safeReject = function (error) {
                        if (settled)
                            return;
                        settled = true;
                        reject(error);
                    };
                    var req = protocol.request(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': "multipart/form-data; boundary=".concat(boundary),
                            'Content-Length': Buffer.byteLength(header) + fileSize + Buffer.byteLength(footer),
                        },
                        timeout: 300000, // 5 分钟，避免大文件上传卡死
                    }, function (res) {
                        var data = '';
                        res.on('data', function (chunk) { return data += chunk; });
                        res.on('end', function () {
                            var statusCode = res.statusCode || 0;
                            // 503 = 服务切换中，自动重试（最多等 2 分钟）
                            if (statusCode === 503 && retryCount < 12) {
                                console.log("[cloudGpuService] Service switching (upload), retry in 10s... (".concat(retryCount + 1, "/12)"));
                                setTimeout(function () {
                                    uploadFile(url, filePath, fieldName, onProgress, remoteFileName, retryCount + 1).then(safeResolve).catch(safeReject);
                                }, 10000);
                                return;
                            }
                            if (statusCode < 200 || statusCode >= 300) {
                                var snippet = (data || '').toString().slice(0, 200);
                                safeReject(new Error("\u4E0A\u4F20\u5931\u8D25 (HTTP ".concat(statusCode, ") ").concat(snippet ? ": ".concat(snippet) : '')));
                                return;
                            }
                            try {
                                safeResolve(JSON.parse(data));
                            }
                            catch (_a) {
                                safeResolve(data);
                            }
                        });
                    });
                    req.on('timeout', function () {
                        req.destroy();
                        safeReject(new Error('请求超时'));
                    });
                    req.on('error', function (err) { return safeReject(err); });
                    // 写入 header
                    req.write(header);
                    // 流式写入文件
                    var fileStream = fs.createReadStream(filePath);
                    var uploaded = 0;
                    fileStream.on('data', function (chunk) {
                        uploaded += Buffer.isBuffer(chunk) ? chunk.length : chunk.length;
                        onProgress === null || onProgress === void 0 ? void 0 : onProgress(Math.round(uploaded / fileSize * 100));
                    });
                    fileStream.on('end', function () {
                        req.write(footer);
                        req.end();
                    });
                    fileStream.on('error', function (err) {
                        req.destroy();
                        safeReject(err);
                    });
                    fileStream.pipe(req, { end: false });
                })];
        });
    });
}
/**
 * 下载文件
 */
function downloadFile(url_1, outputPath_1, onProgress_1) {
    return __awaiter(this, arguments, void 0, function (url, outputPath, onProgress, timeoutMs) {
        var maxRetries, baseDelayMs, _loop_1, attempt, state_1;
        if (timeoutMs === void 0) { timeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    maxRetries = 6;
                    baseDelayMs = 1500;
                    _loop_1 = function (attempt) {
                        var e_1, msg, isLast, delay_1;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    _b.trys.push([0, 2, , 4]);
                                    return [4 /*yield*/, downloadFileOnceWithResume(url, outputPath, onProgress, timeoutMs)];
                                case 1:
                                    _b.sent();
                                    return [2 /*return*/, { value: void 0 }];
                                case 2:
                                    e_1 = _b.sent();
                                    msg = (e_1 === null || e_1 === void 0 ? void 0 : e_1.message) || String(e_1);
                                    isLast = attempt === maxRetries;
                                    console.warn("[CloudGPU] \u4E0B\u8F7D\u5931\u8D25\uFF0C\u51C6\u5907\u91CD\u8BD5 (".concat(attempt, "/").concat(maxRetries, "):"), msg);
                                    if (isLast)
                                        throw e_1;
                                    delay_1 = Math.min(baseDelayMs * attempt, 8000);
                                    return [4 /*yield*/, new Promise(function (r) { return setTimeout(r, delay_1); })];
                                case 3:
                                    _b.sent();
                                    return [3 /*break*/, 4];
                                case 4: return [2 /*return*/];
                            }
                        });
                    };
                    attempt = 1;
                    _a.label = 1;
                case 1:
                    if (!(attempt <= maxRetries)) return [3 /*break*/, 4];
                    return [5 /*yield**/, _loop_1(attempt)];
                case 2:
                    state_1 = _a.sent();
                    if (typeof state_1 === "object")
                        return [2 /*return*/, state_1.value];
                    _a.label = 3;
                case 3:
                    attempt++;
                    return [3 /*break*/, 1];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function downloadFileOnceWithResume(url_1, outputPath_1, onProgress_1) {
    return __awaiter(this, arguments, void 0, function (url, outputPath, onProgress, timeoutMs) {
        if (timeoutMs === void 0) { timeoutMs = DEFAULT_DOWNLOAD_TIMEOUT_MS; }
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    var protocol = url.startsWith('https') ? https : http;
                    var settled = false;
                    var safeReject = function (err) {
                        if (settled)
                            return;
                        settled = true;
                        reject(err);
                    };
                    var safeResolve = function () {
                        if (settled)
                            return;
                        settled = true;
                        resolve();
                    };
                    var existingBytes = fs.existsSync(outputPath) ? fs.statSync(outputPath).size : 0;
                    var headers = {};
                    if (existingBytes > 0)
                        headers['Range'] = "bytes=".concat(existingBytes, "-");
                    var req = protocol.get(url, { headers: headers }, function (response) {
                        // 处理重定向
                        if (response.statusCode === 301 || response.statusCode === 302) {
                            var redirectUrl = response.headers.location;
                            response.resume();
                            if (redirectUrl) {
                                downloadFileOnceWithResume(redirectUrl, outputPath, onProgress, timeoutMs).then(safeResolve).catch(safeReject);
                            }
                            else {
                                safeReject(new Error('重定向缺少 Location'));
                            }
                            return;
                        }
                        var statusCode = response.statusCode || 0;
                        var isPartial = statusCode === 206;
                        var isOk = statusCode >= 200 && statusCode < 300;
                        if (!isOk) {
                            response.resume();
                            safeReject(new Error("Download failed (HTTP ".concat(statusCode, ")")));
                            return;
                        }
                        // 如果本地有部分文件，但服务端不支持 Range，会返回 200；此时重新下载
                        if (existingBytes > 0 && !isPartial) {
                            response.resume();
                            try {
                                fs.unlinkSync(outputPath);
                            }
                            catch ( /* ignore */_a) { /* ignore */ }
                            downloadFileOnceWithResume(url, outputPath, onProgress, timeoutMs).then(safeResolve).catch(safeReject);
                            return;
                        }
                        var totalSize = parseInt(response.headers['content-length'] || '0', 10);
                        var contentRange = response.headers['content-range'];
                        if (contentRange) {
                            var m = String(contentRange).match(/\/(\d+)\s*$/);
                            if (m)
                                totalSize = parseInt(m[1], 10);
                        }
                        else if (existingBytes > 0 && totalSize > 0) {
                            totalSize = existingBytes + totalSize;
                        }
                        var downloaded = existingBytes;
                        var file = fs.createWriteStream(outputPath, { flags: existingBytes > 0 ? 'a' : 'w' });
                        file.on('error', function (err) {
                            try {
                                response.destroy();
                            }
                            catch ( /* ignore */_a) { /* ignore */ }
                            safeReject(err);
                        });
                        response.on('aborted', function () { return safeReject(new Error('下载连接被中断')); });
                        response.on('error', function (err) { return safeReject(err); });
                        response.on('data', function (chunk) {
                            downloaded += typeof chunk === 'string' ? chunk.length : chunk.length;
                            if (totalSize > 0)
                                onProgress === null || onProgress === void 0 ? void 0 : onProgress(Math.max(0, Math.min(100, Math.round(downloaded / totalSize * 100))));
                        });
                        response.pipe(file);
                        file.on('finish', function () {
                            file.close(function () { return safeResolve(); });
                        });
                    });
                    req.setTimeout(timeoutMs, function () {
                        try {
                            req.destroy(new Error('下载超时'));
                        }
                        catch ( /* ignore */_a) { /* ignore */ }
                    });
                    req.on('error', function (err) { return safeReject(err); });
                })];
        });
    });
}
function uniqueStrings(items) {
    var out = [];
    var seen = new Set();
    for (var _i = 0, items_1 = items; _i < items_1.length; _i++) {
        var it = items_1[_i];
        var v = (it || '').trim();
        if (!v)
            continue;
        if (seen.has(v))
            continue;
        seen.add(v);
        out.push(v);
    }
    return out;
}
function posixBasename(p) {
    var s = (p || '').replace(/\\/g, '/');
    var parts = s.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : s;
}
function buildDownloadPathCandidates(serverPath) {
    var raw = (serverPath || '').trim().replace(/\\/g, '/');
    var noQuery = raw.split('#')[0].split('?')[0];
    var candidates = [];
    // 原始返回值
    candidates.push(raw);
    candidates.push(noQuery);
    // 去掉前缀后的相对路径
    if (noQuery.startsWith('/code/data/'))
        candidates.push(noQuery.slice('/code/data/'.length));
    if (noQuery.startsWith('code/data/'))
        candidates.push(noQuery.slice('code/data/'.length));
    if (noQuery.startsWith('/'))
        candidates.push(noQuery.slice(1));
    var base = posixBasename(noQuery);
    var baseLooksLikeFile = /\.[a-z0-9]+$/i.test(base);
    // 常见：Duix 返回 "/<uuid>-r.mp4"，但文件实际在 "/code/data/temp/<uuid>-r.mp4"
    if (baseLooksLikeFile) {
        candidates.push("temp/".concat(base));
        candidates.push("/temp/".concat(base));
        candidates.push("/code/data/temp/".concat(base));
        candidates.push("/code/data/".concat(base));
    }
    // 如果返回的是 "/xxx.mp4" 这种根路径，也尝试映射到 /code/data/temp
    if (noQuery.startsWith('/') && baseLooksLikeFile && !noQuery.startsWith('/code/data/')) {
        candidates.push("/code/data/temp".concat(noQuery));
    }
    return uniqueStrings(candidates);
}
function looksLikeFilePath(value) {
    if (typeof value !== 'string')
        return false;
    var v = value.trim();
    return v.length > 0 && /\.[a-z0-9]{2,6}$/i.test(v.split(/[?#]/)[0]);
}
function parseDuixQueryResult(taskCode, queryResult) {
    var _a, _b, _c, _d;
    var normalizedCode = (taskCode || '').trim();
    if (Array.isArray(queryResult)) {
        var entry = (_a = queryResult.find(function (row) { return Array.isArray(row) && String(row[0] || '').trim() === normalizedCode; })) !== null && _a !== void 0 ? _a : queryResult.find(function (row) { return Array.isArray(row) && row.length >= 2; });
        if (Array.isArray(entry)) {
            var s = String((_b = entry[1]) !== null && _b !== void 0 ? _b : '').trim();
            var v = entry[2];
            var lower = s.toLowerCase();
            if (['s', 'success', 'done', 'completed'].includes(lower)) {
                var url = looksLikeFilePath(v) ? String(v) : "/".concat(normalizedCode, "-r.mp4");
                return { taskStatus: s, resultUrl: url };
            }
            if (['f', 'fail', 'failed', 'error'].includes(lower)) {
                return { taskStatus: s, errorMessage: typeof v === 'string' ? v : '视频合成失败' };
            }
            var numeric = typeof v === 'number' ? v : (typeof v === 'string' ? Number(v) : NaN);
            if (!Number.isNaN(numeric)) {
                var pct = numeric <= 1 ? numeric * 100 : numeric;
                return { taskStatus: s, taskProgress: Math.max(0, Math.min(100, pct)) };
            }
            return { taskStatus: s };
        }
    }
    var payload = (queryResult && typeof queryResult === 'object' && queryResult.data && typeof queryResult.data === 'object')
        ? queryResult.data
        : queryResult;
    var taskProgress = (_c = payload === null || payload === void 0 ? void 0 : payload.progress) !== null && _c !== void 0 ? _c : queryResult.progress;
    var taskStatus = (_d = payload === null || payload === void 0 ? void 0 : payload.status) !== null && _d !== void 0 ? _d : queryResult.status;
    var resultUrl = (payload === null || payload === void 0 ? void 0 : payload.result) || (payload === null || payload === void 0 ? void 0 : payload.video_url) || (payload === null || payload === void 0 ? void 0 : payload.output_url) || queryResult.result || queryResult.video_url || queryResult.output_url;
    var errorMessage = (payload === null || payload === void 0 ? void 0 : payload.msg) || (payload === null || payload === void 0 ? void 0 : payload.message) || queryResult.msg || queryResult.message;
    return { taskProgress: taskProgress, taskStatus: taskStatus, resultUrl: resultUrl, errorMessage: errorMessage };
}
function downloadFromDuixFileApi(cfg, serverPath, outputPath, onProgress) {
    return __awaiter(this, void 0, void 0, function () {
        var candidates, lastError, _i, candidates_1, p, e_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    candidates = buildDownloadPathCandidates(serverPath);
                    _i = 0, candidates_1 = candidates;
                    _a.label = 1;
                case 1:
                    if (!(_i < candidates_1.length)) return [3 /*break*/, 6];
                    p = candidates_1[_i];
                    _a.label = 2;
                case 2:
                    _a.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, downloadFile("".concat(cfg.serverUrl, ":").concat(cfg.videoPort, "/download?path=").concat(encodeURIComponent(p)), outputPath, onProgress)];
                case 3:
                    _a.sent();
                    return [2 /*return*/];
                case 4:
                    e_2 = _a.sent();
                    lastError = e_2;
                    return [3 /*break*/, 5];
                case 5:
                    _i++;
                    return [3 /*break*/, 1];
                case 6: throw lastError || new Error("\u89C6\u9891\u751F\u6210\u5B8C\u6210\uFF0C\u4F46\u65E0\u6CD5\u4E0B\u8F7D\u3002\u670D\u52A1\u5668\u8DEF\u5F84: ".concat(serverPath));
            }
        });
    });
}
// ============================================
// 核心 API
// ============================================
/**
 * 检查云端 GPU 服务器状态
 */
export function checkCloudGpuStatus() {
    return __awaiter(this, arguments, void 0, function (config) {
        var cfg, error_1;
        if (config === void 0) { config = {}; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    cfg = __assign(__assign({}, defaultConfig), config);
                    if (!cfg.serverUrl || cfg.serverUrl === 'http://127.0.0.1') {
                        return [2 /*return*/, {
                                online: false,
                                message: '请先配置 GPU 服务器地址（CLOUD_GPU_SERVER_URL）',
                            }];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    // 测试连接
                    // 使用 30s 超时防止网络波动误报
                    return [4 /*yield*/, getJSON("".concat(cfg.serverUrl, ":").concat(cfg.videoPort, "/easy/query?code=health_check"), 30000)];
                case 2:
                    // 测试连接
                    // 使用 30s 超时防止网络波动误报
                    _a.sent();
                    return [2 /*return*/, {
                            online: true,
                            message: '服务器已连接',
                        }];
                case 3:
                    error_1 = _a.sent();
                    return [2 /*return*/, {
                            online: false,
                            message: "\u65E0\u6CD5\u8FDE\u63A5\u670D\u52A1\u5668: ".concat(error_1.message),
                        }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * 上传形象视频到服务器
 *
 * 注意：Duix Avatar 需要视频存放在服务器的 /code/data 目录
 */
export function uploadAvatarVideo(config, localVideoPath, avatarName, onProgress, modelId) {
    return __awaiter(this, void 0, void 0, function () {
        var cfg, finalModelId, _a, ext, remoteFileName, uploadResult, remoteVideoPath, model, modelsDir, error_2;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    cfg = __assign(__assign({}, defaultConfig), config);
                    // 检查文件存在
                    if (!fs.existsSync(localVideoPath)) {
                        throw new Error("\u89C6\u9891\u6587\u4EF6\u4E0D\u5B58\u5728: ".concat(localVideoPath));
                    }
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(10, '正在上传形象视频...');
                    _a = modelId;
                    if (_a) return [3 /*break*/, 2];
                    return [4 /*yield*/, getUuidV4()];
                case 1:
                    _a = (_b.sent());
                    _b.label = 2;
                case 2:
                    finalModelId = _a;
                    ext = path.extname(localVideoPath);
                    remoteFileName = "avatar_".concat(finalModelId).concat(ext);
                    _b.label = 3;
                case 3:
                    _b.trys.push([3, 5, , 6]);
                    return [4 /*yield*/, uploadFile("".concat(cfg.serverUrl, ":").concat(cfg.videoPort, "/upload"), localVideoPath, 'video', function (percent) {
                            onProgress === null || onProgress === void 0 ? void 0 : onProgress(10 + percent * 0.6, "\u4E0A\u4F20\u4E2D ".concat(percent, "%"));
                        }, remoteFileName)];
                case 4:
                    uploadResult = _b.sent();
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(80, '上传完成，正在保存形象信息...');
                    remoteVideoPath = (uploadResult === null || uploadResult === void 0 ? void 0 : uploadResult.path) || (uploadResult === null || uploadResult === void 0 ? void 0 : uploadResult.video_path) || "/code/data/".concat(remoteFileName);
                    model = {
                        id: finalModelId,
                        name: avatarName,
                        remoteVideoPath: remoteVideoPath,
                        localPreviewPath: localVideoPath,
                        createdAt: new Date(),
                    };
                    modelsDir = path.join(cfg.localDataPath, 'cloud_avatars');
                    if (!fs.existsSync(modelsDir)) {
                        fs.mkdirSync(modelsDir, { recursive: true });
                    }
                    fs.writeFileSync(path.join(modelsDir, "".concat(finalModelId, ".json")), JSON.stringify(model, null, 2));
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(100, '形象保存成功！');
                    return [2 /*return*/, model];
                case 5:
                    error_2 = _b.sent();
                    // 如果上传接口不存在，尝试直接使用本地路径方案
                    // 某些部署模式下，视频是通过挂载目录共享的
                    console.warn('上传接口调用失败，尝试使用本地路径模式:', error_2.message);
                    // 假设视频需要手动获得服务器上的路径
                    throw new Error("\u4E0A\u4F20\u5931\u8D25: ".concat(error_2.message, "\u3002\u8BF7\u786E\u8BA4\u670D\u52A1\u5668\u652F\u6301\u6587\u4EF6\u4E0A\u4F20\uFF0C\u6216\u5C06\u89C6\u9891\u624B\u52A8\u653E\u5230\u670D\u52A1\u5668\u7684 /code/data \u76EE\u5F55\u3002"));
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * 获取已保存的云端形象列表
 */
export function getCloudAvatarModels(config) {
    if (config === void 0) { config = {}; }
    var cfg = __assign(__assign({}, defaultConfig), config);
    var modelsDir = path.join(cfg.localDataPath, 'cloud_avatars');
    if (!fs.existsSync(modelsDir)) {
        return [];
    }
    var models = [];
    var files = fs.readdirSync(modelsDir).filter(function (f) { return f.endsWith('.json'); });
    for (var _i = 0, files_1 = files; _i < files_1.length; _i++) {
        var file = files_1[_i];
        try {
            var content = fs.readFileSync(path.join(modelsDir, file), 'utf-8');
            models.push(JSON.parse(content));
        }
        catch (_a) {
            // 忽略损坏的文件
        }
    }
    return models.sort(function (a, b) {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
}
/**
 * 删除云端形象记录
 */
export function deleteCloudAvatarModel(config, modelId) {
    var cfg = __assign(__assign({}, defaultConfig), config);
    var modelPath = path.join(cfg.localDataPath, 'cloud_avatars', "".concat(modelId, ".json"));
    if (fs.existsSync(modelPath)) {
        fs.unlinkSync(modelPath);
        return true;
    }
    return false;
}
/**
 * 生成数字人视频
 *
 * 核心流程：
 *   1. 将音频上传到服务器（或使用共享目录）
 *   2. 调用 /easy/submit 提交视频合成任务
 *   3. 轮询 /easy/query 获取进度
 *   4. 下载生成的视频
 */
export function generateCloudVideo(config, model, audioPath, onProgress) {
    return __awaiter(this, void 0, void 0, function () {
        var cfg, taskCode, remoteAudioPath, audioExt, remoteAudioFileName, uploadResult, error_3, submitResult, maxAttempts, pollInterval, i, queryResult, error_4, parsed, taskProgress, taskStatus, resultUrl, videoUrl, outputDir, outputPath, _a, directPath, _b, muxedPath, e_3, estimatedProgress, progressPercent;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    cfg = __assign(__assign({}, defaultConfig), config);
                    // 检查音频文件
                    if (!fs.existsSync(audioPath)) {
                        throw new Error("\u97F3\u9891\u6587\u4EF6\u4E0D\u5B58\u5728: ".concat(audioPath));
                    }
                    return [4 /*yield*/, getUuidV4()];
                case 1:
                    taskCode = _c.sent();
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(5, '正在上传音频到服务器...');
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 4, , 5]);
                    audioExt = path.extname(audioPath) || '.wav';
                    remoteAudioFileName = "audio_".concat(taskCode).concat(audioExt);
                    return [4 /*yield*/, uploadFile("".concat(cfg.serverUrl, ":").concat(cfg.videoPort, "/upload"), audioPath, 'audio', function (percent) {
                            onProgress === null || onProgress === void 0 ? void 0 : onProgress(5 + percent * 0.1, "\u4E0A\u4F20\u97F3\u9891 ".concat(percent, "%"));
                        }, remoteAudioFileName)];
                case 3:
                    uploadResult = _c.sent();
                    remoteAudioPath = (uploadResult === null || uploadResult === void 0 ? void 0 : uploadResult.path) || (uploadResult === null || uploadResult === void 0 ? void 0 : uploadResult.audio_path) || "/code/data/".concat(remoteAudioFileName);
                    return [3 /*break*/, 5];
                case 4:
                    error_3 = _c.sent();
                    // 远程云端场景下，本地路径无法被服务端容器访问；这里直接给出更明确的错误提示
                    throw new Error("\u97F3\u9891\u4E0A\u4F20\u5931\u8D25\uFF1A".concat((error_3 === null || error_3 === void 0 ? void 0 : error_3.message) || '未知错误', "\u3002\u8BF7\u786E\u8BA4\u670D\u52A1\u7AEF\u63D0\u4F9B /upload \u63A5\u53E3\uFF0C\u6216\u5C06\u97F3\u9891\u6587\u4EF6\u653E\u5165\u670D\u52A1\u7AEF\u5BB9\u5668\u53EF\u8BBF\u95EE\u7684 /code/data \u76EE\u5F55\u3002"));
                case 5:
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(20, '正在提交视频合成任务...');
                    return [4 /*yield*/, postJSON("".concat(cfg.serverUrl, ":").concat(cfg.videoPort, "/easy/submit"), {
                            audio_url: remoteAudioPath,
                            video_url: model.remoteVideoPath,
                            code: taskCode,
                            chaofen: 0, // 超分辨率，0 关闭
                            watermark_switch: 0, // 水印，0 关闭
                            pn: 1, // 固定值
                        })
                        // 检查提交结果
                    ];
                case 6:
                    submitResult = _c.sent();
                    // 检查提交结果
                    if (submitResult.code !== undefined && submitResult.code !== 0 && submitResult.code !== 200 && submitResult.code !== 10000) {
                        throw new Error(submitResult.msg || submitResult.message || '提交任务失败');
                    }
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(25, '任务已提交，正在合成视频...');
                    maxAttempts = 180 // 最多等待 15 分钟
                    ;
                    pollInterval = 5000 // 5 秒轮询一次
                    ;
                    i = 0;
                    _c.label = 7;
                case 7:
                    if (!(i < maxAttempts)) return [3 /*break*/, 27];
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, pollInterval); })];
                case 8:
                    _c.sent();
                    queryResult = void 0;
                    _c.label = 9;
                case 9:
                    _c.trys.push([9, 11, , 12]);
                    return [4 /*yield*/, getJSON("".concat(cfg.serverUrl, ":").concat(cfg.videoPort, "/easy/query?code=").concat(taskCode), DEFAULT_QUERY_TIMEOUT_MS)];
                case 10:
                    queryResult = _c.sent();
                    return [3 /*break*/, 12];
                case 11:
                    error_4 = _c.sent();
                    // 网络错误，继续轮询
                    console.warn('查询进度失败，继续等待...', error_4.message);
                    return [3 /*break*/, 26];
                case 12:
                    parsed = parseDuixQueryResult(taskCode, queryResult);
                    taskProgress = parsed.taskProgress;
                    taskStatus = parsed.taskStatus;
                    resultUrl = parsed.resultUrl;
                    if (!(resultUrl || taskStatus === 2 || taskProgress === 100)) return [3 /*break*/, 25];
                    videoUrl = resultUrl || "/".concat(taskCode, "-r.mp4");
                    if (!videoUrl) return [3 /*break*/, 25];
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(90, '视频合成完成，正在下载...');
                    outputDir = path.join(cfg.localDataPath, 'generated_videos');
                    if (!fs.existsSync(outputDir)) {
                        fs.mkdirSync(outputDir, { recursive: true });
                    }
                    outputPath = path.join(outputDir, "digital_human_".concat(Date.now(), ".mp4"));
                    if (!videoUrl.startsWith('http')) return [3 /*break*/, 14];
                    return [4 /*yield*/, downloadFile(videoUrl, outputPath, function (percent) {
                            onProgress === null || onProgress === void 0 ? void 0 : onProgress(90 + percent * 0.1, "\u4E0B\u8F7D\u89C6\u9891 ".concat(percent, "%"));
                        })];
                case 13:
                    _c.sent();
                    return [3 /*break*/, 21];
                case 14:
                    _c.trys.push([14, 16, , 21]);
                    return [4 /*yield*/, downloadFromDuixFileApi(cfg, videoUrl, outputPath, function (percent) {
                            onProgress === null || onProgress === void 0 ? void 0 : onProgress(90 + percent * 0.1, "\u4E0B\u8F7D\u89C6\u9891 ".concat(percent, "%"));
                        })];
                case 15:
                    _c.sent();
                    return [3 /*break*/, 21];
                case 16:
                    _a = _c.sent();
                    _c.label = 17;
                case 17:
                    _c.trys.push([17, 19, , 20]);
                    directPath = videoUrl.startsWith('/') ? videoUrl : "/".concat(videoUrl);
                    return [4 /*yield*/, downloadFile("".concat(cfg.serverUrl, ":").concat(cfg.videoPort).concat(directPath), outputPath)];
                case 18:
                    _c.sent();
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(100, '完成');
                    return [2 /*return*/, outputPath];
                case 19:
                    _b = _c.sent();
                    return [3 /*break*/, 20];
                case 20:
                    if (fs.existsSync(videoUrl)) {
                        fs.copyFileSync(videoUrl, outputPath);
                    }
                    else {
                        throw new Error("\u89C6\u9891\u751F\u6210\u5B8C\u6210\uFF0C\u4F46\u65E0\u6CD5\u4E0B\u8F7D\u3002\u670D\u52A1\u5668\u8DEF\u5F84: ".concat(videoUrl));
                    }
                    return [3 /*break*/, 21];
                case 21:
                    _c.trys.push([21, 23, , 24]);
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(98, '正在合并音频...');
                    muxedPath = outputPath.replace(/\.mp4$/i, '_with_audio.mp4');
                    return [4 /*yield*/, replaceAudioTrack(outputPath, audioPath, muxedPath)];
                case 22:
                    _c.sent();
                    try {
                        fs.unlinkSync(outputPath);
                    }
                    catch (_d) {
                        // ignore
                    }
                    fs.renameSync(muxedPath, outputPath);
                    return [3 /*break*/, 24];
                case 23:
                    e_3 = _c.sent();
                    console.warn('合并音频失败，返回原视频:', (e_3 === null || e_3 === void 0 ? void 0 : e_3.message) || e_3);
                    return [3 /*break*/, 24];
                case 24:
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(100, '完成！');
                    return [2 /*return*/, outputPath];
                case 25:
                    // 检查失败状态
                    if (queryResult.code === -1 ||
                        queryResult.status === 'failed' ||
                        taskStatus === 3 ||
                        (typeof taskStatus === 'string' && ['f', 'fail', 'failed', 'error'].includes(taskStatus.toLowerCase()))) {
                        throw new Error(parsed.errorMessage || queryResult.msg || queryResult.message || '视频合成失败');
                    }
                    estimatedProgress = Math.min(25 + (i / maxAttempts) * 60, 85);
                    progressPercent = typeof taskProgress === 'number' ? taskProgress : estimatedProgress;
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(Math.round(progressPercent), "\u5408\u6210\u4E2D ".concat(Math.round(progressPercent), "%..."));
                    _c.label = 26;
                case 26:
                    i++;
                    return [3 /*break*/, 7];
                case 27: throw new Error('视频合成超时（超过 15 分钟），请检查服务器状态');
            }
        });
    });
}
/**
 * 使用本地路径模式生成视频
 *
 * 适用于服务器和客户端共享挂载目录的场景
 */
export function generateCloudVideoWithLocalPaths(config, avatarVideoPath, audioPath, onProgress) {
    return __awaiter(this, void 0, void 0, function () {
        var cfg, tempModel;
        return __generator(this, function (_a) {
            cfg = __assign(__assign({}, defaultConfig), config);
            tempModel = {
                id: 'temp',
                name: 'temp',
                remoteVideoPath: avatarVideoPath,
                createdAt: new Date(),
            };
            return [2 /*return*/, generateCloudVideo(cfg, tempModel, audioPath, onProgress)];
        });
    });
}
