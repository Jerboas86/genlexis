import { sql, type SQL } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { generatedSentenceValidations } from '$lib/server/db/schema';

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

export type GenerateOptions = {
	pattern: SupportedPattern;
	detType?: DetType;
	gender?: Gender;
	grammNumber?: GrammNumber;
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
	limit: number;
};

export type GenlexisRepository = {
	findRandomValidationCandidate: (
		status: 'unreviewed' | 'needs_more_votes'
	) => Promise<SentenceSummary | null>;
	recordValidation: (sentenceId: number, isCorrect: boolean) => Promise<void>;
	countAcceptedSentences: () => Promise<number>;
	findRandomAcceptedItems: (options: FindAcceptedItemsOptions) => Promise<AcceptedItem[]>;
};

type CountRow = { count: number | string | bigint };

const normalizeCount = (value: CountRow['count']) => Number(value);

const DEFINITE_DETS = ['le', 'la', "l'", 'les'];
const INDEFINITE_DETS = ['un', 'une', 'des'];

const detSetFor = (type: DetType | undefined) =>
	type === 'definite' ? DEFINITE_DETS : type === 'indefinite' ? INDEFINITE_DETS : null;

export const databaseGenlexisRepository: GenlexisRepository = {
	async findRandomValidationCandidate(status) {
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
			WHERE validation_status = ${status}
			ORDER BY random()
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

	async findRandomAcceptedItems({ pattern, detType, gender, grammNumber, limit }) {
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
					${detFilter}
				ORDER BY LOWER(noun_token.surface), random()
			)
			SELECT "sentenceId", sentence, pattern, "dedupeKey"
			FROM candidates
			ORDER BY random()
			LIMIT ${limit}
		`);

		return result.rows;
	}
};

export const getValidationCandidate = async (
	repository: GenlexisRepository = databaseGenlexisRepository
) =>
	(await repository.findRandomValidationCandidate('unreviewed')) ??
	(await repository.findRandomValidationCandidate('needs_more_votes'));

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
