#!/usr/bin/env node
/**
 * The contract's own integrity check.
 *
 * `contracts/genlexis/v1` is the single interface shared between the two
 * repositories, so a silent edit to it is a silent change of meaning on both
 * sides. This hashes the OpenAPI document, the limits and every fixture into one
 * digest and compares it to the recorded one.
 *
 * `--write` records a new digest, and doing so is the explicit act the plan asks
 * for: a fixture may change, but not without someone saying so in the diff.
 *
 * The release provenance of CI signs the artifact containing this directory. No
 * separate application-level signature is claimed.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'contracts', 'genlexis');

/** Every contract file, in a stable order, with its own digest. */
function digestOf(versionDir) {
	const files = [
		'openapi.yaml',
		'limits.json',
		...readdirSync(join(versionDir, 'fixtures'))
			.filter((name) => name.endsWith('.json'))
			.sort()
			.map((name) => join('fixtures', name))
	];
	const overall = createHash('sha256');
	const entries = files.map((relative) => {
		const bytes = readFileSync(join(versionDir, relative));
		const sha256 = createHash('sha256').update(bytes).digest('hex');
		overall.update(relative + ' ' + sha256 + '\n');
		return { file: relative, sha256 };
	});
	return { entries, contractHash: overall.digest('hex') };
}

const write = process.argv.includes('--write');
let failed = false;

for (const version of readdirSync(root).sort()) {
	const versionDir = join(root, version);
	const { entries, contractHash } = digestOf(versionDir);
	const manifestPath = join(versionDir, 'CONTRACT_HASH.json');
	const manifest = { contractVersion: version.replace(/^v/, ''), contractHash, files: entries };

	if (write) {
		writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
		console.log(version + ': recorded ' + contractHash);
		continue;
	}
	if (!existsSync(manifestPath)) {
		console.error(
			version + ': no CONTRACT_HASH.json — run `node scripts/contract-hash.mjs --write`'
		);
		failed = true;
		continue;
	}
	const recorded = JSON.parse(readFileSync(manifestPath, 'utf8'));
	if (recorded.contractHash !== contractHash) {
		console.error(
			version +
				': contract changed without an explicit hash update\n' +
				'  recorded ' +
				recorded.contractHash +
				'\n  actual   ' +
				contractHash
		);
		for (const entry of entries) {
			const before = (recorded.files ?? []).find((file) => file.file === entry.file);
			if (before === undefined) console.error('  + ' + entry.file);
			else if (before.sha256 !== entry.sha256) console.error('  ~ ' + entry.file);
		}
		for (const before of recorded.files ?? []) {
			if (!entries.some((entry) => entry.file === before.file)) console.error('  - ' + before.file);
		}
		failed = true;
	} else {
		console.log(version + ': ' + contractHash);
	}
}

process.exit(failed ? 1 : 0);
