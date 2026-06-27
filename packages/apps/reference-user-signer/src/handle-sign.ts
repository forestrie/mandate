import type { SignRequest } from '@mandate/signer-contract';
import { isValidLogIdHex32, MAX_SIG_STRUCTURE_B64_LENGTH, timingSafeEqualString } from './auth.js';
import type { Env } from './env.js';
import { KeyStore, KeyStoreError } from './key-store.js';
import {
	addressesEqual,
	base64ToBytes,
	bytesToBase64,
	hashSigStructure,
	parseEthAddress,
	recoverAddressFromSignature,
	signRecoverableLowS
} from './sig-utils.js';

export interface HandleSignDeps {
	env: Env;
}

export async function handleSign(request: Request, deps: HandleSignDeps): Promise<Response> {
	const auth = request.headers.get('Authorization') ?? '';
	const expected = `Bearer ${deps.env.USER_SIGNER_BEARER}`;
	if (!deps.env.USER_SIGNER_BEARER || !timingSafeEqualString(auth, expected)) {
		return jsonResponse(401, { ok: false, error: 'unauthorized' });
	}

	let body: SignRequest;
	try {
		body = (await request.json()) as SignRequest;
	} catch {
		return jsonResponse(400, { ok: false, error: 'invalid JSON body' });
	}

	if (!body.logId || !body.keyRef || !body.rootSignerAddress || !body.sigStructure) {
		return jsonResponse(400, { ok: false, error: 'missing required sign fields' });
	}

	if (!isValidLogIdHex32(body.logId)) {
		return jsonResponse(400, { ok: false, error: 'logId must be 32-char hex' });
	}

	if (body.sigStructure.length > MAX_SIG_STRUCTURE_B64_LENGTH) {
		return jsonResponse(400, { ok: false, error: 'sigStructure exceeds maximum size' });
	}

	let sigStructureBytes: Uint8Array;
	try {
		sigStructureBytes = base64ToBytes(body.sigStructure);
	} catch {
		return jsonResponse(400, { ok: false, error: 'sigStructure must be base64' });
	}

	const keyStore = new KeyStore(deps.env.USER_SIGNER_KEYS_JSON);
	let entry;
	try {
		entry = keyStore.resolve(body.logId, body.keyRef, body.rootSignerAddress);
	} catch (error) {
		if (error instanceof KeyStoreError) {
			return jsonResponse(error.status, { ok: false, error: error.message });
		}
		throw error;
	}

	const hash = hashSigStructure(sigStructureBytes);
	const signature = signRecoverableLowS(hash, entry.privateKeyHex);
	const recovered = recoverAddressFromSignature(hash, signature);
	const expectedAddress = parseEthAddress(body.rootSignerAddress);
	if (!addressesEqual(recovered, expectedAddress)) {
		return jsonResponse(500, {
			ok: false,
			error: 'recovered signer address does not match rootSignerAddress'
		});
	}

	return jsonResponse(200, { signature: bytesToBase64(signature) });
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}
