/**
 * Find the Δημοτική Επιτροπή (Municipal Committee) for a given municipality.
 *
 * Searches Diavgeia for the committee election decision published at the
 * start of each council term (1η Ειδική Συνεδρίαση), downloads the PDF,
 * and uses Claude to extract structured committee composition.
 *
 * The Δημοτική Επιτροπή was introduced by N.5056/2023 (replacing Οικονομική
 * Επιτροπή + Επιτροπή Ποιότητας Ζωής). It is elected at the special
 * installation session of the new council. The decision is published on
 * Diavgeia as type 2.4.7.1 (Λοιπές ατομικές διοικητικές πράξεις).
 *
 * Usage:
 *   npx tsx scripts/find-municipal-committee.ts --org 6104
 *   npx tsx scripts/find-municipal-committee.ts --name "Ζωγράφου"
 *   npx tsx scripts/find-municipal-committee.ts --name "Χαλάνδρι" --json
 *   npx tsx scripts/find-municipal-committee.ts --name "Ζωγράφου" --term 2024-2029
 *
 * Requires ANTHROPIC_API_KEY in .env or environment.
 */

import { execSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import Anthropic from '@anthropic-ai/sdk'
import dotenv from 'dotenv'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

dotenv.config()

// ---------------------------------------------------------------------------
// Diavgeia API helpers
// ---------------------------------------------------------------------------

const BASE_URL = 'https://diavgeia.gov.gr'

type Organization = {
  uid: string
  label: string
  category?: string
  status?: string
}

type Decision = {
  ada: string
  subject: string
  issueDate: number
  organizationId: string
  decisionTypeId: string
  documentUrl: string
  [key: string]: unknown
}

type SearchResponse = {
  info: { total: number; page: number; size: number }
  decisions: Decision[]
}

async function diavgeiaApi<T>(
  path: string,
  params?: Record<string, string | number | undefined>
): Promise<T> {
  const url = new URL(`/luminapi/opendata${path}`, BASE_URL)
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
  }
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`Diavgeia API ${res.status}: ${url}`)
  return res.json() as Promise<T>
}

async function diavgeiaSearch(
  params: Record<string, string | number | undefined>
): Promise<SearchResponse> {
  const url = new URL('/opendata/search.json', BASE_URL)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, String(v))
  }
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`Diavgeia search API ${res.status}: ${url}`)
  return res.json() as Promise<SearchResponse>
}

async function diavgeiaSearchAdvanced(
  q: string,
  page = 0,
  size = 50
): Promise<SearchResponse> {
  const url = new URL('/opendata/search/advanced.json', BASE_URL)
  url.searchParams.set('q', q)
  url.searchParams.set('page', String(page))
  url.searchParams.set('size', String(size))
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`Diavgeia advanced search API ${res.status}: ${url}`)
  return res.json() as Promise<SearchResponse>
}

// ---------------------------------------------------------------------------
// Greek text helpers
// ---------------------------------------------------------------------------

function normalizeGreek(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/Ϊ/g, 'Ι')
    .replace(/Ϋ/g, 'Υ')
}

function msToDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Council term helpers
// ---------------------------------------------------------------------------

const TERM_STARTS: Record<string, { from: string; to: string }> = {
  '2024-2029': { from: '2024-01-01', to: '2024-03-31' },
  '2019-2023': { from: '2019-09-01', to: '2019-12-31' },
}

const DEFAULT_TERM = '2024-2029'

// ---------------------------------------------------------------------------
// Find the municipality org ID
// ---------------------------------------------------------------------------

async function findOrganization(name: string): Promise<Organization | null> {
  const { organizations } = await diavgeiaApi<{ organizations: Organization[] }>(
    '/organizations.json',
    { category: 'MUNICIPALITY' }
  )

  const normalized = normalizeGreek(name)

  const exact = organizations.find(
    (o) => normalizeGreek(o.label) === `ΔΗΜΟΣ ${normalized}`
  )
  if (exact) return exact

  const partial = organizations.find((o) =>
    normalizeGreek(o.label).includes(normalized)
  )
  if (partial) return partial

  return null
}

// ---------------------------------------------------------------------------
// Search strategies to find the committee election decision
// ---------------------------------------------------------------------------

const SUBJECT_SEARCHES = [
  'εκλογή μελών δημοτική επιτροπή',
  'εκλογή μελών δημοτικής επιτροπής',
  'εκλογή δημοτική επιτροπή',
]

function isCommitteeElection(d: Decision): boolean {
  const subj = normalizeGreek(d.subject)
  if (subj.includes('ΑΝΤΙΠΡΟΕΔΡ')) return false
  return (
    subj.includes('ΕΚΛΟΓ') &&
    (subj.includes('ΔΗΜΟΤΙΚΗ') || subj.includes('ΔΗΜΟΤΙΚΗΣ')) &&
    (subj.includes('ΕΠΙΤΡΟΠΗ') || subj.includes('ΕΠΙΤΡΟΠΗΣ'))
  )
}

