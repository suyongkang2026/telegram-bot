# 🚀Telegram双向机器人

基于 **Cloudflare Pages + Functions** 构建的极简、安全、美观的 Telegram 客服机器人系统。支持 AI 动态验证、全格式消息转发、多模型切换及可视化管理后台。

[![Deploy to Cloudflare Pages](https://img.shields.io/badge/Deploy%20to-Cloudflare%20Pages-0d6efd?style=for-the-badge&logo=cloudflare)](https://dash.cloudflare.com/?to=/:account/pages/new)

---

## ✨ 功能特性

- 🛡️ **AI 动态验证**：用户发送 `/start` 后需通过 AI 生成的常识问题验证，有效防止机器人骚扰。
- 🤖 **多模型支持**：支持配置多个 AI 接口，用户可自由切换对话模型。
- 📡 **双向全格式转发**：支持文字、图片、语音、视频、文件、贴纸等 Telegram 原生全格式转发。
- ⚖️ **AI 自动审计**：AI 实时监控对话，自动封禁违规用户，并提供完善的申诉与白名单系统。
- 📊 **可视化后台**：基于 Ant Design Vue 开发的高颜值管理后台，支持 JWT 令牌鉴权。
- 🕒 **每日运行日志**：每天 00:00 准时向管理员推送运行报表（时长、用户、消息统计）。
- ☁️ **零成本部署**：完全依托于 Cloudflare 生态，无需服务器，全球秒开，永久免费。

---

## 🚀 快速部署

### 1. Fork 本仓库
点击仓库右上角的 `Fork` 按钮，将项目复制到你的账号下。

### 2. 在 Cloudflare 部署
1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)。
2. 进入 **Workers & Pages** -> **Create application** -> **Pages** -> **Connect to Git**。
3. 选择你 Fork 的 `telegram-bot` 仓库。
4. **构建设置**：
   - **Framework preset**: `None` (或者 `Vite`)
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. 点击 **Save and Deploy**。

### 3. 配置环境变量 (重要)
在 Pages 项目的 **Settings -> Functions -> Environment variables** 中添加以下变量：

| 变量名 | 说明 | 示例 |
| :--- | :--- | :--- |
| `BOT_TOKEN` | Telegram Bot Token | `12345:ABCDE...` |
| `ADMIN_ID` | 您的 Telegram 数字 ID | `123456789` |
| `JWT_SECRET` | 您的后台登录令牌 (Master Token) | `自定义长字符串` |
| `AI_URL` | AI API 地址 (逗号分隔多模型) | `https://api.openai.com/v1` |
| `AI_KEY` | AI API Key (逗号分隔或单个) | `sk-xxxxxx` |
| `AI_MODEL` | AI 模型名 (逗号分隔多模型) | `gpt-3.5-turbo,gpt-4` |

*添加后请执行一次 **Retry deployment** 以生效。*

### 4. 绑定数据库 (KV)
1. 在 Cloudflare 创建一个 KV 命名空间，命名为 `MY_KV`。
2. 在 Pages 项目的 **Settings -> Functions -> KV namespace bindings** 中绑定 `MY_KV` 到变量名 `MY_KV`。

### 5. 激活 Webhook
访问以下 URL 告知 Telegram 你的后端地址：
`https://api.telegram.org/bot<你的TOKEN>/setWebhook?url=https://<你的域名>.pages.dev/api/webhook`

---

## 🔒 管理后台

访问 `https://<你的域名>.pages.dev/` 即可进入管理后台。
- **鉴权方式**：使用你在环境变量中设置的 `JWT_SECRET` 作为 Token 直接登录。
- **版权支持**：后台底部集成作者联系方式，支持一键跳转 Telegram。

---

## 👨‍💻 作者信息

**Xiaosu**
- 📢 **Telegram**: [https://t.me/xiaosu06](https://t.me/xiaosu06)
- 🚀 **GitHub**: [suyongkang2026](https://github.com/suyongkang2026)

如果您觉得这个项目对你有帮助，请给一个 **Star** 🌟！

---
© 2026 Xiaosu. All rights reserved.
