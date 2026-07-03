<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, isMockMode } from './api'
import type { Application, ApprovalGroup, BossStatus, PersonalScheduleInput, Reminder, Schedule, User, View } from './types'
import ManagementApp from './ManagementApp.vue'
import AdminApp from './AdminApp.vue'

type PreviewRole = 'BOSS' | 'MANAGEMENT' | 'ADMIN'

const user = ref<User | null>(null)
const loading = ref(false)
const view = ref<View>('today')
const status = ref<BossStatus>('available')
const schedules = ref<Schedule[]>([])
const approvals = ref<ApprovalGroup[]>([])
const reminders = ref<Reminder[]>([])
const dialog = ref<'status' | 'schedule' | null>(null)
const message = ref('')
const form = ref<PersonalScheduleInput>({ title: '外出拜访', start: '10:00', end: '15:00', type: 'out', visibility: 'management' })
const statusDraft = ref<BossStatus>('available')
const dndDuration = ref('')
const labels: Record<BossStatus, string> = { available: '有空', meeting: '会议中', out: '外出中', dnd: '勿扰' }
const titles: Record<View, string> = { today: '今日安排', approvals: '预约审批', calendar: '日历', reminders: '提醒中心' }
const visibilityLabels = { management: '管理层可见', occupied: '仅显示占用', private: '仅老板和管理员可见' }
const pending = computed(() => approvals.value.flatMap(item => item.applications).filter(item => item.status === 'pending').length)
const unread = computed(() => reminders.value.filter(item => !item.read).length)
const now = new Date()
const todayLabel = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(now)
const todayIso = toLocalIso(now)
const selectedDate = ref(todayIso)
const calendarCursor = ref(new Date(now.getFullYear(), now.getMonth(), 1))
const agendaHours = Array.from({ length: 14 }, (_, index) => index + 8)
const calendarTitle = computed(() => `${calendarCursor.value.getFullYear()}年${calendarCursor.value.getMonth() + 1}月`)
const selectedDateLabel = computed(() => new Intl.DateTimeFormat('zh-CN', {
  month: 'long', day: 'numeric', weekday: 'long',
}).format(parseLocalIso(selectedDate.value)))
const selectedSchedules = computed(() => selectedDate.value === todayIso ? schedules.value : [])
const calendarDays = computed(() => {
  const year = calendarCursor.value.getFullYear()
  const month = calendarCursor.value.getMonth()
  const first = new Date(year, month, 1)
  const mondayOffset = (first.getDay() + 6) % 7
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(year, month, index - mondayOffset + 1)
    const iso = toLocalIso(date)
    return {
      iso,
      label: date.getDate(),
      inMonth: date.getMonth() === month,
      today: iso === todayIso,
      selected: iso === selectedDate.value,
      hasEvents: iso === todayIso && schedules.value.length > 0,
    }
  })
})

function toLocalIso(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function parseLocalIso(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year!, month! - 1, day!)
}

function changeMonth(offset: number) {
  calendarCursor.value = new Date(calendarCursor.value.getFullYear(), calendarCursor.value.getMonth() + offset, 1)
}

function eventsAtHour(hour: number) {
  return selectedSchedules.value.filter(item => Number(item.start.slice(0, 2)) === hour)
}

let toastTimer: ReturnType<typeof setTimeout> | undefined
function notify(text: string) {
  message.value = text
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { message.value = '' }, 2400)
}

function errorMessage(error: unknown) {
  notify(error instanceof Error ? error.message : '操作失败，请稍后重试')
}

async function load() {
  [schedules.value, approvals.value, reminders.value] = await Promise.all([
    api.getToday(), api.getApprovals(), api.getReminders(),
  ])
}

async function login(forcedPreviewRole?: PreviewRole) {
  loading.value = true
  try {
    const params = new URLSearchParams(location.search)
    const previewRole = isMockMode ? forcedPreviewRole ?? params.get('previewRole') : null
    const code = previewRole === 'MANAGEMENT' ? 'preview-management'
      : previewRole === 'ADMIN' ? 'preview-admin'
      : params.get('code') || undefined
    user.value = await api.loginWithWeCom(code)
    if (user.value.role === 'BOSS') await load()
    notify(`已识别企业身份：${user.value.name}`)
  } catch (error) {
    user.value = null
    errorMessage(error)
  } finally {
    loading.value = false
  }
}

