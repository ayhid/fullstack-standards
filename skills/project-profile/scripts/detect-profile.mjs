#!/usr/bin/env node
/**
 * Detect a repo's stack and print the project profile block that the
 * `tanstack-query-data-layer` and `fullstack-testing` skills read.
 *
 *   node detect-profile.mjs [repoRoot]            print the block (read-only)
 *   node detect-profile.mjs [repoRoot] --json     print the raw detection
 *   node detect-profile.mjs [repoRoot] --write [--file AGENTS.md]
 *   node detect-profile.mjs [repoRoot] --write-config
 *        fill `.claude/fullstack-standards.json` (the layout the Claude Code
 *        hooks enforce); values already in the file are never overwritten
 *        insert or replace the block between the markers in that file
 *
 * No dependencies. Anything it cannot detect is written as `TODO(verify)`;
 * sections that need judgement (exceptions, known debt) are left for a human
 * or an agent to fill, and survive re-runs.
 */
import fs from 'node:fs';
import path from 'node:path';

const START = '<!-- project-profile:start -->';
const END = '<!-- project-profile:end -->';
const MANUAL_START = '<!-- project-profile:manual:start -->';
const MANUAL_END = '<!-- project-profile:manual:end -->';
const TODO = 'TODO(verify)';
const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.turbo', '.next',
  '.worktrees', 'worktrees', '.claude', '.cache', 'playwright-report',
  'test-results', '.yarn', 'out',
]);

// ─── args ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter(
  (a, i) => !a.startsWith('--') && args[i - 1] !== '--file',
);
const root = path.resolve(positional[0] ?? '.');

// ─── fs helpers ──────────────────────────────────────────────────────────────

const exists = (p) => fs.existsSync(p);
const read = (p) => (exists(p) ? fs.readFileSync(p, 'utf8') : undefined);
const readJson = (p) => {
  try {
    return JSON.parse(read(p) ?? '');
  } catch {
    return undefined;
  }
};
const rel = (p) => path.relative(root, p) || '.';
const toPosixPath = (p) => p.split(path.sep).join('/');
/**
 * tsconfig files allow comments and trailing commas. Comments are stripped
 * outside strings only: `"src/**\/*"` contains a `/*` that is not one.
 */
const parseJsonc = (text) => {
  if (!text) return undefined;
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1;
      if (i === 0) break;
    } else out += c;
  }
  try {
    return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
  } catch {
    return undefined;
  }
};

