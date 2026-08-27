import type { LanguagePreset } from '../types.js';

export const frenchLanguagePreset: LanguagePreset = {
	determiners: {
		definite: ['le', 'la', "l'", 'les'],
		indefinite: ['un', 'une', 'des']
	},
	lexicalDensity: {
		high: { max: 2.0 },
		medium: { min: 2.0, max: 3.2 },
		low: { min: 3.2 }
	}
};
