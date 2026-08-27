import { describe, expect, it } from 'vitest';
import {
	DET_TYPES,
	MAX_ITEMS_PER_LIST,
	MAX_LISTS,
	MAX_NOUN_LENGTH,
	MAX_SEED_LENGTH,
	parseBalancedParams,
	parseEnum,
	parseGenerationParams,
	parseInteger,
	parseLanguage,
	parseOptionalInteger,
	parseSeed,
	patternHasDet,
	SUPPORTED_PATTERNS
} from './params';

describe('patternHasDet', () => {
	it('is true for every pattern with a determiner slot', () => {
		expect(patternHasDet('det_noun')).toBe(true);
		expect(patternHasDet('det_noun_adj')).toBe(true);
		expect(patternHasDet('np_verb')).toBe(true);
	});

	it('is false for the bare noun, which has no determiner to filter', () => {
		expect(patternHasDet('noun')).toBe(false);
	});

	it('covers every supported pattern, so a new one cannot be forgotten here', () => {
		for (const pattern of SUPPORTED_PATTERNS) {
			expect(typeof patternHasDet(pattern)).toBe('boolean');
		}
	});
});

describe('parseInteger', () => {
	it('accepts an integer inside the range', () => {
		expect(parseInteger('3', 1, 5, 1)).toBe(3);
		expect(parseInteger(3, 1, 5, 1)).toBe(3);
	});

	it('clamps rather than refusing, because a count is a request to satisfy', () => {
		expect(parseInteger('9', 1, 5, 1)).toBe(5);
		expect(parseInteger('0', 1, 5, 2)).toBe(1);
		expect(parseInteger('-7', 1, 5, 2)).toBe(1);
	});

	it('holds at both bounds exactly', () => {
		expect(parseInteger('1', 1, 5, 3)).toBe(1);
		expect(parseInteger('5', 1, 5, 3)).toBe(5);
	});

	it('falls back when the value is not an integer at all', () => {
		// A non-integer means the field was never filled in properly, which is a
		// different thing from a number that is merely too large.
		for (const value of ['', 'abc', '2.5', null, undefined, {}, [], NaN, Infinity]) {
			expect(parseInteger(value, 1, 5, 4)).toBe(4);
		}
	});

	it('reads a numeric string and a number identically', () => {
		expect(parseInteger('2', 1, 5, 1)).toBe(parseInteger(2, 1, 5, 1));
	});
});

describe('parseOptionalInteger', () => {
	it('accepts an integer inside the range', () => {
		expect(parseOptionalInteger('7', 1, 20)).toBe(7);
	});

	it('treats absence and the empty string as unfiltered', () => {
		expect(parseOptionalInteger(undefined, 1, 20)).toBeUndefined();
		expect(parseOptionalInteger(null, 1, 20)).toBeUndefined();
		expect(parseOptionalInteger('', 1, 20)).toBeUndefined();
	});

	it('drops an out-of-range filter instead of clamping it', () => {
		// Clamping would answer a question nobody asked: "nouns of 40 phonemes"
		// silently becoming "nouns of 20" returns a list that looks filtered and
		// is not the one requested.
		expect(parseOptionalInteger('40', 1, 20)).toBeUndefined();
		expect(parseOptionalInteger('0', 1, 20)).toBeUndefined();
	});

	it('holds at both bounds exactly', () => {
		expect(parseOptionalInteger('1', 1, 20)).toBe(1);
		expect(parseOptionalInteger('20', 1, 20)).toBe(20);
	});

	it('drops a non-integer', () => {
		for (const value of ['abc', '3.5', {}, true]) {
			expect(parseOptionalInteger(value, 1, 20)).toBeUndefined();
		}
	});
});

describe('parseEnum', () => {
	it('accepts a member of the closed set', () => {
		expect(parseEnum('definite', DET_TYPES)).toBe('definite');
	});

	it('treats the empty string as absence rather than an invalid value', () => {
		expect(parseEnum('', DET_TYPES)).toBeUndefined();
	});

	it('refuses anything outside the set, including near-misses', () => {
		for (const value of ['Definite', 'definite ', 'indef', 0, null, undefined, {}]) {
			expect(parseEnum(value, DET_TYPES)).toBeUndefined();
		}
	});
});

describe('parseLanguage', () => {
	it('accepts a well-formed tag in its published casing', () => {
		expect(parseLanguage('fr-FR')).toBe('fr-FR');
		expect(parseLanguage('en-GB')).toBe('en-GB');
	});

	it('refuses other casings rather than normalising them', () => {
		// The phoneme distribution is keyed on the published tag, so accepting a
		// different casing here would look up a language the table does not hold.
		expect(parseLanguage('fr-fr')).toBeUndefined();
		expect(parseLanguage('FR-FR')).toBeUndefined();
	});

	it('refuses malformed tags', () => {
		for (const value of ['fr', 'fr_FR', 'fra-FRA', '', 'fr-FRA', null, 42]) {
			expect(parseLanguage(value)).toBeUndefined();
		}
	});
});

describe('parseSeed', () => {
	it('trims surrounding whitespace', () => {
		expect(parseSeed('  abc  ')).toBe('abc');
	});

	it('treats an empty or whitespace-only seed as absent', () => {
		expect(parseSeed('')).toBeUndefined();
		expect(parseSeed('   ')).toBeUndefined();
	});

	it('accepts a seed at the exact maximum length', () => {
		const seed = 'a'.repeat(MAX_SEED_LENGTH);
		expect(parseSeed(seed)).toBe(seed);
	});

	it('drops an over-long seed rather than truncating it', () => {
		// A truncated seed is a different seed, and would silently produce a
		// different draw from the one the caller asked to reproduce.
		expect(parseSeed('a'.repeat(MAX_SEED_LENGTH + 1))).toBeUndefined();
	});

	it('refuses a non-string', () => {
		for (const value of [42, null, undefined, {}]) {
			expect(parseSeed(value)).toBeUndefined();
		}
	});
});

