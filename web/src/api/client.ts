import type { AdminMeetingRoom, AdminRequest, ApprovalGroup, AvailableMeetingRoom, BossPresence, BossScheduleEntry, BossStatus, DirectoryMember, MeetingRoom, PersonalScheduleInput, Reminder, Schedule, StoredRequest, User, VoiceAnalysisResult, WeComVoiceSignature } from '../types'

export interface BossScheduleApi {
  loginWithWeCom(code?: string): Promise<User>
  getToday(): Promise<Schedule[]>
  getApprovals(): Promise<ApprovalGroup[]>
  getReminders(): Promise<Reminder[]>
  changeStatus(status: BossStatus, durationMinutes?: number): Promise<void>
  createPersonalSchedule(input: PersonalScheduleInput): Promise<Schedule>
  organizeMeeting(input:{participantIds:string[];startAt:string;durationMinutes:number;topic:string}):Promise<Schedule & {notifications?:{picked:number;sent:number;failed:number}}>
  decideApplication(groupId: string, applicationId: string, decision: 'approve'|'reject', expectedVersion: number): Promise<void>
  markAllRemindersRead(): Promise<void>
  getManagementDirectory(): Promise<DirectoryMember[]>
  getMembers(): Promise<DirectoryMember[]>
  getMeetingRooms(): Promise<MeetingRoom[]>
  getCurrentBossSchedule(date:string): Promise<BossScheduleEntry[]>
  getCurrentBossStatus(): Promise<BossPresence>
  createMeetingRequest(input:Record<string,unknown>): Promise<{id:string;version:number;status:string}>
  getMyRequests(): Promise<StoredRequest[]>
  cancelMeetingRequest(id:string): Promise<void>
  getAdminRequests(): Promise<AdminRequest[]>
  addMember(input:{displayName:string;department:string;role:string}):Promise<void>
  changeMemberRole(id:string,role:string):Promise<void>
  removeMember(id:string):Promise<void>
  getAdminMeetingRooms():Promise<AdminMeetingRoom[]>
  setMeetingRoomEnabled(id:string,enabled:boolean):Promise<void>
  getMeetingRoomAvailability(date:string,start:string,end:string):Promise<AvailableMeetingRoom[]>
  getWeComVoiceSignature(url:string):Promise<WeComVoiceSignature>
  parseVoiceText(scene:string,transcript:string):Promise<VoiceAnalysisResult>
  confirmVoicePersons(input:{recordId:string;confirmationToken:string;selections:Array<{spokenName:string;userId:string}>}):Promise<unknown>
  sendAdminNotificationTest():Promise<void>
  processNotificationOutbox():Promise<{ok:boolean;picked:number;sent:number;failed:number}>
}

export class HttpApiClient implements BossScheduleApi {
  constructor(private readonly baseUrl = '/api/v1') {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const csrf = document.cookie.split(';').map(value => value.trim())
      .find(value => value.startsWith('jarsking_csrf='))?.slice('jarsking_csrf='.length)
    const method = init?.method?.toUpperCase() ?? 'GET'
    const hasBody = init?.body !== undefined && init.body !== null
    const response = await fetch(`${this.baseUrl}${this.withTestRole(path)}`, {
      credentials: 'include',
      headers: {
        ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        ...(!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrf ? { 'X-CSRF-Token': csrf } : {}),
        ...init?.headers,
      },
      ...init,
    })
    if (!response.ok) {
      const errorBody=await response.json().catch(()=>null) as {message?:string}|null
      throw new Error(errorBody?.message||`请求失败：${response.status}`)
    }
    return response.status === 204 ? undefined as T : response.json()
  }

  private withTestRole(path:string):string {
    const params = new URLSearchParams(location.search)
    const role = params.get('testRole')
    if (!['BOSS','MANAGEMENT','ADMIN'].includes(role || '')) return path
    const separator = path.includes('?') ? '&' : '?'
    return `${path}${separator}testRole=${encodeURIComponent(role!)}`
  }

