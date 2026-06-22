export class GenesisClientError extends Error {
	constructor(
		message: string,
		readonly status?: number,
		readonly detail?: string
	) {
		super(message);
		this.name = 'GenesisClientError';
	}
}
