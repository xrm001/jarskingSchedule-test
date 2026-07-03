# 老板端 Web

基于 Vue 3、TypeScript 与 Vite 的企业微信 H5 老板端。

```bash
npm install
npm run dev
npm test
npm run build
```

默认使用真实后端 `/api/v1`。仅在本地开发时显式设置 `VITE_USE_MOCK=true` 才会动态加载内存 Mock；生产构建始终使用 `HttpApiClient`，不会显示开发预览入口。

前端不得保存企微 Secret 或第三方 API 密钥。正式登录由后端接收企微 OAuth code、换取 UserID 并创建 HttpOnly 会话；所有老板接口都必须由后端校验 `BOSS` 角色。
