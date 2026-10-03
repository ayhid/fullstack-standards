import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  applyBaseline,
  checkFile,
  checkSubjectTest,
  globToRegExp,
  loadTypeScript,
  locate,
  parse,
  resolveConfig,
  resolveSpecifier,
  subjectKind,
} from './checks.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tsApi = loadTypeScript(repoRoot);

const config = resolveConfig({
  frontends: [{
    root: 'app/src',
    aliases: { '@/': '' },
    components: ['components/**', 'routes/**'],
    hooks: ['**/hooks/**'],
    services: ['**/services/**', '**/*.service.ts'],
    apiClient: 'lib/api-client.ts',
    apiLib: ['lib/api/**'],
    renderFunctions: ['render', 'renderWithClient'],
  }],
  apis: [{
    root: 'api/src',
    adapters: ['**/*.adapter.ts'],
    sdks: ['@getbrevo/brevo', '@sentry/'],
    allowedImporters: ['**/instrument.ts'],
    sdkMockAllowedIn: ['sentry/sentry.service.spec.ts'],
  }],
  baseline: {},
});

const rules = (file, text) => checkFile(config, file, parse(tsApi, file, text)).map((f) => f.rule);

describe('globToRegExp', () => {
  it('matches ** across folders and * within one', () => {
    assert.ok(globToRegExp('**/hooks/**').test('lib/hooks/use-x.ts'));
    assert.ok(globToRegExp('**/hooks/**').test('hooks/use-x.ts'));
    assert.ok(globToRegExp('components/**').test('components/a/B.tsx'));
    assert.ok(!globToRegExp('features/*/components/**').test('features/a/b/components/C.tsx'));
    assert.ok(globToRegExp('**/*.service.ts').test('features/t/tasks.service.ts'));
  });
});

describe('resolveSpecifier', () => {
  const unit = config.frontends[0];
  it('resolves relative paths and aliases, dropping the extension and /index', () => {
    assert.deepEqual(resolveSpecifier(unit, 'lib/hooks/use-x.ts', '../api-client'), { path: 'lib/api-client' });
    assert.deepEqual(resolveSpecifier(unit, 'components/A.tsx', '@/lib/api-client'), { path: 'lib/api-client' });
    assert.deepEqual(resolveSpecifier(unit, 'components/A.tsx', './B/index'), { path: 'components/B' });
    assert.deepEqual(resolveSpecifier(unit, 'components/A.tsx', 'react'), { package: 'react' });
  });
});

describe('frontend per-file rules', () => {
  it('blocks renderHook in any test, and any test file under hooks/', () => {
    assert.deepEqual(
      rules('app/src/lib/hooks/use-x.test.tsx', "import { renderHook } from '@testing-library/react';"),
      ['no-render-hook', 'no-hook-tests'],
    );
    assert.deepEqual(rules('app/src/components/A.test.tsx', "import { render } from '@testing-library/react';"), []);
  });

  it('blocks a component importing a service or the client, but not a type', () => {
    assert.deepEqual(rules('app/src/components/A.tsx', "import { s } from '@/features/t/services/t.service';"), ['component-imports']);
    assert.deepEqual(rules('app/src/routes/r.tsx', "import { apiClient } from '../lib/api-client';"), ['component-imports']);
    assert.deepEqual(rules('app/src/components/A.tsx', "import type { T } from '@/lib/api-client';"), []);
  });

  it('blocks a hook importing the client; lets it import a service', () => {
    assert.deepEqual(rules('app/src/lib/hooks/use-x.ts', "import { apiClient } from '../api-client';"), ['hook-imports']);
    assert.deepEqual(rules('app/src/lib/hooks/use-x.ts', "import { s } from '../services/x.service';"), []);
  });

  it('lets only services and lib/api import the client', () => {
    assert.deepEqual(rules('app/src/lib/services/x.service.ts', "import { apiClient } from '../api-client';"), []);
    assert.deepEqual(rules('app/src/lib/util.ts', "import { apiClient } from './api-client';"), ['client-importers']);
  });

  it('blocks fetch and axios outside the client, ignoring comments and strings', () => {
    assert.deepEqual(rules('app/src/lib/util.ts', 'export const x = () => fetch("/a");'), ['no-fetch']);
    assert.deepEqual(rules('app/src/lib/util.ts', "import axios from 'axios';"), ['no-fetch']);
    assert.deepEqual(rules('app/src/lib/util.ts', '// fetch("/a")\nconst s = "fetch(x)"; q.refetch();'), []);
    assert.deepEqual(rules('app/src/lib/api-client.ts', 'fetch("/a");'), []);
  });
});

