import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The application database is shared with Helixum (see
// specs/shared-database-ownership.md in that repository). Each repository owns a
// fixed set of PostgreSQL schemas and `drizzle-kit push` is bounded to them by
// `schemaFilter`; a table declared elsewhere would be invisible to the push of
// this repository and silently "missing" for the other one.
const OWNED_SCHEMAS = ['genlexis'];

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return /\.(ts|js)$/.test(name) && !/\.(spec|test)\.(ts|js)$/.test(name) ? [path] : [];
	});
}

describe('database ownership', () => {
	const files = sourceFiles(join(process.cwd(), 'src/lib/server'));
	const sources = files.map((path) => ({ path, text: readFileSync(path, 'utf8') }));

	it('declares Drizzle schemas only inside the schemas this repository owns', () => {
		const declared = sources.flatMap(({ path, text }) =>
			[...text.matchAll(/pgSchema\(\s*['"]([^'"]+)['"]/g)].map((m) => ({ path, schema: m[1] }))
		);
		expect(declared.length).toBeGreaterThan(0);
		const foreign = declared.filter(({ schema }) => !OWNED_SCHEMAS.includes(schema));
		expect(foreign).toEqual([]);
	});

	it('never declares a table in the public schema', () => {
		const inPublic = sources.filter(({ text }) => /\bpgTable\(/.test(text)).map(({ path }) => path);
		expect(inPublic).toEqual([]);
	});

	it('bounds drizzle-kit push to the owned schemas', () => {
		const config = readFileSync(join(process.cwd(), 'drizzle.config.ts'), 'utf8');
		const filter = config.match(/schemaFilter:\s*\[([^\]]*)\]/);
		expect(filter, 'drizzle.config.ts must set schemaFilter').not.toBeNull();
		const listed = [...filter![1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]).sort();
		expect(listed).toEqual([...OWNED_SCHEMAS].sort());
	});
});
