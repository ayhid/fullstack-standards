import { Test, TestingModule } from '@nestjs/testing';
import type { CanActivate, InjectionToken, Provider, Type } from '@nestjs/common';

import { PrismaService } from '../../src/prisma/prisma.service';

type IntegrationModuleOptions = {
  /** Providers under test (services, factories, etc.). */
  providers?: Provider[];
  /** Controllers under test — needed to boot a real HTTP app on the harness. */
  controllers?: Parameters<typeof Test.createTestingModule>[0]['controllers'];
  /** Extra modules to import (rarely needed). */
  imports?: Parameters<typeof Test.createTestingModule>[0]['imports'];
  /**
   * Guard stubs applied via `overrideGuard` BEFORE compile — controller guards
   * can only be replaced on the builder, never on the compiled module.
   */
  guardOverrides?: ReadonlyArray<[Type<CanActivate>, CanActivate]>;
  /**
   * Third-party ports replaced by mocks, e.g. `[[MAILER, mailerMock]]`. The
   * real adapter is never built, so no spec reaches the provider or needs its
   * credentials. Applied on the builder, before compile.
   */
  providerOverrides?: ReadonlyArray<[InjectionToken, unknown]>;
};

/**
 * Boot a minimal Nest module with the app's REAL `PrismaService`.
 *
 * It is not replaced by a bare client: extensions and middleware installed in
 * `PrismaService` (tenant isolation, soft delete, auditing) are behaviour under
 * test, and a bare client would silently skip them. It connects to the test
 * database because `setup-after-env` points `DATABASE_URL` at it before any
 * spec imports the app.
 *
 * Imports only what is under test, not AppModule, so a service spec does not
 * drag in cache, schedulers, storage or error tracking.
 */
export async function createIntegrationTestingModule(
  options: IntegrationModuleOptions = {},
): Promise<TestingModule> {
  const builder = Test.createTestingModule({
    imports: options.imports ?? [],
    controllers: options.controllers ?? [],
    providers: [PrismaService, ...(options.providers ?? [])],
  });

  for (const [guard, stub] of options.guardOverrides ?? []) {
    builder.overrideGuard(guard).useValue(stub);
  }
  for (const [token, mock] of options.providerOverrides ?? []) {
    builder.overrideProvider(token).useValue(mock);
  }

  const moduleRef = await builder.compile();
  await moduleRef.init();
  return moduleRef;
}

/** The app's client of a booted module — seed and read back through it. */
export function prismaOf(moduleRef: TestingModule): PrismaService {
  return moduleRef.get(PrismaService);
}
