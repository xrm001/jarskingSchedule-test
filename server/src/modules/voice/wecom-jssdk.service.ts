import { BadRequestException, BadGatewayException, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { WeComClientService } from '../auth/wecom-client.service';

interface Ticket {value:string;expiresAt:number}

@Injectable()
export class WeComJsSdkService {
  private corpTicket?:Ticket;
  private agentTicket?:Ticket;
  constructor(private readonly wecom:WeComClientService) {}

  async signature(rawUrl:string) {
    const url=this.validateUrl(rawUrl);
    const [corpTicket,agentTicket]=await Promise.all([this.ticket('corp'),this.ticket('agent')]);
    const timestamp=Math.floor(Date.now()/1000);
    const nonceStr=randomBytes(16).toString('hex');
    return {
      corpId:this.required('WECOM_CORP_ID'),agentId:this.required('WECOM_AGENT_ID'),timestamp,nonceStr,
      signature:sign(corpTicket,nonceStr,timestamp,url),
      agentSignature:sign(agentTicket,nonceStr,timestamp,url),
      jsApiList:['startRecord','stopRecord','onVoiceRecordEnd','translateVoice','uploadVoice'],
    };
  }

  private async ticket(type:'corp'|'agent'):Promise<string> {
    const cached=type==='corp'?this.corpTicket:this.agentTicket;
    if(cached&&cached.expiresAt>Date.now()+300_000) return cached.value;
    const token=await this.wecom.getAppAccessToken();
    const url=new URL(type==='corp'?'https://qyapi.weixin.qq.com/cgi-bin/get_jsapi_ticket':'https://qyapi.weixin.qq.com/cgi-bin/ticket/get');
    url.searchParams.set('access_token',token);
    if(type==='agent') url.searchParams.set('type','agent_config');
    const response=await fetch(url,{signal:AbortSignal.timeout(8000)});
    const data=await response.json() as {errcode:number;errmsg:string;ticket?:string;expires_in?:number};
    if(!response.ok||data.errcode!==0||!data.ticket) throw new BadGatewayException({code:'WECOM_TICKET_FAILED',message:`企微录音鉴权失败：${data.errcode}`});
    const value={value:data.ticket,expiresAt:Date.now()+(data.expires_in||7200)*1000};
    if(type==='corp') this.corpTicket=value; else this.agentTicket=value;
    return value.value;
  }

  private validateUrl(rawUrl:string):string {
    let parsed:URL;
    try { parsed=new URL(rawUrl); } catch { throw new BadRequestException({code:'INVALID_JSSDK_URL',message:'页面地址无效'}); }
    parsed.hash='';
    const base=new URL(this.required('APP_BASE_URL'));
    if(parsed.origin!==base.origin) throw new BadRequestException({code:'JSSDK_ORIGIN_FORBIDDEN',message:'页面域名不在允许范围内'});
    return parsed.toString();
  }
  private required(name:string):string {const value=process.env[name]?.trim();if(!value) throw new Error(`${name} is not configured`);return value;}
}

function sign(ticket:string,nonceStr:string,timestamp:number,url:string):string {
  return createHash('sha1').update(`jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`).digest('hex');
}
