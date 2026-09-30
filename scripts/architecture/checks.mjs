/**
 * Architecture checks shared by the Claude Code hooks (and usable from CI).
 *
 * Pure functions over file paths and source text; `check-architecture.mjs`
 * does the I/O. Every path handled here is POSIX and relative to the project
 * root. The TypeScript compiler comes from the project (typescript@5's JS
 * API), so comments and strings never trip a rule.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export const CONFIG_FILE = '.claude/fullstack-standards.json';

// ─── config ──────────────────────────────────────────────────────────────────

const FRONTEND_DEFAULTS = {
  root: 'src',
  aliases: { '@/': '' },
  components: ['components/**', 'pages/**', 'routes/**', 'features/*/components/**'],
  hooks: ['**/hooks/**'],
  services: ['**/services/**', '**/*.service.ts'],
  apiClient: 'lib/api/client.ts',
  apiLib: ['lib/api/**'],
  renderFunctions: ['render', 'renderWithDataLayer', 'renderWithClient'],
};

const API_DEFAULTS = {
  root: 'src',
  adapters: ['**/*.adapter.ts'],
  sdks: [
    '@getbrevo/brevo', 'sib-api-v3-sdk', '@sendgrid/', 'nodemailer', 'stripe', '@aws-sdk/',
    '@sentry/', 'twilio', 'openai', '@anthropic-ai/sdk',
  ],
  // Bootstrap files that may import an SDK (e.g. Sentry's `instrument.ts`).
  allowedImporters: ['**/instrument.ts', '**/main.ts'],
  // Adapters whose own spec may `jest.mock` their SDK (module-function SDKs).
  sdkMockAllowedIn: [],
};

/** The project's config, with defaults filled in; `null` when the project has none. */
export function loadConfig(projectDir) {
  const file = path.join(projectDir, CONFIG_FILE);
  if (!fs.existsSync(file)) return null;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    frontends: (raw.frontends ?? []).map((f) => ({ ...FRONTEND_DEFAULTS, ...f })),
    apis: (raw.apis ?? []).map((a) => ({ ...API_DEFAULTS, ...a })),
    // { "<path>": ["<rule id>", …] } — existing debt the checks tolerate, and
    // must be removed as soon as the file complies (the list only shrinks).
    baseline: raw.baseline ?? {},
    // Shell commands; `{file}` is replaced by the written file (PostToolUse).
    postCommands: raw.postCommands ?? [],
    // Shell commands run at Stop, e.g. the guard specs; a non-zero exit blocks.
    stopCommands: raw.stopCommands ?? [],
  };
}

// ─── paths and globs ─────────────────────────────────────────────────────────

export const toPosix = (p) => p.split(path.sep).join('/');

const globCache = new Map();
/** Minimal glob: `**` spans directories, `*` stays within one. */
export function globToRegExp(glob) {
  if (!globCache.has(glob)) {
    let re = '';
    for (let i = 0; i < glob.length; i += 1) {
      const c = glob[i];
      if (c === '*' && glob[i + 1] === '*') {
        re += glob[i + 2] === '/' ? '(?:.*/)?' : '.*';
        i += glob[i + 2] === '/' ? 2 : 1;
      } else if (c === '*') re += '[^/]*';
      else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    }
    globCache.set(glob, new RegExp(`^${re}$`));
  }
  return globCache.get(glob);
}

export const matchesAny = (file, globs) => globs.some((g) => globToRegExp(g).test(file));

export const isTestFile = (file) =>
  /\.(test|spec|integration-spec|e2e-spec)\.[cm]?[jt]sx?$/.test(file) || /(^|\/)__tests__\//.test(file);

const isSource = (file) => /\.[cm]?[jt]sx?$/.test(file) && !file.endsWith('.d.ts');

/** The frontend or API whose root contains `file`, with `file` relative to that root. */
export function locate(config, file) {
  for (const kind of ['frontends', 'apis']) {
    for (const unit of config[kind]) {
      const root = unit.root.replace(/\/+$/, '');
      if (file === root || file.startsWith(`${root}/`)) {
        return { kind: kind === 'frontends' ? 'frontend' : 'api', unit, inRoot: file.slice(root.length + 1) };
      }
    }
  }
  return null;
}

