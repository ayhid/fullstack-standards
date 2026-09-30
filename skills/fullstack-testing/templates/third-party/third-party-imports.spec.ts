/**
 * Third-party SDK guard.
 *
 * WHY THIS EXISTS. A service that imports a provider's SDK directly can only
 * be tested by mocking that SDK, so its spec pins the provider's payload
 * instead of the app's intent, and swapping the provider rewrites every spec.
 * A spec that `jest.mock`s the SDK is testing past the adapter. Both look
 * fine in review.
 *
 * THE RULE. Each provider sits behind one adapter (`*.adapter.ts`) that
 * implements a port. Consumers inject the port; their specs mock the port.
 *
 * SCOPE — every `.ts` file under the source root:
 *   1. Only adapters (and the bootstrap files listed below) import an SDK.
 *   2. No spec imports an SDK at runtime or `jest.mock`s one (type-only
 *      imports are fine).
 *
 * ADAPT the constants below to the project. Parsed with the TypeScript
 * compiler (typescript@5's JS API), so comments never trip it.
 *
 * Lives at `src/architecture/third-party-imports.spec.ts`.
 */

import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

const SRC_ROOT = path.resolve(__dirname, '..');

/** Exact names, or a scope ending in `/` for every package in it. */
const THIRD_PARTY_SDKS = [
  '@getbrevo/brevo',
  'sib-api-v3-sdk',
  '@sendgrid/',
  'nodemailer',
  'stripe',
  '@aws-sdk/',
  '@sentry/',
  'twilio',
  'openai',
  '@anthropic-ai/sdk',
];

/** Files allowed to import an SDK besides adapters, e.g. `instrument.ts` for Sentry. */
const ALLOWED_IMPORTERS = new Set<string>(['instrument.ts', 'main.ts']);

const isAdapter = (file: string) => /\.adapter\.ts$/.test(file);
const isSpec = (file: string) => /\.(spec|integration-spec|e2e-spec)\.ts$/.test(file);

function sdkOf(specifier: string): string | undefined {
  return THIRD_PARTY_SDKS.find(sdk =>
    sdk.endsWith('/')
      ? specifier.startsWith(sdk)
      : specifier === sdk || specifier.startsWith(`${sdk}/`)
  );
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === 'node_modules' || entry.name.startsWith('.')
        ? []
        : sourceFiles(full);
    }
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') ? [full] : [];
  });
}

interface Finding {
  file: string;
  line: number;
  what: string;
}

function scan(full: string): Finding[] {
  const file = path.relative(SRC_ROOT, full).split(path.sep).join('/');
  const source = ts.createSourceFile(
    full,
    fs.readFileSync(full, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
  const line = (node: ts.Node) =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const findings: Finding[] = [];

  const visit = (node: ts.Node) => {
    // import … from 'sdk' / export … from 'sdk'
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const sdk = sdkOf(node.moduleSpecifier.text);
      const typeOnly = ts.isImportDeclaration(node)
        ? node.importClause?.isTypeOnly === true
        : node.isTypeOnly;
      if (sdk && !(isSpec(file) && typeOnly)) {
        findings.push({ file, line: line(node), what: `imports ${node.moduleSpecifier.text}` });
      }
    }
    // jest.mock('sdk') / jest.doMock('sdk')
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'jest' &&
      ['mock', 'doMock'].includes(node.expression.name.text) &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0]) &&
      sdkOf(node.arguments[0].text)
    ) {
      findings.push({ file, line: line(node), what: `jest.mock(${node.arguments[0].text})` });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return findings;
}

const findings = sourceFiles(SRC_ROOT).flatMap(scan);
const format = (f: Finding) => `${f.file}:${f.line} ${f.what}`;

describe('third-party SDK boundary', () => {
  it('only adapters import a third-party SDK', () => {
    const offenders = findings.filter(
      f =>
        !isSpec(f.file) &&
        !isAdapter(f.file) &&
        !ALLOWED_IMPORTERS.has(path.basename(f.file))
    );
    expect({
      rule: 'Inject the port (e.g. MAILER); only the *.adapter.ts file imports the SDK',
      offenders: offenders.map(format),
    }).toEqual({ rule: expect.any(String), offenders: [] });
  });

  it('no spec mocks or imports an SDK — mock the port, or pass a fake client to the adapter', () => {
    expect(findings.filter(f => isSpec(f.file)).map(format)).toEqual([]);
  });
});
