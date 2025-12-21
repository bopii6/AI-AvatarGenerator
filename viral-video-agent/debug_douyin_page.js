
const https = require('https');

const videoId = '7575471950610514419';
const pageUrl = `https://www.iesdouyin.com/share/video/${videoId}`;

console.log('抓取页面:', pageUrl);

https.get(pageUrl, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml'
    }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        if (data.includes('_ROUTER_DATA')) {
            const index = data.indexOf('_ROUTER_DATA');
            console.log('前缀上下文:', data.substring(index - 50, index + 20));

            // 使用更宽松的正则测试
            const match = data.match(/_ROUTER_DATA\s*=\s*({.+?})<\/script/);
            // 试试我的代码里的正则
            const myRegex = /window\._ROUTER_DATA\s*=\s*({.*?})</s;
            const myMatch = data.match(myRegex);

            console.log('当前正则(myMatch) 匹配成功?', !!myMatch);

            if (match) {
                console.log('宽松正则匹配 _ROUTER_DATA 成功');
            } else {
                console.log('宽松正则匹配 _ROUTER_DATA 失败');
            }
        } else {
            console.log('页面完全不包含 _ROUTER_DATA');
        }
    });
});
