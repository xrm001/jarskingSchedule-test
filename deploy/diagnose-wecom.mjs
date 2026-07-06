const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/gettoken');
url.searchParams.set('corpid', process.env.WECOM_CORP_ID ?? '');
url.searchParams.set('corpsecret', process.env.WECOM_APP_SECRET ?? '');
const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
const data = await response.json();
console.log(JSON.stringify({
  httpStatus: response.status,
  errcode: data.errcode,
  errmsg: data.errmsg,
  hasToken: Boolean(data.access_token),
}));
