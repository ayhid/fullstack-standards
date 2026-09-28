# Guard specs: enforce architecture with tests

Lint rules cover syntax. Conventions like "every form derives its error count from the
shared helper" or "no inline query keys" need a spec that reads the source and fails
with a pointer to the rule. Use one when a fix has already regressed once by copy-paste.

## How to write one

1. **Parse with the TypeScript compiler, not grep.** `ts.createSourceFile(path, text,
   ts.ScriptTarget.Latest, true)` needs no tsconfig. Comments are trivia and never
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
- Every `useQuery`/`invalidateQueries` key comes from `queryKeys` (no array literal as
  `queryKey`).
- No component imports the HTTP client directly.
- No import from a removed UI library.
- Forms use the shared validation mode / error-count helper.
