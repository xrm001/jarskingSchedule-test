# 石总行程后端骨架

这是 NestJS + TypeScript + Fastify 的生产后端起点。当前包含公开健康检查、默认拒绝的认证 Guard、领域类型、角色 Guard、唯一老板校验、审批 HTTP 接口和 PostgreSQL 审批事务。用户目录、会议室与老板日程读取接口已经接入 PostgreSQL，并按访问者身份隐藏私密日程内容。语音模块目前使用 Fake ASR/DeepSeek 适配器，不会调用外部服务。

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
- `db/`：PostgreSQL 迁移、会议室种子、数据设计与私有角色名单导入说明。
- `modules/database/`：连接池、事务及数据库健康检查。
- `modules/resources/`：管理层目录、会议室和隐私过滤后的老板日程读取接口。
- 后续模块：`notifications`、`wecom`、`audit`。

## 生产数据库约束

生产适配器应使用 PostgreSQL 单事务：锁定申请行，按固定顺序锁老板与会议室资源行，检查冲突，插入正式日程，批准目标申请，自动拒绝所有时间重叠的待审批申请，最后写入通知 Outbox 与审计日志。

不能只依赖“先查询、后插入”。应启用 `btree_gist`，为正式日程生成 `[start_at,end_at)` 的 `tstzrange`，并分别对生效状态下的 `boss_user_id + range`、`room_id + range` 建立 GiST 排他约束，作为并发双订的最终防线。

## 企微认证规则

1. OAuth `code` 只能由后端换取真实 `UserID`。
2. OAuth `state` 必须随机、一次性、短时有效，并限制回跳地址。
3. 管理层用企微标签同步；管理员本地授权；石总绑定唯一 `BOSS_WECOM_USER_ID`。
4. `RolesGuard` 做一般能力检查；审批还必须通过 `BossIdentityService` 同时核对 BOSS 角色和唯一真实 UserID。
5. 企微应用可见范围只是入口控制，不能替代每个 API 的服务端鉴权。

`AuthenticationGuard` 已全局注册且默认拒绝，只有显式 `@Public()` 的健康检查及 OAuth 起始/回调接口可匿名访问。当前没有任何代码会伪造登录用户；受保护业务 API 必须持有服务端验证过的有效会话。

OAuth 会话现已实现：一次性 5 分钟 `state`、服务端换取 UserID、数据库角色解析、随机 HttpOnly 会话 Cookie、数据库令牌摘要、12 小时过期及双提交 CSRF 校验。只有 `WECOM_AUTH_ENABLED=true` 且服务器密钥配置完整时才启用正式入口。

## 上线安全门槛（尚未完成）

- 真实企微 OAuth：一次性 `state`、服务端使用 `code` 换取 UserID、回跳地址白名单与错误处理。
- 服务端会话：随机会话ID、HttpOnly + Secure + SameSite Cookie、过期/撤销、登录态轮换及 Redis/数据库存储。
- CSRF 防护：所有 Cookie 会话下的写接口必须验证 CSRF token，并校验 Origin/Referer；SameSite 不能作为唯一防线。
- 企业微信回调：签名校验、AES 解密、CorpID 校验、时间窗口与消息去重。
- 生产数据库事务、GiST 排他约束、Outbox、审计日志、限流及统一安全响应头。

`NODE_ENV=production` 时缺少 `BOSS_WECOM_USER_ID` 或 `BOSS_APP_USER_ID` 会拒绝启动；测试/本地骨架允许通过测试夹具注入。

## 下一步

1. 完成企微 OAuth、会话、UserID 自动绑定与加密回调验签。
2. 将 Outbox 接入企微应用消息，并实现提醒任务的唯一 `dedupe_key`。
3. 增加日程写入、申请查询、管理员成员管理与审计接口。
4. 接入腾讯云 ASR 和意图解析模型，并保留老板确认后执行的安全边界。
