import { env } from '$env/dynamic/public';
import { UNIVOCITY_GITHUB_ORG, UNIVOCITY_GITHUB_REPO } from '@forestrie/deploy-core';

/**
 * Deploy-branch configuration (plan-2607-47 slice 02). The default release
 * tag is resolved to a CONCRETE version at deploy time (univocity-tools #25
 * pattern — a `latest` sentinel would put an anonymous GitHub lookup on the
 * page path) and reaches the ssr=false shell via the runtime Pages env, like
 * PUBLIC_RPC_URL. Unset ⇒ no default; the operator types a tag, with the
 * releases page linked beside the input.
 */
export function defaultUnivocityReleaseTag(): string | null {
	const raw = env.PUBLIC_UNIVOCITY_RELEASE_TAG?.trim();
	if (!raw || raw.toLowerCase() === 'latest') return null;
	return raw;
}

/** Human release index for picking a non-default tag. */
export const UNIVOCITY_RELEASES_PAGE_URL = `https://github.com/${UNIVOCITY_GITHUB_ORG}/${UNIVOCITY_GITHUB_REPO}/releases`;
