import { BadGatewayException, ConflictException, Injectable } from '@nestjs/common';

interface WeComResponse {
  errcode:number;
  errmsg:string;
}

interface BookingSchedule {
  meeting_id?:string;
  schedule_id?:string;
  start_time:number;
  end_time:number;
  booker?:string;
}

export interface WeComRoomBooking {
  meetingId:string;
  scheduleId:string;
}

export interface WeComBookRoomInput {
  meetingroomId:number;
  subject:string;
  startAt:Date;
  endAt:Date;
  booker?:string;
  attendees?:readonly string[];
}

@Injectable()
export class WeComMeetingRoomService {
  private accessToken?: { value:string; expiresAt:number };

  isConfigured(): boolean {
    return Boolean(process.env.WECOM_CORP_ID?.trim() && process.env.WECOM_MEETING_ROOM_SECRET?.trim());
  }

  async isAvailable(meetingroomId:number | null | undefined, startAt:Date, endAt:Date, ignoreMeetingId?:string | null): Promise<boolean> {
    if (!meetingroomId || !this.isConfigured()) return true;
    const range = this.normalizeBookingRange(startAt, endAt);
    const schedules = await this.getBookingSchedules(meetingroomId, range.startAt, range.endAt);
    return !schedules.some((schedule) => {
      if (ignoreMeetingId && schedule.meeting_id === ignoreMeetingId) return false;
      return this.overlaps(range.startAt, range.endAt, new Date(schedule.start_time * 1000), new Date(schedule.end_time * 1000));
    });
  }

  async assertAvailable(meetingroomId:number | null | undefined, startAt:Date, endAt:Date, ignoreMeetingId?:string | null): Promise<void> {
    if (!meetingroomId || !this.isConfigured()) return;
    if (!(await this.isAvailable(meetingroomId, startAt, endAt, ignoreMeetingId))) {
      throw new ConflictException({ code:'WECOM_ROOM_CONFLICT', message:'企微会议室该时段已被其他预约占用' });
    }
  }

  async bookRoom(input:WeComBookRoomInput): Promise<WeComRoomBooking | null> {
    if (!input.meetingroomId || !this.isConfigured()) return null;
    const range = this.normalizeBookingRange(input.startAt, input.endAt);
    await this.assertAvailable(input.meetingroomId, range.startAt, range.endAt);
    const accessToken = await this.getMeetingRoomAccessToken();
    const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/oa/meetingroom/book');
    url.searchParams.set('access_token', accessToken);
    const booker = input.booker?.trim() || process.env.BOSS_WECOM_USER_ID?.trim();
    const body = {
      meetingroom_id:input.meetingroomId,
      subject:input.subject || '会议',
      start_time:this.toUnixSeconds(range.startAt),
      end_time:this.toUnixSeconds(range.endAt),
      ...(booker ? { booker } : {}),
      attendees:[...(input.attendees ?? [])].map((item) => item.trim()).filter(Boolean),
    };
    const data = await this.postJson<WeComResponse & { meeting_id?:string; schedule_id?:string }>(url, body, 'WECOM_ROOM_BOOK_FAILED');
    if (!data.meeting_id || !data.schedule_id) {
      throw new BadGatewayException({ code:'WECOM_ROOM_BOOK_FAILED', message:'企微会议室预订成功但未返回会议ID' });
    }
    return { meetingId:data.meeting_id, scheduleId:data.schedule_id };
  }

  async cancelBooking(meetingId:string | null | undefined): Promise<void> {
    if (!meetingId || !this.isConfigured()) return;
    const accessToken = await this.getMeetingRoomAccessToken();
    const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/oa/meetingroom/cancel_book');
    url.searchParams.set('access_token', accessToken);
    await this.postJson<WeComResponse>(url, { meeting_id:meetingId, keep_schedule:1 }, 'WECOM_ROOM_CANCEL_FAILED');
  }

  private async getBookingSchedules(meetingroomId:number, startAt:Date, endAt:Date): Promise<BookingSchedule[]> {
    const accessToken = await this.getMeetingRoomAccessToken();
    const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/oa/meetingroom/get_booking_info');
    url.searchParams.set('access_token', accessToken);
    const data = await this.postJson<WeComResponse & { booking_list?:Array<{ meetingroom_id:number; schedule?:BookingSchedule[] }> }>(
      url,
      { meetingroom_id:meetingroomId, start_time:this.toUnixSeconds(startAt), end_time:this.toUnixSeconds(endAt) },
      'WECOM_ROOM_QUERY_FAILED',
    );
    return data.booking_list?.flatMap((item) => item.schedule ?? []) ?? [];
  }

  private async getMeetingRoomAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now() + 60_000) return this.accessToken.value;
    const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/gettoken');
    url.searchParams.set('corpid', this.required('WECOM_CORP_ID'));
    url.searchParams.set('corpsecret', this.required('WECOM_MEETING_ROOM_SECRET'));
    const data = await this.getJson<WeComResponse & { access_token?:string; expires_in?:number }>(url, 'WECOM_ROOM_TOKEN_FAILED');
    if (!data.access_token) throw new BadGatewayException({ code:'WECOM_ROOM_TOKEN_FAILED', message:'企微会议室访问令牌获取失败' });
    this.accessToken = { value:data.access_token, expiresAt:Date.now() + (data.expires_in ?? 7200) * 1000 };
    return data.access_token;
  }

  private async getJson<T extends WeComResponse>(url:URL, code:string): Promise<T> {
    const response = await fetch(url, { signal:AbortSignal.timeout(8000) });
    if (!response.ok) throw new BadGatewayException({ code, message:'企微会议室接口暂时不可用' });
    const data = await response.json() as T;
    this.assertOk(data, code);
    return data;
  }

  private async postJson<T extends WeComResponse>(url:URL, body:unknown, code:string): Promise<T> {
    const response = await fetch(url, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body:JSON.stringify(body),
      signal:AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new BadGatewayException({ code, message:'企微会议室接口暂时不可用' });
    const data = await response.json() as T;
    this.assertOk(data, code);
    return data;
  }

  private assertOk(data:WeComResponse, code:string): void {
    if (data.errcode === 0) return;
    console.error('[wecom-meeting-room] api error', { code, errcode:data.errcode, errmsg:data.errmsg });
    if (code === 'WECOM_ROOM_BOOK_FAILED') {
      throw new ConflictException({ code, message:`企微会议室预订失败：${data.errcode} ${data.errmsg || ''}`.trim() });
    }
    throw new BadGatewayException({ code, message:`企微会议室接口错误：${data.errcode}` });
  }

  private required(name:string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is not configured`);
    return value;
  }

  private toUnixSeconds(value:Date): number {
    return Math.floor(value.getTime() / 1000);
  }

  private normalizeBookingRange(startAt:Date, endAt:Date): { startAt:Date; endAt:Date } {
    const step = 30 * 60_000;
    const start = new Date(Math.floor(startAt.getTime() / step) * step);
    let end = new Date(Math.ceil(endAt.getTime() / step) * step);
    if (end.getTime() - start.getTime() < step) end = new Date(start.getTime() + step);
    return { startAt:start, endAt:end };
  }

  private overlaps(aStart:Date, aEnd:Date, bStart:Date, bEnd:Date): boolean {
    return aStart < bEnd && bStart < aEnd;
  }
}
