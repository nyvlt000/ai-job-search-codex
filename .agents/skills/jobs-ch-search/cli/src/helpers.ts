// Data source: jobs.ch public HTML pages (search + detail). No authentication.
// Search embeds an __INIT__ state blob; detail embeds schema.org JobPosting JSON-LD.
// robots.txt disallows /api/ and /api_proxy/ — never hit those endpoints.
// Personal use only: JobCloud terms prohibit crawlers/scrapers; keep volume low.

export const HOST = "https://www.jobs.ch"

export type Lang = "en" | "de" | "fr"

const SEARCH_PATH: Record<Lang, string> = {
  en: "/en/vacancies/",
  de: "/de/stellenangebote/",
  fr: "/fr/offres-emplois/",
}

const DETAIL_PATH: Record<Lang, string> = {
  en: "/en/vacancies/detail/",
  de: "/de/stellenangebote/detail/",
  fr: "/fr/offres-emplois/detail/",
}

export function writeError(error: string, code: string): void {
  process.stderr.write(JSON.stringify({ error, code }) + "\n")
}

const UA = "Mozilla/5.0 (compatible; jobs-ch-search-cli/1.0)"

/** Fetch HTML with exponential backoff on 429/5xx. Returns "" on a 404. */
export async function htmlFetch(url: string): Promise<string> {
  const maxRetries = 6
  let delay = 500
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,de;q=0.8,fr;q=0.7",
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
  easyApply: boolean | null
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

/** Slice a `{...}` object assigned to `name` in a script body, string/escape-aware. */
export function sliceAssignedObject(src: string, name: string): string | null {
  const marker = name + " ="
  const i = src.indexOf(marker)
  if (i < 0) return null
  let p = src.indexOf("{", i)
  if (p < 0) return null
  let depth = 0
  let inStr = false
  let esc = false
  for (let q = p; q < src.length; q++) {
    const c = src[q]
    if (inStr) {
      if (esc) esc = false
      else if (c === "\\") esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === "{") depth++
    else if (c === "}") {
      depth--
      if (depth === 0) return src.slice(p, q + 1)
    }
  }
  return null
}

function numericEntity(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ""
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => numericEntity(parseInt(dec, 10)))
    .replace(/&#[xX]([0-9a-fA-F]+);/g, (_, hex) => numericEntity(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

export function htmlToText(html: string): string {
  const withBreaks = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div|h\d)>/gi, "\n")
  return decodeHtmlEntities(stripTags(withBreaks)).replace(/\n{3,}/g, "\n\n").trim()
}

export function detailUrl(id: string, lang: Lang = "en"): string {
  return `${HOST}${DETAIL_PATH[lang]}${id}/`
}

export function searchUrl(opts: {
  query?: string
  location?: string
  jobage?: number
  page: number
  lang: Lang
}): string {
  const params = new URLSearchParams()
  if (opts.query) params.set("term", opts.query)
  if (opts.location) params.set("location", opts.location)
  if (opts.jobage !== undefined && opts.jobage > 0) {
    params.set("publication-date", String(opts.jobage))
  }
  if (opts.page > 1) params.set("page", String(opts.page))
  const qs = params.toString()
  return `${HOST}${SEARCH_PATH[opts.lang]}${qs ? `?${qs}` : ""}`
}

const UUID_RE =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

/** Accept a raw UUID or a jobs.ch detail URL in any locale. */
export function normalizeId(input: string): string | null {
  const fromPath = input.match(
    /\/(?:vacancies|stellenangebote|offres-emplois)\/detail\/([0-9a-f-]{36})(?:\/|$|\?)/i,
  )
  if (fromPath) return fromPath[1].toLowerCase()
  const bare = input.match(new RegExp(`^${UUID_RE.source}$`, "i"))
  if (bare) return input.toLowerCase()
  const any = input.match(UUID_RE)
  return any ? any[0].toLowerCase() : null
}

