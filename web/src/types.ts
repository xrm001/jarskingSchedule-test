export type BossStatus = 'available' | 'meeting' | 'out' | 'dnd'
export type View = 'today' | 'approvals' | 'organization' | 'calendar'
export type Visibility = 'management' | 'occupied' | 'private'
export interface User { id: string; name: string; role: 'BOSS' | 'ADMIN' | 'MANAGEMENT' }
export interface Schedule { id:string; title:string; start:string; end:string; type:'meeting'|'out'|'personal'; location?:string; visibility:Visibility }
export interface Application {
  id:string
  applicant:string
  department:string
  topic:string
  room:string
  start:string
  end:string
  submittedAt:string
  status:'pending'|'approved'|'rejected'
  version:number
}
export interface ApprovalGroup { id:string; start:string; end:string; applications:Application[] }
export interface Reminder { id:string; title:string; detail:string; time:string; read:boolean }
export interface PersonalScheduleInput { title:string; start:string; end:string; type:Schedule['type']; visibility:Visibility }
export interface DirectoryMember { id:string; displayName:string; jobTitle:string|null; department:string|null; wecomBound?:boolean; roles?:User['role'][] }
export interface MeetingRoom { id:string; name:string; floor:number|null; capacity:number|null; equipment:string|null }
export interface AvailableMeetingRoom extends MeetingRoom { available:boolean }
export interface AdminMeetingRoom extends MeetingRoom { enabled:boolean }
export interface StoredRequest { id:string; topic:string; startAt:string; endAt:string; room:string|null; status:'pending'|'approved'|'rejected'|'cancelled'; version:number }
export interface AdminRequest { id:string; applicant:string; topic:string; startAt:string; endAt:string; room:string|null; status:string }
export interface BossScheduleEntry { id:string; sourceType:string; title:string; startAt:string; endAt:string; visibility:string; roomName:string|null }
export interface BossPresence { status:string; label:string; start:string|null; end:string|null; available:boolean }
