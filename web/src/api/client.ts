import type { ApprovalGroup, BossStatus, PersonalScheduleInput, Reminder, Schedule, User } from '../types'

export interface BossScheduleApi {
  loginWithWeCom(code?: string): Promise<User>
  getToday(): Promise<Schedule[]>
  getApprovals(): Promise<ApprovalGroup[]>
  getReminders(): Promise<Reminder[]>
  changeStatus(status: BossStatus, durationMinutes?: number): Promise<void>
  createPersonalSchedule(input: PersonalScheduleInput): Promise<Schedule>
  decideApplication(groupId: string, applicationId: string, decision: 'approve'|'reject', expectedVersion: number): Promise<void>
  markAllRemindersRead(): Promise<void>
}

export class HttpApiClient implements BossScheduleApi {
  constructor(private readonly baseUrl = '/api/v1') {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      ...init,
    })
    if (!response.ok) throw new Error(`请求失败：${response.status}`)
    return response.status === 204 ? undefined as T : response.json()
  }

  loginWithWeCom(code?: string) { return this.request<User>('/auth/wecom', { method: 'POST', body: JSON.stringify({ code }) }) }
  getToday() { return this.request<Schedule[]>('/boss/schedules/today') }
  getApprovals() { return this.request<ApprovalGroup[]>('/boss/approval-groups') }
  getReminders() { return this.request<Reminder[]>('/boss/reminders') }
  changeStatus(status: BossStatus, durationMinutes?: number) { return this.request<void>('/boss/status', { method: 'PUT', body: JSON.stringify({ status, durationMinutes }) }) }
  createPersonalSchedule(input: PersonalScheduleInput) { return this.request<Schedule>('/boss/schedules', { method: 'POST', body: JSON.stringify(input) }) }
  decideApplication(groupId: string, applicationId: string, decision: 'approve'|'reject', expectedVersion: number) {
    void groupId
    return this.request<void>(`/meeting-requests/${applicationId}/${decision}`, {
      method: 'POST',
      body: JSON.stringify({ expectedVersion }),
    })
  }
  markAllRemindersRead() { return this.request<void>('/boss/reminders/read-all', { method: 'POST' }) }
}
