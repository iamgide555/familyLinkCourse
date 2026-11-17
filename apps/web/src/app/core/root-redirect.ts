/**
 * LINE opens a LIFF link such as liff.line.me/<id>/member/signup at the app root as `/?liff.state=%2Fmember%2Fsignup`,
 * and after LINE login it returns to the root with that same `liff.state` plus the login result (`code`, `state`,
 * `liffClientId`, `liffRedirectUri`, ...). Send it to the member page and KEEP the other parameters: the LIFF SDK on the
 * member page needs them to finish login, and dropping them makes it start a new login forever.
 * Only paths under /member are honoured so the parameter cannot be used as an open redirect. Everything else goes to
 * the staff area, as before.
 */
export function rootRedirect(queryParams: Record<string, unknown>): string {
  const state = queryParams['liff.state'];
  if (typeof state !== 'string' || !/^\/member(\/[^/\\?#][^\\#]*)?(\?[^\\#]*)?$/.test(state) || state.includes('//')) return 'staff';
  const split = state.indexOf('?');
  const path = split < 0 ? state : state.slice(0, split);
  const params = new URLSearchParams(split < 0 ? '' : state.slice(split + 1));
  for (const [key, value] of Object.entries(queryParams)) {
    if (key === 'liff.state') continue;
    for (const v of Array.isArray(value) ? value : [value]) if (typeof v === 'string') params.append(key, v);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}
