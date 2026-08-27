import { sql, type SQL } from 'drizzle-orm';
import type { PhonemeDistribution } from '../phonemes/types.js';
import type {
	AcceptedItem,
	AcceptedItemWithIpa,
	DetType,
	DrizzleRepositoryConfig,
	FindAcceptedItemsOptions,
	FindAcceptedItemsWithIpaOptions,
	GenerationRepository,
	LexicalDensity,
	PatternSpec
} from '../types.js';

type DrizzleDb = {
	// drizzle's execute signature uses its own SQL type; using `any` here keeps the
	// adapter decoupled from the host's specific drizzle-orm version.
	execute: <T extends Record<string, unknown> = Record<string, unknown>>(
		statement: any
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

export const createDrizzleGenerationRepository = (
	db: DrizzleDb,
	config: DrizzleRepositoryConfig
): GenerationRepository => {
	const { schema, slots, patterns, preset } = config;

	const detSlot = literal(slots.det);
	const nounSlot = literal(slots.noun);
	const adjSlot = literal(slots.adj);
	const verbSlot = literal(slots.verb);

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

			const adjIpaSelect: SQL = spec.hasAdj ? sql`, adj_le.phono_ipa AS "adjPhonoIpa"` : sql``;
			const verbIpaSelect: SQL = spec.hasVerb ? sql`, verb_le.phono_ipa AS "verbPhonoIpa"` : sql``;
			const adjIpaPick: SQL = spec.hasAdj ? sql`, "adjPhonoIpa"` : sql``;
			const verbIpaPick: SQL = spec.hasVerb ? sql`, "verbPhonoIpa"` : sql``;

			const genderFilter: SQL = options.gender
				? sql`AND noun_le.gender = ${options.gender}`
				: sql``;
			const numberFilter: SQL = options.grammNumber
				? sql`AND noun_le.number = ${options.grammNumber}`
				: sql``;
			const lengthFilter = buildLengthFilter(options.length, options.lengthUnit);
			const densityFilter = buildDensityFilter(options.lexicalDensity, preset);
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
						${adjIpaSelect}
						${verbIpaSelect}
					FROM ${ident(schema.acceptanceView)} s
					JOIN ${ident(schema.tokensTable)} noun_token
						ON noun_token.sentence_id = s.sentence_id
						AND noun_token.language = s.language
						AND noun_token.slot = ${nounSlot}
					JOIN ${ident(schema.lexicalEntriesTable)} noun_le
						ON noun_le.id = noun_token.lexical_entry_id
						AND noun_le.language = noun_token.language
					${detJoin}
					${adjJoin}
					${verbJoin}
					WHERE s.accepted = TRUE
						AND s.language = ${options.language}
						AND s.pattern = ${options.pattern}
						AND noun_le.phono_ipa IS NOT NULL
						AND noun_le.phono_ipa <> ''
						${genderFilter}
						${numberFilter}
						${lengthFilter}
						${densityFilter}
						${detFilter}
					ORDER BY ${dedupeExpr}, ${innerOrder}
				)
				SELECT "sentenceId", sentence, pattern, "dedupeKey", "phonoIpa"${adjIpaPick}${verbIpaPick}
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
