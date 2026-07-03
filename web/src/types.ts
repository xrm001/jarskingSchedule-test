export type BossStatus = 'available' | 'meeting' | 'out' | 'dnd'
export type View = 'today' | 'approvals' | 'calendar' | 'reminders'
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
