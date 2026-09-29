/**
 * Query-key contract guard.
 *
 * WHY THIS EXISTS. An inline key that misspells a root matches nothing and
 * raises no error: a list cached under `['invoice']` and a delete that
 * invalidates `['invoices']` leave the deleted row on screen until a reload.
 * Two resources caching under one root serve each other's data. Both are
 * invisible in review, because an inline array looks as valid as a factory
 * call.
 *
 * WHY THE AST AND NOT A GREP. `ts.createSourceFile` only parses, and comments
 * never reach the tree: prose that quotes `queryKey: ['x']` cannot trip it,
 * and a key behind a ternary or split across lines cannot slip past it.
 *
 * SCOPE.
 *   1. Every non-test source file under the app root: no `queryKey` property
 *      holds an array literal, directly or in a ternary branch.
 *   2. Every section of `queryKeys` that declares `all`: each key it produces
 *      starts with that root.
 *   3. No two sections share a root — two resources caching under one key
 *      serve each other's data.
 */

import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { queryKeys } from '@lib/api/query-keys';

const APP_ROOT = path.resolve(__dirname, '..');
const SKIPPED_DIRS = new Set(['node_modules', 'dist', 'coverage', '__tests__']);

type Section = Record<string, unknown>;

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

function holdsArrayLiteral(node: ts.Expression): boolean {
  const inner = ts.isParenthesizedExpression(node) ? node.expression : node;
  if (ts.isArrayLiteralExpression(inner)) return true;
  if (ts.isConditionalExpression(inner)) {
    return (
      holdsArrayLiteral(inner.whenTrue) || holdsArrayLiteral(inner.whenFalse)
    );
  }
  return false;
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

const rootedSections = Object.entries(
  queryKeys as Record<string, Section>
).filter(([, section]) => Array.isArray(section.all));

describe('query-key contract', () => {
  it('has no inline array query keys outside tests', () => {
    const offenders: string[] = [];

    for (const file of sourceFiles(APP_ROOT)) {
      const source = ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true
      );
      const visit = (node: ts.Node) => {
        if (
          ts.isPropertyAssignment(node) &&
          node.name.getText(source) === 'queryKey' &&
          holdsArrayLiteral(node.initializer)
        ) {
          const { line } = source.getLineAndCharacterOfPosition(
            node.getStart(source)
          );
          offenders.push(`${path.relative(APP_ROOT, file)}:${line + 1}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }

    expect(
      offenders,
      'Build query keys with `queryKeys` from @lib/api/queryKeys, never an inline array'
    ).toEqual([]);
  });

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
