<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, isMockMode } from './api'
import type { Application, ApprovalGroup, BossStatus, PersonalScheduleInput, Reminder, Schedule, User, View, VoiceAnalysisResult } from './types'
import ManagementApp from './ManagementApp.vue'
import AdminApp from './AdminApp.vue'

type PreviewRole = 'BOSS' | 'MANAGEMENT' | 'ADMIN'
type TestRole = PreviewRole

const user = ref<User | null>(null)
const loading = ref(false)
const view = ref<View>('today')
const status = ref<BossStatus>('available')
const schedules = ref<Schedule[]>([])
const approvals = ref<ApprovalGroup[]>([])
const reminders = ref<Reminder[]>([])
const dialog = ref<'status' | 'schedule' | 'meeting' | 'voice' | 'visibilityReminder' | null>(null)
const message = ref('')
const form = ref<PersonalScheduleInput>({ title: '外出拜访', start: '10:00', end: '15:00', type: 'out', visibility: 'management' })
const statusDraft = ref<BossStatus>('available')
const dndDuration = ref('')
const labels: Record<BossStatus, string> = { available: '有空', meeting: '会议中', out: '外出中', dnd: '勿扰' }
const titles: Record<View, string> = { today: '今日安排', approvals: '预约审批', organization: '组织开会', calendar: '日历' }
const visibilityLabels = { management: '内容全员可见', occupied: '仅显示占用', private: '内容仅自己可见' }
const pending = computed(() => approvals.value.flatMap(item => item.applications).filter(item => item.status === 'pending').length)
const unread = computed(() => reminders.value.filter(item => !item.read).length)
const now = new Date()
const todayLabel = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(now)
const todayIso = toLocalIso(now)
const selectedDate = ref(todayIso)
const calendarCursor = ref(new Date(now.getFullYear(), now.getMonth(), 1))
const calendarExpanded = ref(false)
const agendaHours = Array.from({ length: 14 }, (_, index) => index + 8)
const managementMembers = ref<{ id:string; name:string; department:string; title:string; avatar:string }[]>([])
const selectedMembers = ref<string[]>([])
const meetingForm = ref({ date: todayIso, time: '10:00', duration: '30', customDuration: '', topic: '' })
const voiceStage = ref<'idle' | 'recording' | 'result'>('idle')
const voiceText = ref('')
const voiceIntent = ref<'schedule' | 'status' | 'meeting' | 'approval'>('schedule')
const voiceHolding = ref(false)
const voiceIntentLabels = { schedule: '录入个人行程', status: '更改当前状态', meeting: '组织开会', approval: '进行审批' }
const voiceScheduleNeedsVisibility = ref(false)
const voiceAnalysis = ref<VoiceAnalysisResult | null>(null)
const voiceSelections = ref<Record<string,string>>({})
const voiceConfirmedCandidates = ref<Array<{id:string;name:string}>>([])
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
      past: iso < todayIso,
      hasEvents: iso === todayIso && schedules.value.length > 0,
    }
  })
})
const weekDays = computed(() => {
  const selected = parseLocalIso(selectedDate.value)
  const mondayOffset = (selected.getDay() + 6) % 7
  const monday = new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() - mondayOffset)
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index)
    const iso = toLocalIso(date)
    return { iso, label: date.getDate(), selected: iso === selectedDate.value, today: iso === todayIso, past: iso < todayIso }
  })
})
const selectedMemberNames = computed(() => [...new Set([
  ...managementMembers.value.filter(item => selectedMembers.value.includes(item.id)).map(item => item.name),
  ...voiceConfirmedCandidates.value.filter(item=>selectedMembers.value.includes(item.id)).map(item=>item.name),
])])

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

function selectCalendarDate(iso: string) {
  if (iso < todayIso) return
  selectedDate.value = iso
}

function toggleMember(id: string) {
  selectedMembers.value = selectedMembers.value.includes(id)
    ? selectedMembers.value.filter(item => item !== id)
    : [...selectedMembers.value, id]
}

