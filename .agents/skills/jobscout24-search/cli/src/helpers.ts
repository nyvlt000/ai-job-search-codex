// Data source: JobScout24.ch public HTML pages (search + detail). No authentication.
// Search: /{lang}/jobs/{query}/?Actuality=&p=&o=1 — never use broken ?q=&l= alone.
// Detail: /{lang}/job/{uuid}/ with schema.org JobPosting JSON-LD.
// robots.txt allows /de/jobs/ and /de/job/; disallows /JS24Web/, account, apply, exportfeed.
// Personal use only: JobCloud terms prohibit crawlers/scrapers; keep volume low.
// Locales: de and en only (French listings intentionally unsupported).

export const HOST = "https://www.jobscout24.ch"

export type Lang = "en" | "de"

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; jobscout24-search-cli/1.0)"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,de;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    })
    if (response.status === 429 || response.status >= 500) {
      if (attempt === maxRetries) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`)
      }
      const jitter = Math.floor(Math.random() * 500)
      await new Promise((r) => setTimeout(r, delay + jitter))
      delay = Math.min(delay * 2, 8000)
      continue
    }
    if (response.status === 404) return ""
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status} ${response.statusText}`)
    }
    return response.text()
  }
  throw new Error("Request failed after max retries")
}

export interface JobCard {
  id: string
  title: string
  company: string | null
  location: string | null
  date: string | null
  url: string
  workload: string | null
  isNew: boolean | null
  numericId: string | null
}

export interface JobDetail extends JobCard {
  description: string | null
  employmentType: string | null
  workHours: string | null
  industry: string | null
  skills: string | null
  salary: string | null
  companyUrl: string | null
}

export interface SearchMeta {
  count: number
  page: number
  totalHits: number | null
  numPages: number | null
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

/** Decode common HTML entities and numeric refs. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => numericEntity(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => numericEntity(parseInt(d, 10)))
}

/** Strip tags to plain text, preserving paragraph breaks roughly. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  )
}

/**
 * Build search URL.
 * Path form `/{lang}/jobs/{query}/` is the working pattern.
 * When location is set, it is appended to the keyword (server-side `?l=` is unreliable).
 * `--jobage` maps to `Actuality` (verified: 1, 3, 7, 14, 30, 60; -1 = all).
 */
export function searchUrl(opts: {
  query?: string
  location?: string
  jobage?: number
  page?: number
  lang?: Lang
}): string {
  const lang = opts.lang ?? "de"
  const parts = [opts.query?.trim(), opts.location?.trim()].filter(
    (p): p is string => Boolean(p && p.length > 0),
  )
  const keyword = parts.join(" ")
  const pathKeyword = encodeURIComponent(keyword).replace(/%20/g, "%20")
  const base = `${HOST}/${lang}/jobs/${pathKeyword}/`
  const params = new URLSearchParams()
  if (opts.jobage !== undefined && opts.jobage >= 0) {
    params.set("Actuality", String(opts.jobage))
  }
  if (opts.page !== undefined && opts.page > 1) {
    params.set("p", String(opts.page))
  }
  // Prefer recency when age filter is set.
  if (opts.jobage !== undefined && opts.jobage >= 0) {
    params.set("o", "1")
  }
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

export function detailUrl(id: string, lang: Lang = "de"): string {
  const clean = id.replace(/^\/+|\/+$/g, "")
  return `${HOST}/${lang}/job/${clean}/`
}

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** Accept a UUID, a /job/{uuid}/ URL, or reject numeric-only ids. */
export function normalizeId(raw: string): string | null {
  const s = raw.trim()
  const fromUrl = s.match(/\/job\/([0-9a-f-]{36})\//i)
  if (fromUrl) return fromUrl[1].toLowerCase()
  if (UUID_RE.test(s) && s.length === 36) return s.toLowerCase()
  return null
}

/** Parse relative JobScout24 dates like "3 T", "1 W", "2 M", "Neu" into YYYY-MM-DD. */
export function parseRelativeDate(
  raw: string | null,
  now: Date = new Date(),
): string | null {
  if (!raw) return null
  const t = raw.trim()
  if (!t) return null
  const lower = t.toLowerCase()
  if (lower === "neu" || lower === "new") {
    return now.toISOString().slice(0, 10)
  }
  const m = t.match(/^(\d+)\s*([TWMHtmw])\b/)
  if (!m) return t // leave unknown formats as-is
  const n = parseInt(m[1], 10)
  const unit = m[2].toUpperCase()
  const d = new Date(now)
  if (unit === "T" || unit === "D") d.setDate(d.getDate() - n)
  else if (unit === "W") d.setDate(d.getDate() - n * 7)
  else if (unit === "M") d.setMonth(d.getMonth() - n)
  else if (unit === "H") d.setHours(d.getHours() - n)
  else return t
  return d.toISOString().slice(0, 10)
}

function firstMatch(html: string, re: RegExp): string | null {
  const m = html.match(re)
  return m ? decodeEntities(m[1].trim()) : null
}

/**
 * Extract each outer `li.job-list-item` with balanced depth so nested
 * tag-list `<li>` elements do not truncate the card.
 */
function extractJobListItems(html: string): string[] {
  const chunks: string[] = []
  const startRe = /<li\s+class="job-list-item\b/gi
  let start: RegExpExecArray | null
  while ((start = startRe.exec(html)) !== null) {
    const from = start.index
    const slice = html.slice(from)
    const tagRe = /<\/?li\b[^>]*>/gi
    let depth = 0
    let end = -1
    let tm: RegExpExecArray | null
    while ((tm = tagRe.exec(slice)) !== null) {
      if (/^<\//.test(tm[0])) {
        depth--
        if (depth === 0) {
          end = from + tm.index + tm[0].length
          break
        }
      } else {
        depth++
      }
    }
    if (end > from) {
      chunks.push(html.slice(from, end))
      startRe.lastIndex = end
    }
  }
  return chunks
}

/** Split search HTML into independent job-list-item chunks. */
export function parseJobCards(html: string, lang: Lang = "de"): JobCard[] {
  const cards: JobCard[] = []
  for (const chunk of extractJobListItems(html)) {
    try {
      const detailPath = firstMatch(chunk, /data-job-detail-url="([^"]+)"/i)
      const uuid =
        detailPath?.match(UUID_RE)?.[0]?.toLowerCase() ??
        firstMatch(chunk, /\/job\/([0-9a-f-]{36})\//i)?.toLowerCase()
      if (!uuid) continue
      const title =
        firstMatch(chunk, /class="[^"]*job-title[^"]*"[^>]*title="([^"]*)"/i) ||
        firstMatch(chunk, /class="[^"]*job-title[^"]*"[^>]*>([^<]+)</i)
      if (!title) continue
      const attrBlock = chunk.match(/class="job-attributes"[\s\S]*?<\/p>/i)?.[0]
      let company: string | null = null
      let location: string | null = null
      if (attrBlock) {
        const innerSpans = [...attrBlock.matchAll(/<span>([^<]*)<\/span>/gi)].map(
          (x) => decodeEntities(x[1].trim()),
        )
        company = innerSpans[0] || null
        location = innerSpans[1] || null
      }
      const dateRaw = firstMatch(chunk, /class="job-date"\s*>\s*([^<]+?)\s*</i)
      const workload = firstMatch(
        chunk,
        /class="tag tag-readonly(?![^"]*orange)[^"]*">\s*(\d+\s*%(?:\s*-\s*\d+\s*%)?)\s*</i,
      )
      const numericId = firstMatch(chunk, /data-job-id="(\d+)"/i)
      cards.push({
        id: uuid,
        title,
        company,
        location,
        date: parseRelativeDate(dateRaw),
        url: `${HOST}/${lang}/job/${uuid}/`,
        workload,
        isNew: dateRaw ? /^(neu|new)$/i.test(dateRaw.trim()) : null,
        numericId,
      })
    } catch {
      // One malformed card must not break the rest.
    }
  }
  return cards
}

export function parseSearchHtml(
  html: string,
  page: number,
  lang: Lang = "de",
): { cards: JobCard[]; meta: SearchMeta } {
  const cards = parseJobCards(html, lang)
  const totalHitsRaw = firstMatch(html, /data-total-job-count="(\d+)"/i)
  const totalHits = totalHitsRaw ? parseInt(totalHitsRaw, 10) : null
  // Empirically ~25 organic + occasional top listings per page.
  const perPage = 25
  const numPages =
    totalHits !== null ? Math.max(1, Math.ceil(totalHits / perPage)) : null
  return {
    cards,
    meta: {
      count: cards.length,
      page,
      totalHits,
      numPages,
    },
  }
}

function extractJobPosting(html: string): Record<string, unknown> | null {
  const scripts = [
    ...html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ]
  for (const s of scripts) {
    const raw = s[1].trim()
    try {
      const parsed = JSON.parse(raw) as unknown
      const list = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of list) {
        if (
          item &&
          typeof item === "object" &&
          (item as { "@type"?: string })["@type"] === "JobPosting"
        ) {
          return item as Record<string, unknown>
        }
      }
    } catch {
      // try next script
    }
  }
  return null
}

