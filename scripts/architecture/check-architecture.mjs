#!/usr/bin/env node
/**
 * Enforces the fullstack-standards architecture from Claude Code hooks.
 *
 *   --pre       PreToolUse on Write/Edit: denies an edit whose result breaks a
 *               per-file rule (layering, renderHook, hook tests, SDK imports).
 *   --post      PostToolUse on Write/Edit: runs the project's `postCommands`
 *               (e.g. its linter) on the written file.
 *   --stop      Stop: files changed in the working tree must pass every rule,
 *               and each changed component/service needs a test that imports
 *               (and, for a component, renders) it. Blocks stopping otherwise.
 *   --all       Command line: report every finding in the project; exit 1 if any.
 *   --baseline  Command line: record today's findings as tolerated debt in the
 *               config, so the hooks hold new code to the rules without
 *               failing on legacy files. The baseline can only shrink.
 *
 * Inactive (exit 0, silent) in a project without `.claude/fullstack-standards.json`,
 * or where typescript@5 cannot be loaded.
 */

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {
  CONFIG_FILE,
  applyBaseline,
  checkFile,
  checkSubjectTest,
  isTestFile,
  loadConfig,
  loadTypeScript,
  locate,
  parse,
  subjectKind,
  toPosix,
} from './checks.mjs';

const mode = process.argv.slice(2).find((a) => a.startsWith('--')) ?? '--all';

function readStdin() {
  if (process.stdin.isTTY) return {};
  try {
    const text = fs.readFileSync(0, 'utf8');
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

const payload = mode === '--all' || mode === '--baseline' ? {} : readStdin();
const projectDir = path.resolve(
  process.argv.slice(2).find((a) => !a.startsWith('--')) ??
    process.env.CLAUDE_PROJECT_DIR ?? payload.cwd ?? process.cwd(),
);

const config = loadConfig(projectDir);
if (!config) process.exit(0);
const tsApi = loadTypeScript(projectDir);
if (!tsApi) {
  if (mode === '--all' || mode === '--baseline') {
    console.error('fullstack-standards: typescript@5 not found in the project; checks skipped.');
  }
  process.exit(0);
}

const relative = (abs) => toPosix(path.relative(projectDir, path.resolve(projectDir, abs)));
const readText = (file) => {
  try {
    return fs.readFileSync(path.join(projectDir, file), 'utf8');
  } catch {
    return null;
  }
};
const parsedCache = new Map();
const readParsed = (file) => {
  if (!parsedCache.has(file)) {
    const text = readText(file);
    parsedCache.set(file, text === null ? null : parse(tsApi, file, text));
  }
  return parsedCache.get(file);
};

const format = (file, findings) =>
  findings.map((f) => `- ${file}:${f.line} [${f.rule}] ${f.message}`).join('\n');

/** Per-file and cross-file findings for one existing file, baseline applied. */
function findingsFor(file, { reportStale }) {
  const parsed = readParsed(file);
  if (!parsed || !locate(config, file)) return [];
  const findings = checkFile(config, file, parsed);
  const kind = subjectKind(config, file, parsed);
  if (kind) findings.push(...checkSubjectTest(config, file, kind, testFilesOf(file), readParsed));
  return applyBaseline(config, file, findings, { reportStale });
}

/** The file a test covers: `X.test.tsx` or `__tests__/X.test.tsx` → `X.tsx`/`X.ts`. */
function subjectOf(testFile) {
  const base = testFile
    .replace(/\/__tests__\//, '/')
    .replace(/\.(test|spec)(\.[cm]?[jt]sx?)$/, '');
  return ['.tsx', '.ts', '.jsx', '.js'].map((ext) => base + ext).find((f) => readText(f) !== null);
}

function sourceFilesUnder(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(projectDir, dir), { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const file = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(file);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(file);
    }
  };
  const dir = root.replace(/\/+$/, '').replace(/^\.$/, '');
  if (fs.existsSync(path.join(projectDir, dir))) walk(dir);
  return out;
}

// Each file once, in the unit that owns it (an API rooted at `.` can hold a frontend).
const allSourceFiles = () => [
  ...new Set([...config.frontends, ...config.apis].flatMap((unit) => sourceFilesUnder(unit.root))),
].filter((file) => locate(config, file));

/** The test files of the frontend `file` belongs to, plus its `testRoots` (walked once per unit). */
const testsByUnit = new Map();
function testFilesOf(file) {
  const { unit } = locate(config, file);
  if (!testsByUnit.has(unit)) {
    const own = sourceFilesUnder(unit.root).filter((f) => isTestFile(f) && locate(config, f)?.unit === unit);
    const extra = (unit.testRoots ?? [])
      .map((r) => path.posix.normalize(path.posix.join(unit.root, r)))
      .filter((r) => !r.startsWith('..'))
      .flatMap((r) => sourceFilesUnder(r).filter((f) => isTestFile(f)));
    testsByUnit.set(unit, [...new Set([...own, ...extra])]);
  }
  return testsByUnit.get(unit);
}

function changedFiles() {
  const git = (args) => {
    try {
      return execFileSync('git', ['-C', projectDir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
        .split('\n')
        .filter(Boolean);
    } catch {
      return null;
    }
  };
  const tracked = git(['diff', '--name-only', '--diff-filter=d', 'HEAD']);
  if (tracked === null) return [];
  return [...new Set([...tracked, ...(git(['ls-files', '--others', '--exclude-standard']) ?? [])])];
}

// ─── modes ───────────────────────────────────────────────────────────────────

if (mode === '--pre') {
  const input = payload.tool_input ?? {};
  if (!input.file_path) process.exit(0);
  const file = relative(input.file_path);
  if (!locate(config, file)) process.exit(0);

  // The file as it will be after this tool call.
  let text = readText(file);
  if (payload.tool_name === 'Write') {
    text = input.content ?? '';
  } else {
    const edits = input.edits ?? [input];
    if (text === null) process.exit(0);
    for (const e of edits) {
      if (typeof e.old_string !== 'string' || typeof e.new_string !== 'string') continue;
      text = e.replace_all ? text.split(e.old_string).join(e.new_string) : text.replace(e.old_string, () => e.new_string);
    }
  }

  const findings = applyBaseline(config, file, checkFile(config, file, parse(tsApi, file, text)));
  if (findings.length) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          `This change breaks the project's architecture rules (fullstack-standards):\n${format(file, findings)}\n` +
          'Rewrite it to follow the rule. See the data-layer and fullstack-testing skills.',
      },
    }));
  }
  process.exit(0);
}