describe('parseGenerationParams', () => {
	const valid = { pattern: 'det_noun' };

	it('refuses a request with no recognisable pattern', () => {
		for (const pattern of [undefined, '', 'nonsense', 42]) {
			expect(parseGenerationParams({ pattern })).toEqual({
				ok: false,
				reason: 'invalid_pattern'
			});
		}
	});

	it('applies the documented defaults when only a pattern is given', () => {
		const result = parseGenerationParams(valid);
		expect(result.ok).toBe(true);
		expect(result.ok && result.value).toEqual({
			pattern: 'det_noun',
			detType: undefined,
			gender: undefined,
			grammNumber: undefined,
			lengthUnit: undefined,
			length: undefined,
			lexicalDensity: undefined,
			listCount: 1,
			itemsPerList: 10,
			seed: undefined
		});
	});

	it('drops a determiner filter for a pattern that has no determiner slot', () => {
		// The form still submits the field when its select is merely hidden, and
		// honouring it would filter on a slot the pattern does not have.
		const result = parseGenerationParams({ pattern: 'noun', detType: 'definite' });
		expect(result.ok && result.value.detType).toBeUndefined();
	});

	it('keeps a determiner filter for a pattern that has one', () => {
		const result = parseGenerationParams({ pattern: 'np_verb', detType: 'indefinite' });
		expect(result.ok && result.value.detType).toBe('indefinite');
	});

	it('drops the length unit when no length was given', () => {
		// A unit without a length is not a filter, and carrying it would read as
		// one that was applied.
		const result = parseGenerationParams({ ...valid, lengthUnit: 'phonemes' });
		expect(result.ok && result.value.lengthUnit).toBeUndefined();
		expect(result.ok && result.value.length).toBeUndefined();
	});

	it('keeps the length unit when a length was given', () => {
		const result = parseGenerationParams({ ...valid, lengthUnit: 'phonemes', length: '4' });
		expect(result.ok && result.value.lengthUnit).toBe('phonemes');
		expect(result.ok && result.value.length).toBe(4);
	});

	it('defaults the unit to syllables when a length is given without one', () => {
		const result = parseGenerationParams({ ...valid, length: '4' });
		expect(result.ok && result.value.lengthUnit).toBe('syllables');
	});

	it('drops the unit when the length itself was out of range', () => {
		const result = parseGenerationParams({
			...valid,
			lengthUnit: 'phonemes',
			length: String(MAX_NOUN_LENGTH + 1)
		});
		expect(result.ok && result.value.length).toBeUndefined();
		expect(result.ok && result.value.lengthUnit).toBeUndefined();
	});

	it('clamps the two count fields to their published maxima', () => {
		const result = parseGenerationParams({ ...valid, listCount: '99', itemsPerList: '999' });
		expect(result.ok && result.value.listCount).toBe(MAX_LISTS);
		expect(result.ok && result.value.itemsPerList).toBe(MAX_ITEMS_PER_LIST);
	});

	it('reads every remaining filter through', () => {
		const result = parseGenerationParams({
			pattern: 'det_noun_adj',
			detType: 'definite',
			gender: 'f',
			grammNumber: 'p',
			lexicalDensity: 'low',
			listCount: '3',
			itemsPerList: '25',
			seed: ' repeatable '
		});
		expect(result.ok && result.value).toMatchObject({
			pattern: 'det_noun_adj',
			detType: 'definite',
			gender: 'f',
			grammNumber: 'p',
			lexicalDensity: 'low',
			listCount: 3,
			itemsPerList: 25,
			seed: 'repeatable'
		});
	});

	it('ignores unknown fields rather than failing on them', () => {
		// The form posts whatever the browser sends; an extra field is not a
		// reason to refuse a request whose meaning is fully determined.
		const result = parseGenerationParams({ ...valid, somethingElse: 'x' });
		expect(result.ok).toBe(true);
	});

	it('accepts every supported pattern', () => {
		for (const pattern of SUPPORTED_PATTERNS) {
			expect(parseGenerationParams({ pattern }).ok).toBe(true);
		}
	});
});

describe('parseBalancedParams', () => {
	it('refuses a missing or malformed language before anything else', () => {
		// Pointed at the field that is actually missing: this request is also
		// missing a pattern, and the language is what it cannot work around.
		expect(parseBalancedParams({})).toEqual({ ok: false, reason: 'invalid_language' });
		expect(parseBalancedParams({ language: 'fr' })).toEqual({
			ok: false,
			reason: 'invalid_language'
		});
	});

	it('still refuses an invalid pattern once the language is valid', () => {
		expect(parseBalancedParams({ language: 'fr-FR' })).toEqual({
			ok: false,
			reason: 'invalid_pattern'
		});
	});

	it('carries the language alongside the shared options', () => {
		const result = parseBalancedParams({ language: 'fr-FR', pattern: 'noun', seed: 'abc' });
		expect(result.ok && result.value).toMatchObject({
			language: 'fr-FR',
			pattern: 'noun',
			seed: 'abc'
		});
	});

	it('applies exactly the same option rules as the unbalanced request', () => {
		const shared = { pattern: 'noun', detType: 'definite', listCount: '99' };
		const plain = parseGenerationParams(shared);
		const balanced = parseBalancedParams({ ...shared, language: 'fr-FR' });
		expect(plain.ok && balanced.ok && balanced.value).toMatchObject(plain.ok ? plain.value : {});
	});
});
