import spec from '../../../../contracts/generation/v1/openapi.yaml?raw';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () =>
	new Response(spec, {
		headers: {
			'Content-Type': 'application/yaml; charset=utf-8',
			'Cache-Control': 'public, max-age=300'
		}
	});
