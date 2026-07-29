import type { Page } from '@playwright/test';

/**
 * Hermetic EIP-6963/EIP-1193 injected-wallet mock for Safe 1x1 (Mode D)
 * specs (plan-2607-45 slice 03, FOR-502). Installed as an init script so it
 * announces before the app's discovery runs. Answers `eth_signTypedData_v4`
 * with a fixed 65-byte v=27 blob and serves the Safe validation reads
 * (`eth_getCode`, `getOwners`, `getThreshold`) from the options — the app's
 * validation transport falls back to the provider when `PUBLIC_RPC_URL` is
 * unset, which is exactly the hermetic configuration.
 *
 * Every typed-data request is recorded on `window.__e2eInjectedWallet` so
 * specs can assert the SafeMessage / TransferWithAuthorization shapes.
 */

/** Owner EOA the mock wallet connects as. */
export const E2E_INJECTED_OWNER_ADDRESS = '0xe2e0000000000000000000000000000000000002';

/** 1-of-1 Safe the mock chain reports for the owner ('5afe' is hex). */
export const E2E_SAFE_ADDRESS = '0x5afe5afe5afe5afe5afe5afe5afe5afe5afe5afe';

/** The fixed signature the mock wallet returns (r‖s‖v, v = 27). */
export const E2E_INJECTED_SIGNATURE = `0x${'11'.repeat(32)}${'22'.repeat(32)}1b`;

export interface InjectedWalletMockOptions {
	address?: string;
	chainId?: number;
	safeAddress?: string;
	owners?: string[];
	threshold?: number;
}

export interface RecordedTypedDataRequest {
	from: string;
	primaryType: string;
	domain: Record<string, unknown>;
	message: Record<string, unknown>;
}

function chainReadResult(
	cfg: { safeAddress: string; owners: string[]; threshold: number },
	method: string,
	params: unknown[]
): string {
	const word = (value: number): string => value.toString(16).padStart(64, '0');
	const addressWord = (address: string): string =>
		address.replace(/^0x/, '').toLowerCase().padStart(64, '0');
	if (method === 'eth_getCode') {
		const [address] = params as [string];
		return address.toLowerCase() === cfg.safeAddress.toLowerCase()
			? '0x600160005260206000f3'
			: '0x';
	}
	if (method === 'eth_call') {
		const [{ to, data }] = params as [{ to: string; data: string }];
		if (to.toLowerCase() !== cfg.safeAddress.toLowerCase()) {
			throw new Error(`e2e chain: eth_call to unexpected address ${to}`);
		}
		if (data === '0xa0e67e2b') {
			return `0x${word(0x20)}${word(cfg.owners.length)}${cfg.owners.map(addressWord).join('')}`;
		}
		if (data === '0xe75235b8') {
			return `0x${word(cfg.threshold)}`;
		}
		throw new Error(`e2e chain: unmocked eth_call data ${data}`);
	}
	throw new Error(`e2e chain: unmocked method ${method}`);
}

/**
 * Intercept OUTBOUND JSON-RPC (the `PUBLIC_RPC_URL` validation transport) at
 * the network layer, shape-matched rather than URL-matched so the suite stays
 * hermetic whatever endpoint the build resolved. Non-JSON-RPC traffic falls
 * back to the other installed mocks.
 */
async function installJsonRpcIntercept(
	page: Page,
	cfg: { safeAddress: string; owners: string[]; threshold: number }
): Promise<void> {
	await page.route('**/*', async (route) => {
		const request = route.request();
		if (request.method() !== 'POST') return route.fallback();
		let body: { jsonrpc?: string; id?: unknown; method?: string; params?: unknown[] };
		try {
			body = request.postDataJSON() as typeof body;
		} catch {
			return route.fallback();
		}
		if (body?.jsonrpc !== '2.0' || typeof body.method !== 'string') return route.fallback();
		try {
			const result = chainReadResult(cfg, body.method, body.params ?? []);
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ jsonrpc: '2.0', id: body.id ?? null, result })
			});
		} catch (error) {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					jsonrpc: '2.0',
					id: body.id ?? null,
					error: { code: -32601, message: error instanceof Error ? error.message : String(error) }
				})
			});
		}
	});
}

