import YAML from 'yaml';
import generationSpec from '../../../contracts/generation/v1/openapi.yaml?raw';
import randomResponse from './examples/generation-random.json';
import balancedResponse from './examples/generation-balanced.json';
import type { PageServerLoad } from './$types';

type Schema = {
	$ref?: string;
	type?: string;
	description?: string;
	'x-description-fr'?: string;
	enum?: unknown[];
	const?: unknown;
	minimum?: number;
	maximum?: number;
	minLength?: number;
	maxLength?: number;
	default?: unknown;
	properties?: Record<string, Schema>;
	required?: string[];
	items?: Schema;
	oneOf?: Schema[];
};

type ApiSpec = {
	servers?: { url: string }[];
	security?: Record<string, unknown>[];
	paths: Record<string, Record<string, ApiOperation>>;
	components: Record<string, unknown>;
};

type ApiOperation = {
	operationId: string;
	summary: string;
	'x-summary-fr'?: string;
	description?: string;
	'x-description-fr'?: string;
	security?: Record<string, unknown>[];
	parameters?: {
		name: string;
		in: string;
		required?: boolean;
		schema: Schema;
		description?: string;
	}[];
	requestBody?: { content?: Record<string, { schema?: Schema }> };
	responses: Record<
		string,
		{
			$ref?: string;
			description?: string;
			'x-description-fr'?: string;
			content?: Record<string, { schema?: Schema }>;
		}
	>;
};

export type LocalizedText = { en: string; fr: string };

export type DocField = {
	name: string;
	type: string;
	required: boolean;
	description: LocalizedText;
	constraints: {
		enum?: string[];
		minimum?: number;
		maximum?: number;
		minLength?: number;
		maxLength?: number;
		default?: string;
	};
	children: DocField[];
};

export type DocExample = { label: string; request: string; response: string };

export type DocEndpoint = {
	id: string;
	method: string;
	path: string;
	server: string;
	resource: string;
	title: LocalizedText;
	description: LocalizedText;
	security: LocalizedText;
	parameters: DocField[];
	responseFields: DocField[];
	responses: { status: string; description: LocalizedText }[];
	examples: DocExample[];
};

function resolve<T>(spec: ApiSpec, value: T & { $ref?: string }): T {
	if (!value.$ref) return value;
	const parts = value.$ref.replace(/^#\//, '').split('/');
	let target: unknown = spec;
	for (const part of parts) target = (target as Record<string, unknown>)[part];
	return resolve(spec, target as T & { $ref?: string });
}

function describeType(spec: ApiSpec, raw: Schema): string {
	const schema = resolve(spec, raw);
	if (schema.oneOf) return schema.oneOf.map((variant) => describeType(spec, variant)).join(' | ');
	if (schema.const !== undefined) return JSON.stringify(schema.const);
	if (schema.type === 'array') return `${describeType(spec, schema.items ?? {})}[]`;
	return schema.type ?? 'string';
}

function localized(en?: string, fr?: string): LocalizedText {
	const english = en?.trim() ?? '';
	return { en: english, fr: fr?.trim() ?? english };
}

function field(spec: ApiSpec, name: string, raw: Schema, required: boolean): DocField {
	const schema = resolve(spec, raw);
	return {
		name,
		type: describeType(spec, schema),
		required,
		description: localized(
			raw.description ?? schema.description,
			raw['x-description-fr'] ?? schema['x-description-fr']
		),
		constraints: {
			enum: schema.enum?.map(String),
			minimum: schema.minimum,
			maximum: schema.maximum,
			minLength: schema.minLength,
			maxLength: schema.maxLength,
			default: schema.default === undefined ? undefined : String(schema.default)
		},
		children: Object.entries(schema.properties ?? {}).map(([childName, child]) =>
			field(spec, childName, child, schema.required?.includes(childName) ?? false)
		)
	};
}

function fields(spec: ApiSpec, schema?: Schema): DocField[] {
	if (!schema) return [];
	const resolved = resolve(spec, schema);
	return Object.entries(resolved.properties ?? {}).map(([name, property]) =>
		field(spec, name, property, resolved.required?.includes(name) ?? false)
	);
}

function curl(method: string, server: string, path: string, body?: unknown): string {
	const base = `curl -X ${method} ${server}${path}`;
	const lines = [base, '  -H "Authorization: Bearer $GENLEXIS_API_KEY"'];
	if (body !== undefined) {
		lines.push('  -H "Content-Type: application/json"');
		lines.push(`  -d '${JSON.stringify(body, null, 2)}'`);
	}
	return lines.join(' ' + '\\' + '\n');
}

type ExampleSource = { label: string; body: unknown; response: unknown };

const generationExamples: ExampleSource[] = [
	{
		label: 'random',
		body: {
			selection: 'random',
			language: 'fr-FR',
			pattern: 'np_verb',
			listCount: 1,
			itemsPerList: 1,
			seed: 'api-docs-v1'
		},
		response: randomResponse
	},
	{
		label: 'phoneme_balanced',
		body: {
			selection: 'phoneme_balanced',
			language: 'fr-FR',
			pattern: 'np_verb',
			listCount: 1,
			itemsPerList: 1,
			seed: 'api-docs-v1'
		},
		response: balancedResponse
	}
];

const examples: Record<string, ExampleSource[]> = {
	createGeneration: generationExamples
};

function securityDescription(spec: ApiSpec, operation: ApiOperation): LocalizedText {
	const schemes = spec.components.securitySchemes as Record<
		string,
		{ description?: string; 'x-description-fr'?: string }
	>;
	const descriptions = (operation.security ?? spec.security ?? [])
		.flatMap((security) => Object.keys(security))
		.map((name) =>
			localized(schemes?.[name]?.description ?? name, schemes?.[name]?.['x-description-fr'])
		);
	return {
		en: descriptions.map((item) => item.en).join('\n'),
		fr: descriptions.map((item) => item.fr).join('\n')
	};
}

function endpoints(raw: string): DocEndpoint[] {
	const spec = YAML.parse(raw) as ApiSpec;
	return Object.entries(spec.paths).flatMap(([path, operations]) =>
		Object.entries(operations).map(([method, operation]) => {
			const server = spec.servers?.[0]?.url ?? '';
			const requestSchema = operation.requestBody?.content?.['application/json']?.schema;
			const success = resolve(spec, operation.responses['200']);
			const responseSchema = success.content?.['application/json']?.schema;
			return {
				id: operation.operationId,
				method: method.toUpperCase(),
				path,
				server,
				resource: path.split('/')[2],
				title: localized(operation.summary, operation['x-summary-fr']),
				description: localized(operation.description, operation['x-description-fr']),
				security: securityDescription(spec, operation),
				parameters: [
					...(operation.parameters ?? []).map((parameter) => {
						const documented = field(
							spec,
							parameter.name,
							parameter.schema,
							parameter.required ?? false
						);
						return {
							...documented,
							description: parameter.description
								? localized(parameter.description)
								: documented.description
						};
					}),
					...fields(spec, requestSchema)
				],
				responseFields: fields(spec, responseSchema),
				responses: Object.entries(operation.responses).map(([status, response]) => {
					const documented = resolve(spec, response);
					return {
						status,
						description: localized(documented.description, documented['x-description-fr'])
					};
				}),
				examples: (examples[operation.operationId] ?? []).map((example) => ({
					label: example.label,
					request: curl(method.toUpperCase(), server, path, example.body),
					response: JSON.stringify(example.response, null, 2)
				}))
			};
		})
	);
}

export const load: PageServerLoad = () => ({
	endpoints: endpoints(generationSpec)
});
