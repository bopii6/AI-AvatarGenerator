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
import { app, safeStorage } from 'electron';
import { spawn } from 'child_process';
// eslint-disable-next-line @typescript-eslint/no-var-requires
var ffmpegPath = require('ffmpeg-static');
if (ffmpegPath.includes('app.asar') && !ffmpegPath.includes('app.asar.unpacked')) {
    ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
}
/**
 * 从本地存储读取抖音 Cookie
 * 优先级：本地存储 > 环境变量
 */
function loadDouyinCookieFromStore() {
    try {
        var cookieFile = path.join(app.getPath('userData'), 'publish_cookies.json');
        if (!fs.existsSync(cookieFile)) {
            console.log('[Douyin] 本地无 Cookie 存储，使用环境变量');
            return process.env.DOUYIN_COOKIE;
        }
        var entries = JSON.parse(fs.readFileSync(cookieFile, 'utf-8'));
        var douyinEntry = entries.find(function (e) { return e.platform === 'douyin'; });
        if (douyinEntry) {
            console.log('[Douyin] 从本地存储读取 Cookie（账号：' + douyinEntry.userName + '）');
            // 如果加密了需要解密
            if (douyinEntry.encrypted && safeStorage.isEncryptionAvailable()) {
                var buf = Buffer.from(douyinEntry.value, 'base64');
                var decrypted = safeStorage.decryptString(buf);
                // Cookie 存储的是 JSON 格式，需要转换为字符串格式
                try {
                    var cookies = JSON.parse(decrypted);
                    if (Array.isArray(cookies)) {
                        return cookies.map(function (c) { return "".concat(c.name, "=").concat(c.value); }).join('; ');
                    }
                }
                catch (_a) {
                    return decrypted;
                }
            }
            // 未加密的情况，可能是 JSON 或字符串
            try {
                var cookies = JSON.parse(douyinEntry.value);
                if (Array.isArray(cookies)) {
                    return cookies.map(function (c) { return "".concat(c.name, "=").concat(c.value); }).join('; ');
                }
            }
            catch (_b) {
                return douyinEntry.value;
            }
        }
    }
    catch (e) {
        console.log('[Douyin] 读取本地 Cookie 失败:', e);
    }
    console.log('[Douyin] 使用环境变量 Cookie');
    return process.env.DOUYIN_COOKIE;
}
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
        var directVideoPattern, directMatch, pattern, match, shortUrl;
        return __generator(this, function (_a) {
            directVideoPattern = /douyin\.com\/video\/(\d+)/;
            directMatch = shareLink.match(directVideoPattern);
            if (directMatch) {
                console.log('[Douyin] 从直接链接提取到 modal_id:', directMatch[1]);
                return [2 /*return*/, directMatch[1]];
            }
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
        var url, page, browserInstance, cookie, context, cookies, mp4Urls_1, dashVideoUrls_1, dashAudioUrls_1, title, mp4Url, dashVideoUrl, dashAudioUrl, videoInfo, error_1;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    url = "https://www.douyin.com/video/".concat(modalId);
                    console.log('[Douyin] 使用浏览器请求:', url);
                    page = null;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 17, 18, 21]);
                    return [4 /*yield*/, getBrowser()
                        // 创建带 Cookie 的上下文
                    ];
                case 2:
                    browserInstance = _a.sent();
                    cookie = loadDouyinCookieFromStore();
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
                    mp4Urls_1 = [];
                    dashVideoUrls_1 = [];
                    dashAudioUrls_1 = [];
                    return [4 /*yield*/, context.newPage()];
                case 6:
                    page = _a.sent();
                    return [4 /*yield*/, page.setViewportSize({ width: 1280, height: 720 })]; // 设置 viewport
                case 7:
                    _a.sent(); // 设置 viewport
                    page.on('response', function (response) { return __awaiter(_this, void 0, void 0, function () {
                        var url, looksLikeMediaHost, u, mimeType;
                        return __generator(this, function (_a) {
                            url = response.url();
                            if (!url)
                                return [2 /*return*/];
                            if (url.includes('douyinstatic') || url.includes('uuu_265') || url.includes('.jpg') || url.includes('.png'))
                                return [2 /*return*/];
                            looksLikeMediaHost = url.includes('douyinvod') ||
                                url.includes('bytevcloudcdn') ||
                                url.includes('v26-web') ||
                                url.includes('v3-web') ||
                                url.includes('v9-web') ||
                                url.includes('v11-web');
                            if (!looksLikeMediaHost)
                                return [2 /*return*/];
                            // 抖音经常返回 .m4s（DASH 分离流），也可能有 mp4（可能带音频也可能无音轨）
                            if (url.includes('.m4s')) {
                                try {
                                    u = new URL(url);
                                    mimeType = (u.searchParams.get('mime_type') || '').toLowerCase();
                                    if (mimeType.startsWith('audio'))
                                        dashAudioUrls_1.push(url);
                                    else
                                        dashVideoUrls_1.push(url);
                                }
                                catch (_b) {
                                    dashVideoUrls_1.push(url);
                                }
                                return [2 /*return*/];
                            }
                            if (url.includes('.mp4') || url.includes('mime_type=video_mp4')) {
                                mp4Urls_1.push(url);
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
                    console.log('[Douyin] 捕获到 mp4 URL 数量:', mp4Urls_1.length);
                    console.log('[Douyin] 捕获到 DASH video URL 数量:', dashVideoUrls_1.length);
                    console.log('[Douyin] 捕获到 DASH audio URL 数量:', dashAudioUrls_1.length);
                    if (!(mp4Urls_1.length > 0)) return [3 /*break*/, 12];
                    mp4Url = mp4Urls_1[mp4Urls_1.length - 1];
                    console.log('[Douyin] 成功获取 MP4 地址!');
                    return [4 /*yield*/, page.close()];
                case 11:
                    _a.sent();
                    return [2 /*return*/, { mp4Url: mp4Url, title: title, dashVideoUrl: dashVideoUrls_1.at(-1), dashAudioUrl: dashAudioUrls_1.at(-1) }];
                case 12:
                    if (!(dashVideoUrls_1.length > 0 && dashAudioUrls_1.length > 0)) return [3 /*break*/, 14];
                    dashVideoUrl = dashVideoUrls_1[dashVideoUrls_1.length - 1];
                    dashAudioUrl = dashAudioUrls_1[dashAudioUrls_1.length - 1];
                    console.log('[Douyin] 使用 DASH 分离流（video+audio）');
                    return [4 /*yield*/, page.close()];
                case 13:
                    _a.sent();
                    return [2 /*return*/, { dashVideoUrl: dashVideoUrl, dashAudioUrl: dashAudioUrl, title: title }];
                case 14:
                    // 备用方法：从页面 DOM 提取
                    console.log('[Douyin] 尝试从页面 DOM 提取...');
                    return [4 /*yield*/, page.evaluate(function () {
                            var _a, _b;
                            // 方法1：从 video 标签获取
                            var video = document.querySelector('video');
                            if (video && video.src && video.src.includes('http')) {
                                return {
                                    mp4Url: video.src,
                                    title: ((_a = document.querySelector('[data-e2e="video-desc"]')) === null || _a === void 0 ? void 0 : _a.textContent) || '抖音视频'
                                };
                            }
                            // 方法2：从 xg-video 获取
                            var xgVideo = document.querySelector('xg-video video, .xgplayer video');
                            if (xgVideo) {
                                var src = xgVideo.getAttribute('src');
                                if (src && src.includes('http')) {
                                    return {
                                        mp4Url: src,
                                        title: ((_b = document.querySelector('[data-e2e="video-desc"]')) === null || _b === void 0 ? void 0 : _b.textContent) || '抖音视频'
                                    };
                                }
                            }
                            return null;
                        })];
                case 15:
                    videoInfo = _a.sent();
                    return [4 /*yield*/, page.close()];
                case 16:
                    _a.sent();
                    if (videoInfo) {
                        console.log('[Douyin] 从 DOM 提取成功!');
                        return [2 /*return*/, videoInfo];
                    }
                    console.error('[Douyin] 无法获取视频信息，尝试的方法都失败了');
                    return [2 /*return*/, null];
                case 17:
                    error_1 = _a.sent();
                    console.error('[Douyin] 浏览器请求失败:', error_1);
                    return [2 /*return*/, null];
                case 18:
                    if (!page) return [3 /*break*/, 20];
                    return [4 /*yield*/, page.close()];
                case 19:
                    _a.sent();
                    _a.label = 20;
                case 20: return [7 /*endfinally*/];
                case 21: return [2 /*return*/];
            }
        });
    });
}
/**
 * 抓取博主主页最近的视频列表
 */
export function fetchProfileVideos(profileUrl_1) {
    return __awaiter(this, arguments, void 0, function (profileUrl, count) {
        var page, results, browserInstance, cookie, context, cookies, videos, error_2;
        if (count === void 0) { count = 10; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('[Douyin] 开始抓取主页视频:', profileUrl);
                    page = null;
                    results = [];
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 11, 12, 15]);
                    return [4 /*yield*/, getBrowser()];
                case 2:
                    browserInstance = _a.sent();
                    cookie = loadDouyinCookieFromStore();
                    return [4 /*yield*/, browserInstance.newContext({
                            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                        })];
                case 3:
                    context = _a.sent();
                    if (!cookie) return [3 /*break*/, 5];
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
                case 5: return [4 /*yield*/, context.newPage()];
                case 6:
                    page = _a.sent();
                    return [4 /*yield*/, page.setViewportSize({ width: 1280, height: 1000 })
                        // 访问主页
                    ];
                case 7:
                    _a.sent();
                    // 访问主页
                    return [4 /*yield*/, page.goto(profileUrl, {
                            waitUntil: 'domcontentloaded',
                            timeout: 60000
                        })
                        // 等待作品列表加载
                    ];
                case 8:
                    // 访问主页
                    _a.sent();
                    // 等待作品列表加载
                    console.log('[Douyin] 等待主页作品加载...');
                    return [4 /*yield*/, page.waitForTimeout(5000)
                        // 尝试解析视频列表
                        // 抖音 web 版中，视频项通常在 [data-e2e="user-post-list"] 下的 <li> 中
                    ];
                case 9:
                    _a.sent();
                    return [4 /*yield*/, page.evaluate(function (maxCount) {
                            var _a, _b, _c;
                            var list = [];
                            // 常见的视频项选择器
                            var items = document.querySelectorAll('li[data-e2e="user-post-list-item"], a[href*="/video/"]');
                            var _loop_1 = function (item) {
                                if (list.length >= maxCount)
                                    return "break";
                                var linkEl = (item.tagName === 'A' ? item : item.querySelector('a[href*="/video/"]'));
                                if (!linkEl)
                                    return "continue";
                                var href = linkEl.href;
                                var videoIdMatch = href.match(/video\/(\d+)/);
                                if (!videoIdMatch)
                                    return "continue";
                                var id = videoIdMatch[1];
                                var title = ((_a = item.querySelector('img')) === null || _a === void 0 ? void 0 : _a.alt) || ((_b = item.textContent) === null || _b === void 0 ? void 0 : _b.trim()) || '未命名视频';
                                var cover = ((_c = item.querySelector('img')) === null || _c === void 0 ? void 0 : _c.src) || '';
                                // 排除重复
                                if (!list.some(function (v) { return v.id === id; })) {
                                    list.push({
                                        id: id,
                                        url: href,
                                        title: title,
                                        cover: cover
                                    });
                                }
                            };
                            for (var _i = 0, _d = Array.from(items); _i < _d.length; _i++) {
                                var item = _d[_i];
                                var state_1 = _loop_1(item);
                                if (state_1 === "break")
                                    break;
                            }
                            return list;
                        }, count)];
                case 10:
                    videos = _a.sent();
                    console.log("[Douyin] \u6293\u53D6\u5B8C\u6210\uFF0C\u627E\u5230 ".concat(videos.length, " \u4E2A\u89C6\u9891"));
                    return [2 /*return*/, videos];
                case 11:
                    error_2 = _a.sent();
                    console.error('[Douyin] 抓取主页失败:', error_2);
                    return [2 /*return*/, []];
                case 12:
                    if (!page) return [3 /*break*/, 14];
                    return [4 /*yield*/, page.close()];
                case 13:
                    _a.sent();
                    _a.label = 14;
                case 14: return [7 /*endfinally*/];
                case 15: return [2 /*return*/];
            }
        });
    });
}
/**
 * 判断是否为主页链接
 */