async function findCommitteeDecision(
  orgId: string,
  dateRange: { from: string; to: string }
): Promise<Decision | null> {
  // Strategy 1: Advanced search with subject-word patterns
  for (const subjectWords of SUBJECT_SEARCHES) {
    const tokens = subjectWords
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => `subject:${t}`)
      .join(' AND ')
    const q = `organizationUid:${orgId} AND ${tokens}`

    try {
      const result = await diavgeiaSearchAdvanced(q)
      if (result.decisions.length > 0) {
        const inRange = result.decisions.filter((d) => {
          const date = msToDate(d.issueDate)
          return date >= dateRange.from && date <= dateRange.to
        })
        if (inRange.length > 0) return inRange[0]
        return result.decisions[0]
      }
    } catch {
      // Some query patterns may 400, try next
    }
  }

  // Strategy 2: Scan all decisions in the date range, filter locally
  console.error(
    'Subject-word search did not match, scanning decisions in the installation period...'
  )

  let page = 0
  const size = 500
  while (true) {
    const result = await diavgeiaSearch({
      org: orgId,
      from_issue_date: dateRange.from,
      to_issue_date: dateRange.to,
      size,
      page,
    })
    const match = result.decisions.find(isCommitteeElection)
    if (match) return match

    const totalPages = Math.ceil(result.info.total / size)
    page++
    if (page >= totalPages) break
  }

  return null
}

// ---------------------------------------------------------------------------
// PDF download and text extraction
// ---------------------------------------------------------------------------

async function downloadPdf(ada: string): Promise<string> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'committee-'))
  const pdfPath = path.join(tmpDir, `${ada}.pdf`)

  const docUrl = `${BASE_URL}/luminapi/opendata/decisions/${encodeURIComponent(ada)}/document`
  const res = await fetch(docUrl, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`Failed to download PDF for ${ada}: ${res.status}`)

  const buffer = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(pdfPath, buffer)
  return pdfPath
}

function pdfToText(pdfPath: string): string {
  try {
    return execSync(`pdftotext "${pdfPath}" -`, {
      maxBuffer: 10 * 1024 * 1024,
    }).toString('utf-8')
  } catch {
    throw new Error(
      `pdftotext failed — is poppler-utils installed? (path: ${pdfPath})`
    )
  }
}

// ---------------------------------------------------------------------------
// LLM-based extraction
// ---------------------------------------------------------------------------

type CommitteeMember = {
  name: string
  side: 'majority' | 'minority' | 'unknown'
}

type CommitteeData = {
  regular: CommitteeMember[]
  alternate: CommitteeMember[]
  president: string | null
  vicePresident: string | null
  termStart: string | null
  termEnd: string | null
}

const EXTRACTION_PROMPT = `You are extracting structured data from a Greek municipal council decision document about the election of a Δημοτική Επιτροπή (Municipal Committee).

The document is the minutes (πρακτικό) of the special installation session where committee members are elected. Extract the FINAL elected composition — the authoritative list that appears near the end of the document after phrases like "ανακοίνωσε τα ονόματα", "ως εξής", or "ΤΑΚΤΙΚΑ ΜΕΛΗ" / "ΑΝΑΠΛΗΡΩΜΑΤΙΚΑ ΜΕΛΗ".

Do NOT extract intermediate vote tallies or candidate lists — only the final elected members.

Return a JSON object with this exact structure:
{
  "regular": [
    { "name": "FULL NAME", "side": "majority" | "minority" }
  ],
  "alternate": [
    { "name": "FULL NAME", "side": "majority" | "minority" }
  ],
  "president": "name or null",
  "vicePresident": "name or null",
  "termStart": "DD-MM-YYYY or null",
  "termEnd": "DD-MM-YYYY or null"
}

Rules:
- "side" is "majority" if the member represents the mayor's faction (παράταξη Δημάρχου, εκ μέρους της πλειοψηφίας), "minority" otherwise (παρατάξεις μειοψηφίας, εκ μέρους της μειοψηφίας).
- Include nicknames in parentheses as part of the name, e.g. "ΣΤΑΜΑΤΑΚΗΣ ΖΑΧΑΡΙΑΣ (ΧΑΡΗΣ)"
- The president (πρόεδρος) of the committee is the mayor (Δήμαρχος) by law — extract their name if mentioned.
- The vice-president (αντιπρόεδρος) may or may not be mentioned in this document.
- For term dates, look for phrases like "07-01-2024 έως 30-06-2026".
- Return ONLY the JSON, no markdown fences, no explanation.`

