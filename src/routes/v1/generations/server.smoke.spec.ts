import { createHash, randomBytes } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { describe, expect, it } from 'vitest';

const databaseUrl = process.env.PRIVATE_DATABASE_URL;
const smoke = databaseUrl ? describe : describe.skip;

smoke('generation API against the test corpus', () => {
	it('authenticates, reproduces both selections, and revokes the key', async () => {
		const sql = neon(databaseUrl!);
		const secret = `glx_${randomBytes(32).toString('hex')}`;
		const id = secret.slice(4, 20);
		const hash = createHash('sha256').update(secret).digest('hex');
		const { POST } = await import('./+server');
		const call = async (selection: 'random' | 'phoneme_balanced') => {
			const request = new Request('https://genlexis.test/v1/generations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
				body: JSON.stringify({
					selection,
					language: 'fr-FR',
					pattern: 'np_verb',
					listCount: 1,
					itemsPerList: 1,
					seed: `smoke-${id}`
				})
			});
			const response = await POST({ request } as never);
			return { status: response.status, body: await response.json() };
		};

		await sql`
			INSERT INTO genlexis.generation_api_keys (id, client_name, secret_hash)
			VALUES (${id}, 'generation smoke test', ${hash})
		`;
		try {
			for (const selection of ['random', 'phoneme_balanced'] as const) {
				const first = await call(selection);
				const second = await call(selection);
				expect(first.status).toBe(200);
				expect(second).toEqual(first);
				expect(first.body).toMatchObject({ selection, complete: true, totalItems: 1 });
			}
			await sql`UPDATE genlexis.generation_api_keys SET revoked_at = now() WHERE id = ${id}`;
			expect((await call('random')).status).toBe(401);
		} finally {
			await sql`DELETE FROM genlexis.generation_api_keys WHERE id = ${id}`;
		}
	});
});
