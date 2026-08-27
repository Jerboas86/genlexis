import { describe, expect, it } from 'vitest';
import { ANY_PATTERN } from './filter';
import {
	parseBoolean,
	parseClassification,
	parseFilter,
	parseSemantics,
	parseSentenceId,
	parseVote,
	SEMANTICS_LABELS,
	toRepoFilter
} from './params';

describe('parseSentenceId', () => {
	it('accepts a positive integer in a string, which is how a form sends it', () => {
		expect(parseSentenceId('1')).toBe(1);
		expect(parseSentenceId('4321')).toBe(4321);
	});

	it('refuses zero and negatives, which name no row', () => {
		expect(parseSentenceId('0')).toBeNull();
		expect(parseSentenceId('-3')).toBeNull();
	});

	it('refuses a non-integer', () => {
		for (const value of ['1.5', 'abc', '', ' ', '1e400']) {
			expect(parseSentenceId(value)).toBeNull();
		}
	});

	it('refuses anything that is not a string, including a bare number', () => {
		// The only caller is form data, which is always strings. Accepting a raw
		// number here would widen the surface for no caller that exists.
		for (const value of [1, null, undefined, {}, [], true]) {
			expect(parseSentenceId(value)).toBeNull();
		}
	});
});

describe('parseBoolean', () => {
	it('reads the two exact strings a form submits', () => {
		expect(parseBoolean('true')).toBe(true);
		expect(parseBoolean('false')).toBe(false);
	});

	it('returns null for anything else, which means "not answered"', () => {
		// `null` is distinct from `false`: a question that was never put is not a
		// question answered in the negative.
		for (const value of ['on', 'TRUE', '1', '0', '', true, false, null, undefined]) {
			expect(parseBoolean(value)).toBeNull();
		}
	});
});

describe('parseSemantics', () => {
	it('accepts every published label', () => {
		for (const label of SEMANTICS_LABELS) {
			expect(parseSemantics(label)).toBe(label);
		}
	});

	it('refuses anything outside the set', () => {
		for (const value of ['Natural', 'weird', '', null, 3, {}]) {
			expect(parseSemantics(value)).toBeNull();
		}
	});
});

describe('parseFilter', () => {
	it('accepts the three filterable patterns', () => {
		for (const pattern of ['det_noun', 'det_noun_adj', 'np_verb'] as const) {
			expect(parseFilter(pattern)).toBe(pattern);
		}
	});

	it('falls back to "any" rather than refusing the vote', () => {
		// The filter only decides which sentence is offered next, so a bad one
		// costs nothing — and failing the vote over it would lose a verdict the
		// person actually cast.
		for (const value of ['noun', 'nonsense', '', null, undefined, 42]) {
			expect(parseFilter(value)).toBe(ANY_PATTERN);
		}
	});
});

describe('toRepoFilter', () => {
	it('turns the "any" sentinel into undefined, which is what the repository wants', () => {
		expect(toRepoFilter(ANY_PATTERN)).toBeUndefined();
		expect(toRepoFilter(undefined)).toBeUndefined();
	});

	it('passes a real pattern through', () => {
		expect(toRepoFilter('det_noun')).toBe('det_noun');
	});

	it('turns an unrecognised pattern into undefined rather than a bad query', () => {
		expect(toRepoFilter('nonsense')).toBeUndefined();
	});
});

describe('parseVote', () => {
	it('reads a well-formed vote', () => {
		expect(parseVote({ sentenceId: '7', filter: 'np_verb' })).toEqual({
			ok: true,
			value: { sentenceId: 7, filter: 'np_verb' }
		});
	});

	it('refuses a vote with no usable sentence id', () => {
		expect(parseVote({ sentenceId: 'x' })).toEqual({
			ok: false,
			reason: 'invalid_sentence_id'
		});
	});

	it('defaults the filter when it is absent', () => {
		const result = parseVote({ sentenceId: '7' });
		expect(result.ok && result.value.filter).toBe(ANY_PATTERN);
	});
});

