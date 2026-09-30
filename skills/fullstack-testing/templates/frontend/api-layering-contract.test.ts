/**
 * API layering contract guard.
 *
 * WHY THIS EXISTS. The frontend talks to the backend through one chain:
 *
 *   component → feature hook → frontend service → apiClient.request → API
 *
 * Every shortcut works on the day it is written: a component that calls a
 * service skips the cache and its invalidation; a hook that calls the client
 * spreads paths and wire formats outside the service, where no service test
 * pins them; a stray `fetch` skips auth refresh, retries and the error shape.
 * A hook test with `renderHook` passes against a hook no component uses the
 * way the test does. None of this is visible in review.
 *
 * WHY THE AST AND NOT A GREP. `ts.createSourceFile` only parses: comments
 * never reach the tree, so prose that mentions `fetch(` cannot trip it, and an
 * import split across lines cannot slip past it.
 *
 * SCOPE — every source file under the app root:
 *   1. Components and pages import neither a service nor the API client.
 *   2. Hooks do not import the API client.
 *   3. Only services and `lib/api/` import the API client.
 *   4. Only the API client calls `fetch` or imports `axios`.
 *   5. No test renders a feature hook with `renderHook`; test it through a
 *      component instead.
 *
 * ADAPT the constants below to the project's layout (the project profile
 * lists the real paths).
 */

import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const APP_ROOT = path.resolve(__dirname, '..');
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'coverage']);

/** Import aliases, resolved against the app root. */
const ALIASES: Record<string, string> = {
  '@lib/': 'lib/',
  '@features/': 'features/',
  '@/': '',
};

/** The single entry point, relative to the app root, without extension. */
const CLIENT = 'lib/api/client';

const isComponent = (file: string) => /(^|\/)(components|pages)\//.test(file);
const isHook = (file: string) => /(^|\/)hooks\//.test(file);
const isService = (file: string) =>
  /(^|\/)services\//.test(file) || /\.service\.tsx?$/.test(file);
const isApiLib = (file: string) => file.startsWith('lib/api/');
const isClient = (file: string) => file.replace(/\.tsx?$/, '') === CLIENT;
const isFeatureHook = (target: string) => /(^|\/)features\/[^/]+\/hooks\//.test(target);

interface Parsed {
  file: string; // relative to APP_ROOT
  source: ts.SourceFile;
  isTest: boolean;
  imports: Array<{ target: string; line: number }>; // targets relative to APP_ROOT
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRS.has(entry.name) || entry.name.startsWith('.')
        ? []
        : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [full] : [];
  });
}

/** Resolve a module specifier to a path relative to the app root, or keep a package name. */
function resolveTarget(fromFile: string, specifier: string): string {
  if (specifier.startsWith('.')) {
    return path
      .relative(APP_ROOT, path.resolve(path.dirname(fromFile), specifier))
      .split(path.sep)
      .join('/');
  }
  for (const [alias, dir] of Object.entries(ALIASES)) {
    if (specifier.startsWith(alias)) return dir + specifier.slice(alias.length);
  }
  return specifier;
}

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function parse(full: string): Parsed {
  const source = ts.createSourceFile(
    full,
    fs.readFileSync(full, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const imports: Parsed['imports'] = [];
  for (const statement of source.statements) {
    const specifier =
      (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : undefined;
    if (specifier) {
      imports.push({ target: resolveTarget(full, specifier), line: lineOf(source, statement) });
    }
  }
  const file = path.relative(APP_ROOT, full).split(path.sep).join('/');
  return {
    file,
    source,
    isTest: /\.(test|spec)\.tsx?$/.test(file) || /(^|\/)__tests__\//.test(file),
    imports,
  };
}

/** Every call whose callee is `name`, `window.name` or `globalThis.name`. */
function callsTo(source: ts.SourceFile, name: string): ts.CallExpression[] {
  const found: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (
        (ts.isIdentifier(callee) && callee.text === name) ||
        (ts.isPropertyAccessExpression(callee) &&
          callee.name.text === name &&
          ts.isIdentifier(callee.expression) &&
          ['window', 'globalThis', 'self'].includes(callee.expression.text))
      ) {
        found.push(node);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const files = sourceFiles(APP_ROOT).map(parse);
const appFiles = files.filter(f => !f.isTest);
const testFiles = files.filter(f => f.isTest);

const importsClient = (target: string) => target === CLIENT || target.startsWith(`${CLIENT}.`);
const importsService = (target: string) =>
  /(^|\/)services\//.test(target) || /\.service$/.test(target);

function offenders(
  scope: Parsed[],
  forbidden: (target: string) => boolean
): string[] {
  return scope.flatMap(f =>
    f.imports.filter(i => forbidden(i.target)).map(i => `${f.file}:${i.line} → ${i.target}`)
  );
}

describe('API layering contract', () => {
  it('finds the API client it guards', () => {
    expect(
      appFiles.some(f => isClient(f.file)),
      `No ${CLIENT}.ts under ${APP_ROOT}: fix CLIENT, or this guard checks nothing`
    ).toBe(true);
  });

  it('components and pages call hooks, never a service or the API client', () => {
    expect(
      offenders(appFiles.filter(f => isComponent(f.file)), t => importsService(t) || importsClient(t)),
      'Components use feature hooks only; the hook calls the service'
    ).toEqual([]);
  });

  it('hooks call services, never the API client', () => {
    expect(
      offenders(appFiles.filter(f => isHook(f.file)), importsClient),
      'Move the request into the feature service and call the service from the hook'
    ).toEqual([]);
  });

  it('only services and lib/api import the API client', () => {
    expect(
      offenders(
        appFiles.filter(f => !isService(f.file) && !isApiLib(f.file)),
        importsClient
      ),
      '`apiClient.request` is called from frontend services only'
    ).toEqual([]);
  });

  it('only the API client calls fetch or imports axios', () => {
    const found = appFiles
      .filter(f => !isClient(f.file))
      .flatMap(f => [
        ...callsTo(f.source, 'fetch').map(c => `${f.file}:${lineOf(f.source, c)} → fetch()`),
        ...f.imports
          .filter(i => i.target === 'axios')
          .map(i => `${f.file}:${i.line} → axios`),
      ]);
    expect(found, `Every backend call goes through ${CLIENT}`).toEqual([]);
  });

  it('no test renders a feature hook on its own', () => {
    const found = testFiles
      .filter(f => callsTo(f.source, 'renderHook').length > 0)
      .flatMap(f =>
        f.imports
          .filter(i => isFeatureHook(i.target))
          .map(i => `${f.file}:${i.line} → ${i.target}`)
      );
    expect(
      found,
      'Test a feature hook through the component that uses it, with the service mocked'
    ).toEqual([]);
  });
});
