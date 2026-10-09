import { describe, expect, it } from 'vitest';
import { load } from './+page.server';

describe('API reference data', () => {
	it('only documents the lexical generation API', () => {
		const { endpoints } = load({} as never) as {
			endpoints: import('./+page.server').DocEndpoint[];
		};
		expect(endpoints.map(({ id, method, path }) => [id, method, path])).toEqual([
			['createGeneration', 'POST', '/v1/generations']
		]);
		expect(endpoints[0].examples[0].request).toContain('https://genlexis.com/v1/generations');
	});

	it('shows required and nested generation fields with its real examples', () => {
		const { endpoints } = load({} as never) as {
			endpoints: import('./+page.server').DocEndpoint[];
		};
		const generation = endpoints[0];
		expect(generation.title.fr).toBe('Génération automatique de listes');
		expect(generation.parameters.find(({ name }) => name === 'selection')).toMatchObject({
			required: true,
			constraints: { enum: ['random', 'phoneme_balanced'] }
		});
		expect(generation.parameters.find(({ name }) => name === 'filters')?.children).toHaveLength(6);
		const described = (fields: import('./+page.server').DocField[]): boolean =>
			fields.every(
				(field) => field.description.en && field.description.fr && described(field.children)
			);
		expect(described(generation.parameters)).toBe(true);
		expect(described(generation.responseFields)).toBe(true);
		for (const example of generation.examples) {
			const response = JSON.parse(example.response);
			expect(response.selection).toBe(example.label);
			expect(example.request).toContain(`"selection": "${example.label}"`);
		}
	});
});