/** An import specifier, resolved to a path relative to the unit root (extension dropped). */
export function resolveSpecifier(unit, fromInRoot, specifier) {
  let target;
  if (specifier.startsWith('.')) {
    target = path.posix.normalize(path.posix.join(path.posix.dirname(fromInRoot), specifier));
  } else {
    const alias = Object.keys(unit.aliases ?? {})
      .sort((a, b) => b.length - a.length)
      .find((a) => specifier.startsWith(a));
    if (!alias) return { package: specifier };
    target = path.posix.normalize(unit.aliases[alias] + specifier.slice(alias.length));
  }
  return { path: target.replace(/\.[cm]?[jt]sx?$/, '').replace(/\/index$/, '') };
}

const stripExt = (p) => p.replace(/\.[cm]?[jt]sx?$/, '');

// ─── parsing ─────────────────────────────────────────────────────────────────

let ts;
/** typescript@5 from the project; `null` when it is missing or has no JS API (typescript@7). */
export function loadTypeScript(projectDir) {
  if (ts !== undefined) return ts;
  try {
    const candidate = createRequire(path.join(projectDir, 'package.json'))('typescript');
    ts = typeof candidate.createSourceFile === 'function' ? candidate : null;
  } catch {
    ts = null;
  }
  return ts;
}

/**
 * Imports, `jest.mock` targets, calls by name and JSX tags of one source text.
 * Comments and string contents never produce a finding.
 */
export function parse(tsApi, fileName, text) {
  const source = tsApi.createSourceFile(fileName, text, tsApi.ScriptTarget.Latest, true, tsApi.ScriptKind.TSX);
  const line = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const out = { imports: [], mocks: [], calls: [], jsxTags: [], hasJsx: false, exportsPascal: false };

  const visit = (node) => {
    if ((tsApi.isImportDeclaration(node) || tsApi.isExportDeclaration(node)) &&
        node.moduleSpecifier && tsApi.isStringLiteral(node.moduleSpecifier)) {
      const clause = tsApi.isImportDeclaration(node) ? node.importClause : undefined;
      const names = [];
      if (clause?.name) names.push({ local: clause.name.text, imported: 'default' });
      const bindings = clause?.namedBindings;
      if (bindings && tsApi.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          names.push({ local: el.name.text, imported: (el.propertyName ?? el.name).text });
        }
      }
      out.imports.push({
        specifier: node.moduleSpecifier.text,
        names,
        typeOnly: tsApi.isImportDeclaration(node) ? clause?.isTypeOnly === true : node.isTypeOnly,
        line: line(node),
      });
    }
    if (tsApi.isCallExpression(node)) {
      const callee = node.expression;
      const name = tsApi.isIdentifier(callee)
        ? callee.text
        : tsApi.isPropertyAccessExpression(callee) && tsApi.isIdentifier(callee.expression)
          ? `${callee.expression.text}.${callee.name.text}`
          : undefined;
      if (name) out.calls.push({ name, line: line(node) });
      if (/^(jest|vi)\.(mock|doMock)$/.test(name ?? '') && node.arguments[0] && tsApi.isStringLiteral(node.arguments[0])) {
        out.mocks.push({ specifier: node.arguments[0].text, line: line(node) });
      }
      // Dynamic import('x') counts as an import.
      if (callee.kind === tsApi.SyntaxKind.ImportKeyword && node.arguments[0] && tsApi.isStringLiteral(node.arguments[0])) {
        out.imports.push({ specifier: node.arguments[0].text, names: [], typeOnly: false, line: line(node) });
      }
    }
    if (tsApi.isJsxOpeningElement(node) || tsApi.isJsxSelfClosingElement(node)) {
      out.hasJsx = true;
      out.jsxTags.push(node.tagName.getText(source));
    }
    if (tsApi.isJsxFragment(node)) out.hasJsx = true;
    tsApi.forEachChild(node, visit);
  };
  visit(source);

  for (const statement of source.statements) {
    const exported = statement.modifiers?.some((m) => m.kind === tsApi.SyntaxKind.ExportKeyword);
    const name =
      (tsApi.isFunctionDeclaration(statement) || tsApi.isClassDeclaration(statement)) && statement.name?.text;
    const varNames = tsApi.isVariableStatement(statement)
      ? statement.declarationList.declarations.map((d) => (tsApi.isIdentifier(d.name) ? d.name.text : ''))
      : [];
    if (exported && [name, ...varNames].some((n) => n && /^[A-Z]/.test(n))) out.exportsPascal = true;
    if (tsApi.isExportAssignment(statement)) out.exportsPascal = true;
  }
  return out;
}

