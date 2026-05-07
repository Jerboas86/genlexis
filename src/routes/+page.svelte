<script lang="ts">
	import type { Pathname } from '$app/types';
	import { resolve } from '$app/paths';
	import * as m from '$lib/paraglide/messages';
	import { localizeHref } from '$lib/paraglide/runtime';
</script>

<svelte:head>
	<title>{m.home_meta_title()}</title>
</svelte:head>

<main class="shell">
	<section class="intro">
		<h1>{m.home_title()}</h1>
		<p>{m.home_body()}</p>
	</section>

	<nav aria-label={m.home_navigation_label()} class="actions">
		<a class="product-card coral" href={resolve(localizeHref('/validate') as Pathname)}>
			<small>01</small>
			<strong>{m.validate_title()}</strong>
			<span>{m.home_validate_description()}</span>
		</a>
		<a class="product-card blue" href={resolve(localizeHref('/generate') as Pathname)}>
			<small>02</small>
			<strong>{m.generate_title()}</strong>
			<span>{m.home_generate_description()}</span>
		</a>
	</nav>
</main>

<style>
	.shell {
		width: min(var(--container), calc(100% - (var(--container-gutter) * 2)));
		margin: 0 auto;
		padding: var(--space-hero) 0 var(--space-section-lg);
	}

	.intro {
		max-width: 880px;
	}

	h1 {
		margin: 0;
		max-width: 920px;
		font-size: var(--font-size-hero);
		font-weight: var(--font-weight-semibold);
		line-height: var(--line-height-hero);
		letter-spacing: var(--letter-spacing-base);
	}

	.intro p {
		margin: var(--space-xl) 0 0;
		max-width: 720px;
		color: var(--color-slate);
		font-size: var(--font-size-subtitle);
		font-weight: var(--font-weight-medium);
		line-height: var(--line-height-body);
	}

	.actions {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-xl);
		margin-top: var(--space-section);
	}

	.product-card {
		display: grid;
		align-content: space-between;
		gap: var(--space-xl);
		min-height: 280px;
		padding: var(--product-card-padding);
		color: var(--color-on-primary);
		text-decoration: none;
		border-radius: var(--product-card-radius);
		overflow: hidden;
	}

	.product-card:hover {
		transform: translateY(-2px);
	}

	.coral {
		background:
			radial-gradient(circle at 80% 10%, rgba(255, 255, 255, 0.28), transparent 34%),
			linear-gradient(135deg, var(--color-brand-coral), var(--color-brand-magenta));
	}

	.blue {
		background:
			radial-gradient(circle at 78% 14%, rgba(191, 219, 254, 0.45), transparent 32%),
			linear-gradient(135deg, var(--color-brand-blue), var(--color-brand-purple));
	}

	small {
		font-size: var(--font-size-caption);
		font-weight: var(--font-weight-semibold);
		line-height: var(--line-height-body);
	}

	strong {
		display: block;
		margin-top: auto;
		font-size: var(--font-size-heading-md);
		font-weight: var(--font-weight-semibold);
		line-height: var(--line-height-heading);
		letter-spacing: var(--letter-spacing-base);
	}

	span {
		max-width: 34ch;
		font-size: var(--font-size-body-md);
		line-height: var(--line-height-body);
	}

	@media (max-width: 900px) {
		h1 {
			font-size: var(--font-size-display-lg);
		}
	}

	@media (max-width: 700px) {
		.shell {
			width: min(100% - var(--space-xxl), var(--container));
			padding: var(--space-section) 0 var(--space-section-sm);
		}

		h1 {
			font-size: var(--font-size-heading-lg);
		}

		.actions {
			grid-template-columns: 1fr;
			gap: var(--space-md);
			margin-top: var(--space-xxxl);
		}

		.product-card {
			min-height: 220px;
			padding: var(--space-xl);
			border-radius: var(--radius-xxxl);
		}

		strong {
			font-size: var(--font-size-heading-sm);
		}
	}
</style>
