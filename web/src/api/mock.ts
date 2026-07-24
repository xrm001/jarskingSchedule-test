import type { BossScheduleApi } from './client'
import type { ApprovalGroup, BossStatus, DirectoryMember, PersonalScheduleInput, Reminder, Schedule, StoredRequest, User } from '../types'

const pause = () => new Promise<void>(resolve => setTimeout(resolve, 20))

const initialSchedules: Schedule[] = [
  { id: 's1', title: '经营数据复盘', start: '10:00', end: '11:30', type: 'meeting', sourceType:'ORGANIZED_MEETING', location: '18楼大会议室', visibility: 'management', participants: ['苏跃', '胥建'], participantIds:['m-su','m-xu'], content: '经营数据复盘' },
  { id: 's2', title: '个人行程', start: '16:30', end: '18:00', type: 'personal', visibility: 'private' },
]

const initialGroups: ApprovalGroup[] = [{
  id: 'g1', start: '13:30', end: '15:30', applications: [
    { id: 'a1', applicant: '李思思', department: '品牌部', topic: '品牌项目阶段汇报', room: '17楼会议室1', start: '13:30', end: '14:30', submittedAt: '12分钟前', status: 'pending', version: 1 },
    { id: 'a2', applicant: '周凯', department: '运营部', topic: '7月渠道计划确认', room: '18楼会议室', start: '14:00', end: '15:00', submittedAt: '8分钟前', status: 'pending', version: 1 },
    { id: 'a3', applicant: '陈经理', department: '销售部', topic: '重点客户报价审批', room: '18楼大会议室', start: '14:30', end: '15:30', submittedAt: '3分钟前', status: 'pending', version: 1 },
  ],
}]

const initialReminders: Reminder[] = [
  { id: 'r1', title: '3份会议申请待审批', detail: '13:30—15:30，存在时间重叠的多份申请。', time: '刚刚', read: false },
  { id: 'r2', title: '经营数据复盘将在60分钟后开始', detail: '10:00 · 18楼大会议室', time: '09:00', read: false },
  { id: 'r3', title: '今日行程摘要已发送', detail: '系统每天09:00自动发送。', time: '09:00', read: true },
]

const demoEmployees: DirectoryMember[] = [
  { id:'m-su', displayName:'苏跃', jobTitle:'总经理助理', department:'总经办', roles:['MANAGEMENT'], isPrimaryMeetingTarget:true, wecomBound:true },
  { id:'m-xu', displayName:'胥建', jobTitle:'运营管理总助', department:'总经办', roles:['MANAGEMENT'], isPrimaryMeetingTarget:true, wecomBound:true },
  { id:'m-long', displayName:'龙继华', jobTitle:'供应链总助', department:'总经办', roles:['MANAGEMENT'], isPrimaryMeetingTarget:true, wecomBound:true },
  { id:'e-li', displayName:'李小敏', jobTitle:'设计专员', department:'设计部', roles:['MANAGEMENT'], isPrimaryMeetingTarget:false, wecomBound:true },
  { id:'e-chen', displayName:'陈小东', jobTitle:'仓库文员', department:'仓储部', roles:['MANAGEMENT'], isPrimaryMeetingTarget:false, wecomBound:true },
  { id:'e-wu', displayName:'吴小敏', jobTitle:'采购助理', department:'采购部', roles:['MANAGEMENT'], isPrimaryMeetingTarget:false, wecomBound:true },
]

const demoMeetingRooms = [
  { id:'room-boss-office', name:'石总办公室', floor:18, capacity:6, equipment:'会客室' },
  { id:'room-18-big', name:'18楼大会议室', floor:18, capacity:50, equipment:'投影、视频' },
  { id:'room-18', name:'18楼会议室', floor:18, capacity:10, equipment:'投影' },
  { id:'room-17-hall', name:'17楼大麻展厅', floor:17, capacity:8, equipment:'电视' },
  { id:'room-17-1', name:'17楼会议室1', floor:17, capacity:10, equipment:'电视' },
  { id:'room-17-2', name:'17楼会议室2', floor:17, capacity:4, equipment:null },
  { id:'room-17-vip', name:'17楼vip会议室', floor:17, capacity:5, equipment:'电视' },
]

