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
	/**
	 * Makes the selection vary between calls that share a pool.
	 *
	 * Without it the greedy pass starts empty and takes the global argmin at every
	 * step, so it returns the same list for any ordering of the same pool — and a
	 * consumer rotating between draws would be handed the same items forever. The
	 * seed chooses the starting item instead; refinement recovers the quality.
	 */
	seed?: string;
};
