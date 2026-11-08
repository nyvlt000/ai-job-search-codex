import { describe, expect, test } from "bun:test"
import { runCLI } from "./helpers.ts"

describe("cli flag validation", () => {
  test("unknown command", async () => {
    const r = await runCLI(["nope"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("UNKNOWN_CMD")
  })
  test("unknown flag", async () => {
    const r = await runCLI(["search", "-q", "x", "--bogus", "1"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("UNKNOWN_FLAG")
  })
  test("missing query and location", async () => {
    const r = await runCLI(["search"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("NO_QUERY_OR_LOCATION")
  })
  test("rejects french lang", async () => {
    const r = await runCLI(["search", "-q", "x", "--lang", "fr"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARG")
  })
  test("bad jobage", async () => {
    const r = await runCLI(["search", "-q", "x", "--jobage", "abc"])
    expect(r.exitCode).toBe(1)
    expect(JSON.parse(r.stderr).code).toBe("BAD_ARG")
  })
})
