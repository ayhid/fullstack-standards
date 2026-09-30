/**
 * Writes the release version into the Claude Code plugin manifest.
 * `claude plugin update` compares this field only, so a release that leaves
 * it unchanged never reaches installed plugins.
 * Run by semantic-release (`prepareCmd`): node set-plugin-version.mjs <version>
 */
import fs from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version ?? '')) {
  console.error(`set-plugin-version: not a version: ${version}`);
  process.exit(1);
}

const file = new URL('../../.claude-plugin/plugin.json', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
manifest.version = version;
fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`plugin.json → ${version}`);
