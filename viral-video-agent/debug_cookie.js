
const https = require('https');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const cookie = process.env.DOUYIN_COOKIE;
const videoId = '7568830324835175699';
const url = `https://www.douyin.com/video/${videoId}`;

console.log('Cookie 长度:', cookie ? cookie.length : 0);
console.log('Cookie 前100字:', cookie ? cookie.substring(0, 100) : '(无)');
console.log('\n请求页面:', url);

https.get(url, {
    headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'cookie': cookie,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    },
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('\n页面长度:', data.length);
        console.log('包含 RENDER_DATA?', data.includes('RENDER_DATA'));
        console.log('包含 _ROUTER_DATA?', data.includes('_ROUTER_DATA'));
        console.log('包含 login?', data.includes('login'));
        console.log('包含 passport?', data.includes('passport'));

        // 查找 script 标签
        const scriptMatch = data.match(/<script[^>]*id="([^"]+)"[^>]*>/g);
        console.log('\n页面中的 script id:', scriptMatch ? scriptMatch.slice(0, 5) : '(无)');

        // 打印页面标题
        const titleMatch = data.match(/<title>([^<]+)<\/title>/);
        console.log('页面标题:', titleMatch ? titleMatch[1] : '(无)');

        // 保存 HTML 以便检查
        require('fs').writeFileSync('debug_page.html', data);
        console.log('\n完整页面已保存到 debug_page.html');
    });
}).on('error', (e) => {
    console.error('请求失败:', e);
});
