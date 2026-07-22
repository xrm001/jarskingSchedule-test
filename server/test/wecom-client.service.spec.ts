import { afterEach, describe, expect, it } from 'vitest';
import { WeComClientService } from '../src/modules/auth/wecom-client.service';

describe('WeComClientService', () => {
  afterEach(() => {
    delete process.env.WECOM_CORP_ID;
    delete process.env.WECOM_REDIRECT_URI;
  });

  it('builds an snsapi_base authorization URL with the one-time state', () => {
    process.env.WECOM_CORP_ID = 'ww-test';
    process.env.WECOM_REDIRECT_URI = 'https://schedule-test.jarsking.cn/api/v1/auth/wecom/callback';
    const url = new WeComClientService().authorizationUrl('state-value');
    expect(url).toContain('appid=ww-test');
    expect(url).toContain('scope=snsapi_base');
    expect(url).toContain('state=state-value');
  });
});
