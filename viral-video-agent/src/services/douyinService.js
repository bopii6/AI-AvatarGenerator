/**
 * 抖音视频下载服务 - Playwright 版本
 * 使用真实浏览器绕过反爬虫，无需 Cookie
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
import { chromium } from 'playwright';
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
var browser = null;
/**
 * 获取或创建浏览器实例
 */
function getBrowser() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!!browser) return [3 /*break*/, 2];
                    console.log('[Douyin] 启动浏览器...');
                    return [4 /*yield*/, chromium.launch({
                            headless: false, // 显示浏览器窗口，方便调试
                            slowMo: 100, // 稍微慢一点，更容易观察
                        })];
                case 1:
                    browser = _a.sent();
                    _a.label = 2;
                case 2: return [2 /*return*/, browser];
            }
        });
    });
}
/**
 * 关闭浏览器
 */
export function closeBrowser() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!browser) return [3 /*break*/, 2];
                    return [4 /*yield*/, browser.close()];
                case 1:
                    _a.sent();
                    browser = null;
                    _a.label = 2;
                case 2: return [2 /*return*/];
            }
        });
    });
}
/**
 * 从分享链接获取 modal_id
 */
function getModalIdFromShareLink(shareLink) {
    return __awaiter(this, void 0, void 0, function () {
        var pattern, match, shortUrl;
        return __generator(this, function (_a) {
            pattern = /(https?:\/\/v\.douyin\.com\/[\w\-]+)/;
            match = shareLink.match(pattern);
            if (!match) {
                console.log('[Douyin] 无效的分享链接格式');
                return [2 /*return*/, null];
            }
            shortUrl = match[1];
            console.log('[Douyin] 提取到短链接:', shortUrl);
            // 使用简单 HTTP 请求获取重定向（这一步不需要浏览器）
            return [2 /*return*/, new Promise(function (resolve) {
                    https.get(shortUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        },
                    }, function (response) {
                        if (response.statusCode === 301 || response.statusCode === 302) {
                            var location_1 = response.headers.location;
                            if (location_1) {
                                var modalMatch = location_1.match(/video\/(\d+)/);
                                if (modalMatch) {
                                    console.log('[Douyin] 从重定向提取到 modal_id:', modalMatch[1]);
                                    resolve(modalMatch[1]);
                                    return;
                                }
                            }
                        }
                        var data = '';
                        response.on('data', function (chunk) { return data += chunk; });
                        response.on('end', function () {
                            var modalMatch = data.match(/video\/(\d+)/);
                            resolve(modalMatch ? modalMatch[1] : null);
                        });
                    }).on('error', function () { return resolve(null); });
                })];
        });
    });
}
/**
 * 使用 Playwright 获取视频信息
 */
