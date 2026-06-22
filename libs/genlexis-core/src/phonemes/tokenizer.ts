import type { IpaTokenizer, TokenizationResult, TokenizerOptions } from './types';

const STRESS_MARKS = /[ˈˌ]/g;
const LENGTH_MARK = /ː/g;
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

export const createIpaTokenizer = (
	inventory: Iterable<string>,
	options: TokenizerOptions = {}
): IpaTokenizer => {
	const { stripStress = true, stripLength = false, stripDiacritics = false } = options;
	const sortedKeys = [...new Set(inventory)]
		.filter((k) => k.length > 0)
		.sort((a, b) => b.length - a.length);

	const preprocess = (ipa: string): string => {
		let text = ipa.normalize('NFC');
		if (stripStress) text = text.replace(STRESS_MARKS, '');
		if (stripLength) text = text.replace(LENGTH_MARK, '');
		if (stripDiacritics) text = text.replace(COMBINING_DIACRITICS, '');
		return text;
	};

	return {
		tokenize(ipa: string): TokenizationResult {
			const text = preprocess(ipa);
			const tokens: string[] = [];
			const unknown: string[] = [];
			let i = 0;
			while (i < text.length) {
				let matched: string | null = null;
				for (const key of sortedKeys) {
					if (text.startsWith(key, i)) {
						matched = key;
						break;
					}
				}
				if (matched) {
					tokens.push(matched);
					i += matched.length;
				} else {
					const codePoint = text.codePointAt(i);
					if (codePoint === undefined) break;
					const ch = String.fromCodePoint(codePoint);
					unknown.push(ch);
					i += ch.length;
				}
			}
			return { tokens, unknown };
		}
	};
};
