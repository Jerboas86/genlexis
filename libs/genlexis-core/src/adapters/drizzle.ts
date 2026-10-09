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
	PoolRepository,
	SentenceToken,
	TokenRepository
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

/** The noun-level filters every query applies the same way. */
type NounFilters = Pick<
	FindAcceptedItemsOptions,
	'pattern' | 'detType' | 'gender' | 'grammNumber' | 'lengthUnit' | 'length' | 'lexicalDensity'
>;

/**
 * `JOIN` the token of one slot under `alias`, and, when asked, `LEFT JOIN` its
 * lexical entry under `<alias>_le`.
 */
const tokenJoin = (
	config: DrizzleRepositoryConfig,
	alias: 'det' | 'adj' | 'verb',
	slot: string,
	withLexical: boolean
): SQL => {
	const token = ident(`${alias}_token`);
	const join = sql`JOIN ${ident(config.schema.tokensTable)} ${token}
					ON ${token}.sentence_id = s.sentence_id
					AND ${token}.language = s.language
					AND ${token}.slot = ${literal(slot)}`;
	if (!withLexical) return join;
	const entry = ident(`${alias}_le`);
	return sql`${join}
				LEFT JOIN ${ident(config.schema.lexicalEntriesTable)} ${entry}
					ON ${entry}.id = ${token}.lexical_entry_id
					AND ${entry}.language = ${token}.language`;
};

/** The determiner restriction of a `detType`, or nothing. */
const detFilterFor = (spec: PatternSpec, detSet: readonly string[] | null): SQL =>
	spec.hasDet && detSet && detSet.length > 0
		? sql`AND LOWER(det_token.surface) IN (${sql.join(
				detSet.map((d) => sql`${d}`),
				sql`, `
			)})`
		: sql``;

/** Gender, number, length, density and determiner: every filter on the noun phrase. */
const nounPhraseFilters = (
	options: NounFilters,
	spec: PatternSpec,
	preset: DrizzleRepositoryConfig['preset']
): SQL => {
	const gender = options.gender ? sql`AND noun_le.gender = ${options.gender}` : sql``;
	const number = options.grammNumber ? sql`AND noun_le.number = ${options.grammNumber}` : sql``;
	return sql`${gender}
						${number}
						${buildLengthFilter(options.length, options.lengthUnit)}
						${buildDensityFilter(options.lexicalDensity, preset)}
						${detFilterFor(spec, detSetFor(options.detType, preset))}`;
};

/** What a pair is: the noun with its adjective or, when `withVerb`, its verb. */
const dedupeFor = (spec: PatternSpec, withVerb: boolean): SQL => {
	if (spec.hasAdj) return sql`LOWER(noun_token.surface || ' ' || adj_token.surface)`;
	if (spec.hasVerb && withVerb) return sql`LOWER(noun_token.surface || ' ' || verb_token.surface)`;
	return sql`LOWER(noun_token.surface)`;
};

/** The accepted sentences and their noun token, the base of every query. */
const acceptedWithNoun = (config: DrizzleRepositoryConfig, nounEntry: 'JOIN' | 'LEFT JOIN') =>
	sql`FROM ${ident(config.schema.acceptanceView)} s
					JOIN ${ident(config.schema.tokensTable)} noun_token
						ON noun_token.sentence_id = s.sentence_id
						AND noun_token.language = s.language
						AND noun_token.slot = ${literal(config.slots.noun)}
					${sql.raw(nounEntry)} ${ident(config.schema.lexicalEntriesTable)} noun_le
						ON noun_le.id = noun_token.lexical_entry_id
						AND noun_le.language = noun_token.language`;

/**
 * The `FROM … WHERE …` every drawable sentence passes: accepted, of the
 * pattern, with a phonemic noun, inside the revision's filters. A draw and a
 * pool read the same set, so a pool never lists a sentence no draw could
 * serve, nor misses one a draw could.
 */
