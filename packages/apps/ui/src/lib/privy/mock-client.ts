/** Fixed embedded-wallet address for hermetic browser e2e (`VITE_E2E_PRIVY_MOCK=true`). */
export const E2E_MOCK_WALLET_ADDRESS = '0xE2E0000000000000000000000000000000000001';

/** 65-byte hex signature (0x + 130 hex chars) for mock provider responses. */
export const E2E_MOCK_SIGNATURE_HEX = `0x${'ab'.repeat(65)}`;

interface MockPrivyClient {
	initialize(): Promise<void>;
	auth: {
		email: {
			sendCode(email: string): Promise<void>;
			loginWithCode(email: string, code: string, mode: string, options: unknown): Promise<void>;
		};
		logout(): Promise<void>;
	};
	user: {
		get(): Promise<{ user: { id: string } | null }>;
	};
	embeddedWallet: {
		getEthereumProvider(_args: unknown): Promise<{
			request(args: { method: string; params?: unknown[] }): Promise<unknown>;
		}>;
	};
}

let mockAuthenticated = false;

/** Reset mock auth state (tests). */
export function resetMockPrivyAuthState(): void {
	mockAuthenticated = false;
}

/** In-memory Privy double for hermetic e2e; no network. */
export async function createMockPrivyClient(): Promise<MockPrivyClient> {
	return {
		async initialize() {},
		auth: {
			email: {
				async sendCode(email: string) {
					void email;
				},
				async loginWithCode(email: string, code: string, mode: string, options: unknown) {
					void email;
					void code;
					void mode;
					void options;
					mockAuthenticated = true;
				}
			},
			async logout() {
				mockAuthenticated = false;
			}
		},
		user: {
			async get() {
				return { user: mockAuthenticated ? { id: 'e2e-mock-user' } : null };
			}
		},
		embeddedWallet: {
			async getEthereumProvider(args: unknown) {
				void args;
				return {
					async request({ method }) {
						if (method === 'personal_sign' || method === 'secp256k1_sign') {
							return E2E_MOCK_SIGNATURE_HEX;
						}
						throw new Error(`Unsupported mock provider method: ${method}`);
					}
				};
			}
		}
	};
}

export function mockWalletAddressWhenAuthenticated(): string | null {
	return mockAuthenticated ? E2E_MOCK_WALLET_ADDRESS : null;
}

export function mockEthereumProviderWhenAuthenticated(): {
	request(args: { method: string; params?: unknown[] }): Promise<unknown>;
} | null {
	if (!mockAuthenticated) return null;
	return {
		async request({ method }) {
			if (method === 'personal_sign' || method === 'secp256k1_sign') {
				return E2E_MOCK_SIGNATURE_HEX;
			}
			throw new Error(`Unsupported mock provider method: ${method}`);
		}
	};
}
