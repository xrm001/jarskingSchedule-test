<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { api, isMockMode } from './api'
import type { Application, ApprovalGroup, BossScheduleEntry, BossStatus, MeetingRoom, PersonalScheduleInput, Reminder, Schedule, User, View, Visibility, VoiceAnalysisResult } from './types'
import ManagementApp from './ManagementApp.vue'
import AdminApp from './AdminApp.vue'

type PreviewRole = 'BOSS' | 'MANAGEMENT' | 'ADMIN'
type TestRole = PreviewRole

const user = ref<User | null>(null)
const loading = ref(false)
const view = ref<View>('today')
const status = ref<BossStatus>('available')
const schedules = ref<Schedule[]>([])
const calendarSchedules = ref<Record<string, Schedule[]>>({})
const approvals = ref<ApprovalGroup[]>([])
const reminders = ref<Reminder[]>([])
const now = new Date()
const todayLabel = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(now)
const todayIso = toLocalIso(now)
const nowMinute = ref(new Date().toTimeString().slice(0, 5))
let minuteTimer: ReturnType<typeof setInterval> | null = null
const dialog = ref<'status' | 'schedule' | 'meeting' | 'voice' | 'visibilityReminder' | 'scheduleDetail' | 'editSchedule' | null>(null)
const message = ref('')
const selectedScheduleDetail = ref<Schedule | null>(null)
const selectedScheduleDate = ref('')
const editScheduleForm = ref({ title:'', date:'', start:'10:00', end:'11:00', roomId:'', visibility:'management' as Visibility })
const form = ref<PersonalScheduleInput>({ title: '外出拜访', startDate: todayIso, endDate: todayIso, start: '10:00', end: '15:00', type: 'out', visibility: 'management' })
const statusDraft = ref<BossStatus>('available')
const dndDuration = ref('')
const labels: Record<BossStatus, string> = { available: '有空', meeting: '会议中', out: '外出中', dnd: '勿扰' }
const titles: Record<View, string> = { today: '今日安排', approvals: '预约审批', organization: '组织开会', calendar: '日历' }
const visibilityLabels = { management: '内容全员可见', occupied: '仅显示占用', private: '内容仅自己可见' }
const pending = computed(() => approvals.value.flatMap(item => item.applications).filter(item => item.status === 'pending').length)
const isReadOnlyBoss = computed(() => user.value?.readOnlyBoss === true)
const selectedDate = ref(todayIso)
const calendarCursor = ref(new Date(now.getFullYear(), now.getMonth(), 1))
const calendarExpanded = ref(false)
const agendaHours = Array.from({ length: 14 }, (_, index) => index + 8)
const managementMembers = ref<{ id:string; name:string; department:string; title:string; avatar:string; isPrimaryMeetingTarget:boolean; messageAvailable:boolean; messageUnavailableReason:string }[]>([])
const memberSearch = ref('')
const ordinaryMembersExpanded = ref(false)
const meetingRooms = ref<MeetingRoom[]>([])
const selectedMembers = ref<string[]>([])
const meetingForm = ref({ date: todayIso, time: '10:00', duration: '30', customStart: '10:00', customEnd: '10:30', topic: '', roomId: '' })
const voiceStage = ref<'idle' | 'recording' | 'result'>('idle')
const voiceText = ref('')
const voiceIntent = ref<'schedule' | 'status' | 'meeting' | 'approval'>('schedule')
const voiceHolding = ref(false)
const voiceIntentLabels = { schedule: '录入个人行程', status: '更改当前状态', meeting: '组织开会', approval: '进行审批' }
const voiceScheduleNeedsVisibility = ref(false)
const voiceAnalysis = ref<VoiceAnalysisResult | null>(null)
const voiceSelections = ref<Record<string,string>>({})
const voiceConfirmedCandidates = ref<Array<{id:string;name:string}>>([])
const voiceRoomCandidates = ref<Array<{id:string;name:string;score:number;reason:string}>>([])
const voiceRoomSelection = ref('')
const pendingVoiceCommandId = ref<string | null>(null)
const calendarTitle = computed(() => `${calendarCursor.value.getFullYear()}年${calendarCursor.value.getMonth() + 1}月`)
const selectedDateLabel = computed(() => new Intl.DateTimeFormat('zh-CN', {
  month: 'long', day: 'numeric', weekday: 'long',
}).format(parseLocalIso(selectedDate.value)))
const selectedSchedules = computed(() => calendarSchedules.value[selectedDate.value] ?? (selectedDate.value === todayIso ? schedules.value : []))
const currentActiveSchedule = computed(() => {
  return schedules.value.find(item => item.start <= nowMinute.value && item.end > nowMinute.value) || null
})
const displayStatus = computed<BossStatus>(() => currentActiveSchedule.value?.type === 'meeting' ? 'meeting' : currentActiveSchedule.value ? 'out' : status.value)
const displayStatusLabel = computed(() => currentActiveSchedule.value?.type === 'meeting' ? '会议中' : currentActiveSchedule.value ? '外出中' : labels[status.value])
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
      sunday: date.getDay() === 0,
      hasEvents: Boolean(calendarSchedules.value[iso]?.length) || (iso === todayIso && schedules.value.length > 0),
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
    return { iso, label: date.getDate(), selected: iso === selectedDate.value, today: iso === todayIso, past: iso < todayIso, sunday: date.getDay() === 0 }
  })
})
const orderedMeetingRooms = computed(() => [...meetingRooms.value].sort((a,b) => roomOrder(a) - roomOrder(b) || a.name.localeCompare(b.name, 'zh-CN')))
const selectedMeetingRoomName = computed(() => orderedMeetingRooms.value.find(room => room.id === meetingForm.value.roomId)?.name || '')
const selectedMemberNames = computed(() => [...new Set([
  ...managementMembers.value.filter(item => selectedMembers.value.includes(item.id)).map(item => item.name),
  ...voiceConfirmedCandidates.value.filter(item=>selectedMembers.value.includes(item.id)).map(item=>item.name),
])])
const normalizedMemberSearch = computed(() => memberSearch.value.trim().toLowerCase())
const searchedMembers = computed(() => {
  const keyword = normalizedMemberSearch.value
  if (!keyword) return managementMembers.value
  return managementMembers.value.filter(member => [member.name, member.department, member.title]
    .some(value => value.toLowerCase().includes(keyword)))
})
const primaryMeetingMembers = computed(() => searchedMembers.value.filter(member => member.isPrimaryMeetingTarget))
const ordinaryMembers = computed(() => searchedMembers.value.filter(member => !member.isPrimaryMeetingTarget))
const showOrdinaryMembers = computed(() => ordinaryMembersExpanded.value || Boolean(normalizedMemberSearch.value))

function toLocalIso(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function parseLocalIso(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year!, month! - 1, day!)
}

