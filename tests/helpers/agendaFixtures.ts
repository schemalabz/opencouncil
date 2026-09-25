import { readFileSync } from 'fs'
import { join } from 'path'
import { Subject } from '@/lib/apiTypes'
import { makeSubject } from './builders'

/** One extracted item as the tasks CLI (`process-agenda`) writes it. */
interface ExtractedFixtureSubject {
    name: string
    description: string
    agendaItemTitle: string | null
    agendaItemIndex: number | null
    agendaSectionIndex: number | null
    agendaSectionTitle: string | null
}

/**
 * Real `processAgenda` extraction output, captured once with the tasks CLI and
 * shaped as the API `Subject` the callback handler receives. Topic labels and
 * introducers are dropped: the fixture database has neither.
 */
export function loadAgendaFixture(name: 'athens_feb9_2026' | 'vrilissia_oct22_2025'): Subject[] {
    const file = join(__dirname, '..', 'fixtures', 'agenda', `${name}.json`)
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { subjects: ExtractedFixtureSubject[] }
    return parsed.subjects.map(s => makeSubject({
        name: s.name,
        description: s.description,
        agendaItemTitle: s.agendaItemTitle,
        agendaItemIndex: s.agendaItemIndex ?? 'OUT_OF_AGENDA',
        agendaSection: s.agendaSectionIndex !== null && s.agendaSectionTitle !== null
            ? { index: s.agendaSectionIndex, title: s.agendaSectionTitle }
            : null,
    }))
}
