import { beforeAll, describe, expect, it } from 'vitest';

/**
 * The one suite that touches a real database.
 *
 * Everything else about `createDraw` is proven against an in-memory double, which
 * is the right level for rules. What a double cannot prove is that the hand-written
 * migration matches the Drizzle declaration, that the engine finds an accepted
 * pool, and that a draw survives a round trip through PostgreSQL.
 *
 * Skipped unless `GENLEXIS_SMOKE=1`, so the hermetic suite stays hermetic:
 *
 *   doppler run -p genlexis -c dev -- \
 *     env GENLEXIS_SMOKE=1 pnpm exec vitest --run --project server draws.smoke
 *
 * It writes draws to whichever database the environment points at. They are the
 * service's own rows, not patient data, and they are cleaned up at the end.
 *
 * **It needs a pool.** The accepted corpus differs enormously between
 * environments — `np_verb` at medium density held 2 sentences in `dev` and 140 in
 * `prod` when this was written — so the suite checks the pool first and says so
 * plainly. A run that fails with `incomplete_draw` because the environment is
 * thin is a false alarm, and it took a real call to notice that the two are
 * indistinguishable from the error code alone.
 */
const enabled = process.env.GENLEXIS_SMOKE === '1';

describe.skipIf(!enabled)('a draw against a real database', () => {
	let createDraw: typeof import('./draws').createDraw;
	let repository: import('./draws').DrawRepository;
	let generationRepository: import('./draws').DrawDependencies['generationRepository'];
	let db: typeof import('$lib/server/db').db;
	let schema: typeof import('$lib/server/db/schema');
	let revision: string;
	const written: string[] = [];

	beforeAll(async () => {
		({ createDraw } = await import('./draws'));
		const { PUBLISHED_REVISIONS } = await import('./registry');
		revision = PUBLISHED_REVISIONS[0]!;
		({ createDrawRepository: repository } = {
			createDrawRepository: (await import('./drawsRepository')).createDrawRepository()
		});
		({ repository: generationRepository } = await import('$lib/server/genlexis/repository'));
		({ db } = await import('$lib/server/db'));
		schema = await import('$lib/server/db/schema');
	});

	/**
	 * Refuses to run against a corpus that cannot satisfy the revision.
	 *
	 * Without this, every case fails with `incomplete_draw` — which is also what a
	 * genuine regression looks like. The count makes the difference legible.
	 */
	async function requirePool(): Promise<void> {
		const { resolveProtocolRevision } = await import('./registry');
		const configuration = resolveProtocolRevision(revision)!;
		const items = await generationRepository.findAcceptedItemsWithIpa({
			language: configuration.language,
			pattern: configuration.pattern,
			lexicalDensity: configuration.lexicalDensity,
			poolSize: configuration.itemsPerList * 4
		});
		if (items.length < configuration.itemsPerList) {
			throw new Error(
				`This environment's accepted pool holds ${items.length} ${configuration.pattern} ` +
					`items at ${configuration.lexicalDensity} density; the revision ${revision} draws ` +
					`${configuration.itemsPerList}. The service is right to refuse — seed the corpus ` +
					`or run this against an environment that has one.`
			);
		}
	}

	const draw = (idempotencyKey: string, excludedDrawIds: string[] = []) =>
		createDraw(
			{ contractVersion: '1', protocolRevision: revision, idempotencyKey, excludedDrawIds },
			{ repository, generationRepository }
		);

	it('has a pool large enough for the published revision', async () => {
		await expect(requirePool()).resolves.toBeUndefined();
	});

	it('produces a complete draw from the accepted pool', async () => {
		const key = `${'a'.repeat(48)}${Date.now().toString(16).padStart(16, '0')}`;
		const result = await draw(key);
		written.push(result.drawId);

		expect(result.items.length).toBe(result.generation.options.itemsPerList);
		expect(result.drawId).toMatch(/^[0-9a-f]{32}$/);
		expect(result.materialRelease.poolRevision).toBeTruthy();
		// Real sentences, not placeholders.
		for (const item of result.items) expect(item.text.trim().length).toBeGreaterThan(0);
	});

	it('replays the stored draw rather than drawing a second one', async () => {
		const key = `${'b'.repeat(48)}${Date.now().toString(16).padStart(16, '0')}`;
		const first = await draw(key);
		written.push(first.drawId);
		const second = await draw(key);

		// Round-tripped through PostgreSQL: same identifier, same items, same text.
		expect(second.drawId).toBe(first.drawId);
		expect(second.items).toEqual(first.items);
		expect(second.generation.seed).toBe(first.generation.seed);
	});

	/**
	 * Rotation needs a corpus, not just a pool.
	 *
	 * Excluding a draw removes 20 sentences, and on a thin corpus the balance of
	 * what remains degrades fast. Measured against the 145 accepted `np_verb`
	 * sentences at medium density on 2026-08-29, the p90 distance ran 0.162 with
	 * nothing excluded, 0.208 after one draw, 0.260 after two and 0.334 after
	 * three — while the revision publishes 0.16. A single tolerance cannot cover
	 * both a fresh draw and a third rotated one without ceasing to mean anything.
	 *
	 * So this case is skipped, loudly, until the corpus can carry it. The
	 * threshold is an estimate, not a measurement: keeping a three-draw window
	 * (60 sentences) under a tenth of the corpus is what would hold the
	 * degradation near the un-excluded case.
	 */
	const CORPUS_FOR_ROTATION = 600;

	it('rotates away from every item of an excluded draw', async ({ skip }) => {
		const { resolveProtocolRevision } = await import('./registry');
		const configuration = resolveProtocolRevision(revision)!;
		const corpus = await generationRepository.findAcceptedItemsWithIpa({
			language: configuration.language,
			pattern: configuration.pattern,
			lexicalDensity: configuration.lexicalDensity,
			poolSize: CORPUS_FOR_ROTATION * 2
		});
		skip(
			corpus.length < CORPUS_FOR_ROTATION,
			`the accepted corpus holds ${corpus.length} sentences; rotating away from ` +
				`${configuration.itemsPerList} of them cannot stay within the published ` +
				`tolerance of ${configuration.phonemeBalanceTolerance} until it reaches ` +
				`about ${CORPUS_FOR_ROTATION}`
		);

		const first = await draw(`${'c'.repeat(48)}${Date.now().toString(16).padStart(16, '0')}`);
		written.push(first.drawId);
		const second = await draw(`${'d'.repeat(48)}${Date.now().toString(16).padStart(16, '0')}`, [
			first.drawId
		]);
		written.push(second.drawId);

		const excluded = new Set(first.items.map((item) => `${item.itemId}@${item.itemRevision}`));
		for (const item of second.items) {
			expect(excluded.has(`${item.itemId}@${item.itemRevision}`)).toBe(false);
		}
	});

	it('cleans up after itself', async () => {
		const { inArray } = await import('drizzle-orm');
		if (written.length > 0) {
			// The cascade takes the items and the ledger entries with them.
			await db.delete(schema.materialDraws).where(inArray(schema.materialDraws.drawId, written));
		}
		expect(written.length).toBeGreaterThan(0);
	});
});
