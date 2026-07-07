export type BossStatus = 'available' | 'meeting' | 'out' | 'dnd'
export type View = 'today' | 'approvals' | 'organization' | 'calendar'
export type Visibility = 'management' | 'occupied' | 'private'
export interface User {
  id: string
  name: string
  role: 'BOSS' | 'ADMIN' | 'MANAGEMENT'
  roles?: Array<'BOSS' | 'ADMIN' | 'MANAGEMENT'>
  isTestRole?: boolean
  testRole?: 'BOSS' | 'ADMIN' | 'MANAGEMENT' | null
  canTestRoles?: boolean
  realUser?: { id:string; name?:string; role?:string } | null
}
export interface Schedule { id:string; title:string; start:string; end:string; type:'meeting'|'out'|'personal'; location?:string; visibility:Visibility; participants?:string[]; content?:string }
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
export interface BossScheduleEntry { id:string; sourceType:string; title:string; startAt:string; endAt:string; visibility:string; roomName:string|null; participantNames?:string[]; meetingContent?:string|null }
export interface BossPresence { status:string; label:string; start:string|null; end:string|null; available:boolean }
export interface VoicePersonCandidate { id:string;wecomUserId:string;name:string;department:string|null;jobTitle:string|null;roles:string[];matchedAlias:string|null;score:number;matchReason:string }
export interface VoiceRoomCandidate { id:string;name:string;score:number;reason:string }
export interface VoiceAnalysisResult {
  recordId:string;rawTranscript:string;correctedTranscript:string;corrections:Array<{from:string;to:string;reason:string}>;
  intent:'CHANGE_STATUS'|'CREATE_SCHEDULE'|'ORGANIZE_MEETING'|'APPROVE_REQUEST'|'UNKNOWN';confidence:number;
  ambiguities:string[];suspectedNameError:boolean;parsed:Record<string,unknown>;requiresConfirmation:true;confirmationToken:string;
  personMatches:Array<{spokenName:string;candidates:VoicePersonCandidate[]}>;
  roomMatches?:VoiceRoomCandidate[];
}
export interface WeComVoiceSignature {corpId:string;agentId:string;timestamp:number;nonceStr:string;signature:string;agentSignature:string;jsApiList:string[]}
