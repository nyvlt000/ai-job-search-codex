import { afterEach, describe, expect, test } from "bun:test";
import { htmlFetch } from "../src/helpers";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("htmlFetch request timeout", () => {
  test("passes an AbortSignal timeout to fetch", async () => {
    let init: RequestInit | undefined;
    globalThis.fetch = (async (_url: string | URL | Request, i?: RequestInit) => {
      init = i;
      return new Response("<html></html>", { status: 200 });
    }) as unknown as typeof fetch;

    await htmlFetch("https://www.jobs.ch/en/vacancies/");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
});