describe('api per-file rules', () => {
  it('lets only adapters and allowed bootstrap files import an SDK', () => {
    assert.deepEqual(rules('api/src/mail/brevo-mailer.adapter.ts', "import { BrevoClient } from '@getbrevo/brevo';"), []);
    assert.deepEqual(rules('api/src/instrument.ts', "import * as Sentry from '@sentry/nestjs';"), []);
    assert.deepEqual(rules('api/src/orders/orders.service.ts', "import { BrevoClient } from '@getbrevo/brevo';"), ['sdk-importers']);
  });

  it('blocks specs that mock or import an SDK, except type-only and allowed adapters', () => {
    assert.deepEqual(rules('api/src/x/x.service.spec.ts', "jest.mock('@getbrevo/brevo');"), ['no-sdk-in-specs']);
    assert.deepEqual(rules('api/src/x/x.service.spec.ts', "import { BrevoClient } from '@getbrevo/brevo';"), ['no-sdk-in-specs']);
    assert.deepEqual(rules('api/src/x/x.service.spec.ts', "import type { Brevo } from '@getbrevo/brevo';"), []);
    assert.deepEqual(rules('api/src/sentry/sentry.service.spec.ts', "jest.mock('@sentry/nestjs', () => ({}));"), []);
  });
});

describe('component and service tests (cross-file)', () => {
  const component = 'app/src/components/TaskForm.tsx';
  const componentText = 'export function TaskForm() { return <form />; }';
  const files = {};
  const readParsed = (p) => (p in files ? parse(tsApi, p, files[p]) : null);
  const tests = () => Object.keys(files);
  const check = (file, kind) => checkSubjectTest(config, file, kind, tests(), readParsed);

  it('recognises components by folder, JSX and a PascalCase export', () => {
    assert.equal(subjectKind(config, component, parse(tsApi, component, componentText)), 'component');
    assert.equal(subjectKind(config, 'app/src/components/util.ts', parse(tsApi, 'u.ts', 'export const x = 1;')), null);
    assert.equal(subjectKind(config, 'app/src/components/A.stories.tsx', parse(tsApi, 'a.tsx', 'export const A = () => <a />;')), null);
    assert.equal(subjectKind(config, 'app/src/lib/services/x.service.ts', parse(tsApi, 'x.ts', 'export const x = {};')), 'service');
  });

  it('fails when no test imports the component, or one imports it without rendering it', () => {
    assert.deepEqual(check(component, 'component').map((f) => f.rule), ['component-test']);

    files['app/src/components/Other.test.tsx'] = "import { useTasks } from '../lib/hooks/use-tasks';\nrender(<div />);";
    assert.match(check(component, 'component')[0].message, /No test renders/);

    files['app/src/components/TaskForm.test.tsx'] = "import { TaskForm } from './TaskForm';\nit('x', () => { expect(TaskForm).toBeDefined(); });";
    assert.match(check(component, 'component')[0].message, /never renders/);
  });

  it('passes when any test of the frontend renders one of its exports, wherever it lives', () => {
    files['app/src/test/task-form.test.tsx'] =
      "import { TaskForm } from '@/components/TaskForm';\nrenderWithClient(<TaskForm projectId={1} />);";
    assert.deepEqual(check(component, 'component'), []);
  });

  it('requires a test that imports the service', () => {
    const service = 'app/src/lib/services/tasks.service.ts';
    assert.deepEqual(check(service, 'service').map((f) => f.rule), ['service-test']);
    files['app/src/lib/services/tasks.service.test.ts'] = "import { tasksService } from './tasks.service';";
    assert.deepEqual(check(service, 'service'), []);
  });
});

describe('baseline', () => {
  const withBaseline = { ...config, baseline: { 'app/src/lib/hooks/use-x.ts': ['hook-imports'] } };
  const finding = { rule: 'hook-imports', line: 1, message: '' };

  it('tolerates baselined debt', () => {
    assert.deepEqual(applyBaseline(withBaseline, 'app/src/lib/hooks/use-x.ts', [finding]), []);
  });

  it('reports a fixed entry as stale only when asked (at Stop)', () => {
    assert.deepEqual(applyBaseline(withBaseline, 'app/src/lib/hooks/use-x.ts', []), []);
    assert.deepEqual(
      applyBaseline(withBaseline, 'app/src/lib/hooks/use-x.ts', [], { reportStale: true }).map((f) => f.rule),
      ['stale-baseline'],
    );
  });
});