describe('parseClassification', () => {
	const base = { sentenceId: '7' };

	it('refuses a bad sentence id before looking at any verdict', () => {
		expect(parseClassification({ sentenceId: '0', appropriate: 'true' })).toEqual({
			ok: false,
			reason: 'invalid_sentence_id'
		});
	});

	it('requires the first verdict', () => {
		expect(parseClassification(base)).toEqual({ ok: false, reason: 'missing_appropriate' });
	});

	it('closes the chain at an inappropriate sentence', () => {
		// The remaining questions were never put, so they are recorded as `null`
		// rather than as negative answers.
		const result = parseClassification({ ...base, appropriate: 'false' });
		expect(result.ok && result.value).toEqual({
			sentenceId: 7,
			appropriate: false,
			grammatical: null,
			semantics: null,
			filter: ANY_PATTERN
		});
	});

	it('ignores later answers once the chain is closed', () => {
		// A browser may still submit the fields; honouring them would record a
		// verdict on a question the person was never shown.
		const result = parseClassification({
			...base,
			appropriate: 'false',
			grammatical: 'true',
			semantics: 'natural'
		});
		expect(result.ok && result.value.grammatical).toBeNull();
		expect(result.ok && result.value.semantics).toBeNull();
	});

	it('requires the grammatical verdict once the sentence is appropriate', () => {
		expect(parseClassification({ ...base, appropriate: 'true' })).toEqual({
			ok: false,
			reason: 'missing_grammatical'
		});
	});

	it('closes the chain at an ungrammatical sentence', () => {
		const result = parseClassification({
			...base,
			appropriate: 'true',
			grammatical: 'false'
		});
		expect(result.ok && result.value).toMatchObject({
			appropriate: true,
			grammatical: false,
			semantics: null
		});
	});

	it('ignores a semantics answer for an ungrammatical sentence', () => {
		const result = parseClassification({
			...base,
			appropriate: 'true',
			grammatical: 'false',
			semantics: 'natural'
		});
		expect(result.ok && result.value.semantics).toBeNull();
	});

	it('requires the semantics verdict once the sentence is appropriate and grammatical', () => {
		expect(parseClassification({ ...base, appropriate: 'true', grammatical: 'true' })).toEqual({
			ok: false,
			reason: 'missing_semantics'
		});
	});

	it('refuses an unrecognised semantics label rather than dropping it', () => {
		// Unlike the pattern filter, this one is the verdict itself: silently
		// discarding it would store a classification the person did not give.
		expect(
			parseClassification({
				...base,
				appropriate: 'true',
				grammatical: 'true',
				semantics: 'weird'
			})
		).toEqual({ ok: false, reason: 'missing_semantics' });
	});

	it('reads a complete verdict chain', () => {
		for (const semantics of SEMANTICS_LABELS) {
			const result = parseClassification({
				...base,
				appropriate: 'true',
				grammatical: 'true',
				semantics,
				filter: 'det_noun'
			});
			expect(result.ok && result.value).toEqual({
				sentenceId: 7,
				appropriate: true,
				grammatical: true,
				semantics,
				filter: 'det_noun'
			});
		}
	});

	it('never returns a verdict deeper than the one before it allowed', () => {
		// The invariant the chain exists to hold, stated once over every
		// combination rather than case by case.
		for (const appropriate of ['true', 'false']) {
			for (const grammatical of ['true', 'false', undefined]) {
				for (const semantics of [...SEMANTICS_LABELS, undefined]) {
					const result = parseClassification({
						...base,
						appropriate,
						grammatical,
						semantics
					});
					if (!result.ok) continue;
					const value = result.value;
					if (!value.appropriate) {
						expect(value.grammatical).toBeNull();
						expect(value.semantics).toBeNull();
					}
					if (value.grammatical === false) expect(value.semantics).toBeNull();
					if (value.semantics !== null) {
						expect(value.appropriate).toBe(true);
						expect(value.grammatical).toBe(true);
					}
				}
			}
		}
	});
});
