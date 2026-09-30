## 1.0.0-beta.1 (2026-09-30)

### Features

* add data-layer and testing skills ([479bdcc](https://github.com/ayhid/fullstack-standards/commit/479bdcc0b35983b48fa43e75cf66f564ef187217))
* **data-layer:** make the data layer vendor-neutral with TanStack Query, SWR and RTK Query adapters ([85d3ce3](https://github.com/ayhid/fullstack-standards/commit/85d3ce3cf5ae70675aae1ad281fc5158e7fd5534))
* **fullstack-testing:** mock third-party services at their port, never test the tool ([412e223](https://github.com/ayhid/fullstack-standards/commit/412e223a0226226f2d6bce35d3ecac81a651d962))
* **fullstack-testing:** test hooks through components and services against the entry point ([ab91d4a](https://github.com/ayhid/fullstack-standards/commit/ab91d4aaec7c1abb20515ae43858fca66a23cb45))
* package as a Claude Code plugin with architecture-enforcing hooks ([a117e11](https://github.com/ayhid/fullstack-standards/commit/a117e11d11ceb2af1b9165a86284d375e6ca1161))
* **project-profile:** detect the API entry point, frontend services, layering debt and Strapi ([10242db](https://github.com/ayhid/fullstack-standards/commit/10242db2a32bdb1b4cc51eaed2da5817072f79dc))
* **project-profile:** generate the per-repo profile block ([a662b3a](https://github.com/ayhid/fullstack-standards/commit/a662b3a196966c74ba9f29fb3643e09f15e5511b))
* **project-profile:** report third-party SDKs and imports outside their adapter ([101a7d8](https://github.com/ayhid/fullstack-standards/commit/101a7d8c5c8aaaa95aef160bcbbdc0a0632deacb))
* **project-profile:** write the hooks' layout config; count co-located hook tests ([ee1790d](https://github.com/ayhid/fullstack-standards/commit/ee1790da67d017b1b6486a993f46bf8778269d5c))
* **tanstack-query-data-layer:** route hooks through frontend services and one API entry point ([dd61805](https://github.com/ayhid/fullstack-standards/commit/dd61805b6f55ebc532d14d65e6dc1d211659756b))

### Bug Fixes

* **fullstack-testing:** make templates resolve and the namespace test able to fail ([3b049e6](https://github.com/ayhid/fullstack-standards/commit/3b049e6fd832870f26d853d18138f5ac38c9e80a))
* **fullstack-testing:** point the query-key guard message at @lib/api/query-keys ([ad926ae](https://github.com/ayhid/fullstack-standards/commit/ad926ae98618b1423d693b74cead726055072389))
* **project-profile:** detect per-hook key factories and hook folders ([ae70b81](https://github.com/ayhid/fullstack-standards/commit/ae70b81cc28a749a24ffea5b8b2fdc2a2b800ff3))
* **project-profile:** test paths relative to root, prefer test:e2e, literal block replace ([36830d5](https://github.com/ayhid/fullstack-standards/commit/36830d54e04f19521b5795e55397f27f0599e8ed))
* **tanstack-query-data-layer:** align templates with invalidation, counter and retry rules ([f445d10](https://github.com/ayhid/fullstack-standards/commit/f445d10d97ce3a4fb0d0690bd9a04cf2b53030a0))
* **tanstack-query-data-layer:** lock the task row before moving project counters ([d1b43e8](https://github.com/ayhid/fullstack-standards/commit/d1b43e876525eb85df1156e22e1527f5180e9bf0))
