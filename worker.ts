import app from './.svelte-kit/cloudflare/_worker.js';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { purgeExpiredIdempotency } from './src/lib/server/material/idempotencyPurge';

/**
 * The Worker: the SvelteKit app for requests, and one scheduled job.
 *
 * SvelteKit's adapter produces `_worker.js` — at the path `wrangler.svelte.jsonc`
 * names, never this one — and this file wraps it so the Worker can also answer
 * a cron. Everything the scheduled handler imports must be free of `$env` and
 * `$lib`: those are Vite's, and this file is bundled by wrangler.
 */

type Env = {
	ASSETS: Fetcher;
	PRIVATE_DATABASE_URL: string;
};

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		return app.fetch(request, env, ctx);
	},

	/**
	 * Drops idempotency entries past their ninety days.
	 *
	 * The ledger is what makes a repeated key replay instead of drawing again;
	 * entries lapse after the retention `limits.json` publishes, and until now
	 * nothing removed them. The draws stay — a `drawId` must keep resolving —
	 * so this touches only the replay index.
	 */
	async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
		const database = drizzle(neon(env.PRIVATE_DATABASE_URL));
		ctx.waitUntil(
			purgeExpiredIdempotency(database).then(
				(purged) => console.log(JSON.stringify({ event: 'idempotency_purge', purged })),
				(cause: unknown) =>
					console.error(
						JSON.stringify({
							event: 'idempotency_purge_failed',
							message: cause instanceof Error ? cause.message : String(cause)
						})
					)
			)
		);
	}
};
