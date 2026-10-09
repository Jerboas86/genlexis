import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { generationApiKeys } from '#lib/server/db/schema.js';

const KEY_FORMAT = /^glx_[0-9a-f]{64}$/;

export async function hashApiKey(key: string): Promise<string> {
	const bytes = new TextEncoder().encode(key);
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export type KeyAccess = 'unauthorized' | 'forbidden' | 'allowed';

export async function authorizeGeneration(headers: Headers): Promise<KeyAccess> {
	const match = /^Bearer (\S+)$/i.exec(headers.get('Authorization') ?? '');
	if (!match || !KEY_FORMAT.test(match[1])) return 'unauthorized';
	const hash = await hashApiKey(match[1]);
	const [key] = await db
		.select({ canGenerate: generationApiKeys.canGenerate, revokedAt: generationApiKeys.revokedAt })
		.from(generationApiKeys)
		.where(eq(generationApiKeys.secretHash, hash))
		.limit(1);
	if (!key || key.revokedAt) return 'unauthorized';
	return key.canGenerate ? 'allowed' : 'forbidden';
}