if (mode === '--post') {
  const file = payload.tool_input?.file_path && relative(payload.tool_input.file_path);
  if (!file || !locate(config, file) || !config.postCommands?.length) process.exit(0);
  const failures = [];
  for (const command of config.postCommands) {
    const run = spawnSync(command.replaceAll('{file}', JSON.stringify(file)), {
      cwd: projectDir, shell: true, encoding: 'utf8', timeout: 60_000,
    });
    if (run.status !== 0) failures.push(`$ ${command}\n${`${run.stdout}${run.stderr}`.trim().slice(-2000)}`);
  }
  if (failures.length) {
    process.stderr.write(`Checks failed on ${file}:\n${failures.join('\n\n')}\n`);
    process.exit(2);
  }
  process.exit(0);
}

if (mode === '--stop') {
  // Claude already continued once for these checks: report, do not trap it.
  const blocking = payload.stop_hook_active !== true;
  const files = new Set();
  for (const file of changedFiles()) {
    if (!locate(config, file) || readText(file) === null) continue;
    files.add(file);
    // A changed test re-checks its subject (a test that stopped rendering it).
    if (isTestFile(file)) {
      const subject = subjectOf(file);
      if (subject) files.add(subject);
    }
  }

  const report = [];
  for (const file of [...files].sort()) {
    const findings = findingsFor(file, { reportStale: true });
    if (findings.length) report.push(format(file, findings));
  }
  for (const command of config.stopCommands) {
    const run = spawnSync(command, { cwd: projectDir, shell: true, encoding: 'utf8', timeout: 300_000 });
    if (run.status !== 0) report.push(`- \`${command}\` failed:\n${`${run.stdout}${run.stderr}`.trim().slice(-3000)}`);
  }

  if (report.length && blocking) {
    process.stderr.write(
      'Architecture checks failed for files changed in this session (fullstack-standards). ' +
        'Fix these before finishing — add the missing component/service tests, move requests into services:\n' +
        `${report.join('\n')}\n`,
    );
    process.exit(2);
  }
  process.exit(0);
}

if (mode === '--all' || mode === '--baseline') {
  const all = allSourceFiles();
  const raw = new Map();
  for (const file of all) {
    const parsed = readParsed(file);
    const findings = checkFile(config, file, parsed);
    const kind = subjectKind(config, file, parsed);
    if (kind) findings.push(...checkSubjectTest(config, file, kind, testFilesOf(file), readParsed));
    if (findings.length) raw.set(file, findings);
  }

  if (mode === '--baseline') {
    const configPath = path.join(projectDir, CONFIG_FILE);
    const current = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    current.baseline = Object.fromEntries(
      [...raw].map(([file, findings]) => [file, [...new Set(findings.map((f) => f.rule))].sort()]),
    );
    fs.writeFileSync(configPath, `${JSON.stringify(current, null, 2)}\n`);
    const byRule = {};
    for (const rulesOf of Object.values(current.baseline)) for (const r of rulesOf) byRule[r] = (byRule[r] ?? 0) + 1;
    console.log(`Baseline: ${raw.size} files with existing debt written to ${CONFIG_FILE}`);
    for (const [rule, n] of Object.entries(byRule).sort()) console.log(`  ${rule}: ${n}`);
    process.exit(0);
  }

  let total = 0;
  for (const file of all) {
    const findings = applyBaseline(config, file, raw.get(file) ?? [], { reportStale: true });
    if (findings.length) {
      total += findings.length;
      console.log(format(file, findings));
    }
  }
  console.log(total ? `\n${total} finding(s).` : 'No findings.');
  process.exit(total ? 1 : 0);
}
