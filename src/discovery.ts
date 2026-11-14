// src/discovery.ts
// Single Responsibility: Fetch and normalize metadata for Beta plugins with extensive logging.

import * as v from 'valibot';
import { NextDataRootSchema, type NextDataEntry } from './schemas.js';
import { scrubRepositoryUrl, getRepoName } from './stringUtils.js';

/**
 * Interface for discovered plugins.
 * Updated to include 'undefined' in optional property types to satisfy 
 * 'exactOptionalPropertyTypes: true' compiler configuration.
 */
export interface DiscoveredPlugin {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly author: string;
  readonly repo: string;
  readonly prNumber?: number | undefined;
  readonly prStatus?: string | null | undefined;
  readonly prLabels?: readonly string[] | undefined;
}

const USER_AGENT = 'CanaryScorer (yuuchi1234k-prog; https://github.com/yuuchi1234k-prog/CanaryScorer)';

/**
 * Scrapes the ObsidianStats beta page for plugin data.
 * Adapted to handle schema changes and strict optional property types.
 */
export async function fetchBetaPlugins(): Promise<DiscoveredPlugin[]> {
  console.log('🔍 [Discovery] Starting Beta Plugins fetch from obsidianstats.com...');
  try {
    const url = 'https://www.obsidianstats.com/beta';
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT }
    });

    console.log(`🔍 [Discovery] HTTP Status: ${res.status} ${res.statusText}`);

    if (!res.ok) {
      console.error(`❌ [Discovery] Failed to fetch beta plugins. Status: ${res.status}`);
      return [];
    }

    const html = await res.text();
    console.log(`🔍 [Discovery] Received HTML content (${html.length} bytes). Parsing for __NEXT_DATA__...`);

    const regex = /<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/;
    const match = regex.exec(html);
    
    if (!match || typeof match[1] !== 'string') {
      console.warn('⚠️ [Discovery] No __NEXT_DATA__ script tag found in HTML. The site structure may have changed.');
      return [];
    }
    
    console.log('🔍 [Discovery] __NEXT_DATA__ found. Parsing JSON...');
    const json = JSON.parse(match[1]) as unknown;
    
    console.log('🔍 [Discovery] Validating JSON schema...');
    const parseResult = v.safeParse(NextDataRootSchema, json);
    
    if (!parseResult.success) {
      console.error('❌ [Discovery] Beta JSON schema validation failed:', JSON.stringify(parseResult.issues, null, 2));
      return [];
    }
    
    const { entries } = parseResult.output.props.pageProps;
    console.log(`🔍 [Discovery] Found ${entries.length} raw entries. Filtering for valid plugins...`);

    const plugins: DiscoveredPlugin[] = [];
    
    for (const entry of entries as readonly NextDataEntry[]) {
      if (entry.type !== 'plugin') { 
        continue; 
      }
      
      const { repo, name: pluginName } = entry;

      if (typeof repo !== 'string' || repo.length === 0) {
        console.warn(`⚠️ [Discovery] Skipping entry ${entry.id}: Missing repo URL.`);
        continue; 
      }
      if (typeof pluginName !== 'string' || pluginName.length === 0) { 
        console.warn(`⚠️ [Discovery] Skipping entry ${entry.id}: Missing plugin name.`);
        continue; 
      }
      
      const scrubbedRepo = scrubRepositoryUrl(repo);
      if (scrubbedRepo.length === 0) { 
        console.warn(`⚠️ [Discovery] Skipping entry ${entry.id}: Repo URL '${repo}' scrubbed to empty string.`);
        continue; 
      }

      /**
       * ID Derivation Strategy:
       * 1. Prefer explicit 'pluginId' provided by the site (e.g., "mofa-publish").
       * 2. Fallback to deriving from repository name (e.g., "obsidian-mofa-publish").
       */
      const derivedId = (entry.pluginId !== null && entry.pluginId !== undefined && entry.pluginId.length > 0)
        ? entry.pluginId
        : getRepoName(scrubbedRepo);

      if (derivedId.length === 0) {
        console.warn(`⚠️ [Discovery] Skipping entry ${entry.id}: Could not derive ID from repo '${scrubbedRepo}' or pluginId field.`);
        continue;
      }
      
      const rawLabelsStr = entry.prLabels ?? '';
      const rawLabels = rawLabelsStr.split(',');
      const labels = rawLabels
        .map((l: string): string => l.trim())
        .filter((l: string): boolean => l.toLowerCase() !== 'plugin' && l.length > 0);
          
      plugins.push({
        id: derivedId,
        name: pluginName,
        description: entry.description ?? 'No description available.',
        author: entry.author ?? 'Unknown',
        repo: scrubbedRepo,
        prNumber: entry.prNumber,
        // (entry.status ?? entry.prStatus) can be string | null | undefined.
        // DiscoveredPlugin.prStatus now explicitly accepts undefined to satisfy exactOptionalPropertyTypes.
        prStatus: entry.status ?? entry.prStatus,
        prLabels: labels,
      });
    }

    console.log(`✅ [Discovery] Successfully discovered ${plugins.length} Beta plugins.`);
    return plugins;
  } catch (e: unknown) {
    console.error('❌ [Discovery] Critical error fetching beta plugins:', e);
    return [];
  }
}
