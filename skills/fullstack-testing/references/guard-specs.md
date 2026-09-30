# Guard specs: enforce architecture with tests

Lint rules cover syntax. Conventions like "every form derives its error count from the
shared helper" or "no inline query keys" need a spec that reads the source and fails
with a pointer to the rule. Use one when a fix has already regressed once by copy-paste.

## How to write one

1. **Parse with the TypeScript compiler, not grep.** `ts.createSourceFile(path, text,
   ts.ScriptTarget.Latest, true)` needs no tsconfig. It is the JS compiler API of
   `typescript@5`; the native `typescript@7` package exports only its version, so a
   project on 7 adds `typescript@5` (or an alias of it) as a dev dependency for the
   guards. Comments are trivia and never
   appear in the tree, so prose that *mentions* a forbidden pattern cannot trip the
   guard. Hand-rolled comment strippers break on JSX text containing apostrophes and on
   regex literals.
2. **Assert the positive property.** "The value the gate reads comes from
   `sharedHelper()`" survives a rename; "no function named `countErrors`" does not, and
   misses inline re-implementations.
3. **Enumerate scope explicitly**, and add a completeness assertion that re-derives the
   list from the code (e.g. count the pages using the shell) so a new file cannot slip
   out of scope.
4. **Fail with a message that names the convention and the file.**
5. **Start the file with a WHY block**: what regressed, and why this is a spec.

## Good candidates

- Test-file naming (a mis-suffixed integration spec runs in no project).
- Every cache key comes from `queryKeys` (RTK Query: every tag from `tags`): no inline
  key in `queryKey`, a `useSWR`/`mutate` key, or `providesTags`/`invalidatesTags`. →
  `templates/frontend/cache-keys-contract.test.ts`
- The API layering: components import no service and no client, hooks import no client,
  only services import the client, only the client calls `fetch`, and no test
  `renderHook`s a feature hook. → `templates/frontend/api-layering-contract.test.ts`
- Third-party SDKs are imported by their adapter only, and no spec `jest.mock`s one. →
  `templates/third-party/third-party-imports.spec.ts`
- No import from a removed UI library.
- Forms use the shared validation mode / error-count helper.
