/**
 * Input check for the bootstrap-key attestation that `mandate-register
 * onboard request` signs through the remote mandate signer
 * (`buildOnboardAttestationKs256Remote` in `onboard-attestation.ts`). canopy
 * refuses an onboard request without one (devdocs ADR-0059 decision 8), so the
 * CLI needs every signer input before it posts anything, and prints usage
 * naming the missing ones rather than failing later with an opaque error.
 */

/** Attestation inputs as the CLI read them; an empty string counts as missing. */
export interface OnboardRequestAttestationArgs {
	/** `--root-address`: the bootstrap wallet address the signer recovery-checks. */
	rootSignerAddress?: string;
	/** `--log-id`: the 32-hex log id the signer's KEY_DIRECTORY authorises. */
	logIdHex32?: string;
	/** `--signer-url`, else the MANDATE_SIGNER_URL env. */
	signerUrl?: string;
}

/** Every input present, or the CLI-facing names of the missing ones in usage order. */
export type OnboardRequestAttestationInputs =
	| { ok: true; rootSignerAddress: string; logIdHex32: string; signerUrl: string }
	| { ok: false; missing: string[] };

/** Check that every attestation input is present before the CLI signs or posts. */
export function checkOnboardRequestAttestationInputs(
	args: OnboardRequestAttestationArgs
): OnboardRequestAttestationInputs {
	const { rootSignerAddress, logIdHex32, signerUrl } = args;
	if (rootSignerAddress && logIdHex32 && signerUrl) {
		return { ok: true, rootSignerAddress, logIdHex32, signerUrl };
	}
	const missing: string[] = [];
	if (!rootSignerAddress) missing.push('--root-address');
	if (!logIdHex32) missing.push('--log-id');
	if (!signerUrl) missing.push('a signer URL (--signer-url or MANDATE_SIGNER_URL)');
	return { ok: false, missing };
}
