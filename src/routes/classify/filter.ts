export const ANY_PATTERN = 'any' as const;
export type PatternFilter = typeof ANY_PATTERN | 'det_noun' | 'det_noun_adj';
