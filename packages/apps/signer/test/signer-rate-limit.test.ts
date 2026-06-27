import { describe, expect, it } from 'vitest';
import { checkSignerRateLimit } from '../src/signer-rate-limit.js';

describe('checkSignerRateLimit', () => {
	it('returns null when binding is absent', async () => {
		const result = await checkSignerRateLimit('key-a', {});
		expect(result).toBeNull();
	});

	it('returns null when limit succeeds', async () => {
		const result = await checkSignerRateLimit('key-a', {
			SIGNER_RATE_LIMITER: {
				limit: async () => ({ success: true })
			}
		});
		expect(result).toBeNull();
	});

	it('returns 429 JSON when limit fails', async () => {
		const result = await checkSignerRateLimit('key-a', {
			SIGNER_RATE_LIMITER: {
				limit: async ({ key }) => {
					expect(key).toBe('key-a');
					return { success: false };
				}
			}
		});
		expect(result?.status).toBe(429);
		const body = (await result?.json()) as { ok: boolean; error: string };
		expect(body).toEqual({ ok: false, error: 'rate limit exceeded' });
	});
});
