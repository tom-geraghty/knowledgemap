#!/usr/bin/env node
// npm run validate — checks data integrity before deploying

import { THEMES } from './src/data/themes.js';
import { RAW_NODES } from './src/data/nodes.js';
import { RAW_LINKS } from './src/data/links.js';

let errors = 0;
let warnings = 0;

function error(msg) { console.error(`  ✗ ERROR: ${msg}`); errors++; }
function warn(msg)  { console.warn(`  ⚠ WARN:  ${msg}`); warnings++; }
function ok(msg)    { console.log(`  ✓ ${msg}`); }

console.log('\n── Validating themes ──────────────────────────────');
const validThemes = new Set(Object.keys(THEMES));
ok(`${validThemes.size} themes defined: ${[...validThemes].join(', ')}`);

console.log('\n── Validating nodes ────────────────────────────────');
const nodeIds = new Set();
const duplicates = [];

for (const node of RAW_NODES) {
  // Duplicate IDs
  if (nodeIds.has(node.id)) {
    error(`Duplicate node id: "${node.id}"`);
    duplicates.push(node.id);
  }
  nodeIds.add(node.id);

  // Required fields
  if (!node.id)     error(`Node missing id: ${JSON.stringify(node).slice(0, 60)}`);
  if (!node.label)  error(`Node "${node.id}" missing label`);
  if (!node.author) error(`Node "${node.id}" missing author`);
  if (!node.desc)   error(`Node "${node.id}" missing desc`);
  if (!node.url)    error(`Node "${node.id}" missing url`);

  // Weight range
  if (node.weight < 1 || node.weight > 10)
    error(`Node "${node.id}" has invalid weight: ${node.weight} (must be 1–10)`);

  // Theme validation
  if (!node.themes || node.themes.length === 0) {
    error(`Node "${node.id}" has no themes`);
  } else {
    for (const t of node.themes) {
      if (!validThemes.has(t)) {
        error(`Node "${node.id}" uses invalid theme: "${t}"`);
      }
    }
  }

  // Warn on placeholder URLs
  if (node.url === '#') warn(`Node "${node.id}" has placeholder url "#"`);
}

ok(`${nodeIds.size} unique node IDs`);

console.log('\n── Validating links ────────────────────────────────');
let badSources = 0, badTargets = 0, selfLinks = 0, dupLinks = 0;
const seenLinks = new Set();

for (const link of RAW_LINKS) {
  // Self-links
  if (link.source === link.target) {
    error(`Self-link on node "${link.source}"`);
    selfLinks++;
  }

  // Bad source
  if (!nodeIds.has(link.source)) {
    error(`Link source not found: "${link.source}"`);
    badSources++;
  }

  // Bad target
  if (!nodeIds.has(link.target)) {
    error(`Link target not found: "${link.target}"`);
    badTargets++;
  }

  // Strength range
  if (link.strength < 1 || link.strength > 3)
    warn(`Link ${link.source} → ${link.target} has unusual strength: ${link.strength}`);

  // Duplicate links (directed — a→b and b→a are both valid)
  const key = `${link.source}|${link.target}`;
  if (seenLinks.has(key)) {
    warn(`Duplicate directed link: "${link.source}" → "${link.target}"`);
    dupLinks++;
  }
  seenLinks.add(key);
}

ok(`${RAW_LINKS.length} links checked`);
if (badSources === 0 && badTargets === 0) ok('All link sources and targets resolve');

console.log('\n── Checking for orphan nodes ───────────────────────');
const connected = new Set();
for (const link of RAW_LINKS) {
  connected.add(link.source);
  connected.add(link.target);
}
const orphans = [...nodeIds].filter(id => !connected.has(id));
if (orphans.length > 0) {
  for (const id of orphans) warn(`Orphan node (no connections): "${id}"`);
} else {
  ok('No orphan nodes');
}

console.log('\n── Checking slug/url consistency ───────────────────');
let slugMismatches = 0;
// Detect primary domain from most common hostname across all node URLs
const hostnames = RAW_NODES.map(n => { try { return new URL(n.url).hostname; } catch { return null; } }).filter(Boolean);
const primaryDomain = hostnames.sort((a,b) => hostnames.filter(h=>h===b).length - hostnames.filter(h=>h===a).length)[0];
for (const node of RAW_NODES) {
  if (!node.slug || !node.url || node.url === '#') continue;
  // Only check slug/url consistency for nodes on the primary domain
  let hostname; try { hostname = new URL(node.url).hostname; } catch { continue; }
  if (primaryDomain && hostname !== primaryDomain) continue;
  if (!node.url.includes(node.slug)) {
    warn(`Node "${node.id}" slug "${node.slug}" not found in url "${node.url}"`);
    slugMismatches++;
  }
}
if (slugMismatches === 0) ok('All slugs match their URLs');

console.log('\n── Summary ─────────────────────────────────────────');
console.log(`  Nodes: ${nodeIds.size}  |  Links: ${RAW_LINKS.length}  |  Themes: ${validThemes.size}`);
if (errors === 0 && warnings === 0) {
  console.log('  ✓ All checks passed — safe to deploy\n');
  process.exit(0);
} else {
  console.log(`  ${errors} error(s), ${warnings} warning(s)`);
  if (errors > 0) {
    console.log('  ✗ Fix errors before deploying\n');
    process.exit(1);
  } else {
    console.log('  ⚠ Warnings only — deploy with caution\n');
    process.exit(0);
  }
}
