import { defineEnvVars } from '@sveltejs/kit/env';

// All optional: each consumer already refuses to run without its value (the
// database on first query, the material routes on a failed signature), and
// `vite build` loads these modules without a Doppler context.
const optional = (value: string | undefined) => value || undefined;

export const variables = defineEnvVars({
	PRIVATE_DATABASE_URL: { schema: optional },
	PRIVATE_MATERIAL_API_TOKEN: { schema: optional },
	PRIVATE_MATERIAL_API_TOKEN_PREVIOUS: { schema: optional },
	PRIVATE_MATERIAL_SIGNING_SECRET: { schema: optional },
	PRIVATE_MATERIAL_SIGNING_SECRET_PREVIOUS: { schema: optional }
});
