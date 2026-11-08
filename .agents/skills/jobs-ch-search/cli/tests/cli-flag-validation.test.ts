import { describe, test, expect } from "bun:test";
import { runCLI } from "./helpers";

function parsedStderr(stderr: string): { error?: string; code?: string } {
  try {
    return JSON.parse(stderr);
  } catch {
    return {};
  }
}

describe("jobs.ch CLI flag validation", () => {
  test("missing query and location exits 1 with NO_QUERY_OR_LOCATION", async () => {
    const result = await runCLI(["search"]);
    expect(result.exitCode).toBe(1);
    const err = parsedStderr(result.stderr);
    expect(err.code).toBe("NO_QUERY_OR_LOCATION");
  });

  test("non-numeric --jobage exits 1 with BAD_ARG", async () => {
    const result = await runCLI(["search", "-l", "Basel", "--jobage", "foo"]);
    expect(result.exitCode).toBe(1);
    const err = parsedStderr(result.stderr);
    expect(err.code).toBe("BAD_ARG");
    expect(err.error).toMatch(/jobage/);
  });

  test("zero --jobage exits 1 with BAD_ARG", async () => {
    const result = await runCLI(["search", "-l", "Basel", "--jobage", "0"]);
    expect(result.exitCode).toBe(1);
    const err = parsedStderr(result.stderr);
    expect(err.code).toBe("BAD_ARG");
  });

  test("non-numeric --page exits 1 with BAD_ARG", async () => {
    const result = await runCLI(["search", "-l", "Basel", "--page", "abc"]);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("BAD_ARG");
  });

  test("non-numeric --limit exits 1 with BAD_ARG", async () => {
    const result = await runCLI(["search", "-l", "Basel", "--limit", "xyz"]);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("BAD_ARG");
  });

  test("invalid --lang exits 1 with BAD_ARG", async () => {
    const result = await runCLI(["search", "-l", "Basel", "--lang", "it"]);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("BAD_ARG");
  });

  test("detail without id exits 1 with NO_ID", async () => {
    const result = await runCLI(["detail"]);
    expect(result.exitCode).toBe(1);
    expect(parsedStderr(result.stderr).code).toBe("NO_ID");
  });

  test("bogus flag exits 1 with UNKNOWN_FLAG", async () => {
    const result = await runCLI([
      "search",
      "-l",
      "Basel",
      "-q",
      "test",
      "--bogus-flag",
      "xyz",
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr);
    expect(error.code).toBe("UNKNOWN_FLAG");
    expect(error.error).toContain("--bogus-flag");
  });
});