function openMeetingDialog() {
  if (!selectedMembers.value.length) return notify('请先选择参会管理层成员')
  meetingForm.value = { date: todayIso, time: '10:00', duration: '30', customDuration: '', topic: '' }
  dialog.value = 'meeting'
}

async function submitMeeting() {
  const duration = meetingForm.value.duration === 'custom'
    ? Number(meetingForm.value.customDuration)
    : Number(meetingForm.value.duration)
  if (meetingForm.value.date < todayIso) return notify('会议日期不能早于今天')
  if (!meetingForm.value.topic.trim()) return notify('请填写会议内容')
  if (!duration || duration < 5) return notify('请填写有效的会议时长')
  try {
    const schedule = await api.organizeMeeting({
      participantIds:selectedMembers.value,
      startAt:`${meetingForm.value.date}T${meetingForm.value.time}:00+08:00`,
      durationMinutes:duration,
      topic:meetingForm.value.topic.trim(),
    })
    if (meetingForm.value.date === todayIso) schedules.value = await api.getToday().catch(() => [...schedules.value, schedule])
    dialog.value = null
    const sent = schedule.notifications?.sent ?? 0
    const failed = schedule.notifications?.failed ?? 0
    notify(failed ? `会议已组织，${sent}人已收到提醒，${failed}人发送失败` : `会议已组织，已提醒${selectedMemberNames.value.join('、')}`)
    selectedMembers.value = []
  } catch (error) { errorMessage(error) }
}

function inferVoiceIntent() {
  voiceIntent.value = view.value === 'approvals' ? 'approval' : view.value === 'organization' ? 'meeting' : 'schedule'
}

let wecomVoiceReady:Promise<void>|null=null

function loadWeComScript():Promise<void> {
  if(window.wx) return Promise.resolve()
  return new Promise((resolve,reject)=>{
    const existing=document.querySelector<HTMLScriptElement>('script[data-wecom-jssdk]')
    if(existing){existing.addEventListener('load',()=>resolve(),{once:true});existing.addEventListener('error',()=>reject(new Error('企微录音组件加载失败')),{once:true});return}
    const script=document.createElement('script')
    script.src='https://res.wx.qq.com/open/js/jweixin-1.6.0.js';script.async=true;script.dataset.wecomJssdk='true'
    script.onload=()=>resolve();script.onerror=()=>reject(new Error('企微录音组件加载失败'));document.head.appendChild(script)
  })
}

function prepareWeComVoice():Promise<void> {
  if(isMockMode) return Promise.resolve()
  if(wecomVoiceReady) return wecomVoiceReady
  wecomVoiceReady=(async()=>{
    await loadWeComScript()
    const wx=window.wx
    if(!wx) throw new Error('当前环境不支持企微录音')
    const url=location.href.split('#')[0]!
    const signature=await api.getWeComVoiceSignature(url)
    await new Promise<void>((resolve,reject)=>{
      wx.ready(resolve);wx.error(reject)
      wx.config({beta:true,debug:false,appId:signature.corpId,timestamp:signature.timestamp,nonceStr:signature.nonceStr,signature:signature.signature,jsApiList:signature.jsApiList})
    })
    if(wx.agentConfig) await new Promise<void>((resolve,reject)=>wx.agentConfig!({corpid:signature.corpId,agentid:signature.agentId,timestamp:signature.timestamp,nonceStr:signature.nonceStr,signature:signature.agentSignature,jsApiList:signature.jsApiList,success:resolve,fail:reject}))
  })().catch(error=>{wecomVoiceReady=null;throw error})
  return wecomVoiceReady
}

