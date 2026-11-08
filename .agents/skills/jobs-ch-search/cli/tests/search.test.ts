import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { buildSearchUrl, runSearch } from "../src/commands/search";

const FIX = join(import.meta.dir, "fixtures");
const originalFetch = globalThis.fetch;
const originalStdoutWrite = process.stdout.write;

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.stdout.write = originalStdoutWrite;
});

describe("buildSearchUrl", () => {
  test("maps flags to jobs.ch query params", () => {
    const url = buildSearchUrl({
      query: "project manager",
      location: "Basel",
      jobage: 7,
      page: 1,
      format: "json",
      lang: "en",
    });
    expect(url).toContain("https://www.jobs.ch/en/vacancies/");
    expect(url).toContain("publication-date=7");
    expect(url).not.toContain("page=");
    expect(url).not.toContain("feat=");
  });

  test("uses French path when lang=fr", () => {
    const url = buildSearchUrl({
      query: "chef de projet",
      page: 1,
      format: "json",
      lang: "fr",
    });
    expect(url).toContain("/fr/offres-emplois/");
  });
});

describe("runSearch", () => {
  test("--limit 0 emits zero results", async () => {
    const fixture = readFileSync(join(FIX, "search.html"), "utf8");
    globalThis.fetch = (async () => new Response(fixture, { status: 200 })) as typeof fetch;

    let stdout = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    const code = await runSearch({
      query: "project manager",
      location: "Basel",
      page: 1,
      limit: 0,
      format: "json",
      lang: "en",
    });

    expect(code).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.results).toHaveLength(0);
    expect(parsed.meta.totalHits).toBe(153);
  });

  test("empty portal response yields empty results with exit 0", async () => {
    const fixture = readFileSync(join(FIX, "search-empty.html"), "utf8");
    globalThis.fetch = (async () => new Response(fixture, { status: 200 })) as typeof fetch;

    let stdout = "";
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += chunk.toString();
      return true;
    }) as typeof process.stdout.write;

    const code = await runSearch({
      query: "zzzz",
      page: 1,
      format: "json",
      lang: "en",
    });

    expect(code).toBe(0);
    expect(JSON.parse(stdout).results).toEqual([]);
  });

  test("request URL includes publication-date for --jobage 14", async () => {
    let captured = "";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      captured = typeof input === "string" ? input : input.toString();
      return new Response(readFileSync(join(FIX, "search-empty.html"), "utf8"));
    }) as typeof fetch;

    process.stdout.write = (() => true) as typeof process.stdout.write;

    await runSearch({
      query: "project manager",
      location: "Basel",
      jobage: 14,
      page: 1,
      format: "json",
      lang: "en",
    });

    expect(captured).toContain("publication-date=14");
    expect(captured).toContain("location=Basel");
  });
});