async function loginAsPreview(role: PreviewRole) {
  const params = new URLSearchParams(location.search)
  params.set('previewRole', role)
  history.replaceState(null, '', `${location.pathname}?${params.toString()}`)
  await login(role)
}

function exitPreview() {
  user.value = null
  const params = new URLSearchParams(location.search)
  params.delete('previewRole')
  history.replaceState(null, '', params.size ? `${location.pathname}?${params.toString()}` : location.pathname)
}

async function saveStatus() {
  try {
    await api.changeStatus(statusDraft.value, dndDuration.value ? Number(dndDuration.value) : undefined)
    status.value = statusDraft.value
    dialog.value = null
    notify(status.value === 'dnd' && !dndDuration.value
      ? '勿扰已开启，1小时后将提醒您确认状态'
      : `状态已切换为${labels[status.value]}`)
  } catch (error) { errorMessage(error) }
}

async function saveSchedule() {
  if (!form.value.title.trim()) return notify('请填写行程名称')
  if (form.value.start >= form.value.end) return notify('结束时间必须晚于开始时间')
  try {
    schedules.value.push(await api.createPersonalSchedule({ ...form.value, title: form.value.title.trim() }))
    dialog.value = null
    notify('个人行程已保存')
  } catch (error) { errorMessage(error) }
}

async function decide(groupId: string, application: Application, decision: 'approve' | 'reject') {
  try {
    await api.decideApplication(groupId, application.id, decision, application.version)
    approvals.value = await api.getApprovals()
    notify(decision === 'approve' ? '已通过申请，重叠申请已自动拒绝' : '申请已拒绝')
  } catch (error) {
    errorMessage(error)
    approvals.value = await api.getApprovals().catch(() => approvals.value)
  }
}

async function readAll() {
  try {
    await api.markAllRemindersRead()
    reminders.value = await api.getReminders()
    notify('提醒已全部标为已读')
  } catch (error) { errorMessage(error) }
}

onMounted(() => {
  const hasOAuthCode = new URLSearchParams(location.search).has('code')
  if (hasOAuthCode || (isMockMode && import.meta.env.VITE_AUTO_LOGIN === 'true')) void login()
})
</script>

