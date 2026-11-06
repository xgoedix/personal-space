import { describe, expect, it } from 'vitest';
import { encodeStorage } from '../src/operations/checkpoint';
import { client, inAgent, loggedIn } from './helpers';

describe('release operations', () => {
  it('administrative RPC methods are not exposed by the public HTTP API', async () => {
    const anonymous = client();
    expect((await anonymous.call('/api/bichoReleaseVerificationSession', { method: 'POST' })).status).toBe(401);
    const owner = await loggedIn();
    expect((await owner.call('/api/bichoReleaseVerificationSession', { method: 'POST' })).status).toBe(404);
    expect((await owner.call('/api/bichoReleaseRestore', { method: 'POST', body: { bookmark: 'invalid' } })).status).toBe(404);
  });
  it('operator sessions expire after five minutes and preserve existing sessions', async () => {
    const before = await inAgent(agent => agent.services.db.all<{ id: string }>('SELECT id FROM tal_sessions'));
    const token = await inAgent(agent => agent.bichoReleaseVerificationSession());
    await inAgent(async agent => {
      const id = await agent.services.auth.validate(token);
      expect(id).toBeTruthy();
      const rows = agent.services.db.all<{ id: string; expires_at: string }>('SELECT id,expires_at FROM tal_sessions');
      for (const session of before) expect(rows.some(row => row.id === session.id)).toBe(true);
      const remaining = Date.parse(rows.find(row => row.id === id)!.expires_at) - Date.now();
      expect(remaining).toBeGreaterThan(290_000);
      expect(remaining).toBeLessThanOrEqual(300_000);
      agent.services.auth.revoke(id!);
      expect(await agent.services.auth.validate(token)).toBeNull();
    });
  });
  it('backup encoding preserves non-JSON KV types rather than silently losing them', () => {
    expect(encodeStorage(new Map([['n', 1n]]))).toEqual({ type: 'map', value: [['n', { type: 'bigint', value: '1' }]] });
    expect(encodeStorage(new Uint8Array([1, 2]))).toEqual({ type: 'Uint8Array', value: [1, 2] });
    expect(encodeStorage(undefined)).toEqual({ type: 'undefined' });
    expect(() => encodeStorage(() => {})).toThrow('Unsupported');
  });
});