function timeToMinutes(value: string) {
  const [hour = 0, minute = 0] = value.split(':').map(Number)
  return hour * 60 + minute
}

function addMinutesToTime(value: string, minutes: number) {
  const total = Math.max(0, Math.min(23 * 60 + 59, timeToMinutes(value) + minutes))
  return `${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`
}

function scheduleTypeLabel(type: PersonalScheduleInput['type']) {
  if (type === 'meeting') return '会议'
  if (type === 'out') return '外出'
  return '个人行程'
}

function isSundayIso(value: string) {
  return parseLocalIso(value).getDay() === 0
}

function openStatusDialog() {
  if (isReadOnlyBoss.value) return notify('当前为只读老板端，可浏览但不能修改状态')
  statusDraft.value = displayStatus.value
  dialog.value = 'status'
}

function changeMonth(offset: number) {
  calendarCursor.value = new Date(calendarCursor.value.getFullYear(), calendarCursor.value.getMonth() + offset, 1)
}

function eventsAtHour(hour: number) {
  return selectedSchedules.value.filter(item => Number(item.start.slice(0, 2)) === hour)
}

function displayScheduleTitle(item: Schedule) {
  return item.title || (item.type === 'personal' ? '个人行程' : '已占用')
}

function displayScheduleContent(item: Schedule) {
  return item.content || item.title || ''
}

function meetingObjectLabel(item: Schedule) {
  const count = item.participants?.length ?? 0
  if (count > 2) return '多人会议'
  return count ? item.participants!.join('、') : ''
}

function scheduleMeta(item: Schedule) {
  return [item.location, meetingObjectLabel(item)].filter(Boolean).join(' · ')
}

function openScheduleDetail(item: Schedule, date = todayIso) {
  selectedScheduleDetail.value = item
  selectedScheduleDate.value = date
  dialog.value = 'scheduleDetail'
}

function openEditSchedule() {
  if (isReadOnlyBoss.value) return notify('当前为只读老板端，不能修改日程')
  if (!selectedScheduleDetail.value) return
  const item = selectedScheduleDetail.value
  const room = orderedMeetingRooms.value.find(candidate => candidate.name === item.location)
  editScheduleForm.value = {
    title: item.title,
    date: selectedScheduleDate.value,
    start: item.start,
    end: item.end,
    roomId: room?.id || '',
    visibility: item.visibility,
  }
  dialog.value = 'editSchedule'
}

function scheduleFromBossEntry(entry: BossScheduleEntry): Schedule {
  const start = new Date(entry.startAt)
  const end = new Date(entry.endAt)
  return {
    id: entry.id,
    title: entry.title || (entry.sourceType === 'PERSONAL' ? '个人行程' : '已占用'),
    start: formatScheduleTime(start),
    end: formatScheduleTime(end),
    type: entry.sourceType === 'PERSONAL' ? 'personal' : entry.sourceType === 'STATUS_BLOCK' ? 'out' : 'meeting',
    location: entry.roomName || undefined,
    visibility: entry.visibility === 'BOSS_ONLY' ? 'private' : 'management',
    participants: entry.participantNames ?? [],
    content: entry.meetingContent || undefined,
  }
}

function formatScheduleTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN',{ hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'Asia/Shanghai' })
}

function displaySubmittedAt(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN',{
    month:'long', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:false, timeZone:'Asia/Shanghai',
  })
}

async function loadScheduleForDate(date: string, force = false) {
  if (!force && calendarSchedules.value[date]) return
  if (date === todayIso && !force) {
    calendarSchedules.value = { ...calendarSchedules.value, [date]: schedules.value }
    return
  }
  const entries = await api.getCurrentBossSchedule(date)
  calendarSchedules.value = { ...calendarSchedules.value, [date]: entries.map(scheduleFromBossEntry) }
}

async function selectCalendarDate(iso: string) {
  if (iso < todayIso) return
  if (parseLocalIso(iso).getDay() === 0) return notify('周日为休息日，不可安排会议')
  selectedDate.value = iso
  await loadScheduleForDate(iso)
}

function toggleMember(id: string) {
  if (isReadOnlyBoss.value) return notify('当前为只读老板端，不能发起组织')
  const member = managementMembers.value.find(item => item.id === id)
  if (member && !member.messageAvailable) return notify(member.messageUnavailableReason || '该成员暂时无法接收企微提醒')
  selectedMembers.value = selectedMembers.value.includes(id)
    ? selectedMembers.value.filter(item => item !== id)
    : [...selectedMembers.value, id]
}

function toggleAllMembers() {
  if (isReadOnlyBoss.value) return notify('当前为只读老板端，不能选择会谈对象')
  const available = managementMembers.value.filter(item => item.messageAvailable).map(item => item.id)
  if (!available.length) return notify('当前没有可发送提醒的成员')
  selectedMembers.value = selectedMembers.value.length === available.length ? [] : available
}

function roomOrder(room: MeetingRoom) {
  if (room.name.includes('\u8001\u677f\u529e\u516c\u5ba4') || room.name.includes('\u4f1a\u5ba2\u5ba4')) return 1
  if (room.name.includes('\u5927\u4f1a\u8bae\u5ba4')) return 2
  return 10 + (room.floor || 99)
}

function normalizeRoomName(value: string) {
  return value
    .replace(/[\s\u3001\uff0c\u3002\uff08\uff09()]/g, '')
    .replace(/\u8001\u677f|\u77f3\u603b|\u529e\u516c\u5ba4|\u4f1a\u8bae\u5ba4|\u4f1a\u5ba2\u5ba4|\u697c/g, '')
}

function matchMeetingRooms(text: string, parsed: Record<string, unknown> = {}) {
  const roomHint = [text, parsed.roomName, parsed.location, parsed.room]
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .join(' ')
  if (!roomHint.trim() || !orderedMeetingRooms.value.length) return []
  const normalizedHint = normalizeRoomName(roomHint)
  return orderedMeetingRooms.value
    .map(room => {
      const normalizedRoom = normalizeRoomName(room.name)
      let score = 0
      if (roomHint.includes(room.name)) score = 100
      else if ((room.name.includes('\u8001\u677f\u529e\u516c\u5ba4') || room.name.includes('\u4f1a\u5ba2\u5ba4')) && /\u4f1a\u5ba2\u5ba4|\u529e\u516c\u5ba4|\u8001\u677f\u529e\u516c\u5ba4|\u77f3\u603b\u529e\u516c\u5ba4/.test(roomHint)) score = 95
      else if (room.name.includes('\u5927\u4f1a\u8bae\u5ba4') && /\u5927\u4f1a\u8bae\u5ba4|\u5927\u4f1a\u8bae/.test(roomHint)) score = 92
      else if (/18\s*\u697c/.test(roomHint) && room.floor === 18 && normalizedHint.includes(normalizedRoom)) score = 88
      else if (normalizedHint && normalizedRoom && normalizedHint.includes(normalizedRoom)) score = 80
      return score ? { id:room.id, name:room.name, score, reason:'\u5730\u70b9\u540d\u79f0\u5339\u914d' } : null
    })
    .filter((item): item is {id:string;name:string;score:number;reason:string} => Boolean(item))
    .sort((a,b) => b.score - a.score)
    .slice(0, 4)
}

