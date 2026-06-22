/** Thrown when Mode C owner-topology invariant I2 is violated. */
export class OwnerTopologyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'OwnerTopologyError';
	}
}
