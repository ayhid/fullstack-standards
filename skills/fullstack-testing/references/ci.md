# CI

| Job              | Runs                                                                 |
| ---------------- | -------------------------------------------------------------------- |
| lint             | ESLint across workspaces                                             |
| typecheck        | `tsc --noEmit` across workspaces                                     |
| test             | API unit + HTTP specs + coverage, then frontend + coverage           |
| build            | Production build of every app                                        |
| api-db           | Postgres service container → API integration suite                   |
| e2e (scheduled)  | Playwright `@smoke` against a deployed environment                   |

- **Run the architecture checks in CI too.** The plugin's hooks only run while an agent
  works. With `.claude/fullstack-standards.json` in the repo, a `lint` step can run the
  same checker on every push, pinned to a release:
  `npx --yes github:ayhid/fullstack-standards#<tag> --all .` (it loads `typescript@5`
  from the project). Existing debt stays tolerated through the config's baseline.
- Give later steps in a job `if: ${{ !cancelled() }}` so one red step does not hide the
  next; read every failure in a red job, not just the first.
- The `api-db` job exports `DATABASE_URL` for the service container; the harness picks it
  up under `CI` instead of starting Testcontainers.
- **Pin the same Node major in CI and `.tool-versions`/`.nvmrc`.** "Green locally, red in
  CI" is a runtime-version difference before it is anything else.
- If the root `test` script goes through a build cache, it must not include Playwright,
  or a bare checkout cannot run it; expose `test:api` / `test:frontend` separately.
- Force cache misses (`--force`) when the thing that changed is not a repo file.
