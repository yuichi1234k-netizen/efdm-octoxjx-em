// src/schemas.ts
// Single Responsibility: Define core domain models for PluginData and Discovery.

import * as v from 'valibot';

export type OpenIssueLabel = 'bug' | 'feature_request' | 'documentation' | 'question' | 'security' | 'other';
export type ClosedIssueReason = 'completed' | 'fixed' | 'wont_fix' | 'not_planned' | 'duplicate' | 'other';

export interface OpenIssue {
  readonly label: OpenIssueLabel;
  readonly createdAt: string;
}

export interface ClosedIssue {
  readonly originalLabel: OpenIssueLabel;
  readonly reason: ClosedIssueReason;
  readonly createdAt: string;
  readonly closedAt: string;
}

export interface OpenPR {
  readonly createdAt: string;
}

export interface ClosedPR {
  readonly createdAt: string;
  readonly closedAt: string;
}

export interface MergedPR {
  readonly createdAt: string;
  readonly mergedAt: string;
}

export interface Release {
  readonly publishedAt: string;
  readonly downloads: number;
}

export interface PluginData {
  readonly totalDownloads: number;
  readonly stargazers: number;
  readonly createdAt: string;
  readonly latestReleaseAt: string;
  readonly lastCommitDate: string;
  readonly commitCountInLast24Months: number;
  readonly totalReleases: number;
  readonly releases: readonly Release[];
  readonly openIssues: readonly OpenIssue[];
  readonly closedIssues: readonly ClosedIssue[];
  readonly openPRs: readonly OpenPR[];
  readonly closedPRs: readonly ClosedPR[];
  readonly mergedPRs: readonly MergedPR[];
}

// ─── Discovery Schemas (Beta Plugins) ────────────────────────────────────────

/**
 * Updated schema to reflect changes in obsidianstats.com/beta data structure.
 * Includes explicit pluginId and metadata enrichment timestamps.
 */
export const NextDataEntrySchema = v.object({
  id: v.string(),
  prNumber: v.number(),
  prStatus: v.nullish(v.string()),
  status: v.nullish(v.string()),
  prLabels: v.nullish(v.string()),
  type: v.nullish(v.string()),
  operation: v.nullish(v.string()),
  repo: v.nullish(v.string()),
  pluginId: v.nullish(v.string()), // New: Explicit plugin identifier
  name: v.nullish(v.string()),
  version: v.nullish(v.string()),
  description: v.nullish(v.string()),
  author: v.nullish(v.string()),
  createdAt: v.number(),
  lastUpdatedAt: v.number(),
  lastClassifiedAt: v.nullish(v.number()),
  lastEnrichedAt: v.nullish(v.number()),
  needManualReview: v.nullish(v.boolean()),
  manualReviewReason: v.nullish(v.string()),
});

export type NextDataEntry = v.InferOutput<typeof NextDataEntrySchema>;

export const NextDataRootSchema = v.object({
  props: v.object({
    pageProps: v.object({
      entries: v.array(NextDataEntrySchema),
    }),
  }),
});
