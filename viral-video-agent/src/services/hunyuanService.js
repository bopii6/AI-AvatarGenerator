/**
 * 腾讯混元大模型服务
 * 用于文案改写和标题生成
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
function generateAuthHeaders(config, action, payload) {
    var timestamp = Math.floor(Date.now() / 1000);
    var date = new Date(timestamp * 1000).toISOString().split('T')[0];
    var service = 'hunyuan';
    var host = 'hunyuan.tencentcloudapi.com';
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
        'X-TC-Version': '2023-09-01',
        'X-TC-Timestamp': timestamp.toString(),
        'X-TC-Region': config.region || 'ap-guangzhou',
        'Authorization': authorization,
    };
}
/**
 * 调用腾讯混元API
 */
function callHunyuanApi(config_1, messages_1) {
    return __awaiter(this, arguments, void 0, function (config, messages, model) {
        var params, payload, headers;
        if (model === void 0) { model = 'hunyuan-lite'; }
        return __generator(this, function (_a) {
            params = {
                Model: model,
                Messages: messages,
            };
            payload = JSON.stringify(params);
            headers = generateAuthHeaders(config, 'ChatCompletions', payload);
            return [2 /*return*/, new Promise(function (resolve, reject) {
                    var req = https.request({
                        hostname: 'hunyuan.tencentcloudapi.com',
                        method: 'POST',
                        headers: headers,
                    }, function (res) {
                        var data = '';
                        res.on('data', function (chunk) { return data += chunk; });
                        res.on('end', function () {
                            var _a, _b, _c, _d, _e;
                            try {
                                var result = JSON.parse(data);
                                if ((_a = result.Response) === null || _a === void 0 ? void 0 : _a.Error) {
                                    reject(new Error(result.Response.Error.Message));
                                }
                                else {
                                    var content = ((_e = (_d = (_c = (_b = result.Response) === null || _b === void 0 ? void 0 : _b.Choices) === null || _c === void 0 ? void 0 : _c[0]) === null || _d === void 0 ? void 0 : _d.Message) === null || _e === void 0 ? void 0 : _e.Content) || '';
                                    resolve(content);
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
 * 文案改写
 */
export function rewriteCopy(config, originalText, mode, customInstruction) {
    return __awaiter(this, void 0, void 0, function () {
        var prompt, messages;
        return __generator(this, function (_a) {
            if (mode === 'same') {
                return [2 /*return*/, originalText];
            }
            if (mode === 'auto') {
                prompt = "\u4F60\u662F\u4E00\u4F4D\u4E13\u4E1A\u7684\u77ED\u89C6\u9891\u6587\u6848\u5199\u624B\u3002\u8BF7\u4EFF\u5199\u4EE5\u4E0B\u6587\u6848\uFF0C\u4FDD\u6301\u539F\u6587\u7684\u98CE\u683C\u3001\u8BED\u6C14\u548C\u7ED3\u6784\uFF0C\u4F46\u7528\u4E0D\u540C\u7684\u8868\u8FBE\u65B9\u5F0F\u91CD\u65B0\u521B\u4F5C\u3002\n\n\u539F\u6587\u6848\uFF1A\n".concat(originalText, "\n\n\u8981\u6C42\uFF1A\n1. \u4FDD\u6301\u76F8\u4F3C\u7684\u957F\u5EA6\n2. \u4FDD\u6301\u76F8\u540C\u7684\u4E3B\u9898\u548C\u6838\u5FC3\u4FE1\u606F\n3. \u4F7F\u7528\u66F4\u5438\u5F15\u4EBA\u7684\u8868\u8FBE\n4. \u9002\u5408\u77ED\u89C6\u9891\u53E3\u64AD\n\n\u8BF7\u76F4\u63A5\u8F93\u51FA\u6539\u5199\u540E\u7684\u6587\u6848\uFF0C\u4E0D\u8981\u6709\u989D\u5916\u8BF4\u660E\u3002");
            }
            else {
                prompt = "\u8BF7\u6839\u636E\u4EE5\u4E0B\u6307\u4EE4\u6539\u5199\u6587\u6848\uFF1A\n\n\u6539\u5199\u6307\u4EE4\uFF1A".concat(customInstruction, "\n\n\u539F\u6587\u6848\uFF1A\n").concat(originalText, "\n\n\u8BF7\u76F4\u63A5\u8F93\u51FA\u6539\u5199\u540E\u7684\u6587\u6848\uFF0C\u4E0D\u8981\u6709\u989D\u5916\u8BF4\u660E\u3002");
            }
            messages = [
                { Role: 'user', Content: prompt }
            ];
            return [2 /*return*/, callHunyuanApi(config, messages)];
        });
    });
}
/**
 * 生成爆款标题
 */
export function generateTitles(config_1, content_1) {
    return __awaiter(this, arguments, void 0, function (config, content, count) {
        var prompt, messages, result;
        if (count === void 0) { count = 3; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    prompt = "\u4F60\u662F\u4E00\u4F4D\u6296\u97F3\u7206\u6B3E\u6807\u9898\u4E13\u5BB6\u3002\u8BF7\u6839\u636E\u4EE5\u4E0B\u5185\u5BB9\u751F\u6210".concat(count, "\u4E2A\u5438\u5F15\u4EBA\u7684\u6807\u9898\u3002\n\n\u5185\u5BB9\uFF1A\n").concat(content, "\n\n\u8981\u6C42\uFF1A\n1. \u6807\u9898\u8981\u6709\u5438\u5F15\u529B\uFF0C\u5F15\u53D1\u597D\u5947\u5FC3\n2. \u53EF\u4EE5\u4F7F\u7528emoji\u8868\u60C5\n3. \u9002\u5408\u6296\u97F3\u5E73\u53F0\u98CE\u683C\n4. \u6BCF\u4E2A\u6807\u9898\u4E00\u884C\n\n\u8BF7\u76F4\u63A5\u8F93\u51FA").concat(count, "\u4E2A\u6807\u9898\uFF0C\u6BCF\u884C\u4E00\u4E2A\uFF0C\u4E0D\u8981\u7F16\u53F7\u3002");
                    messages = [
                        { Role: 'user', Content: prompt }
                    ];
                    return [4 /*yield*/, callHunyuanApi(config, messages)];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, result.split('\n').filter(function (line) { return line.trim(); }).slice(0, count)];
            }
        });
    });
}
/**
 * 生成热门话题标签
 */
export function generateHashtags(config_1, content_1) {
    return __awaiter(this, arguments, void 0, function (config, content, count) {
        var prompt, messages, result;
        if (count === void 0) { count = 5; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    prompt = "\u8BF7\u6839\u636E\u4EE5\u4E0B\u5185\u5BB9\u751F\u6210".concat(count, "\u4E2A\u76F8\u5173\u7684\u6296\u97F3\u70ED\u95E8\u8BDD\u9898\u6807\u7B7E\u3002\n\n\u5185\u5BB9\uFF1A\n").concat(content, "\n\n\u8981\u6C42\uFF1A\n1. \u6807\u7B7E\u8981\u7B80\u6D01\u6709\u529B\n2. \u9009\u62E9\u70ED\u95E8\u3001\u6613\u88AB\u641C\u7D22\u7684\u8BCD\n3. \u4E0D\u8981\u52A0#\u53F7\n4. \u6BCF\u4E2A\u6807\u7B7E\u4E00\u884C\n\n\u8BF7\u76F4\u63A5\u8F93\u51FA").concat(count, "\u4E2A\u6807\u7B7E\uFF0C\u6BCF\u884C\u4E00\u4E2A\u3002");
                    messages = [
                        { Role: 'user', Content: prompt }
                    ];
                    return [4 /*yield*/, callHunyuanApi(config, messages)];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, result.split('\n').filter(function (line) { return line.trim(); }).slice(0, count)];
            }
        });
    });
}
