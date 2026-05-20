<script lang="ts">
	import { page } from '$app/state';
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import { goto } from '$app/navigation';
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import type { SemanticsLabel } from '$lib/server/genlexis';
	import { candidate, classify, correct, incorrect } from './data.remote';
	import { ANY_PATTERN, type PatternFilter } from './filter';

	const PATTERN_FILTERS: readonly PatternFilter[] = [ANY_PATTERN, 'det_noun', 'det_noun_adj'];

	const filterFromUrl = (value: string | null): PatternFilter =>
		value === 'det_noun' || value === 'det_noun_adj' ? value : ANY_PATTERN;

	const filter = $derived(filterFromUrl(page.url.searchParams.get('pattern')));

	const query = $derived(candidate(filter));
	// Await once so the value is available during SSR/hydration; subsequent updates
	// are read reactively via `query.current`.
	const initialQuery = () => query;
	await initialQuery();

	const setFilter = async (next: PatternFilter) => {
		const url = new URL(page.url);
		if (next === ANY_PATTERN) url.searchParams.delete('pattern');
		else url.searchParams.set('pattern', next);
		const href = `${url.pathname}${url.search}${url.hash}` as Pathname;
		await goto(resolve(href), { keepFocus: true, noScroll: true, replaceState: false });
	};

	const filterLabel = (value: PatternFilter) =>
		({
			[ANY_PATTERN]: m.classify_filter_any(),
			det_noun: m.pattern_det_noun(),
			det_noun_adj: m.pattern_det_noun_adj()
		})[value];

	const instruction = $derived.by(() => {
		if (filter === 'det_noun_adj') return m.classify_instruction_cascade();
		if (filter === 'det_noun') return m.classify_instruction_binary();
		return m.classify_instruction();
	});

	const SEMANTICS_OPTIONS: readonly SemanticsLabel[] = [
		'natural',
		'plausible',
		'strained',
		'nonsensical'
	];

	const semanticsLabel = (value: SemanticsLabel) =>
		({
			natural: m.classify_semantics_natural(),
			plausible: m.classify_semantics_plausible(),
			strained: m.classify_semantics_strained(),
			nonsensical: m.classify_semantics_nonsensical()
		})[value];

	let appropriate = $state<boolean | null>(null);
	let grammatical = $state<boolean | null>(null);
	let semantics = $state<SemanticsLabel | null>(null);

	let currentSentenceId = $state<number | null>(null);

	$effect(() => {
		const item = query.current;
		if (!item || item.pattern !== 'det_noun_adj') {
			currentSentenceId = null;
			return;
		}
		if (item.sentenceId === currentSentenceId) return;
		currentSentenceId = item.sentenceId;
		appropriate = item.llm?.appropriate ?? null;
		grammatical = item.llm?.grammatical ?? null;
		semantics = (item.llm?.semantics as SemanticsLabel | null) ?? null;
	});

	const grammaticalDisabled = $derived(appropriate !== true);
	const semanticsDisabled = $derived(appropriate !== true || grammatical !== true);

	const canSubmit = $derived.by(() => {
		if (appropriate === null) return false;
		if (appropriate === false) return true;
		if (grammatical === null) return false;
		if (grammatical === false) return true;
		return semantics !== null;
	});
</script>

<svelte:head>
	<title>{m.classify_meta_title()}</title>
</svelte:head>

