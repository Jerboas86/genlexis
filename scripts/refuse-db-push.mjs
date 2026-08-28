/**
 * Refuses `drizzle-kit push` until this repository declares the schema honestly.
 *
 * Genlexis and Helixum share one PostgreSQL database, and each declares only a
 * part of the `aud` schema. `push` compares the declaration to the database and
 * offers to drop whatever it cannot see, so a push from here proposes deleting
 * tables that belong to the other repository — `language_phoneme_distributions`
 * among them, which every draw reads and which neither repository declares.
 *
 * The command is kept rather than deleted so that running it explains itself
 * instead of failing as a typo.
 *
 * Lifting this means finishing lot B of `specs/shared-database-ownership.md` in
 * the Helixum repository: declare every table of every schema this repository
 * declares, until `push` reports no changes. Until then, schema changes go
 * through reviewed additive SQL in `database/`, one environment at a time.
 */
console.error(
	[
		'',
		'  db:push is disabled in this repository.',
		'',
		'  The database is shared with Helixum and this repository declares only',
		'  part of the `aud` schema, so `drizzle-kit push` would offer to drop the',
		'  tables it cannot see — including `aud.language_phoneme_distributions`,',
		'  which every draw reads.',
		'',
		'  Use reviewed additive SQL instead, one environment at a time:',
		'',
		'    doppler run -p genlexis -c dev -- \\',
		'      psql "$PRIVATE_DATABASE_URL" -v ON_ERROR_STOP=1 -f database/<file>.sql',
		'',
		'  See `specs/shared-database-ownership.md` in the Helixum repository; lot B',
		'  is what makes this command safe again.',
		''
	].join('\n')
);
process.exit(1);