const drawableCandidates = (config: DrizzleRepositoryConfig, options: CandidateFilters) => {
	const spec = specFor(options.pattern, config.patterns);
	const from = sql`${acceptedWithNoun(config, 'JOIN')}
					${spec.hasDet ? tokenJoin(config, 'det', config.slots.det, false) : sql``}
					${spec.hasAdj ? tokenJoin(config, 'adj', config.slots.adj, true) : sql``}
					${spec.hasVerb ? tokenJoin(config, 'verb', config.slots.verb, true) : sql``}`;
	const where = sql`WHERE s.accepted = TRUE
						AND s.language = ${options.language}
						AND s.pattern = ${options.pattern}
						AND noun_le.phono_ipa IS NOT NULL
						AND noun_le.phono_ipa <> ''
						${nounPhraseFilters(options, spec, config.preset)}`;
	const ipaSelect = sql`${spec.hasAdj ? sql`, adj_le.phono_ipa AS "adjPhonoIpa"` : sql``}${
		spec.hasVerb ? sql`, verb_le.phono_ipa AS "verbPhonoIpa"` : sql``
	}`;
	const ipaPick = sql`${spec.hasAdj ? sql`, "adjPhonoIpa"` : sql``}${
		spec.hasVerb ? sql`, "verbPhonoIpa"` : sql``
	}`;
	return { from, where, dedupeExpr: dedupeFor(spec, true), ipaSelect, ipaPick };
};

/**
 * The candidates of the unbalanced selection: no transcription requirement,
 * optional language filtering, and pairs keyed on the noun unless the pattern has an
 * adjective. Older than the drawable set, and kept as it was.
 */
const randomCandidates = (config: DrizzleRepositoryConfig, options: FindAcceptedItemsOptions) => {
	const spec = specFor(options.pattern, config.patterns);
	const from = sql`${acceptedWithNoun(config, 'LEFT JOIN')}
					${spec.hasDet ? tokenJoin(config, 'det', config.slots.det, false) : sql``}
					${spec.hasAdj ? tokenJoin(config, 'adj', config.slots.adj, false) : sql``}`;
	const where = sql`WHERE s.accepted = TRUE
						AND s.pattern = ${options.pattern}
						${options.language ? sql`AND s.language = ${options.language}` : sql``}
						${nounPhraseFilters(options, spec, config.preset)}`;
	return { from, where, dedupeExpr: dedupeFor(spec, false) };
};

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

/** The lexical columns read as text. */
const TEXT_KEYS = [
	'lemma',
	'category',
	'gender',
	'number',
	'verbInfo',
	'phono',
	'phonoIpa',
	'syllPhono',
	'cvPhono'
] as const satisfies readonly (keyof LexicalProperties)[];

/** The lexical columns read as numbers. */
const NUMERIC_KEYS = [
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
] as const satisfies readonly (keyof LexicalProperties)[];

/** A numeric column read back as a number, whatever the driver handed over. */
const numberOrNull = (value: unknown): number | null =>
	value === null || value === undefined ? null : Number(value);

/** A text column, with an empty value read as no value. */
const textOrNull = (value: unknown): string | null =>
	value === null || value === undefined || value === '' ? null : String(value);

/** The lexical entry of a token row, or `null` when the token has none. */
export const lexicalOf = (row: PoolRow): LexicalProperties | null => {
	if (!row.hasLexical) return null;
	const properties: Record<string, unknown> = { source: row.source ?? '' };
	for (const key of TEXT_KEYS) properties[key] = textOrNull(row[key]);
	for (const key of NUMERIC_KEYS) properties[key] = numberOrNull(row[key]);
	return properties as LexicalProperties;
};

/** A pool entry from the first token row of its sentence, tokens still to come. */
const entryOf = (row: PoolRow): PoolEntry => ({
	sentenceId: row.sentenceId,
	sentence: row.sentence,
	pattern: row.pattern,
	dedupeKey: row.dedupeKey,
	phonoIpas: [row.nounPhonoIpa, row.adjPhonoIpa, row.verbPhonoIpa].filter((ipa): ipa is string =>
		Boolean(ipa)
	),
	tokens: []
});

