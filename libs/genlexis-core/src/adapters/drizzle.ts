import { sql, type SQL } from 'drizzle-orm';
import type { PhonemeDistribution } from '../phonemes/types.js';
import type {
	AcceptedItem,
	AcceptedItemWithIpa,
	DetType,
	DrizzleRepositoryConfig,
	FindAcceptedItemsOptions,
	FindAcceptedItemsWithIpaOptions,
	FindPoolOptions,
	GenerationRepository,
	LexicalDensity,
	LexicalProperties,
	PatternSpec,
	PoolEntry,
	PoolRepository
} from '../types.js';

/**
 * The narrow slice of a Drizzle client this adapter needs.
 *
 * Structural rather than nominal on purpose: the host supplies its own client,
 * and `drizzle-orm` is an optional peer at `>=0.30.0`, so naming a concrete
 * class here would tie the adapter to one version of it.
 *
 * The statement is typed as `SQL` rather than left open. Every query this file
 * hands to `execute` is built by the `sql` tag above, and the same `SQL` type
 * already appears throughout — so an open type bought no decoupling that the
 * rest of the file had not already spent.
 */
type DrizzleDb = {
	execute: <T extends Record<string, unknown> = Record<string, unknown>>(
		statement: SQL
	) => Promise<{ rows: T[] }>;
};

const ident = (name: string): SQL => sql.raw(name);

const literal = (value: string): SQL => sql`${value}`;

const specFor = (pattern: string, patterns: DrizzleRepositoryConfig['patterns']): PatternSpec =>
	patterns[pattern as keyof typeof patterns] ?? { hasDet: false, hasAdj: false, hasVerb: false };

const detSetFor = (
	detType: DetType | undefined,
	preset: DrizzleRepositoryConfig['preset']
): readonly string[] | null => {
	const determiners = preset?.determiners;
	if (!determiners) return null;
	if (detType === 'definite') return determiners.definite;
	if (detType === 'indefinite') return determiners.indefinite;
	return null;
};

const buildDensityFilter = (
	lexicalDensity: LexicalDensity | undefined,
	preset: DrizzleRepositoryConfig['preset']
): SQL => {
	const bands = preset?.lexicalDensity;
	if (!bands || !lexicalDensity) return sql``;
	if (lexicalDensity === 'high') {
		return sql`AND noun_le.pld20 IS NOT NULL AND noun_le.pld20 < ${bands.high.max}`;
	}
	if (lexicalDensity === 'medium') {
		return sql`AND noun_le.pld20 IS NOT NULL AND noun_le.pld20 >= ${bands.medium.min} AND noun_le.pld20 <= ${bands.medium.max}`;
	}
	return sql`AND noun_le.pld20 IS NOT NULL AND noun_le.pld20 > ${bands.low.min}`;
};

const buildLengthFilter = (
	length: number | undefined,
	lengthUnit: FindAcceptedItemsOptions['lengthUnit']
): SQL => {
	if (length === undefined) return sql``;
	if (lengthUnit === 'phonemes') return sql`AND noun_le.phoneme_count = ${length}`;
	return sql`AND noun_le.syllable_count = ${length}`;
};

const buildSeedOrders = (seed: string | undefined): { inner: SQL; outer: SQL } => {
	if (!seed) {
		return { inner: sql`random()`, outer: sql`random()` };
	}
	return {
		inner: sql`hashtext(${seed + '|i|'} || s.sentence_id::text)`,
		outer: sql`hashtext(${seed + '|o|'} || "sentenceId"::text)`
	};
};

/** The filters every drawable sentence passes, shared by a draw and a pool. */
type CandidateFilters = Omit<FindAcceptedItemsWithIpaOptions, 'poolSize' | 'seed'>;

