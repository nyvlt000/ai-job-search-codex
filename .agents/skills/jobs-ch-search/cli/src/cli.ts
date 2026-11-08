#!/usr/bin/env bun
// Self-contained CLI for searching Swiss jobs on jobs.ch (Basel-first).
// Zero runtime dependencies — plain bun + fetch + HTML/JSON-LD parsing.
//
// Personal use only. JobCloud's terms of use prohibit crawlers, scrapers,
// data-mining tools and bots. This CLI reads public HTML pages only (never
// /api/), keeps volume low, and is for personal job-search use on your own
// responsibility. See https://www.jobcloud.ch/c/en/terms/

import { runSearch, type SearchOpts } from "./commands/search.js"
import { runDetail, type DetailOpts } from "./commands/detail.js"
import type { Lang } from "./helpers.js"

interface Flags {
  _: string[]
  [k: string]: string | boolean | string[]
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { _: [] }
  const alias: Record<string, string> = { q: "query", l: "location", n: "limit" }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith("--") || a.startsWith("-")) {
      const key = alias[a.replace(/^-+/, "")] ?? a.replace(/^-+/, "")
      const next = argv[i + 1]
      if (next === undefined || next.startsWith("-")) {
        flags[key] = true
      } else {
        flags[key] = next
        i++
      }
    } else {
      ;(flags._ as string[]).push(a)
    }
  }
  return flags
}

const HELP = `jobs-ch-cli — search Swiss jobs on jobs.ch (Basel-first)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <id|url> [--format json|plain] [--lang en|de|fr]

SEARCH FLAGS
  --query, -q <text>      Keywords (job title, skill, or role).
  --location, -l <text>   Swiss place, e.g. "Basel", "Basel-Landschaft", "Zurich".
                          Omit to search all of Switzerland. Note: "Freiburg" means
                          Fribourg (CH), not Freiburg im Breisgau (DE).
  --jobage <days>         Posted within N days (maps to publication-date). Positive
                          integer. Verified values include 1, 3, 7, 14, 30, 60.
  --page <n>              1-indexed page (20 results/page). Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --lang <code>           en (default) | de | fr.
  --format <fmt>          json (default) | table | plain.

At least one of --query or --location is required.

EXAMPLES
  bun run src/cli.ts search -q "project manager" -l Basel --jobage 14 --format table
  bun run src/cli.ts search -q "IT Project Manager" -l Basel --lang de --format table
  bun run src/cli.ts search -q "digital transformation" -l Basel --jobage 30
  bun run src/cli.ts detail 4be37140-3c52-4075-aaac-4af33fb127e7 --format plain

Personal use only — JobCloud terms prohibit scrapers; keep volume low.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set([
    "query", "location", "jobage", "page", "limit", "lang", "format", "help", "h",
  ]),
  detail: new Set(["format", "lang", "help", "h"]),
}

function parseLang(raw: string | boolean | string[] | undefined): Lang | null {
  if (raw === undefined) return "en"
  if (typeof raw !== "string") return null
  const v = raw.toLowerCase()
  if (v === "en" || v === "de" || v === "fr") return v
  return null
}

function parseIntFlag(
  name: string,
  raw: string | boolean | string[],
): number | null {
  const val = parseInt(raw as string, 10)
  if (isNaN(val)) {
    process.stderr.write(
      JSON.stringify({
        error: `--${name} must be a number, got "${raw}"`,
        code: "BAD_ARG",
      }) + "\n",
    )
    return null
  }
  return val
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2)
  const flags = parseFlags(argv)
  const cmd = (flags._ as string[])[0]

  if (!cmd || flags.help || flags.h) {
    process.stdout.write(HELP)
    return cmd ? 0 : 1
  }

  const knownFlags = KNOWN_FLAGS[cmd]
  if (knownFlags) {
    for (const key of Object.keys(flags)) {
      if (key === "_" || knownFlags.has(key)) continue
      process.stderr.write(
        JSON.stringify({
          error: `unknown flag --${key} for '${cmd}' - flags are never silently ignored, because a discarded filter changes what the search returns; see --help for the supported flags`,
          code: "UNKNOWN_FLAG",
        }) + "\n",
      )
      return 1
    }
  }

  if (cmd === "search") {
    const query = typeof flags.query === "string" ? flags.query : undefined
    const location = typeof flags.location === "string" ? flags.location : undefined
    if (!query && !location) {
      process.stderr.write(
        JSON.stringify({
          error:
            'at least one of --query/-q or --location/-l is required (e.g. -q "project manager" -l Basel)',
          code: "NO_QUERY_OR_LOCATION",
        }) + "\n",
      )
      return 1
    }

    const lang = parseLang(flags.lang)
    if (lang === null) {
      process.stderr.write(
        JSON.stringify({
          error: `--lang must be en, de, or fr, got "${flags.lang}"`,
          code: "BAD_ARG",
        }) + "\n",
      )
      return 1
    }

    let jobage: number | undefined
    if (flags.jobage !== undefined) {
      const v = parseIntFlag("jobage", flags.jobage)
      if (v === null) return 1
      if (v <= 0) {
        process.stderr.write(
          JSON.stringify({
            error: `--jobage must be a positive number of days, got "${flags.jobage}"`,
            code: "BAD_ARG",
          }) + "\n",
        )
        return 1
      }
      jobage = v
    }

    if (flags.page !== undefined) {
      const v = parseIntFlag("page", flags.page)
      if (v === null) return 1
      flags.page = String(v)
    }
    if (flags.limit !== undefined) {
      const v = parseIntFlag("limit", flags.limit)
      if (v === null) return 1
      flags.limit = String(v)
    }

    const fmt = (flags.format as string) || "json"
    const opts: SearchOpts = {
      query,
      location,
      jobage,
      page: flags.page ? Math.max(1, parseInt(flags.page as string, 10)) : 1,
      limit: flags.limit ? parseInt(flags.limit as string, 10) : undefined,
      format: (["json", "table", "plain"].includes(fmt) ? fmt : "json") as SearchOpts["format"],
      lang,
    }
    return runSearch(opts)
  }

  if (cmd === "detail") {
    const id = (flags._ as string[])[1]
    if (!id) {
      process.stderr.write(
        JSON.stringify({ error: "detail requires an <id|url>", code: "NO_ID" }) + "\n",
      )
      return 1
    }
    const lang = parseLang(flags.lang)
    if (lang === null) {
      process.stderr.write(
        JSON.stringify({
          error: `--lang must be en, de, or fr, got "${flags.lang}"`,
          code: "BAD_ARG",
        }) + "\n",
      )
      return 1
    }
    const fmt = (flags.format as string) || "json"
    const opts: DetailOpts = {
      id,
      format: (fmt === "plain" ? "plain" : "json") as DetailOpts["format"],
      lang,
    }
    return runDetail(opts)
  }

  process.stderr.write(
    JSON.stringify({ error: `Unknown command "${cmd}"`, code: "BAD_CMD" }) + "\n",
  )
  return 1
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(
      JSON.stringify({
        error: e instanceof Error ? e.message : String(e),
        code: "INTERNAL_ERROR",
      }) + "\n",
    )
    process.exit(1)
  })