function openMeetingDialog() {
  if (isReadOnlyBoss.value) return notify('当前为只读老板端，不能发起组织')
  if (!selectedMembers.value.length) return notify('请先选择参会员工')
  meetingForm.value = { date: todayIso, time: '10:00', duration: '30', customStart: '10:00', customEnd: '10:30', topic: '', roomId: '' }
  dialog.value = 'meeting'
}

async function submitMeeting() {
  const custom = meetingForm.value.duration === 'custom'
  const meetingTime = custom ? meetingForm.value.customStart : meetingForm.value.time
  const duration = meetingForm.value.duration === 'custom'
    ? timeToMinutes(meetingForm.value.customEnd) - timeToMinutes(meetingForm.value.customStart)
    : Number(meetingForm.value.duration)
  if (meetingForm.value.date < todayIso) return notify('会议日期不能早于今天')
  if (isSundayIso(meetingForm.value.date)) return notify('周日为休息日，不可组织会议')
  if (!duration || duration < 5) return notify('请填写有效的会议时长')
  const meetingStart = timeToMinutes(meetingTime)
  if (meetingStart < timeToMinutes('09:00') || meetingStart + duration > timeToMinutes('19:00')) return notify('可预约时间为 09:00—19:00')
  try {
    const schedule = await api.organizeMeeting({
      participantIds:selectedMembers.value,
      startAt:`${meetingForm.value.date}T${meetingTime}:00+08:00`,
      durationMinutes:duration,
      topic:meetingForm.value.topic.trim() || '会谈',
      roomId:meetingForm.value.roomId || undefined,
      voiceCommandId:pendingVoiceCommandId.value || undefined,
    })
    if (meetingForm.value.date === todayIso) {
      schedules.value = await api.getToday().catch(() => [...schedules.value, schedule])
      calendarSchedules.value = { ...calendarSchedules.value, [todayIso]: schedules.value }
    } else {
      await loadScheduleForDate(meetingForm.value.date, true).catch(() => {
        calendarSchedules.value = { ...calendarSchedules.value, [meetingForm.value.date]: [...(calendarSchedules.value[meetingForm.value.date] ?? []), schedule] }
      })
    }
    dialog.value = null
    const sent = schedule.notifications?.sent ?? 0
    const failed = schedule.notifications?.failed ?? 0
    notify(failed ? `会议已组织，${sent}人已收到提醒，${failed}人发送失败` : `会议已组织，已提醒${selectedMemberNames.value.join('、')}`)
    selectedMembers.value = []
    pendingVoiceCommandId.value = null
  } catch (error) {
    if (pendingVoiceCommandId.value) await api.markVoiceFailed({recordId:pendingVoiceCommandId.value,error:error instanceof Error ? error.message : '组织会议失败'}).catch(()=>undefined)
    errorMessage(error)
  }
}

async function refreshScheduleDate(date: string) {
  if (date === todayIso) {
    schedules.value = await api.getToday()
    calendarSchedules.value = { ...calendarSchedules.value, [todayIso]: schedules.value }
  } else {
    await loadScheduleForDate(date, true)
  }
}

async function saveScheduleEdit() {
  if (isReadOnlyBoss.value) return notify('当前为只读老板端，不能修改日程')
  if (!selectedScheduleDetail.value) return
  if (!editScheduleForm.value.title.trim()) return notify('请填写日程内容')
  if (editScheduleForm.value.start >= editScheduleForm.value.end) return notify('结束时间必须晚于开始时间')
  try {
    await api.updateBossSchedule(selectedScheduleDetail.value.id, {
      title: editScheduleForm.value.title.trim(),
      startAt: `${editScheduleForm.value.date}T${editScheduleForm.value.start}:00+08:00`,
      endAt: `${editScheduleForm.value.date}T${editScheduleForm.value.end}:00+08:00`,
      roomId: editScheduleForm.value.roomId || undefined,
      visibility: editScheduleForm.value.visibility,
    })
    await refreshScheduleDate(selectedScheduleDate.value)
    if (editScheduleForm.value.date !== selectedScheduleDate.value) await refreshScheduleDate(editScheduleForm.value.date)
    dialog.value = null
    selectedScheduleDetail.value = null
    notify('日程已修改')
  } catch (error) { errorMessage(error) }
}

async function cancelScheduleDetail() {
  if (isReadOnlyBoss.value) return notify('当前为只读老板端，不能取消日程')
  if (!selectedScheduleDetail.value) return
  if (!confirm('确认取消这条日程吗？取消后该时段将释放。')) return
  try {
    await api.cancelBossSchedule(selectedScheduleDetail.value.id)
    await refreshScheduleDate(selectedScheduleDate.value)
    dialog.value = null
    selectedScheduleDetail.value = null
    notify('日程已取消')
  } catch (error) { errorMessage(error) }
}

function inferVoiceIntent() {
  voiceIntent.value = view.value === 'approvals' ? 'approval' : view.value === 'organization' ? 'meeting' : 'schedule'
}

function asTime(value: unknown): string | null {
  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value) ? value : null
}

function chineseHourToNumber(raw: string): number | null {
  const map:Record<string,number> = {'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10}
  if (/^\d+$/.test(raw)) return Number(raw)
  if (raw === '十') return 10
  if (raw.startsWith('十')) return 10 + (map[raw.slice(1)] ?? 0)
  if (raw.endsWith('十')) return (map[raw[0]!] ?? 0) * 10
  if (raw.includes('十')) {
    const [left,right] = raw.split('十')
    return (map[left || '一'] ?? 1) * 10 + (right ? map[right] ?? 0 : 0)
  }
  return map[raw] ?? null
}

function inferTimesFromText(text:string): {start:string;end:string}|null {
  const match=text.match(/(上午|中午|下午|晚上)?([一二两三四五六七八九十\d]{1,3})点(?:半)?(?:到|至|-|—)(上午|中午|下午|晚上)?([一二两三四五六七八九十\d]{1,3})点/u)
  if(!match) return null
  const startPeriod=match[1] || ''
  const endPeriod=match[3] || startPeriod
  let start=chineseHourToNumber(match[2]!)
  let end=chineseHourToNumber(match[4]!)
  if(start==null||end==null) return null
  if((startPeriod==='下午'||startPeriod==='晚上')&&start<12) start+=12
  if((endPeriod==='下午'||endPeriod==='晚上')&&end<12) end+=12
  if(startPeriod==='中午'&&start<11) start+=12
  if(endPeriod==='中午'&&end<11) end+=12
  if(end<=start&&start>=12&&end<12) end+=12
  return {start:`${String(start).padStart(2,'0')}:00`,end:`${String(end).padStart(2,'0')}:00`}
}

function addDaysIso(base: Date, days: number): string {
  const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days)
  return toLocalIso(date)
}

