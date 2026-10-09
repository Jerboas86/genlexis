import adapter from '@sveltejs/adapter-cloudflare';

// SvelteKit 3 reads its configuration from the `sveltekit(...)` plugin in
// `vite.config.ts`; this module only exists so ESLint can share the same object.
/** @type {import('@sveltejs/kit/vite').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true),
		experimental: {
			async: true
		}
	},
	// The adapter writes the request handler to its own entrypoint, named in
	// `wrangler.svelte.jsonc`. The deployed Worker (`worker.ts`) wraps it to add
	// the scheduled handler; given the real config, the adapter would overwrite it.
	adapter: adapter({ config: 'wrangler.svelte.jsonc' }),
	experimental: {
		remoteFunctions: true
	}
};

export default config;
