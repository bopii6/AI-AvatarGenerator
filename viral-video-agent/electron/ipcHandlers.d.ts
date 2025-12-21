/**
 * Electron IPC 处理器
 * 连接主进程服务和渲染进程
 */
import { BrowserWindow } from 'electron';
/**
 * 注册所有 IPC 处理器
 */
export declare function registerIpcHandlers(mainWindow: BrowserWindow): void;
