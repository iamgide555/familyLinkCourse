/**
 * LINE opens a LIFF link such as liff.line.me/<id>/member/signup at the app root as `/?liff.state=%2Fmember%2Fsignup`.
 * Send it to that member page; only paths under /member are honoured so the parameter cannot be used as an open
 * redirect. Everything else goes to the staff area, as before.
 */
export function rootRedirect(queryParams: Record<string, unknown>): string {
  const state = queryParams['liff.state'];
  if (typeof state === 'string' && /^\/member(\/[^/\\?#][^\\#]*)?(\?[^\\#]*)?$/.test(state) && !state.includes('//')) return state;
  return 'staff';
}
