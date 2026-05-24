import { browser } from '$app/environment';
import { getConnectedWalletAddress, getPrivyClient } from './client.js';

export interface PrivySessionState {
	ready: boolean;
	authenticated: boolean;
	address: string | null;
	error: string | null;
}

let state = $state<PrivySessionState>({
	ready: false,
	authenticated: false,
	address: null,
	error: null
});

let initialized = false;

export function getPrivySessionState(): PrivySessionState {
	return state;
}

export async function initPrivySession(): Promise<void> {
	if (!browser || initialized) return;
	initialized = true;
	try {
		await refreshPrivySession();
	} catch (error) {
		state = {
			ready: true,
			authenticated: false,
			address: null,
			error: error instanceof Error ? error.message : 'Privy init failed'
		};
	}
}

export async function refreshPrivySession(): Promise<void> {
	const address = await getConnectedWalletAddress();
	state = {
		ready: true,
		authenticated: Boolean(address),
		address,
		error: null
	};
}

export async function loginWithEmail(email: string): Promise<void> {
	const privy = await getPrivyClient();
	await privy.auth.email.sendCode(email);
	const code = window.prompt('Enter the verification code sent to your email');
	if (!code) throw new Error('Verification code required');
	await privy.auth.email.loginWithCode(email, code.trim(), 'login-or-sign-up', {
		embedded: { ethereum: { createOnLogin: 'users-without-wallets' } }
	});
	await refreshPrivySession();
}

export async function logoutPrivy(): Promise<void> {
	const privy = await getPrivyClient();
	await privy.auth.logout();
	await refreshPrivySession();
}
