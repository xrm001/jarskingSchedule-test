import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeepSeekVoiceService } from '../src/modules/voice/deepseek-voice.service';

describe('DeepSeekVoiceService',()=>{
  afterEach(()=>{vi.unstubAllGlobals();delete process.env.DEEPSEEK_API_KEY;});

  it('requests strict JSON correction without sending the directory',async()=>{
    process.env.DEEPSEEK_API_KEY='test-key';
    const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({
      correctedTranscript:'叫星然来开会',corrections:[{from:'新娘',to:'星然',reason:'疑似人名同音'}],intent:'ORGANIZE_MEETING',spokenNames:['星然'],suspectedNameError:true,confidence:.8,ambiguities:['人员需确认'],parsed:{},
    })}}]})});
    vi.stubGlobal('fetch',fetchMock);
    const result=await new DeepSeekVoiceService().analyze({transcript:'叫新娘来开会',scene:'boss_invite',nowIso:'2026-07-06T12:00:00Z'});
    expect(result.spokenNames).toEqual(['星然']);
    const request=JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(request.response_format).toEqual({type:'json_object'});
    expect(JSON.stringify(request)).not.toContain('毛星然');
  });
});
