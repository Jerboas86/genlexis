import {
	generateAcceptedSentences as _generateAcceptedSentences,
	generateBalancedAcceptedSentences as _generateBalancedAcceptedSentences,
	getAcceptedSentenceCount as _getAcceptedSentenceCount,
	getValidationCandidate as _getValidationCandidate,
	recordHumanClassification as _recordHumanClassification,
	recordValidation as _recordValidation
} from '@genlexis/core';
import { repository } from './repository';

export const generateAcceptedSentences = (options: Parameters<typeof _generateAcceptedSentences>[0]) =>
	_generateAcceptedSentences(options, repository);

export const generateBalancedAcceptedSentences = (
	options: Parameters<typeof _generateBalancedAcceptedSentences>[0]
) => _generateBalancedAcceptedSentences(options, repository);

export const getAcceptedSentenceCount = () => _getAcceptedSentenceCount(repository);

export const getValidationCandidate = (pattern?: Parameters<typeof _getValidationCandidate>[0]) =>
	_getValidationCandidate(pattern, repository);

export const recordValidation = (
	sentenceId: number,
	isCorrect: boolean
) => _recordValidation(sentenceId, isCorrect, repository);

export const recordHumanClassification = (
	sentenceId: number,
	input: Parameters<typeof _recordHumanClassification>[1]
) => _recordHumanClassification(sentenceId, input, repository);

export { parseSupportedPattern, SUPPORTED_PATTERNS } from '@genlexis/core';

export type {
	AcceptedItem,
	AcceptedItemWithIpa,
	AcceptedSentence,
	BalancedGenerateResult,
	DetType,
	FindAcceptedItemsOptions,
	FindAcceptedItemsWithIpaOptions,
	GenerateBalancedOptions,
	GenerateOptions,
	GenerateResult,
	Gender,
	GenlexisRepository,
	GenerationRepository,
	GrammNumber,
	HumanClassificationInput,
	LengthUnit,
	LexicalDensity,
	LlmClassification,
	SemanticsLabel,
	SentenceSummary,
	SupportedPattern,
	ValidationRepository
} from '@genlexis/core';
