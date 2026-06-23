import { describe, expect, it } from 'vitest';
import {
	assertMandateAbsentFromAdditionalSigners,
	assertMandateIsAdditionalSignerOnly,
	assertMandateNotWalletOwner,
	assertOwnerQuorumExcludesMandate,
	assertWalletIsUserOwned,
	OwnerTopologyError
} from '../src/index.js';
import type { KeyQuorum, Wallet } from '../src/index.js';

const MANDATE_SIGNER = 'kq_mandate_signer_0000000001';
const USER_OWNER = 'kq_user_owner_00000000000001';

function wallet(overrides: Partial<Wallet> = {}): Wallet {
	return {
		id: 'wallet_test',
		address: '0x1234567890123456789012345678901234567890',
		chain_type: 'ethereum',
		owner_id: USER_OWNER,
		additional_signers: [{ signer_id: MANDATE_SIGNER, override_policy_ids: ['pol_1'] }],
		...overrides
	};
}

describe('owner topology (I2)', () => {
	it('rejects mandate as wallet owner_id', () => {
		expect(() =>
			assertMandateNotWalletOwner(wallet({ owner_id: MANDATE_SIGNER }), MANDATE_SIGNER)
		).toThrow(OwnerTopologyError);
	});

	it('accepts mandate as additional signer only', () => {
		expect(() => assertMandateIsAdditionalSignerOnly(wallet(), MANDATE_SIGNER)).not.toThrow();
	});

	it('accepts empty additional_signers after revoke', () => {
		expect(() =>
			assertMandateAbsentFromAdditionalSigners(wallet({ additional_signers: [] }), MANDATE_SIGNER)
		).not.toThrow();
	});

	it('accepts when mandate absent but other additional signers remain', () => {
		expect(() =>
			assertMandateAbsentFromAdditionalSigners(
				wallet({
					additional_signers: [{ signer_id: 'kq_other_signer', override_policy_ids: ['pol_2'] }]
				}),
				MANDATE_SIGNER
			)
		).not.toThrow();
	});

	it('rejects when mandate remains after targeted revoke check', () => {
		expect(() => assertMandateAbsentFromAdditionalSigners(wallet(), MANDATE_SIGNER)).toThrow(
			OwnerTopologyError
		);
	});

	it('rejects when any additional signers remain and mandateSignerId omitted', () => {
		expect(() => assertMandateAbsentFromAdditionalSigners(wallet())).toThrow(OwnerTopologyError);
	});

	it('rejects when mandate is not in additional_signers', () => {
		expect(() =>
			assertMandateIsAdditionalSignerOnly(wallet({ additional_signers: [] }), MANDATE_SIGNER)
		).toThrow(OwnerTopologyError);
	});

	it('rejects 1-of-k owner quorum including mandate', () => {
		const quorum: KeyQuorum = {
			id: USER_OWNER,
			authorization_threshold: 1,
			members: [{ key_quorum_id: MANDATE_SIGNER }]
		};
		expect(() => assertOwnerQuorumExcludesMandate(quorum, MANDATE_SIGNER)).toThrow(
			OwnerTopologyError
		);
	});

	it('rejects m-of-n owner quorum including mandate (strict I2)', () => {
		const quorum: KeyQuorum = {
			id: USER_OWNER,
			authorization_threshold: 2,
			members: [{ key_quorum_id: MANDATE_SIGNER }, { authorization_key_id: 'key_user' }]
		};
		expect(() => assertOwnerQuorumExcludesMandate(quorum, MANDATE_SIGNER)).toThrow(
			OwnerTopologyError
		);
	});

	it('rejects ownerless wallet (operator app-controlled)', () => {
		expect(() =>
			assertWalletIsUserOwned(wallet({ owner_id: null, owner: null, additional_signers: [] }))
		).toThrow(OwnerTopologyError);
	});

	it('accepts user-owned wallet via owner.user_id', () => {
		expect(() =>
			assertWalletIsUserOwned(
				wallet({
					owner_id: null,
					owner: { user_id: 'did:privy:user_abc' },
					additional_signers: []
				})
			)
		).not.toThrow();
	});
});