/** One token row of a pool query, before grouping by sentence. */
type PoolRow = AcceptedItem &
	Omit<LexicalProperties, 'source'> & {
		nounPhonoIpa: string;
		adjPhonoIpa?: string | null;
		verbPhonoIpa?: string | null;
		position: number;
		slot: string;
		surface: string;
		hasLexical: boolean;
		source: string | null;
	};

const LEXICAL_KEYS = [
	'lemma',
	'category',
	'gender',
	'number',
	'verbInfo',
	'frequency',
	'frequencyOrtho',
	'frequencyLemma',
	'cdOrtho',
	'phono',
	'phonoIpa',
	'letterCount',
	'phonemeCount',
	'syllableCount',
	'syllPhono',
	'cvPhono',
	'old20',
	'pld20',
	'voisOrtho',
	'voisPhono',
	'homographCount',
	'homophoneCount',
	'puOrtho',
	'puPhon',
	'preval',
	'prevalCount',
	'rtFlp',
	'zrtFlp',
	'errFlp'
] as const satisfies readonly (keyof LexicalProperties)[];

/** A numeric column read back as a number, whatever the driver handed over. */
const numberOrNull = (value: unknown): number | null =>
	value === null || value === undefined ? null : Number(value);

const NUMERIC_KEYS = new Set<string>([
	'frequency',
	'frequencyOrtho',
	'frequencyLemma',
	'cdOrtho',
	'letterCount',
	'phonemeCount',
	'syllableCount',
	'old20',
	'pld20',
	'voisOrtho',
	'voisPhono',
	'homographCount',
	'homophoneCount',
	'puOrtho',
	'puPhon',
	'preval',
	'prevalCount',
	'rtFlp',
	'zrtFlp',
	'errFlp'
]);

/** Token rows, ordered by sentence then position, grouped into pool entries. */
const groupPoolRows = (rows: readonly PoolRow[]): PoolEntry[] => {
	const entries: PoolEntry[] = [];
	let current: PoolEntry | undefined;
	for (const row of rows) {
		if (current?.sentenceId !== row.sentenceId) {
			current = {
				sentenceId: row.sentenceId,
				sentence: row.sentence,
				pattern: row.pattern,
				dedupeKey: row.dedupeKey,
				phonoIpas: [row.nounPhonoIpa, row.adjPhonoIpa, row.verbPhonoIpa].filter(
					(ipa): ipa is string => Boolean(ipa)
				),
				tokens: []
			};
			entries.push(current);
		}
		let lexical: LexicalProperties | null = null;
		if (row.hasLexical) {
			const properties: Record<string, unknown> = { source: row.source ?? '' };
			for (const key of LEXICAL_KEYS) {
				const value = row[key];
				properties[key] = NUMERIC_KEYS.has(key)
					? numberOrNull(value)
					: value === undefined || value === ''
						? null
						: value;
			}
			lexical = properties as LexicalProperties;
		}
		current.tokens.push({
			position: Number(row.position),
			slot: row.slot,
			surface: row.surface,
			lexical
		});
	}
	return entries;
};

