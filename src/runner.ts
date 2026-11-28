// src/runner.ts
// Single Responsibility: Orchestrate the fetching of plugins sequentially per category, respecting global deadlines and ensuring a clean slate.

import fs from 'node:fs';
import path from 'node:path';
import { fetchPluginData } from './fetch/fetch-index.js';
import { fetchBetaPlugins, type DiscoveredPlugin } from './discovery.js';
import { writeJsonAtomic } from './fileUtils.js';

const MAX_DURATION_MS = 5.5 * 60 * 60 * 1000; // 5.5 hours
const OFFSET = 1000;
const LIMIT = 1000;

async function processCategory(
  plugins: readonly DiscoveredPlugin[],
  dataDir: string,
  pat: string,
  label: string,
  deadline: number
): Promise<void> {
  console.log(`\n📂 [${label}] Preparing Category...`);

  // 1. Clean Slate: Wipe existing data directory to prevent accumulation of deleted or out-of-batch plugins
  if (fs.existsSync(dataDir)) {
    console.log(`🧹 [${label}] Cleaning existing data directory: ${dataDir}`);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`📁 [${label}] Created fresh data directory: ${dataDir}`);
  
  if (plugins.length === 0) {
    console.log(`📦 [${label}] No plugins eligible for processing in this range. Skipping.`);
    return;
  }

  const total: number = plugins.length;
  console.log(`📦 [${label}] Processing ${total} plugins (Range: ${OFFSET + 1} to ${OFFSET + total}).`);
  console.log("-----------------------------------------------");

  let completed: number = 0;
  let successCount: number = 0;
  let failCount: number = 0;

  for (const plugin of plugins) {
    // 2. Check Global Deadline
    if (Date.now() > deadline) {
      console.log(`⏳ [${label}] Global deadline exceeded at ${new Date().toISOString()}. Stopping process.`);
      break;
    }

    const filePath: string = path.join(dataDir, `${plugin.id}.json`);
    
    // 3. Forced Fetch: Freshness checks removed per "Clean Slate" requirement
    console.log(`📡 [${label}] [${String(completed + 1).padStart(4, ' ')}/${total}] ${plugin.id.padEnd(30)} -> Fetching`);

    const pluginStart: number = Date.now();
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await fetchPluginData({ pat, repo: plugin.repo }, deadline);

      if (result.isOk()) {
        // Atomic Write to prevent data corruption
        writeJsonAtomic(filePath, result.value);
        
        successCount++;
        const duration: number = Date.now() - pluginStart;
        console.log(`✅ [${label}] [${String(completed + 1).padStart(4, ' ')}/${total}] ${plugin.id.padEnd(30)} SUCCESS (${duration}ms)`);
      } else {
        const errData = result.error;
        if (errData.kind === "DeadlineExceededError") {
          console.log(`⏳ [${label}] Rate limit wait exceeds deadline for ${plugin.id}. Stopping.`);
          break;
        }
        failCount++;
        console.error(`❌ [${label}] [${String(completed + 1).padStart(4, ' ')}/${total}] ${plugin.id.padEnd(30)} FAILED: [${errData.kind}] ${errData.message}`);
        if ('issues' in errData) {
          console.error(`   Validation Issues:`, JSON.stringify(errData.issues));
        }
      }
    } catch (err: unknown) {
      failCount++;
      const msg: string = err instanceof Error ? err.message : String(err);
      console.error(`💥 [${label}] [${String(completed + 1).padStart(4, ' ')}/${total}] ${plugin.id.padEnd(30)} CRITICAL EXCEPTION: ${msg}`);
    } finally {
      completed++;
    }
  }

  console.log("-----------------------------------------------");
  console.log(`🏁 [${label}] FETCH STOPPED/COMPLETE`);
  console.log(`✅ Successful:      ${successCount}`);
  console.log(`❌ Failed:          ${failCount}`);
  console.log(`📊 Total Processed: ${successCount + failCount}`);
  console.log("-----------------------------------------------");
}

async function main(): Promise<void> {
  const startTime: number = Date.now();
  const deadline: number = startTime + MAX_DURATION_MS;
  
  console.log("=================================================");
  console.log(`🚀 STARTING PLUGIN DATA FETCH (BATCH: ${OFFSET + 1}-${OFFSET + LIMIT})`);
  console.log(`🕒 Started at: ${new Date(startTime).toISOString()}`);
  console.log(`🛑 Deadline:   ${new Date(deadline).toISOString()}`);
  console.log("=================================================");

  const pat: string | undefined = process.env["PAT_1"];
  if (!pat) {
    throw new Error("❌ No PAT provided. Please set GITHUB_TOKEN or PAT_1.");
  }

  console.log("📥 Fetching plugin metadata lists...");
  const discoveredPlugins = await fetchBetaPlugins();

  console.log(`🔍 Total plugins discovered: ${discoveredPlugins.length}`);

  // 1. Sort plugins A-Z by ID (Immutably)
  const sortedPlugins = [...discoveredPlugins].sort((a: DiscoveredPlugin, b: DiscoveredPlugin) => 
    a.id.localeCompare(b.id)
  );

  // 2. Slice to target the specific batch
  const betaPlugins = sortedPlugins.slice(OFFSET, OFFSET + LIMIT);

  if (sortedPlugins.length <= OFFSET) {
    console.log(`ℹ️ No plugins found beyond the first ${OFFSET}. Total available: ${sortedPlugins.length}`);
  } else {
    const actualEnd = Math.min(OFFSET + LIMIT, sortedPlugins.length);
    console.log(`🎯 Targeted range: ${OFFSET + 1} to ${actualEnd} (Count: ${betaPlugins.length})`);
  }

  // Process categories sequentially to respect rate limits and logic clarity
  await processCategory(betaPlugins, path.join(process.cwd(), 'beta'), pat, "Beta", deadline);

  const totalDurationMinutes: string = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
  console.log("=================================================");
  console.log(`⏱️  Total Duration: ${totalDurationMinutes} minutes`);
  console.log("=================================================");
}

main().catch((err: unknown) => {
  const msg: string = err instanceof Error ? err.message : String(err);
  console.error("\n🛑 FATAL RUNNER ERROR:", msg);
  process.exit(1);
});
