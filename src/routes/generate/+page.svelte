<script lang="ts">
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import { acceptedSummary, generate, generateBalanced } from './data.remote';

	const MAX_LISTS = 5;
	const MAX_ITEMS_PER_LIST = 50;
	const MAX_NOUN_LENGTH = 20;
	const UNBALANCED_THRESHOLD = 0.35;
	const DEFAULT_LANGUAGE = 'fr-FR';

	const summaryQuery = acceptedSummary();
	await summaryQuery;
	const canGenerate = $derived(summaryQuery.current?.canGenerate ?? true);

	let pattern = $state<'det_noun' | 'noun' | 'det_noun_adj'>('det_noun');
	let detType = $state<'' | 'definite' | 'indefinite'>('');
	let gender = $state<'' | 'm' | 'f'>('');
	let grammNumber = $state<'' | 's' | 'p'>('');
	let lengthUnit = $state<'syllables' | 'phonemes'>('syllables');
	let length = $state<number | ''>('');
	let lexicalDensity = $state<'' | 'high' | 'medium' | 'low'>('');
	let listCount = $state(1);
	let itemsPerList = $state(10);
	let balanced = $state(false);

	const activeForm = $derived(balanced ? generateBalanced : generate);
	const balancedResult = $derived(generateBalanced.result);
	const result = $derived(balanced ? balancedResult : generate.result);
	const lists = $derived(result?.lists ?? []);
	const requestedTotal = $derived(
		result ? result.requestedLists * result.requestedItemsPerList : 0
	);
	const isEmpty = $derived(!!result && result.totalItems === 0);
	const isPartial = $derived(
		!!result && result.totalItems > 0 && result.totalItems < requestedTotal
	);
	const scores = $derived(balanced && balancedResult ? balancedResult.scores : null);
	const showUnbalancedWarning = $derived(
		!!scores && scores.length > 0 && scores.some((s) => s > UNBALANCED_THRESHOLD)
	);

	let copiedIndex = $state<number | null>(null);
	let copyResetTimeout: ReturnType<typeof setTimeout> | undefined;

	async function copyList(index: number) {
		const text = lists[index].map((s) => s.sentence).join('\n');
		await navigator.clipboard.writeText(text);
		copiedIndex = index;
		clearTimeout(copyResetTimeout);
		copyResetTimeout = setTimeout(() => {
			copiedIndex = null;
		}, 2000);
	}
</script>

<svelte:head>
	<title>{m.generate_meta_title()}</title>
</svelte:head>

