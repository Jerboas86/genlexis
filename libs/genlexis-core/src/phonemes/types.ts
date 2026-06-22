export type PhonemeDistribution = Record<string, number>;

export type PhonemeCounts = Record<string, number>;

export type TokenizerOptions = {
	stripStress?: boolean;
	stripLength?: boolean;
	stripDiacritics?: boolean;
};

export type TokenizationResult = {
	tokens: string[];
	unknown: string[];
};

export type IpaTokenizer = {
	tokenize: (ipa: string) => TokenizationResult;
};

export type PooledWord = {
	id: string | number;
	counts: PhonemeCounts;
};

export type ListResult = {
	items: PooledWord[];
	score: number;
};

export type BalancerOptions = {
	allowReuse?: boolean;
	refinementPasses?: number;
};