export function parseJobDetail(
  html: string,
  id: string,
  lang: Lang = "de",
): JobDetail {
  const posting = extractJobPosting(html)
  const title =
    (typeof posting?.title === "string" ? posting.title : null) ||
    firstMatch(html, /<h1[^>]*>([^<]+)<\/h1>/i) ||
    "Untitled"
  const org = posting?.hiringOrganization as
    | { name?: string; sameAs?: string }
    | undefined
  const loc = posting?.jobLocation as
    | { address?: { addressLocality?: string; addressRegion?: string } }
    | undefined
  const locality = loc?.address?.addressLocality || null
  const region = loc?.address?.addressRegion || null
  const location =
    locality && region ? `${locality}, ${region}` : locality || region
  const datePosted =
    typeof posting?.datePosted === "string"
      ? posting.datePosted.slice(0, 10)
      : null
  let description: string | null = null
  if (typeof posting?.description === "string") {
    description = htmlToText(posting.description)
  } else {
    const block = html.match(
      /class="job-description"[^>]*>([\s\S]*?)(?:<\/div>\s*<div class="|$)/i,
    )
    if (block) description = htmlToText(block[1])
  }
  const employmentType = posting?.employmentType
  const emp =
    typeof employmentType === "string"
      ? employmentType
      : Array.isArray(employmentType)
        ? employmentType.map(String).join(", ")
        : null

  return {
    id,
    title: decodeEntities(title),
    company: org?.name ? decodeEntities(org.name) : null,
    location: location ? decodeEntities(location) : null,
    date: datePosted,
    url: detailUrl(id, lang),
    workload: null,
    isNew: null,
    numericId: null,
    description,
    employmentType: emp,
    workHours: null,
    industry: typeof posting?.industry === "string" ? posting.industry : null,
    skills: null,
    salary: null,
    companyUrl: org?.sameAs || null,
  }
}
