import { describe, expect, it } from 'vitest';
import { createIpaTokenizer } from './tokenizer';

const FRENCH_SAMPLE = [
	'ʁ',
	'a',
	'l',
	's',
	't',
	'd',
	'p',
	'k',
	'm',
	'n',
	'v',
	'i',
	'e',
	'ə',
	'u',
	'ɔ',
	'y',
	'o',
	'ɛ',
	'œ',
	'ø',
	'b',
	'w',
	'ʃ',
	'ʒ',
	'z',
	'f',
	'g',
	'ɥ',
	'ŋ',
	'j',
	'ɔ̃',
	'ɑ̃',
	'ɛ̃',
	'œ̃'
];

describe('createIpaTokenizer', () => {
	it('tokenizes plain consonant+vowel sequences', () => {
		expect.assertions(2);
		const t = createIpaTokenizer(FRENCH_SAMPLE);
		const { tokens, unknown } = t.tokenize('kat');
		expect(tokens).toEqual(['k', 'a', 't']);
		expect(unknown).toEqual([]);
	});

	it('recognizes multi-codepoint nasal vowels as a single token via longest match', () => {
		expect.assertions(2);
		const t = createIpaTokenizer(FRENCH_SAMPLE);
		const { tokens } = t.tokenize('mɔ̃taɲ');
		expect(tokens).toEqual(['m', 'ɔ̃', 't', 'a']);
		expect(tokens).not.toContain('ɔ');
	});

	it('strips primary and secondary stress marks by default', () => {
		expect.assertions(1);
		const t = createIpaTokenizer(FRENCH_SAMPLE);
		const { tokens } = t.tokenize('ˈkaˌto');
		expect(tokens).toEqual(['k', 'a', 't', 'o']);
	});

	it('keeps length-marked phonemes attached when in inventory', () => {
		expect.assertions(1);
		const inventory = ['a', 'aː', 't'];
		const t = createIpaTokenizer(inventory);
		const { tokens } = t.tokenize('taːt');
		expect(tokens).toEqual(['t', 'aː', 't']);
	});

	it('falls back to the shorter token when length is stripped', () => {
		expect.assertions(1);
		const inventory = ['a', 'aː', 't'];
		const t = createIpaTokenizer(inventory, { stripLength: true });
		const { tokens } = t.tokenize('taːt');
		expect(tokens).toEqual(['t', 'a', 't']);
	});

	it('matches affricates as a single unit when present in the inventory', () => {
		expect.assertions(1);
		const inventory = ['t', 'ʃ', 't͡ʃ', 'a'];
		const t = createIpaTokenizer(inventory);
		const { tokens } = t.tokenize('t͡ʃat');
		expect(tokens).toEqual(['t͡ʃ', 'a', 't']);
	});

	it('records out-of-inventory segments as unknown without crashing', () => {
		expect.assertions(2);
		const t = createIpaTokenizer(FRENCH_SAMPLE);
		const { tokens, unknown } = t.tokenize('aɲx');
		expect(tokens).toEqual(['a']);
		expect(unknown).toEqual(['ɲ', 'x']);
	});

	it('returns empty arrays for an empty input', () => {
		expect.assertions(2);
		const t = createIpaTokenizer(FRENCH_SAMPLE);
		const { tokens, unknown } = t.tokenize('');
		expect(tokens).toEqual([]);
		expect(unknown).toEqual([]);
	});

	it('prefers the longest matching inventory key (longest-match precedence)', () => {
		expect.assertions(1);
		const inventory = ['a', 'an', 'ant'];
		const t = createIpaTokenizer(inventory);
		const { tokens } = t.tokenize('ant');
		expect(tokens).toEqual(['ant']);
	});
});
