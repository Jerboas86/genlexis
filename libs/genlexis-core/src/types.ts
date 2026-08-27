import type { TokenizerOptions } from './phonemes/types.js';
import type { PhonemeDistribution } from './phonemes/types.js';

export type SemanticsLabel = 'natural' | 'plausible' | 'strained' | 'nonsensical';

export type LlmClassification = {
	appropriate: boolean | null;
	grammatical: boolean | null;
	semantics: SemanticsLabel | null;
};

export type SentenceSummary = {
	sentenceId: number;
	sentence: string;
	pattern: string;
	voteCount: number;
	overallAcceptableCount: number;
	overallUnacceptableCount: number;
	llm: LlmClassification | null;
};

export type HumanClassificationInput = {
	appropriate: boolean;
	grammatical: boolean | null;
	semantics: SemanticsLabel | null;
};

export type AcceptedSentence = Pick<SentenceSummary, 'sentenceId' | 'sentence' | 'pattern'>;

export type AcceptedItem = AcceptedSentence & { dedupeKey: string };

export type AcceptedItemWithIpa = AcceptedItem & { phonoIpas: string[] };

export type SupportedPattern = 'det_noun' | 'noun' | 'det_noun_adj' | 'np_verb';

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
	seed?: string;
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
	seed?: string;
};

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

export type GenerationRepository = {
	countAcceptedSentences: () => Promise<number>;
	findRandomAcceptedItems: (options: FindAcceptedItemsOptions) => Promise<AcceptedItem[]>;
	findAcceptedItemsWithIpa: (
		options: FindAcceptedItemsWithIpaOptions
	) => Promise<AcceptedItemWithIpa[]>;
	getPhonemeDistribution: (language: string) => Promise<PhonemeDistribution>;
};

export type ValidationRepository = {
	findLeastVotedValidationCandidate: (
		pattern?: SupportedPattern
	) => Promise<SentenceSummary | null>;
	recordValidation: (sentenceId: number, isCorrect: boolean) => Promise<void>;
	recordHumanClassification: (sentenceId: number, input: HumanClassificationInput) => Promise<void>;
};

export type GenlexisRepository = GenerationRepository & ValidationRepository;

export type PatternSpec = {
	hasDet: boolean;
	hasAdj: boolean;
	hasVerb: boolean;
};

export type LexicalDensityBands = {
	high: { max: number };
	medium: { min: number; max: number };
	low: { min: number };
};

export type DeterminerSet = {
	definite: readonly string[];
	indefinite: readonly string[];
};

export type LanguagePreset = {
	determiners?: DeterminerSet;
	lexicalDensity?: LexicalDensityBands;
};

export type PatternsConfig = Readonly<Record<SupportedPattern, PatternSpec>>;

export type DrizzleSchemaConfig = {
	acceptanceView: string;
	tokensTable: string;
	lexicalEntriesTable: string;
	phonemeDistributionTable: string;
	classificationsTable: string;
	humanSummariesView: string;
	latestLlmView: string;
};

export type DrizzleSlotsConfig = {
	det: string;
	noun: string;
	adj: string;
	verb: string;
};

export type DrizzleRepositoryConfig = {
	schema: DrizzleSchemaConfig;
	slots: DrizzleSlotsConfig;
	patterns: PatternsConfig;
	preset?: LanguagePreset;
};

export const SUPPORTED_PATTERNS: readonly SupportedPattern[] = [
	'noun',
	'det_noun',
	'det_noun_adj',
	'np_verb'
];

export const DEFAULT_PATTERNS: PatternsConfig = {
	noun: { hasDet: false, hasAdj: false, hasVerb: false },
	det_noun: { hasDet: true, hasAdj: false, hasVerb: false },
	det_noun_adj: { hasDet: true, hasAdj: true, hasVerb: false },
	np_verb: { hasDet: true, hasAdj: false, hasVerb: true }
};

export const parseSupportedPattern = (value: unknown): SupportedPattern | undefined =>
	typeof value === 'string' && (SUPPORTED_PATTERNS as readonly string[]).includes(value)
		? (value as SupportedPattern)
		: undefined;
