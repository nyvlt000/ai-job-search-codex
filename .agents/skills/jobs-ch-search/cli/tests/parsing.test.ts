import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import {
  normalizeId,
  parseJobCards,
  parseJobDetail,
  parseSearchHtml,
  sliceAssignedObject,
  searchUrl,
  detailUrl,
} from "../src/helpers";

const FIX = join(import.meta.dir, "fixtures");

describe("sliceAssignedObject", () => {
  test("extracts a nested object with quoted braces inside strings", () => {
    const src = `__INIT__ = {"a":"{not","b":{"c":1}};`;
    const raw = sliceAssignedObject(src, "__INIT__");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!)).toEqual({ a: "{not", b: { c: 1 } });
  });

  test("returns null when the name is absent", () => {
    expect(sliceAssignedObject("x = {}", "__INIT__")).toBeNull();
  });
});

describe("parseSearchHtml", () => {
  test("parses __INIT__ results from the search fixture", () => {
    const html = readFileSync(join(FIX, "search.html"), "utf8");
    const { cards, meta } = parseSearchHtml(html, 1, "en");
    expect(cards.length).toBe(3);
    expect(cards[0].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(cards[0].title.length).toBeGreaterThan(0);
    expect(cards[0].company).toBeTruthy();
    expect(cards[0].url).toContain("/en/vacancies/detail/");
    expect(meta.totalHits).toBe(153);
    expect(meta.page).toBe(1);
  });

  test("returns empty results without crashing", () => {
    const html = readFileSync(join(FIX, "search-empty.html"), "utf8");
    const { cards, meta } = parseSearchHtml(html, 1, "en");
    expect(cards).toEqual([]);
    expect(meta.totalHits).toBe(0);
  });

  test("falls back to data-cy job-link cards when results are null", () => {
    const html = readFileSync(join(FIX, "search-card-fallback.html"), "utf8");
    const { cards } = parseSearchHtml(html, 1, "en");
    expect(cards.length).toBe(2);
    expect(cards[0].title).toBe("Fallback Card Title");
    expect(cards[0].id).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
  });

  test("skips a malformed entry without breaking the rest", () => {
    const html = `<script>__INIT__ = {"vacancy":{"results":{"main":{"results":[null,{"id":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","title":"Good","company":{"name":"Co"},"place":"Basel","publicationDate":"2026-11-01T00:00:00+01:00","employmentGrades":[100]}],"meta":{"totalHits":1,"numPages":1}}}}};</script>`;
    const { cards } = parseSearchHtml(html, 1, "en");
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe("Good");
    expect(cards[0].workload).toBe("100%");
  });
});

describe("parseJobCards", () => {
  test("parses card anchors directly", () => {
    const html = readFileSync(join(FIX, "search-card-fallback.html"), "utf8");
    const cards = parseJobCards(html, "en");
    expect(cards).toHaveLength(2);
    expect(cards[1].title).toBe("Second Card");
  });
});

describe("parseJobDetail", () => {
  test("parses JobPosting JSON-LD from the detail fixture", () => {
    const html = readFileSync(join(FIX, "detail.html"), "utf8");
    const id = "4be37140-3c52-4075-aaac-4af33fb127e7";
    const job = parseJobDetail(html, id, "en");
    expect(job.id).toBe(id);
    expect(job.title.toLowerCase()).toContain("project manager");
    expect(job.company).toBeTruthy();
    expect(job.description).toBeTruthy();
    expect(job.description!).not.toContain("<li>");
    expect(job.url).toBe(
      `https://www.jobs.ch/en/vacancies/detail/${id}/`,
    );
  });
});

describe("normalizeId / URLs", () => {
  test("accepts bare UUID and detail URLs in any locale", () => {
    const id = "4be37140-3c52-4075-aaac-4af33fb127e7";
    expect(normalizeId(id)).toBe(id);
    expect(
      normalizeId(`https://www.jobs.ch/en/vacancies/detail/${id}/`),
    ).toBe(id);
    expect(
      normalizeId(`https://www.jobs.ch/de/stellenangebote/detail/${id}/?x=1`),
    ).toBe(id);
    expect(
      normalizeId(`https://www.jobs.ch/fr/offres-emplois/detail/${id}/`),
    ).toBe(id);
    expect(normalizeId("not-a-job")).toBeNull();
  });

  test("searchUrl never adds feat= and maps jobage to publication-date", () => {
    const url = searchUrl({
      query: "project manager",
      location: "Basel",
      jobage: 14,
      page: 2,
      lang: "de",
    });
    expect(url).toContain("/de/stellenangebote/");
    expect(url).toContain("term=project+manager");
    expect(url).toContain("location=Basel");
    expect(url).toContain("publication-date=14");
    expect(url).toContain("page=2");
    expect(url).not.toContain("feat=");
    expect(url).not.toContain("/api/");
  });

  test("detailUrl is canonical with trailing slash and no query", () => {
    const url = detailUrl("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "en");
    expect(url).toBe(
      "https://www.jobs.ch/en/vacancies/detail/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/",
    );
    expect(url).not.toContain("?");
  });
});
