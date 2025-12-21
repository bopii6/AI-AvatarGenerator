// 加载环境变量（必须在最开头）
import dotenv from 'dotenv';
import path from 'path';
// 编译后 __dirname = dist-electron/electron，需要往上两级才能到项目根目录
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });
import { app, BrowserWindow } from 'electron';
import { registerIpcHandlers } from './ipcHandlers';
var mainWindow = null;
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 800,
        title: '一键追爆 - 全自动AI智能体',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webSecurity: false, // 允许加载本地文件用于预览
        },
    });
    // 注册 IPC 处理器
    registerIpcHandlers(mainWindow);
    // 开发模式加载本地服务器，生产模式加载打包文件
    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}
app.whenReady().then(createWindow);
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});
