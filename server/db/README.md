# PostgreSQL 数据库

## 结构

- `migrations/001_initial_schema.sql`：用户、角色、老板状态、会议室、日程、申请审批、通知 Outbox、语音指令和审计日志。
- `migrations/002_seed_meeting_rooms.sql`：公司现有六个会议室。
- `private/seed_role_members.sql`：由 `角色名单.xlsx` 生成的真实成员数据。该目录被 Git 忽略，不得上传公开仓库。

## 设计原则

- 企业微信 `UserID` 是登录身份主键，姓名只用于展示。
- 用户和角色分表，数据库约束最多只能存在一个 `BOSS` 角色。
- 个人行程和批准会议统一写入 `schedule_entries`。
- `tstzrange + GiST` 排他约束阻止老板或会议室发生并发双订。
- 申请审批、正式日程、自动拒绝、Outbox 和审计必须在同一事务内完成。
- `BOSS_ONLY` 内容对其他角色只能返回“已占用”或“个人行程”，不能返回标题和详情。
- AI 只写入待确认的 `voice_commands`；确认前不能直接修改业务数据。

## 执行

设置连接字符串后运行：

```bash
export DATABASE_URL='postgresql://user:password@host:5432/jarsking_schedule'
export DATABASE_SSL=false
npm run db:migrate
npm run db:seed:roles
```

迁移文件应用后不可修改。迁移器会记录 SHA-256 校验值，发现已执行文件被改动时拒绝继续。

## 当前名单

Excel 校验结果为 17 名有效成员：

- `BOSS`：1
- `MANAGEMENT`：15
- `ADMIN`：1

所有成员均具备姓名、职位、角色、企微 UserID 和部门；导入状态为 `ACTIVE`。
