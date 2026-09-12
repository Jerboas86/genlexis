/**
 * Copies LLM judgements from one environment's database to another.
 *
 * The judging batches run against the dev branch, but the draw service reads
 * whichever database it is pointed at, so production stays thin until the
 * judgements reach it. Re-running the batch against production would work, but
 * would spend the model calls twice and — the model not being deterministic —
 * would leave the two environments judging the same sentences differently. A
 * corpus you test against and a corpus you serve should be the same corpus.
 *
 * Sentences are matched by their **text**. The two databases allocate
 * `generated_sentences.id` independently and are offset by a couple of thousand,
 * so ids mean nothing across the boundary. Text is safe here because every
 * sentence text in the corpus is distinct, and the script refuses to run if that
 * ever stops being true.
 *
 * Human classifications are never touched. Production carries thousands of real
 * human votes that dev does not, and they are the one thing here that cannot be
 * regenerated.
 *
 * Idempotent: a sentence that already carries an LLM judgement in the target is
 * left alone, so an interrupted run is simply re-run.
 *
 *   node scripts/propagate-classifications.mjs --from dev --to prod
 *   node scripts/propagate-classifications.mjs --from dev --to prod --apply
 *
 * Without `--apply` it reports what it would write and writes nothing.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CONFIGS = ['dev', 'stg', 'test', 'prod'];

function parseArguments() {
	const argv = process.argv.slice(2);
	const value = (name) => {
		const index = argv.indexOf(name);
		return index === -1 ? undefined : argv[index + 1];
	};
	const from = value('--from');
	const to = value('--to');
	const apply = argv.includes('--apply');
	for (const [name, config] of [
		['--from', from],
		['--to', to]
	]) {
		if (config === undefined) throw new Error(`${name} is required`);
		if (!CONFIGS.includes(config)) {
			throw new Error(`${name} must be one of ${CONFIGS.join(', ')}, got "${config}"`);
		}
	}
	if (from === to) throw new Error('--from and --to must differ');
	return { from, to, apply };
}

/**
 * `psql` needs the connection string expanded by a shell, and passing it through
 * `sh -c` keeps the secret out of this process's argument list.
 */
function run(config, args) {
	const quoted = args.map((argument) => `'${argument.split("'").join(`'\\''`)}'`).join(' ');
	return execFileSync(
		'doppler',
		[
			'run',
			'-p',
			'genlexis',
			'-c',
			config,
			'--',
			'sh',
			'-c',
			`psql "$PRIVATE_DATABASE_URL" ${quoted}`
		],
		{ encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }
	);
}

/**
 * The corpora must be the same before any judgement crosses over.
 *
 * A judgement is about a sentence; carrying it to a database whose sentences
 * differ would attach a verdict to something nobody judged.
 */
function corpusFingerprint(config) {
	const out = run(config, [
		'-q',
		'-tAF|',
		'-c',
		`SELECT md5(string_agg(sentence, E'\\n' ORDER BY sentence)), count(*), count(DISTINCT sentence)
		 FROM aud.generated_sentences WHERE language = 'fr-FR'`
	]).trim();
	const [digest, total, distinct] = out.split('|');
	return { digest, total: Number(total), distinct: Number(distinct) };
}

function countJudged(config) {
	return Number(
		run(config, [
			'-q',
			'-tAc',
			`SELECT count(*) FROM aud.generated_sentence_classifications WHERE judge_type = 'llm'`
		]).trim()
	);
}

const { from, to, apply } = parseArguments();

const source = corpusFingerprint(from);
const target = corpusFingerprint(to);
console.log(`corpus ${from}: ${source.total} phrases, ${source.distinct} textes distincts`);
console.log(`corpus ${to}:   ${target.total} phrases, ${target.distinct} textes distincts`);

// The danger is ambiguity, not inequality. A judgement carried to a database
// that lacks the sentence simply matches nothing and is reported below; a
// judgement carried to a database where two sentences share a text could attach
// to the wrong one, and no later check would notice.
for (const [config, corpus] of [
	[from, source],
	[to, target]
]) {
	if (corpus.distinct !== corpus.total) {
		console.error(
			`\nRefus : ${config} contient ${corpus.total - corpus.distinct} texte(s) en double.\n` +
				`Les jugements sont appariés par le texte, donc l'appariement serait ambigu et\n` +
				`pourrait attacher un verdict à la mauvaise phrase.`
		);
		process.exit(1);
	}
}

if (source.digest !== target.digest) {
	console.log(
		`\nNote : les corpus diffèrent (${source.total} contre ${target.total} phrases).\n` +
			`Les jugements portant sur une phrase absente de ${to} seront ignorés, et leur\n` +
			`nombre est rapporté ci-dessous.`
	);
}

