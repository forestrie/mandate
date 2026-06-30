/** Forest genesis univocity anchor variant (canopy -68016). */
export type UnivocityGenesisVariant = 'imutable' | 'uups-counterfactual';

/** Parse CLI `--univocity-variant` (default imutable when omitted). */
export function parseUnivocityVariant(
	raw: string | undefined
): UnivocityGenesisVariant | undefined {
	if (raw === undefined || raw.trim() === '') {
		return undefined;
	}
	const normalized = raw.trim().toLowerCase();
	if (normalized === 'imutable' || normalized === 'uups-counterfactual') {
		return normalized;
	}
	throw new Error(`invalid univocity variant: ${raw} (expected imutable or uups-counterfactual)`);
}
