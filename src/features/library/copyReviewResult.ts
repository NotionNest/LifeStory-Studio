import type { Node as DocumentNode } from '@tiptap/pm/model'
import type { CopyReviewResult } from '@/services/copyReview'
import {
  resolveReviewReferences,
  type ResolvedReviewReference,
  type ReviewTextBlock,
} from './copyReviewDocument'

export interface ResolvedReviewSuggestion {
  id: string
  type: string
  references: ResolvedReviewReference[]
  reason: string
  replacement: string | null
}

const labels: Record<CopyReviewResult['suggestions'][number]['category'], string> = {
  typo: '疑似错别字',
  punctuation: '标点问题',
  fluency: '语句不通顺',
  repetition: '重复表达',
  wordiness: '表达冗长',
  consistency: '建议核对',
}

export function resolveReviewResult(
  doc: DocumentNode,
  blocks: ReviewTextBlock[],
  result: CopyReviewResult,
): ResolvedReviewSuggestion[] {
  return result.suggestions.map((suggestion) => {
    const references = resolveReviewReferences(doc, blocks, suggestion.references)
    return {
      id: suggestion.id,
      type: labels[suggestion.category],
      references,
      reason: suggestion.reason,
      replacement:
        suggestion.category !== 'consistency' &&
        references.length === 1 &&
        references[0].replaceable
          ? suggestion.replacement
          : null,
    }
  })
}