  loginWithWeCom(_code?: string) { return this.request<User>('/auth/me') }
  getToday() { return this.request<Schedule[]>('/boss/schedules/today') }
  getApprovals() { return this.request<ApprovalGroup[]>('/boss/approval-groups') }
  getReminders() { return this.request<Reminder[]>('/boss/reminders') }
  changeStatus(status: BossStatus, durationMinutes?: number) { return this.request<void>('/boss/status', { method: 'PUT', body: JSON.stringify({ status, durationMinutes }) }) }
  createPersonalSchedule(input: PersonalScheduleInput) {
    const now = new Date()
    const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
    return this.request<Schedule>('/boss/schedules', { method: 'POST', body: JSON.stringify({
      ...input, startAt:`${date}T${input.start}:00+08:00`, endAt:`${date}T${input.end}:00+08:00`,
    }) })
  }
  organizeMeeting(input:{participantIds:string[];startAt:string;durationMinutes:number;topic:string}) {
    return this.request<Schedule & {notifications?:{picked:number;sent:number;failed:number}}>('/boss/organized-meetings', {
      method:'POST',
      body:JSON.stringify(input),
    })
  }
  decideApplication(groupId: string, applicationId: string, decision: 'approve'|'reject', expectedVersion: number) {
    void groupId
    return this.request<void>(`/meeting-requests/${applicationId}/${decision}`, {
      method: 'POST',
      body: JSON.stringify({ expectedVersion }),
    })
  }
  markAllRemindersRead() { return this.request<void>('/boss/reminders/read-all', { method: 'POST' }) }
  getManagementDirectory() { return this.request<DirectoryMember[]>('/directory/management') }
  getMembers() { return this.request<DirectoryMember[]>('/directory/members') }
  getMeetingRooms() { return this.request<MeetingRoom[]>('/meeting-rooms') }
  getCurrentBossSchedule(date:string) { return this.request<BossScheduleEntry[]>(`/bosses/current/schedule?date=${encodeURIComponent(date)}`) }
  getCurrentBossStatus() { return this.request<BossPresence>('/boss/status/current') }
  createMeetingRequest(input:Record<string,unknown>) { return this.request<{id:string;version:number;status:string}>('/meeting-requests',{method:'POST',body:JSON.stringify(input)}) }
  getMyRequests() { return this.request<StoredRequest[]>('/meeting-requests/mine') }
  cancelMeetingRequest(id:string) { return this.request<void>(`/meeting-requests/${id}/cancel`,{method:'POST'}) }
  getAdminRequests() { return this.request<AdminRequest[]>('/admin/meeting-requests') }
  addMember(input:{displayName:string;department:string;role:string}) { return this.request<void>('/admin/members',{method:'POST',body:JSON.stringify(input)}) }
  changeMemberRole(id:string,role:string) { return this.request<void>(`/admin/members/${id}/role`,{method:'PUT',body:JSON.stringify({role})}) }
  removeMember(id:string) { return this.request<void>(`/admin/members/${id}`,{method:'DELETE'}) }
  getAdminMeetingRooms() { return this.request<AdminMeetingRoom[]>('/admin/meeting-rooms') }
  setMeetingRoomEnabled(id:string,enabled:boolean) { return this.request<void>(`/admin/meeting-rooms/${id}`,{method:'PUT',body:JSON.stringify({enabled})}) }
  getMeetingRoomAvailability(date:string,start:string,end:string) { return this.request<AvailableMeetingRoom[]>(`/meeting-rooms/availability?date=${encodeURIComponent(date)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`) }
  getWeComVoiceSignature(url:string) { return this.request<WeComVoiceSignature>('/voice/wecom/signature',{method:'POST',body:JSON.stringify({url})}) }
  parseVoiceText(scene:string,transcript:string) { return this.request<VoiceAnalysisResult>('/voice/parse-text',{method:'POST',body:JSON.stringify({scene,transcript})}) }
  confirmVoicePersons(input:{recordId:string;confirmationToken:string;selections:Array<{spokenName:string;userId:string}>}) { return this.request<unknown>('/voice/confirm-persons',{method:'POST',body:JSON.stringify(input)}) }
  sendAdminNotificationTest() { return this.request<void>('/admin/notifications/test-message',{method:'POST'}) }
  processNotificationOutbox() { return this.request<{ok:boolean;picked:number;sent:number;failed:number}>('/admin/notifications/process',{method:'POST'}) }
}
