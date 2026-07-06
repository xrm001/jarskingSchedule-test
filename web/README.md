# 老板端 Web

基于 Vue 3、TypeScript 与 Vite 的企业微信 H5 老板端。

```bash
npm install
npm run dev
npm test
npm run build
```

默认使用真实后端 `/api/v1`。仅在本地开发时显式设置 `VITE_USE_MOCK=true` 才会动态加载内存 Mock；未启用演示模式的生产构建使用 `HttpApiClient`，不会显示开发预览入口。

部署到封闭测试成员范围时，可以显式设置 `VITE_DEMO_MODE=true` 构建可切换角色的演示版本。该模式使用示例数据，禁止用于正式上线：

```bash
VITE_DEMO_MODE=true npm run build
```

前端不得保存企微 Secret 或第三方 API 密钥。正式登录由后端接收企微 OAuth code、换取 UserID 并创建 HttpOnly 会话；所有老板接口都必须由后端校验 `BOSS` 角色。