async function analyzeVoiceText(transcript:string) {
  voiceText.value=transcript.trim()
  dialog.value='voice';voiceStage.value='result';voiceAnalysis.value=null;voiceSelections.value={}
  if(!voiceText.value) return notify('未识别到语音文字，请重试或手动输入')
  try {
    const scene=voiceIntent.value==='meeting'?'boss_invite':voiceIntent.value==='status'?'boss_status':voiceIntent.value==='approval'?'boss_approval':'boss_schedule'
    const result=await api.parseVoiceText(scene,voiceText.value)
    voiceAnalysis.value=result;voiceText.value=result.correctedTranscript
    const intentMap={CHANGE_STATUS:'status',CREATE_SCHEDULE:'schedule',ORGANIZE_MEETING:'meeting',APPROVE_REQUEST:'approval',UNKNOWN:voiceIntent.value} as const
    voiceIntent.value=intentMap[result.intent]
    voiceSelections.value=Object.fromEntries(result.personMatches.map(match=>[match.spokenName,'']))
  } catch(error) { notify(error instanceof Error?error.message:'AI解析失败，可修改文字后重试') }
}

async function finishVoiceHold() {
  if (!voiceHolding.value) return
  voiceHolding.value = false
  window.removeEventListener('pointerup', finishVoiceHold)
  window.removeEventListener('pointercancel', finishVoiceHold)
  if(!isMockMode){
    const wx=window.wx
    if(!wx) return notify('企微录音尚未准备好，请重试')
    try {
      const localId=await new Promise<string>((resolve,reject)=>wx.stopRecord({success:(res:{localId:string})=>resolve(res.localId),fail:reject}))
      const transcript=await new Promise<string>((resolve,reject)=>wx.translateVoice({localId,isShowProgressTips:0,success:(res:{translateResult:string})=>resolve(res.translateResult),fail:reject}))
      await analyzeVoiceText(transcript)
    } catch { notify('企微语音转文字失败，请重试或使用文字输入') }
    return
  }
  const samples = {
    schedule: '今天下午三点到四点外出拜访客户。',
    status: '将我的状态改为外出中，持续一小时。',
    meeting: '今天下午两点组织陈经理和林总监开会半小时，讨论七月经营计划。',
    approval: '通过陈经理今天上午十点的会议申请。',
  }
  voiceText.value = samples[voiceIntent.value]
  await analyzeVoiceText(voiceText.value)
}

async function startVoiceHold() {
  if (voiceHolding.value) return
  inferVoiceIntent()
  voiceText.value = ''
  voiceAnalysis.value=null;voiceConfirmedCandidates.value=[]
  try { await prepareWeComVoice() } catch(error) { notify(error instanceof Error?error.message:'企微录音初始化失败');dialog.value='voice';return }
  voiceStage.value = 'recording'
  voiceHolding.value = true
  if(!isMockMode) window.wx?.startRecord({cancel:()=>{voiceHolding.value=false;notify('录音授权已取消')}})
  window.addEventListener('pointerup', finishVoiceHold, { once: true })
  window.addEventListener('pointercancel', finishVoiceHold, { once: true })
}

