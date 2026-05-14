import { sql, type SQL } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { generatedSentenceValidations } from '$lib/server/db/schema';
import { selectBalancedLists } from './phonemes/balancer';
import { tokensToCounts } from './phonemes/distribution';
import { createIpaTokenizer } from './phonemes/tokenizer';
import type {
	PhonemeCounts,
	PhonemeDistribution,
	PooledWord,
	TokenizerOptions
} from './phonemes/types';

export type ValidationStatus = 'unreviewed' | 'needs_more_votes' | 'accepted' | 'rejected';

export type SentenceSummary = {
	sentenceId: number;
	sentence: string;
	pattern: string;
	voteCount: number;
	correctCount: number;
	incorrectCount: number;
	validationStatus: ValidationStatus;
};

export type AcceptedSentence = Pick<SentenceSummary, 'sentenceId' | 'sentence' | 'pattern'>;

export type AcceptedItem = AcceptedSentence & { dedupeKey: string };

export type SupportedPattern = 'det_noun' | 'noun';
export type DetType = 'definite' | 'indefinite';
export type Gender = 'm' | 'f';
export type GrammNumber = 's' | 'p';
export type LengthUnit = 'syllables' | 'phonemes';
export type LexicalDensity = 'high' | 'medium' | 'low';

export type GenerateOptions = {
	pattern: SupportedPattern;
	detType?: DetType;
	gender?: Gender;
	grammNumber?: GrammNumber;
	lengthUnit?: LengthUnit;
	length?: number;
	lexicalDensity?: LexicalDensity;
	listCount: number;
	itemsPerList: number;
};

export type GenerateResult = {
	lists: AcceptedSentence[][];
	requestedLists: number;
	requestedItemsPerList: number;
	totalItems: number;
};

export type FindAcceptedItemsOptions = {
	pattern: SupportedPattern;
	detType?: DetType;
	gender?: Gender;
	grammNumber?: GrammNumber;
	lengthUnit?: LengthUnit;
	length?: number;
	lexicalDensity?: LexicalDensity;
	limit: number;
};

export type AcceptedItemWithIpa = AcceptedItem & { phonoIpa: string };

export type FindAcceptedItemsWithIpaOptions = Omit<FindAcceptedItemsOptions, 'limit'> & {
	language: string;
	poolSize: number;
};

export type GenerateBalancedOptions = GenerateOptions & {
	language: string;
	poolMultiplier?: number;
	allowReuseAcrossLists?: boolean;
	refinementPasses?: number;
	tokenizerOptions?: TokenizerOptions;
};

export type BalancedGenerateResult = GenerateResult & {
	scores: number[];
	aggregateScore: number;
	poolSize: number;
};

export type GenlexisRepository = {
	findLeastVotedValidationCandidate: () => Promise<SentenceSummary | null>;
	recordValidation: (sentenceId: number, isCorrect: boolean) => Promise<void>;
	countAcceptedSentences: () => Promise<number>;
	findRandomAcceptedItems: (options: FindAcceptedItemsOptions) => Promise<AcceptedItem[]>;
	findAcceptedItemsWithIpa: (
		options: FindAcceptedItemsWithIpaOptions
	) => Promise<AcceptedItemWithIpa[]>;
	getPhonemeDistribution: (language: string) => Promise<PhonemeDistribution>;
};

type CountRow = { count: number | string | bigint };

const normalizeCount = (value: CountRow['count']) => Number(value);

const DEFINITE_DETS = ['le', 'la', "l'", 'les'];
const INDEFINITE_DETS = ['un', 'une', 'des'];

const detSetFor = (type: DetType | undefined) =>
	type === 'definite' ? DEFINITE_DETS : type === 'indefinite' ? INDEFINITE_DETS : null;

