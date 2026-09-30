# fullstack-standards

Reusable engineering guidelines, packaged as agent skills, for projects with this
architecture:

- **API:** any REST backend for the frontend rules — **NestJS or Strapi**; the frontend
  does not depend on which. The backend rules and the integration harness cover
  NestJS + PostgreSQL, Jest, with **any ORM**. TypeORM and Prisma are covered;
  the rules are ORM-neutral, and the ORM-specific parts (service template, test harness
  adapter, migration commands) sit in per-ORM folders. Supporting another ORM means
  adding one adapter folder (see `skills/fullstack-testing/references/api-integration.md`).
- **Frontend:** Vite + React SPA, TanStack Query 5, Vitest + React Testing Library
- **E2E:** Playwright
- A monorepo with a shared-types package (optional)

| Skill                                                          | Use it when                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`tanstack-query-data-layer`](skills/tanstack-query-data-layer) | Adding or changing server state: the component → hook → frontend service → `apiClient.request` layering, query keys, mutations, backend services |
| [`fullstack-testing`](skills/fullstack-testing)                 | Writing or changing any test, on any layer (hooks only through components, services against the entry point) |
| [`project-profile`](skills/project-profile)                     | Creating or refreshing a repo's profile block in `AGENTS.md`             |

## Install

```bash
# local, for every project on this machine (edits in this repo are live)
./install.sh               # symlinks into ~/.claude/skills and ~/.agents/skills
./install.sh --uninstall   # removes those links

# from a git remote, on another machine
npx skills add <git-url-of-this-repo>
```

## Wire it into a project

The skills hold the **generic** rules. Everything specific to one project (paths,
commands, ORM, known debt) lives in that project's `AGENTS.md`, in a profile block
both skills read first and defer to. Generate it:

```bash
node skills/project-profile/scripts/detect-profile.mjs <repo>           # preview
node skills/project-profile/scripts/detect-profile.mjs <repo> --write   # write it
```

or ask an agent to "create the project profile", which also verifies each detected
line and resolves the `TODO(verify)` fields. See
[`PROJECT-PROFILE.template.md`](PROJECT-PROFILE.template.md).

## Updating

A rule belongs here only if it held in at least one real project and is not about that
project's domain. When a project teaches you something new, generalise it (no entity
names, ticket ids, dates or people) before adding it.
