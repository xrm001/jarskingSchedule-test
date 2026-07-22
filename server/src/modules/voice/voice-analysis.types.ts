export type VoiceIntent = 'CHANGE_STATUS'|'CREATE_SCHEDULE'|'ORGANIZE_MEETING'|'APPROVE_REQUEST'|'UNKNOWN';

export interface VoiceCorrection {
  from:string;
  to:string;
  reason:string;
}

export interface AiVoiceAnalysis {
  correctedTranscript:string;
  corrections:VoiceCorrection[];
  intent:VoiceIntent;
  spokenNames:string[];
  suspectedNameError:boolean;
  confidence:number;
  ambiguities:string[];
  parsed:Record<string,unknown>;
}

export interface PersonCandidate {
  id:string;
  wecomUserId:string;
  name:string;
  department:string|null;
  jobTitle:string|null;
  roles:string[];
  matchedAlias:string|null;
  score:number;
  matchReason:string;
}
