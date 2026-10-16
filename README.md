# Agent Anatomy · Agent 作品解剖

以源码为据，自上而下拆解 Copilot/Sydney、meshy、Claude Code、DeepSeek Harness、LangChain 等优秀 Agent 作品：先给心智模型，再讲机制与取舍。

[阅读站点](https://jiuchenm.github.io/agent-anatomy/)

这是公开版本，只收录审阅后的公开文章与脱敏内容；涉及内部源码（Sydney、meshy）的正文与细节不在此仓库，仅保留本地。文章保留原始证据链接与核验日期。

## 开发与部署

需要 Node.js 22 或更新版本。执行 `npm install`、`npm test`、`npm run build`。推送 main 后 GitHub Actions 构建并部署 Pages；Settings → Pages 的 Source 选择 GitHub Actions。

`npm run dev` 可在本地预览。hash 路由支持直接打开具体文章，资源路径适配项目子目录。

## 写作规范

本站文章按「top-down 讲解法」撰写，方法论见 `research/methodology/top-down-methodology.md`，写作 skill 见 `.agents/skills/writing-article/`。
