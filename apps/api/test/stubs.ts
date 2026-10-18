import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export type Recorded = { method: string; url: string; headers: IncomingMessage['headers']; body: string; json: unknown };
export type Reply = { status: number; body?: unknown; headers?: Record<string, string> };
export type Stub = { url: string; requests: Recorded[]; reply: (fn: (req: Recorded, n: number) => Reply | Promise<Reply>) => void; close(): Promise<void> };

/** A local HTTP server standing in for LINE or the email provider; nothing leaves the machine. */
type Handler = (req: Recorded, n: number) => Reply | Promise<Reply>;
export async function startStub(initial: Handler = () => ({ status: 200, body: {} })): Promise<Stub> {
  let handler: Handler = initial;
  const requests: Recorded[] = [];
  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', async () => {
      const body = Buffer.concat(chunks).toString('utf8');
      let json: unknown = null;
      try { json = JSON.parse(body); } catch { /* form bodies are not JSON */ }
      const recorded: Recorded = { method: req.method ?? '', url: req.url ?? '', headers: req.headers, body, json };
      requests.push(recorded);
      const reply = await handler(recorded, requests.length);
      res.writeHead(reply.status, { 'Content-Type': 'application/json', ...(reply.headers ?? {}) });
      res.end(JSON.stringify(reply.body ?? {}));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    requests,
    reply: (fn) => { handler = fn; },
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