/** Token rows, ordered by sentence then position, grouped into pool entries. */
export const groupPoolRows = (rows: readonly PoolRow[]): PoolEntry[] => {
	const entries: PoolEntry[] = [];
	for (const row of rows) {
		if (entries.at(-1)?.sentenceId !== row.sentenceId) entries.push(entryOf(row));
		entries.at(-1)!.tokens.push({
			position: Number(row.position),
			slot: row.slot,
			surface: row.surface,
			lexical: lexicalOf(row)
		});
	}
	return entries;
};

export const createDrizzleGenerationRepository = (
	db: DrizzleDb,
	config: DrizzleRepositoryConfig
): GenerationRepository & PoolRepository & TokenRepository => {
	const { schema } = config;

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
			const { from, where, dedupeExpr } = randomCandidates(config, options);
			const { inner: innerOrder, outer: outerOrder } = buildSeedOrders(options.seed);

			const result = await db.execute<AcceptedItem>(sql`
				WITH candidates AS (
					SELECT DISTINCT ON (${dedupeExpr})
						s.sentence_id::int AS "sentenceId",
						s.sentence,
						s.pattern,
						${dedupeExpr} AS "dedupeKey"
					${from}
					${where}
					ORDER BY ${dedupeExpr}, ${innerOrder}, s.sentence_id
				)
				SELECT "sentenceId", sentence, pattern, "dedupeKey"
				FROM candidates
				ORDER BY ${outerOrder}, "sentenceId"
				LIMIT ${options.limit}
			`);

			return result.rows;
		},

		async findAcceptedItemsWithIpa(
			options: FindAcceptedItemsWithIpaOptions
		): Promise<AcceptedItemWithIpa[]> {
			const { from, where, dedupeExpr, ipaSelect, ipaPick } = drawableCandidates(config, options);
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
					ORDER BY ${dedupeExpr}, ${innerOrder}, s.sentence_id
				)
				SELECT "sentenceId", sentence, pattern, "dedupeKey", "phonoIpa"${ipaPick}
				FROM candidates
				ORDER BY ${outerOrder}, "sentenceId"
				LIMIT ${options.poolSize}
			`);

			return result.rows.map((row) => ({
				sentenceId: row.sentenceId,
				sentence: row.sentence,
				pattern: row.pattern,
				dedupeKey: row.dedupeKey,
				phonoIpas: [row.phonoIpa, row.adjPhonoIpa, row.verbPhonoIpa].filter((ipa): ipa is string =>
					Boolean(ipa)
				)
			}));
		},

		async findPoolEntries(options: FindPoolOptions): Promise<PoolEntry[]> {
			const { from, where, dedupeExpr, ipaSelect, ipaPick } = drawableCandidates(config, options);

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

		async findSentenceTokens(
			language: string,
			sentenceIds: readonly number[]
		): Promise<Map<number, SentenceToken[]>> {
			const tokens = new Map<number, SentenceToken[]>();
			if (sentenceIds.length === 0) return tokens;
			const result = await db.execute<SentenceToken & { sentenceId: number }>(sql`
				SELECT t.sentence_id::int AS "sentenceId", t.position, t.slot, t.surface
				FROM ${ident(schema.tokensTable)} t
				WHERE t.language = ${language}
					AND t.sentence_id IN (${sql.join(
						sentenceIds.map((id) => sql`${id}`),
						sql`, `
					)})
				ORDER BY t.sentence_id, t.position
			`);
			for (const { sentenceId, position, slot, surface } of result.rows) {
				const list = tokens.get(sentenceId) ?? [];
				list.push({ position: Number(position), slot, surface });
				tokens.set(sentenceId, list);
			}
			return tokens;
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