export function isProfileUrl(url) {
    return url.includes('/user/') || (url.includes('douyin.com') && !url.includes('/video/'));
}
/**
 * 从分享链接获取视频信息
 */
export function parseDouyinUrl(shareUrl) {
    return __awaiter(this, void 0, void 0, function () {
        var modalId, videoInfo, error_3;
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
                    error_3 = _a.sent();
                    console.error('[Douyin] 解析失败:', error_3);
                    return [2 /*return*/, null];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function runFfmpeg(args) {
    return new Promise(function (resolve, reject) {
        var ffmpeg = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        var stderr = '';
        ffmpeg.stderr.on('data', function (data) {
            stderr += data.toString();
        });
        ffmpeg.on('close', function (code) {
            if (code === 0)
                resolve();
            else
                reject(new Error(stderr.length > 4000 ? stderr.slice(-4000) : stderr));
        });
        ffmpeg.on('error', reject);
    });
}
function hasAudioStream(mediaPath) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, new Promise(function (resolve, reject) {
                        var ffmpeg = spawn(ffmpegPath, ['-hide_banner', '-i', mediaPath], { stdio: ['ignore', 'pipe', 'pipe'] });
                        var stderr = '';
                        ffmpeg.stderr.on('data', function (data) {
                            stderr += data.toString();
                        });
                        ffmpeg.on('close', function () {
                            resolve(/Stream\s+#\d+:\d+.*Audio:/i.test(stderr) || /Audio:/i.test(stderr));
                        });
                        ffmpeg.on('error', reject);
                    })];
                case 1: return [2 /*return*/, _a.sent()];
            }
        });
    });
}
function mergeVideoAndAudio(videoPath, audioPath, outputPath) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, runFfmpeg([
                        '-y',
                        '-i', videoPath,
                        '-i', audioPath,
                        '-map', '0:v:0',
                        '-map', '1:a:0',
                        '-c', 'copy',
                        '-shortest',
                        outputPath,
                    ])];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
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
        var videoInfo, filename, outputPath, mp4Url, dashVideoUrl, dashAudioUrl, ok, audioOk, tmpDir, ts, tmpVideo, tmpAudio, okV, okA, tmpDir, ts, tmpVideo, tmpAudio, okV, okA, error_4;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 14, , 15]);
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
                    mp4Url = videoInfo.mp4Url;
                    dashVideoUrl = videoInfo.dashVideoUrl;
                    dashAudioUrl = videoInfo.dashAudioUrl;
                    if (!mp4Url) return [3 /*break*/, 8];
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(40, '开始下载视频...');
                    return [4 /*yield*/, downloadVideo(mp4Url, outputPath, function (percent) {
                            onProgress === null || onProgress === void 0 ? void 0 : onProgress(40 + percent * 0.5, "\u4E0B\u8F7D\u4E2D: ".concat(percent.toFixed(1), "%"));
                        })];
                case 2:
                    ok = _a.sent();
                    if (!ok)
                        return [2 /*return*/, { success: false, error: '视频下载失败' }
                            // mp4 可能无音轨；如果有 DASH audio/video，则自动合并生成带音轨的 mp4
                        ];
                    return [4 /*yield*/, hasAudioStream(outputPath)];
                case 3:
                    audioOk = _a.sent();
                    if (!(!audioOk && dashVideoUrl && dashAudioUrl)) return [3 /*break*/, 7];
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(92, '检测到无音轨，改用 DASH 合并音视频...');
                    tmpDir = path.join(outputDir, '.tmp');
                    fs.mkdirSync(tmpDir, { recursive: true });
                    ts = Date.now();
                    tmpVideo = path.join(tmpDir, "dash_video_".concat(ts, ".m4s"));
                    tmpAudio = path.join(tmpDir, "dash_audio_".concat(ts, ".m4s"));
                    return [4 /*yield*/, downloadVideo(dashVideoUrl, tmpVideo, function (p) { return onProgress === null || onProgress === void 0 ? void 0 : onProgress(92 + p * 0.03, "\u4E0B\u8F7D\u89C6\u9891\u6D41: ".concat(p.toFixed(1), "%")); })];
                case 4:
                    okV = _a.sent();
                    return [4 /*yield*/, downloadVideo(dashAudioUrl, tmpAudio, function (p) { return onProgress === null || onProgress === void 0 ? void 0 : onProgress(95 + p * 0.03, "\u4E0B\u8F7D\u97F3\u9891\u6D41: ".concat(p.toFixed(1), "%")); })];
                case 5:
                    okA = _a.sent();
                    if (!okV || !okA)
                        return [2 /*return*/, { success: false, error: '下载音视频流失败（DASH）' }];
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(98, '正在合并音视频...');
                    return [4 /*yield*/, mergeVideoAndAudio(tmpVideo, tmpAudio, outputPath)];
                case 6:
                    _a.sent();
                    try {
                        fs.unlinkSync(tmpVideo);
                    }
                    catch ( /* ignore */_b) { /* ignore */ }
                    try {
                        fs.unlinkSync(tmpAudio);
                    }
                    catch ( /* ignore */_c) { /* ignore */ }
                    _a.label = 7;
                case 7: return [3 /*break*/, 13];
                case 8:
                    if (!(dashVideoUrl && dashAudioUrl)) return [3 /*break*/, 12];
                    // 2) 只有 DASH：下载并合并
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(40, '开始下载视频/音频流（DASH）...');
                    tmpDir = path.join(outputDir, '.tmp');
                    fs.mkdirSync(tmpDir, { recursive: true });
                    ts = Date.now();
                    tmpVideo = path.join(tmpDir, "dash_video_".concat(ts, ".m4s"));
                    tmpAudio = path.join(tmpDir, "dash_audio_".concat(ts, ".m4s"));
                    return [4 /*yield*/, downloadVideo(dashVideoUrl, tmpVideo, function (p) { return onProgress === null || onProgress === void 0 ? void 0 : onProgress(40 + p * 0.25, "\u4E0B\u8F7D\u89C6\u9891\u6D41: ".concat(p.toFixed(1), "%")); })];
                case 9:
                    okV = _a.sent();
                    return [4 /*yield*/, downloadVideo(dashAudioUrl, tmpAudio, function (p) { return onProgress === null || onProgress === void 0 ? void 0 : onProgress(65 + p * 0.25, "\u4E0B\u8F7D\u97F3\u9891\u6D41: ".concat(p.toFixed(1), "%")); })];
                case 10:
                    okA = _a.sent();
                    if (!okV || !okA)
                        return [2 /*return*/, { success: false, error: '下载音视频流失败（DASH）' }];
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(95, '正在合并音视频...');
                    return [4 /*yield*/, mergeVideoAndAudio(tmpVideo, tmpAudio, outputPath)];
                case 11:
                    _a.sent();
                    try {
                        fs.unlinkSync(tmpVideo);
                    }
                    catch ( /* ignore */_d) { /* ignore */ }
                    try {
                        fs.unlinkSync(tmpAudio);
                    }
                    catch ( /* ignore */_e) { /* ignore */ }
                    return [3 /*break*/, 13];
                case 12: return [2 /*return*/, { success: false, error: '未捕获到可下载的视频地址（mp4 或 DASH）' }];
                case 13:
                    onProgress === null || onProgress === void 0 ? void 0 : onProgress(100, '下载完成！');
                    return [2 /*return*/, {
                            success: true,
                            videoPath: outputPath,
                            title: videoInfo.title,
                        }];
                case 14:
                    error_4 = _a.sent();
                    return [2 /*return*/, { success: false, error: error_4.message }];
                case 15: return [2 /*return*/];
            }
        });
    });
}
