# 石总行程后端骨架

这是 NestJS + TypeScript + Fastify 的生产后端起点。当前包含公开健康检查、默认拒绝的认证 Guard、领域类型、企微身份端口、角色 Guard、唯一老板校验、审批 HTTP 接口和可测试审批事务逻辑；尚未接入真实企微和数据库。语音模块目前使用 Fake ASR/DeepSeek 适配器，不会调用外部服务。

## 本地运行

```bash
npm install
npm test
npm run build
npm start
```

复制 `.env.example` 为 `.env` 后填写测试配置。不要提交 `.env` 或任何真实 Secret。

## 模块边界

- `domain/`：与框架无关的核心类型、重叠规则及业务错误。
- `modules/auth/`：OAuth 身份端口、角色 Guard、唯一老板 UserID 校验。
- `modules/approvals/`：审批事务用例、持久层端口、仅供测试的内存适配器。
- `voice/`：ASR/指令解析端口、Schema 校验、确认哈希与幂等执行边界。
- 后续模块：`schedules`、`rooms`、`notifications`、`wecom`、`audit`。

## 生产数据库约束

生产适配器应使用 PostgreSQL 单事务：锁定申请行，按固定顺序锁老板与会议室资源行，检查冲突，插入正式日程，批准目标申请，自动拒绝所有时间重叠的待审批申请，最后写入通知 Outbox 与审计日志。

不能只依赖“先查询、后插入”。应启用 `btree_gist`，为正式日程生成 `[start_at,end_at)` 的 `tstzrange`，并分别对生效状态下的 `boss_user_id + range`、`room_id + range` 建立 GiST 排他约束，作为并发双订的最终防线。

## 企微认证规则

1. OAuth `code` 只能由后端换取真实 `UserID`。
2. OAuth `state` 必须随机、一次性、短时有效，并限制回跳地址。
3. 管理层用企微标签同步；管理员本地授权；石总绑定唯一 `BOSS_WECOM_USER_ID`。
4. `RolesGuard` 做一般能力检查；审批还必须通过 `BossIdentityService` 同时核对 BOSS 角色和唯一真实 UserID。
5. 企微应用可见范围只是入口控制，不能替代每个 API 的服务端鉴权。

`AuthenticationGuard` 已全局注册且默认拒绝，只有显式 `@Public()` 的健康检查可匿名访问。当前没有任何代码会伪造登录用户；在真实会话中间件完成之前，受保护业务 API 不应对外开放。

## 上线安全门槛（尚未完成）

- 真实企微 OAuth：一次性 `state`、服务端使用 `code` 换取 UserID、回跳地址白名单与错误处理。
- 服务端会话：随机会话ID、HttpOnly + Secure + SameSite Cookie、过期/撤销、登录态轮换及 Redis/数据库存储。
- CSRF 防护：所有 Cookie 会话下的写接口必须验证 CSRF token，并校验 Origin/Referer；SameSite 不能作为唯一防线。
- 企业微信回调：签名校验、AES 解密、CorpID 校验、时间窗口与消息去重。
- 生产数据库事务、GiST 排他约束、Outbox、审计日志、限流及统一安全响应头。

`NODE_ENV=production` 时缺少 `BOSS_WECOM_USER_ID` 或 `BOSS_APP_USER_ID` 会拒绝启动；测试/本地骨架允许通过测试夹具注入。

## 下一步

1. 增加 PostgreSQL migration 与真实 `ApprovalRepository`。
2. 完成企微 OAuth、会话、标签同步与加密回调验签。
3. 将 Outbox 接入企微应用消息，并实现提醒任务的唯一 `dedupe_key`。
4. 增加完整的日程、申请查询、手动拒绝审计与集成测试。
