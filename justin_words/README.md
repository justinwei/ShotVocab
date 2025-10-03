# 背单词助手 Justin Words

一个面向移动端的背单词 Web 应用：支持拍照识别（Gemini Vision 占位实现）、遗忘曲线复习流程，以及每日学习统计。前端基于 Vue 3 + Vite，后端采用 Node.js + Express + SQLite。

## 快速开始

```bash
# 进入后端并安装依赖
cd server
npm install
npm run migrate
npm run dev

# 进入前端安装依赖
cd ../client
npm install
npm run dev
```

默认后端监听 `http://localhost:4000`，前端开发服务器监听 `http://localhost:5173` 并通过 Vite 代理访问 API。

## 环境配置

- 复制 `server/.env.example` 为 `.env`，填写 `GEMINI_API_KEY` 与 `GEMINI_MODEL`。
- 首次启动时会在 `./data/justin_words.db` 创建 SQLite 数据库，并在 `./uploads` 存储原始图片与缓存。

## 核心目录

- `server/src/routes`：REST API（单词录入、复习、统计）。
- `server/src/services`：业务模块（OCR 调度、遗忘曲线调度、统计聚合等）。
- `client/src/views`：Vue 页面（复习、录入、统计）。
- `client/src/stores`：Pinia 状态（复习队列、单词录入、统计）。

## 开发命令

- 后端：`npm run dev`（热重载）、`npm run migrate`（数据库迁移）、`npm run lint`。
- 前端：`npm run dev`、`npm run build`、`npm run lint`。

## 测试与后续

- 目前后端测试脚手架使用 Tap（`npm run test`），尚未编写具体用例。
- 前端可使用 Vitest/Vue Test Utils & Playwright 扩展 E2E 流程。
- Gemini 接入当前为本地缓存占位实现，落地时需替换为真实 API 调用并加强错误处理、速率限制与日志监控。
