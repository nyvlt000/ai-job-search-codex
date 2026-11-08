---
framework_version: 1.0.0
---

# Job Evaluation Framework

<!-- SETUP: Skill match areas and career goals are personalized by running /setup -->

## Scoring Dimensions

Evaluate each job posting against these five dimensions:

### 1. Technical Skills Match (0-100)
How well do the required/preferred skills align with the candidate's capabilities?

| Score | Meaning |
|-------|---------|
| 80-100 | Core requirements are primary skills |
| 60-79 | Most requirements match, 1-2 gaps that are learnable |
| 40-59 | Partial match, significant upskilling needed |
| 0-39 | Fundamental mismatch |

**Strong match areas:** Project management, program management, IT project delivery, digital transformation, cloud migration, stakeholder management, RFP-to-go-live ownership, contact center / CCaaS programs, conversational AI customer-journey initiatives, Microsoft 365 / Teams collaboration programs, unified communications.
**Moderate match areas:** Enterprise architecture (ArchiMate), Azure fundamentals, SIP / voice infrastructure, speech recognition use cases, capacity planning, business case development, PMO coordination, technical program management.
**Weak match areas:** Hands-on DevOps / Kubernetes platform engineering as primary duty, pure software development IC roles, dedicated product management without project delivery framing, undocumented language requirements (e.g. German C1) if not confirmed.

### 2. Experience Match (0-100)
Does work history align with what they're looking for?

| Score | Meaning |
|-------|---------|
| 80-100 | Direct experience in the same domain and role type |
| 60-79 | Related experience, transferable skills clear |
| 40-59 | Adjacent experience, would need to make the case |
| 0-39 | Unrelated experience |

**Strong:** Global project/program management, digital workplace / intranet rollouts, CCaaS cloud migration, UC / collaboration leadership, multi-country IT delivery, stakeholder and vendor management from RFP through go-live.
**Moderate:** UC engineering leadership, contact-center technology consulting, SIP infrastructure programs, team leadership of specialist engineers, Microsoft Teams / M365 adoption programs.
**Entry-level / stretch:** Pure product management, software engineering IC, DevOps/SRE platform ownership, people management of large non-technical organizations without IT delivery focus.

### 3. Behavioral/Culture Fit (0-100)
Does the role and company culture match the behavioral profile?

| Score | Meaning |
|-------|---------|
| 80-100 | Culture strongly matches behavioral preferences |
| 60-79 | Mixed signals but mostly compatible |
| 40-59 | Some friction areas |
| 0-39 | Significant culture mismatch |

**Red flags to research:** Department disorganization, work dominated by maintenance over delivery of initiatives, poor chemistry with leadership, culture mismatches. Check reviews, media coverage, LinkedIn connections, and network contacts for insider perspective.

### 4. Location & Logistics (Pass/Fail + Notes)
- Freiburg or Basel (incl. hybrid): PASS
- Remote with DE/CH presence or Upper Rhine commute: PASS
- On-site outside Freiburg/Basel corridor with no remote option: FAIL (deal-breaker)
- Frequent international travel: FLAG (discuss with user; current role already spans Switzerland/Germany)

### 5. Career Alignment & Motivation (0-100)
Does this role advance career goals and contain tasks that energize?

| Score | Meaning |
|-------|---------|
| 80-100 | Strongly aligned with career direction, clear growth path |
| 60-79 | Good role but only partially aligned with long-term goals |
| 40-59 | Decent job but doesn't build toward career goals |
| 0-39 | Dead end or backwards step |

**Career goals:**
- Primary: Project Manager, Program Manager, IT Project Manager, Digital Transformation Project Manager roles.
- Secondary: UC / collaboration / contact-center engineering or leadership roles when they leverage the engineering background.

**Motivation filter:** Evaluate not just whether you *can* do the tasks, but whether the tasks will *energize* you. Consider:
- Tasks that energize: Large IT project/program delivery, digital transformation, cloud migration, contact-center / conversational AI customer experience, workplace collaboration platforms, stakeholder-led global rollouts.
- Tasks that drain: Not specified on CV; avoid inventing. Flag pure maintenance-only or pure coding IC roles as likely low-energy relative to PM goals.
- Non-task factors: Not specified beyond location preference for Freiburg/Basel.

**Life situation alignment:** Consider personal constraints:
- **Security:** Not specified.
- **Flexibility:** Freiburg im Breisgau based; Freiburg and Basel search focus; hybrid and remote acceptable.
- **Professional development:** Continue building senior project/program leadership in digital transformation, cloud migration, and customer-experience / UC domains.

### 6. Salary Benchmark (Optional)

If the salary lookup tool is configured (`salary_data.json` exists), look up the company:
```
python salary_lookup.py "<Company Name>" --json
```

If a city is known from the posting, add `--city "<City>"` to narrow results.

Present findings as:
```
### Salary Benchmark
| Metric | Value |
|--------|-------|
| [Category] index | XX.X (+/-X.X% vs baseline) |
| Overall index | XX.X (+/-X.X% vs baseline) |
```

Interpret results relative to the baseline defined in the data file's metadata. For index-based data, higher typically means above-market compensation.

If the salary tool is not configured, skip this section.

## Output Format

Present the evaluation as:

```
## Job Fit Evaluation: [Role] at [Company]

| Dimension | Score | Notes |
|-----------|-------|-------|
| Technical Skills | XX/100 | [brief note] |
| Experience Match | XX/100 | [brief note] |
| Behavioral Fit | XX/100 | [brief note] |
| Location | PASS/FAIL | [brief note] |
| Career Alignment | XX/100 | [brief note] |

**Overall Score: XX/100** (weighted average of scored dimensions)

### Verdict: [Strong Fit / Good Fit / Moderate Fit / Weak Fit / Poor Fit]

### Key Strengths for This Role
- [bullet points]

### Gaps to Address
- [bullet points]

### Recommendation
[1-2 sentences: apply/skip/apply with caveats]

### Company Research Checklist
- [ ] Checked company website (mission, values, recent news)
- [ ] Checked review sites (Glassdoor, kununu, etc.)
- [ ] Checked LinkedIn for team size, recent hires, connections
- [ ] Checked media for restructuring, growth, or workplace issues
- [ ] Identified network contacts who may know the team/manager
```

## Weighting
- Technical Skills: 30%
- Experience Match: 25%
- Behavioral Fit: 15%
- Career Alignment: 30%

(Location is pass/fail, not weighted)

## Thresholds
- **Strong Fit** (75+): Definitely apply, tailor everything
- **Good Fit** (60-74): Apply, address gaps in cover letter
- **Moderate Fit** (45-59): Consider carefully, discuss with user
- **Weak Fit** (30-44): Probably skip unless strategic reasons
- **Poor Fit** (<30): Skip

## Pre-Application: Call the Employer (Best Practice)

Before writing the application, consider whether the candidate should call the contact person listed in the posting. **Only call if there are substantive questions** - never call just to "be remembered."

### When to Suggest Calling
- The posting has unclear or ambiguous requirements
- It's unclear which competencies are essential vs. nice-to-have
- The role description is vague about day-to-day tasks
- There's a named contact person who invites questions

### Good Questions to Ask
- "What are the primary challenges in this role?"
- "How is time typically divided across the listed responsibilities?"
- "Which competencies are most critical for success in this position?"
- "What does success look like in the first 6-12 months?"

### Rules for the Call
- Prepare a 30-second "elevator pitch" about your background in case they ask
- The call's purpose is **gathering information**, not delivering a pitch
- Take notes - use what you learn to tailor the application
- Reference the conversation naturally in the cover letter ("After speaking with [name], I was especially drawn to...")
