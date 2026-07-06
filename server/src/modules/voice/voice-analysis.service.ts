import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthenticatedUser } from '../../domain/model';
import { DatabaseService } from '../database/database.service';
import { DeepSeekVoiceService } from './deepseek-voice.service';
import { PersonCandidateService } from './person-candidate.service';

@Injectable()
export class VoiceAnalysisService {
  constructor(
    private readonly database:DatabaseService,
    private readonly deepseek:DeepSeekVoiceService,
    private readonly candidates:PersonCandidateService,
  ) {}

  async parseText(actor:AuthenticatedUser,body:Record<string,unknown>) {
    const transcript=typeof body.transcript==='string'?body.transcript.trim():'';
    const scene=typeof body.scene==='string'?body.scene:'boss_general';
    if(!transcript) throw new BadRequestException({code:'EMPTY_TRANSCRIPT',message:'语音转写文本不能为空'});
    if(transcript.length>2000) throw new BadRequestException({code:'TRANSCRIPT_TOO_LONG',message:'语音转写文本过长'});
    const analysis=await this.deepseek.analyze({transcript,scene,nowIso:new Date().toISOString()});
    const matches=[] as Array<{spokenName:string;candidates:Awaited<ReturnType<PersonCandidateService['find']>>}>;
    for(const spokenName of [...new Set(analysis.spokenNames.map(name=>name.trim()).filter(Boolean))]) {
      matches.push({spokenName,candidates:await this.candidates.find(spokenName)});
    }
    const confirmationToken=randomBytes(32).toString('base64url');
    const confirmationHash=hash(confirmationToken);
    const result=await this.database.query<{id:string}>(
      `INSERT INTO voice_commands
       (user_id,raw_transcript,corrected_transcript,intent,parsed_payload,corrections,suspected_names,candidate_matches,
        visibility_detected,confirmation_status,confirmation_hash,ai_provider,ai_model,expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,'PENDING',$9,'deepseek',$10,now()+interval '10 minutes') RETURNING id`,
      [actor.id,transcript,analysis.correctedTranscript,analysis.intent,JSON.stringify(analysis.parsed),JSON.stringify(analysis.corrections),JSON.stringify(analysis.spokenNames),JSON.stringify(matches),confirmationHash,process.env.DEEPSEEK_MODEL||'deepseek-chat'],
    );
    return {
      recordId:result.rows[0]!.id,rawTranscript:transcript,correctedTranscript:analysis.correctedTranscript,
      corrections:analysis.corrections,intent:analysis.intent,confidence:analysis.confidence,
      ambiguities:analysis.ambiguities,suspectedNameError:analysis.suspectedNameError,
      parsed:analysis.parsed,personMatches:matches,requiresConfirmation:true,confirmationToken,
    };
  }

  async confirmPersons(actor:AuthenticatedUser,body:Record<string,unknown>) {
    const recordId=typeof body.recordId==='string'?body.recordId:'';
    const token=typeof body.confirmationToken==='string'?body.confirmationToken:'';
    const selections=Array.isArray(body.selections)?body.selections as Array<{spokenName?:unknown;userId?:unknown}>:[];
    const result=await this.database.query<{confirmation_hash:string;candidate_matches:unknown;parsed_payload:Record<string,unknown>}>(
      `SELECT confirmation_hash,candidate_matches,parsed_payload FROM voice_commands
       WHERE id=$1 AND user_id=$2 AND confirmation_status='PENDING' AND expires_at>now()`,[recordId,actor.id],
    );
    const record=result.rows[0];
    if(!record) throw new NotFoundException({code:'VOICE_CONFIRMATION_NOT_FOUND',message:'语音确认记录不存在或已过期'});
    if(hash(token)!==record.confirmation_hash) throw new ForbiddenException({code:'VOICE_CONFIRMATION_INVALID',message:'语音确认凭证无效'});
    const matches=record.candidate_matches as Array<{spokenName:string;candidates:Array<{id:string}>}>;
    const selected=[] as Array<{spokenName:string;userId:string}>;
    for(const item of selections){
      if(typeof item.spokenName!=='string'||typeof item.userId!=='string') throw new BadRequestException({code:'PERSON_SELECTION_INVALID',message:'人员选择无效'});
      const group=matches.find(match=>match.spokenName===item.spokenName);
      if(!group?.candidates.some(candidate=>candidate.id===item.userId)) throw new BadRequestException({code:'PERSON_NOT_IN_CANDIDATES',message:'所选人员不在候选范围内'});
      selected.push({spokenName:item.spokenName,userId:item.userId});
    }
    if(matches.length&&selected.length!==matches.length) throw new BadRequestException({code:'PERSON_CONFIRMATION_INCOMPLETE',message:'请确认全部识别到的人员'});
    const payload={...record.parsed_payload,selectedParticipants:selected};
    await this.database.query(
      `UPDATE voice_commands SET parsed_payload=$3,confirmation_status='CONFIRMED',confirmed_at=now()
       WHERE id=$1 AND user_id=$2`,[recordId,actor.id,JSON.stringify(payload)],
    );
    return {recordId,confirmed:true,selectedParticipants:selected,parsed:payload};
  }
}

function hash(value:string):string { return createHash('sha256').update(value).digest('hex'); }