<main class="shell">
	<a class="back" href={resolve(localizeHref('/') as Pathname)}>{m.back_home()}</a>

	<section class="page-header">
		<h1>{m.generate_title()}</h1>
		<p class="lede">{m.generate_instruction({ maxLists: MAX_LISTS })}</p>
	</section>

	<section class="panel" aria-live="polite">
		{#if !canGenerate}
			<p class="notice">{m.generate_disabled_body()}</p>
		{/if}

		<form
			{...activeForm.enhance(async ({ submit }) => {
				await submit();
			})}
			class="controls"
		>
			<input type="hidden" name="language" value={DEFAULT_LANGUAGE} />

			<div class="field">
				<label for="pattern">{m.pattern_label()}</label>
				<select id="pattern" name="pattern" bind:value={pattern}>
					<option value="det_noun">{m.pattern_det_noun()}</option>
					<option value="noun">{m.pattern_noun()}</option>
					<option value="det_noun_adj">{m.pattern_det_noun_adj()}</option>
				</select>
			</div>

			{#if pattern === 'det_noun' || pattern === 'det_noun_adj'}
				<div class="field">
					<label for="detType">{m.generate_det_type_label()}</label>
					<select id="detType" name="detType" bind:value={detType}>
						<option value="">{m.generate_det_type_any()}</option>
						<option value="definite">{m.generate_det_type_definite()}</option>
						<option value="indefinite">{m.generate_det_type_indefinite()}</option>
					</select>
				</div>
			{/if}

			<fieldset class="group">
				<legend>{m.generate_noun_legend()}</legend>

				<div class="field">
					<label for="gender">{m.generate_gender_label()}</label>
					<select id="gender" name="gender" bind:value={gender}>
						<option value="">{m.generate_gender_any()}</option>
						<option value="m">{m.generate_gender_masculine()}</option>
						<option value="f">{m.generate_gender_feminine()}</option>
					</select>
				</div>

				<div class="field">
					<label for="grammNumber">{m.generate_number_label()}</label>
					<select id="grammNumber" name="grammNumber" bind:value={grammNumber}>
						<option value="">{m.generate_number_any()}</option>
						<option value="s">{m.generate_number_singular()}</option>
						<option value="p">{m.generate_number_plural()}</option>
					</select>
				</div>

				<div class="field">
					<label for="lengthUnit">{m.generate_length_unit_label()}</label>
					<select id="lengthUnit" name="lengthUnit" bind:value={lengthUnit}>
						<option value="syllables">{m.generate_length_unit_syllables()}</option>
						<option value="phonemes">{m.generate_length_unit_phonemes()}</option>
					</select>
				</div>

				<div class="field">
					<label for="length">{m.generate_length_label()}</label>
					<input
						id="length"
						name="length"
						type="number"
						min="1"
						max={MAX_NOUN_LENGTH}
						placeholder={m.generate_length_any()}
						bind:value={length}
					/>
				</div>

				<div class="field">
					<label for="lexicalDensity">{m.generate_lexical_density_label()}</label>
					<select id="lexicalDensity" name="lexicalDensity" bind:value={lexicalDensity}>
						<option value="">{m.generate_lexical_density_any()}</option>
						<option value="high">{m.generate_lexical_density_high()}</option>
						<option value="medium">{m.generate_lexical_density_medium()}</option>
						<option value="low">{m.generate_lexical_density_low()}</option>
					</select>
				</div>
			</fieldset>

			<div class="field">
				<label for="listCount">{m.generate_list_count_label()}</label>
				<input
					id="listCount"
					name="listCount"
					type="number"
					min="1"
					max={MAX_LISTS}
					bind:value={listCount}
				/>
			</div>

			<div class="field">
				<label for="itemsPerList">{m.generate_items_per_list_label()}</label>
				<input
					id="itemsPerList"
					name="itemsPerList"
					type="number"
					min="1"
					max={MAX_ITEMS_PER_LIST}
					bind:value={itemsPerList}
				/>
			</div>

			<label class="toggle">
				<input type="checkbox" bind:checked={balanced} data-testid="balance-toggle" />
				<span class="toggle-text">
					<span class="toggle-label">{m.generate_balance_label()}</span>
					<span class="toggle-help">{m.generate_balance_help()}</span>
				</span>
			</label>

			<div class="actions">
				<button class="button-primary" type="submit" data-testid="submit" disabled={!canGenerate}>
					{lists.length ? m.generate_refresh() : m.generate_button()}
				</button>
			</div>
		</form>

		{#if result && isEmpty}
			<p class="notice partial" data-testid="empty-notice">
				{m.generate_empty_notice()}
			</p>
		{/if}

		{#if result && !isEmpty && lists.length}
			{#if isPartial}
				<p class="notice partial">
					{m.generate_partial_notice({
						actual: result.totalItems,
						requested: requestedTotal
					})}
				</p>
			{/if}

			{#if showUnbalancedWarning}
				<p class="notice unbalanced" role="status" data-testid="unbalanced-warning">
					{m.generate_unbalanced_warning()}
				</p>
			{/if}

			<div class="lists" data-testid="lists">
				{#each lists as list, listIndex (listIndex)}
					{@const listScore = scores ? scores[listIndex] : undefined}
					{@const listUnbalanced = listScore !== undefined && listScore > UNBALANCED_THRESHOLD}
					<article class="list" data-testid="list">
						<header class="list-header">
							<h2>{m.generate_list_heading({ index: listIndex + 1 })}</h2>
							<div class="list-meta">
								{#if listScore !== undefined}
									<span class="score" class:warn={listUnbalanced} data-testid="list-score">
										{m.generate_score_label({ score: listScore.toFixed(2) })}
									</span>
								{/if}
								<button
									class="copy"
									type="button"
									onclick={() => copyList(listIndex)}
									disabled={!list.length}
									aria-live="polite"
								>
									{copiedIndex === listIndex ? m.generate_copied() : m.generate_copy()}
								</button>
							</div>
						</header>
						{#if list.length}
							<ol>
								{#each list as sentence (sentence.sentenceId)}
									<li data-testid="list-item">{sentence.sentence}</li>
								{/each}
							</ol>
						{/if}
					</article>
				{/each}
			</div>
		{/if}
	</section>
</main>

<style>
	.shell {
		width: min(980px, calc(100% - (var(--container-gutter) * 2)));
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
		line-height: var(--line-height-hero);
		letter-spacing: var(--letter-spacing-base);
	}

	.lede {
		max-width: 640px;
		margin-top: var(--space-lg);
		color: var(--color-slate);
		font-size: var(--font-size-subtitle);
		font-weight: var(--font-weight-medium);
		line-height: var(--line-height-body);
	}

	.panel {
		margin-top: var(--space-xxxl);
		padding: var(--card-padding);
		background: var(--color-canvas);
		border: 1px solid var(--color-hairline);
		border-radius: var(--card-radius);
		box-shadow: var(--shadow-subtle);
	}

	.controls {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--space-md);
		align-items: end;
	}

	.group {
		grid-column: 1 / -1;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: var(--space-md);
		align-items: end;
		margin: 0;
		padding: var(--space-md) var(--space-lg) var(--space-lg);
		border: 1px solid var(--color-hairline);
		border-radius: var(--radius-md);
	}

	.group legend {
		padding: 0 var(--space-xs);
		color: var(--color-slate);
		font-size: var(--font-size-body-sm);
		font-weight: var(--font-weight-medium);
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: var(--space-xxs);
	}

	.field label {
		color: var(--color-slate);
		font-size: var(--font-size-body-sm);
		font-weight: var(--font-weight-medium);
	}

	.field select,
	.field input {
		box-sizing: border-box;
		height: var(--button-height);
		padding: var(--space-xs) var(--space-sm);
		color: var(--color-ink);
		font-size: var(--font-size-body-sm);
		line-height: 1.4;
		background: var(--color-canvas);
		border: 1px solid var(--color-hairline);
		border-radius: var(--radius-md);
	}

	.field select {
		appearance: base-select;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.field select::picker(select) {
		appearance: base-select;
		margin-top: var(--space-xxs);
		padding: var(--space-xxs);
		color: var(--color-ink);
		font-size: var(--font-size-body-sm);
		background: var(--color-canvas);
		border: 1px solid var(--color-hairline);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-subtle);
	}

	.field select option {
		padding: var(--space-xs) var(--space-sm);
		color: var(--color-ink);
		font-size: var(--font-size-body-sm);
		background: var(--color-canvas);
		border-radius: var(--radius-md);
	}

	.field select option:hover,
	.field select option:focus {
		background: var(--color-surface);
		outline: none;
	}

	.field select option:checked {
		color: var(--color-on-primary);
		background: var(--color-primary);
	}

	.actions {
		grid-column: 1 / -1;
		display: flex;
		justify-content: flex-end;
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

	.button-primary {
		color: var(--color-on-primary);
		background: var(--color-primary);
		border: 1px solid var(--color-primary);
	}

	.button-primary:hover {
		background: var(--color-charcoal);
	}

	.lists {
		display: grid;
		gap: var(--space-xl);
		margin-top: var(--space-xl);
	}

	.list {
		padding: var(--space-md) var(--space-lg);
		background: var(--color-canvas);
		border: 1px solid var(--color-hairline);
		border-radius: var(--card-radius);
	}

	.list-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
		margin-bottom: var(--space-sm);
	}

	.list-header h2 {
		font-size: var(--font-size-body-md);
		font-weight: var(--font-weight-semibold);
	}

	.copy {
		min-height: 0;
		padding: var(--space-xxs) var(--space-xs);
		color: var(--color-slate);
		font-size: var(--font-size-body-sm);
		font-weight: var(--font-weight-medium);
		background: transparent;
		border: none;
		border-radius: var(--button-radius);
	}

	.copy:hover {
		color: var(--color-ink);
		background: var(--color-hairline);
	}

	button:disabled {
		color: var(--color-muted);
		background: var(--color-hairline);
		border-color: var(--color-hairline);
		cursor: not-allowed;
	}

	.notice {
		margin: 0 0 var(--space-md);
		color: var(--color-slate);
		font-size: var(--font-size-body-md);
		line-height: var(--line-height-body);
	}

	.partial {
		margin-top: var(--space-md);
		margin-bottom: 0;
	}

	.unbalanced {
		margin-top: var(--space-md);
		margin-bottom: 0;
		padding: var(--space-sm) var(--space-md);
		color: var(--color-ink);
		background: color-mix(in oklab, var(--color-warning, #f5a623) 18%, var(--color-canvas));
		border: 1px solid color-mix(in oklab, var(--color-warning, #f5a623) 50%, transparent);
		border-radius: var(--radius-md);
		font-size: var(--font-size-body-sm);
	}

	.toggle {
		grid-column: 1 / -1;
		display: flex;
		align-items: flex-start;
		gap: var(--space-sm);
		padding: var(--space-sm) var(--space-md);
		background: var(--color-surface);
		border: 1px solid var(--color-hairline);
		border-radius: var(--radius-md);
		cursor: pointer;
	}

	.toggle input[type='checkbox'] {
		margin-top: calc(var(--space-xxs) / 2);
		width: var(--space-md);
		height: var(--space-md);
		flex: 0 0 auto;
		cursor: pointer;
	}

	.toggle-text {
		display: flex;
		flex-direction: column;
		gap: var(--space-xxs);
	}

	.toggle-label {
		color: var(--color-ink);
		font-size: var(--font-size-body-sm);
		font-weight: var(--font-weight-semibold);
	}

	.toggle-help {
		color: var(--color-slate);
		font-size: var(--font-size-body-sm);
	}

	.list-meta {
		display: flex;
		align-items: center;
		gap: var(--space-sm);
	}

	.score {
		padding: var(--space-xxs) var(--space-xs);
		color: var(--color-slate);
		font-size: var(--font-size-body-sm);
		font-weight: var(--font-weight-medium);
		background: var(--color-surface);
		border: 1px solid var(--color-hairline);
		border-radius: var(--radius-sm, var(--radius-md));
	}

	.score.warn {
		color: var(--color-ink);
		background: color-mix(in oklab, var(--color-warning, #f5a623) 25%, var(--color-canvas));
		border-color: color-mix(in oklab, var(--color-warning, #f5a623) 55%, transparent);
	}

	ol {
		display: grid;
		gap: var(--space-xs);
		margin: 0;
		padding-left: var(--space-xl);
	}

	li {
		padding-left: var(--space-xs);
		color: var(--color-charcoal);
		font-size: var(--font-size-body-md);
		line-height: var(--line-height-body);
	}

	@media (max-width: 640px) {
		.shell {
			width: min(100% - var(--space-xxl), 980px);
			padding: var(--space-xxxl) 0 var(--space-section);
		}

		h1 {
			font-size: var(--font-size-heading-lg);
		}

		.lede {
			font-size: var(--font-size-body-md);
		}

		.panel {
			padding: var(--space-xl);
		}

		.controls {
			grid-template-columns: 1fr;
		}

		.actions {
			justify-content: stretch;
		}

		.actions .button-primary {
			width: 100%;
		}
	}
</style>
