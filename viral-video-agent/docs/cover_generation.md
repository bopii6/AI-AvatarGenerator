# 封面生成配置说明

## 1. 背景
爆款剪辑台的「爆款剪辑台·封面生成」面板支持两种方式：截取当前数字人视频的帧作为封面，或调用 AI 模型生成封面。生成成功后，右侧的预览区域会现实图片并附带绿色的提示文字，提示中会展示本次封面对应的文件路径（例如 `封面路径（...）`），以便进一步检查或复制。

## 2. 环境变量
请在 `.env` / `.env.example` 中配置下列变量以控制封面的生成源：

- `COVER_PROVIDER`: 默认 `aliyun`，表示使用阿里云通义万象 text-to-image 模型生成封面。  
  如果你希望使用已经在其他模块（例如 ASR/TTS）里配置好的腾讯云 SecretId/SecretKey 生成封面，请改为 `tencent`，此时会调用 `generateCover` 中的新逻辑直接调用腾讯的 `TextToImage`，并自动应用 TC3 签名。
- `COVER_TENCENT_REGION`: 可选，只有当 `COVER_PROVIDER` 为 `tencent` 时生效。默认值是 `ap-guangzhou`，需要时可改为其他腾讯云区域 ID。

在切换到 `tencent` 之后，封面图片会在服务端的 `output/covers`（等价于 `app.getPath('userData')/output/covers`）目录中生成，文件名形如 `cover_1700000000000_0.png`。这个路径会通过 `CoverPanel` 的提示文字直接暴露出来，也会同步写入 `setPreview` 调用方便即时预览。

## 3. 实际调试建议

1. **看提示文字**：右侧封面卡片下方的绿色提示不仅回显封面路径，还会附上录入的提示词（例如 `AI提示词：xxx`）。如果提示中出现 `Invalid API-key provided` 这样的报错，请确认 `.env` 中 `TENCENT_SECRET_ID`/`TENCENT_SECRET_KEY` 是否正确，且 `COVER_PROVIDER` 是否为 `tencent`。
2. **打开开发者工具**：在窗口中按 `Ctrl+Shift+I`（或通过菜单 `View → Toggle Developer Tools`）查看控制台日志。`ipcHandlers` 中在调用 `generate-cover` 时会打印类似 `[Cover] prompt: ... result: [...]` 与 `[Cover] failed: ...` 的信息，方便确认腾讯/阿里接口是否返回了有效结果。
3. **查看本地文件**：根据提示路径，在文件资源管理器中打开对应的 `.png`，确认是否为预期的封面。如果状态里提示的是 `output/.../covers/cover_xxx.png`，那就可以直接复制路径粘贴到 `资源管理器` 地址栏或用面板右上角的 `复制路径` 按钮（如果可见）快速定位。
4. **回退策略**：如果 AI 接口失败，流水线会自动对当前数字人视频做帧截图并保存到同一路径，且同样会在封面卡片中预览。这可以作为临时替代，确保封面模块依然可用。

## 4. 快速定位

- 生成失败时，状态栏也会显示 `message.error` 的弹窗与顶部警示（如截图中看到的 `Invalid API-key provided.`）。默认会将错误信息直接展示给测试人员。  
- 需要查看更多日志时，可以查看 `electron` 目录下的 `ipcHandlers.ts` 第 650 行起封面逻辑块，那里列出了 `coverRequest` 的构造方式以及 `generateCover` 的调用接口。

以上配置和提示结合起来，可以精准地验证封面生成是否真实调用了腾讯接口，是否真正生成了对应的图片，以及为什么会报错。