export const databaseGenlexisRepository: GenlexisRepository = {
	async findLeastVotedValidationCandidate() {
		const result = await db.execute<SentenceSummary>(sql`
			SELECT
				sentence_id::int AS "sentenceId",
				sentence,
				pattern,
				vote_count::int AS "voteCount",
				correct_count::int AS "correctCount",
				incorrect_count::int AS "incorrectCount",
				validation_status AS "validationStatus"
			FROM aud.generated_sentence_validation_summaries
			ORDER BY vote_count ASC, random()
			LIMIT 1
		`);

		return result.rows[0] ?? null;
	},

	async recordValidation(sentenceId, isCorrect) {
		await db.insert(generatedSentenceValidations).values({ sentenceId, isCorrect });
	},

	async countAcceptedSentences() {
		const result = await db.execute<CountRow>(sql`
			SELECT count(*)::int AS count
			FROM aud.generated_sentence_validation_summaries
			WHERE validation_status = 'accepted'
		`);

		return normalizeCount(result.rows[0]?.count ?? 0);
	},

	async findRandomAcceptedItems({
		pattern,
		detType,
		gender,
		grammNumber,
		lengthUnit,
		length,
		lexicalDensity,
		limit
	}) {
		const detJoin: SQL =
			pattern === 'det_noun'
				? sql`JOIN aud.generated_sentence_tokens det_token
					ON det_token.sentence_id = s.sentence_id
					AND det_token.language = s.language
					AND det_token.slot = 'det'`
				: sql``;

		const detSet = detSetFor(detType);
		const detFilter: SQL =
			pattern === 'det_noun' && detSet
				? sql`AND LOWER(det_token.surface) IN (${sql.join(
						detSet.map((d) => sql`${d}`),
						sql`, `
					)})`
				: sql``;

		const genderFilter: SQL = gender ? sql`AND noun_le.gender = ${gender}` : sql``;
		const numberFilter: SQL = grammNumber ? sql`AND noun_le.number = ${grammNumber}` : sql``;
		const lengthFilter: SQL =
			length !== undefined
				? lengthUnit === 'phonemes'
					? sql`AND noun_le.phoneme_count = ${length}`
					: sql`AND noun_le.syllable_count = ${length}`
				: sql``;

		const lexicalDensityFilter: SQL =
			lexicalDensity === 'high'
				? sql`AND noun_le.pld20 IS NOT NULL AND noun_le.pld20 < 2.0`
				: lexicalDensity === 'medium'
					? sql`AND noun_le.pld20 IS NOT NULL AND noun_le.pld20 >= 2.0 AND noun_le.pld20 <= 3.2`
					: lexicalDensity === 'low'
						? sql`AND noun_le.pld20 IS NOT NULL AND noun_le.pld20 > 3.2`
						: sql``;

		const result = await db.execute<AcceptedItem>(sql`
			WITH candidates AS (
				SELECT DISTINCT ON (LOWER(noun_token.surface))
					s.sentence_id::int AS "sentenceId",
					s.sentence,
					s.pattern,
					LOWER(noun_token.surface) AS "dedupeKey"
				FROM aud.generated_sentence_validation_summaries s
				JOIN aud.generated_sentence_tokens noun_token
					ON noun_token.sentence_id = s.sentence_id
					AND noun_token.language = s.language
					AND noun_token.slot = 'noun'
				LEFT JOIN aud.lexical_entries noun_le
					ON noun_le.id = noun_token.lexical_entry_id
					AND noun_le.language = noun_token.language
				${detJoin}
				WHERE s.validation_status = 'accepted'
					AND s.pattern = ${pattern}
					${genderFilter}
					${numberFilter}
					${lengthFilter}
					${lexicalDensityFilter}
					${detFilter}
				ORDER BY LOWER(noun_token.surface), random()
			)
			SELECT "sentenceId", sentence, pattern, "dedupeKey"
			FROM candidates
			ORDER BY random()
			LIMIT ${limit}
		`);

		return result.rows;
	},

	async findAcceptedItemsWithIpa({
		language,
		pattern,
		detType,
		gender,
		grammNumber,
		lengthUnit,
		length,
		lexicalDensity,
		poolSize
	}) {
		const detJoin: SQL =
			pattern === 'det_noun'
				? sql`JOIN aud.generated_sentence_tokens det_token
					ON det_token.sentence_id = s.sentence_id
					AND det_token.language = s.language
					AND det_token.slot = 'det'`
				: sql``;

		const detSet = detSetFor(detType);
		const detFilter: SQL =
			pattern === 'det_noun' && detSet
				? sql`AND LOWER(det_token.surface) IN (${sql.join(
						detSet.map((d) => sql`${d}`),
						sql`, `
					)})`
				: sql``;

		const genderFilter: SQL = gender ? sql`AND noun_le.gender = ${gender}` : sql``;
		const numberFilter: SQL = grammNumber ? sql`AND noun_le.number = ${grammNumber}` : sql``;
		const lengthFilter: SQL =
			length !== undefined
				? lengthUnit === 'phonemes'
					? sql`AND noun_le.phoneme_count = ${length}`
					: sql`AND noun_le.syllable_count = ${length}`
				: sql``;

		const lexicalDensityFilter: SQL =
			lexicalDensity === 'high'
				? sql`AND noun_le.pld20 IS NOT NULL AND noun_le.pld20 < 2.0`
				: lexicalDensity === 'medium'
					? sql`AND noun_le.pld20 IS NOT NULL AND noun_le.pld20 >= 2.0 AND noun_le.pld20 <= 3.2`
					: lexicalDensity === 'low'
						? sql`AND noun_le.pld20 IS NOT NULL AND noun_le.pld20 > 3.2`
						: sql``;

		const result = await db.execute<AcceptedItemWithIpa>(sql`
			WITH candidates AS (
				SELECT DISTINCT ON (LOWER(noun_token.surface))
					s.sentence_id::int AS "sentenceId",
					s.sentence,
					s.pattern,
					LOWER(noun_token.surface) AS "dedupeKey",
					noun_le.phono_ipa AS "phonoIpa"
				FROM aud.generated_sentence_validation_summaries s
				JOIN aud.generated_sentence_tokens noun_token
					ON noun_token.sentence_id = s.sentence_id
					AND noun_token.language = s.language
					AND noun_token.slot = 'noun'
				JOIN aud.lexical_entries noun_le
					ON noun_le.id = noun_token.lexical_entry_id
					AND noun_le.language = noun_token.language
				${detJoin}
				WHERE s.validation_status = 'accepted'
					AND s.language = ${language}
					AND s.pattern = ${pattern}
					AND noun_le.phono_ipa IS NOT NULL
					AND noun_le.phono_ipa <> ''
					${genderFilter}
					${numberFilter}
					${lengthFilter}
					${lexicalDensityFilter}
					${detFilter}
				ORDER BY LOWER(noun_token.surface), random()
			)
			SELECT "sentenceId", sentence, pattern, "dedupeKey", "phonoIpa"
			FROM candidates
			ORDER BY random()
			LIMIT ${poolSize}
		`);

		return result.rows;
	},

	async getPhonemeDistribution(language) {
		const result = await db.execute<{ phoneme: string; frequency: number }>(sql`
			SELECT phoneme, frequency::float8 AS frequency
			FROM aud.language_phoneme_distributions
			WHERE language = ${language}
		`);

		const distribution: PhonemeDistribution = {};
		for (const row of result.rows) distribution[row.phoneme] = Number(row.frequency);
		return distribution;
	}
};