<main class="shell">
	<a class="back" href={resolve(localizeHref('/') as Pathname)}>{m.back_home()}</a>

	<section class="page-header">
		<h1>{m.classify_title()}</h1>
		<p class="lede">{instruction}</p>
	</section>

	<div class="filter" role="radiogroup" aria-label={m.pattern_label()}>
		<span class="filter-label">{m.pattern_label()}</span>
		<div class="filter-options">
			{#each PATTERN_FILTERS as option (option)}
				<button
					type="button"
					class="filter-option"
					role="radio"
					aria-checked={filter === option}
					onclick={() => setFilter(option)}
				>
					{filterLabel(option)}
				</button>
			{/each}
		</div>
	</div>

	{#if query.current}
		<article class="candidate" aria-labelledby="candidate-heading">
			<h2 id="candidate-heading">{m.classify_candidate_label()}</h2>
			<p class="sentence">{query.current.sentence}</p>
			<p class="meta">{m.classify_vote_count({ count: query.current.voteCount })}</p>
		</article>

		{#if query.current.pattern === 'det_noun_adj'}
			<form class="classify-form" {...classify}>
				<input type="hidden" name="sentenceId" value={query.current.sentenceId} />
				<input type="hidden" name="filter" value={filter} />

				<fieldset class="level">
					<legend>{m.classify_appropriate_legend()}</legend>
					<div class="choices choices-2">
						<label class="choice choice-positive">
							<input
								type="radio"
								name="appropriate"
								value="true"
								checked={appropriate === true}
								onchange={() => (appropriate = true)}
							/>
							<span>{m.classify_yes()}</span>
						</label>
						<label class="choice choice-negative">
							<input
								type="radio"
								name="appropriate"
								value="false"
								checked={appropriate === false}
								onchange={() => (appropriate = false)}
							/>
							<span>{m.classify_no()}</span>
						</label>
					</div>
				</fieldset>

				<fieldset class="level" disabled={grammaticalDisabled}>
					<legend>{m.classify_grammatical_legend()}</legend>
					<div class="choices choices-2">
						<label class="choice choice-positive">
							<input
								type="radio"
								name="grammatical"
								value="true"
								checked={grammatical === true}
								onchange={() => (grammatical = true)}
							/>
							<span>{m.classify_yes()}</span>
						</label>
						<label class="choice choice-negative">
							<input
								type="radio"
								name="grammatical"
								value="false"
								checked={grammatical === false}
								onchange={() => (grammatical = false)}
							/>
							<span>{m.classify_no()}</span>
						</label>
					</div>
				</fieldset>

				<fieldset class="level" disabled={semanticsDisabled}>
					<legend>{m.classify_semantics_legend()}</legend>
					<div class="choices choices-4">
						{#each SEMANTICS_OPTIONS as option (option)}
							<label class="choice choice-{option}">
								<input
									type="radio"
									name="semantics"
									value={option}
									checked={semantics === option}
									onchange={() => (semantics = option)}
								/>
								<span>{semanticsLabel(option)}</span>
							</label>
						{/each}
					</div>
				</fieldset>

				<button type="submit" class="submit" disabled={!canSubmit}>
					{m.classify_submit()}
				</button>
			</form>
		{:else}
			<div class="vote-actions" aria-label={m.classify_actions_label()}>
				<form {...incorrect}>
					<input type="hidden" name="sentenceId" value={query.current.sentenceId} />
					<input type="hidden" name="filter" value={filter} />
					<button class="vote-button vote-button-incorrect" type="submit">
						{m.classify_incorrect()}
					</button>
				</form>
				<form {...correct}>
					<input type="hidden" name="sentenceId" value={query.current.sentenceId} />
					<input type="hidden" name="filter" value={filter} />
					<button class="vote-button vote-button-correct" type="submit"
						>{m.classify_correct()}</button
					>
				</form>
			</div>
		{/if}
	{:else}
		<section class="empty">
			<h2>{m.classify_empty_title()}</h2>
			<p>{m.classify_empty_body()}</p>
		</section>
	{/if}
</main>

<style>
	.shell {
		width: min(900px, calc(100% - (var(--container-gutter) * 2)));
		margin: 0 auto;
		padding: var(--space-section-sm) 0 var(--space-section-lg);
	}

	.back {
		display: inline-flex;
		margin-bottom: var(--space-xxxl);
		padding: var(--space-xs) 0;
		color: var(--color-ink);
		font-size: var(--font-size-body-sm);
		font-weight: var(--font-weight-medium);
		line-height: var(--line-height-body);
		text-decoration: none;
	}

	h1,
	h2,
	p {
		margin: 0;
	}

	h1 {
		max-width: 760px;
		font-size: var(--font-size-display-lg);
		font-weight: var(--font-weight-semibold);
		letter-spacing: var(--letter-spacing-base);
		line-height: var(--line-height-hero);
	}

	.lede {
		max-width: 640px;
		margin-top: var(--space-lg);
		color: var(--color-slate);
		font-size: var(--font-size-subtitle);
		font-weight: var(--font-weight-medium);
		line-height: var(--line-height-body);
	}

	.filter {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-md);
		margin-top: var(--space-xl);
	}

	.filter-label {
		color: var(--color-steel);
		font-size: var(--font-size-caption);
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.filter-options {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
	}

	.filter-option {
		width: auto;
		min-height: auto;
		padding: var(--space-xs) var(--space-md);
		background: var(--color-bg);
		border: 1px solid var(--color-hairline);
		border-radius: 9999px;
		color: var(--color-ink);
		font-size: var(--font-size-body-sm);
		font-weight: var(--font-weight-medium);
		cursor: pointer;
		transition:
			background-color 160ms ease,
			border-color 160ms ease,
			color 160ms ease;
	}

	.filter-option[aria-checked='true'] {
		background: var(--color-ink);
		border-color: var(--color-ink);
		color: var(--color-on-primary);
	}

	.candidate,
	.empty {
		margin-top: var(--space-xxxl);
		padding: var(--card-feature-padding);
		background: var(--color-surface);
		border: 1px solid var(--color-hairline);
		border-radius: var(--card-radius);
	}

	h2 {
		color: var(--color-steel);
		font-size: var(--font-size-caption);
		font-weight: var(--font-weight-semibold);
		line-height: var(--line-height-body);
	}

	.sentence {
		margin-top: var(--space-xl);
		color: var(--color-ink);
		font-size: var(--font-size-heading-lg);
		font-weight: var(--font-weight-semibold);
		line-height: 1.2;
		letter-spacing: var(--letter-spacing-base);
	}

	.meta,
	.empty p {
		margin-top: var(--space-xl);
		color: var(--color-steel);
		font-size: var(--font-size-body-sm);
		line-height: var(--line-height-body);
	}

	.vote-actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-sm);
		margin-top: var(--space-xl);
	}

	form,
	button {
		width: 100%;
	}

	button {
		min-height: var(--button-height);
		padding: var(--button-padding-y) var(--button-padding-x);
		border-radius: var(--button-radius);
		font-size: var(--font-size-body-sm);
		font-weight: var(--font-weight-semibold);
		line-height: 1.4;
		cursor: pointer;
	}

	.vote-button {
		border: 1px solid transparent;
		transition:
			background-color 160ms ease,
			border-color 160ms ease,
			color 160ms ease;
	}

	.vote-button-correct {
		color: var(--color-success-text);
		background: var(--color-success-bg);
		border-color: var(--color-success-border);
	}

	.vote-button-correct:hover {
		color: var(--color-on-primary);
		background: var(--color-success-text);
		border-color: var(--color-success-text);
	}

	.vote-button-correct:focus-visible {
		outline: 3px solid var(--color-success-border);
		outline-offset: 2px;
	}

	.vote-button-incorrect {
		color: var(--color-danger-text);
		background: var(--color-danger-bg);
		border-color: var(--color-danger-border);
	}

	.vote-button-incorrect:hover {
		color: var(--color-on-primary);
		background: var(--color-danger-solid);
		border-color: var(--color-danger-solid);
	}

	.vote-button-incorrect:focus-visible {
		outline: 3px solid var(--color-danger-border);
		outline-offset: 2px;
	}

	.classify-form {
		display: flex;
		flex-direction: column;
		gap: var(--space-lg);
		margin-top: var(--space-xl);
	}

	.level {
		display: flex;
		flex-direction: column;
		gap: var(--space-md);
		padding: 0;
		border: 0;
	}

	.level[disabled] {
		opacity: 0.45;
	}

	.level legend {
		float: none;
		padding: 0;
		margin-bottom: var(--space-md);
		color: var(--color-steel);
		font-size: var(--font-size-body-sm);
		font-weight: var(--font-weight-medium);
	}

	.choices {
		display: grid;
		gap: var(--space-xs);
	}

	.choices-2 {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	.choices-4 {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}

	.choice {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 32px;
		padding: 6px 12px;
		background: var(--color-bg);
		border: 1px solid var(--color-hairline);
		border-radius: var(--button-radius);
		color: var(--color-ink);
		font-size: var(--font-size-body-sm);
		font-weight: var(--font-weight-medium);
		text-align: center;
		cursor: pointer;
		transition:
			background-color 160ms ease,
			border-color 160ms ease,
			color 160ms ease;
	}

	.choice-positive:has(input:checked) {
		background: var(--color-success-bg);
		border-color: var(--color-success-border);
		color: var(--color-success-text);
	}

	.choice-negative:has(input:checked) {
		background: var(--color-danger-bg);
		border-color: var(--color-danger-border);
		color: var(--color-danger-text);
	}

	.choice-natural:has(input:checked) {
		background: var(--color-success-text);
		border-color: var(--color-success-text);
		color: var(--color-on-primary);
	}

	.choice-plausible:has(input:checked) {
		background: var(--color-success-bg);
		border-color: var(--color-success-border);
		color: var(--color-success-text);
	}

	.choice-strained:has(input:checked) {
		background: var(--color-danger-bg);
		border-color: var(--color-danger-border);
		color: var(--color-danger-text);
	}

	.choice-nonsensical:has(input:checked) {
		background: var(--color-danger-solid);
		border-color: var(--color-danger-solid);
		color: var(--color-on-primary);
	}

	.level[disabled] .choice {
		cursor: not-allowed;
	}

	.choice input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.submit {
		margin-top: var(--space-sm);
		background: var(--color-ink);
		color: var(--color-on-primary);
		border: 1px solid var(--color-ink);
	}

	.submit:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	@media (max-width: 620px) {
		.shell {
			width: min(100% - var(--space-xxl), 900px);
			padding: var(--space-xxxl) 0 var(--space-section);
		}

		h1 {
			font-size: var(--font-size-heading-lg);
		}

		.lede {
			font-size: var(--font-size-body-md);
		}

		.candidate,
		.empty {
			padding: var(--space-xl);
		}

		.sentence {
			font-size: var(--font-size-heading-sm);
		}

		.vote-actions {
			grid-template-columns: 1fr;
		}

		.choices-4 {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
