<script lang="ts">
	import type { Pathname } from '$app/types';
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
	import type { ActionData, PageServerData } from './$types';

	let { data, form }: { data: PageServerData; form: ActionData } = $props();

	const sentences = $derived(form && 'sentences' in form ? (form.sentences ?? []) : []);

	let copied = $state(false);
	let copyResetTimeout: ReturnType<typeof setTimeout> | undefined;

	async function copySentences() {
		const text = sentences.map((s) => s.sentence).join('\n');
		await navigator.clipboard.writeText(text);
		copied = true;
		clearTimeout(copyResetTimeout);
		copyResetTimeout = setTimeout(() => {
			copied = false;
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
		<p class="lede">{m.generate_instruction({ count: data.requiredCount })}</p>
	</section>

	<section class="panel" aria-live="polite">
		<div class="status">
			{#if !data.canGenerate}
				<p class="notice">{m.generate_disabled_body({ count: data.requiredCount })}</p>
			{:else if !sentences.length}
				<p class="notice">{m.generate_ready_body()}</p>
			{/if}

			<form method="post" use:enhance>
				<button class="button-primary" type="submit" disabled={!data.canGenerate}>
					{sentences.length ? m.generate_refresh() : m.generate_button()}
				</button>
			</form>
		</div>

		{#if data.canGenerate && sentences.length}
			<div class="results">
				<ol>
					{#each sentences as sentence (sentence.sentenceId)}
						<li>{sentence.sentence}</li>
					{/each}
				</ol>
				<button class="copy" type="button" onclick={copySentences} aria-live="polite">
					{copied ? m.generate_copied() : m.generate_copy()}
				</button>
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

	.status {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
	}

	.status form {
		flex-shrink: 0;
		margin-left: auto;
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

	.results {
		position: relative;
		margin-top: var(--space-xl);
	}

	.copy {
		position: absolute;
		top: 0;
		right: 0;
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
		margin: 0;
		color: var(--color-slate);
		font-size: var(--font-size-body-md);
		line-height: var(--line-height-body);
	}

	ol {
		display: grid;
		gap: var(--space-md);
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

		.status {
			align-items: stretch;
			flex-direction: column;
		}

		.status form {
			margin-left: 0;
		}

		button,
		form {
			width: 100%;
		}
	}
</style>