// ─── per-file rules ──────────────────────────────────────────────────────────

const sdkOf = (sdks, specifier) =>
  sdks.find((sdk) => (sdk.endsWith('/') ? specifier.startsWith(sdk) : specifier === sdk || specifier.startsWith(`${sdk}/`)));

/** Rules that need only the file itself. Returns `[{ rule, line, message }]`. */
export function checkFile(config, file, parsed) {
  const where = locate(config, file);
  if (!where || !isSource(file)) return [];
  const { kind, unit, inRoot } = where;
  const findings = [];
  const add = (rule, line, message) => findings.push({ rule, line, message });
  const test = isTestFile(inRoot);

  if (kind === 'frontend') {
    const clientPath = stripExt(unit.apiClient);
    const resolved = parsed.imports.map((i) => ({ ...i, ...resolveSpecifier(unit, inRoot, i.specifier) }));
    const isClient = (r) => r.path === clientPath;
    const isService = (r) => r.path && matchesAny(`${r.path}.ts`, unit.services);

    if (test) {
      const rh = parsed.imports.find(
        (i) => i.specifier === '@testing-library/react' && i.names.some((n) => n.imported === 'renderHook'),
      );
      if (rh) add('no-render-hook', rh.line, 'Test the component that uses the hook; never `renderHook` it.');
      if (matchesAny(inRoot, unit.hooks)) {
        add('no-hook-tests', 1, 'No test files for hooks: hooks are covered by the tests of the components that use them.');
      }
      return findings;
    }

    const component = matchesAny(inRoot, unit.components);
    const hook = matchesAny(inRoot, unit.hooks);
    const service = matchesAny(inRoot, unit.services);
    const apiLib = inRoot === unit.apiClient || matchesAny(inRoot, unit.apiLib);

    for (const r of resolved) {
      if (r.typeOnly) continue;
      if (component && (isService(r) || isClient(r))) {
        add('component-imports', r.line, `Components use hooks only; \`${r.specifier}\` is ${isClient(r) ? 'the API client' : 'a service'}.`);
      } else if (hook && isClient(r)) {
        add('hook-imports', r.line, 'Hooks call a service, never the API client. Move the request into the feature service.');
      } else if (!service && !apiLib && !component && !hook && isClient(r)) {
        add('client-importers', r.line, 'Only frontend services call `apiClient.request`.');
      }
      if (r.package === 'axios' && inRoot !== unit.apiClient) {
        add('no-fetch', r.line, `Every backend call goes through \`${unit.apiClient}\`.`);
      }
    }
    if (inRoot !== unit.apiClient) {
      for (const c of parsed.calls) {
        if (['fetch', 'window.fetch', 'globalThis.fetch'].includes(c.name)) {
          add('no-fetch', c.line, `Every backend call goes through \`${unit.apiClient}\`.`);
        }
      }
    }
    return findings;
  }

  // api
  const adapter = matchesAny(inRoot, unit.adapters);
  const allowed = matchesAny(inRoot, unit.allowedImporters);
  for (const i of parsed.imports) {
    const sdk = sdkOf(unit.sdks, i.specifier);
    if (!sdk) continue;
    if (test && !i.typeOnly) {
      add('no-sdk-in-specs', i.line, `Specs never import \`${i.specifier}\`: mock the port, or pass a fake client to the adapter.`);
    } else if (!test && !adapter && !allowed) {
      add('sdk-importers', i.line, `Only the provider's \`*.adapter.ts\` imports \`${i.specifier}\`; inject its port.`);
    }
  }
  if (test && !matchesAny(inRoot, unit.sdkMockAllowedIn)) {
    for (const m of parsed.mocks) {
      if (sdkOf(unit.sdks, m.specifier)) {
        add('no-sdk-in-specs', m.line, `Do not mock \`${m.specifier}\`: mock the port the consumer injects.`);
      }
    }
  }
  return findings;
}

