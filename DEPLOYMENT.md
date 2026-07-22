# 部署说明

## 推荐结构

测试应用应使用独立目录、容器和域名，不覆盖同一服务器上的其他应用。

```text
公网 80/443 入口 Nginx
├─ 原有域名 → 原应用
└─ 测试域名 → jarsking_schedule_test 容器
```

测试容器只加入共享 Docker 网络，不直接映射公网端口。入口 Nginx 根据 `server_name` 转发流量。

## Web 构建

```bash
cd web
npm ci
npm test
npm run build
```

将 `web/dist/` 内容部署到测试容器的静态网站目录。测试环境可启用 Mock；正式环境必须关闭 Mock 并设置真实 API 地址。

## HTTPS

1. 为测试子域名单独申请 DV 证书。
2. 使用 DNS 方式验证域名所有权，避免停止现有 80/443 服务。
3. 下载 Nginx 格式证书。
4. 私钥只保存在服务器受限目录，不进入 Git。
5. 新增独立 Nginx `server` 配置。
6. 修改前备份，执行 `nginx -t` 后只做平滑 reload。

## 企业微信域名校验

从企业微信后台下载 `WW_verify_*.txt`，放入测试站点根目录，确保以下地址能够直接返回原始文件内容：

```text
https://<test-domain>/WW_verify_xxxxx.txt
```

该地址不能要求登录、不能返回 SPA 首页，也不能跳转到其他域名。

## 企业微信配置

- 创建自建应用并限制测试成员可见范围。
- 应用主页指向测试域名。
- 配置可信域名和服务器固定出口 IP。
- Secret 只写入服务端环境变量或密钥管理服务。
- 测试阶段可保留示例数据；接入 OAuth 后由后端根据 UserID 分配角色。

## 数据库

独立 PostgreSQL 16 数据库已建立，但测试前端仍使用内存示例数据。数据库当前包含：

- 用户与角色
- 老板状态与个人行程
- 会议室资源
- 预约申请与审批结果
- 通知 Outbox
- 审计日志

数据库未映射宿主机公网端口，只允许 Docker 内网访问。Redis 同样不应直接绑定公网地址，云防火墙也不应开放其服务端口。

## 后端 API 容器

测试后端使用 `jarsking_schedule_api` 容器，加入 `deploy_default` 网络且不映射宿主机端口。运行环境写入服务器的 `/opt/jarsking-schedule/env/backend-runtime.env`，权限为 `600`，不得提交 Git。

部署脚本为 `deploy/install-api.sh`。它会从数据库读取唯一老板身份、重建 API 容器，并检查：

```text
GET /api/v1/health -> {"status":"ok","database":"connected"}
```

在企微 OAuth 会话完成前，除健康检查外的业务接口保持默认拒绝访问，这是预期安全行为。

### 启用企业微信 OAuth

在服务器创建仅 root 可读的 `/opt/jarsking-schedule/env/backend-wecom.env`：

```dotenv
WECOM_AUTH_ENABLED=true
APP_BASE_URL=https://schedule-test.jarsking.cn
WECOM_CORP_ID=企业ID
WECOM_AGENT_ID=自建应用AgentId
WECOM_APP_SECRET=自建应用Secret
WECOM_REDIRECT_URI=https://schedule-test.jarsking.cn/api/v1/auth/wecom/callback
SESSION_MAX_AGE_SECONDS=43200
```

文件权限设为 `600` 后重新执行 `deploy/install-api.sh`。Secret 不得通过聊天、截图、Git 或前端环境变量传递；应在服务器终端直接录入。

### 启用 DeepSeek 语音纠错

在服务器创建 `/opt/jarsking-schedule/env/backend-ai.env`，权限必须为 `600`：

```dotenv
DEEPSEEK_API_KEY=在服务器终端填写
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

该文件由部署脚本合并进后端运行环境，不得提交 Git 或发送到聊天中。

## 回滚原则

- 不覆盖或删除原应用容器。
- 不修改原应用静态文件。
- 新域名配置必须独立。
- Nginx 配置测试失败时恢复备份。
- 新测试容器出现问题时，仅停止或删除新容器。