<template>
  <main class="shell"><section class="phone">
    <Transition name="toast"><div v-if="message" class="toast">{{ message }}</div></Transition>
    <section v-if="!user && isMockMode" class="demo-role-page">
      <div class="demo-role-hero">
        <div class="brand"><span class="logo">日</span>Jarsking日程</div>
        <span class="demo-badge">TEST</span>
        <h1>选择测试角色</h1>
        <p>使用示例数据检查三个角色的手机端界面和操作流程。</p>
      </div>
      <div class="demo-role-list">
        <button :disabled="loading" @click="loginAsPreview('BOSS')"><span class="role-icon boss">石</span><span><b>老板端</b><small>个人日程、状态管理与预约审批</small></span><i>›</i></button>
        <button :disabled="loading" @click="loginAsPreview('MANAGEMENT')"><span class="role-icon management">管</span><span><b>管理层端</b><small>查看占用、查询会议室与发起申请</small></span><i>›</i></button>
        <button :disabled="loading" @click="loginAsPreview('ADMIN')"><span class="role-icon admin">理</span><span><b>管理员端</b><small>成员权限、会议室资源与系统配置</small></span><i>›</i></button>
        <div class="demo-notice"><b>测试模式</b><p>暂不绑定企业微信 UserID，不会发送真实消息；正式部署时将自动隐藏本页面。</p></div>
      </div>
    </section>
    <section v-else-if="!user" class="login">
      <div class="login-hero">
        <div class="brand"><span class="logo">日</span>Jarsking日程</div>
        <h1>石总行程<br>与预约中心</h1>
        <p>个人行程、会议审批与状态提醒统一管理</p>
      </div>
      <div class="login-card">
        <h2>企业身份登录</h2>
        <p>正式环境通过企业微信 OAuth 获取 UserID，并由服务端识别角色。</p>
        <button class="primary" :disabled="loading" @click="login()">{{ loading ? '正在识别身份并分配页面…' : '企业微信一键登录' }}</button>
        <div class="safe">登录后由服务端识别企业微信 UserID 与角色，自动进入老板端、管理层端或管理员端。</div>
      </div>
    </section>

    <ManagementApp v-else-if="user.role === 'MANAGEMENT'" :user="user" @notify="notify" />
    <AdminApp v-else-if="user.role === 'ADMIN'" :user="user" @notify="notify" />
    <template v-else-if="user.role === 'BOSS'">
      <header class="top"><div><h1>{{ titles[view] }}</h1></div><button class="avatar">石总</button></header>
      <div class="content">
        <section v-if="view === 'today'">
          <div class="hero">
            <div><small>{{ todayLabel }}</small><h2>您好，石总</h2><p>统一查看今天的行程与待审批会议</p></div>
            <button class="status" @click="statusDraft = status; dialog = 'status'"><i></i>{{ labels[status] }}⌄</button>
            <div class="stats"><span><b>{{ schedules.length }}</b>今日安排</span><span><b>{{ pending }}</b>待审批</span><span><b>{{ unread }}</b>未读提醒</span></div>
          </div>
          <div class="section-title"><h2>今日时间线</h2><span>每日09:00自动发送摘要</span></div>
          <div class="timeline">
            <article v-for="item in schedules" :key="item.id"><time>{{ item.start }}</time><i :class="item.type"></i><div><h3>{{ item.title }}</h3><p>{{ item.end }} <template v-if="item.location">· {{ item.location }}</template> · {{ visibilityLabels[item.visibility] }}</p></div></article>
          </div>
          <div class="quick quick-bottom">
            <button class="status-action" @click="statusDraft = status; dialog = 'status'"><b>● 状态更改</b><small>设置有空、会议、外出或勿扰</small></button>
            <button @click="dialog = 'schedule'"><b>＋ 个人行程</b><small>会议、外出或其他安排</small></button>
          </div>
        </section>

        <section v-else-if="view === 'approvals'">
          <div class="section-title first"><h2>按时间段审批</h2><span>同一时段可多人申请</span></div>
          <article v-for="group in approvals" :key="group.id" class="card group">
            <header><div><h3>{{ group.start }}—{{ group.end }}</h3><p>通过一人后，仅自动拒绝与其时间重叠的申请</p></div><b>{{ group.applications.filter(item => item.status === 'pending').length }}份待审</b></header>
            <div v-for="application in group.applications" :key="application.id" class="candidate">
              <div><strong>{{ application.applicant }} · {{ application.department }}</strong><small>{{ application.submittedAt }}</small></div>
              <p>{{ application.start }}—{{ application.end }} · {{ application.topic }}<br>申请会议室：{{ application.room }}</p>
              <div v-if="application.status === 'pending'" class="actions"><button @click="decide(group.id, application, 'reject')">拒绝</button><button @click="decide(group.id, application, 'approve')">通过此申请</button></div>
              <span v-else class="result" :class="application.status">{{ application.status === 'approved' ? '已通过' : '已拒绝' }}</span>
            </div>
          </article>
        </section>

        <section v-else-if="view === 'calendar'" class="calendar-page">
          <div class="calendar-card">
            <header class="calendar-head">
              <button aria-label="上个月" @click="changeMonth(-1)">‹</button>
              <h2>{{ calendarTitle }}</h2>
              <button aria-label="下个月" @click="changeMonth(1)">›</button>
            </header>
            <div class="weekdays"><span v-for="day in ['一','二','三','四','五','六','日']" :key="day">{{ day }}</span></div>
            <div class="month-grid">
              <button v-for="day in calendarDays" :key="day.iso" :class="{ muted: !day.inMonth, today: day.today, selected: day.selected }" @click="selectedDate = day.iso">
                <span>{{ day.label }}</span><i v-if="day.hasEvents"></i>
              </button>
            </div>
          </div>
          <div class="agenda-head"><div><h2>{{ selectedDateLabel }}</h2><p>{{ selectedSchedules.length ? `${selectedSchedules.length}项安排` : '暂无安排' }}</p></div><button @click="selectedDate = todayIso; calendarCursor = new Date(now.getFullYear(), now.getMonth(), 1)">今天</button></div>
          <div class="agenda-scroll">
            <div v-for="hour in agendaHours" :key="hour" class="agenda-row">
              <time>{{ String(hour).padStart(2, '0') }}:00</time>
              <div class="agenda-slot">
                <article v-for="item in eventsAtHour(hour)" :key="item.id" :class="item.type">
                  <strong>{{ item.title }}</strong><span>{{ item.start }}—{{ item.end }}<template v-if="item.location"> · {{ item.location }}</template></span>
                </article>
              </div>
            </div>
          </div>
        </section>

        <section v-else-if="view === 'reminders'">
          <div class="section-title first"><h2>消息与提醒</h2><button @click="readAll">全部已读</button></div>
          <article v-for="item in reminders" :key="item.id" class="notice" :class="{ read: item.read }"><span>醒</span><div><h3>{{ item.title }}</h3><p>{{ item.detail }}</p></div><time>{{ item.time }}</time></article>
        </section>
      </div>
      <nav><button v-for="item in ([['today','今日'],['approvals','审批'],['calendar','日历'],['reminders','提醒']] as const)" :key="item[0]" :class="{ active: view === item[0] }" @click="view = item[0]"><b>{{ item[0] === 'today' ? '▣' : item[0] === 'approvals' ? '✓' : item[0] === 'calendar' ? '▦' : '●' }}</b>{{ item[1] }}<em v-if="item[0] === 'approvals' && pending">{{ pending }}</em><em v-if="item[0] === 'reminders' && unread">{{ unread }}</em></button></nav>
      <button v-if="view === 'today'" class="voice-fab" aria-label="语音录入" @click="notify('语音录入将在后端接入腾讯云 ASR 与 DeepSeek')">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 1 0-7 0v5A3.5 3.5 0 0 0 12 15Z"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6"/></svg>
      </button>
    </template>
    <button v-if="user && isMockMode" class="demo-exit" @click="exitPreview">切换角色</button>
    <div v-if="dialog" class="overlay" @click.self="dialog = null"><section class="sheet" :class="{ 'status-sheet': dialog === 'status' }"><div class="handle"></div><button class="close" @click="dialog = null">×</button>
      <template v-if="dialog === 'status'">
        <h2>切换当前状态</h2><p class="muted">勿扰只表示请勿当面打扰，不影响预约和审批。</p>
        <div class="status-grid"><button v-for="(label, key) in labels" :key="key" :class="{ selected: statusDraft === key }" @click="statusDraft = key as BossStatus"><b>{{ label }}</b><small>{{ key === 'dnd' ? '请勿当面打扰' : key === 'available' ? '可正常申请会议' : '当前时间不可预约' }}</small></button></div>
        <label v-if="statusDraft !== 'available'" class="duration-field">{{ labels[statusDraft] }}持续时间（选填）<select v-model="dndDuration"><option value="">不设置时间</option><option value="30">30分钟</option><option value="60">1小时</option><option value="120">2小时</option></select></label>
        <button class="primary" @click="saveStatus">确认状态</button>
      </template>
      <template v-else>
        <h2>录入个人行程</h2><p class="muted">保存后对应时段不可预约。</p>
        <label>行程名称<input v-model="form.title"></label>
        <div class="two"><label>开始时间<input v-model="form.start" type="time"></label><label>结束时间<input v-model="form.end" type="time"></label></div>
        <label>行程类型<select v-model="form.type"><option value="out">外出</option><option value="meeting">会议</option><option value="personal">其他</option></select></label>
        <label>可见范围<select v-model="form.visibility"><option value="management">管理层可见</option><option value="occupied">仅显示占用</option><option value="private">仅老板和管理员可见</option></select></label>
        <button class="primary" @click="saveSchedule">保存个人行程</button>
      </template>
    </section></div>
  </section></main>
</template>
