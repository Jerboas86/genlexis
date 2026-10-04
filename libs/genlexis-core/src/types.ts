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
	/**
	 * Sentences the balancer may not pick.
	 *
	 * Rotation needs this at the pool rather than after the fact: the balancer
	 * converges on the same strong candidates, so generating a list and then
	 * discarding it because one item is excluded fails over and over. Removing
	 * them first lets a single attempt succeed.
	 */
	excludedSentenceIds?: readonly number[];
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

/**
 * The lexical properties of one word, as the lexicon publishes them.
 *
 * Names follow the lexicon's columns rather than an interpretation of them: a
 * consumer that models difficulty from these chooses its own reading, and a name
 * here that claimed one would be a second, unreviewed definition.
 */
export type LexicalProperties = {
	/** The lexicon the entry comes from, e.g. `lexique4`. */
	source: string;
	lemma: string | null;
	category: string | null;
	gender: string | null;
	number: string | null;
	verbInfo: string | null;
	frequency: number | null;
	frequencyOrtho: number | null;
	frequencyLemma: number | null;
	cdOrtho: number | null;
	/** The lexicon's own phonemic notation, one symbol per phoneme. */
	phono: string | null;
	phonoIpa: string | null;
	letterCount: number | null;
	phonemeCount: number | null;
	syllableCount: number | null;
	syllPhono: string | null;
	cvPhono: string | null;
	old20: number | null;
	pld20: number | null;
	voisOrtho: number | null;
	voisPhono: number | null;
	homographCount: number | null;
	homophoneCount: number | null;
	puOrtho: number | null;
	puPhon: number | null;
	preval: number | null;
	prevalCount: number | null;
	rtFlp: number | null;
	zrtFlp: number | null;
	errFlp: number | null;
};

/** One token of a pooled sentence, with its lexical entry when it has one. */
export type PoolToken = {
	/** 1-based position in the sentence. */
	position: number;
	slot: string;
	surface: string;
	/** `null` for a token the corpus never linked to the lexicon, a determiner for instance. */
	lexical: LexicalProperties | null;
};

/**
 * One sentence of the accepted pool, every token described. `phonoIpas` are the
 * transcriptions a draw tokenises — the noun's, then the adjective's and the
 * verb's when the pattern has them.
 */
export type PoolEntry = AcceptedItemWithIpa & {
	tokens: PoolToken[];
};

/**
 * What a pool is filtered by: the same fixed parameters a draw is, without the
 * seed, the size or the exclusions, which select *from* the pool.
 */
export type FindPoolOptions = Omit<FindAcceptedItemsWithIpaOptions, 'poolSize' | 'seed'>;

/** One token of a sentence, without its lexical entry: what a draw's item carries. */
export type SentenceToken = Omit<PoolToken, 'lexical'>;

/**
 * Reads the tokens of given sentences, in position order: the role of every
 * word, which a consumer needs to score some words and not others.
 */
export type TokenRepository = {
	findSentenceTokens: (
		language: string,
		sentenceIds: readonly number[]
	) => Promise<Map<number, SentenceToken[]>>;
};

/**
 * Reads a whole accepted pool, every variant of every pair, for consumers that
 * study the material rather than draw from it.
 */
export type PoolRepository = {
	findPoolEntries: (options: FindPoolOptions) => Promise<PoolEntry[]>;
};

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
