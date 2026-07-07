import { BadGatewayException, Injectable } from '@nestjs/common';

interface WeComResponse { errcode:number; errmsg:string }

@Injectable()
export class WeComClientService {
  private accessToken?: { value:string; expiresAt:number };

  authorizationUrl(state: string): string {
    const corpId = this.required('WECOM_CORP_ID');
    const redirectUri = this.required('WECOM_REDIRECT_URI');
    const query = new URLSearchParams({
      appid: corpId, redirect_uri: redirectUri, response_type: 'code',
      scope: 'snsapi_base', state,
    });
    return `https://open.weixin.qq.com/connect/oauth2/authorize?${query}#wechat_redirect`;
  }

  async exchangeCode(code: string): Promise<string> {
    const accessToken = await this.getAppAccessToken();
    const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/user/getuserinfo');
    url.searchParams.set('access_token', accessToken);
    url.searchParams.set('code', code);
    const agentId = process.env.WECOM_AGENT_ID?.trim();
    if (agentId) url.searchParams.set('agentid', agentId);
    const data = await this.getJson<WeComResponse & { UserId?:string }>(url);
    if (!data.UserId) throw new BadGatewayException({ code:'WECOM_USER_NOT_MEMBER', message:'未获取到企业成员 UserID' });
    return data.UserId;
  }

  async getAppAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/gettoken');
    url.searchParams.set('corpid', this.required('WECOM_CORP_ID'));
    url.searchParams.set('corpsecret', this.required('WECOM_APP_SECRET'));
    const data = await this.getJson<WeComResponse & { access_token?:string; expires_in?:number }>(url);
    if (!data.access_token) throw new BadGatewayException({ code:'WECOM_TOKEN_FAILED', message:'企业微信访问令牌获取失败' });
    this.accessToken = { value:data.access_token, expiresAt:Date.now() + (data.expires_in ?? 7200) * 1000 };
    return data.access_token;
  }

  async sendTextMessage(toUser: string | readonly string[], content: string): Promise<void> {
    const users = Array.isArray(toUser) ? toUser : [toUser];
    const safeUsers = users.map(user => user.trim()).filter(Boolean);
    if (!safeUsers.length) throw new Error('No WeCom recipient configured');
    const accessToken = await this.getAppAccessToken();
    const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/message/send');
    url.searchParams.set('access_token', accessToken);
    const response = await fetch(url, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify({
        touser:safeUsers.join('|'),
        msgtype:'text',
        agentid:Number(this.required('WECOM_AGENT_ID')),
        text:{ content },
        safe:0,
        enable_id_trans:0,
        enable_duplicate_check:1,
        duplicate_check_interval:1800,
      }),
      signal:AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new BadGatewayException({ code:'WECOM_HTTP_ERROR', message:'企业微信消息接口暂时不可用' });
    const data = await response.json() as WeComResponse & { invaliduser?:string };
    if (data.errcode !== 0) {
      console.error('[wecom] message send error', { errcode:data.errcode, errmsg:data.errmsg, invaliduser:data.invaliduser });
      throw new BadGatewayException({ code:'WECOM_MESSAGE_SEND_FAILED', message:`企业微信消息发送失败：${data.errcode}` });
    }
  }

  private async getJson<T extends WeComResponse>(url: URL): Promise<T> {
    const response = await fetch(url, { signal:AbortSignal.timeout(8000) });
    if (!response.ok) throw new BadGatewayException({ code:'WECOM_HTTP_ERROR', message:'企业微信接口暂时不可用' });
    const data = await response.json() as T;
    if (data.errcode !== 0) {
      console.error('[wecom] api error', { endpoint:url.pathname, errcode:data.errcode, errmsg:data.errmsg });
      throw new BadGatewayException({ code:'WECOM_API_ERROR', message:`企业微信接口错误：${data.errcode}` });
    }
    return data;
  }

  private required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is not configured`);
    return value;
  }
}
