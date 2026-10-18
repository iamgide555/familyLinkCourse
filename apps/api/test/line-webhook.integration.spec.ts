import { createHmac } from 'node:crypto';
import request from 'supertest';
import { createTestApp, type TestApp } from './test-app.js';
import { startStub, type Stub } from './stubs.js';
import { RichMenus } from '../src/line/rich-menu.service.js';

describe('LINE webhook and rich menus', () => {
  let ctx: TestApp;
  let line: Stub;
  const SECRET = 'webhook-secret';
  const sign = (raw: string, secret = SECRET) => createHmac('sha256', secret).update(raw).digest('base64');
  const post = (payload: object, signature?: string, raw = JSON.stringify(payload)) => {
    const r = request(ctx.app.getHttpServer()).post('/api/line/webhook').set('Content-Type', 'application/json');
    return (signature === undefined ? r : r.set('X-Line-Signature', signature)).send(raw);
  };
  const event = (type: string, userId: string, id = `evt-${Math.random()}`) => ({ events: [{ type, webhookEventId: id, source: { type: 'user', userId } }] });
  const account = (userId: string) => ctx.db.lineAccount.findFirst({ where: { organizationId: ctx.organizationId, lineUserId: userId } });
  beforeAll(async () => {
    line = await startStub();
    ctx = await createTestApp({ line: { channelAccessToken: 'tok', channelSecret: SECRET, loginChannelId: 'c', liffId: 'l', apiBase: line.url, richMenuMemberId: 'menu-member-1', monthlyQuota: null } });
  });
  beforeEach(() => { line.requests.length = 0; line.reply(() => ({ status: 200 })); });
  afterAll(async () => { await line.close(); if (ctx) await ctx.close(); });

  it('ignores anything without a valid signature over the raw body', async () => {
    const body = event('unfollow', 'Uwebhook-a');
    expect((await post(body, undefined)).status).toBe(401);
    expect((await post(body, 'bm90LWEtc2lnbmF0dXJl')).status).toBe(401);
    expect((await post(body, sign(JSON.stringify(body), 'wrong-secret'))).status).toBe(401);
    // A signature for different bytes (extra whitespace) does not validate the altered body.
    expect((await post(body, sign(JSON.stringify(body)), JSON.stringify(body) + ' ')).status).toBe(401);
    expect(await account('Uwebhook-a')).toBeNull();
  });

  it('marks accounts reachable or not on follow and unfollow, and ignores replays', async () => {
    const send = (payload: object) => post(payload, sign(JSON.stringify(payload)));
    const follow = event('follow', 'Uwebhook-b', 'E1');
    expect((await send(follow)).status).toBe(200);
    expect((await account('Uwebhook-b'))!.reachable).toBe(true);
    const unfollow = event('unfollow', 'Uwebhook-b', 'E2');
    expect((await send(unfollow)).status).toBe(200);
    let a = (await account('Uwebhook-b'))!;
    expect([a.reachable, !!a.unfollowedAt]).toEqual([false, true]);
    expect((await send(event('follow', 'Uwebhook-b', 'E3'))).status).toBe(200);
    expect((await account('Uwebhook-b'))!.reachable).toBe(true);
    expect((await send(unfollow)).status).toBe(200);
    a = (await account('Uwebhook-b'))!;
    expect(a.reachable).toBe(true);
    expect((await send({ events: [{ type: 'message', source: { userId: 'Uwebhook-c' } }] })).status).toBe(200);
    expect(await account('Uwebhook-c')).toBeNull();
  });

  it('links the member menu for linked accounts and falls back to the guest menu otherwise', async () => {
    const menus = ctx.app.get(RichMenus);
    const acct = await ctx.db.lineAccount.upsert({ where: { organizationId_lineUserId: { organizationId: ctx.organizationId, lineUserId: 'Umenu-owner' } }, create: { organizationId: ctx.organizationId, lineUserId: 'Umenu-owner', richMenuState: 'member' }, update: { richMenuState: 'member', richMenuSyncedState: 'guest' } });
    expect(await menus.syncPending()).toBeGreaterThanOrEqual(1);
    const link = line.requests.find((r) => r.method === 'POST' && r.url === '/v2/bot/user/Umenu-owner/richmenu/menu-member-1');
    expect(link).toBeTruthy();
    expect(link!.headers.authorization).toBe('Bearer tok');
    expect((await ctx.db.lineAccount.findUniqueOrThrow({ where: { id: acct.id } })).richMenuSyncedState).toBe('member');
    line.requests.length = 0;
    await ctx.db.lineAccount.update({ where: { id: acct.id }, data: { richMenuState: 'guest' } });
    await menus.syncPending();
    expect(line.requests.some((r) => r.method === 'DELETE' && r.url === '/v2/bot/user/Umenu-owner/richmenu')).toBe(true);
    expect((await ctx.db.lineAccount.findUniqueOrThrow({ where: { id: acct.id } })).richMenuSyncedState).toBe('guest');
  });

  it('keeps a failed menu change queued and retries it, without touching the member record', async () => {
    const menus = ctx.app.get(RichMenus);
    const acct = await ctx.db.lineAccount.create({ data: { organizationId: ctx.organizationId, lineUserId: 'Uretry-owner', richMenuState: 'member' } });
    line.reply(() => ({ status: 500 }));
    await menus.syncPending();
    expect((await ctx.db.lineAccount.findUniqueOrThrow({ where: { id: acct.id } })).richMenuSyncedState).toBe('guest');
    line.reply(() => ({ status: 200 }));
    await menus.syncPending();
    expect((await ctx.db.lineAccount.findUniqueOrThrow({ where: { id: acct.id } })).richMenuSyncedState).toBe('member');
  });

  it('reports not found when LINE is not configured', async () => {
    const plain = await createTestApp();
    try {
      const r = await request(plain.app.getHttpServer()).post('/api/line/webhook').send({ events: [] });
      expect(r.status).toBe(404);
    } finally { await plain.close(); }
  });
});
