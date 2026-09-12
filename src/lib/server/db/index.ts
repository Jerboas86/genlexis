import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';
import { env } from '$env/dynamic/private';

type Database = ReturnType<typeof create>;

function create() {
	if (!env.PRIVATE_DATABASE_URL) throw new Error('PRIVATE_DATABASE_URL is not set');
	return drizzle(neon(env.PRIVATE_DATABASE_URL), { schema });
}

let instance: Database | undefined;

/**
 * The database, opened on first use rather than on import.
 *
 * The connection string is a runtime secret, and this module used to demand it
 * the moment anything imported it. That made `vite build` — which loads server
 * modules to bundle them and never connects — fail without a Doppler context,
 * for a value the artefact does not contain. Nothing here is inlined; the same
 * bundle serves every environment, and the environment reaches it through
 * `platform.env` when a request arrives. The check still fires, with the same
 * message, on the first query.
 */
export const db: Database = new Proxy({} as Database, {
	get(_target, property, receiver) {
		instance ??= create();
		const value = Reflect.get(instance, property, receiver);
		return typeof value === 'function' ? value.bind(instance) : value;
	}
});
