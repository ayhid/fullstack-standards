# Project profile

Generate it instead of copying this file:

```bash
node skills/project-profile/scripts/detect-profile.mjs <repo>           # preview
node skills/project-profile/scripts/detect-profile.mjs <repo> --write   # into <repo>/AGENTS.md
```

or ask an agent to "create the project profile" (the `project-profile` skill runs the
detector, verifies each line, and resolves the `TODO(verify)` fields).

The generated block lives between `<!-- project-profile:start -->` and
`<!-- project-profile:end -->` in `AGENTS.md`. Re-running replaces it and keeps the
manual section (`project-profile:manual:start/end`), where exceptions, known debt and
reference-data tables go.

It covers: package manager and workspaces; per API the ORM (version, client import,
driver adapter, DB provider and its extensions), migration commands, test commands and
integration harness; per frontend the TanStack Query version, QueryClient, key factory,
HTTP client, feature hooks and test setup; Playwright config, specs and command; the
Postgres image, Node local vs CI, CI workflows, and build-cache behaviour for `test`.
