import type { SignRequest } from '@mandate/signer-contract';
import type { Env } from './env.js';
import { isValidLogIdHex32, MAX_SIG_STRUCTURE_B64_LENGTH, timingSafeEqualString } from './auth.js';
import { KeyDirectory, KeyDirectoryError } from './key-directory.js';
import { privySecp256k1Sign, PrivySignError } from './privy/privy-sign.js';
import {
	addressesEqual,
	base64ToBytes,
	bytesToBase64,
	hashSigStructure,
	parseEthAddress,
	recoverAddressFromSignature
} from './privy/sig-utils.js';

export interface HandleSignDeps {
	env: Env;
	fetchImpl?: typeof fetch;
}

export async function handleSign(request: Request, deps: HandleSignDeps): Promise<Response> {
	const auth = request.headers.get('Authorization') ?? '';
	const expected = `Bearer ${deps.env.MANDATE_SIGNER_TOKEN}`;
	if (!deps.env.MANDATE_SIGNER_TOKEN || !timingSafeEqualString(auth, expected)) {
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

	const directory = new KeyDirectory(deps.env.KEY_DIRECTORY);
	let entry;
	try {
		entry = directory.resolve(body.keyRef, body.logId, body.rootSignerAddress);
	} catch (error) {
		if (error instanceof KeyDirectoryError) {
			return jsonResponse(error.status, { ok: false, error: error.message });
		}
		throw error;
	}

	const requiresAuth = entry.requiresAuthorizationSignature === true;
	if (requiresAuth && !deps.env.PRIVY_AUTHORIZATION_KEY?.trim()) {
		return jsonResponse(500, {
			ok: false,
			error: 'PRIVY_AUTHORIZATION_KEY required for owned-wallet keyRef but not configured'
		});
	}

	let signature: Uint8Array;
	try {
		signature = await privySecp256k1Sign(sigStructureBytes, {
			appId: deps.env.PRIVY_APP_ID,
			appSecret: deps.env.PRIVY_APP_SECRET,
			walletId: entry.walletId,
			apiBase: deps.env.PRIVY_API_BASE,
			authorizationKey: requiresAuth ? deps.env.PRIVY_AUTHORIZATION_KEY : undefined,
			fetchImpl: deps.fetchImpl
		});
	} catch (error) {
		if (error instanceof PrivySignError) {
			return jsonResponse(502, { ok: false, error: error.message });
		}
		throw error;
	}

	const hash = hashSigStructure(sigStructureBytes);
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
