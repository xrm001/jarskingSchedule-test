# Jarsking 日程

面向企业微信自建应用的移动端日程与会议预约系统。当前预约对象为石总，应用根据企业身份进入老板端、管理层端或管理员端。

测试地址：[https://schedule-test.jarsking.cn/](https://schedule-test.jarsking.cn/)

三角色界面演示版：[https://schedule-test.jarsking.cn/role-preview/](https://schedule-test.jarsking.cn/role-preview/)

> 当前版本仍处于测试联调阶段，已接入企微 OAuth、PostgreSQL 用户角色、会议室、日程与预约数据。请勿录入不必要的敏感业务信息。

## 当前进度

### 老板端

- 今日时间线、当前状态与个人行程录入。
- 按时间段审批会议申请；批准后自动拒绝重叠申请。
- 管理层成员多选及“组织开会”表单。
- 周视图日历，可展开整月；历史日期不可选择。
- 四个页面统一提供“按住说话、松开识别”的语音入口。
- 语音转写结果和 AI 意图必须由老板确认后，才进入状态、审批、个人行程或组织会议流程。

### 管理层端

- 只以“已占用”形式查看石总忙碌时段。
- 查询 `09:00—18:00` 的会议室可用情况。
- 提交会议申请并查看申请状态。

### 管理员端

- 成员与角色配置。
- 会议室资源管理。
- 预约概览及企微、语音服务配置状态展示。
- 管理员不能代替老板审批。

## 技术栈

- Web：Vue 3、TypeScript、Vite、Vitest
- Server：NestJS、Fastify、TypeScript、Vitest
- 部署：Nginx、Docker、HTTPS
- 已建立：PostgreSQL 16 数据结构、迁移、角色名单和会议室种子
- 已接入：企业微信 OAuth、服务端安全会话、PostgreSQL Repository
- 计划接入：企业微信应用消息、腾讯云 ASR、DeepSeek

## 项目结构

```text
.
├─ web/                  Vue 移动端应用
├─ server/               NestJS 后端与领域逻辑
├─ deploy/               测试环境 Nginx 配置
├─ PROJECT_HANDOFF.md    项目交接与下一阶段工作
├─ DEPLOYMENT.md         部署、HTTPS 与企微接入说明
└─ DECISIONS.md          产品和技术决策记录
```

## 本地运行

### Web

```bash
cd web
npm ci
```

复制环境变量示例，并在本地启用 Mock：

```env
VITE_USE_MOCK=true
VITE_DEMO_MODE=false
VITE_API_BASE_URL=/api
VITE_AUTO_LOGIN=false
```

```bash
npm run dev
```

### Server

```bash
cd server
npm ci
npm run build
npm start
```

## 测试与构建

```bash
cd web
npm test
npm run build

cd ../server
npm test
npm run build
```

测试环境构建可设置：

```env
VITE_DEMO_MODE=true
VITE_AUTO_LOGIN=true
```

正式环境必须关闭演示模式，并由服务端根据企业微信 UserID 分配真实角色。

## 尚未完成

- 企业微信指定成员消息及会前 `60` 分钟、`10` 分钟提醒。
- 腾讯云 ASR 实时录音上传与 DeepSeek 意图解析。
- PostgreSQL 自动备份和监控。

当前语音与消息通知页面属于前端流程演示，尚不会发送真实企微消息或调用真实语音接口。

## 安全说明

- 不要提交 `.env`、企业微信 Secret、API Key、数据库密码或证书私钥。
- 企业微信可见范围不能替代服务端鉴权。
- AI 解析结果必须经过 Schema 校验和用户确认后才能执行。
- 测试角色入口和示例数据不得进入正式生产构建。

更多信息请参阅 [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md)、[DEPLOYMENT.md](DEPLOYMENT.md) 和 [DECISIONS.md](DECISIONS.md)。
