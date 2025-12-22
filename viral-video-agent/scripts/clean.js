const { execSync } = require('child_process');

function cleanPort(port) {
    console.log(`[Cleaner] 正在检查端口 ${port}...`);
    try {
        let cmd = '';
        if (process.platform === 'win32') {
            cmd = `netstat -ano | findstr :${port}`;
        } else {
            cmd = `lsof -i tcp:${port} -t`;
        }

        const stdout = execSync(cmd, { encoding: 'utf8' }).trim();
        if (!stdout) {
            console.log(`[Cleaner] 端口 ${port} 是干净的。`);
            return;
        }

        const lines = stdout.split('\n');
        const pids = new Set();

        lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (process.platform === 'win32') {
                const pid = parts[parts.length - 1];
                if (pid && !isNaN(pid)) pids.add(pid);
            } else {
                if (line && !isNaN(line)) pids.add(line);
            }
        });

        pids.forEach(pid => {
            console.log(`[Cleaner] 正在强杀残留进程 PID: ${pid}`);
            try {
                if (process.platform === 'win32') {
                    execSync(`taskkill /F /PID ${pid}`);
                } else {
                    execSync(`kill -9 ${pid}`);
                }
            } catch (e) {
                // 忽略已经退出的进程
            }
        });
    } catch (error) {
        // Findstr 没找到结果会抛错，这里属于正常情况
        console.log(`[Cleaner] 端口 ${port} 未被占用。`);
    }
}

// 清理核心开发端口
cleanPort(5173);
console.log('[Cleaner] 环境清理完毕，准备启动...');
