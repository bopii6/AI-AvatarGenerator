# CosyVoice 云端声音克隆：API 约定（已废弃）

当前桌面端已统一使用阿里云 DashScope CosyVoice API（`ALIYUN_DASHSCOPE_API_KEY`），不再支持自建 CosyVoice 网关。

> 说明：当前不做登录，桌面端会生成一个本地 `device_id`，所有模型按 `device_id` 进行隔离。

## 旧环境变量（仅供历史参考）

- `CLOUD_VOICE_SERVER_URL=...`
- `CLOUD_VOICE_PORT=9090`

## 必须实现的接口

### 1) 健康检查

`GET /health`

返回示例：

```json
{ "message": "ok" }
```

### 2) 列出我的声音模型

`GET /v1/voices?device_id=<device_id>`

返回示例：

```json
{
  "data": [
    { "id": "v_001", "name": "张三-口播", "status": "ready" }
  ]
}
```

`status` 取值：`pending | training | ready | failed`

### 3) 提交训练（上传样本）

`POST /v1/voices/train`（multipart/form-data）

字段：
- `device_id`：string
- `name`：string
- `audio`：file（wav/mp3 均可，建议 30–90 秒清晰人声）

返回示例：

```json
{ "data": { "voiceId": "v_001" } }
```

### 4) 查询训练状态

`GET /v1/voices/<voice_id>?device_id=<device_id>`

返回示例：

```json
{ "data": { "id": "v_001", "name": "张三-口播", "status": "training" } }
```

失败示例：

```json
{ "data": { "id": "v_001", "status": "failed", "error": "xxx" } }
```

### 5) 文本转语音（用指定声音）

`POST /v1/tts`（application/json）

请求体：

```json
{ "device_id": "xxx", "voice_id": "v_001", "text": "要合成的文案" }
```

返回示例（推荐）：

```json
{ "data": { "audioUrl": "http://<host>:9090/files/out.wav" } }
```

也支持返回相对路径：

```json
{ "data": { "audioUrl": "/files/out.wav" } }
```

## 桌面端实现位置

- IPC：`electron/ipcHandlers.ts`（`cloud-voice-*`）
- 训练 UI：`src/components/VoiceCloneSettings.tsx`
- 音频生成使用：`src/components/panels/AudioPanel.tsx`
- 一键追爆就绪条件：`src/App.tsx`（需要“有人像 + 有 ready 的声音模型”）