function inferDateFromText(text:string): string | null {
  if (text.includes('\u540e\u5929')) return addDaysIso(now, 2)
  if (text.includes('\u660e\u5929')) return addDaysIso(now, 1)
  if (text.includes('\u4eca\u5929') || text.includes('\u4e00\u4f1a')) return todayIso
  const dayMatch = text.match(/(\d{1,2})\s*[\u53f7\u65e5]/)
  if (dayMatch) {
    const day = Number(dayMatch[1])
    if (Number.isFinite(day) && day >= 1 && day <= 31) {
      const candidate = new Date(now.getFullYear(), now.getMonth(), day)
      if (toLocalIso(candidate) < todayIso) candidate.setMonth(candidate.getMonth() + 1)
      return toLocalIso(candidate)
    }
  }
  return null
}

function inferDateRangeFromText(text:string): {startDate:string;endDate:string} {
  const parsedStart = inferDateFromText(text) || todayIso
  const rangeMatch = text.match(/(?:从|自)?\s*(\d{1,2})\s*[号日]\s*(?:到|至|-|—)\s*(\d{1,2})\s*[号日]/)
  if (rangeMatch) {
    const startDay = Number(rangeMatch[1])
    const endDay = Number(rangeMatch[2])
    const start = new Date(now.getFullYear(), now.getMonth(), startDay)
    const end = new Date(now.getFullYear(), now.getMonth(), endDay)
    if (toLocalIso(start) < todayIso) start.setMonth(start.getMonth() + 1)
    if (end < start) end.setMonth(end.getMonth() + 1)
    return { startDate:toLocalIso(start), endDate:toLocalIso(end) }
  }
  const durationMatch = text.match(/(?:外出|出差|学习|请假|不在)([一二两三四五六七八九十\d]{1,3})\s*天/)
  if (durationMatch) {
    const days = chineseHourToNumber(durationMatch[1]!) || Number(durationMatch[1]) || 1
    return { startDate:parsedStart, endDate:addDaysIso(parseLocalIso(parsedStart), Math.max(1, days) - 1) }
  }
  return { startDate:parsedStart, endDate:parsedStart }
}

function cleanVoiceTopic(value: unknown, fallback = '\u5f00\u4f1a'): string {
  const topic = typeof value === 'string' ? value.trim() : ''
  if (!topic || /^[\s?？!！.。,\uff0c-]+$/.test(topic)) return fallback
  return topic
}

function inferScheduleTitle(text: string): string {
  return text
    .replace(/^(今天|明天|后天)?(上午|中午|下午|晚上)?[一二两三四五六七八九十0-9点半到至:：\-\s]+/u, '')
    .replace(/^(要|去)/u, '')
    .replace(/[。.!！]$/u, '')
    .trim() || '个人行程'
}

