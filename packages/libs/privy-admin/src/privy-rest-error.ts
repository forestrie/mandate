/** Privy REST API error with HTTP status. */
export class PrivyRestError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly body?: string
	) {
		super(message);
		this.name = 'PrivyRestError';
	}
}
