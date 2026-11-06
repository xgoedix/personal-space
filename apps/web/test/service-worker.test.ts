import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
function worker(status: number) {
  const events = new Map<string, (event: unknown) => void>();
  const requests: { url: string; body: string }[] = [];
  const self = { addEventListener: (name: string, handler: (event: unknown) => void) => events.set(name, handler) };
  runInNewContext(source, { self, fetch: async (url: string, init: { body: string }) => { requests.push({ url, body: init.body }); return { ok: status === 200 }; } });
  return { events, requests };
}
describe('push preservation during worker updates', () => {
  it('does not cache private responses or intercept navigation', () => {
    expect(worker(200).events.has('fetch')).toBe(false);
  });
  it.each([200, 401, 503])('renews atomically without first deleting the old endpoint (HTTP %s)', async status => {
    const w = worker(status);
    let pending: Promise<unknown> = Promise.resolve();
    w.events.get('pushsubscriptionchange')!({ oldSubscription: { endpoint: 'old', options: { applicationServerKey: 'same-key' } }, newSubscription: { toJSON: () => ({ endpoint: 'new', keys: {} }) }, waitUntil: (promise: Promise<unknown>) => { pending = promise; } });
    if (status !== 200) await expect(pending).rejects.toThrow('No se pudo renovar');
    else await pending;
    expect(w.requests).toHaveLength(1);
    expect(w.requests[0]!.url).toBe('/api/push/subscriptions');
    expect(JSON.parse(w.requests[0]!.body).replace_endpoint).toBe('old');
  });
});
