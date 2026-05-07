<script lang="ts">
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as m from '$lib/paraglide/messages';
	import { locales, localizeHref } from '$lib/paraglide/runtime';
	import favicon from '$lib/assets/favicon.svg';
	import '../base.css';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<header class="site-header">
	<a class="brand" href="/">
		<strong>{m.app_name()}</strong>
		<span>{m.app_caption()}</span>
	</a>
</header>

{@render children()}

<div style="display:none">
	{#each locales as locale (locale)}
		<a href={resolve(localizeHref(page.url.pathname, { locale }) as Pathname)}>{locale}</a>
	{/each}
</div>

<style>
	.site-header {
		position: sticky;
		top: 0;
		z-index: 10;
		background: color-mix(in srgb, var(--color-canvas) 94%, transparent);
		border-bottom: 1px solid var(--color-hairline-soft);
		backdrop-filter: blur(16px);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: var(--space-md);
		width: fit-content;
		min-height: 76px;
		padding: 0 var(--container-gutter);
		color: var(--color-ink);
		text-decoration: none;
	}

	.brand strong {
		font-size: var(--font-size-heading-sm);
		font-weight: var(--font-weight-bold);
		line-height: 1.2;
	}

	.brand span {
		color: var(--color-steel);
		font-size: var(--font-size-body-md);
		font-weight: var(--font-weight-medium);
		line-height: var(--line-height-body);
	}

	@media (max-width: 700px) {
		.brand {
			align-items: flex-start;
			flex-direction: column;
			justify-content: center;
			gap: 0;
			padding: 0 var(--space-md);
			min-height: 78px;
		}

		.brand strong {
			font-size: var(--font-size-card-title);
		}

		.brand span {
			font-size: var(--font-size-body-sm);
		}
	}
</style>