let schedules: Schedule[]
let schedulesByDate: Record<string, Schedule[]>
let groups: ApprovalGroup[]
type BossSpaceKey = 'shi' | 'mao'
let groupsByBossSpace: Record<BossSpaceKey, ApprovalGroup[]>
let myRequestsByBossSpace: Record<BossSpaceKey, StoredRequest[]>
let reminders: Reminder[]

export function resetMockData() {
  schedules = structuredClone(initialSchedules)
  const today = new Date().toISOString().slice(0, 10)
  schedulesByDate = { [today]: schedules }
  groups = structuredClone(initialGroups)
  groupsByBossSpace = { shi: structuredClone(initialGroups), mao: [] }
  myRequestsByBossSpace = { shi: [], mao: [] }
  reminders = structuredClone(initialReminders)
}

resetMockData()

function overlaps(a: { start: string; end: string }, b: { start: string; end: string }) {
  return a.start < b.end && a.end > b.start
}

function currentBossSpace(): BossSpaceKey {
  return new URLSearchParams(location.search).get('bossSpace') === 'mao' ? 'mao' : 'shi'
}

export const mockApi: BossScheduleApi = {
  async loginWithWeCom(code) {
    await pause()
    if (code === 'preview-management') return { id:'manager-demo', name:'陈经理', role:'MANAGEMENT' } as User
    if (code === 'preview-admin') return { id:'admin-demo', name:'系统管理员', role:'ADMIN' } as User
    return { id: 'shi-zong', name: '石总', role: 'BOSS' } as User
  },
  async getToday() { await pause(); return structuredClone(schedules) },
  async getApprovals() { await pause(); return structuredClone(groupsByBossSpace[currentBossSpace()] ?? groups) },
  async getReminders() { await pause(); return structuredClone(reminders) },
  async changeStatus(_status: BossStatus, _durationMinutes?: number) { await pause() },
  async createPersonalSchedule(input: PersonalScheduleInput) {
    await pause()
    const item: Schedule = { ...input, id: crypto.randomUUID() }
    const today = new Date().toISOString().slice(0,10)
    if (input.startDate === today) {
      schedules.push(item)
      schedulesByDate[input.startDate] = schedules
    } else {
      schedulesByDate[input.startDate] = [...(schedulesByDate[input.startDate] ?? []), item]
    }
    return structuredClone(item)
  },
  async updateBossSchedule(id, input) {
    await pause()
    const update = (list: Schedule[]) => {
      const item = list.find(schedule => schedule.id === id)
      if (!item) return null
      item.title = input.title
      item.start = input.startAt.slice(11,16)
      item.end = input.endAt.slice(11,16)
      item.visibility = input.visibility === 'private' ? 'private' : 'management'
      item.content = input.title
      if (input.participantIds) {
        item.participantIds = [...input.participantIds]
        item.participants = input.participantIds.map(id => demoEmployees.find(member => member.id === id)?.displayName || '参会人')
      }
      return item
    }
    const date = input.startAt.slice(0,10)
    const item = update(schedules) || update(schedulesByDate[date] ?? [])
    if (!item) throw new Error('日程不存在')
    return structuredClone(item)
  },
  async cancelBossSchedule(id) {
    await pause()
    schedules = schedules.filter(item => item.id !== id)
    for (const date of Object.keys(schedulesByDate)) schedulesByDate[date] = schedulesByDate[date]!.filter(item => item.id !== id)
  },
  async organizeMeeting(input) {
    await pause()
    const date = input.startAt.slice(0,10)
    const start = input.startAt.slice(11,16)
    const endDate = new Date(input.startAt)
    endDate.setMinutes(endDate.getMinutes() + input.durationMinutes)
    const topic = input.topic?.trim() || '会谈'
    const item: Schedule = { id:crypto.randomUUID(), title:topic, start, end:endDate.toTimeString().slice(0,5), type:'meeting', sourceType:'ORGANIZED_MEETING', visibility:'management', participants:input.participantIds.map(id => demoEmployees.find(member => member.id === id)?.displayName || '参会人'), participantIds:[...input.participantIds], content:topic }
    const today = new Date().toISOString().slice(0,10)
    if (date === today) {
      schedules.push(item)
      schedulesByDate[date] = schedules
    } else {
      schedulesByDate[date] = [...(schedulesByDate[date] ?? []), item]
    }
    return structuredClone({ ...item, notifications:{picked:input.participantIds.length,sent:input.participantIds.length,failed:0} })
  },
  async decideApplication(groupId, applicationId, decision, expectedVersion, meetingMode) {
    await pause()
    const activeGroups = groupsByBossSpace[currentBossSpace()] ?? groups
    const group = activeGroups.find(item => item.id === groupId)
    if (!group) throw new Error('审批分组不存在')
    const target = group.applications.find(item => item.id === applicationId)
    if (!target) throw new Error('会议申请不存在')
    if (target.version !== expectedVersion) throw new Error('申请已被更新，请刷新后重试')
    if (target.status !== 'pending') throw new Error('该申请已处理')

    if (decision === 'approve') {
      target.status = 'approved'
      target.meetingMode = meetingMode ?? 'FACE_TO_FACE'
      target.version += 1
      for (const candidateGroup of activeGroups) {
        for (const candidate of candidateGroup.applications) {
          if (candidate.id !== target.id && candidate.status === 'pending' && overlaps(target, candidate)) {
            candidate.status = 'rejected'
            candidate.version += 1
          }
        }
      }
    } else {
      target.status = 'rejected'
      target.version += 1
    }
  },
  async markAllRemindersRead() { await pause(); reminders.forEach(item => { item.read = true }) },
  async getManagementDirectory() { await pause(); return structuredClone(demoEmployees) },
  async getEmployees() { await pause(); return structuredClone(demoEmployees) },
  async getMembers() { await pause(); return [] },
  async getMeetingRooms() { await pause(); return structuredClone(demoMeetingRooms) },
  async getCurrentBossSchedule(date) { await pause(); return structuredClone((schedulesByDate[date] ?? []).map(item => ({ id:item.id,sourceType:item.sourceType || (item.type === 'personal' ? 'PERSONAL' : 'ORGANIZED_MEETING'),scheduleKind:item.type,title:item.title,startAt:`${date}T${item.start}:00+08:00`,endAt:`${date}T${item.end}:00+08:00`,visibility:item.visibility === 'private' ? 'BOSS_ONLY' : 'ALL_MEMBERS',roomName:item.location ?? null,participantNames:item.participants ?? [],participantIds:item.participantIds ?? [],meetingContent:item.content ?? null }))) },
  async getCurrentBossUpcomingSchedule() {
    await pause()
    const today = new Date()
    const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
    return structuredClone(Object.entries(schedulesByDate)
      .filter(([date]) => date > todayKey)
      .flatMap(([date,items]) => items.map(item => ({
        id:item.id,
        sourceType:item.sourceType || (item.type === 'personal' ? 'PERSONAL' : 'ORGANIZED_MEETING'),
        scheduleKind:item.type,
        title:item.title,
        startAt:item.fullStartAt || `${date}T${item.start}:00+08:00`,
        endAt:item.fullEndAt || `${date}T${item.end}:00+08:00`,
        fullStartAt:item.fullStartAt || `${date}T${item.start}:00+08:00`,
        fullEndAt:item.fullEndAt || `${date}T${item.end}:00+08:00`,
        visibility:item.visibility === 'private' ? 'BOSS_ONLY' : 'ALL_MEMBERS',
        roomName:item.location ?? null,
        participantNames:item.participants ?? [],
        participantIds:item.participantIds ?? [],
        meetingContent:item.content ?? null,
      })))
      .filter((entry,index,rows) => rows.findIndex(candidate => candidate.id === entry.id) === index)
      .sort((left,right) => left.startAt.localeCompare(right.startAt)))
  },
  async getCurrentBossStatus() {
    await pause()
    const now = new Date()
    const hhmm = now.toTimeString().slice(0,5)
    const active = schedules.find(item => item.start <= hhmm && item.end > hhmm)
    if (active) return {status:active.type === 'meeting' ? 'meeting' : 'out',label:active.type === 'meeting' ? '会议中' : '外出中',start:active.start,end:active.end,available:false,scheduleId:active.id,sourceType:active.type}
    return {status:'available',label:'有空',start:null,end:null,available:true}
  },
  async createMeetingRequest(input) {
    await pause()
    const bossSpace = currentBossSpace()
    const requestDate = String(input.startAt ?? '').slice(0,10)
    const requestStart = String(input.startAt ?? '').slice(11,16)
    const requestEnd = String(input.endAt ?? '').slice(11,16)
    const requestTopic = String(input.topic || '会议申请')
    const requestRoomId = String(input.roomId || '')
    const requestRoom = demoMeetingRooms.find(item => item.id === requestRoomId)?.name ?? '未选择会议室'
    const requestId = crypto.randomUUID()
    if (requestDate && requestStart && requestEnd) {
      const application = {
        id:requestId,
        applicant:'本地测试员工',
        department:'测试部门',
        topic:requestTopic,
        room:requestRoom,
        start:requestStart,
        end:requestEnd,
        submittedAt:'刚刚',
        status:'pending' as const,
        version:1,
      }
      const targetGroups = groupsByBossSpace[bossSpace]
      const group = targetGroups.find(item => item.start === requestStart && item.end === requestEnd)
      if (group) group.applications.push(application)
      else targetGroups.push({ id:crypto.randomUUID(), start:requestStart, end:requestEnd, applications:[application] })
      myRequestsByBossSpace[bossSpace].push({
        id:requestId,
        topic:requestTopic,
        startAt:`${requestDate}T${requestStart}:00+08:00`,
        endAt:`${requestDate}T${requestEnd}:00+08:00`,
        room:requestRoom,
        status:'pending',
        version:1,
      })
    }
    return {id:requestId,version:1,status:'pending'}
    const date = String(input.startAt ?? '').slice(0,10)
    const start = String(input.startAt ?? '').slice(11,16)
    const end = String(input.endAt ?? '').slice(11,16)
    if (date && start && end) {
      const item: Schedule = { id:crypto.randomUUID(), title:'已占用', start, end, type:'meeting', visibility:'private' }
      schedulesByDate[date] = [...(schedulesByDate[date] ?? []), item]
    }
    return {id:crypto.randomUUID(),version:1,status:'pending'}
  },
  async getMyRequests() { await pause(); return structuredClone(myRequestsByBossSpace[currentBossSpace()] ?? []) },
  async cancelMeetingRequest() { await pause() },
  async getAdminRequests() { await pause(); return [] },
  async addMember() { await pause() },
  async changeMemberRole() { await pause() },
  async removeMember() { await pause() },
  async getAdminMeetingRooms() { await pause(); return [] },
  async setMeetingRoomEnabled() { await pause() },
  async getMeetingRoomAvailability() { await pause(); return structuredClone(demoMeetingRooms.map(room => ({ ...room, available:true }))) },
  async getWeComVoiceSignature() { await pause(); return {corpId:'demo',agentId:'1',timestamp:1,nonceStr:'demo',signature:'demo',agentSignature:'demo',jsApiList:[]} },
  async parseVoiceText(_scene,transcript) { await pause(); return {recordId:'demo',rawTranscript:transcript,correctedTranscript:transcript,corrections:[],intent:'UNKNOWN' as const,confidence:1,ambiguities:[],suspectedNameError:false,parsed:{},requiresConfirmation:true as const,confirmationToken:'demo',personMatches:[]} },
  async confirmVoicePersons() { await pause(); return {confirmed:true} },
  async markVoiceFailed() { await pause(); return {ok:true} },
  async sendAdminNotificationTest() { await pause() },
  async sendDailySummaryTest() { await pause(); return { ok:true,date:'2026-07-07',recipients:1,delivery:{picked:1,sent:1,failed:0},content:'【石总今日日程摘要】7月7日 星期二\n\n今日无日程。' } },
  async processNotificationOutbox() { await pause(); return {ok:true,picked:0,sent:0,failed:0} },
}