export const createDrizzleGenerationRepository = (
	db: DrizzleDb,
	config: DrizzleRepositoryConfig
): GenerationRepository & PoolRepository => {
	const { schema, slots, patterns, preset } = config;

	const detSlot = literal(slots.det);
	const nounSlot = literal(slots.noun);
	const adjSlot = literal(slots.adj);
	const verbSlot = literal(slots.verb);

	/**
	 * The `FROM … WHERE …` every drawable sentence passes: accepted, of the
	 * pattern, with a phonemic noun, inside the revision's filters. A draw and a
	 * pool read the same set, so a pool never lists a sentence no draw could
	 * serve, nor misses one a draw could.
	 */
	const drawableCandidates = (options: CandidateFilters) => {
		const spec = specFor(options.pattern, patterns);
		const detSet = detSetFor(options.detType, preset);

		const detJoin: SQL = spec.hasDet
			? sql`JOIN ${ident(schema.tokensTable)} det_token
					ON det_token.sentence_id = s.sentence_id
					AND det_token.language = s.language
					AND det_token.slot = ${detSlot}`
			: sql``;

		const adjJoin: SQL = spec.hasAdj
			? sql`JOIN ${ident(schema.tokensTable)} adj_token
					ON adj_token.sentence_id = s.sentence_id
					AND adj_token.language = s.language
					AND adj_token.slot = ${adjSlot}
				LEFT JOIN ${ident(schema.lexicalEntriesTable)} adj_le
					ON adj_le.id = adj_token.lexical_entry_id
					AND adj_le.language = adj_token.language`
			: sql``;

		const verbJoin: SQL = spec.hasVerb
			? sql`JOIN ${ident(schema.tokensTable)} verb_token
					ON verb_token.sentence_id = s.sentence_id
					AND verb_token.language = s.language
					AND verb_token.slot = ${verbSlot}
				LEFT JOIN ${ident(schema.lexicalEntriesTable)} verb_le
					ON verb_le.id = verb_token.lexical_entry_id
					AND verb_le.language = verb_token.language`
			: sql``;

		const detFilter: SQL =
			spec.hasDet && detSet && detSet.length > 0
				? sql`AND LOWER(det_token.surface) IN (${sql.join(
						detSet.map((d) => sql`${d}`),
						sql`, `
					)})`
				: sql``;

		const dedupeExpr: SQL = spec.hasAdj
			? sql`LOWER(noun_token.surface || ' ' || adj_token.surface)`
			: spec.hasVerb
				? sql`LOWER(noun_token.surface || ' ' || verb_token.surface)`
				: sql`LOWER(noun_token.surface)`;

		const genderFilter: SQL = options.gender ? sql`AND noun_le.gender = ${options.gender}` : sql``;
		const numberFilter: SQL = options.grammNumber
			? sql`AND noun_le.number = ${options.grammNumber}`
			: sql``;
		const lengthFilter = buildLengthFilter(options.length, options.lengthUnit);
		const densityFilter = buildDensityFilter(options.lexicalDensity, preset);

		const from = sql`FROM ${ident(schema.acceptanceView)} s
					JOIN ${ident(schema.tokensTable)} noun_token
						ON noun_token.sentence_id = s.sentence_id
						AND noun_token.language = s.language
						AND noun_token.slot = ${nounSlot}
					JOIN ${ident(schema.lexicalEntriesTable)} noun_le
						ON noun_le.id = noun_token.lexical_entry_id
						AND noun_le.language = noun_token.language
					${detJoin}
					${adjJoin}
					${verbJoin}`;
		const where = sql`WHERE s.accepted = TRUE
						AND s.language = ${options.language}
						AND s.pattern = ${options.pattern}
						AND noun_le.phono_ipa IS NOT NULL
						AND noun_le.phono_ipa <> ''
						${genderFilter}
						${numberFilter}
						${lengthFilter}
						${densityFilter}
						${detFilter}`;

		const ipaSelect: SQL = sql`${spec.hasAdj ? sql`, adj_le.phono_ipa AS "adjPhonoIpa"` : sql``}${
			spec.hasVerb ? sql`, verb_le.phono_ipa AS "verbPhonoIpa"` : sql``
		}`;
		const ipaPick: SQL = sql`${spec.hasAdj ? sql`, "adjPhonoIpa"` : sql``}${
			spec.hasVerb ? sql`, "verbPhonoIpa"` : sql``
		}`;

		return { from, where, dedupeExpr, ipaSelect, ipaPick };
	};

	return {
		async countAcceptedSentences() {
			const result = await db.execute<{ count: number | string | bigint }>(
				sql`SELECT count(*)::int AS count
					FROM ${ident(schema.acceptanceView)}
					WHERE accepted = TRUE`
			);
			return Number(result.rows[0]?.count ?? 0);
		},

		async findRandomAcceptedItems(options: FindAcceptedItemsOptions): Promise<AcceptedItem[]> {
			const spec = specFor(options.pattern, patterns);
			const detSet = detSetFor(options.detType, preset);

			const detJoin: SQL = spec.hasDet
				? sql`JOIN ${ident(schema.tokensTable)} det_token
						ON det_token.sentence_id = s.sentence_id
						AND det_token.language = s.language
						AND det_token.slot = ${detSlot}`
				: sql``;

			const adjJoin: SQL = spec.hasAdj
				? sql`JOIN ${ident(schema.tokensTable)} adj_token
						ON adj_token.sentence_id = s.sentence_id
						AND adj_token.language = s.language
						AND adj_token.slot = ${adjSlot}`
				: sql``;

			const detFilter: SQL =
				spec.hasDet && detSet && detSet.length > 0
					? sql`AND LOWER(det_token.surface) IN (${sql.join(
							detSet.map((d) => sql`${d}`),
							sql`, `
						)})`
					: sql``;

			const dedupeExpr: SQL = spec.hasAdj
				? sql`LOWER(noun_token.surface || ' ' || adj_token.surface)`
				: sql`LOWER(noun_token.surface)`;

			const genderFilter: SQL = options.gender
				? sql`AND noun_le.gender = ${options.gender}`
				: sql``;
			const numberFilter: SQL = options.grammNumber
				? sql`AND noun_le.number = ${options.grammNumber}`
				: sql``;
			const lengthFilter = buildLengthFilter(options.length, options.lengthUnit);
			const densityFilter = buildDensityFilter(options.lexicalDensity, preset);
			const { inner: innerOrder, outer: outerOrder } = buildSeedOrders(options.seed);

			const result = await db.execute<AcceptedItem>(sql`
				WITH candidates AS (
					SELECT DISTINCT ON (${dedupeExpr})
						s.sentence_id::int AS "sentenceId",
						s.sentence,
						s.pattern,
						${dedupeExpr} AS "dedupeKey"
					FROM ${ident(schema.acceptanceView)} s
					JOIN ${ident(schema.tokensTable)} noun_token
						ON noun_token.sentence_id = s.sentence_id
						AND noun_token.language = s.language
						AND noun_token.slot = ${nounSlot}
					LEFT JOIN ${ident(schema.lexicalEntriesTable)} noun_le
						ON noun_le.id = noun_token.lexical_entry_id
						AND noun_le.language = noun_token.language
					${detJoin}
					${adjJoin}
					WHERE s.accepted = TRUE
						AND s.pattern = ${options.pattern}
						${genderFilter}
						${numberFilter}
						${lengthFilter}
						${densityFilter}
						${detFilter}
					ORDER BY ${dedupeExpr}, ${innerOrder}
				)
				SELECT "sentenceId", sentence, pattern, "dedupeKey"
				FROM candidates
				ORDER BY ${outerOrder}
				LIMIT ${options.limit}
			`);

			return result.rows;
		},

		async findAcceptedItemsWithIpa(
			options: FindAcceptedItemsWithIpaOptions
		): Promise<AcceptedItemWithIpa[]> {
			const { from, where, dedupeExpr, ipaSelect, ipaPick } = drawableCandidates(options);
			const { inner: innerOrder, outer: outerOrder } = buildSeedOrders(options.seed);

			type Row = AcceptedItem & {
				phonoIpa: string;
				adjPhonoIpa?: string | null;
				verbPhonoIpa?: string | null;
			};

			const result = await db.execute<Row>(sql`
				WITH candidates AS (
					SELECT DISTINCT ON (${dedupeExpr})
						s.sentence_id::int AS "sentenceId",
						s.sentence,
						s.pattern,
						${dedupeExpr} AS "dedupeKey",
						noun_le.phono_ipa AS "phonoIpa"
						${ipaSelect}
					${from}
					${where}
					ORDER BY ${dedupeExpr}, ${innerOrder}
				)
				SELECT "sentenceId", sentence, pattern, "dedupeKey", "phonoIpa"${ipaPick}
				FROM candidates
				ORDER BY ${outerOrder}
				LIMIT ${options.poolSize}
			`);

			const rows = result.rows;
			return rows.map((row) => {
				const phonoIpas = [row.phonoIpa];
				if (row.adjPhonoIpa) phonoIpas.push(row.adjPhonoIpa);
				if (row.verbPhonoIpa) phonoIpas.push(row.verbPhonoIpa);
				return {
					sentenceId: row.sentenceId,
					sentence: row.sentence,
					pattern: row.pattern,
					dedupeKey: row.dedupeKey,
					phonoIpas
				};
			});
		},

		async findPoolEntries(options: FindPoolOptions): Promise<PoolEntry[]> {
			const { from, where, dedupeExpr, ipaSelect, ipaPick } = drawableCandidates(options);

			// Every variant of every pair: no `DISTINCT ON`, which is how a draw
			// picks one variant per pair and is the consumer's to reproduce.
			const result = await db.execute<PoolRow>(sql`
				WITH candidates AS (
					SELECT DISTINCT
						s.sentence_id::int AS "sentenceId",
						s.sentence,
						s.pattern,
						${dedupeExpr} AS "dedupeKey",
						noun_le.phono_ipa AS "nounPhonoIpa"
						${ipaSelect}
					${from}
					${where}
				)
				SELECT
					c."sentenceId", c.sentence, c.pattern, c."dedupeKey", c."nounPhonoIpa"${ipaPick},
					t.position, t.slot, t.surface,
					le.id IS NOT NULL AS "hasLexical",
					le.source, le.lemma, le.category, le.gender, le.number,
					le.verb_info AS "verbInfo",
					le.frequency::float8 AS frequency,
					le.frequency_ortho::float8 AS "frequencyOrtho",
					le.frequency_lemma::float8 AS "frequencyLemma",
					le.cd_ortho::float8 AS "cdOrtho",
					le.phono, le.phono_ipa AS "phonoIpa",
					le.letter_count AS "letterCount",
					le.phoneme_count AS "phonemeCount",
					le.syllable_count AS "syllableCount",
					le.syll_phono AS "syllPhono",
					le.cv_phono AS "cvPhono",
					le.old20::float8 AS old20,
					le.pld20::float8 AS pld20,
					le.vois_ortho AS "voisOrtho",
					le.vois_phono AS "voisPhono",
					le.homograph_count AS "homographCount",
					le.homophone_count AS "homophoneCount",
					le.pu_ortho AS "puOrtho",
					le.pu_phon AS "puPhon",
					le.preval::float8 AS preval,
					le.preval_count AS "prevalCount",
					le.rt_flp::float8 AS "rtFlp",
					le.zrt_flp::float8 AS "zrtFlp",
					le.err_flp::float8 AS "errFlp"
				FROM candidates c
				JOIN ${ident(schema.tokensTable)} t
					ON t.sentence_id = c."sentenceId"
					AND t.language = ${options.language}
				LEFT JOIN ${ident(schema.lexicalEntriesTable)} le
					ON le.id = t.lexical_entry_id
					AND le.language = t.language
				ORDER BY c."sentenceId", t.position
			`);

			return groupPoolRows(result.rows);
		},

		async getPhonemeDistribution(language: string): Promise<PhonemeDistribution> {
			const result = await db.execute<{ phoneme: string; frequency: number }>(
				sql`SELECT phoneme, frequency::float8 AS frequency
					FROM ${ident(schema.phonemeDistributionTable)}
					WHERE language = ${language}`
			);
			const rows = result.rows;
			const distribution: PhonemeDistribution = {};
			for (const row of rows) distribution[row.phoneme] = Number(row.frequency);
			return distribution;
		}
	};
};