function getVideoInfoWithBrowser(modalId) {
    return __awaiter(this, void 0, void 0, function () {
        var url, page, browserInstance, cookie, context, cookies, videoUrls_1, title, videoUrl, videoInfo, error_1;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    url = "https://www.douyin.com/video/".concat(modalId);
                    console.log('[Douyin] 使用浏览器请求:', url);
                    page = null;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 15, 16, 19]);
                    return [4 /*yield*/, getBrowser()
                        // 创建带 Cookie 的上下文
                    ];
                case 2:
                    browserInstance = _a.sent();
                    cookie = process.env.DOUYIN_COOKIE;
                    return [4 /*yield*/, browserInstance.newContext({
                            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                        })
                        // 如果有 Cookie，设置到浏览器
                    ];
                case 3:
                    context = _a.sent();
                    if (!cookie) return [3 /*break*/, 5];
                    console.log('[Douyin] 设置 Cookie 到浏览器...');
                    cookies = cookie.split(';').map(function (c) {
                        var _a = c.trim().split('='), name = _a[0], valueParts = _a.slice(1);
                        return {
                            name: name.trim(),
                            value: valueParts.join('='),
                            domain: '.douyin.com',
                            path: '/',
                        };
                    }).filter(function (c) { return c.name && c.value; });
                    return [4 /*yield*/, context.addCookies(cookies)];
                case 4:
                    _a.sent();
                    _a.label = 5;
                case 5:
                    videoUrls_1 = [];
                    return [4 /*yield*/, context.newPage()];
                case 6:
                    page = _a.sent();
                    return [4 /*yield*/, page.setViewportSize({ width: 1280, height: 720 })]; // 设置 viewport
                case 7:
                    _a.sent(); // 设置 viewport
                    page.on('response', function (response) { return __awaiter(_this, void 0, void 0, function () {
                        var url;
                        return __generator(this, function (_a) {
                            url = response.url();
                            // 只捕获真正的视频内容，排除广告和静态资源
                            // douyinvod = 真正的视频内容
                            // douyinstatic = 静态资源/广告，需要排除
                            if ((url.includes('douyinvod') || url.includes('v26-web') || url.includes('v3-web')
                                || url.includes('v9-web') || url.includes('v11-web') || url.includes('bytevcloudcdn'))
                                && !url.includes('douyinstatic') // 排除静态资源/广告
                                && !url.includes('uuu_265') // 排除抖音默认广告视频
                                && !url.includes('.m4s') && !url.includes('.jpg') && !url.includes('.png')) {
                                console.log('[Douyin] 捕获到内容视频:', url.substring(0, 100) + '...');
                                videoUrls_1.push(url);
                            }
                            return [2 /*return*/];
                        });
                    }); });
                    // 访问页面
                    return [4 /*yield*/, page.goto(url, {
                            waitUntil: 'domcontentloaded',
                            timeout: 60000
                        })
                        // 等待页面加载和视频开始播放
                    ];
                case 8:
                    // 访问页面
                    _a.sent();
                    // 等待页面加载和视频开始播放
                    console.log('[Douyin] 等待页面加载和视频播放...');
                    return [4 /*yield*/, page.waitForTimeout(8000)
                        // 获取页面标题
                    ]; // 等待 8 秒
                case 9:
                    _a.sent(); // 等待 8 秒
                    return [4 /*yield*/, page.evaluate(function () {
                            var _a;
                            var titleEl = document.querySelector('[data-e2e="video-desc"]')
                                || document.querySelector('h1')
                                || document.querySelector('title');
                            return ((_a = titleEl === null || titleEl === void 0 ? void 0 : titleEl.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || '抖音视频';
                        })];
                case 10:
                    title = _a.sent();
                    console.log('[Douyin] 页面标题:', title);
                    console.log('[Douyin] 捕获到的视频 URL 数量:', videoUrls_1.length);
                    if (!(videoUrls_1.length > 0)) return [3 /*break*/, 12];
                    videoUrl = videoUrls_1[videoUrls_1.length - 1];
                    console.log('[Douyin] 成功获取视频地址!');
                    return [4 /*yield*/, page.close()];
                case 11:
                    _a.sent();
                    return [2 /*return*/, { videoUrl: videoUrl, title: title }];
                case 12:
                    // 备用方法：从页面 DOM 提取
                    console.log('[Douyin] 尝试从页面 DOM 提取...');
                    return [4 /*yield*/, page.evaluate(function () {
                            var _a, _b;
                            // 方法1：从 video 标签获取
                            var video = document.querySelector('video');
                            if (video && video.src && video.src.includes('http')) {
                                return {
                                    videoUrl: video.src,
                                    title: ((_a = document.querySelector('[data-e2e="video-desc"]')) === null || _a === void 0 ? void 0 : _a.textContent) || '抖音视频'
                                };
                            }
                            // 方法2：从 xg-video 获取
                            var xgVideo = document.querySelector('xg-video video, .xgplayer video');
                            if (xgVideo) {
                                var src = xgVideo.getAttribute('src');
                                if (src && src.includes('http')) {
                                    return {
                                        videoUrl: src,
                                        title: ((_b = document.querySelector('[data-e2e="video-desc"]')) === null || _b === void 0 ? void 0 : _b.textContent) || '抖音视频'
                                    };
                                }
                            }
                            return null;
                        })];
                case 13:
                    videoInfo = _a.sent();
                    return [4 /*yield*/, page.close()];
                case 14:
                    _a.sent();
                    if (videoInfo) {
                        console.log('[Douyin] 从 DOM 提取成功!');
                        return [2 /*return*/, videoInfo];
                    }
                    console.error('[Douyin] 无法获取视频信息，尝试的方法都失败了');
                    return [2 /*return*/, null];
                case 15:
                    error_1 = _a.sent();
                    console.error('[Douyin] 浏览器请求失败:', error_1);
                    return [2 /*return*/, null];
                case 16:
                    if (!page) return [3 /*break*/, 18];
                    return [4 /*yield*/, page.close()];
                case 17:
                    _a.sent();
                    _a.label = 18;
                case 18: return [7 /*endfinally*/];
                case 19: return [2 /*return*/];
            }
        });
    });
}
/**
 * 从分享链接获取视频信息
 */
