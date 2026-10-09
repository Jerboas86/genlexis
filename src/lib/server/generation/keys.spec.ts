import { beforeEach, describe, expect, it, vi } from 'vitest';

const rows = vi.fn();
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: () => ({ limit: (...args: unknown[]) => rows(...args) })
			})
		})
	}
}));

import { authorizeGeneration, hashApiKey } from './keys';

const key = `glx_${'a'.repeat(64)}`;
const headers = (secret: string) => new Headers({ Authorization: `Bearer ${secret}` });

describe('generation API keys', () => {
	beforeEach(() => rows.mockReset());

	it('hashes the whole bearer secret', async () => {
		expect(await hashApiKey(key)).toMatch(/^[0-9a-f]{64}$/);
		expect(await hashApiKey(key)).not.toBe(await hashApiKey(`glx_${'b'.repeat(64)}`));
	});

	it('rejects malformed credentials before querying storage', async () => {
		expect(await authorizeGeneration(new Headers())).toBe('unauthorized');
		expect(await authorizeGeneration(headers('short'))).toBe('unauthorized');
		expect(await authorizeGeneration(headers(`${key}_genlexis`))).toBe('unauthorized');
		expect(rows).not.toHaveBeenCalled();
	});

	it('distinguishes active, revoked, and restricted keys', async () => {
		rows.mockResolvedValueOnce([{ canGenerate: true, revokedAt: null }]);
		expect(await authorizeGeneration(headers(key))).toBe('allowed');
		rows.mockResolvedValueOnce([{ canGenerate: false, revokedAt: null }]);
		expect(await authorizeGeneration(headers(key))).toBe('forbidden');
		rows.mockResolvedValueOnce([{ canGenerate: true, revokedAt: new Date() }]);
		expect(await authorizeGeneration(headers(key))).toBe('unauthorized');
		rows.mockResolvedValueOnce([]);
		expect(await authorizeGeneration(headers(key))).toBe('unauthorized');
	});
});
