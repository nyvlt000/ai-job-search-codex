# jobscout24-cli

Zero-dependency Bun CLI for **JobScout24.ch** (Switzerland, Basel-first).

## Personal use only

JobCloud terms prohibit crawlers and scrapers. Use this only for personal job search, keep volume low, and do not use it commercially or for bulk collection.

## Locales

`de` (default) and `en` only. French (`fr`) listings are intentionally unsupported.

## Commands

```bash
bun run src/cli.ts search -q "project manager" -l Basel --jobage 14 --format table
bun run src/cli.ts detail <uuid> --format plain
bun run typecheck
bun test
```

`--location` is appended to the keyword path because JobScout24's `?l=` filter is unreliable. `--jobage` maps to `Actuality`.
