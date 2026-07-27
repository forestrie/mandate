import { describe, expect, it } from 'vitest';
import {
	isUnivocityInstanceId,
	parseUnivocityInstanceId,
	univocityInstanceIdFromChainBinding,
	UnivocityInstanceIdError
} from '../src/univocity-instance-id.js';

describe('univocityInstanceId (canopy-mirrored semantics)', () => {
	it('constructs canonical CAIP-10 from a chain binding, normalising case and prefix', () => {
		expect(
			univocityInstanceIdFromChainBinding({
				chainId: '84532',
				univocityAddr: '0x9D56CBCE6F142Bf3C52358C52a643D5c6d2A7bDE'
			})
		).toBe('eip155:84532:0x9d56cbce6f142bf3c52358c52a643d5c6d2a7bde');
		expect(
			univocityInstanceIdFromChainBinding({ chainId: '84532', univocityAddr: 'ab'.repeat(20) })
		).toBe(`eip155:84532:0x${'ab'.repeat(20)}`);
	});

	it('rejects malformed bindings', () => {
		expect(() =>
			univocityInstanceIdFromChainBinding({ chainId: '0x14a34', univocityAddr: 'ab'.repeat(20) })
		).toThrow(UnivocityInstanceIdError);
		expect(() =>
			univocityInstanceIdFromChainBinding({ chainId: '84532', univocityAddr: 'nothex' })
		).toThrow(UnivocityInstanceIdError);
	});

	it('parses external input reject-never-repair (no case folding, no legacy forms)', () => {
		const canonical = `eip155:84532:0x${'ab'.repeat(20)}`;
		expect(parseUnivocityInstanceId(canonical)).toBe(canonical);
		expect(isUnivocityInstanceId(canonical)).toBe(true);
		for (const bad of [
			`eip155:84532:0x${'AB'.repeat(20)}`, // checksum-cased
			`84532:${'ab'.repeat(20)}`, // retired bespoke form
			`eip155:084532:0x${'ab'.repeat(20)}` // leading-zero chain id
		]) {
			expect(isUnivocityInstanceId(bad)).toBe(false);
			expect(() => parseUnivocityInstanceId(bad)).toThrow(UnivocityInstanceIdError);
		}
	});
});
