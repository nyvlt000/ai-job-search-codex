import { describe, expect, test } from "bun:test"
import { readFileSync } from "fs"
import { join } from "path"
import {
  parseJobCards,
  parseJobDetail,
  parseRelativeDate,
  parseSearchHtml,
  searchUrl,
} from "../src/helpers.ts"

const fixtures = join(import.meta.dir, "fixtures")

describe("parseRelativeDate", () => {
  const now = new Date("2026-11-08T12:00:00Z")
  test("parses days", () => {
    expect(parseRelativeDate("3 T", now)).toBe("2026-11-05")
  })
  test("parses weeks", () => {
    expect(parseRelativeDate("1 W", now)).toBe("2026-11-01")
  })
  test("parses Neu", () => {
    expect(parseRelativeDate("Neu", now)).toBe("2026-11-08")
  })
})

describe("searchUrl", () => {
  test("appends location into keyword path", () => {
    const url = searchUrl({
      query: "project manager",
      location: "Basel",
      jobage: 14,
      lang: "de",
    })
    expect(url).toContain("/de/jobs/project%20manager%20Basel/")
    expect(url).toContain("Actuality=14")
    expect(url).toContain("o=1")
  })
  test("uses en locale", () => {
    expect(searchUrl({ query: "PM", lang: "en" })).toContain("/en/jobs/PM/")
  })
})

describe("parseJobCards / parseSearchHtml", () => {
  const html = readFileSync(join(fixtures, "search.html"), "utf8")
  test("parses three cards with uuid ids", () => {
    const cards = parseJobCards(html, "de")
    expect(cards.length).toBe(3)
    expect(cards[0].id).toBe("9501c563-7161-4d8f-aac9-8dcbb4c4cb69")
    expect(cards[0].title).toContain("Manager Finance")
    expect(cards[0].company).toBe("BaselArea")
    expect(cards[0].location).toBe("Basel")
    expect(cards[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(cards[0].url).toContain("/de/job/9501c563-7161-4d8f-aac9-8dcbb4c4cb69/")
  })
  test("reads totalHits meta", () => {
    const { meta } = parseSearchHtml(html, 1, "de")
    expect(meta.totalHits).toBe(15)
  })
  test("empty search yields no cards", () => {
    const empty = readFileSync(join(fixtures, "search-empty.html"), "utf8")
    expect(parseJobCards(empty).length).toBe(0)
  })
})

describe("parseJobDetail", () => {
  const html = readFileSync(join(fixtures, "detail.html"), "utf8")
  test("reads JobPosting JSON-LD", () => {
    const job = parseJobDetail(
      html,
      "dc6dfb52-db50-4c3f-8760-24523f327e35",
      "de",
    )
    expect(job.title).toContain("Wasserbau")
    expect(job.company).toBe("Kanton Nidwalden")
    expect(job.location).toContain("Stans")
    expect(job.date).toBe("2026-11-01")
    expect(job.description).toBeTruthy()
    expect(job.description!.length).toBeGreaterThan(40)
  })
})
