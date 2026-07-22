import { Injectable } from '@nestjs/common';
import { pinyin } from 'pinyin-pro';
import { DatabaseService } from '../database/database.service';
import type { PersonCandidate } from './voice-analysis.types';

interface DirectoryRow {
  id:string; wecom_user_id:string; display_name:string; department:string|null; job_title:string|null;
  roles:string[]; aliases:Array<{alias:string;priority:number}>;
}

@Injectable()
export class PersonCandidateService {
  constructor(private readonly database:DatabaseService) {}

  async find(spokenName:string,limit=5):Promise<PersonCandidate[]> {
    const spoken=normalize(spokenName);
    if(!spoken) return [];
    const result=await this.database.query<DirectoryRow>(
      `SELECT u.id,u.wecom_user_id,u.display_name,u.department,u.job_title,
              array_agg(DISTINCT ur.role)::text[] roles,
              COALESCE(jsonb_agg(DISTINCT jsonb_build_object('alias',a.alias,'priority',a.priority)) FILTER (WHERE a.id IS NOT NULL),'[]'::jsonb) aliases
       FROM app_users u JOIN user_roles ur ON ur.user_id=u.id
       LEFT JOIN user_aliases a ON a.user_id=u.id AND a.enabled
       WHERE u.status='ACTIVE' AND u.removed_at IS NULL AND u.wecom_user_id IS NOT NULL
       GROUP BY u.id,u.wecom_user_id,u.display_name,u.department,u.job_title`,
    );
    return result.rows.map(row=>scoreRow(row,spokenName,spoken)).filter(item=>item.score>0)
      .sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name,'zh-CN')).slice(0,limit);
  }
}

function scoreRow(row:DirectoryRow,raw:string,spoken:string):PersonCandidate {
  const name=normalize(row.display_name);
  let score=0,reason='无匹配',matchedAlias:string|null=null;
  if(name===spoken){score=200;reason='姓名完全匹配';}
  for(const entry of row.aliases||[]){
    const alias=normalize(entry.alias);
    if(alias===spoken&&180+Math.min(entry.priority||0,40)>score){score=180+Math.min(entry.priority||0,40);reason='老板常用昵称完全匹配';matchedAlias=entry.alias;}
  }
  if(score<180&&spoken.length>=2&&(name.includes(spoken)||spoken.includes(name))){score=Math.max(score,120);reason='姓名文字包含匹配';}
  for(const entry of row.aliases||[]){
    const alias=normalize(entry.alias);
    if(score<180&&spoken.length>=2&&alias.length>=2&&(alias.includes(spoken)||spoken.includes(alias))){score=Math.max(score,125);reason='昵称文字包含匹配';matchedAlias=entry.alias;}
  }
  if(spoken.length>=2){
    const targets=[{text:row.display_name,alias:null as string|null},...(row.aliases||[]).filter(a=>normalize(a.alias).length>=2).map(a=>({text:a.alias,alias:a.alias}))];
    for(const target of targets){
      const similarity=phoneticSimilarity(raw,target.text);
      const phoneticScore=Math.round(similarity*100);
      if(phoneticScore>score&&similarity>=0.42){score=phoneticScore;reason='拼音或近音匹配';matchedAlias=target.alias;}
    }
  }
  return {id:row.id,wecomUserId:row.wecom_user_id,name:row.display_name,department:row.department,jobTitle:row.job_title,roles:row.roles,matchedAlias,score,matchReason:reason};
}

function normalize(value:string):string { return value.toLowerCase().replace(/[\s，,。！？!?、（）()“”"']/g,'').replace(/(姐|哥|总|主管|经理)$/,'$1'); }
function phonetic(value:string):string {
  const syllables=pinyin(value,{toneType:'none',type:'array',nonZh:'consecutive'}).map(item=>item.toLowerCase().replace(/ü/g,'v'));
  return syllables.map(s=>s.replace(/zh/g,'z').replace(/ch/g,'c').replace(/sh/g,'s').replace(/ing$/,'in').replace(/eng$/,'en').replace(/ang$/,'an')).join('');
}
function phoneticSimilarity(a:string,b:string):number {
  const left=phonetic(a),right=phonetic(b);
  if(!left||!right) return 0;
  const distance=levenshtein(left,right);
  return 1-distance/Math.max(left.length,right.length);
}
function levenshtein(a:string,b:string):number {
  const previous=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    let diagonal=previous[0]!; previous[0]=i;
    for(let j=1;j<=b.length;j++){
      const above=previous[j]!;
      previous[j]=Math.min(previous[j]!+1,previous[j-1]!+1,diagonal+(a[i-1]===b[j-1]?0:1));
      diagonal=above;
    }
  }
  return previous[b.length]!;
}
