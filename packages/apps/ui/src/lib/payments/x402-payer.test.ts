import { describe, expect, it } from 'vitest';
import type { EthereumProvider } from '$lib/privy/client.js';
import { parseExactChallengeOption, signX402PaymentTypedData } from './x402-payer.js';

const PAYER = '0xE2E0000000000000000000000000000000000001';
const NOW = 1785200000;

/** A canopy-shaped challenge (buildPaymentRequiredHeader output). */
function challengeB64(overrides?: Record<string, unknown>): string {
	const requirements = {
		x402Version: 2,
		accepts: [
			{
				scheme: 'exact',
				network: 'eip155:84532',
				amount: '1000000',
				asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
				payTo: '0x' + 'aa'.repeat(20),
				maxTimeoutSeconds: 300,
				extra: { name: 'USDC', version: '2' },
				...overrides
			}
		],
		resource: { url: 'https://api.example/credits', description: 'x', mimeType: 'application/json' }
	};
	return btoa(JSON.stringify(requirements));
}

function capturingProvider(capture: { method?: string; params?: unknown[] }): EthereumProvider {
	return {
		async request({ method, params }) {
			capture.method = method;
			capture.params = params;
			return `0x${'ab'.repeat(65)}`;
		}
	};
}

describe('parseExactChallengeOption', () => {
	it('picks the exact option and requires the EIP-712 domain extras', () => {
		expect(parseExactChallengeOption(challengeB64()).amount).toBe('1000000');
		expect(() => parseExactChallengeOption(challengeB64({ scheme: 'deferred' }))).toThrow(
			/no 'exact' scheme/
		);
		expect(() => parseExactChallengeOption(challengeB64({ extra: {} }))).toThrow(
			/domain name\/version/
		);
	});
});

describe('signX402PaymentTypedData', () => {
	it('signs USDC TransferWithAuthorization via eth_signTypedData_v4 and emits the CLI-shaped payload', async () => {
		const capture: { method?: string; params?: unknown[] } = {};
		const headerB64 = await signX402PaymentTypedData(
			challengeB64(),
			capturingProvider(capture),
			PAYER,
			{ amountAtomic: '1000000', chainId: 84532 },
			NOW
		);

		expect(capture.method).toBe('eth_signTypedData_v4');
		expect(capture.params?.[0]).toBe(PAYER);
		const typed = JSON.parse(String(capture.params?.[1])) as {
			domain: Record<string, unknown>;
			primaryType: string;
			message: Record<string, string>;
		};
		expect(typed.primaryType).toBe('TransferWithAuthorization');
		expect(typed.domain).toEqual({
			name: 'USDC',
			version: '2',
			chainId: 84532,
			verifyingContract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
		});
		expect(typed.message.from).toBe(PAYER);
		expect(typed.message.value).toBe('1000000');
		expect(typed.message.validAfter).toBe(String(NOW - 600));
		expect(typed.message.validBefore).toBe(String(NOW + 300));
		expect(typed.message.nonce).toMatch(/^0x[0-9a-f]{64}$/);

		// The X-PAYMENT value decodes to what canopy's parsePaymentHeader expects.
		const payload = JSON.parse(atob(headerB64)) as {
			x402Version: number;
			payload: { authorization: Record<string, string>; signature: string };
			accepted: Record<string, unknown>;
		};
		expect(payload.x402Version).toBe(2);
		expect(payload.payload.signature).toBe(`0x${'ab'.repeat(65)}`);
		expect(payload.payload.authorization).toMatchObject({
			from: PAYER,
			value: '1000000',
			nonce: typed.message.nonce
		});
		expect(payload.accepted).toMatchObject({ scheme: 'exact', network: 'eip155:84532' });
	});

	it('refuses to sign when the challenge amount disagrees with the quote (plan-2607-02 R1)', async () => {
		const capture: { method?: string } = {};
		await expect(
			signX402PaymentTypedData(
				challengeB64(),
				capturingProvider(capture),
				PAYER,
				{ amountAtomic: '999999', chainId: 84532 },
				NOW
			)
		).rejects.toThrow(/does not match the quoted/);
		expect(capture.method).toBeUndefined();
	});

	it('refuses to sign a challenge for the wrong chain (plan-2607-02 R1)', async () => {
		const capture: { method?: string } = {};
		await expect(
			signX402PaymentTypedData(
				challengeB64({ network: 'eip155:1' }),
				capturingProvider(capture),
				PAYER,
				{ amountAtomic: '1000000', chainId: 84532 },
				NOW
			)
		).rejects.toThrow(/expected eip155:84532/);
		expect(capture.method).toBeUndefined();
	});

	it('rejects a wallet response that is not hex', async () => {
		const badProvider: EthereumProvider = {
			async request() {
				return 'nope';
			}
		};
		await expect(
			signX402PaymentTypedData(
				challengeB64(),
				badProvider,
				PAYER,
				{ amountAtomic: '1000000', chainId: 84532 },
				NOW
			)
		).rejects.toThrow(/invalid typed-data signature/);
	});
});