export function parseDouyinUrl(shareUrl) {
    return __awaiter(this, void 0, void 0, function () {
        var modalId, videoInfo, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    console.log('[Douyin] 开始解析链接:', shareUrl);
                    return [4 /*yield*/, getModalIdFromShareLink(shareUrl)];
                case 1:
                    modalId = _a.sent();
                    if (!modalId) {
                        console.error('[Douyin] 无法获取 modal_id');
                        return [2 /*return*/, null];
                    }
                    return [4 /*yield*/, getVideoInfoWithBrowser(modalId)];
                case 2:
                    videoInfo = _a.sent();
                    if (!videoInfo) {
                        console.error('[Douyin] 无法获取视频信息');
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/, videoInfo];
                case 3:
                    error_2 = _a.sent();
                    console.error('[Douyin] 解析失败:', error_2);
                    return [2 /*return*/, null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/**
 * 下载视频文件
 */
function downloadVideo(videoUrl, outputPath, onProgress) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve) {
                    var protocol = videoUrl.startsWith('https') ? https : http;
                    var request = protocol.get(videoUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            'Referer': 'https://www.douyin.com/',
                        },
                    }, function (response) {
                        // 处理重定向
                        if (response.statusCode === 301 || response.statusCode === 302) {
                            var redirectUrl = response.headers.location;
                            if (redirectUrl) {
                                downloadVideo(redirectUrl, outputPath, onProgress).then(resolve);
                                return;
                            }
                        }
                        if (response.statusCode !== 200) {
                            console.error('[Douyin] 下载失败，状态码:', response.statusCode);
                            resolve(false);
                            return;
                        }
                        var totalSize = parseInt(response.headers['content-length'] || '0', 10);
                        var downloadedSize = 0;
                        // 确保目录存在
                        var dir = path.dirname(outputPath);
                        if (!fs.existsSync(dir)) {
                            fs.mkdirSync(dir, { recursive: true });
                        }
                        var file = fs.createWriteStream(outputPath);
                        response.on('data', function (chunk) {
                            downloadedSize += chunk.length;
                            if (totalSize > 0) {
                                onProgress === null || onProgress === void 0 ? void 0 : onProgress((downloadedSize / totalSize) * 100);
                            }
                        });
                        response.pipe(file);
                        file.on('finish', function () {
                            file.close();
                            console.log('[Douyin] 下载完成:', outputPath);
                            resolve(true);
                        });
                        file.on('error', function (e) {
                            console.error('[Douyin] 写入文件失败:', e);
                            fs.unlink(outputPath, function () { });
                            resolve(false);
                        });
                    });
                    request.on('error', function (e) {
                        console.error('[Douyin] 下载请求失败:', e);
                        resolve(false);
                    });
                    request.setTimeout(120000, function () {
                        request.destroy();
                        resolve(false);
                    });
                })];
        });
    });
}
/**
 * 清理文件名
 */
function sanitizeFilename(title) {
    return title
        .replace(/[<>:"/\\|?*\n\r]/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 50) || 'video';
}
/**
 * 完整的下载流程
 */
export function downloadDouyinVideo(shareLink, outputDir, onProgress) {
    return __awaiter(this, void 0, void 0, function () {
        var videoInfo, filename, outputPath, success, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(5, '解析分享链接...');
                    return [4 /*yield*/, parseDouyinUrl(shareLink)];
                case 1:
                    videoInfo = _a.sent();
                    if (!videoInfo) {
                        return [2 /*return*/, { success: false, error: '无法解析视频链接' }];
                    }
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(30, "\u83B7\u53D6\u5230\u89C6\u9891: ".concat(videoInfo.title));
                    filename = "".concat(sanitizeFilename(videoInfo.title), "_").concat(Date.now(), ".mp4");
                    outputPath = path.join(outputDir, filename);
                    if (!fs.existsSync(outputDir)) {
                        fs.mkdirSync(outputDir, { recursive: true });
                    }
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(40, '开始下载视频...');
                    return [4 /*yield*/, downloadVideo(videoInfo.videoUrl, outputPath, function (percent) {
                            onProgress === null || onProgress === void 0 ? void 0 : onProgress(40 + percent * 0.6, "\u4E0B\u8F7D\u4E2D: ".concat(percent.toFixed(1), "%"));
                        })];
                case 2:
                    success = _a.sent();
                    if (!success) {
                        return [2 /*return*/, { success: false, error: '视频下载失败' }];
                    }
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(100, '下载完成！');
                    return [2 /*return*/, {
                            success: true,
                            videoPath: outputPath,
                            title: videoInfo.title,
                        }];
                case 3:
                    error_3 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_3.message }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