// ─── cross-file rules ────────────────────────────────────────────────────────

/**
 * Is `file` a component (in a component folder, renders JSX, exports a
 * PascalCase name) or a service? Returns 'component' | 'service' | null.
 */
export function subjectKind(config, file, parsed) {
  const where = locate(config, file);
  if (!where || where.kind !== 'frontend' || !isSource(file) || isTestFile(where.inRoot)) return null;
  if (/\.stories\.[jt]sx?$/.test(file)) return null;
  const { unit, inRoot } = where;
  if (matchesAny(inRoot, unit.services)) return 'service';
  if (matchesAny(inRoot, unit.components) && parsed.hasJsx && parsed.exportsPascal) return 'component';
  return null;
}

/**
 * Checks that some test file of the same frontend imports `file` (a component
 * or service) — and, for a component, renders one of its exports as JSX.
 * Tests can live next to the subject or anywhere under the root.
 * `testFiles` lists the frontend's test files; `readParsed(path)` parses one.
 */
export function checkSubjectTest(config, file, kind, testFiles, readParsed) {
  const { unit, inRoot } = locate(config, file);
  const target = stripExt(inRoot).replace(/\/index$/, '');
  const unitRoot = unit.root.replace(/\/+$/, '');
  const name = path.posix.basename(stripExt(file));

  let importedOnly;
  for (const test of testFiles) {
    const parsed = readParsed(test);
    if (!parsed) continue;
    const testInRoot = test.slice(unitRoot.length + 1);
    const subjectImports = parsed.imports.filter(
      (i) => !i.typeOnly && resolveSpecifier(unit, testInRoot, i.specifier).path === target,
    );
    if (subjectImports.length === 0) continue;
    if (kind === 'service') return [];
    const locals = new Set(subjectImports.flatMap((i) => i.names.map((n) => n.local)));
    const renders = parsed.calls.some((c) => unit.renderFunctions.includes(c.name));
    if (renders && parsed.jsxTags.some((t) => locals.has(t.split('.')[0]))) return [];
    importedOnly ??= test;
  }
  if (importedOnly) {
    return [{
      rule: 'component-test',
      line: 1,
      message: `\`${importedOnly}\` imports this component but never renders it (${unit.renderFunctions.join('/')} with one of its exports as JSX).`,
    }];
  }
  return [{
    rule: `${kind}-test`,
    line: 1,
    message: kind === 'component'
      ? `No test renders this component: add \`${name}.test.tsx\` that renders it, with the feature's service mocked.`
      : `No test imports this service: add \`${name}.test.ts\` asserting each \`apiClient.request\` call.`,
  }];
}

// ─── baseline ────────────────────────────────────────────────────────────────

/**
 * Findings minus baselined ones. With `reportStale`, also a finding per
 * baseline entry of `file` that now passes (only at Stop: an edit that fixes
 * debt must never be blocked for it).
 */
export function applyBaseline(config, file, findings, { reportStale = false } = {}) {
  const tolerated = new Set(config.baseline[file] ?? []);
  const kept = findings.filter((f) => !tolerated.has(f.rule));
  const stillFailing = new Set(findings.map((f) => f.rule));
  const stale = reportStale ? [...tolerated].filter((rule) => !stillFailing.has(rule)) : [];
  return [
    ...kept,
    ...stale.map((rule) => ({
      rule: 'stale-baseline',
      line: 1,
      message: `\`${file}\` now passes \`${rule}\`: remove it from the baseline in ${CONFIG_FILE}.`,
    })),
  ];
}
