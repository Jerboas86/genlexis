/**
 * Packs the tarball and consumes it from a throwaway project.
 *
 * The point is what it does *not* have: no workspace resolution, no path
 * aliases, no Genlexis source tree. A tarball that only works from inside the
 * monorepo is not a publishable package, and this is the only check that can
 * say so.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const packageDir = resolve(import.meta.dirname, '..');
const work = mkdtempSync(join(tmpdir(), 'genlexis-core-pack-'));
const run = (command, args, cwd) =>
	execFileSync(command, args, { cwd, stdio: 'inherit', encoding: 'utf8' });

try {
	run('pnpm', ['pack', '--pack-destination', work], packageDir);
	const tarball = readdirSync(work).find((name) => name.endsWith('.tgz'));
	if (tarball === undefined) throw new Error('pnpm pack produced no tarball');

	writeFileSync(
		join(work, 'package.json'),
		JSON.stringify(
			{
				name: 'genlexis-core-pack-test',
				private: true,
				type: 'module',
				dependencies: { '@genlexis/core': `file:./${tarball}`, typescript: '^5.6.0' }
			},
			null,
			2
		)
	);
	writeFileSync(
		join(work, 'tsconfig.json'),
		JSON.stringify(
			{
				compilerOptions: {
					module: 'es2022',
					moduleResolution: 'bundler',
					target: 'es2022',
					lib: ['es2022'],
					strict: true,
					noEmit: true
				},
				include: ['consumer.ts']
			},
			null,
			2
		)
	);
	// Imports the engine only. A type error here means the published `.d.ts`
	// files do not describe the runtime the tarball ships.
	writeFileSync(
		join(work, 'consumer.ts'),
		[
			`import { generateBalancedAcceptedSentences, SUPPORTED_PATTERNS } from "@genlexis/core";`,
			`import type { GenerationRepository, BalancedGenerateResult } from "@genlexis/core";`,
			`const repository: GenerationRepository = {`,
			`  countAcceptedSentences: async () => 0,`,
			`  findRandomAcceptedItems: async () => [],`,
			`  findAcceptedItemsWithIpa: async () => [],`,
			`  getPhonemeDistribution: async () => ({ language: "fr-FR", probabilities: {} }) as never,`,
			`};`,
			`export const draw = (): Promise<BalancedGenerateResult> =>`,
			`  generateBalancedAcceptedSentences(`,
			`    { language: "fr-FR", pattern: SUPPORTED_PATTERNS[0], listCount: 1, itemsPerList: 1 },`,
			`    repository,`,
			`  );`,
			``
		].join('\n')
	);
	// Two smoke files, because the split entry points make two different claims.
	// The first runs with `drizzle-orm` absent: the engine must import, and the
	// adapter must not have leaked into it. The second installs the optional peer
	// and imports the sub-path, which is the only way it is reachable.
	writeFileSync(
		join(work, 'smoke-core.mjs'),
		[
			`import * as core from "@genlexis/core";`,
			`const missing = ["generateBalancedAcceptedSentences", "SUPPORTED_PATTERNS"].filter(`,
			`  (name) => !(name in core),`,
			`);`,
			`if (missing.length > 0) throw new Error("missing exports: " + missing.join(", "));`,
			`if ("createDrizzleGenerationRepository" in core)`,
			`  throw new Error("the drizzle adapter leaked into the main entry point");`,
			`console.log("engine imports with no drizzle-orm installed");`,
			``
		].join('\n')
	);
	writeFileSync(
		join(work, 'smoke-adapter.mjs'),
		[
			`import * as adapter from "@genlexis/core/adapters/drizzle";`,
			`if (typeof adapter.createDrizzleGenerationRepository !== "function")`,
			`  throw new Error("the drizzle sub-path does not export its factory");`,
			`console.log("adapter imports with the optional peer installed");`,
			``
		].join('\n')
	);

	run('pnpm', ['install', '--ignore-workspace', '--no-lockfile'], work);
	run('node', ['smoke-core.mjs'], work);
	run('./node_modules/.bin/tsc', ['-p', 'tsconfig.json'], work);

	// Only now is the optional peer added, so the check above proved something.
	// A second throwaway project rather than `pnpm add` into the first: adding a
	// dependency after the fact is what makes the "drizzle was absent" claim
	// above unfalsifiable, and it trips lockfile policies besides.
	const withPeer = mkdtempSync(join(tmpdir(), 'genlexis-core-peer-'));
	try {
		copyFileSync(join(work, tarball), join(withPeer, tarball));
		copyFileSync(join(work, 'smoke-adapter.mjs'), join(withPeer, 'smoke-adapter.mjs'));
		writeFileSync(
			join(withPeer, 'package.json'),
			JSON.stringify(
				{
					name: 'genlexis-core-pack-test-peer',
					private: true,
					type: 'module',
					dependencies: { '@genlexis/core': `file:./${tarball}`, 'drizzle-orm': '^0.45.2' }
				},
				null,
				2
			)
		);
		run('pnpm', ['install', '--ignore-workspace', '--no-lockfile'], withPeer);
		run('node', ['smoke-adapter.mjs'], withPeer);
	} finally {
		rmSync(withPeer, { recursive: true, force: true });
	}
	console.log('pack test passed');
} finally {
	rmSync(work, { recursive: true, force: true });
}
