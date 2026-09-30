/**
 * Cache-key contract guard.
 *
 * WHY THIS EXISTS. An inline key that misspells a root matches nothing and
 * raises no error: a list cached under `['invoice']` and a delete that
 * invalidates `['invoices']` leave the deleted row on screen until a reload.
 * Two resources caching under one root serve each other's data. Both are
 * invisible in review, because an inline key looks as valid as a factory
 * call.
 *
 * WHY THE AST AND NOT A GREP. `ts.createSourceFile` only parses, and comments
 * never reach the tree: prose that quotes `queryKey: ['x']` cannot trip it,
 * and a key behind a ternary or split across lines cannot slip past it.
 *
 * SCOPE. Set `LIBRARY` to the app's data-fetching library.
 *   1. Every non-test source file under the app root holds no inline key,
 *      directly or in a ternary branch:
 *        tanstack-query  an array literal as a `queryKey` property;
 *        swr             an array or string literal as the key (first
 *                        argument) of `useSWR`, `useSWRInfinite`,
 *                        `useSWRMutation` or `mutate`;
 *        rtk-query       a string literal in `providesTags`/`invalidatesTags`
 *                        (tag types come from `tags.ts`).
 *   2. Array keys: every section of `queryKeys` that declares `all` produces
 *      only keys under that root, and no two sections share a root.
 *      RTK Query: no two tag types differ only by a plural `s`.
 */

import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { queryKeys } from '@lib/api/query-keys';

type Library = 'tanstack-query' | 'swr' | 'rtk-query';
type Section = Record<string, unknown>;

const LIBRARY: Library = 'tanstack-query';
const KEY_FACTORY: Record<string, Section> = queryKeys;
const TAG_TYPES: readonly string[] = [];
// RTK Query: replace the `queryKeys` import and the two constants above with
//   import { tagTypes } from '@lib/api/tags';
//   const LIBRARY: Library = 'rtk-query';
//   const KEY_FACTORY: Record<string, Section> = {};
//   const TAG_TYPES: readonly string[] = tagTypes;

const APP_ROOT = path.resolve(__dirname, '..');
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'coverage', '__tests__']);
// RTK Query: the one file allowed to spell tag types.
const TAGS_FILE = /(^|\/)lib\/api\/tags\.ts$/;

const SWR_KEYED_CALLS = new Set(['useSWR', 'useSWRInfinite', 'useSWRMutation', 'mutate']);
const RTK_TAG_PROPERTIES = new Set(['providesTags', 'invalidatesTags']);

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRS.has(entry.name) || entry.name.startsWith('.')
        ? []
        : sourceFiles(full);
    }
    const isSource =
      /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts');
    const isTest = /\.(test|spec|stories)\.tsx?$/.test(entry.name);
    return isSource && !isTest ? [full] : [];
  });
}

/** `node`, or either branch of a (parenthesised) ternary, satisfies `test`. */
function holds(node: ts.Expression, test: (n: ts.Expression) => boolean): boolean {
  const inner = ts.isParenthesizedExpression(node) ? node.expression : node;
  if (ts.isConditionalExpression(inner)) {
    return holds(inner.whenTrue, test) || holds(inner.whenFalse, test);
  }
  return test(inner);
}

const isArrayLiteral = (n: ts.Expression) => ts.isArrayLiteralExpression(n);
const isKeyLiteral = (n: ts.Expression) =>
  ts.isArrayLiteralExpression(n) ||
  ts.isStringLiteral(n) ||
  ts.isNoSubstitutionTemplateLiteral(n);

/** The callee's last name: `mutate`, `cache.mutate`, `useSWRConfig().mutate`. */
function calleeName(call: ts.CallExpression): string | undefined {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return undefined;
}

/** A string tag type anywhere inside a `providesTags`/`invalidatesTags` value. */
function containsTagLiteral(node: ts.Node): boolean {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    // `{ type: 'Task', id: 'LIST' }`: the id is data, the type is the key.
    const parent = node.parent;
    const isIdValue =
      ts.isPropertyAssignment(parent) && parent.name.getText() === 'id';
    return !isIdValue;
  }
  return ts.forEachChild(node, containsTagLiteral) ?? false;
}

function inlineKeyAt(node: ts.Node, source: ts.SourceFile): boolean {
  switch (LIBRARY) {
    case 'tanstack-query':
      return (
        ts.isPropertyAssignment(node) &&
        node.name.getText(source) === 'queryKey' &&
        holds(node.initializer, isArrayLiteral)
      );
    case 'swr':
      return (
        ts.isCallExpression(node) &&
        SWR_KEYED_CALLS.has(calleeName(node) ?? '') &&
        node.arguments.length > 0 &&
        holds(node.arguments[0], isKeyLiteral)
      );
    case 'rtk-query':
      return (
        ts.isPropertyAssignment(node) &&
        RTK_TAG_PROPERTIES.has(node.name.getText(source)) &&
        containsTagLiteral(node.initializer)
      );
  }
}

/** Every key a section produces; functions get placeholder arguments. */
function producedKeys(section: Section): Array<[string, readonly unknown[]]> {
  return Object.entries(section).map(([member, value]) => [
    member,
    typeof value === 'function'
      ? (value as (...args: unknown[]) => readonly unknown[])(1, 'x', 'y')
      : (value as readonly unknown[]),
  ]);
}

const rootedSections = Object.entries(KEY_FACTORY).filter(([, section]) =>
  Array.isArray(section.all)
);

describe('cache-key contract', () => {
  it('has no inline cache keys outside tests', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(APP_ROOT)) {
      const relative = path.relative(APP_ROOT, file);
      if (LIBRARY === 'rtk-query' && TAGS_FILE.test(relative)) continue;
      const source = ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true
      );
      const visit = (node: ts.Node) => {
        if (inlineKeyAt(node, source)) {
          const { line } = source.getLineAndCharacterOfPosition(
            node.getStart(source)
          );
          offenders.push(`${relative}:${line + 1}`);
          return;
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }

    expect(
      offenders,
      LIBRARY === 'rtk-query'
        ? 'Build tags with `tags` from @lib/api/tags, never a string tag type'
        : 'Build cache keys with `queryKeys` from @lib/api/query-keys, never an inline key'
    ).toEqual([]);
  });

  describe.runIf(LIBRARY !== 'rtk-query')('array keys', () => {
    it.each(rootedSections)(
      'queryKeys.%s: every key starts with its root',
      (_name, section) => {
        const root = section.all as readonly unknown[];
        for (const [member, key] of producedKeys(section)) {
          expect(
            key.slice(0, root.length),
            `${member} leaves ${JSON.stringify(root)}`
          ).toEqual([...root]);
        }
      }
    );

    it('gives every section its own root', () => {
      const byRoot = new Map<string, string[]>();
      for (const [name, section] of rootedSections) {
        const root = JSON.stringify(section.all);
        byRoot.set(root, [...(byRoot.get(root) ?? []), name]);
      }
      const shared = [...byRoot.entries()].filter(
        ([, names]) => names.length > 1
      );
      expect(
        shared,
        'two sections caching under one root serve each other data'
      ).toEqual([]);
    });
  });

  it.runIf(LIBRARY === 'rtk-query')('keeps one tag type per resource', () => {
    const singular = (type: string) => type.replace(/s$/, '');
    const clashes = TAG_TYPES.filter(
      (type, index) =>
        TAG_TYPES.findIndex(other => singular(other) === singular(type)) !== index
    );
    expect(clashes, 'a tag type and its plural never invalidate each other').toEqual([]);
  });
});
