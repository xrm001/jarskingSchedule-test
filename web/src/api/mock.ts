import type { BossScheduleApi } from './client'
import type { ApprovalGroup, BossStatus, PersonalScheduleInput, Reminder, Schedule, User } from '../types'

const pause = () => new Promise<void>(resolve => setTimeout(resolve, 20))

const initialSchedules: Schedule[] = [
  { id: 's1', title: '经营数据复盘', start: '10:00', end: '11:00', type: 'meeting', location: '18楼大会议室', visibility: 'management', participants: ['苏跃', '胥建'], content: '经营数据复盘' },
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

let schedules: Schedule[]
let schedulesByDate: Record<string, Schedule[]>
let groups: ApprovalGroup[]
let reminders: Reminder[]

export function resetMockData() {
  schedules = structuredClone(initialSchedules)
  schedulesByDate = {}
  groups = structuredClone(initialGroups)
  reminders = structuredClone(initialReminders)
}

resetMockData()

function overlaps(a: { start: string; end: string }, b: { start: string; end: string }) {
  return a.start < b.end && a.end > b.start
}

export const mockApi: BossScheduleApi = {
  async loginWithWeCom(code) {
    await pause()
    if (code === 'preview-management') return { id:'manager-demo', name:'陈经理', role:'MANAGEMENT' } as User
    if (code === 'preview-admin') return { id:'admin-demo', name:'系统管理员', role:'ADMIN' } as User
    return { id: 'shi-zong', name: '石总', role: 'BOSS' } as User
  },
  async getToday() { await pause(); return structuredClone(schedules) },
  async getApprovals() { await pause(); return structuredClone(groups) },
  async getReminders() { await pause(); return structuredClone(reminders) },
  async changeStatus(_status: BossStatus, _durationMinutes?: number) { await pause() },
  async createPersonalSchedule(input: PersonalScheduleInput) {
    await pause()
    const item: Schedule = { ...input, id: crypto.randomUUID() }
    schedules.push(item)
    return structuredClone(item)
  },
  async organizeMeeting(input) {
    await pause()
    const date = input.startAt.slice(0,10)
    const start = input.startAt.slice(11,16)
    const endDate = new Date(input.startAt)
    endDate.setMinutes(endDate.getMinutes() + input.durationMinutes)
    const item: Schedule = { id:crypto.randomUUID(), title:input.topic, start, end:endDate.toTimeString().slice(0,5), type:'meeting', visibility:'management', participants:input.participantIds.map((_, index) => `参会人${index + 1}`), content:input.topic }
    const today = new Date().toISOString().slice(0,10)
    if (date === today) schedules.push(item)
    schedulesByDate[date] = [...(schedulesByDate[date] ?? []), item]
    return structuredClone({ ...item, notifications:{picked:input.participantIds.length,sent:input.participantIds.length,failed:0} })
  },
  async decideApplication(groupId, applicationId, decision, expectedVersion) {
    await pause()
    const group = groups.find(item => item.id === groupId)
    if (!group) throw new Error('审批分组不存在')
    const target = group.applications.find(item => item.id === applicationId)
    if (!target) throw new Error('会议申请不存在')
    if (target.version !== expectedVersion) throw new Error('申请已被更新，请刷新后重试')
    if (target.status !== 'pending') throw new Error('该申请已处理')

    if (decision === 'approve') {
      target.status = 'approved'
      target.version += 1
      for (const candidateGroup of groups) {
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
  async getManagementDirectory() { await pause(); return [] },
  async getMembers() { await pause(); return [] },
  async getMeetingRooms() { await pause(); return [] },
  async getCurrentBossSchedule(date) { await pause(); return structuredClone((schedulesByDate[date] ?? []).map(item => ({ id:item.id,sourceType:item.type === 'personal' ? 'PERSONAL' : 'ORGANIZED_MEETING',title:item.title,startAt:`${date}T${item.start}:00+08:00`,endAt:`${date}T${item.end}:00+08:00`,visibility:item.visibility === 'private' ? 'BOSS_ONLY' : 'ALL_MEMBERS',roomName:item.location ?? null,participantNames:item.participants ?? [],meetingContent:item.content ?? null }))) },
  async getCurrentBossStatus() { await pause(); return {status:'available',label:'有空',start:null,end:null,available:true} },
  async createMeetingRequest() { await pause(); return {id:crypto.randomUUID(),version:1,status:'pending'} },
  async getMyRequests() { await pause(); return [] },
  async cancelMeetingRequest() { await pause() },
  async getAdminRequests() { await pause(); return [] },
  async addMember() { await pause() },
  async changeMemberRole() { await pause() },
  async removeMember() { await pause() },
  async getAdminMeetingRooms() { await pause(); return [] },
  async setMeetingRoomEnabled() { await pause() },
  async getMeetingRoomAvailability() { await pause(); return [] },
  async getWeComVoiceSignature() { await pause(); return {corpId:'demo',agentId:'1',timestamp:1,nonceStr:'demo',signature:'demo',agentSignature:'demo',jsApiList:[]} },
  async parseVoiceText(_scene,transcript) { await pause(); return {recordId:'demo',rawTranscript:transcript,correctedTranscript:transcript,corrections:[],intent:'UNKNOWN' as const,confidence:1,ambiguities:[],suspectedNameError:false,parsed:{},requiresConfirmation:true as const,confirmationToken:'demo',personMatches:[]} },
  async confirmVoicePersons() { await pause(); return {confirmed:true} },
  async sendAdminNotificationTest() { await pause() },
  async sendDailySummaryTest() { await pause(); return { ok:true,date:'2026-07-07',recipients:1,delivery:{picked:1,sent:1,failed:0},content:'【石总今日日程摘要】7月7日 星期二\n\n今日无日程。' } },
  async processNotificationOutbox() { await pause(); return {ok:true,picked:0,sent:0,failed:0} },
}
