import { describe, expect, it, vi } from 'vitest';
import type { DatabaseService } from '../src/modules/database/database.service';
import { PersonCandidateService } from '../src/modules/voice/person-candidate.service';

const rows=[
  {id:'mao',wecom_user_id:'jason_m',display_name:'毛星然',department:'市场运营部',job_title:'AI运维师',roles:['ADMIN'],aliases:[{alias:'星然',priority:220}]},
  {id:'feng',wecom_user_id:'feng',display_name:'冯承皇',department:'计划物控部',job_title:'PMC主管',roles:['MANAGEMENT'],aliases:[{alias:'冯姐',priority:220}]},
  {id:'wang',wecom_user_id:'wang',display_name:'王江',department:'人力资源部',job_title:'总监',roles:['MANAGEMENT'],aliases:[]},
];

describe('PersonCandidateService',()=>{
  const service=()=>new PersonCandidateService({query:vi.fn().mockResolvedValue({rows,rowCount:rows.length})} as unknown as DatabaseService);

  it('prioritizes an exact boss nickname',async()=>{
    const result=await service().find('冯姐');
    expect(result[0]).toMatchObject({id:'feng',matchedAlias:'冯姐',matchReason:'老板常用昵称完全匹配'});
  });

  it('keeps 星然 as a confirmable phonetic candidate for 新娘',async()=>{
    const result=await service().find('新娘');
    expect(result.some(item=>item.id==='mao')).toBe(true);
    expect(result.find(item=>item.id==='mao')?.matchReason).toBe('拼音或近音匹配');
  });

  it('does not fuzzy-match a one-character nickname',async()=>{
    const result=await service().find('桃');
    expect(result).toEqual([]);
  });
});