function scheduleTypeFromParsed(value:unknown,text:string): Schedule['type'] {
  if(value === 'meeting' || value === 'out' || value === 'personal') return value
  return /外出|拜访|出差|学习/.test(text) ? 'out' : /会议|开会/.test(text) ? 'meeting' : 'personal'
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
  dialog.value='voice';voiceStage.value='result';voiceAnalysis.value=null;voiceSelections.value={};voiceRoomCandidates.value=[];voiceRoomSelection.value=''
  if(!voiceText.value) return notify('未识别到语音文字，请重试或手动输入')
  try {
    const scene=voiceIntent.value==='meeting'?'boss_invite':voiceIntent.value==='status'?'boss_status':voiceIntent.value==='approval'?'boss_approval':'boss_schedule'
    const result=await api.parseVoiceText(scene,voiceText.value)
    voiceAnalysis.value=result;voiceText.value=result.correctedTranscript
    pendingVoiceCommandId.value = result.recordId
    const intentMap={CHANGE_STATUS:'status',CREATE_SCHEDULE:'schedule',ORGANIZE_MEETING:'meeting',APPROVE_REQUEST:'approval',UNKNOWN:voiceIntent.value} as const
    voiceIntent.value=intentMap[result.intent]
    voiceSelections.value=Object.fromEntries(result.personMatches.map(match=>[match.spokenName,'']))
    voiceRoomCandidates.value=voiceIntent.value==='meeting'
      ? (result.roomMatches?.length ? result.roomMatches : matchMeetingRooms(result.correctedTranscript,result.parsed))
      : []
    voiceRoomSelection.value=voiceRoomCandidates.value[0]?.id || ''
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
  if (isReadOnlyBoss.value) return notify('当前为只读老板端，不能使用语音写入')
  if (voiceHolding.value) return
  inferVoiceIntent()
  voiceText.value = ''
  voiceAnalysis.value=null;voiceConfirmedCandidates.value=[];voiceRoomCandidates.value=[];voiceRoomSelection.value=''
  try { await prepareWeComVoice() } catch(error) { notify(error instanceof Error?error.message:'企微录音初始化失败');dialog.value='voice';return }
  voiceStage.value = 'recording'
  voiceHolding.value = true
  if(!isMockMode) window.wx?.startRecord({cancel:()=>{voiceHolding.value=false;notify('录音授权已取消')}})
  window.addEventListener('pointerup', finishVoiceHold, { once: true })
  window.addEventListener('pointercancel', finishVoiceHold, { once: true })
}

async function confirmVoice() {
  if (isReadOnlyBoss.value) return notify('当前为只读老板端，不能提交语音指令')
  if (!voiceText.value.trim()) return notify('请先确认语音转写内容')
  if(!voiceAnalysis.value||voiceText.value.trim()!==voiceAnalysis.value.correctedTranscript.trim()){
    await analyzeVoiceText(voiceText.value)
    return notify('已重新纠错和解析，请再次确认结果')
  }
  if(voiceAnalysis.value.personMatches.length){
    const selections=voiceAnalysis.value.personMatches
      .map(match=>({spokenName:match.spokenName,userId:voiceSelections.value[match.spokenName]||''}))
      .filter(item=>item.userId)
    if(selections.length) await api.confirmVoicePersons({recordId:voiceAnalysis.value.recordId,confirmationToken:voiceAnalysis.value.confirmationToken,selections})
    voiceConfirmedCandidates.value=selections.map(item=>{
      const candidate=voiceAnalysis.value!.personMatches.find(match=>match.spokenName===item.spokenName)!.candidates.find(person=>person.id===item.userId)!
      return {id:candidate.id,name:candidate.name}
    })
    selectedMembers.value=voiceConfirmedCandidates.value.map(item=>item.id)
  }
  if (voiceIntent.value === 'schedule') {
    voiceScheduleNeedsVisibility.value = false
    const parsed=voiceAnalysis.value.parsed
    const inferred=inferTimesFromText(voiceText.value)
    const inferredDates=inferDateRangeFromText(voiceText.value)
    form.value = {
      title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : inferScheduleTitle(voiceText.value),
      startDate: typeof parsed.startDate === 'string' ? parsed.startDate : inferredDates.startDate,
      endDate: typeof parsed.endDate === 'string' ? parsed.endDate : inferredDates.endDate,
      start: asTime(parsed.startTime) || inferred?.start || '10:00',
      end: asTime(parsed.endTime) || inferred?.end || '11:00',
      type: scheduleTypeFromParsed(parsed.scheduleType, voiceText.value),
      visibility: parsed.visibility === 'private' || /仅自己可见|私密|不公开/.test(voiceText.value) ? 'private' : 'management',
    }
    dialog.value = 'schedule'
  } else if (voiceIntent.value === 'status') {
    statusDraft.value = 'out'
    dndDuration.value = '60'
    dialog.value = 'status'
  } else if (voiceIntent.value === 'meeting') {
    const parsed=voiceAnalysis.value.parsed
    const startTime = typeof parsed.startTime==='string'?parsed.startTime:'14:00'
    const duration = typeof parsed.durationMinutes==='number'?parsed.durationMinutes:30
    meetingForm.value = { date:inferDateFromText(voiceText.value) || (typeof parsed.startDate==='string'?parsed.startDate:todayIso), time:startTime, duration:[15,30,60].includes(duration)?String(duration):'custom', customStart:startTime, customEnd:addMinutesToTime(startTime, duration), topic: cleanVoiceTopic(parsed.topic), roomId: voiceRoomSelection.value || voiceRoomCandidates.value[0]?.id || '' }
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
  calendarSchedules.value = { ...calendarSchedules.value, [todayIso]: schedules.value }
}

async function loadMeetingRooms() {
  meetingRooms.value = await api.getMeetingRooms()
}

async function loadManagementDirectory() {
  const members = await api.getEmployees().catch(() => api.getManagementDirectory())
  managementMembers.value = members.map(member => ({
    id:member.id,
    name:member.displayName,
    department:member.department || '未设置部门',
    title:member.jobTitle || '员工',
    avatar:member.displayName.slice(0, 1),
    isPrimaryMeetingTarget:member.isPrimaryMeetingTarget === true,
    messageAvailable:member.messageAvailable !== false,
    messageUnavailableReason:member.messageUnavailableReason || '',
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
        loadMeetingRooms().catch(() => notify('会议室加载失败，请稍后重试')),
        loadManagementDirectory().catch(() => notify('员工名单加载失败，请稍后重试')),
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
  if (isReadOnlyBoss.value) return notify('当前为只读老板端，不能修改状态')
  try {
    if (statusDraft.value === 'available' && currentActiveSchedule.value) {
      const ok = window.confirm('当前时段已有日程安排。确认切换为有空并取消当前时段会议/行程吗？')
      if (!ok) return
      await api.cancelBossSchedule(currentActiveSchedule.value.id)
      await refreshScheduleDate(todayIso)
    }
    await api.changeStatus(statusDraft.value, dndDuration.value ? Number(dndDuration.value) : undefined, pendingVoiceCommandId.value || undefined)
    status.value = statusDraft.value
    dialog.value = null
    pendingVoiceCommandId.value = null
    notify(status.value === 'dnd' && !dndDuration.value
      ? '勿扰已开启，1小时后将提醒您确认状态'
      : `状态已切换为${labels[status.value]}`)
  } catch (error) {
    if (pendingVoiceCommandId.value) await api.markVoiceFailed({recordId:pendingVoiceCommandId.value,error:error instanceof Error ? error.message : '修改状态失败'}).catch(()=>undefined)
    errorMessage(error)
  }
}

async function saveSchedule() {
  if (isReadOnlyBoss.value) return notify('当前为只读老板端，不能新增个人行程')
  if (form.value.endDate < form.value.startDate) return notify('结束日期不能早于开始日期')
  if (form.value.startDate === form.value.endDate && form.value.start >= form.value.end) return notify('结束时间必须晚于开始时间')
  try {
    const created = await api.createPersonalSchedule({ ...form.value, title: form.value.title.trim() || scheduleTypeLabel(form.value.type), voiceCommandId: pendingVoiceCommandId.value || undefined })
    if (form.value.startDate === todayIso) {
      schedules.value.push(created)
      calendarSchedules.value = { ...calendarSchedules.value, [todayIso]: schedules.value }
    } else {
      await loadScheduleForDate(form.value.startDate, true).catch(() => {
        calendarSchedules.value = { ...calendarSchedules.value, [form.value.startDate]: [...(calendarSchedules.value[form.value.startDate] ?? []), created] }
      })
    }
    dialog.value = null
    voiceScheduleNeedsVisibility.value = false
    pendingVoiceCommandId.value = null
    notify('个人行程已保存')
  } catch (error) {
    if (pendingVoiceCommandId.value) await api.markVoiceFailed({recordId:pendingVoiceCommandId.value,error:error instanceof Error ? error.message : '保存个人行程失败'}).catch(()=>undefined)
    errorMessage(error)
  }
}

function confirmScheduleVisibility(visibility: 'management' | 'private') {
  form.value.visibility = visibility
  voiceScheduleNeedsVisibility.value = false
  void saveSchedule()
}

async function decide(groupId: string, application: Application, decision: 'approve' | 'reject') {
  if (isReadOnlyBoss.value) return notify('当前为只读老板端，不能审批申请')
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
  minuteTimer = setInterval(() => {
    nowMinute.value = new Date().toTimeString().slice(0, 5)
  }, 30_000)
  const hasOAuthCode = new URLSearchParams(location.search).has('code')
  if (!isMockMode || hasOAuthCode || import.meta.env.VITE_AUTO_LOGIN === 'true') void login()
})

onUnmounted(() => {
  if (minuteTimer) clearInterval(minuteTimer)
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
        <button :disabled="loading" @click="loginAsPreview('MANAGEMENT')"><span class="role-icon management">员</span><span><b>员工端</b><small>查看占用、查询会议室与发起约谈申请</small></span><i>›</i></button>
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
        <div class="safe">登录后由服务端识别企业微信 UserID 与角色，自动进入老板端、员工端或管理员端。</div>
      </div>
    </section>

    <div v-if="user?.canTestRoles" class="admin-test-switch">
      <div><b>管理员测试身份</b><span>{{ user.isTestRole ? `正在模拟：${user.role}` : '当前真实管理员身份' }}</span></div>
      <button :class="{active:user.role==='BOSS'}" @click="switchAdminTestRole('BOSS')">老板端</button>
      <button :class="{active:user.role==='MANAGEMENT'}" @click="switchAdminTestRole('MANAGEMENT')">员工端</button>
      <button :class="{active:user.role==='ADMIN' && !user.isTestRole}" @click="switchAdminTestRole('ADMIN')">管理员端</button>
    </div>

    <ManagementApp v-if="user?.role === 'MANAGEMENT'" :user="user" @notify="notify" />
    <AdminApp v-else-if="user?.role === 'ADMIN'" :user="user" @notify="notify" />
    <template v-else-if="user?.role === 'BOSS'">
      <header class="top boss-top"><div><h1>{{ titles[view] }}</h1></div><button class="avatar">老板</button></header>
      <div class="content">
        <section v-if="view === 'today'">
          <div class="hero">
            <div><small>{{ todayLabel }}</small><h2>您好，石总</h2><p>统一查看今天的行程与待审批会议</p></div>
            <button class="status" @click="openStatusDialog"><i></i>{{ displayStatusLabel }}⌄</button>
            <div class="stats"><span><b>{{ schedules.length }}</b>今日安排</span><span><b>{{ pending }}</b>待审批</span></div>
          </div>
          <div class="section-title"><h2>今日日程</h2><span>每日09:00自动发送摘要</span></div>
          <div class="timeline">
            <article v-for="item in schedules" :key="item.id"><time>{{ item.start }}</time><i :class="item.type"></i><button class="schedule-tap-card" @click="openScheduleDetail(item, todayIso)"><h3>{{ displayScheduleTitle(item) }}</h3><p>{{ item.end }} <template v-if="scheduleMeta(item)">· {{ scheduleMeta(item) }}</template> · {{ visibilityLabels[item.visibility] }}</p></button></article>
          </div>
          <div class="quick quick-bottom">
            <button class="personal-schedule-action" :disabled="isReadOnlyBoss" @click="isReadOnlyBoss ? notify('当前为只读老板端，不能新增个人行程') : dialog = 'schedule'"><b>＋ 个人行程</b><small>手动录入会议、外出或其他安排</small></button>
          </div>
        </section>

        <section v-else-if="view === 'approvals'">
          <div class="section-title first"><h2>按时间段审批</h2><span>同一时段可多人申请</span></div>
          <article v-for="group in approvals" :key="group.id" class="card group">
            <header><div><h3>{{ group.start }}—{{ group.end }}</h3><p>通过一人后，仅自动拒绝与其时间重叠的申请</p></div><b>{{ group.applications.filter(item => item.status === 'pending').length }}份待审</b></header>
            <div v-for="application in group.applications" :key="application.id" class="candidate">
              <div><strong>{{ application.applicant }} · {{ application.department }}</strong><small>{{ displaySubmittedAt(application.submittedAt) }}</small></div>
              <p>{{ application.start }}—{{ application.end }} · {{ application.topic }}<br>申请会议室：{{ application.room }}</p>
              <div v-if="application.status === 'pending'" class="actions"><button :disabled="isReadOnlyBoss" @click="decide(group.id, application, 'reject')">拒绝</button><button :disabled="isReadOnlyBoss" @click="decide(group.id, application, 'approve')">通过此申请</button></div>
              <span v-else class="result" :class="application.status">{{ application.status === 'approved' ? '已通过' : '已拒绝' }}</span>
            </div>
          </article>
        </section>

        <section v-else-if="view === 'organization'" class="organization-page">
          <div class="organization-intro"><div><small>EMPLOYEE DIRECTORY</small><h2>选择会谈对象</h2><p>{{ isReadOnlyBoss ? '当前账号为二老板只读老板端，仅可浏览会谈对象，不可发起组织。' : '默认优先展示主要会议对象，也可选择其他员工，提交后将通过企微发送提醒。' }}</p></div><div class="organization-intro-actions"><b>{{ selectedMembers.length }}人</b><button class="select-all-members" :disabled="isReadOnlyBoss" @click="toggleAllMembers">{{ selectedMembers.length > 0 && selectedMembers.length === managementMembers.filter(item => item.messageAvailable).length ? '取消全选' : '全选所有人' }}</button></div></div>
          <label class="member-search"><input v-model="memberSearch" placeholder="输入姓名、职位或部门"></label>
          <div class="member-group-card">
            <header><div><b>管理层</b><small>{{ primaryMeetingMembers.length }}人</small></div></header>
            <div class="member-list">
              <button v-for="member in primaryMeetingMembers" :key="member.id" class="member-card" :class="{ selected: selectedMembers.includes(member.id), unavailable: !member.messageAvailable }" :disabled="isReadOnlyBoss" @click="toggleMember(member.id)">
                <span class="member-avatar">{{ member.avatar }}</span><span class="member-info"><b>{{ member.name }}</b><small>{{ member.messageAvailable ? member.title : member.messageUnavailableReason }}</small></span><i>{{ selectedMembers.includes(member.id) ? '✓' : '+' }}</i>
              </button>
              <p v-if="!primaryMeetingMembers.length" class="empty-members">没有匹配到管理层人员</p>
            </div>
          </div>
          <div class="member-group-card">
            <header><div><b>普通员工</b><small>{{ ordinaryMembers.length }}人</small></div><button @click="ordinaryMembersExpanded = !ordinaryMembersExpanded">{{ showOrdinaryMembers ? '收起' : '展开' }}</button></header>
            <div v-if="showOrdinaryMembers" class="member-list">
              <button v-for="member in ordinaryMembers" :key="member.id" class="member-card" :class="{ selected: selectedMembers.includes(member.id), unavailable: !member.messageAvailable }" :disabled="isReadOnlyBoss" @click="toggleMember(member.id)">
                <span class="member-avatar employee">{{ member.avatar }}</span><span class="member-info"><b>{{ member.name }}</b><small>{{ member.messageAvailable ? `${member.title} · ${member.department}` : member.messageUnavailableReason }}</small></span><i>{{ selectedMembers.includes(member.id) ? '✓' : '+' }}</i>
              </button>
              <p v-if="!ordinaryMembers.length" class="empty-members">没有匹配到普通员工</p>
            </div>
          </div>
          <div class="organization-action"><span v-if="selectedMembers.length">已选择 {{ selectedMemberNames.join('、') }}</span><span v-else>{{ isReadOnlyBoss ? '只读老板端不可发起组织' : '请选择需要会谈的员工' }}</span><button :disabled="isReadOnlyBoss || !selectedMembers.length" @click="openMeetingDialog">组织开会</button></div>
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
              <button v-for="day in calendarDays" :key="day.iso" :disabled="day.past || !day.inMonth || day.sunday" :class="{ muted: !day.inMonth || day.past || day.sunday, today: day.today, selected: day.selected }" @click="selectCalendarDate(day.iso)">
                <span>{{ day.label }}</span><i v-if="day.hasEvents"></i>
              </button>
            </div>
            <div v-else class="month-grid week-grid">
              <button v-for="day in weekDays" :key="day.iso" :disabled="day.past || day.sunday" :class="{ muted: day.past || day.sunday, today: day.today, selected: day.selected }" @click="selectCalendarDate(day.iso)"><span>{{ day.label }}</span></button>
            </div>
          </div>
          <div class="agenda-head"><div><h2>{{ selectedDateLabel }}</h2><p>{{ selectedSchedules.length ? `${selectedSchedules.length}项安排` : '暂无安排' }}</p></div></div>
          <div class="agenda-scroll">
            <div v-for="hour in agendaHours" :key="hour" class="agenda-row">
              <time>{{ String(hour).padStart(2, '0') }}:00</time>
              <div class="agenda-slot">
                <button v-for="item in eventsAtHour(hour)" :key="item.id" class="agenda-event-button" :class="item.type" @click="openScheduleDetail(item, selectedDate)">
                  <strong>{{ displayScheduleTitle(item) }}</strong><span>{{ item.start }}—{{ item.end }}<template v-if="scheduleMeta(item)"> · {{ scheduleMeta(item) }}</template></span>
                </button>
              </div>
            </div>
          </div>
        </section>

      </div>
      <nav><button v-for="item in ([['today','今日'],['approvals','审批'],['organization','组织'],['calendar','日历']] as const)" :key="item[0]" :class="{ active: view === item[0] }" @click="view = item[0]"><b>{{ item[0] === 'today' ? '▣' : item[0] === 'approvals' ? '✓' : item[0] === 'organization' ? '＋' : '▦' }}</b>{{ item[1] }}<em v-if="item[0] === 'approvals' && pending">{{ pending }}</em></button></nav>
      <button class="voice-fab" :disabled="isReadOnlyBoss" :class="{ recording: voiceHolding }" :aria-label="voiceHolding ? '正在录音，松开结束' : '按住说话'" @pointerdown.prevent="isReadOnlyBoss ? notify('当前为只读老板端，不能使用语音写入') : startVoiceHold()" @keydown.space.prevent="isReadOnlyBoss ? notify('当前为只读老板端，不能使用语音写入') : startVoiceHold()" @keyup.space.prevent="finishVoiceHold" @contextmenu.prevent>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-5a3.5 3.5 0 1 0-7 0v5A3.5 3.5 0 0 0 12 15Z"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6"/></svg>
      </button>
    </template>
    <button v-if="user && isMockMode" class="demo-exit" @click="exitPreview">切换角色</button>
    <div v-if="dialog" class="overlay" @click.self="dialog = null"><section class="sheet" :class="{ 'status-sheet': dialog === 'status' }"><div class="handle"></div><button class="close" @click="dialog = null">×</button>
      <template v-if="dialog === 'status'">
        <h2>切换当前状态</h2><p class="muted">勿扰只表示请勿当面打扰，不影响预约和审批。</p>
        <div class="status-grid"><button v-for="(label, key) in labels" :key="key" :class="{ selected: statusDraft === key }" @click="statusDraft = key as BossStatus"><b>{{ label }}</b><small>{{ key === 'dnd' ? '请勿当面打扰' : key === 'available' ? '可正常申请会议' : '当前时间不可预约' }}</small></button></div>
        <label v-if="statusDraft !== 'available'" class="duration-field">{{ labels[statusDraft] }}持续时间（选填）<select v-model="dndDuration"><option value="">不设置时间</option><option value="30">30分钟</option><option value="60">1小时</option><option value="120">2小时</option></select></label>
        <button class="primary" :disabled="isReadOnlyBoss" @click="saveStatus">确认状态</button>
      </template>
      <template v-else-if="dialog === 'schedule'">
        <h2>录入个人行程</h2><p class="muted">保存后对应时段不可预约。</p>
        <label>行程名称<input v-model="form.title"></label>
        <div class="two"><label>开始日期<input v-model="form.startDate" :min="todayIso" type="date"></label><label>结束日期<input v-model="form.endDate" :min="form.startDate" type="date"></label></div>
        <div class="two"><label>开始时间<input v-model="form.start" type="time"></label><label>结束时间<input v-model="form.end" type="time"></label></div>
        <label>行程类型<select v-model="form.type"><option value="out">外出</option><option value="meeting">会议</option><option value="personal">其他</option></select></label>
        <label>可见范围</label><div class="visibility-confirm-options inline"><button :class="{selected:form.visibility==='management'}" @click="form.visibility='management'; voiceScheduleNeedsVisibility=false"><b>内容全员可见</b><small>所有应用成员可查看行程内容</small></button><button :class="{selected:form.visibility==='private'}" @click="form.visibility='private'; voiceScheduleNeedsVisibility=false"><b>内容仅自己可见</b><small>其他成员只会看到该时段已占用</small></button></div>
        <button class="primary" :disabled="isReadOnlyBoss" @click="saveSchedule">保存个人行程</button>
      </template>
      <template v-else-if="dialog === 'visibilityReminder'">
        <h2>请选择可见范围</h2><p class="muted">本次语音中未识别到可见范围。为避免行程内容被错误公开，请确认后再保存。</p>
        <div class="visibility-confirm-options"><button @click="confirmScheduleVisibility('management')"><b>内容全员可见</b><small>所有应用成员可查看行程内容</small></button><button @click="confirmScheduleVisibility('private')"><b>内容仅自己可见</b><small>其他成员只会看到该时段已占用</small></button></div>
      </template>
      <template v-else-if="dialog === 'meeting'">
        <h2>组织开会</h2><p class="muted">参会成员：{{ selectedMemberNames.join('、') }}</p>
        <div class="two"><label>会议日期<input v-model="meetingForm.date" :min="todayIso" type="date"></label><label v-if="meetingForm.duration !== 'custom'">会议时间<input v-model="meetingForm.time" type="time"></label></div>
        <label>会议地点<select v-model="meetingForm.roomId"><option value="">暂不选择地点</option><option v-for="room in orderedMeetingRooms" :key="room.id" :value="room.id">{{ room.name }}</option></select><small v-if="selectedMeetingRoomName">将通知参会人：{{ selectedMeetingRoomName }}</small></label>
        <label>会议时长</label><div class="duration-options"><button v-for="item in [['15','15分钟'],['30','半小时'],['60','一小时'],['custom','自定义']]" :key="item[0]" :class="{ selected: meetingForm.duration === item[0] }" @click="meetingForm.duration = item[0]">{{ item[1] }}</button></div>
        <div v-if="meetingForm.duration === 'custom'" class="two"><label>开始时间<input v-model="meetingForm.customStart" type="time"></label><label>结束时间<input v-model="meetingForm.customEnd" type="time"></label></div>
        <label>会议内容（选填）<textarea v-model="meetingForm.topic" rows="3" placeholder="可填写会议主题或需要讨论的事项"></textarea></label>
        <button class="primary" :disabled="isReadOnlyBoss" @click="submitMeeting">提交并发送会议提醒</button>
      </template>
      <template v-else-if="dialog === 'voice'">
        <h2>语音识别结果</h2><p class="muted">AI 已完成转写和意图判断，请确认内容后提交。</p>
        <div class="intent-result"><small>AI 识别意图</small><b>{{ voiceIntentLabels[voiceIntent] }}</b></div>
        <div class="voice-intents"><button v-for="item in [['schedule','个人行程'],['status','修改状态'],['meeting','组织开会'],['approval','进行审批']]" :key="item[0]" :class="{ selected: voiceIntent === item[0] }" @click="voiceIntent = item[0] as typeof voiceIntent">{{ item[1] }}</button></div>
        <div v-if="voiceAnalysis && voiceAnalysis.rawTranscript !== voiceAnalysis.correctedTranscript" class="voice-raw"><small>企微原始转写</small><p>{{ voiceAnalysis.rawTranscript }}</p></div>
        <label class="voice-result">DeepSeek 纠错结果<textarea v-model="voiceText" rows="5"></textarea><small>可直接修改文字；修改后需重新解析并再次确认。</small></label>
        <div v-if="voiceAnalysis?.corrections.length" class="voice-corrections"><small v-for="item in voiceAnalysis.corrections" :key="`${item.from}-${item.to}`">“{{ item.from }}” → “{{ item.to }}”：{{ item.reason }}</small></div>
        <div v-if="voiceIntent === 'meeting' && voiceRoomCandidates.length" class="voice-person-match"><h3>识别到会议地点</h3><label class="voice-candidate"><input v-model="voiceRoomSelection" type="radio" name="voice-room" value=""><span><b>暂不选择此地点</b><small>先不将地点写入会议提醒</small></span><em>—</em></label><label v-for="room in voiceRoomCandidates" :key="room.id" class="voice-candidate"><input v-model="voiceRoomSelection" type="radio" name="voice-room" :value="room.id"><span><b>{{ room.name }}</b><small>{{ room.reason }}</small></span><em>{{ room.score }}</em></label></div>
        <div v-for="match in voiceAnalysis?.personMatches || []" :key="match.spokenName" class="voice-person-match">
          <h3>识别到“{{ match.spokenName }}”<span v-if="voiceAnalysis?.suspectedNameError"> · 疑似人名识别错误</span></h3>
          <label class="voice-candidate">
            <input v-model="voiceSelections[match.spokenName]" type="radio" :name="`person-${match.spokenName}`" value="">
            <span><b>暂不选择此人</b><small>未在候选中找到正确员工，先不匹配到任何角色</small></span><em>—</em>
          </label>
          <label v-for="candidate in match.candidates" :key="candidate.id" class="voice-candidate">
            <input v-model="voiceSelections[match.spokenName]" type="radio" :name="`person-${match.spokenName}`" :value="candidate.id">
            <span><b>{{ candidate.name }}<template v-if="candidate.matchedAlias">（{{ candidate.matchedAlias }}）</template></b><small>{{ candidate.department }} · {{ candidate.jobTitle }} · {{ candidate.matchReason }}</small></span><em>{{ candidate.score }}</em>
          </label>
          <p v-if="!match.candidates.length" class="muted">没有找到可靠候选，请修改上方人名后重新解析。</p>
        </div>
        <button class="primary" :disabled="isReadOnlyBoss" @click="confirmVoice">确认并提交</button>
      </template>
      <template v-else-if="dialog === 'scheduleDetail' && selectedScheduleDetail">
        <h2>{{ displayScheduleTitle(selectedScheduleDetail) }}</h2>
        <div class="schedule-detail-card">
          <p><b>时间</b><span>{{ selectedScheduleDetail.start }}—{{ selectedScheduleDetail.end }}</span></p>
          <p v-if="selectedScheduleDetail.location"><b>地点</b><span>{{ selectedScheduleDetail.location }}</span></p>
          <p><b>可见范围</b><span>{{ visibilityLabels[selectedScheduleDetail.visibility] }}</span></p>
          <p v-if="selectedScheduleDetail.type === 'meeting'"><b>会议对象</b><span>{{ selectedScheduleDetail.participants?.length ? selectedScheduleDetail.participants.join('、') : '暂无会议对象' }}</span></p>
          <p v-if="selectedScheduleDetail.type !== 'meeting' || displayScheduleContent(selectedScheduleDetail)"><b>{{ selectedScheduleDetail.type === 'meeting' ? '会议内容' : '行程内容' }}</b><span>{{ displayScheduleContent(selectedScheduleDetail) || '暂无内容' }}</span></p>
        </div>
        <div class="schedule-detail-actions"><button :disabled="isReadOnlyBoss" @click="cancelScheduleDetail">取消日程</button><button :disabled="isReadOnlyBoss" @click="openEditSchedule">修改日程</button></div>
      </template>
      <template v-else-if="dialog === 'editSchedule' && selectedScheduleDetail">
        <h2>修改日程</h2><p class="muted">保存后会重新校验老板日程和会议室占用。</p>
        <label>日程内容<input v-model="editScheduleForm.title"></label>
        <label>日期<input v-model="editScheduleForm.date" :min="todayIso" type="date"></label>
        <div class="two"><label>开始时间<input v-model="editScheduleForm.start" type="time"></label><label>结束时间<input v-model="editScheduleForm.end" type="time"></label></div>
        <label v-if="selectedScheduleDetail.type === 'meeting'">会议地点<select v-model="editScheduleForm.roomId"><option value="">暂不选择地点</option><option v-for="room in orderedMeetingRooms" :key="room.id" :value="room.id">{{ room.name }}</option></select></label>
        <label>可见范围</label><div class="visibility-confirm-options inline"><button :class="{selected:editScheduleForm.visibility==='management'}" @click="editScheduleForm.visibility='management'"><b>内容全员可见</b><small>员工端可查看该日程内容</small></button><button :class="{selected:editScheduleForm.visibility==='private'}" @click="editScheduleForm.visibility='private'"><b>内容仅自己可见</b><small>员工端只显示为已占用</small></button></div>
        <button class="primary" :disabled="isReadOnlyBoss" @click="saveScheduleEdit">保存修改</button>
      </template>
    </section></div>
  </section></main>
</template>
