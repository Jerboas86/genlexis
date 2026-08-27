# `@genlexis/core`

The sentence generation and phoneme-balancing engine used by Genlexis.

The package contains **no corpus**. The accepted sentences, their votes and the
per-language phoneme distribution live in the Genlexis database; the engine
reaches them through a `GenerationRepository` the caller injects. Installing the
package therefore makes the _engine_ available, never the material.

## Install

```sh
pnpm add @genlexis/core
```

Node 20 or later. ESM only.

## Entry points

| Specifier                         | Contents                                       |
| --------------------------------- | ---------------------------------------------- |
| `@genlexis/core`                  | the engine, its options and result types, pure |
| `@genlexis/core/adapters/drizzle` | the Drizzle-backed `GenerationRepository`      |

`drizzle-orm` is an **optional** peer dependency and is only needed by the
adapter sub-path. Importing the main entry point never pulls it into a bundle.

## Injecting a repository

```ts
import { generateBalancedAcceptedSentences, type GenerationRepository } from '@genlexis/core';

const repository: GenerationRepository = {
	countAcceptedSentences: async () => 4_200,
	findRandomAcceptedItems: async (options) => myPool(options),
	findAcceptedItemsWithIpa: async (options) => myPoolWithIpa(options),
	getPhonemeDistribution: async (language) => myDistribution(language)
};

const result = await generateBalancedAcceptedSentences(
	{
		language: 'fr-FR',
		pattern: 'np_verb',
		lexicalDensity: 'medium',
		listCount: 1,
		itemsPerList: 20,
		seed: 'a-stable-seed'
	},
	repository
);

result.lists; // AcceptedSentence[][]
result.scores; // per-list L1 distance to the language distribution
result.aggregateScore;
```

The same call with the same seed against the same pool returns the same lists —
which is what makes a draw replayable four years later, provided the pool
revision is recorded alongside the seed.

With Drizzle:

```ts
import { createDrizzleGenerationRepository } from '@genlexis/core/adapters/drizzle';
```

## Compatibility

SemVer. Before `1.0.0` a minor release may still remove a public symbol; after
`1.0.0`, breaking changes are reserved for major releases.
