/**
 * The Drizzle sub-path entry point: `@genlexis/core/adapters/drizzle`.
 *
 * Kept out of the main entry so that `drizzle-orm` — an optional peer — never
 * enters a bundle that only calls the engine. It stays in this package while it
 * remains small and the only adapter.
 */
export { createDrizzleGenerationRepository } from './drizzle.js';
