import {
  htmlFetch,
  parseSearchHtml,
  searchUrl,
  writeError,
  type JobCard,
  type Lang,
} from "../helpers.js"

export interface SearchOpts {
  query?: string
  location?: string
  jobage?: number
  page: number
  limit?: number
  format: "json" | "table" | "plain"
  lang: Lang
}

export function buildSearchUrl(opts: SearchOpts): string {
  return searchUrl({
    query: opts.query,
    location: opts.location,
    jobage: opts.jobage,
    page: opts.page,
    lang: opts.lang,
  })
}

function renderTable(cards: JobCard[]): string {
  if (cards.length === 0) return "No results."
  const rows = cards.map((c) => {
    const title = (c.title || "").slice(0, 40).padEnd(40)
    const company = (c.company || "—").slice(0, 22).padEnd(22)
    const loc = (c.location || "—").slice(0, 16).padEnd(16)
    const date = (c.date || "—").slice(0, 10)
    return `${c.id.slice(0, 8)}… ${title} ${company} ${loc} ${date}`
  })
  const header =
    "ID".padEnd(10) +
    " " +
    "TITLE".padEnd(40) +
    " " +
    "COMPANY".padEnd(22) +
    " " +
    "LOCATION".padEnd(16) +
    " DATE"
  return [header, "-".repeat(header.length), ...rows].join("\n")
}

export async function runSearch(opts: SearchOpts): Promise<number> {
  try {
    const url = buildSearchUrl(opts)
    // Guardrail: never hit robots-disallowed feat= or /api/ paths.
    if (url.includes("feat=") || url.includes("/api/")) {
      writeError("Refusing to request a robots.txt-disallowed URL", "BLOCKED_URL")
      return 1
    }
    const html = await htmlFetch(url)
    const { cards: all, meta } = parseSearchHtml(html, opts.page, opts.lang)
    let cards = all
    if (opts.limit !== undefined && opts.limit >= 0) cards = cards.slice(0, opts.limit)

    if (opts.format === "table") {
      process.stdout.write(renderTable(cards) + "\n")
    } else if (opts.format === "plain") {
      process.stdout.write(
        cards
          .map(
            (c) =>
              `${c.title}\n  ${c.company || "—"} · ${c.location || "—"} · ${c.date || "—"}\n  id: ${c.id}\n  ${c.url}`,
          )
          .join("\n\n") + "\n",
      )
    } else {
      process.stdout.write(
        JSON.stringify(
          {
            meta: {
              count: cards.length,
              page: opts.page,
              totalHits: meta.totalHits,
              numPages: meta.numPages,
            },
            results: cards,
          },
          null,
          2,
        ) + "\n",
      )
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "SEARCH_FAILED")
    return 1
  }
}
