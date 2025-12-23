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
import COS from 'cos-nodejs-sdk-v5';
import { randomUUID } from 'crypto';
function safeTrim(input) {
    return String(input !== null && input !== void 0 ? input : '').trim();
}
function normalizePrefix(prefix) {
    var p = safeTrim(prefix);
    if (!p)
        return '';
    return p.endsWith('/') ? p : "".concat(p, "/");
}
function pad2(n) {
    return n < 10 ? "0".concat(n) : String(n);
}
function guessExt(fileName) {
    var name = safeTrim(fileName).toLowerCase();
    if (name.endsWith('.wav'))
        return 'wav';
    if (name.endsWith('.mp3'))
        return 'mp3';
    if (name.endsWith('.m4a'))
        return 'm4a';
    if (name.endsWith('.aac'))
        return 'aac';
    return 'wav';
}
function buildKey(basePrefix, deviceId, ext) {
    var now = new Date();
    var y = now.getFullYear();
    var m = pad2(now.getMonth() + 1);
    var d = pad2(now.getDate());
    var device = safeTrim(deviceId) || 'device';
    var id = randomUUID();
    var safeExt = ext.startsWith('.') ? ext : ".".concat(ext);
    return "".concat(basePrefix, "cosyvoice/").concat(y, "/").concat(m, "/").concat(d, "/").concat(device, "/").concat(Date.now(), "_").concat(id).concat(safeExt);
}
function getClient(config) {
    var secretId = safeTrim(config.secretId);
    var secretKey = safeTrim(config.secretKey);
    if (!secretId || !secretKey)
        throw new Error('未配置腾讯云凭据（TENCENT_SECRET_ID/KEY）');
    return new COS({ SecretId: secretId, SecretKey: secretKey });
}
export function uploadVoiceSampleToCos(config, params) {
    return __awaiter(this, void 0, void 0, function () {
        var bucket, region, cos, prefix, ext, key, expires, signedUrl;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    bucket = safeTrim(config.bucket);
                    region = safeTrim(config.region);
                    if (!bucket)
                        throw new Error('未配置 COS Bucket（TENCENT_COS_BUCKET）');
                    if (!region)
                        throw new Error('未配置 COS Region（TENCENT_COS_REGION）');
                    cos = getClient(config);
                    prefix = normalizePrefix(config.prefix || 'voice-samples/');
                    ext = guessExt(params.fileName);
                    key = buildKey(prefix, params.deviceId, ext);
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            cos.putObject({
                                Bucket: bucket,
                                Region: region,
                                Key: key,
                                Body: params.buffer,
                                ContentType: ext === 'wav' ? 'audio/wav' : 'application/octet-stream',
                            }, function (err) {
                                if (err)
                                    return reject(err);
                                resolve();
                            });
                        })];
                case 1:
                    _b.sent();
                    expires = (_a = config.signedUrlExpiresSeconds) !== null && _a !== void 0 ? _a : 3600;
                    signedUrl = cos.getObjectUrl({
                        Bucket: bucket,
                        Region: region,
                        Key: key,
                        Sign: true,
                        Expires: expires,
                    });
                    return [2 /*return*/, { bucket: bucket, region: region, key: key, signedUrl: signedUrl }];
            }
        });
    });
}