function walk(dir, maxDepth, out = [], depth = 0) {
  if (depth > maxDepth || !exists(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        walk(path.join(dir, entry.name), maxDepth, out, depth + 1);
      }
    } else {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// Relative to the repo root, so a repo that itself lives under `tests/` is not all tests.
const isTest = (f) =>
  /\.(test|spec|e2e-spec|integration-spec|stories)\.[cm]?[jt]sx?$/.test(f) ||
  /(^|[\\/])(__tests__|__mocks__|test|tests|mocks|fixtures)[\\/]/.test(rel(f));
const isSource = (f) => /\.[cm]?[jt]sx?$/.test(f) && !f.endsWith('.d.ts');

function grepFiles(files, pattern) {
  return files.filter((f) => isSource(f) && !isTest(f) && pattern.test(read(f) ?? ''));
}

// ─── repo level ──────────────────────────────────────────────────────────────

const rootPkg = readJson(path.join(root, 'package.json')) ?? {};

function detectPackageManager() {
  const declared = rootPkg.packageManager?.split('@')[0];
  if (declared) return declared;
  if (exists(path.join(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (exists(path.join(root, 'yarn.lock'))) return 'yarn';
  if (exists(path.join(root, 'bun.lockb')) || exists(path.join(root, 'bun.lock'))) return 'bun';
  return 'npm';
}

function workspaceGlobs() {
  const ws = rootPkg.workspaces;
  if (Array.isArray(ws)) return ws;
  if (ws?.packages) return ws.packages;
  const pnpm = read(path.join(root, 'pnpm-workspace.yaml'));
  if (pnpm) {
    return [...pnpm.matchAll(/^\s*-\s*['"]?([^'"\n]+)['"]?\s*$/gm)].map((m) => m[1]);
  }
  return [];
}

function resolveWorkspaces() {
  const dirs = new Set();
  for (const glob of workspaceGlobs()) {
    if (glob.startsWith('!')) continue;
    if (glob.endsWith('/*') || glob.endsWith('/**')) {
      const base = path.join(root, glob.replace(/\/\*\*?$/, ''));
      if (!exists(base)) continue;
      for (const e of fs.readdirSync(base, { withFileTypes: true })) {
        if (e.isDirectory()) dirs.add(path.join(base, e.name));
      }
    } else {
      dirs.add(path.join(root, glob));
    }
  }
  const found = [...dirs]
    .filter((d) => exists(path.join(d, 'package.json')))
    .map((dir) => ({ dir, pkg: readJson(path.join(dir, 'package.json')) ?? {} }));
  return found.length ? found : [{ dir: root, pkg: rootPkg }];
}

const pm = detectPackageManager();
const workspaces = resolveWorkspaces();
const isMonorepo = workspaces.length > 1 || workspaces[0].dir !== root;

function command(ws, script) {
  if (!script) return undefined;
  if (!isMonorepo) return `${pm} run ${script}`;
  const name = ws.pkg.name ?? rel(ws.dir);
  if (pm === 'yarn') return `yarn workspace ${name} ${script}`;
  if (pm === 'pnpm') return `pnpm --filter ${name} ${script}`;
  if (pm === 'bun') return `bun --filter ${name} run ${script}`;
  return `npm run ${script} -w ${name}`;
}

const allDeps = (pkg) => ({ ...pkg.dependencies, ...pkg.devDependencies });
const hasDep = (ws, name) => Boolean(allDeps(ws.pkg)[name]);

function installedVersion(ws, name) {
  for (const base of [ws.dir, root]) {
    const v = readJson(path.join(base, 'node_modules', name, 'package.json'))?.version;
    if (v) return v;
  }
  return allDeps(ws.pkg)[name] ?? allDeps(rootPkg)[name];
}

const major = (v) => Number(String(v ?? '').replace(/^[^\d]*/, '').split('.')[0]) || undefined;

function findScript(ws, candidates) {
  const scripts = ws.pkg.scripts ?? {};
  return candidates.find((c) => scripts[c]);
}

// ─── API ─────────────────────────────────────────────────────────────────────

// Kept in sync with `fullstack-testing/templates/third-party/third-party-imports.spec.ts`.
const THIRD_PARTY_SDKS = [
  '@getbrevo/brevo', 'sib-api-v3-sdk', '@sendgrid/', 'nodemailer', 'stripe', '@aws-sdk/',
  '@sentry/', 'twilio', 'openai', '@anthropic-ai/sdk',
];

/** Source without comments, so a spec that *mentions* `jest.mock('sdk')` is not flagged. */
const withoutComments = (f) =>
  (read(f) ?? '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Each third-party SDK in the deps, with the files that import it (tests apart). */
function detectThirdParty(ws, files) {
  const deps = Object.keys(allDeps(ws.pkg));
  const packages = deps.filter((d) =>
    THIRD_PARTY_SDKS.some((sdk) => (sdk.endsWith('/') ? d.startsWith(sdk) : d === sdk)),
  );
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  return packages.map((pkg) => {
    const importRe = new RegExp(`(from\\s+|require\\(\\s*|import\\(\\s*)['"]${escape(pkg)}(/[^'"]*)?['"]`);
    const mockRe = new RegExp(`jest\\.(do)?[mM]ock\\(\\s*['"]${escape(pkg)}(/[^'"]*)?['"]`);
    const sources = files.filter((f) => isSource(f) && !f.endsWith('.d.ts'));
    const importers = sources.filter((f) => !isTest(f) && importRe.test(withoutComments(f)));
    return {
      package: pkg,
      importers: importers.map(rel),
      adapters: importers.filter((f) => /\.adapter\.ts$/.test(f)).length,
      mockedInSpecs: sources.filter((f) => isTest(f) && mockRe.test(withoutComments(f))).length,
    };
  });
}

function detectApi(ws) {
  const files = walk(ws.dir, 6);
  const api = { name: ws.pkg.name, dir: rel(ws.dir), framework: 'NestJS' };

  if (hasDep(ws, '@prisma/client') || hasDep(ws, 'prisma')) {
    const version = installedVersion(ws, '@prisma/client') ?? installedVersion(ws, 'prisma');
    const schemaPath = files.find((f) => f.endsWith('schema.prisma'));
    const schema = read(schemaPath) ?? '';
    const generator = schema.match(/generator\s+client\s*{([^}]*)}/)?.[1] ?? '';
    const provider = generator.match(/provider\s*=\s*"([^"]+)"/)?.[1];
    const output = generator.match(/output\s*=\s*"([^"]+)"/)?.[1];
    const configFile = ['prisma.config.ts', 'prisma.config.mjs', 'prisma.config.js']
      .map((f) => path.join(ws.dir, f))
      .find(exists);
    const usesAdapter = Object.keys(allDeps(ws.pkg)).some((d) => d.startsWith('@prisma/adapter-'));
    api.orm = {
      name: 'prisma',
      version,
      schema: schemaPath && rel(schemaPath),
      generator: provider,
      clientImport: output
        ? `generator output \`${output}\` (relative to the schema)`
        : '@prisma/client',
      config: configFile && rel(configFile),
      driverAdapter: usesAdapter,
      migrations: schemaPath && rel(path.join(path.dirname(schemaPath), 'migrations')),
      generate: 'prisma migrate dev --create-only',
      apply: 'prisma migrate deploy',
    };
    const service = files.find((f) => /prisma\.service\.ts$/.test(f));
    api.dbProvider = service ? `PrismaService at \`${rel(service)}\`` : TODO;
    if (service && /\$extends\(/.test(read(service))) {
      api.dbProviderNote = 'PrismaService installs a client extension — tests must use PrismaService, never a bare PrismaClient';
    }
  } else if (hasDep(ws, 'typeorm') || hasDep(ws, '@nestjs/typeorm')) {
    const dataSource = files.find((f) => /data-source\.ts$/.test(f) && !isTest(f));
    const migrationsDir = files.map((f) => path.dirname(f)).find((d) => /migrations$/.test(d));
    const scripts = ws.pkg.scripts ?? {};
    api.orm = {
      name: 'typeorm',
      version: installedVersion(ws, 'typeorm'),
      dataSource: dataSource && rel(dataSource),
      migrations: migrationsDir && rel(migrationsDir),
      generate: command(ws, Object.keys(scripts).find((s) => /migration:generate/.test(s))) ?? 'typeorm migration:generate',
      apply: command(ws, Object.keys(scripts).find((s) => /migration:run/.test(s))) ?? 'typeorm migration:run',
    };
    const module = files.find((f) => /database\.module\.ts$/.test(f));
    api.dbProvider = module ? `TypeOrmModule in \`${rel(module)}\`` : TODO;
  } else {
    api.orm = { name: TODO };
  }

  const integrationConfig = files.find((f) => /jest[.-].*integration.*\.(json|[cm]?js|ts)$/.test(path.basename(f)));
  const harnessDir = files.map((f) => path.dirname(f)).find((d) => /test\/integration$/.test(d));
  api.tests = {
    runner: hasDep(ws, 'jest') ? 'jest' : hasDep(ws, 'vitest') ? 'vitest' : TODO,
    unit: command(ws, findScript(ws, ['test:unit', 'test'])),
    integration: command(ws, findScript(ws, ['test:integration', 'test:db', 'test:int'])),
    http: command(ws, findScript(ws, ['test:e2e'])),
    integrationConfig: integrationConfig && rel(integrationConfig),
    harness: harnessDir ? rel(harnessDir) : undefined,
    testcontainers: hasDep(ws, '@testcontainers/postgresql') || hasDep(ws, 'testcontainers'),
    integrationSpecs: files.filter((f) => /\.integration-spec\.ts$/.test(f)).length,
  };
  api.thirdParty = detectThirdParty(ws, files);
  const apiSrc = exists(path.join(ws.dir, 'src')) ? path.join(ws.dir, 'src') : ws.dir;
  api.layout = { root: toPosixPath(rel(apiSrc)) };
  const envFile = read(path.join(ws.dir, '.env.example')) ?? read(path.join(ws.dir, '.env')) ?? '';
  api.tests.databaseUrlInEnv = /^DATABASE_URL=/m.test(envFile);
  return api;
}

// ─── frontend ────────────────────────────────────────────────────────────────

function detectFrontend(ws) {
  const files = walk(ws.dir, 7);
  const first = (re) => {
    const hit = grepFiles(files, re)[0];
    return hit && rel(hit);
  };
  // Hooks: the `features/<x>/hooks` layout, else the folder holding the most
  // non-test files that import TanStack Query.
  const queryFiles = grepFiles(files, /from ['"]@tanstack\/react-query['"]/);
  const perFeature = queryFiles.find((f) => /features\/[^/]+\/hooks\//.test(f));
  const byDir = new Map();
  for (const f of queryFiles) byDir.set(path.dirname(f), (byDir.get(path.dirname(f)) ?? 0) + 1);
  const busiest = [...byDir.entries()].sort((a, b) => b[1] - a[1])[0];
  const featureHooks = perFeature
    ? rel(path.dirname(perFeature)).replace(/features\/[^/]+\/hooks$/, 'features/<feature>/hooks')
    : busiest && `${rel(busiest[0])} (${busiest[1]} files using TanStack Query)`;

  // Keys: one central factory, or per-hook `<resource>Keys` factories.
  const perHookKeyFiles = grepFiles(files, /export const [a-z]\w*Keys\s*=\s*{/);
  const inlineKeys = files
    .filter((f) => isSource(f) && !isTest(f))
    .reduce((n, f) => n + ((read(f) ?? '').match(/queryKey:\s*\[/g) ?? []).length, 0);

  // Layering: component → hook → service → one API entry point.
  const appFiles = files.filter((f) => isSource(f) && !isTest(f));
  const perFeatureService = appFiles.find((f) => /features\/[^/]+\/services\/[^/]+\.service\.tsx?$/.test(f));
  const serviceFiles = appFiles.filter((f) => /\.service\.tsx?$/.test(f) || /\/services\//.test(f));
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const services = perFeatureService
    ? `${rel(path.dirname(perFeatureService)).replace(/features\/[^/]+\/services$/, 'features/<feature>/services')} (${plural(serviceFiles.length, 'file')})`
    : serviceFiles[0] && `${rel(path.dirname(serviceFiles[0]))} (${plural(serviceFiles.length, 'service file')})`;
  const transportImport = /from\s+['"][^'"]*(lib\/api\/(client|http)|api-client|http-client)['"]|\bapi(Get|Post|Put|Patch|Delete)\s*\(|\bfetch\s*\(/;
  const serviceImport = /from\s+['"][^'"]*(\/services\/|\.service)['"]/;
  const inDir = (f, re) => re.test(rel(f));
  const layering = {
    hooksCallingTransport: appFiles.filter((f) => inDir(f, /(^|\/)hooks\//) && transportImport.test(read(f) ?? '')).length,
    componentsSkippingHooks: appFiles.filter(
      (f) => inDir(f, /(^|\/)(components|pages)\//) &&
        (serviceImport.test(read(f) ?? '') || transportImport.test(read(f) ?? '')),
    ).length,
    hookTests: files.filter(
      // Co-located tests (`hooks/use-x.test.tsx` importing `./use-x`) count too.
      (f) => isTest(f) && /\brenderHook\s*\(/.test(read(f) ?? '') &&
        (inDir(f, /(^|\/)hooks\//) || /from\s+['"][^'"]*\/hooks\//.test(read(f) ?? '')),
    ).length,
  };

  // The layout the architecture hooks enforce, relative to the source root.
  const srcDir = exists(path.join(ws.dir, 'src')) ? path.join(ws.dir, 'src') : ws.dir;
  const inSrc = (f) => toPosixPath(path.relative(srcDir, f));
  const tsconfig = ['tsconfig.app.json', 'tsconfig.json']
    .map((f) => readJson(path.join(ws.dir, f)) ?? parseJsonc(read(path.join(ws.dir, f))))
    .find((c) => c?.compilerOptions?.paths);
  const aliases = {};
  for (const [alias, targets] of Object.entries(tsconfig?.compilerOptions?.paths ?? {})) {
    if (!alias.endsWith('/*') || !targets[0]?.endsWith('/*')) continue;
    const target = inSrc(path.resolve(ws.dir, targets[0].slice(0, -2)));
    if (!target.startsWith('..')) aliases[alias.slice(0, -1)] = target === '' ? '' : `${target}/`;
  }
  const componentDirs = ['components', 'pages', 'routes', 'app', 'views']
    .filter((d) => exists(path.join(srcDir, d)))
    .map((d) => `${d}/**`);
  if (appFiles.some((f) => /features\/[^/]+\/components\//.test(f))) componentDirs.push('features/*/components/**');
  const entryFile = appFiles.find((f) => /export const apiClient\b|export (async )?function (request|apiRequest)\b/.test(read(f) ?? ''));
  const layout = {
    root: toPosixPath(rel(srcDir)),
    aliases,
    components: componentDirs,
    ...(entryFile ? { apiClient: inSrc(entryFile) } : {}),
  };

  const vitestConfig = files.find((f) => /vitest\.config\.[cm]?[jt]s$/.test(f));
  return {
    layout,
    name: ws.pkg.name,
    dir: rel(ws.dir),
    bundler: hasDep(ws, 'vite') ? 'Vite' : hasDep(ws, 'next') ? 'Next.js' : TODO,
    tanstackQuery: installedVersion(ws, '@tanstack/react-query'),
    queryClient: first(/new QueryClient\(\s*{[\s\S]*defaultOptions/) ?? first(/new QueryClient\(/),
    queryKeys: first(/export const (queryKeys|keys)\b/),
    perHookKeyFactories: perHookKeyFiles.length,
    perHookKeyDir: perHookKeyFiles[0] && rel(path.dirname(perHookKeyFiles[0])),
    inlineKeys,
    entryPoint: first(/export const apiClient\b|export (async )?function (request|apiRequest)\b/),
    // The older multi-function surface (apiGet/apiPost/…), to migrate to one `request`.
    legacyHttpClient: first(/export (async )?function api(Get|Post|Fetch)\b|export const apiGet\b/),
    featureHooks,
    services,
    layering,
    tests: {
      runner: hasDep(ws, 'vitest') ? 'vitest' : hasDep(ws, 'jest') ? 'jest' : TODO,
      command: command(ws, findScript(ws, ['test:unit', 'test'])),
      config: vitestConfig && rel(vitestConfig),
      tzUtc: /TZ=UTC/.test(JSON.stringify(ws.pkg.scripts ?? {})),
    },
  };
}

// ─── e2e ─────────────────────────────────────────────────────────────────────

function detectE2e() {
  const candidates = [{ dir: root, pkg: rootPkg }, ...workspaces];
  for (const ws of candidates) {
    if (!hasDep(ws, '@playwright/test')) continue;
    const config = ['playwright.config.ts', 'playwright.config.js', 'playwright.config.mjs']
      .map((f) => path.join(ws.dir, f))
      .find(exists);
    if (!config) continue;
    const text = read(config);
    const testDir = text.match(/testDir\s*:\s*['"]([^'"]+)['"]/)?.[1];
    const utils = ['tests/utils', 'tests/support', 'e2e/utils', 'utils']
      .map((d) => path.join(ws.dir, d))
      .find(exists);
    return {
      name: ws.pkg.name,
      config: rel(config),
      testDir: testDir ? rel(path.join(ws.dir, testDir)) : TODO,
      utils: utils && rel(utils),
      command: ws.dir === root
        ? `${pm} run ${findScript(ws, ['test:e2e', 'test']) ?? 'test'}`
        : command(ws, findScript(ws, ['test:e2e', 'test'])),
      needsStack: /webServer/.test(text) ? 'webServer block present — check whether it starts or only probes the stack' : TODO,
    };
  }
  return undefined;
}

// ─── environment ─────────────────────────────────────────────────────────────

function detectEnvironment() {
  const composeFiles = walk(root, 2).filter((f) => /docker-compose[^/]*\.ya?ml$|compose[^/]*\.ya?ml$/.test(path.basename(f)));
  const pgImage = composeFiles
    .map((f) => read(f).match(/image:\s*['"]?(postgres:[^\s'"]+)/)?.[1])
    .find(Boolean);

  const toolVersions = read(path.join(root, '.tool-versions'))?.match(/^nodejs\s+(\S+)/m)?.[1];
  const nvmrc = read(path.join(root, '.nvmrc'))?.trim();
  const localNode = toolVersions ?? nvmrc ?? rootPkg.engines?.node;

  const workflowsDir = path.join(root, '.github', 'workflows');
  const workflows = exists(workflowsDir)
    ? fs.readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f))
    : [];
  const workflowText = workflows.map((f) => read(path.join(workflowsDir, f))).join('\n');
  const ciNode = [...new Set([...workflowText.matchAll(/node-version:\s*['"]?([\w.]+)/g)].map((m) => m[1]))];

  const turbo = readJson(path.join(root, 'turbo.json'));
  const testTask = turbo?.tasks?.test ?? turbo?.pipeline?.test;
  const rootTest = rootPkg.scripts?.test;

  return {
    postgres: pgImage,
    nodeLocal: localNode,
    nodeCi: ciNode,
    nodeMismatch: Boolean(localNode && ciNode.length && !ciNode.some((v) => major(v) === major(localNode))),
    ci: workflows.map((f) => `.github/workflows/${f}`),
    ciPlaywright: workflows.filter((f) => /playwright/.test(read(path.join(workflowsDir, f)))),
    ciHasPostgresService: /image:\s*['"]?postgres/.test(workflowText),
    buildCache: turbo ? 'turbo' : exists(path.join(root, 'nx.json')) ? 'nx' : undefined,
    testCached: turbo ? (testTask ? testTask.cache !== false : 'no-task') : undefined,
    rootTest,
  };
}

// ─── assemble ────────────────────────────────────────────────────────────────

function detectStrapi(ws) {
  return {
    name: ws.pkg.name,
    dir: rel(ws.dir),
    framework: 'Strapi',
    version: installedVersion(ws, '@strapi/strapi'),
    tests: { unit: command(ws, findScript(ws, ['test:unit', 'test'])) },
  };
}

const apis = [
  ...workspaces.filter((ws) => hasDep(ws, '@nestjs/core')).map(detectApi),
  ...workspaces.filter((ws) => hasDep(ws, '@strapi/strapi')).map(detectStrapi),
];
const frontends = workspaces
  .filter((ws) => hasDep(ws, '@tanstack/react-query'))
  .map(detectFrontend);
const detection = {
  root,
  packageManager: pm,
  monorepo: isMonorepo,
  workspaces: workspaces.map((w) => w.pkg.name ?? rel(w.dir)),
  apis,
  frontends,
  e2e: detectE2e(),
  environment: detectEnvironment(),
};

// ─── render ──────────────────────────────────────────────────────────────────

const v = (value) => (value === undefined || value === null || value === '' ? TODO : value);
const code = (value) => (value && value !== TODO ? `\`${value}\`` : TODO);

function renderApi(api) {
  if (api.framework === 'Strapi') {
    return [
      `**API — \`${api.name}\` (\`${api.dir}\`), Strapi ${v(api.version)}**`,
      '',
      `- REST API, ${major(api.version) >= 5 ? 'v5: `{ data, meta }` with flat entities keyed by `documentId`' : 'v4: `{ data: { id, attributes }, meta }` envelope'} — frontend services unwrap it; nothing past them sees the wire shape`,
      `- Tests: ${code(api.tests.unit)}`,
      '- The NestJS backend-service and integration-harness rules do not apply to this API',
    ].join('\n');
  }
  const o = api.orm;
  const lines = [`**API — \`${api.name}\` (\`${api.dir}\`)**`, ''];
  if (o.name === 'prisma') {
    lines.push(
      `- ORM: prisma ${v(o.version)} — generator \`${v(o.generator)}\`, client import ${o.clientImport}` +
        `${major(o.version) >= 7 || o.driverAdapter ? ', driver adapter' : ', no driver adapter (use `datasourceUrl` in the harness)'}`,
      `- Schema: ${code(o.schema)}${o.config ? `, config ${code(o.config)}` : ''}; migrations: ${code(o.migrations)}`,
      `- Migrations: generate \`${o.generate}\`, apply \`${o.apply}\` (never \`db push\`)`,
    );
  } else if (o.name === 'typeorm') {
    lines.push(
      `- ORM: typeorm ${v(o.version)} — data source ${code(o.dataSource)}; migrations: ${code(o.migrations)}`,
      `- Migrations: generate ${code(o.generate)}, apply ${code(o.apply)} (never \`synchronize\`)`,
    );
  } else {
    lines.push(`- ORM: ${TODO}`);
  }
  lines.push(`- DB provider: ${api.dbProvider}`);
  if (api.dbProviderNote) lines.push(`  - ${api.dbProviderNote}`);
  const t = api.tests;
  lines.push(
    `- Test runner: ${t.runner}; unit ${code(t.unit)}; integration ${code(t.integration)}; HTTP ${code(t.http)}`,
    `- Integration harness: ${t.harness ? code(t.harness) : 'none (install `core/` + the ' + (o.name === 'typeorm' ? 'typeorm' : 'prisma') + ' adapter from `fullstack-testing`)'}` +
      `${t.integrationConfig ? `; config ${code(t.integrationConfig)}` : ''}` +
      `; Testcontainers ${t.testcontainers ? 'installed' : 'not installed'}; \`*.integration-spec.ts\` files: ${t.integrationSpecs}`,
  );
  if (api.thirdParty.length) {
    const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    lines.push(
      `- Third-party SDKs: ${api.thirdParty.map((p) => `\`${p.package}\` (${plural(p.importers.length, 'file')})`).join(', ')}`,
    );
    for (const p of api.thirdParty) {
      if (p.importers.length > 1 || (p.importers.length === 1 && !p.adapters)) {
        lines.push(`  - ⚠️ \`${p.package}\` imported outside a single \`*.adapter.ts\`: ${p.importers.map((f) => `\`${f}\``).join(', ')}`);
      }
      if (p.mockedInSpecs) {
        lines.push(`  - ⚠️ \`${p.package}\` is \`jest.mock\`ed in ${plural(p.mockedInSpecs, 'spec')} — mock the port instead`);
      }
    }
  }
  if (!t.harness && t.databaseUrlInEnv) {
    lines.push('  - ⚠️ No harness while `DATABASE_URL` is configured: check whether DB-backed specs run against the developer database');
  }
  return lines.join('\n');
}

function renderFrontend(fe) {
  return [
    `**Frontend — \`${fe.name}\` (\`${fe.dir}\`)**`,
    '',
    `- ${fe.bundler} + TanStack Query ${v(fe.tanstackQuery)}`,
    `- QueryClient defaults: ${code(fe.queryClient)}`,
    `- Query key factory: ${
      fe.queryKeys
        ? code(fe.queryKeys)
        : fe.perHookKeyFactories
          ? `per-hook \`<resource>Keys\` factories (${fe.perHookKeyFactories} files, e.g. in ${code(fe.perHookKeyDir)}), no central factory`
          : 'none found — create one from `tanstack-query-data-layer/templates/query-keys.ts`'
    }${fe.inlineKeys ? `; ⚠️ ${fe.inlineKeys} inline \`queryKey: [...]\` arrays outside tests` : ''}`,
    `- API entry point: ${
      fe.entryPoint
        ? code(fe.entryPoint)
        : fe.legacyHttpClient
          ? `none — multi-function HTTP helpers in ${code(fe.legacyHttpClient)}; migrate to one \`apiClient.request\` (\`tanstack-query-data-layer/templates/api-client.ts\`)`
          : `${TODO} — none found; create it from \`tanstack-query-data-layer/templates/api-client.ts\``
    }`,
    `- Frontend services: ${fe.services ? code(fe.services) : 'none found — hooks must call services, not the HTTP layer'}`,
    `- Feature hooks: ${code(fe.featureHooks)}`,
    ...layeringDebt(fe.layering),
    `- Tests: ${fe.tests.runner} ${code(fe.tests.command)}${fe.tests.config ? `, config ${code(fe.tests.config)}` : ''}${fe.tests.tzUtc ? ', runs with `TZ=UTC`' : ''}`,
  ].join('\n');
}

function layeringDebt(l) {
  const debt = [
    l.hooksCallingTransport && `hook files calling the HTTP layer directly (should call a service): ${l.hooksCallingTransport}`,
    l.componentsSkippingHooks && `component/page files importing a service or the HTTP layer (should use a hook): ${l.componentsSkippingHooks}`,
    l.hookTests && `test files that \`renderHook\` a feature hook (test through a component): ${l.hookTests}`,
  ].filter(Boolean);
  return debt.map((d) => `  - ⚠️ ${d}`);
}

function renderE2e(e2e) {
  if (!e2e) return '**E2E** — no Playwright config found';
  return [
    `**E2E — Playwright (${code(e2e.config)})**`,
    '',
    `- Specs: ${code(e2e.testDir)}; utils: ${code(e2e.utils)}`,
    `- Command: ${code(e2e.command)}`,
    `- Stack: ${e2e.needsStack}`,
  ].join('\n');
}

function renderEnvironment(env) {
  const lines = [
    '**Environment and CI**',
    '',
    `- Package manager: ${pm}${isMonorepo ? ` (monorepo: ${detection.workspaces.join(', ')})` : ''}`,
    `- Postgres in dev/prod: ${env.postgres ? `\`${env.postgres}\` — pin the Testcontainers image to this major` : TODO}`,
    `- Node: local ${code(env.nodeLocal)}, CI ${env.nodeCi.length ? env.nodeCi.map((n) => `\`${n}\``).join(', ') : TODO}` +
      `${env.nodeMismatch ? ' — ⚠️ major versions differ' : ''}`,
    `- CI workflows: ${env.ci.length ? env.ci.map((c) => `\`${c}\``).join(', ') : 'none'}; workflows mentioning Playwright: ${env.ciPlaywright.length ? env.ciPlaywright.map((f) => `\`${f}\``).join(', ') : 'no'}; Postgres service in CI: ${env.ciHasPostgresService ? 'yes' : 'no'}`,
  ];
  if (env.buildCache) {
    lines.push(
      `- Build cache: ${env.buildCache}; \`test\` cached: ${env.testCached === 'no-task' ? 'no `test` task defined' : env.testCached === undefined ? TODO : env.testCached ? 'yes — use `--force` after non-file changes' : 'no'}`,
    );
  }
  if (env.rootTest) lines.push(`- Root \`test\` script: \`${env.rootTest}\` — ${TODO}: does it include Playwright?`);
  lines.push(
    '- Integration DB resolution: `TEST_DATABASE_URL` → (`CI` && `DATABASE_URL`) → Testcontainers. ⚠️ Never point it at a database you want to keep.',
  );
  return lines.join('\n');
}

const MANUAL_DEFAULT = [
  MANUAL_START,
  '**Exceptions and known debt** (kept across re-runs — edit freely)',
  '',
  `- E2E auth mechanism and rate limits that constrain the suite: ${TODO}`,
  `- Legacy patterns not to copy: ${TODO}`,
  `- Architecture guard specs: ${TODO}`,
  `- Reference-data tables (seeded once, preserved by truncation): ${TODO}`,
  MANUAL_END,
].join('\n');

function renderBlock(manual) {
  return [
    START,
    '## Project profile',
    '',
    'Read by the `tanstack-query-data-layer` and `fullstack-testing` skills; it wins',
    'over them wherever they disagree. Generated by `project-profile` — re-run it',
    'after stack changes; only the manual section below is preserved.',
    '',
    ...apis.map(renderApi).flatMap((b) => [b, '']),
    ...frontends.map(renderFrontend).flatMap((b) => [b, '']),
    renderE2e(detection.e2e),
    '',
    renderEnvironment(detection.environment),
    '',
    manual ?? MANUAL_DEFAULT,
    END,
  ].join('\n');
}

// ─── output ──────────────────────────────────────────────────────────────────

/** Existing values win, so hand edits and the baseline survive re-runs. */
function mergeKeepingExisting(existing, detected) {
  if (Array.isArray(existing) || typeof existing !== 'object' || existing === null) return existing ?? detected;
  const out = { ...existing };
  for (const [key, value] of Object.entries(detected)) {
    out[key] = key in existing ? mergeKeepingExisting(existing[key], value) : value;
  }
  return out;
}

if (flag('--write-config')) {
  const file = path.join(root, '.claude', 'fullstack-standards.json');
  const current = readJson(file) ?? {};
  const byRoot = (list = []) => new Map(list.map((u) => [u.root, u]));
  const merge = (existingList, detectedList) => {
    const existing = byRoot(existingList);
    const detected = detectedList.map((d) => mergeKeepingExisting(existing.get(d.root), d));
    const detectedRoots = new Set(detectedList.map((d) => d.root));
    return [...detected, ...(existingList ?? []).filter((u) => !detectedRoots.has(u.root))];
  };
  const next = {
    $comment: 'Layout enforced by the fullstack-standards Claude Code hooks. Edit freely: re-running project-profile never overwrites a value.',
    ...current,
    frontends: merge(current.frontends, frontends.map((f) => f.layout)),
    apis: merge(current.apis, apis.filter((a) => a.framework === 'NestJS').map((a) => a.layout)),
    baseline: current.baseline ?? {},
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`${Object.keys(current).length ? 'Updated' : 'Wrote'} ${rel(file)}`);
} else if (flag('--json')) {
  console.log(JSON.stringify(detection, null, 2));
} else if (flag('--write')) {
  const file = path.resolve(root, option('--file') ?? 'AGENTS.md');
  const current = read(file) ?? '';
  const manual = current.match(new RegExp(`${MANUAL_START}[\\s\\S]*?${MANUAL_END}`))?.[0];
  const block = renderBlock(manual);
  const pattern = new RegExp(`${START}[\\s\\S]*?${END}`);
  const next = pattern.test(current)
    ? current.replace(pattern, () => block) // a function: `$` in the block stays literal
    : `${current.trimEnd()}${current ? '\n\n' : ''}${block}\n`;
  fs.writeFileSync(file, next);
  console.log(`${pattern.test(current) ? 'Updated' : 'Added'} project profile in ${rel(file)}`);
  const todos = (block.match(/TODO\(verify\)/g) ?? []).length;
  console.log(`${todos} field(s) left as ${TODO}`);
} else {
  console.log(renderBlock());
}
