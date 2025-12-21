
const https = require('https');

const MOBILE_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

// 用户提供的真实文案
const shareText = `5.15 l@P.kp 08/19 Xzg:/ 悄悄做个梦给你# 悄悄做个梦给你 # 翻唱 # 热门音乐  https://v.douyin.com/efsutb2JpWA/ 复制此链接，打开Dou音搜索，直接观看视频！`;

async function test() {
    console.log('--- 开始测试 ---');
    console.log('输入文本:', shareText);

    // 1. 测试正则匹配
    // 宽松匹配：寻找 http(s)://v.douyin.com/ 后面非空白字符
    const regex = /(https?:\/\/v\.douyin\.com\/[a-zA-Z0-9]+)/;
    const match = shareText.match(regex);

    if (!match) {
        console.error('❌ 正则匹配失败');
        return;
    }

    const shortUrl = match[1];
    console.log('✅ 正则匹配成功:', shortUrl);

    // 2. 测试重定向获取
    console.log('正在获取重定向 URL...');
    const realUrl = await getRedirectUrl(shortUrl);
    console.log('重定向结果:', realUrl);

    if (!realUrl) {
        console.error('❌ 获取重定向失败');
        return;
    }

    // 3. 测试 ID 提取
    const idMatch = realUrl.match(/video\/(\d+)/);
    if (!idMatch) {
        console.error('❌ 无法从 URL 提取视频 ID:', realUrl);
        // 尝试从 query 参数提取，有时是 /share/video/{id}
        const shareMatch = realUrl.match(/share\/video\/(\d+)/);
        if (shareMatch) {
            console.log('✅ 从 share/video 路径提取到 ID:', shareMatch[1]);
        } else {
            return;
        }
    } else {
        console.log('✅ 提取到视频 ID:', idMatch[1]);
    }
}

async function getRedirectUrl(url) {
    return new Promise((resolve) => {
        https.get(url, {
            headers: {
                'User-Agent': MOBILE_USER_AGENT,
            },
        }, (response) => {
            console.log('状态码:', response.statusCode);
            console.log('Headers:', JSON.stringify(response.headers['location']));

            if (response.statusCode === 301 || response.statusCode === 302) {
                resolve(response.headers.location || null);
            } else {
                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => {
                    // 打印部分 body 看看是不是 verify 页面
                    console.log('页面内容前100字:', data.substring(0, 100));
                    const match = data.match(/video\/(\d+)/);
                    if (match) {
                        resolve(`https://www.douyin.com/video/${match[1]}`);
                    } else {
                        // 只有 200 且没找到模式才算失败，但也可能是 delayed redirect
                        resolve(response.responseUrl || null); // electron net import needed for responseUrl? no, node http doesn't have it directly like this usually.
                        // 实际上 node 的 response 对象没有 responseUrl，这里简化
                        const location = response.headers.location;
                        resolve(location || null);
                    }
                });
            }
        }).on('error', (e) => {
            console.error('请求错误:', e);
            resolve(null);
        });
    });
}

test();
