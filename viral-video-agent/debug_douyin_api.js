
const https = require('https');

const videoId = '7575471950610514419';
const apiUrl = `https://www.iesdouyin.com/web/api/v2/aweme/iteminfo/?item_ids=${videoId}`;

console.log('测试 API:', apiUrl);

https.get(apiUrl, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
    }
}, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        console.log('API 返回数据前200字:', data.substring(0, 200));
        try {
            const json = JSON.parse(data);
            if (json.item_list && json.item_list.length > 0) {
                const video = json.item_list[0].video;
                const playAddr = video.play_addr.url_list[0];
                console.log('成功获取视频地址:', playAddr);
            } else {
                console.log('未能获取视频信息:', json);
            }
        } catch (e) {
            console.error('JSON 解析失败:', e);
        }
    });
}).on('error', (e) => {
    console.error('请求失败:', e);
});
