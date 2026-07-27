#!/usr/bin/env node
/**
 * Naming-hygiene gate, adopted from canopy (devdocs plan-2607-43 D6;
 * mandate adoption: FOR-481).
 *
 * The identifier previously called `instanceKey` / `liableAccountKey` /
 * `accountKey` has exactly one name: `univocityInstanceId`
 * (SQL `univocity_instance_id`), and the pre-ADR-0059 registration taxonomy
 * (class / endorsement) is retired. This gate fails the build when a banned
 * name appears outside the explicit allowlist, so retired vocabulary cannot
 * creep back in. Keep the ban list in lockstep with canopy's
 * `scripts/check-naming.mjs` — canopy is the authority.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BANNED = [
	/instanceKey/,
	/instance_key/,
	/liableAccount/,
	/accountKey/,
	/account_key/,
	/payment-authoritative/i,
	/\bRegistrationClass/,
	/endorsedBy/
];

/**
 * path-prefix → reason. Mandate carries no legacy stored state, so the list
 * starts (and should stay) at the gate itself. Adding an entry requires the
 * canopy discipline: migrations, tolerant readers of legacy records, or
 * tests pinning one of those — new product code never qualifies.
 */
const ALLOWLIST = {
	'scripts/check-naming.mjs': 'the gate itself'
};

const files = execFileSync('git', ['ls-files', '--', 'packages', 'scripts'], {
	encoding: 'utf8'
})
	.split('\n')
	.filter((f) => /\.(ts|tsx|mts|cts|js|mjs|cjs|jsonc?|sql|toml|yaml|yml|svelte)$/.test(f));

const hits = [];
for (const file of files) {
	if (Object.keys(ALLOWLIST).some((prefix) => file.startsWith(prefix))) {
		continue;
	}
	let text;
	try {
		text = readFileSync(file, 'utf8');
	} catch {
		continue;
	}
	const lines = text.split('\n');
	for (const banned of BANNED) {
		lines.forEach((line, i) => {
			if (banned.test(line)) {
				hits.push(`${file}:${i + 1}: banned name ${banned.source}: ${line.trim()}`);
			}
		});
	}
}

if (hits.length > 0) {
	console.error(
		'naming-hygiene gate (canopy plan-2607-43 D6, adopted FOR-481): retired identifier names found.\n' +
			'Use univocityInstanceId / univocity_instance_id, or add a justified\n' +
			'allowlist entry in scripts/check-naming.mjs.\n'
	);
	for (const hit of hits) console.error(`  ${hit}`);
	process.exit(1);
}
console.log(`naming-hygiene gate: clean (${files.length} files scanned)`);