async function extractWithLLM(
  anthropic: Anthropic,
  pdfText: string
): Promise<CommitteeData> {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: `${EXTRACTION_PROMPT}\n\n---\nDOCUMENT TEXT:\n${pdfText}`,
      },
    ],
  })

  const text =
    response.content[0].type === 'text' ? response.content[0].text : ''

  // Strip markdown fences if present
  const jsonStr = text.replace(/^```json?\n?/m, '').replace(/\n?```$/m, '')

  try {
    const data = JSON.parse(jsonStr)
    return {
      regular: data.regular ?? [],
      alternate: data.alternate ?? [],
      president: data.president ?? null,
      vicePresident: data.vicePresident ?? null,
      termStart: data.termStart ?? null,
      termEnd: data.termEnd ?? null,
    }
  } catch (e) {
    throw new Error(
      `Failed to parse LLM response as JSON: ${e}\nResponse: ${text.slice(0, 500)}`
    )
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .option('org', {
      type: 'string',
      description: 'Diavgeia organization UID (e.g. 6104)',
    })
    .option('name', {
      type: 'string',
      description: 'Municipality name to search for (e.g. "Ζωγράφου")',
    })
    .option('term', {
      type: 'string',
      default: DEFAULT_TERM,
      description: 'Council term period (e.g. 2024-2029)',
    })
    .option('json', {
      type: 'boolean',
      default: false,
      description: 'Output as JSON',
    })
    .check((argv) => {
      if (!argv.org && !argv.name) {
        throw new Error('Provide either --org or --name')
      }
      return true
    }).argv

  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  })

  // Resolve org ID
  let orgId = argv.org
  let orgLabel: string | undefined

  if (!orgId) {
    console.error(`Searching for municipality "${argv.name}"...`)
    const org = await findOrganization(argv.name!)
    if (!org) {
      console.error(`Could not find municipality matching "${argv.name}"`)
      process.exit(1)
    }
    orgId = org.uid
    orgLabel = org.label
    console.error(`Found: ${org.label} (uid: ${org.uid})`)
  } else {
    try {
      const org = await diavgeiaApi<Organization>(
        `/organizations/${orgId}.json`
      )
      orgLabel = org.label
      console.error(`Organization: ${org.label} (uid: ${orgId})`)
    } catch {
      console.error(`Warning: could not fetch org details for uid ${orgId}`)
    }
  }

  // Determine date range for the term
  const dateRange = TERM_STARTS[argv.term]
  if (!dateRange) {
    console.error(
      `Unknown term "${argv.term}". Known terms: ${Object.keys(TERM_STARTS).join(', ')}`
    )
    process.exit(1)
  }

  // Find the committee election decision
  console.error(
    `Searching for committee election decision (term ${argv.term})...`
  )
  const decision = await findCommitteeDecision(orgId, dateRange)

  if (!decision) {
    console.error(
      'Could not find a committee election decision for this municipality and term.'
    )
    process.exit(1)
  }

  console.error(
    `Found decision: ${decision.ada} (${msToDate(decision.issueDate)})`
  )
  console.error(`Subject: ${decision.subject}`)

  // Download PDF and extract text
  console.error('Downloading PDF...')
  const pdfPath = await downloadPdf(decision.ada)
  const pdfText = pdfToText(pdfPath)
  fs.unlinkSync(pdfPath)

  // Extract committee composition via LLM
  console.error('Extracting committee composition...')
  const committee = await extractWithLLM(anthropic, pdfText)

  // Build output
  const output = {
    municipality: {
      uid: orgId,
      label: orgLabel || orgId,
    },
    term: argv.term,
    decision: {
      ada: decision.ada,
      subject: decision.subject,
      issueDate: msToDate(decision.issueDate),
      url: `https://diavgeia.gov.gr/doc/${decision.ada}`,
    },
    committee,
  }

  if (argv.json) {
    console.log(JSON.stringify(output, null, 2))
  } else {
    console.log()
    console.log(`=== Δημοτική Επιτροπή — ${orgLabel || orgId} ===`)
    console.log()
    console.log(`Απόφαση:  ${decision.ada}`)
    console.log(`URL:      https://diavgeia.gov.gr/doc/${decision.ada}`)
    console.log(`Ημ/νία:   ${msToDate(decision.issueDate)}`)
    if (committee.termStart && committee.termEnd) {
      console.log(`Θητεία:   ${committee.termStart} — ${committee.termEnd}`)
    }
    if (committee.president) {
      console.log(`Πρόεδρος: ${committee.president}`)
    }
    if (committee.vicePresident) {
      console.log(`Αντιπρόεδρος: ${committee.vicePresident}`)
    }
    console.log()

    if (committee.regular.length > 0) {
      console.log('ΤΑΚΤΙΚΑ ΜΕΛΗ:')
      for (const m of committee.regular) {
        const sideLabel =
          m.side === 'majority'
            ? 'πλειοψηφία'
            : m.side === 'minority'
              ? 'μειοψηφία'
              : ''
        console.log(`  ${m.name}${sideLabel ? `  (${sideLabel})` : ''}`)
      }
      console.log()
    }

    if (committee.alternate.length > 0) {
      console.log('ΑΝΑΠΛΗΡΩΜΑΤΙΚΑ ΜΕΛΗ:')
      for (const m of committee.alternate) {
        const sideLabel =
          m.side === 'majority'
            ? 'πλειοψηφία'
            : m.side === 'minority'
              ? 'μειοψηφία'
              : ''
        console.log(`  ${m.name}${sideLabel ? `  (${sideLabel})` : ''}`)
      }
      console.log()
    }

    if (committee.regular.length === 0 && committee.alternate.length === 0) {
      console.log(
        'WARNING: Could not extract member names. Check the decision URL manually.'
      )
    }
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`)
  process.exit(1)
})