describe('strapi presets', () => {
  const strapi = resolveConfig({
    frontends: [{ root: 'admin/src', preset: 'strapi-admin' }],
    apis: [{ root: '.', preset: 'strapi-plugin' }],
  });
  const ruleIds = (file, text) => checkFile(strapi, file, parse(tsApi, file, text)).map((f) => f.rule);

  it('locates admin files in the frontend and the rest of the plugin in the API, ignoring build output', () => {
    assert.equal(locate(strapi, 'admin/src/components/A.tsx').kind, 'frontend');
    assert.deepEqual(locate(strapi, 'server/src/domain/x.ts'), { kind: 'api', unit: strapi.apis[0], inRoot: 'server/src/domain/x.ts' });
    assert.equal(locate(strapi, 'dist/server/index.js'), null);
    assert.equal(locate(strapi, 'fixture-app/src/index.ts'), null);
  });

  it('treats getFetchClient as the entry point: services only', () => {
    const imp = "import { getFetchClient } from '@strapi/strapi/admin';";
    assert.deepEqual(ruleIds('admin/src/features/t/services/tasks.service.ts', imp), []);
    assert.deepEqual(ruleIds('admin/src/features/t/hooks/use-tasks.ts', imp), ['hook-imports']);
    assert.deepEqual(ruleIds('admin/src/components/Panel.tsx', "import { useFetchClient } from '@strapi/strapi/admin';"), ['component-imports']);
    assert.deepEqual(ruleIds('admin/src/utils/x.ts', imp), ['client-importers']);
    // Other admin exports stay free to use.
    assert.deepEqual(ruleIds('admin/src/components/Panel.tsx', "import { useNotification, Page } from '@strapi/strapi/admin';"), []);
  });

  it('keeps data-library hooks out of components', () => {
    assert.deepEqual(ruleIds('admin/src/pages/Home.tsx', "import { useQuery } from '@tanstack/react-query';"), ['component-data-hooks']);
    assert.deepEqual(ruleIds('admin/src/pages/App.tsx', "import { QueryClientProvider } from '@tanstack/react-query';"), []);
    assert.deepEqual(ruleIds('admin/src/features/t/hooks/use-tasks.ts', "import { useQuery } from '@tanstack/react-query';"), []);
  });

  it('keeps domain modules framework-free', () => {
    assert.deepEqual(ruleIds('server/src/domain/match.ts', "import { factories } from '@strapi/strapi';"), ['domain-framework-free']);
    assert.deepEqual(ruleIds('server/src/domain/match.ts', 'export const f = () => strapi.documents("x").findMany();'), ['domain-framework-free']);
    assert.deepEqual(ruleIds('server/src/domain/match.ts', "import type { Core } from '@strapi/strapi';\nexport const f = (s: string) => s.trim();"), []);
    assert.deepEqual(ruleIds('server/src/services/s.ts', 'export default ({ strapi }) => ({ f: () => strapi.documents("x") });'), []);
  });

  it('keeps unit tests units', () => {
    assert.deepEqual(ruleIds('tests/unit/match.test.ts', "import { getStrapi } from '../support/harness';"), ['unit-stays-unit']);
    assert.deepEqual(ruleIds('tests/unit/match.test.ts', "import { createStrapi } from '@strapi/strapi';\ncreateStrapi();"), ['unit-stays-unit', 'unit-stays-unit']);
    assert.deepEqual(ruleIds('tests/unit/match.test.ts', "import { createFakeStrapi } from '../support/fake-strapi';"), []);
    assert.deepEqual(ruleIds('tests/integration/match.int.test.ts', "import { getStrapi } from '../support/harness';"), []);
  });

  it('forbids faking framework data access in unit tests', () => {
    assert.deepEqual(ruleIds('tests/unit/s.test.ts', 'const strapi = { documents: jest.fn(() => ({ findMany: jest.fn() })) };'), ['no-fake-data-access']);
    assert.deepEqual(ruleIds('tests/unit/s.test.ts', 'const strapi = { db: { query: vi.fn() } };'), ['no-fake-data-access']);
    assert.deepEqual(ruleIds('tests/unit/s.test.ts', 'const strapi = { log: { warn: jest.fn() } };'), []);
  });

  it('only lets server adapters import an SDK', () => {
    assert.deepEqual(ruleIds('server/src/adapters/brevo-mailer.adapter.ts', "import { BrevoClient } from '@getbrevo/brevo';"), []);
    assert.deepEqual(ruleIds('server/src/services/mail.ts', "import { BrevoClient } from '@getbrevo/brevo';"), ['sdk-importers']);
  });

  it('rejects an unknown preset', () => {
    assert.throws(() => resolveConfig({ frontends: [{ root: 'x', preset: 'nope' }] }), /unknown preset/);
  });
});