const before = countJudged(to);
console.log(`\njugements LLM — ${from}: ${countJudged(from)} · ${to}: ${before}`);

const directory = mkdtempSync(join(tmpdir(), 'genlexis-propagate-'));
const csv = join(directory, 'classifications.csv');

try {
	run(from, [
		'-q',
		'-c',
		`\\copy (SELECT g.sentence, c.appropriate, c.grammatical, c.semantics,
		          c.classifier_model, c.classifier_prompt_hash, c.classified_at,
		          c.reaction_p1, c.reaction_p2, c.reaction_p3, c.notes
		        FROM aud.generated_sentence_classifications c
		        JOIN aud.generated_sentences g ON g.id = c.sentence_id
		        WHERE c.judge_type = 'llm' AND g.language = 'fr-FR') TO '${csv}' CSV HEADER`
	]);

	// A temp table can outlive its session behind Neon's connection pooler, so the
	// import drops one that a previous interrupted run may have left behind.
	const importSql = `
SET client_min_messages = warning;
BEGIN;
DROP TABLE IF EXISTS incoming_classifications;
CREATE TEMP TABLE incoming_classifications (
    sentence               text,
    appropriate            boolean,
    grammatical            boolean,
    semantics              text,
    classifier_model       text,
    classifier_prompt_hash text,
    classified_at          timestamptz,
    reaction_p1            text,
    reaction_p2            text,
    reaction_p3            text,
    notes                  text
) ON COMMIT DROP;
\\copy incoming_classifications FROM '${csv}' CSV HEADER
SELECT 'SANS CORRESPONDANCE ' || count(*) FROM incoming_classifications i
WHERE NOT EXISTS (
    SELECT 1 FROM aud.generated_sentences g
    WHERE g.sentence = i.sentence AND g.language = 'fr-FR'
);
SELECT 'DEJA JUGEES ' || count(*) FROM incoming_classifications i
JOIN aud.generated_sentences g ON g.sentence = i.sentence AND g.language = 'fr-FR'
WHERE EXISTS (
    SELECT 1 FROM aud.generated_sentence_classifications c
    WHERE c.sentence_id = g.id AND c.judge_type = 'llm'
);
-- Counted through a CTE rather than read from psql's status line, which the
-- quiet flag suppresses. It also reports the same number in dry-run, where the transaction
-- is rolled back after the count is taken.
WITH inserted AS (
    INSERT INTO aud.generated_sentence_classifications
        (sentence_id, judge_type, appropriate, grammatical, semantics,
         classifier_model, classifier_prompt_hash, classified_at,
         reaction_p1, reaction_p2, reaction_p3, notes)
    SELECT g.id, 'llm', i.appropriate, i.grammatical, i.semantics,
           i.classifier_model, i.classifier_prompt_hash, i.classified_at,
           i.reaction_p1, i.reaction_p2, i.reaction_p3, i.notes
    FROM incoming_classifications i
    JOIN aud.generated_sentences g ON g.sentence = i.sentence AND g.language = 'fr-FR'
    WHERE NOT EXISTS (
        SELECT 1 FROM aud.generated_sentence_classifications c
        WHERE c.sentence_id = g.id AND c.judge_type = 'llm'
    )
    RETURNING 1
)
SELECT 'INSEREES ' || count(*) FROM inserted;
${apply ? 'COMMIT;' : 'ROLLBACK;'}
`;
	const sqlFile = join(directory, 'import.sql');
	execFileSync('tee', [sqlFile], { input: importSql, stdio: ['pipe', 'ignore', 'inherit'] });
	const output = run(to, ['-q', '-tA', '-v', 'ON_ERROR_STOP=1', '-f', sqlFile]);
	const inserted = /INSEREES (\d+)/.exec(output)?.[1] ?? '0';
	const unmatched = /SANS CORRESPONDANCE (\d+)/.exec(output)?.[1] ?? '0';
	const already = /DEJA JUGEES (\d+)/.exec(output)?.[1] ?? '0';
	console.log(`\nsans correspondance dans ${to} : ${unmatched}`);
	console.log(`déjà jugées dans ${to}       : ${already}`);

	console.log(
		apply
			? `\nÉcrit : ${inserted} jugements ajoutés à ${to} (total ${countJudged(to)}).`
			: `\nÀ blanc : ${inserted} jugements seraient ajoutés à ${to}.\n` +
					`Rien n'a été écrit. Relancer avec --apply pour appliquer.`
	);
} finally {
	rmSync(directory, { recursive: true, force: true });
}