export const getValidationCandidate = (
	repository: GenlexisRepository = databaseGenlexisRepository
) => repository.findLeastVotedValidationCandidate();

export const recordValidation = async (
	sentenceId: number,
	isCorrect: boolean,
	repository: GenlexisRepository = databaseGenlexisRepository
) => {
	await repository.recordValidation(sentenceId, isCorrect);
};

export const getAcceptedSentenceCount = (
	repository: GenlexisRepository = databaseGenlexisRepository
) => repository.countAcceptedSentences();

const stripDedupeKey = ({ sentenceId, sentence, pattern }: AcceptedItem): AcceptedSentence => ({
	sentenceId,
	sentence,
	pattern
});

export const generateAcceptedSentences = async (
	options: GenerateOptions,
	repository: GenlexisRepository = databaseGenlexisRepository
): Promise<GenerateResult> => {
	const listCount = Math.max(1, Math.min(5, Math.floor(options.listCount)));
	const itemsPerList = Math.max(1, Math.floor(options.itemsPerList));
	const target = listCount * itemsPerList;

	const items = await repository.findRandomAcceptedItems({
		pattern: options.pattern,
		detType: options.detType,
		gender: options.gender,
		grammNumber: options.grammNumber,
		lengthUnit: options.lengthUnit,
		length: options.length,
		lexicalDensity: options.lexicalDensity,
		limit: target
	});

	const seen = new Set<string>();
	const unique: AcceptedItem[] = [];
	for (const item of items) {
		if (seen.has(item.dedupeKey)) continue;
		seen.add(item.dedupeKey);
		unique.push(item);
		if (unique.length >= target) break;
	}

	const lists: AcceptedSentence[][] = Array.from({ length: listCount }, () => []);
	unique.forEach((item, index) => {
		lists[index % listCount].push(stripDedupeKey(item));
	});

	return {
		lists,
		requestedLists: listCount,
		requestedItemsPerList: itemsPerList,
		totalItems: unique.length
	};
};

