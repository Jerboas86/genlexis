<script lang="ts">
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import type { PageServerData } from './$types';

	let { data }: { data: PageServerData } = $props();
</script>

<svelte:head>
	<title>{m.validate_meta_title()}</title>
</svelte:head>

<main class="shell">
	<a class="back" href={resolve(localizeHref('/') as Pathname)}>{m.back_home()}</a>

	<section class="page-header">
		<h1>{m.validate_title()}</h1>
		<p class="lede">{m.validate_instruction()}</p>
	</section>

	{#if data.candidate}
		<article class="candidate" aria-labelledby="candidate-heading">
			<h2 id="candidate-heading">{m.validate_candidate_label()}</h2>
			<p class="sentence">{data.candidate.sentence}</p>
			<p class="meta">{m.validate_vote_count({ count: data.candidate.voteCount })}</p>
		</article>

		<div class="vote-actions" aria-label={m.validate_actions_label()}>
			<form method="post" action="?/incorrect">
				<input type="hidden" name="sentenceId" value={data.candidate.sentenceId} />
				<button class="vote-button vote-button-incorrect" type="submit">
					{m.validate_incorrect()}
				</button>
			</form>
			<form method="post" action="?/correct">
				<input type="hidden" name="sentenceId" value={data.candidate.sentenceId} />
				<button class="vote-button vote-button-correct" type="submit">{m.validate_correct()}</button
				>
			</form>
		</div>
	{:else}
		<section class="empty">
			<h2>{m.validate_empty_title()}</h2>
			<p>{m.validate_empty_body()}</p>
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
	}
</style>
