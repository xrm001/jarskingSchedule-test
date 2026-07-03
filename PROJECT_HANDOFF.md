# Jarsking 日程项目交接说明

## 项目目标

为企业微信自建应用开发一个围绕单一预约对象的日程与会议预约系统。应用包含老板端、管理层端和管理员端，并通过企业微信身份识别自动进入对应页面。

## 当前完成状态

### 前端

- Vue 3 + TypeScript + Vite 移动端 H5。
- 老板端：今日时间线、状态更改、个人行程、预约审批、日历与提醒。
- 管理层端：查看可预约时段、会议室可用情况、提交申请、查看申请状态。
- 管理员端：预约概览、成员角色、会议室资源和接口配置状态。
- 测试模式提供老板、管理层、管理员三种角色选择入口。
- 正式模式不会显示测试角色入口。

### 后端

- NestJS + Fastify + TypeScript 骨架。
- 默认拒绝的认证 Guard 和角色 Guard。
- 唯一老板身份校验边界。
- 审批领域服务、并发版本检查和自动拒绝重叠申请逻辑。
- 腾讯云 ASR 与 DeepSeek 的端口、Schema 和 Fake 适配器。
- 当前尚未接入真实企业微信、数据库和外部语音服务。

## 本地启动

### Web

```bash
cd web
npm ci
npm run dev
```

本地测试角色模式需要：

```env
VITE_USE_MOCK=true
```

### Server

```bash
cd server
npm ci
npm test
npm run build
npm start
```

## 验证命令

```bash
cd web
npm test
npm run build

cd ../server
npm test
npm run build
```

## 下一阶段工作

1. 部署测试前端并接入企业微信工作台入口。
2. 完成企业微信 OAuth、服务端会话和角色表。
3. 建立 PostgreSQL migration 与生产 Repository。
4. 实现日程、会议室、申请、通知和审计 API。
5. 接入企微应用消息与定时提醒。
6. 接入腾讯云 ASR 和 DeepSeek，并保留用户确认步骤。
7. 完成安全测试、备份、监控与灰度上线。

## 安全提醒

- 不要向仓库提交 `.env`、企微 Secret、API Key、数据库密码或证书私钥。
- 老板审批必须在服务端同时验证 `BOSS` 角色和唯一企业微信 UserID。
- 管理员不能代替老板审批。
- 企业微信应用可见范围不能替代服务端 API 鉴权。
- 测试数据和测试角色入口不得出现在正式构建中。
