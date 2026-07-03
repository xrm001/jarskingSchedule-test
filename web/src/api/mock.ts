import type { BossScheduleApi } from './client'
import type { ApprovalGroup, BossStatus, PersonalScheduleInput, Reminder, Schedule, User } from '../types'

const pause = () => new Promise<void>(resolve => setTimeout(resolve, 20))

const initialSchedules: Schedule[] = [
  { id: 's1', title: '经营数据复盘', start: '10:00', end: '11:00', type: 'meeting', location: '18楼大会议室', visibility: 'management' },
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
let groups: ApprovalGroup[]
let reminders: Reminder[]

export function resetMockData() {
  schedules = structuredClone(initialSchedules)
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
}
