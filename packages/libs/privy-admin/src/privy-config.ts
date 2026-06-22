/** Configuration for {@link PrivyRestClient}. */
export interface PrivyAdminConfig {
	appId: string;
	appSecret: string;
	apiBase?: string;
	fetchImpl?: typeof fetch;
}