function workloadFromGrades(grades: unknown): string | null {
  if (!Array.isArray(grades) || grades.length === 0) return null
  const nums = grades.filter((g): g is number => typeof g === "number")
  if (nums.length === 0) return null
  if (nums.length === 1) return `${nums[0]}%`
  const lo = Math.min(...nums)
  const hi = Math.max(...nums)
  return lo === hi ? `${lo}%` : `${lo}-${hi}%`
}

function mapResult(raw: Record<string, unknown>, lang: Lang): JobCard | null {
  const id = typeof raw.id === "string" ? raw.id : null
  const title = typeof raw.title === "string" ? raw.title : null
  if (!id || !title) return null

  const companyObj = raw.company as { name?: string } | null | undefined
  const company =
    companyObj && typeof companyObj.name === "string" ? companyObj.name : null
  const location = typeof raw.place === "string" ? raw.place : null
  const date =
    typeof raw.publicationDate === "string"
      ? raw.publicationDate
      : typeof raw.initialPublicationDate === "string"
        ? raw.initialPublicationDate
        : null

  const tags = Array.isArray(raw.listingTags) ? raw.listingTags : []
  const easyApply = tags.some(
    (t) =>
      t &&
      typeof t === "object" &&
      typeof (t as { name?: string }).name === "string" &&
      ["easyApply", "quickApply"].includes((t as { name: string }).name),
  )

  return {
    id,
    title: decodeHtmlEntities(title),
    company: company ? decodeHtmlEntities(company) : null,
    location: location ? decodeHtmlEntities(location) : null,
    date,
    url: detailUrl(id, lang),
    workload: workloadFromGrades(raw.employmentGrades),
    isNew: typeof raw.isNew === "boolean" ? raw.isNew : null,
    easyApply: tags.length > 0 ? easyApply : null,
  }
}

/** Fallback when __INIT__ is missing or broken: recover id/title/url from job-link cards. */
export function parseJobCards(html: string, lang: Lang = "en"): JobCard[] {
  const results: JobCard[] = []
  const re =
    /data-cy="job-link"[^>]*id="vacancy-link-([^"]+)"[^>]*title="([^"]*)"[^>]*href="([^"]+)"/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const id = m[1]
    const title = decodeHtmlEntities(m[2] || "")
    if (!id || !title) continue
    const href = decodeHtmlEntities(m[3] || "")
    results.push({
      id,
      title,
      company: null,
      location: null,
      date: null,
      url: href.startsWith("http") ? href.split("?")[0] : detailUrl(id, lang),
      workload: null,
      isNew: null,
      easyApply: null,
    })
  }
  // Alternate attribute order: href before title
  if (results.length === 0) {
    const re2 =
      /data-cy="job-link"[^>]*href="([^"]+)"[^>]*title="([^"]*)"[^>]*id="vacancy-link-([^"]+)"/gi
    while ((m = re2.exec(html)) !== null) {
      const id = m[3]
      const title = decodeHtmlEntities(m[2] || "")
      if (!id || !title) continue
      results.push({
        id,
        title,
        company: null,
        location: null,
        date: null,
        url: detailUrl(id, lang),
        workload: null,
        isNew: null,
        easyApply: null,
      })
    }
  }
  return results
}

export function parseSearchHtml(
  html: string,
  page: number,
  lang: Lang = "en",
): { cards: JobCard[]; meta: SearchMeta } {
  const raw = sliceAssignedObject(html, "__INIT__")
  if (raw) {
    try {
      const fixed = raw.replace(/:undefined/g, ":null")
      const state = JSON.parse(fixed) as {
        vacancy?: {
          results?: {
            main?: {
              results?: unknown
              meta?: { totalHits?: number; numPages?: number }
            }
          }
        }
      }
      const main = state.vacancy?.results?.main
      const list = Array.isArray(main?.results) ? main!.results! : null
      if (list) {
        const cards: JobCard[] = []
        for (const item of list) {
          if (!item || typeof item !== "object") continue
          const card = mapResult(item as Record<string, unknown>, lang)
          if (card) cards.push(card)
        }
        return {
          cards,
          meta: {
            count: cards.length,
            page,
            totalHits:
              typeof main?.meta?.totalHits === "number" ? main.meta.totalHits : null,
            numPages:
              typeof main?.meta?.numPages === "number" ? main.meta.numPages : null,
          },
        }
      }
    } catch {
      // fall through to card fallback
    }
  }

  const cards = parseJobCards(html, lang)
  return {
    cards,
    meta: { count: cards.length, page, totalHits: null, numPages: null },
  }
}