async function confirmVoice() {
  if (!voiceText.value.trim()) return notify('请先确认语音转写内容')
  if(!voiceAnalysis.value||voiceText.value.trim()!==voiceAnalysis.value.correctedTranscript.trim()){
    await analyzeVoiceText(voiceText.value)
    return notify('已重新纠错和解析，请再次确认结果')
  }
  if(voiceAnalysis.value.personMatches.length){
    const selections=voiceAnalysis.value.personMatches.map(match=>({spokenName:match.spokenName,userId:voiceSelections.value[match.spokenName]||''}))
    if(selections.some(item=>!item.userId)) return notify('请确认所有识别到的人员')
    await api.confirmVoicePersons({recordId:voiceAnalysis.value.recordId,confirmationToken:voiceAnalysis.value.confirmationToken,selections})
    voiceConfirmedCandidates.value=selections.map(item=>{
      const candidate=voiceAnalysis.value!.personMatches.find(match=>match.spokenName===item.spokenName)!.candidates.find(person=>person.id===item.userId)!
      return {id:candidate.id,name:candidate.name}
    })
    selectedMembers.value=voiceConfirmedCandidates.value.map(item=>item.id)
  }
  if (voiceIntent.value === 'schedule') {
    voiceScheduleNeedsVisibility.value = !/(全员可见|仅自己可见|自己可见|管理层可见|公开|私密)/.test(voiceText.value)
    form.value = { title: '外出拜访客户', start: '15:00', end: '16:00', type: 'out', visibility: 'management' }
    dialog.value = 'schedule'
  } else if (voiceIntent.value === 'status') {
    statusDraft.value = 'out'
    dndDuration.value = '60'
    dialog.value = 'status'
  } else if (voiceIntent.value === 'meeting') {
    const parsed=voiceAnalysis.value.parsed
    meetingForm.value = { date:typeof parsed.startDate==='string'?parsed.startDate:todayIso, time:typeof parsed.startTime==='string'?parsed.startTime:'14:00', duration:typeof parsed.durationMinutes==='number'?String(parsed.durationMinutes):'30', customDuration: '', topic: typeof parsed.topic==='string'?parsed.topic:'' }
    dialog.value = 'meeting'
  } else {
    const group = approvals.value.find(item => item.applications.some(application => application.status === 'pending'))
    const application = group?.applications.find(item => item.status === 'pending')
    if (group && application) await decide(group.id, application, 'approve')
    dialog.value = null
  }
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

async function loadManagementDirectory() {
  const members = await api.getManagementDirectory()
  managementMembers.value = members.map(member => ({
    id:member.id,
    name:member.displayName,
    department:member.department || '未设置部门',
    title:member.jobTitle || '管理层',
    avatar:member.displayName.slice(0, 1),
  }))
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
    if (user.value.role === 'BOSS') {
      await Promise.all([
        load().catch(() => notify('身份识别成功，日程数据接口正在接入')),
        loadManagementDirectory().catch(() => notify('管理层名单加载失败，请稍后重试')),
      ])
    }
    notify(`已识别企业身份：${user.value.name}`)
  } catch (error) {
    user.value = null
    if (!isMockMode) {
      const returnPath = `${location.pathname}${location.search}`
      location.assign(`/api/v1/auth/wecom/start?returnPath=${encodeURIComponent(returnPath)}`)
      return
    }
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

async function switchAdminTestRole(role: TestRole) {
  const params = new URLSearchParams(location.search)
  if (role === 'ADMIN') params.delete('testRole')
  else params.set('testRole', role)
  history.replaceState(null, '', `${location.pathname}${params.size ? `?${params.toString()}` : ''}`)
  view.value = 'today'
  await login()
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
  if (voiceScheduleNeedsVisibility.value) {
    dialog.value = 'visibilityReminder'
    return
  }
  try {
    schedules.value.push(await api.createPersonalSchedule({ ...form.value, title: form.value.title.trim() }))
    dialog.value = null
    voiceScheduleNeedsVisibility.value = false
    notify('个人行程已保存')
  } catch (error) { errorMessage(error) }
}

function confirmScheduleVisibility(visibility: 'management' | 'private') {
  form.value.visibility = visibility
  voiceScheduleNeedsVisibility.value = false
  void saveSchedule()
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
  if (!isMockMode || hasOAuthCode || import.meta.env.VITE_AUTO_LOGIN === 'true') void login()
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

    <div v-if="user?.canTestRoles" class="admin-test-switch">
      <div><b>管理员测试身份</b><span>{{ user.isTestRole ? `正在模拟：${user.role}` : '当前真实管理员身份' }}</span></div>
      <button :class="{active:user.role==='BOSS'}" @click="switchAdminTestRole('BOSS')">老板端</button>
      <button :class="{active:user.role==='MANAGEMENT'}" @click="switchAdminTestRole('MANAGEMENT')">管理层端</button>
      <button :class="{active:user.role==='ADMIN' && !user.isTestRole}" @click="switchAdminTestRole('ADMIN')">管理员端</button>
    </div>

    <ManagementApp v-if="user?.role === 'MANAGEMENT'" :user="user" @notify="notify" />
    <AdminApp v-else-if="user?.role === 'ADMIN'" :user="user" @notify="notify" />
    <template v-else-if="user?.role === 'BOSS'">
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
            <button class="personal-schedule-action" @click="dialog = 'schedule'"><b>＋ 个人行程</b><small>手动录入会议、外出或其他安排</small></button>
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

        <section v-else-if="view === 'organization'" class="organization-page">
          <div class="organization-intro"><div><small>MANAGEMENT TEAM</small><h2>选择参会成员</h2><p>可同时选择多位管理层成员，提交后将通过企微发送会议提醒。</p></div><b>{{ selectedMembers.length }}人</b></div>
          <div class="member-list">
            <button v-for="member in managementMembers" :key="member.id" class="member-card" :class="{ selected: selectedMembers.includes(member.id) }" @click="toggleMember(member.id)">
              <span class="member-avatar">{{ member.avatar }}</span><span class="member-info"><b>{{ member.name }}</b><small>{{ member.title }}</small></span><i>{{ selectedMembers.includes(member.id) ? '✓' : '+' }}</i>
            </button>
          </div>
          <div class="organization-action"><span v-if="selectedMembers.length">已选择 {{ selectedMemberNames.join('、') }}</span><span v-else>请选择需要参会的管理层成员</span><button :disabled="!selectedMembers.length" @click="openMeetingDialog">组织开会</button></div>
        </section>

        <section v-else-if="view === 'calendar'" class="calendar-page">
          <div class="calendar-card">
            <header class="calendar-head">
              <button v-if="calendarExpanded" aria-label="上个月" @click="changeMonth(-1)">‹</button><span v-else></span>
              <button class="calendar-title-button" @click="calendarExpanded = !calendarExpanded"><b>{{ calendarTitle }}</b><small>{{ calendarExpanded ? '收起为本周' : '展开整月' }}⌄</small></button>
              <button v-if="calendarExpanded" aria-label="下个月" @click="changeMonth(1)">›</button><span v-else></span>
            </header>
            <div class="weekdays"><span v-for="day in ['一','二','三','四','五','六','日']" :key="day">{{ day }}</span></div>
            <div v-if="calendarExpanded" class="month-grid">
              <button v-for="day in calendarDays" :key="day.iso" :disabled="day.past || !day.inMonth" :class="{ muted: !day.inMonth || day.past, today: day.today, selected: day.selected }" @click="selectCalendarDate(day.iso)">
                <span>{{ day.label }}</span><i v-if="day.hasEvents"></i>
              </button>
            </div>
            <div v-else class="month-grid week-grid">
              <button v-for="day in weekDays" :key="day.iso" :disabled="day.past" :class="{ muted: day.past, today: day.today, selected: day.selected }" @click="selectCalendarDate(day.iso)"><span>{{ day.label }}</span></button>
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

      </div>
      <nav><button v-for="item in ([['today','今日'],['approvals','审批'],['organization','组织'],['calendar','日历']] as const)" :key="item[0]" :class="{ active: view === item[0] }" @click="view = item[0]"><b>{{ item[0] === 'today' ? '▣' : item[0] === 'approvals' ? '✓' : item[0] === 'organization' ? '＋' : '▦' }}</b>{{ item[1] }}<em v-if="item[0] === 'approvals' && pending">{{ pending }}</em></button></nav>
      <button class="voice-fab" :class="{ recording: voiceHolding }" :aria-label="voiceHolding ? '正在录音，松开结束' : '按住说话'" @pointerdown.prevent="startVoiceHold" @keydown.space.prevent="startVoiceHold" @keyup.space.prevent="finishVoiceHold" @contextmenu.prevent>
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
      <template v-else-if="dialog === 'schedule'">
        <h2>录入个人行程</h2><p class="muted">保存后对应时段不可预约。</p>
        <label>行程名称<input v-model="form.title"></label>
        <div class="two"><label>开始时间<input v-model="form.start" type="time"></label><label>结束时间<input v-model="form.end" type="time"></label></div>
        <label>行程类型<select v-model="form.type"><option value="out">外出</option><option value="meeting">会议</option><option value="personal">其他</option></select></label>
        <label>可见范围<select v-model="form.visibility" @change="voiceScheduleNeedsVisibility = false"><option value="management">内容全员可见</option><option value="private">内容仅自己可见</option></select></label>
        <button class="primary" @click="saveSchedule">保存个人行程</button>
      </template>
      <template v-else-if="dialog === 'visibilityReminder'">
        <h2>请选择可见范围</h2><p class="muted">本次语音中未识别到可见范围。为避免行程内容被错误公开，请确认后再保存。</p>
        <div class="visibility-confirm-options"><button @click="confirmScheduleVisibility('management')"><b>内容全员可见</b><small>所有应用成员可查看行程内容</small></button><button @click="confirmScheduleVisibility('private')"><b>内容仅自己可见</b><small>其他成员只会看到该时段已占用</small></button></div>
      </template>
      <template v-else-if="dialog === 'meeting'">
        <h2>组织开会</h2><p class="muted">参会成员：{{ selectedMemberNames.join('、') }}</p>
        <div class="two"><label>会议日期<input v-model="meetingForm.date" :min="todayIso" type="date"></label><label>会议时间<input v-model="meetingForm.time" type="time"></label></div>
        <label>会议时长</label><div class="duration-options"><button v-for="item in [['15','15分钟'],['30','半小时'],['60','一小时'],['custom','自定义']]" :key="item[0]" :class="{ selected: meetingForm.duration === item[0] }" @click="meetingForm.duration = item[0]">{{ item[1] }}</button></div>
        <label v-if="meetingForm.duration === 'custom'">自定义时长（分钟）<input v-model="meetingForm.customDuration" inputmode="numeric" type="number" min="5"></label>
        <label>会议内容<textarea v-model="meetingForm.topic" rows="3" placeholder="请输入会议主题或需要讨论的事项"></textarea></label>
        <button class="primary" @click="submitMeeting">提交并发送会议提醒</button>
      </template>
      <template v-else-if="dialog === 'voice'">
        <h2>语音识别结果</h2><p class="muted">AI 已完成转写和意图判断，请确认内容后提交。</p>
        <div class="intent-result"><small>AI 识别意图</small><b>{{ voiceIntentLabels[voiceIntent] }}</b></div>
        <div class="voice-intents"><button v-for="item in [['schedule','个人行程'],['status','修改状态'],['meeting','组织开会'],['approval','进行审批']]" :key="item[0]" :class="{ selected: voiceIntent === item[0] }" @click="voiceIntent = item[0] as typeof voiceIntent">{{ item[1] }}</button></div>
        <div v-if="voiceAnalysis && voiceAnalysis.rawTranscript !== voiceAnalysis.correctedTranscript" class="voice-raw"><small>企微原始转写</small><p>{{ voiceAnalysis.rawTranscript }}</p></div>
        <label class="voice-result">DeepSeek 纠错结果<textarea v-model="voiceText" rows="5"></textarea><small>可直接修改文字；修改后需重新解析并再次确认。</small></label>
        <div v-if="voiceAnalysis?.corrections.length" class="voice-corrections"><small v-for="item in voiceAnalysis.corrections" :key="`${item.from}-${item.to}`">“{{ item.from }}” → “{{ item.to }}”：{{ item.reason }}</small></div>
        <div v-for="match in voiceAnalysis?.personMatches || []" :key="match.spokenName" class="voice-person-match">
          <h3>识别到“{{ match.spokenName }}”<span v-if="voiceAnalysis?.suspectedNameError"> · 疑似人名识别错误</span></h3>
          <label v-for="candidate in match.candidates" :key="candidate.id" class="voice-candidate">
            <input v-model="voiceSelections[match.spokenName]" type="radio" :name="`person-${match.spokenName}`" :value="candidate.id">
            <span><b>{{ candidate.name }}<template v-if="candidate.matchedAlias">（{{ candidate.matchedAlias }}）</template></b><small>{{ candidate.department }} · {{ candidate.jobTitle }} · {{ candidate.matchReason }}</small></span><em>{{ candidate.score }}</em>
          </label>
          <p v-if="!match.candidates.length" class="muted">没有找到可靠候选，请修改上方人名后重新解析。</p>
        </div>
        <button class="primary" @click="confirmVoice">确认并提交</button>
      </template>
    </section></div>
  </section></main>
</template>
