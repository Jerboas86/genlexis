import { defineConfig } from 'drizzle-kit';

if (!process.env.PRIVATE_DATABASE_URL) throw new Error('PRIVATE_DATABASE_URL is not set');

export default defineConfig({
	schema: './src/lib/server/db/schema.ts',
	dialect: 'postgresql',
	dbCredentials: { url: process.env.PRIVATE_DATABASE_URL },
	// The one schema this repository owns whole, and therefore the only one
	// `push` may diff. The `aud` tables declared alongside are the corpus — read
	// here, owned by nobody yet, shared with Helixum through the same database —
	// and a push that could see them could drop what it does not recognise.
	// Bounding the filter makes that impossible by construction rather than by
	// discipline. See `specs/shared-database-ownership.md` in the Helixum repo.
	schemaFilter: ['genlexis'],
	verbose: true,
	strict: true
});