const DEFAULT_POOL_MULTIPLIER = 10;
const MIN_POOL_HEADROOM = 100;

export const generateBalancedAcceptedSentences = async (
	options: GenerateBalancedOptions,
	repository: GenlexisRepository = databaseGenlexisRepository
): Promise<BalancedGenerateResult> => {
	const listCount = Math.max(1, Math.min(5, Math.floor(options.listCount)));
	const itemsPerList = Math.max(1, Math.floor(options.itemsPerList));
	const target = await repository.getPhonemeDistribution(options.language);

	if (Object.keys(target).length === 0) {
		throw new Error(`No phoneme distribution found for language "${options.language}"`);
	}

	const totalRequested = listCount * itemsPerList;
	const poolMultiplier = options.poolMultiplier ?? DEFAULT_POOL_MULTIPLIER;
	const poolSize = Math.max(totalRequested * poolMultiplier, totalRequested + MIN_POOL_HEADROOM);

	const items = await repository.findAcceptedItemsWithIpa({
		language: options.language,
		pattern: options.pattern,
		detType: options.detType,
		gender: options.gender,
		grammNumber: options.grammNumber,
		lengthUnit: options.lengthUnit,
		length: options.length,
		lexicalDensity: options.lexicalDensity,
		poolSize
	});

	const seen = new Set<string>();
	const unique: AcceptedItemWithIpa[] = [];
	for (const item of items) {
		if (seen.has(item.dedupeKey)) continue;
		seen.add(item.dedupeKey);
		unique.push(item);
	}

	const tokenizer = createIpaTokenizer(Object.keys(target), options.tokenizerOptions);
	const itemsById = new Map<number, AcceptedItemWithIpa>();
	const pool: PooledWord[] = [];
	for (const item of unique) {
		const { tokens } = tokenizer.tokenize(item.phonoIpa);
		const counts: PhonemeCounts = tokensToCounts(tokens);
		if (Object.keys(counts).length === 0) continue;
		itemsById.set(item.sentenceId, item);
		pool.push({ id: item.sentenceId, counts });
	}

	const balanced = selectBalancedLists(pool, target, listCount, itemsPerList, {
		allowReuse: options.allowReuseAcrossLists ?? false,
		refinementPasses: options.refinementPasses
	});

	const lists: AcceptedSentence[][] = balanced.map((list) =>
		list.items.map((picked) => {
			const item = itemsById.get(picked.id as number);
			if (!item) throw new Error('Balancer returned a word not present in the pool');
			return stripDedupeKey(item);
		})
	);

	const scores = balanced.map((list) => list.score);
	const totalItems = lists.reduce((acc, list) => acc + list.length, 0);
	const aggregateScore =
		scores.length === 0 ? 0 : scores.reduce((acc, score) => acc + score, 0) / scores.length;

	return {
		lists,
		requestedLists: listCount,
		requestedItemsPerList: itemsPerList,
		totalItems,
		scores,
		aggregateScore,
		poolSize: pool.length
	};
};
