import { sql } from 'drizzle-orm';
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

export type GenlexisRepository = {
	findRandomValidationCandidate: (status: 'unreviewed' | 'needs_more_votes') => Promise<SentenceSummary | null>;
	recordValidation: (sentenceId: number, isCorrect: boolean) => Promise<void>;
	countAcceptedSentences: () => Promise<number>;
	findRandomAcceptedSentences: (limit: number) => Promise<AcceptedSentence[]>;
};

type CountRow = { count: number | string | bigint };

const normalizeCount = (value: CountRow['count']) => Number(value);

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

	async findRandomAcceptedSentences(limit) {
		const result = await db.execute<AcceptedSentence>(sql`
			SELECT
				sentence_id::int AS "sentenceId",
				sentence,
				pattern
			FROM aud.generated_sentence_validation_summaries
			WHERE validation_status = 'accepted'
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

export const generateAcceptedSentences = async (
	repository: GenlexisRepository = databaseGenlexisRepository,
	limit = 10
) => {
	const acceptedCount = await repository.countAcceptedSentences();

	if (acceptedCount < limit) {
		return { acceptedCount, sentences: [], canGenerate: false };
	}

	const sentences = await repository.findRandomAcceptedSentences(limit);

	return {
		acceptedCount,
		sentences,
		canGenerate: sentences.length === limit
	};
};
