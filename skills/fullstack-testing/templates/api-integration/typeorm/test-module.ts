import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { EntityClassOrSchema } from '@nestjs/typeorm/dist/interfaces/entity-class-or-schema.type';
import type { CanActivate, Provider, Type } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { TEST_ENTITIES, testDataSourceOptions } from './test-data-source';

type IntegrationModuleOptions = {
  /** Providers under test (services, factories, etc.). */
  providers?: Provider[];
  /** Controllers under test — needed to boot a real HTTP app on the harness. */
  controllers?: Parameters<typeof Test.createTestingModule>[0]['controllers'];
  /** Extra modules to import (rarely needed). */
  imports?: Parameters<typeof Test.createTestingModule>[0]['imports'];
  /**
   * Repositories to expose via forFeature. Defaults to the whole entity set so
   * a service's `@InjectRepository` dependencies always resolve.
   */
  entities?: EntityClassOrSchema[];
  /**
   * Guard stubs applied via `overrideGuard` BEFORE the module is compiled —
   * controller guards are registered as injectables by the scanner, so they can
   * only be replaced through the builder, never on the compiled module.
   */
  guardOverrides?: ReadonlyArray<[Type<CanActivate>, CanActivate]>;
};

/**
 * Boot a minimal Nest testing module wired to the real (migrated) test
 * database. Deliberately imports only TypeOrmModule + the providers under test
 * rather than the full AppModule, so a service integration test does not drag
 * in unrelated global modules (cache, scheduling, Sentry, S3, …).
 */
export async function createIntegrationTestingModule(
  options: IntegrationModuleOptions = {},
): Promise<TestingModule> {
  const builder = Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot(testDataSourceOptions()),
      TypeOrmModule.forFeature(options.entities ?? [...TEST_ENTITIES]),
      ...(options.imports ?? []),
    ],
    controllers: options.controllers ?? [],
    providers: options.providers ?? [],
  });

  for (const [guard, stub] of options.guardOverrides ?? []) {
    builder.overrideGuard(guard).useValue(stub);
  }

  return builder.compile();
}

/** Convenience accessor for the DataSource of a booted module. */
export function dataSourceOf(moduleRef: TestingModule): DataSource {
  return moduleRef.get(DataSource);
}
