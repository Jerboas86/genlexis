import { createHash, randomBytes } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

const [action, argument] = process.argv.slice(2);
if (!['create', 'revoke', 'list'].includes(action) || (action !== 'list' && !argument)) {
	console.error('Usage: api-keys.mjs create <client-name> | revoke <key-id> | list');
	process.exit(2);
}
if (!process.env.PRIVATE_DATABASE_URL) throw new Error('PRIVATE_DATABASE_URL is required');
const sql = neon(process.env.PRIVATE_DATABASE_URL);

if (action === 'create') {
	const name = argument.trim();
	if (!name || name.length > 120) throw new Error('Client name must contain 1–120 characters');
	const secret = `glx_${randomBytes(32).toString('hex')}`;
	const id = secret.slice(4, 20);
	const hash = createHash('sha256').update(secret).digest('hex');
	await sql`
		INSERT INTO genlexis.generation_api_keys (id, client_name, secret_hash, can_generate)
		VALUES (${id}, ${name}, ${hash}, true)
	`;
	console.log(`Key ID: ${id}\nClient: ${name}\nSecret (shown once): ${secret}`);
} else if (action === 'revoke') {
	const rows = await sql`
		UPDATE genlexis.generation_api_keys
		SET revoked_at = now()
		WHERE id = ${argument} AND revoked_at IS NULL
		RETURNING id
	`;
	if (rows.length !== 1) throw new Error('Active key not found');
	console.log(`Revoked key ${argument}`);
} else {
	const rows = await sql`
		SELECT id, client_name, can_generate, created_at, revoked_at
		FROM genlexis.generation_api_keys
		ORDER BY created_at DESC
	`;
	for (const row of rows)
		console.log(
			`${row.id}\t${row.client_name}\t${row.can_generate ? 'generate' : 'no permission'}\t${row.revoked_at ? 'revoked' : 'active'}`
		);
}
