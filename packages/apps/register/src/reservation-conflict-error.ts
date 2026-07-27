/**
 * A genesis POST lost the instance claim (ADR-0059 decision 8): the
 * univocity instance is reserved by a foreign admission or already
 * registered to another forest root. Canopy deliberately does not name a
 * reserved record's holder; a registered conflict names the holding root in
 * `detail`. Recovery for an abandoned reservation is the ops chain-bindings
 * release route (`releaseChainBinding`).
 */
export class ReservationConflictError extends Error {
	constructor(
		readonly univocityInstanceId: string,
		readonly detail: string
	) {
		super(
			`univocity instance ${univocityInstanceId} is reserved or registered elsewhere: ` +
				`${detail} (inspect/release via the ops chain-bindings route)`
		);
		this.name = 'ReservationConflictError';
	}
}
