var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import { contextBridge, ipcRenderer } from 'electron';
// 暴露给渲染进程的安全 API
contextBridge.exposeInMainWorld('electronAPI', {
    // 通用调用方法
    invoke: function (channel) {
        var args = [];
        for (var _i = 1; _i < arguments.length; _i++) {
            args[_i - 1] = arguments[_i];
        }
        return ipcRenderer.invoke.apply(ipcRenderer, __spreadArray([channel], args, false));
    },
    on: function (channel, callback) {
        var subscription = function (_event) {
            var args = [];
            for (var _i = 1; _i < arguments.length; _i++) {
                args[_i - 1] = arguments[_i];
            }
            return callback.apply(void 0, args);
        };
        ipcRenderer.on(channel, subscription);
        return function () { return ipcRenderer.removeListener(channel, subscription); };
    },
    off: function (channel, callback) { return ipcRenderer.removeListener(channel, callback); },
    getAppPath: function () { return ipcRenderer.invoke('get-app-path'); },
    // 视频相关
    downloadVideo: function (url) { return ipcRenderer.invoke('download-video', url); },
    // ASR 相关
    transcribeAudio: function (audioPath) { return ipcRenderer.invoke('transcribe-audio', audioPath); },
    // TTS 相关
    generateSpeech: function (text, voiceId) { return ipcRenderer.invoke('generate-speech', text, voiceId); },
    // 数字人相关
    generateDigitalHuman: function (params) { return ipcRenderer.invoke('generate-digital-human', params); },
    // 文案改写
    rewriteCopy: function (text, mode, instruction) {
        return ipcRenderer.invoke('rewrite-copy', text, mode, instruction);
    },
    // 封面生成
    generateCover: function (prompt) { return ipcRenderer.invoke('generate-cover', prompt); },
    generateSubtitleFile: function (params) {
        return ipcRenderer.invoke('generate-subtitle-file', params);
    },
    getVideoDuration: function (videoPath) { return ipcRenderer.invoke('get-video-duration', videoPath); },
    // 标题生成
    generateTitle: function (content) { return ipcRenderer.invoke('generate-title', content); },
    // 事件监听
    onProgress: function (callback) {
        ipcRenderer.on('pipeline-progress', function (_event, progress, stage) { return callback(progress, stage); });
    },
    onDownloadProgress: function (callback) {
        ipcRenderer.on('download-progress', function (_event, data) { return callback(data); });
    },
});
