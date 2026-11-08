import {
  detailUrl,
  htmlFetch,
  normalizeId,
  parseJobDetail,
  writeError,
  type Lang,
} from "../helpers.js"

export interface DetailOpts {
  id: string
  format: "json" | "plain"
  lang: Lang
}

export async function runDetail(opts: DetailOpts): Promise<number> {
  const id = normalizeId(opts.id)
  if (!id) {
    writeError(
      `Could not parse a job UUID from "${opts.id}" (numeric data-job-id is not enough; pass the UUID or /job/{uuid}/ URL)`,
      "BAD_ID",
    )
    return 1
  }
  try {
    const url = detailUrl(id, opts.lang)
    if (url.includes("?") || url.includes("/JS24Web/") || url.includes("/api/")) {
      writeError("Refusing to request a robots.txt-disallowed URL", "BLOCKED_URL")
      return 1
    }
    const html = await htmlFetch(url)
    if (!html) {
      writeError("Job not found", "NOT_FOUND")
      return 1
    }
    const job = parseJobDetail(html, id, opts.lang)

    if (opts.format === "plain") {
      const lines = [
        job.title,
        `${job.company || "—"} · ${job.location || "—"} · ${job.date || "—"}`,
        "",
        job.employmentType ? `Employment: ${job.employmentType}` : "",
        job.industry ? `Industry: ${job.industry}` : "",
        "",
        job.description || "(no description)",
        "",
        `URL: ${job.url}`,
      ].filter((l) => l !== "")
      process.stdout.write(lines.join("\n") + "\n")
    } else {
      process.stdout.write(JSON.stringify(job, null, 2) + "\n")
    }
    return 0
  } catch (e) {
    writeError(e instanceof Error ? e.message : String(e), "DETAIL_FAILED")
    return 1
  }
}
