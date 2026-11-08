#!/usr/bin/env bun
// Self-contained CLI for searching Swiss jobs on JobScout24.ch (Basel-first).
// Zero runtime dependencies — plain bun + fetch + HTML/JSON-LD parsing.
//
// Personal use only. JobCloud's terms of use prohibit crawlers, scrapers,
// data-mining tools and bots. This CLI reads public HTML pages only, keeps
// volume low, and is for personal job-search use on your own responsibility.
// French locale/listings are intentionally unsupported. See
// https://www.jobcloud.ch/c/en/terms/

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

const HELP = `jobscout24-cli — search Swiss jobs on JobScout24.ch (Basel-first, DE/EN)

USAGE
  bun run src/cli.ts search [flags]
  bun run src/cli.ts detail <uuid|url> [--format json|plain] [--lang en|de]

SEARCH FLAGS
  --query, -q <text>      Keywords (job title, skill, or role).
  --location, -l <text>   Swiss place, e.g. "Basel". Appended to the keyword
                          path (server-side ?l= is unreliable on this portal).
  --jobage <days>         Posted within N days (maps to Actuality). Verified:
                          1, 3, 7, 14, 30, 60.
  --page <n>              1-indexed page (~25 results/page). Default 1.
  --limit, -n <n>         Cap results emitted (client-side).
  --lang <code>           de (default) | en. French (fr) is not supported.
  --format <fmt>          json (default) | table | plain.

At least one of --query or --location is required.

EXAMPLES
  bun run src/cli.ts search -q "project manager" -l Basel --jobage 14 --format table
  bun run src/cli.ts search -q "IT Projektmanager" -l Basel --lang de --jobage 7
  bun run src/cli.ts search -q "digital transformation" -l Basel --jobage 30
  bun run src/cli.ts detail 9501c563-7161-4d8f-aac9-8dcbb4c4cb69 --format plain

Personal use only — JobCloud terms prohibit scrapers; keep volume low.
French listings are excluded by design.
`

const KNOWN_FLAGS: Record<string, Set<string>> = {
  search: new Set([
    "query", "location", "jobage", "page", "limit", "lang", "format", "help", "h",
  ]),
  detail: new Set(["format", "lang", "help", "h"]),
}

function parseLang(raw: string | boolean | string[] | undefined): Lang | null {
  if (raw === undefined) return "de"
  if (typeof raw !== "string") return null
  const v = raw.toLowerCase()
  if (v === "en" || v === "de") return v
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
  if (argv.length === 0 || argv[0] === "help" || argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(HELP)
    return 0
  }
  const cmd = argv[0]
  const flags = parseFlags(argv.slice(1))

  if (flags.help === true || flags.h === true) {
    process.stdout.write(HELP)
    return 0
  }

  if (cmd !== "search" && cmd !== "detail") {
    process.stderr.write(
      JSON.stringify({ error: `Unknown command "${cmd}"`, code: "UNKNOWN_CMD" }) + "\n",
    )
    return 1
  }

  const known = KNOWN_FLAGS[cmd]
  for (const k of Object.keys(flags)) {
    if (k === "_") continue
    if (!known.has(k)) {
      process.stderr.write(
        JSON.stringify({ error: `Unknown flag --${k}`, code: "UNKNOWN_FLAG" }) + "\n",
      )
      return 1
    }
  }

  const lang = parseLang(flags.lang)
  if (lang === null) {
    process.stderr.write(
      JSON.stringify({
        error: '--lang must be "en" or "de" (French listings are not supported)',
        code: "BAD_ARG",
      }) + "\n",
    )
    return 1
  }

  const formatRaw = (flags.format as string) || "json"
  if (cmd === "search") {
    if (!["json", "table", "plain"].includes(formatRaw)) {
      process.stderr.write(
        JSON.stringify({ error: `Invalid --format "${formatRaw}"`, code: "BAD_ARG" }) + "\n",
      )
      return 1
    }
    const query = typeof flags.query === "string" ? flags.query : undefined
    const location = typeof flags.location === "string" ? flags.location : undefined
    if (!query && !location) {
      process.stderr.write(
        JSON.stringify({
          error: "Provide --query and/or --location",
          code: "NO_QUERY_OR_LOCATION",
        }) + "\n",
      )
      return 1
    }
    let page = 1
    if (flags.page !== undefined) {
      const p = parseIntFlag("page", flags.page)
      if (p === null) return 1
      page = p
    }
    let limit: number | undefined
    if (flags.limit !== undefined) {
      const n = parseIntFlag("limit", flags.limit)
      if (n === null) return 1
      limit = n
    }
    let jobage: number | undefined
    if (flags.jobage !== undefined) {
      const a = parseIntFlag("jobage", flags.jobage)
      if (a === null) return 1
      jobage = a
    }
    const opts: SearchOpts = {
      query,
      location,
      jobage,
      page,
      limit,
      format: formatRaw as "json" | "table" | "plain",
      lang,
    }
    return runSearch(opts)
  }

  // detail
  if (!["json", "plain"].includes(formatRaw)) {
    process.stderr.write(
      JSON.stringify({ error: `Invalid --format "${formatRaw}"`, code: "BAD_ARG" }) + "\n",
    )
    return 1
  }
  const id = (flags._ as string[])[0]
  if (!id) {
    process.stderr.write(
      JSON.stringify({ error: "detail requires a UUID or job URL", code: "BAD_ARG" }) + "\n",
    )
    return 1
  }
  const opts: DetailOpts = {
    id,
    format: formatRaw as "json" | "plain",
    lang,
  }
  return runDetail(opts)
}

const code = await main()
process.exit(code)