function salaryText(baseSalary: unknown): string | null {
  if (!baseSalary || typeof baseSalary !== "object") return null
  const s = baseSalary as {
    currency?: string
    value?: { value?: number; minValue?: number; maxValue?: number; unitText?: string }
  }
  const v = s.value
  if (!v) return null
  const currency = s.currency || ""
  if (typeof v.value === "number") {
    return `${currency} ${v.value}${v.unitText ? ` / ${v.unitText}` : ""}`.trim()
  }
  if (typeof v.minValue === "number" || typeof v.maxValue === "number") {
    const lo = v.minValue ?? "?"
    const hi = v.maxValue ?? "?"
    return `${currency} ${lo}-${hi}${v.unitText ? ` / ${v.unitText}` : ""}`.trim()
  }
  return null
}

function locationFromJobPosting(jobLocation: unknown): string | null {
  if (!jobLocation) return null
  const locs = Array.isArray(jobLocation) ? jobLocation : [jobLocation]
  const parts: string[] = []
  for (const loc of locs) {
    if (!loc || typeof loc !== "object") continue
    const addr = (loc as { address?: Record<string, string> }).address
    if (!addr) continue
    const city = addr.addressLocality || ""
    const region = addr.addressRegion || ""
    const country = addr.addressCountry || ""
    const line = [city, region, country].filter(Boolean).join(", ")
    if (line) parts.push(line)
  }
  return parts.length ? parts.join("; ") : null
}

export function parseJobDetail(html: string, id: string, lang: Lang = "en"): JobDetail {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)]
  let posting: Record<string, unknown> | null = null
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1]) as unknown
      const list = Array.isArray(parsed) ? parsed : [parsed]
      for (const item of list) {
        if (
          item &&
          typeof item === "object" &&
          (item as { "@type"?: string })["@type"] === "JobPosting"
        ) {
          posting = item as Record<string, unknown>
          break
        }
      }
    } catch {
      // skip malformed JSON-LD
    }
    if (posting) break
  }

  if (!posting) {
    return {
      id,
      title: "(untitled)",
      company: null,
      location: null,
      date: null,
      url: detailUrl(id, lang),
      workload: null,
      isNew: null,
      easyApply: null,
      description: null,
      employmentType: null,
      workHours: null,
      industry: null,
      skills: null,
      salary: null,
      companyUrl: null,
    }
  }

  const org = posting.hiringOrganization as
    | { name?: string; sameAs?: string }
    | undefined
  const skillsRaw = posting.skills
  let skills: string | null = null
  if (typeof skillsRaw === "string") skills = skillsRaw
  else if (Array.isArray(skillsRaw)) {
    skills = skillsRaw.filter((s) => typeof s === "string").join(", ") || null
  }

  const descriptionHtml =
    typeof posting.description === "string" ? posting.description : null

  return {
    id,
    title:
      typeof posting.title === "string"
        ? decodeHtmlEntities(posting.title)
        : "(untitled)",
    company: org?.name ? decodeHtmlEntities(org.name) : null,
    companyUrl: org?.sameAs || null,
    location: locationFromJobPosting(posting.jobLocation),
    date: typeof posting.datePosted === "string" ? posting.datePosted : null,
    url: detailUrl(id, lang),
    workload: null,
    isNew: null,
    easyApply: null,
    description: descriptionHtml ? htmlToText(descriptionHtml) : null,
    employmentType:
      typeof posting.employmentType === "string" ? posting.employmentType : null,
    workHours: typeof posting.workHours === "string" ? posting.workHours : null,
    industry: typeof posting.industry === "string" ? posting.industry : null,
    skills,
    salary: salaryText(posting.baseSalary),
  }
}