export async function installInjectedWalletMock(
	page: Page,
	options: InjectedWalletMockOptions = {}
): Promise<void> {
	const config = {
		address: options.address ?? E2E_INJECTED_OWNER_ADDRESS,
		chainId: options.chainId ?? 84532,
		safeAddress: options.safeAddress ?? E2E_SAFE_ADDRESS,
		owners: options.owners ?? [options.address ?? E2E_INJECTED_OWNER_ADDRESS],
		threshold: options.threshold ?? 1,
		signature: E2E_INJECTED_SIGNATURE
	};
	await installJsonRpcIntercept(page, config);
	await page.addInitScript((cfg) => {
		const word = (value: number): string => value.toString(16).padStart(64, '0');
		const addressWord = (address: string): string =>
			address.replace(/^0x/, '').toLowerCase().padStart(64, '0');
		const record: { typedDataRequests: unknown[] } = { typedDataRequests: [] };
		(window as unknown as Record<string, unknown>).__e2eInjectedWallet = record;

		const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
		const provider = {
			async request({ method, params }: { method: string; params?: unknown[] }) {
				switch (method) {
					case 'eth_requestAccounts':
					case 'eth_accounts':
						return [cfg.address];
					case 'eth_chainId':
						return `0x${cfg.chainId.toString(16)}`;
					case 'wallet_switchEthereumChain':
					case 'wallet_addEthereumChain':
						return null;
					case 'eth_signTypedData_v4': {
						const [from, json] = params as [string, string];
						const parsed = JSON.parse(json) as {
							primaryType: string;
							domain: Record<string, unknown>;
							message: Record<string, unknown>;
						};
						record.typedDataRequests.push({
							from,
							primaryType: parsed.primaryType,
							domain: parsed.domain,
							message: parsed.message
						});
						return cfg.signature;
					}
					case 'personal_sign':
						return cfg.signature;
					case 'eth_getCode': {
						const [address] = params as [string];
						return address.toLowerCase() === cfg.safeAddress.toLowerCase()
							? '0x600160005260206000f3'
							: '0x';
					}
					case 'eth_call': {
						const [{ to, data }] = params as [{ to: string; data: string }];
						if (to.toLowerCase() !== cfg.safeAddress.toLowerCase()) {
							throw new Error(`e2e wallet: eth_call to unexpected address ${to}`);
						}
						if (data === '0xa0e67e2b') {
							return `0x${word(0x20)}${word(cfg.owners.length)}${cfg.owners
								.map(addressWord)
								.join('')}`;
						}
						if (data === '0xe75235b8') {
							return `0x${word(cfg.threshold)}`;
						}
						throw new Error(`e2e wallet: unmocked eth_call data ${data}`);
					}
					default:
						throw new Error(`e2e wallet: unmocked method ${method}`);
				}
			},
			on(event: string, listener: (...args: unknown[]) => void) {
				const list = listeners.get(event) ?? [];
				list.push(listener);
				listeners.set(event, list);
			},
			removeListener(event: string, listener: (...args: unknown[]) => void) {
				const list = listeners.get(event) ?? [];
				listeners.set(
					event,
					list.filter((l) => l !== listener)
				);
			}
		};

		window.addEventListener('eip6963:requestProvider', () => {
			window.dispatchEvent(
				new CustomEvent('eip6963:announceProvider', {
					detail: Object.freeze({
						info: {
							uuid: 'e2e-0000-0000-0000',
							name: 'E2E Wallet',
							icon: 'data:image/svg+xml,',
							rdns: 'dev.e2e.wallet'
						},
						provider
					})
				})
			);
		});
		(window as unknown as Record<string, unknown>).ethereum = provider;
	}, config);
}

/** Read back the typed-data requests the mock wallet answered. */
export async function recordedTypedDataRequests(page: Page): Promise<RecordedTypedDataRequest[]> {
	return page.evaluate(
		() =>
			(
				(window as unknown as Record<string, unknown>).__e2eInjectedWallet as {
					typedDataRequests: RecordedTypedDataRequest[];
				}
			).typedDataRequests
	);
}
