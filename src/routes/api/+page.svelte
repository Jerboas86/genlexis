<script lang="ts">
	import type { Path } from '$app/types';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { getLocale, localizeHref } from '#lib/paraglide/runtime.js';
	import * as m from '#lib/paraglide/messages.js';
	import type { PageData } from './$types';
	import type { DocEndpoint, DocExample, DocField, LocalizedText } from './+page.server';

	let { data }: { data: PageData } = $props();
	let selectedId = $state('');
	let selectedExample = $state('');
	let copied = $state<string | null>(null);
	let resetCopy: ReturnType<typeof setTimeout> | undefined;

	const endpoint = $derived(
		data.endpoints.find((item) => item.id === selectedId) ?? data.endpoints[0]
	);
	const example = $derived(
		endpoint?.examples.find((item) => item.label === selectedExample) ?? endpoint?.examples[0]
	);
	function resourceLabel(resource: string) {
		if (resource === 'generations') return m.api_resource_generations();
		return resource;
	}

	const localizeText = (value: LocalizedText) => (getLocale() === 'en' ? value.en : value.fr);

	function exampleLabel(label: string) {
		if (label === 'random') return m.api_example_random();
		if (label === 'phoneme_balanced') return m.api_example_balanced();
		return label;
	}

	function formatType(type: string): string {
		return type
			.split(' | ')
			.map((part) => {
				const arrays = part.match(/\[\]/g)?.length ?? 0;
				const base = part.replace(/(?:\[\])+$/, '');
				const translated: Record<string, string> = {
					string: m.api_type_string(),
					integer: m.api_type_integer(),
					number: m.api_type_number(),
					boolean: m.api_type_boolean(),
					object: m.api_type_object()
				};
				return `${translated[base] ?? base}${'[]'.repeat(arrays)}`;
			})
			.join(' | ');
	}

	const bound = (value: number | undefined, fallback: string) =>
		value === undefined ? fallback : String(value);

	function rangeHint(field: DocField): string {
		const { minimum, maximum } = field.constraints;
		if (minimum === undefined && maximum === undefined) return '';
		return m.api_range({ minimum: bound(minimum, '−∞'), maximum: bound(maximum, '+∞') });
	}

	function lengthHint(field: DocField): string {
		const { minLength, maxLength } = field.constraints;
		if (minLength === undefined && maxLength === undefined) return '';
		return m.api_length({ minimum: bound(minLength, '0'), maximum: bound(maxLength, '∞') });
	}

	function fieldHelp(field: DocField): string {
		return [
			clean(localizeText(field.description)),
			field.constraints.enum?.join(' · '),
			rangeHint(field),
			lengthHint(field),
			field.constraints.default === undefined
				? ''
				: m.api_default({ value: field.constraints.default })
		]
			.filter(Boolean)
			.join(' ');
	}

	function select(id: string) {
		selectedId = id;
		selectedExample = '';
		history.replaceState(history.state, '', `#${id}`);
		if (window.matchMedia('(max-width: 920px)').matches)
			document.getElementById('endpoint-content')?.scrollIntoView({ behavior: 'smooth' });
	}

	onMount(() => {
		const fromHash = () => {
			const id = decodeURIComponent(location.hash.slice(1));
			selectedId = data.endpoints.some((item) => item.id === id)
				? id
				: (data.endpoints[0]?.id ?? '');
		};
		fromHash();
		window.addEventListener('hashchange', fromHash);
		return () => {
			window.removeEventListener('hashchange', fromHash);
			clearTimeout(resetCopy);
		};
	});

	async function copy(id: string, content: string) {
		await navigator.clipboard.writeText(content);
		copied = id;
		clearTimeout(resetCopy);
		resetCopy = setTimeout(() => (copied = null), 2000);
	}

	function tokenKind(value: string): string {
		if (value.startsWith('$')) return 'variable';
		return /^[-\d]/.test(value) ? 'number' : 'string';
	}

	function tokenize(code: string, pattern: RegExp) {
		const parts: { text: string; kind: string }[] = [];
		let previous = 0;
		for (const match of code.matchAll(pattern)) {
			const index = match.index;
			if (index > previous) parts.push({ text: code.slice(previous, index), kind: 'plain' });
			const value = match[0];
			parts.push({ text: value, kind: tokenKind(value) });
			previous = index + value.length;
		}
		if (previous < code.length) parts.push({ text: code.slice(previous), kind: 'plain' });
		return parts;
	}

	const JSON_TOKENS = /("(?:\\.|[^"\\])*"|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?)/g;
	const CURL_TOKENS = /(\$[A-Z_]+|--?[A-Za-z][\w-]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')/g;

	const clean = (value: string) => value.replaceAll('**', '').replaceAll('`', '');
</script>

{#snippet codePanel(title: string, content: string, kind: 'curl' | 'json', id: string)}
	<div class="code-panel">
		<div class="code-toolbar">
			<span>{title}</span>
			<button
				type="button"
				onclick={() => copy(id, content)}
				aria-label={`${copied === id ? m.generate_copied() : m.generate_copy()} ${title}`}
			>
				{copied === id ? m.generate_copied() : m.generate_copy()}
			</button>
		</div>
		<pre><code
				>{#each tokenize(content, kind === 'json' ? JSON_TOKENS : CURL_TOKENS) as token, index (index)}<span
						class:syntax-string={token.kind === 'string'}
						class:syntax-number={token.kind === 'number'}
						class:syntax-variable={token.kind === 'variable'}>{token.text}</span
					>{/each}</code
			></pre>
	</div>
{/snippet}

{#snippet fieldContent(field: DocField)}
	<div class="field-line">
		<code>{field.name}</code><span class="field-type">{formatType(field.type)}</span><span
			class:required={field.required}
			class="field-required">{field.required ? m.api_required() : m.api_optional()}</span
		>
	</div>
	{#if fieldHelp(field)}<p>{fieldHelp(field)}</p>{/if}
{/snippet}

{#snippet nestedFields(field: DocField)}
	{#if field.children.length}
		<details class="nested">
			<summary>{m.api_nested_fields({ count: field.children.length })}</summary>
			{#each field.children as child (child.name)}
				<div class="field child">
					{@render fieldContent(child)}
					{@render nestedFields(child)}
				</div>
			{/each}
		</details>
	{/if}
{/snippet}

{#snippet parameterSection(endpoint: DocEndpoint)}
	<section>
		<h3>{m.api_parameters_title()}</h3>
		{#if endpoint.parameters.length === 0}<p>{m.api_no_parameters()}</p>{/if}
		{#each endpoint.parameters as parameter (parameter.name)}
			<div class="field">
				{@render fieldContent(parameter)}
				{@render nestedFields(parameter)}
			</div>
		{/each}
	</section>
{/snippet}

{#snippet responseSection(endpoint: DocEndpoint)}
	<section>
		<h3>{m.api_response_title()}</h3>
		{#each endpoint.responseFields as field (field.name)}
			<div class="field">
				{@render fieldContent(field)}
				{@render nestedFields(field)}
			</div>
		{/each}
	</section>
{/snippet}

{#snippet endpointArticle(endpoint: DocEndpoint)}
	<article id="endpoint-content" class="content">
		<div class="eyebrow">
			<span>{resourceLabel(endpoint.resource)}</span>
		</div>
		<h2>{localizeText(endpoint.title)}</h2>
		<div class="route-line">
			<span class:post={endpoint.method === 'POST'} class="method">{endpoint.method}</span><code
				>{endpoint.server}{endpoint.path}</code
			>
		</div>
		<p class="description">{localizeText(endpoint.description)}</p>

		<section>
			<h3>{m.api_authentication_title()}</h3>
			<p class="security">{localizeText(endpoint.security)}</p>
			<div class="key-example">
				<span>{m.api_key_example_label()}</span>
				<code>glx_0123456789...abcdef</code>
			</div>
			<a class="access-link" href="mailto:benoitdelemps@protonmail.com?subject=Genlexis%20API"
				>{m.api_access_cta()}</a
			>
		</section>

		{@render parameterSection(endpoint)}

		{@render responseSection(endpoint)}

		<section>
			<h3>{m.api_errors_title()}</h3>
			{#each endpoint.responses as response (response.status)}
				<div class="status-row">
					<code class:success={response.status === '200'}>{response.status}</code><span
						>{localizeText(response.description)}</span
					>
				</div>
			{/each}
		</section>
	</article>
{/snippet}

{#snippet examplesPanel(endpoint: DocEndpoint, example: DocExample | undefined)}
	<aside class="examples" aria-label={m.api_examples_title()}>
		<div class="examples-head">
			<strong>{m.api_examples_title()}</strong>{#if endpoint.examples.length > 1}<div
					class="example-tabs"
				>
					{#each endpoint.examples as choice (choice.label)}<button
							type="button"
							class:chosen={example?.label === choice.label}
							onclick={() => (selectedExample = choice.label)}>{exampleLabel(choice.label)}</button
						>{/each}
				</div>{/if}
		</div>
		{#if example}
			{@render codePanel(
				m.api_request_title(),
				example.request,
				'curl',
				`${endpoint.id}-${example.label}-request`
			)}
			{@render codePanel(
				m.api_response_example_title(),
				example.response,
				'json',
				`${endpoint.id}-${example.label}-response`
			)}
		{/if}
	</aside>
{/snippet}

<svelte:head>
	<title>{m.api_meta_title()}</title>
	<meta name="description" content={m.api_intro()} />
</svelte:head>

<div class="docs-shell">
	<div class="docs-heading">
		<a class="back" href={resolve(localizeHref('/') as Path)}>{m.back_home()}</a>
		<h1>{m.api_title()}</h1>
		<p>{m.api_intro()}</p>
	</div>

	<main class="docs-layout">
		<aside class="sidebar" aria-label={m.api_navigation_label()}>
			<nav aria-label={m.api_navigation_label()}>
				<div class="nav-group-title">{m.api_resource_generations()}</div>
				{#each data.endpoints as item (item.id)}
					<a
						href={`#${item.id}`}
						class:active={selectedId === item.id}
						aria-current={selectedId === item.id ? 'page' : undefined}
						onclick={(event) => {
							event.preventDefault();
							select(item.id);
						}}
					>
						<span class:post={item.method === 'POST'} class="mini-method">{item.method}</span>
						<span>{item.path}</span>
					</a>
				{/each}
			</nav>
			<div class="sidebar-footer">
				<a
					href={resolve(localizeHref('/api/openapi.yaml') as Path)}
					download="genlexis-openapi.yaml">{m.api_spec_link()}</a
				>
			</div>
		</aside>

		{#if endpoint}
			{@render endpointArticle(endpoint)}
			{@render examplesPanel(endpoint, example)}
		{/if}
	</main>
</div>

<style>
	.docs-shell {
		width: min(1600px, calc(100% - 2 * var(--container-gutter)));
		margin: 0 auto;
		padding: var(--space-section-sm) 0 var(--space-section-lg);
	}
	.docs-heading {
		max-width: 780px;
		margin-bottom: var(--space-xxxl);
	}
	.back {
		display: inline-flex;
		margin-bottom: var(--space-xxxl);
		padding: var(--space-xs) 0;
		color: var(--color-ink);
		font-size: var(--font-size-body-sm);
		font-weight: var(--font-weight-medium);
		text-decoration: none;
	}
	h1,
	h2,
	h3,
	p {
		margin: 0;
	}
	h1 {
		font-size: var(--font-size-display-lg);
		line-height: var(--line-height-hero);
	}
	.docs-heading p {
		margin-top: var(--space-lg);
		color: var(--color-slate);
		font-size: var(--font-size-subtitle);
		line-height: var(--line-height-body);
	}
	.docs-layout {
		display: grid;
		grid-template-columns: 220px minmax(0, 1fr) minmax(310px, 36%);
		gap: var(--space-xxl);
		align-items: start;
	}
	.sidebar,
	.examples {
		position: sticky;
		top: 96px;
		min-width: 0;
		max-height: calc(100vh - 112px);
		overflow-y: auto;
	}
	.sidebar {
		padding-right: var(--space-md);
		border-right: 1px solid var(--color-hairline);
	}
	.nav-group-title {
		padding: var(--space-xs) 0;
		font-size: var(--font-size-body-sm);
		font-weight: var(--font-weight-semibold);
	}
	.sidebar nav a {
		display: flex;
		align-items: center;
		gap: var(--space-xs);
		min-width: 0;
		padding: var(--space-xs);
		border-radius: var(--radius-md);
		color: var(--color-slate);
		font-size: var(--font-size-body-sm);
		text-decoration: none;
		overflow-wrap: anywhere;
	}
	.sidebar nav a:hover,
	.sidebar nav a.active {
		background: var(--color-surface-soft);
		color: var(--color-ink);
	}
	.sidebar nav a.active {
		box-shadow: inset 3px 0 var(--color-brand-blue);
		font-weight: var(--font-weight-semibold);
	}
	.mini-method {
		flex: none;
		color: #125f60;
		font-size: 10px;
		font-weight: 700;
	}
	.mini-method.post {
		color: #8a4b1b;
	}
	.sidebar-footer {
		display: grid;
		gap: var(--space-sm);
		margin-top: var(--space-xxl);
		padding-top: var(--space-xl);
		border-top: 1px solid var(--color-hairline);
	}
	.sidebar-footer a {
		color: var(--color-brand-blue-deep);
		font-size: var(--font-size-body-sm);
	}
	.access-link {
		display: inline-block;
		margin-top: var(--space-md);
		color: var(--color-brand-blue-deep);
		font-size: var(--font-size-body-sm);
		font-weight: var(--font-weight-semibold);
	}
	.key-example {
		display: grid;
		gap: var(--space-xs);
		margin-top: var(--space-md);
		font-size: var(--font-size-body-sm);
	}
	.key-example code {
		max-width: 100%;
		padding: var(--space-sm);
		border-radius: var(--radius-md);
		background: var(--color-surface-soft);
		overflow-wrap: anywhere;
	}
	.content {
		min-width: 0;
		scroll-margin-top: 100px;
	}
	.eyebrow {
		display: flex;
		gap: var(--space-sm);
		align-items: center;
		color: var(--color-steel);
		font-size: var(--font-size-caption);
		font-weight: var(--font-weight-semibold);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	h2 {
		margin-top: var(--space-sm);
		font-size: var(--font-size-heading-lg);
		line-height: var(--line-height-heading);
	}
	.route-line {
		display: flex;
		gap: var(--space-sm);
		align-items: center;
		margin-top: var(--space-lg);
		padding: var(--space-sm);
		border: 1px solid var(--color-hairline);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		overflow-x: auto;
	}
	.route-line code {
		white-space: nowrap;
		font-size: var(--font-size-body-sm);
	}
	.method {
		padding: 4px 8px;
		border-radius: 5px;
		color: #12605d;
		background: #e3f3ef;
		font-size: var(--font-size-micro);
		font-weight: 700;
	}
	.method.post {
		color: #8a4b1b;
		background: #fff0dc;
	}
	.description,
	.security {
		margin-top: var(--space-lg);
		color: var(--color-slate);
		font-size: var(--font-size-body-md);
		line-height: var(--line-height-body);
		white-space: pre-line;
	}
	.content section {
		margin-top: var(--space-xxxl);
	}
	h3 {
		padding-bottom: var(--space-sm);
		border-bottom: 1px solid var(--color-hairline);
		font-size: var(--font-size-heading-sm);
	}
	.field {
		padding: var(--space-md) 0;
		border-bottom: 1px solid var(--color-hairline-soft);
	}
	.field-line {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-xs);
	}
	.field-line code {
		color: var(--color-ink);
		font-weight: 600;
	}
	.field-type,
	.field-required {
		color: var(--color-steel);
		font-size: var(--font-size-body-sm);
	}
	.field-required.required {
		color: #995017;
	}
	.field p {
		margin-top: var(--space-xs);
		color: var(--color-slate);
		font-size: var(--font-size-body-sm);
		line-height: var(--line-height-body);
	}
	.nested {
		margin-top: var(--space-sm);
	}
	.nested summary {
		color: var(--color-brand-blue-deep);
		cursor: pointer;
		font-size: var(--font-size-body-sm);
	}
	.field.child {
		margin-left: var(--space-md);
		padding-left: var(--space-md);
		border-left: 2px solid var(--color-hairline);
	}
	.status-row {
		display: flex;
		gap: var(--space-md);
		padding: var(--space-md) 0;
		border-bottom: 1px solid var(--color-hairline-soft);
		color: var(--color-slate);
		font-size: var(--font-size-body-sm);
		line-height: var(--line-height-body);
	}
	.status-row code {
		flex: none;
		color: #a94431;
		font-weight: 700;
	}
	.status-row code.success {
		color: #12605d;
	}
	.examples {
		padding-left: var(--space-sm);
	}
	.examples-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-sm);
		margin-bottom: var(--space-md);
	}
	.examples-head strong {
		font-size: var(--font-size-body-md);
	}
	.example-tabs {
		display: flex;
		gap: var(--space-xxs);
	}
	.example-tabs button {
		padding: var(--space-xs);
		border: 0;
		border-radius: var(--radius-md);
		color: var(--color-slate);
		background: transparent;
		cursor: pointer;
		font-size: var(--font-size-body-sm);
	}
	.example-tabs button.chosen {
		color: var(--color-ink);
		background: var(--color-surface-soft);
		font-weight: 600;
	}
	.code-panel {
		margin-bottom: var(--space-lg);
		border-radius: var(--radius-lg);
		overflow: hidden;
		background: #172033;
		color: #f5f7ff;
	}
	.code-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-md);
		padding: var(--space-xs) var(--space-md);
		border-bottom: 1px solid rgba(255, 255, 255, 0.14);
		font-size: var(--font-size-body-sm);
	}
	.code-toolbar button {
		padding: var(--space-xs);
		border: 0;
		border-radius: var(--radius-md);
		color: #dbe8ff;
		background: transparent;
		cursor: pointer;
		font-size: var(--font-size-body-sm);
	}
	.code-toolbar button:hover,
	.code-toolbar button:focus-visible {
		color: #fff;
		background: rgba(255, 255, 255, 0.14);
	}
	pre {
		max-height: 48vh;
		margin: 0;
		padding: var(--space-md);
		overflow: auto;
		font-size: var(--font-size-caption);
		line-height: 1.55;
	}
	.syntax-string {
		color: #a8e6c1;
	}
	.syntax-number {
		color: #ffd191;
	}
	.syntax-variable {
		color: #b6c8ff;
	}
	@media (max-width: 1180px) {
		.docs-layout {
			grid-template-columns: 190px minmax(0, 1fr) minmax(280px, 34%);
			gap: var(--space-lg);
		}
	}
	@media (max-width: 920px) {
		.docs-layout {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--space-xxxl);
		}
		.sidebar,
		.examples {
			position: static;
			max-height: none;
			overflow: visible;
		}
		.sidebar {
			padding-right: 0;
			border-right: 0;
		}
		.examples {
			padding-left: 0;
		}
	}
	@media (max-width: 600px) {
		.docs-shell {
			width: min(100% - var(--space-xxl), 100%);
		}
		h1 {
			font-size: var(--font-size-heading-lg);
		}
		h2 {
			font-size: var(--font-size-heading-md);
		}
		.docs-heading {
			margin-bottom: var(--space-xxl);
		}
		.route-line code {
			font-size: var(--font-size-caption);
		}
	}
</style>
