import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

const workerTypesPath = path.join(root, 'worker-configuration.d.ts');
const paraglideDirs = [path.join(root, 'src/lib/paraglide'), path.join(root, 'src/paraglide')];

const workerImportPattern =
	/mainModule:\s*typeof import\((['"])\.\/\.svelte-kit\/cloudflare\/_worker\1\);/;

async function maybeRewriteWorkerTypes() {
	let source;

	try {
		source = await readFile(workerTypesPath, 'utf8');
	} catch {
		return;
	}

	const updated = source.replace(workerImportPattern, 'mainModule: unknown;');

	if (updated !== source) {
		await writeFile(workerTypesPath, updated);
	}
}

async function walk(dir, matcher, files = []) {
	let entries;

	try {
		entries = await readdir(dir);
	} catch {
		return files;
	}

	for (const entry of entries) {
		const fullPath = path.join(dir, entry);
		const entryStat = await stat(fullPath);

		if (entryStat.isDirectory()) {
			await walk(fullPath, matcher, files);
			continue;
		}

		if (matcher(fullPath)) {
			files.push(fullPath);
		}
	}

	return files;
}

async function addTsNoCheckToGeneratedJs() {
	const nested = await Promise.all(
		paraglideDirs.map((dir) => walk(dir, (file) => file.endsWith('.js')))
	);
	const files = nested.flat();

	await Promise.all(
		files.map(async (file) => {
			const source = await readFile(file, 'utf8');

			if (source.includes('// @ts-nocheck')) {
				return;
			}

			const updated = source.startsWith('/* eslint-disable */')
				? source.replace('/* eslint-disable */', '/* eslint-disable */\n// @ts-nocheck')
				: `// @ts-nocheck\n${source}`;

			await writeFile(file, updated);
		})
	);
}

await maybeRewriteWorkerTypes();
await addTsNoCheckToGeneratedJs();
