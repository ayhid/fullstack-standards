---
name: project-profile
description: Create or refresh a repository's project profile — the AGENTS.md block that tells the tanstack-query-data-layer and fullstack-testing skills this repo's real paths, commands, ORM, test setup and known debt. Use when the user asks to create, generate, update or check the project profile, when setting up those skills in a new repo, or when either skill finds no profile.
---

# Project profile

The profile is a marked block in the repo's `AGENTS.md`
(`<!-- project-profile:start -->` … `<!-- project-profile:end -->`). The other skills
read it first and let it win over their defaults, so it has to be **accurate**, not
merely filled in.

## Steps

1. **Detect.** Run the detector read-only from the repo root and read its output:

   ```bash
   node <this skill>/scripts/detect-profile.mjs .          # the block, to stdout
   node <this skill>/scripts/detect-profile.mjs . --json   # raw detection
   ```

   It finds the package manager and workspaces, NestJS APIs and their ORM (Prisma:
   version, generator, client import, driver adapter, extensions on `PrismaService`;
   TypeORM: data source, migrations), test runners and commands, the integration
   harness, TanStack Query files (QueryClient, key factory, HTTP client, feature
   hooks), Playwright, the Postgres image, Node local vs CI, CI workflows, and whether
   Turbo caches `test`.

2. **Verify every detected line** against the repo before writing. The detector reads
   by pattern and can pick the wrong file. Open each path it names and check that it is
   the real one (e.g. the QueryClient with production `defaultOptions`, not a test
   helper). Check each command exists in that workspace's `package.json`.

3. **Write.** `node <this skill>/scripts/detect-profile.mjs . --write` inserts the block
   into `AGENTS.md`, or replaces the existing block (`--file <path>` for another file).
   The manual section between `project-profile:manual:start/end` is preserved on
   re-runs; everything else is regenerated.

4. **Correct what the detector got wrong** by editing the generated lines, and
   **resolve each `TODO(verify)`**:
   - From the repo first: `TESTING.md`, `docs/`, `playwright.config.*`, CI workflows,
     `turbo.json`, the auth setup.
   - Ask the user only for what the repo cannot tell you (auth rate limits, which legacy
     patterns are debt).
   - A field that does not apply: replace it with `n/a`, do not leave the TODO.

5. **Fill the manual section**: legacy patterns not to copy (e.g. "N specs stub the
   data layer; legacy, not precedent"), architecture guard specs, reference-data tables
   for the integration harness. Cite a file for every claim.

6. **Act on warnings.** Lines marked ⚠️ are real risks the detector found (Node major
   differs between local and CI; DB-backed specs with no harness while `DATABASE_URL`
   points at a developer database). Report them to the user; do not silently fix them.

7. Report what was written, what was corrected by hand, and any TODO left, with the
   reason.

## Rules

- Never invent a value. Unknown stays `TODO(verify)` with a note on what would settle it.
- Re-run step 1 after a stack change (new workspace, ORM upgrade, new test layer).
  Detected lines you corrected by hand are regenerated, so move a lasting correction
  into the manual section.
- The detector is read-only without `--write`; it never runs tests or installs anything.
