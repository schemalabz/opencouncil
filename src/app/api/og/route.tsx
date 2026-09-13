// Import directly from @vercel/og rather than next/og: Next 14.2 ships an older
// vendored @vercel/og@0.6.3 (satori@0.10.9) which has known runaway-CPU + memory
// leaks (vercel/next.js#65451, satori#393/#532). The standalone package at 0.11.1
// ships satori@0.25 with those fixes.
import { ImageResponse } from '@vercel/og';
import type { Realm } from '@prisma/client';
import type { ReactNode } from 'react';
import { icons } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { getMeetingDataForOG } from '@/lib/db/meetings';
import { getCity } from '@/lib/db/cities';
import { getConsultationDataForOG } from '@/lib/db/consultations';
import { getLatestContributionsForSpeaker } from '@/lib/db/contributions';
import { getParty, getPartiesForCity } from '@/lib/db/parties';
import { getPeopleForCity, getPerson } from '@/lib/db/people';
import prisma from '@/lib/db/prisma';
import { RegulationData } from '@/components/consultations/types';
import { getHotSubjectCardsCached } from '@/lib/hotSubjectCards';
import { getLocalizedMunicipalityName, getLocalizedName } from '@/lib/formatters/name';
import { formatDateStamp, formatDateTime, getIntlLocale } from '@/lib/formatters/time';
import { sortSubjectsByImportance } from '@/lib/utils';
import { getPartyFromRoles, isActivePartyMember, isRoleActive } from '@/lib/utils/roles';
import { localizeText } from '@/lib/serbian';
import { getRealm } from '@/lib/realm.server';
import { getRealmDisplayName } from '@/lib/realm';
import { storyPreview } from '@/lib/sharing/story';
import { topicStyleHex } from '@/lib/topicStyle';
import { tryAcquireOgSlot, getOgConcurrencyStats } from '@/lib/og/concurrency';
import { OG_LOCALE_PARAM, resolveOgLocale } from '@/lib/og/locale';
import { LOGO_BLACK_DATA_URI, OG_FONTS } from '@/lib/og/serverAssets';
import { getImageData, SEAL_BOX } from '@/lib/og/remoteImage';
import { getPortraitData } from '@/lib/og/portrait';
import { getStaticIllustrations, getSubjectIllustrations, ILLUSTRATION_BOX } from '@/lib/og/illustration';
import { topicGlyph } from '@/lib/og/topicIcon';
import {
    OG, OgAvatar, OgBody, OgChip, OgChips, OgContextChip, OgEyebrow, OgFacts, OgFrame, OgHeader, OgHeadline,
    OgRow, OgStack, OgTile, OgTileGrid, OgTitle, initialsOf,
} from '@/components/og/frame';
import SubjectOgImage from '@/app/[locale]/(city)/[cityId]/(meetings)/[meetingId]/subjects/[subjectId]/opengraph-image';

/**
 * A `getTranslations` result. The `og` catalog holds every string these images
 * draw; the about image also reads `about.hero`, whose copy it mirrors.
 */
type Translator = Awaited<ReturnType<typeof getTranslations>>;

const TILE = { width: 286, height: 163 };
const STACKED_TILE = { width: 300, height: 171 };

type TileSubject = { id: string; name: string; topic?: { colorHex?: string | null; icon?: string | null } | null };

/** One subject as a tile: its illustration, or its topic's wash and glyph while it has none. */
function subjectTile(subject: TileSubject, src: string | null, locale: string, size = TILE): ReactNode {
    const colors = topicStyleHex(subject.topic?.colorHex);
    return (
        <OgTile
            key={subject.id}
            src={src}
            title={localizeText(subject.name, locale)}
            wash={colors.background}
            glyph={topicGlyph(subject.topic?.icon, Math.round(size.height * 0.34), colors.icon)}
            width={size.width}
            height={size.height}
        />
    );
}

function cityDisplayName(city: { name_municipality: string; name_municipality_en: string | null }, body: { name: string; name_en: string | null } | null, locale: string): string {
    const name = getLocalizedMunicipalityName(city, locale);
    return body ? `${name} · ${getLocalizedName(body, locale)}` : name;
}

/** A column of tiles under a small eyebrow, as the meeting and city images draw the subjects they show. */
function tileColumn(label: string, locale: string, tiles: ReactNode): ReactNode {
    return (
        <OgStack gap={10}>
            <OgEyebrow text={label} locale={locale} size={14} color={OG.MUTED} />
            {tiles}
        </OgStack>
    );
}

// Hard ceiling on each render. Pairs with the in-process concurrency cap in
// `@/lib/og/concurrency` to keep a single hung satori call from blocking a slot forever.
export const maxDuration = 60;

// Logs subject counts split by agenda status so we can see whether "many subjects"
// (especially many beforeAgenda) is amplifying the work in a given render.
function logSubjectCounts(reqId: string, variant: string, subjects: { nonAgendaReason?: string | null }[], fetchMs: number) {
    const beforeAgenda = subjects.filter(s => s.nonAgendaReason === 'beforeAgenda').length;
    const outOfAgenda = subjects.filter(s => s.nonAgendaReason && s.nonAgendaReason !== 'beforeAgenda').length;
    const agenda = subjects.length - beforeAgenda - outOfAgenda;
    console.log(`[og:${reqId}] fetched variant=${variant} total=${subjects.length} agenda=${agenda} beforeAgenda=${beforeAgenda} outOfAgenda=${outOfAgenda} in ${fetchMs}ms`);
}

// Meeting: the date stamp the meeting card anchors on, and the four subjects
// that took the most debate, as pictures.
const MeetingOGImage = async (cityId: string, meetingId: string, reqId: string, locale: string, t: Translator) => {
    const fetchT0 = Date.now();
    console.log(`[og:${reqId}] fetching variant=default city=${cityId} meeting=${meetingId}`);
    const data = await getMeetingDataForOG(cityId, meetingId);
    if (!data) {
        console.log(`[og:${reqId}] not-found variant=default city=${cityId} meeting=${meetingId}`);
        return null;
    }
    logSubjectCounts(reqId, 'default', data.subjects ?? [], Date.now() - fetchT0);

    const sorted = sortSubjectsByImportance(data.subjects);
    const top = sorted.slice(0, 4);
    const [illustrations, seal] = await Promise.all([
        getSubjectIllustrations(top.map(s => s.id), ILLUSTRATION_BOX.tile),
        getImageData(data.city.logoImage, SEAL_BOX),
    ]);
    const date = new Date(data.dateTime);
    const stamp = formatDateStamp(date, undefined, locale);
    // The meeting card's own facts line under its stamp; the stamp carries the day and the month.
    const when = formatDateTime(date, undefined, 'medium', locale);
    const remaining = sorted.length - top.length;

    return (
        <OgFrame>
            <OgHeader markSrc={LOGO_BLACK_DATA_URI} padBottom={28}>
                <OgContextChip text={cityDisplayName(data.city, data.administrativeBody, locale)} logoSrc={seal} />
            </OgHeader>
            <OgBody
                left={
                    <OgStack gap={0}>
                        <OgEyebrow text={t('meeting.eyebrow')} locale={locale} color={OG.MUTED} />
                        <OgRow gap={16} style={{ alignItems: 'flex-end', marginTop: 18 }}>
                            <span style={{ fontSize: 96, lineHeight: 0.9, letterSpacing: '-0.03em' }}>{stamp.day}</span>
                            <OgEyebrow text={stamp.monthYear} locale={locale} size={18} color={OG.MUTED} />
                        </OgRow>
                        <div style={{ display: 'flex', marginTop: 22 }}>
                            <OgTitle size={40} maxWidth={440}>{data.administrativeBody ? getLocalizedName(data.administrativeBody, locale) : getLocalizedName(data, locale)}</OgTitle>
                        </div>
                        <div style={{ display: 'flex', marginTop: 14 }}>
                            <OgFacts items={[when, t('meeting.subjects', { count: data.subjects.length })]} />
                        </div>
                    </OgStack>
                }
                right={top.length > 0 && (
                    <OgStack gap={10}>
                        <OgTileGrid width={TILE.width}>{top.map(s => subjectTile(s, illustrations.get(s.id) ?? null, locale))}</OgTileGrid>
                        {remaining > 0 && <span style={{ fontSize: 16, color: OG.MUTED }}>{t('meeting.moreSubjects', { count: remaining })}</span>}
                    </OgStack>
                )}
            />
        </OgFrame>
    );
};

// City: the seal, the name and the counts of the identity band, beside the
// subjects the council has been arguing about, as the hot-topics list ranks them.
const CityOGImage = async (cityId: string, locale: string, t: Translator) => {
    const [city, counts, cards] = await Promise.all([
        getCity(cityId),
        prisma.$transaction([
            prisma.person.count({ where: { cityId } }),
            prisma.party.count({ where: { cityId } }),
        ]),
        getHotSubjectCardsCached(cityId, { limit: 4, months: 3 }).catch(error => {
            console.error('[og] hot subjects failed:', error);
            return [];
        }),
    ]);
    if (!city) return null;

    const [seal, illustrations] = await Promise.all([
        getImageData(city.logoImage, { width: 224, height: 224, fit: 'inside' }),
        getSubjectIllustrations(cards.map(c => c.subject.id), ILLUSTRATION_BOX.tile),
    ]);
    const [peopleCount, partiesCount] = counts;
    const meetingsCount = city._count.councilMeetings;

    return (
        <OgFrame>
            <OgHeader markSrc={LOGO_BLACK_DATA_URI} padBottom={28} />
            <OgBody
                left={
                    <OgStack gap={0}>
                        <div style={{ display: 'flex', width: 112, height: 112, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 9999, background: '#ffffff', padding: 8, border: `1px solid ${OG.BORDER}` }}>
                            {seal ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={seal} width={96} height={96} alt="" style={{ objectFit: 'contain' }} />
                            ) : (
                                <icons.Landmark size={48} color={OG.MUTED} />
                            )}
                        </div>
                        <div style={{ display: 'flex', marginTop: 24 }}><OgTitle size={60} maxWidth={560}>{getLocalizedName(city, locale)}</OgTitle></div>
                        <span style={{ marginTop: 6, fontSize: 24, color: OG.MUTED }}>{getLocalizedMunicipalityName(city, locale)}</span>
                        <div style={{ display: 'flex', marginTop: 20 }}>
                            <OgFacts items={[
                                t('city.meetings', { count: meetingsCount }),
                                t('city.people', { count: peopleCount }),
                                t('city.parties', { count: partiesCount }),
                            ]} />
                        </div>
                    </OgStack>
                }
                right={cards.length > 0 && tileColumn(
                    t('city.hotTopics'),
                    locale,
                    <OgTileGrid width={TILE.width}>{cards.map(c => subjectTile(c.subject, illustrations.get(c.subject.id) ?? null, locale))}</OgTileGrid>,
                )}
            />
        </OgFrame>
    );
};

// Consultation: the regulation's title and its shape, in chapters.
const ConsultationOGImage = async (cityId: string, consultationId: string, locale: string, t: Translator) => {
    const fetchRegulationData = async (jsonUrl: string): Promise<RegulationData | null> => {
        try {
            const response = await fetch(jsonUrl, { cache: 'no-store' });
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            console.error('Error fetching regulation data:', error);
            return null;
        }
    };

    const consultation = await getConsultationDataForOG(cityId, consultationId);
    if (!consultation) return null;
    const [regulation, seal] = await Promise.all([fetchRegulationData(consultation.jsonUrl), getImageData(consultation.city.logoImage, SEAL_BOX)]);
    const items = regulation?.regulation ?? [];
    const chapters = items.filter(item => item.type === 'chapter');
    const geosets = items.filter(item => item.type === 'geoset');
    const facts = [
        t('consultation.chapters', { count: chapters.length }),
        t('consultation.areas', { count: geosets.length }),
        t('consultation.comments', { count: consultation._count.comments }),
    ];

    return (
        <OgFrame>
            <OgHeader markSrc={LOGO_BLACK_DATA_URI} padBottom={20}>
                <OgContextChip text={getLocalizedMunicipalityName(consultation.city, locale)} logoSrc={seal} />
            </OgHeader>
            <OgBody
                left={
                    <OgStack gap={0}>
                        <OgEyebrow text={t('consultation.badge')} locale={locale} />
                        <div style={{ display: 'flex', marginTop: 18 }}>
                            <OgTitle size={44} lines={3} maxWidth={620}>{localizeText(regulation?.title || consultation.name, locale)}</OgTitle>
                        </div>
                        <div style={{ display: 'flex', marginTop: 18 }}><OgFacts items={facts} size={20} /></div>
                    </OgStack>
                }
                right={chapters.length > 0 && (
                    <OgStack gap={10} style={{ width: 420 }}>
                        <OgEyebrow text={t('consultation.keyTopics')} locale={locale} size={14} color={OG.MUTED} />
                        {chapters.slice(0, 4).map((chapter, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 16, border: `1px solid ${OG.BORDER}`, background: '#ffffff', padding: '16px 20px', fontSize: 20, color: OG.INK }}>
                                <icons.ScrollText size={22} color={OG.MUTED} />
                                <span style={{ whiteSpace: 'nowrap' }}>{storyPreview(localizeText(chapter.title ?? '', locale) || t('consultation.untitledChapter'), 34)}</span>
                            </div>
                        ))}
                    </OgStack>
                )}
            />
        </OgFrame>
    );
};

// Person: the portrait in the party's ring, and the last subjects they spoke on.
const PersonOGImage = async (cityId: string, personId: string, locale: string, t: Translator) => {
    const [person, city] = await Promise.all([getPerson(personId), getCity(cityId)]);
    if (!person || !city || person.cityId !== cityId) return null;

    const party = getPartyFromRoles(person.roles);
    const roleName = person.roles.filter(isRoleActive).map(role => role.name).find(Boolean) ?? t('person.council');
    const contributions = await getLatestContributionsForSpeaker(person.id, 1, 8).catch(() => ({ results: [] }));
    const subjects: TileSubject[] = [];
    for (const contribution of contributions.results) {
        if (!subjects.some(s => s.id === contribution.subject.id)) subjects.push(contribution.subject);
        if (subjects.length === 2) break;
    }
    const [portrait, seal, illustrations] = await Promise.all([
        getPortraitData(person.image),
        getImageData(city.logoImage, SEAL_BOX),
        getSubjectIllustrations(subjects.map(s => s.id), ILLUSTRATION_BOX.tile),
    ]);
    const name = getLocalizedName(person, locale);

    return (
        <OgFrame>
            <OgHeader markSrc={LOGO_BLACK_DATA_URI} padBottom={20}>
                <OgContextChip text={getLocalizedMunicipalityName(city, locale)} logoSrc={seal} />
            </OgHeader>
            <OgBody
                left={
                    <OgRow gap={32}>
                        <OgAvatar src={portrait} initials={initialsOf(name)} size={168} ring={party?.colorHex ?? OG.BORDER} />
                        <OgStack gap={14}>
                            <OgTitle size={48} maxWidth={520}>{name}</OgTitle>
                            <span style={{ fontSize: 22, lineHeight: 1.3, color: OG.MUTED }}>{localizeText(roleName, locale)}</span>
                            {party && (
                                <OgRow gap={10} style={{ fontSize: 22, color: OG.MUTED }}>
                                    <span style={{ width: 12, height: 12, borderRadius: 9999, background: party.colorHex ?? OG.MUTED }} />
                                    <span>{getLocalizedName(party, locale)}</span>
                                </OgRow>
                            )}
                        </OgStack>
                    </OgRow>
                }
                right={subjects.length > 0 && tileColumn(
                    t('person.recent'),
                    locale,
                    <OgStack gap={12}>{subjects.map(s => subjectTile(s, illustrations.get(s.id) ?? null, locale, STACKED_TILE))}</OgStack>,
                )}
            />
        </OgFrame>
    );
};

// Party: the logo, the colour, and the members.
const PartyOGImage = async (cityId: string, partyId: string, locale: string, t: Translator) => {
    const [party, city] = await Promise.all([getParty(partyId), getCity(cityId)]);
    if (!party || !city || party.cityId !== cityId) return null;

    const members = party.people.filter(person => isActivePartyMember(person, party.id));
    const leader = members.find(person => person.roles.some(role => role.partyId === party.id && role.isHead && isRoleActive(role)));
    const shown = members.slice(0, 12);
    const [seal, logo, portraits] = await Promise.all([
        getImageData(city.logoImage, SEAL_BOX),
        getImageData(party.logo, { width: 240, height: 240, fit: 'inside' }),
        Promise.all(shown.map(person => getPortraitData(person.image))),
    ]);
    const color = party.colorHex ?? OG.MUTED;
    const facts = [t('party.members', { count: members.length })];
    if (leader) facts.push(t('party.leader', { name: getLocalizedName(leader, locale) }));

    return (
        <OgFrame>
            <OgHeader markSrc={LOGO_BLACK_DATA_URI} padBottom={20}>
                <OgContextChip text={getLocalizedMunicipalityName(city, locale)} logoSrc={seal} />
            </OgHeader>
            <OgBody
                left={
                    <OgRow gap={28} style={{ alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', width: 120, height: 120, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 16, background: logo ? '#ffffff' : color, padding: 10, border: `1px solid ${OG.BORDER}` }}>
                            {logo && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={logo} width={100} height={100} alt="" style={{ objectFit: 'contain' }} />
                            )}
                        </div>
                        <OgStack gap={12}>
                            <OgTitle size={44} maxWidth={560}>{getLocalizedName(party, locale)}</OgTitle>
                            <span style={{ width: 96, height: 6, borderRadius: 9999, background: color }} />
                            <OgFacts items={facts} />
                        </OgStack>
                    </OgRow>
                }
                right={shown.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, width: 6 * 52 + 5 * 10 }}>
                        {shown.map((person, i) => (
                            <OgAvatar key={person.id} src={portraits[i]} initials={initialsOf(getLocalizedName(person, locale))} size={52} ring={color} />
                        ))}
                        {members.length > shown.length && (
                            <div style={{ display: 'flex', width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 9999, border: `2px dashed ${OG.BORDER}`, fontSize: 16, color: OG.MUTED }}>
                                +{members.length - shown.length}
                            </div>
                        )}
                    </div>
                )}
            />
        </OgFrame>
    );
};

// People: the council as a row of faces, and how the parties share it.
const PeopleOGImage = async (cityId: string, locale: string, t: Translator) => {
    const [city, people, parties] = await Promise.all([getCity(cityId), getPeopleForCity(cityId, true), getPartiesForCity(cityId)]);
    if (!city) return null;

    const shown = people.slice(0, 8);
    const [seal, portraits] = await Promise.all([
        getImageData(city.logoImage, SEAL_BOX),
        Promise.all(shown.map(person => getPortraitData(person.image))),
    ]);
    const partyCounts = parties
        .map(party => ({ party, count: people.filter(person => isActivePartyMember(person, party.id)).length }))
        .filter(entry => entry.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 4);

    return (
        <OgFrame>
            <OgHeader markSrc={LOGO_BLACK_DATA_URI} padBottom={20}>
                <OgContextChip text={getLocalizedMunicipalityName(city, locale)} logoSrc={seal} />
            </OgHeader>
            <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', gap: 28, padding: `0 ${OG.PAD}px ${OG.PAD}px` }}>
                <OgStack gap={12}>
                    <OgTitle size={52}>{t('people.title')}</OgTitle>
                    <OgFacts items={[t('city.people', { count: people.length }), t('city.parties', { count: parties.length })]} />
                </OgStack>
                <OgRow gap={14}>
                    {shown.map((person, i) => (
                        <OgAvatar key={person.id} src={portraits[i]} initials={initialsOf(getLocalizedName(person, locale))} size={84} ring={getPartyFromRoles(person.roles)?.colorHex ?? OG.BORDER} />
                    ))}
                    {people.length > shown.length && (
                        <div style={{ display: 'flex', width: 84, height: 84, alignItems: 'center', justifyContent: 'center', borderRadius: 9999, border: `2px dashed ${OG.BORDER}`, fontSize: 24, color: OG.MUTED }}>
                            +{people.length - shown.length}
                        </div>
                    )}
                </OgRow>
                {partyCounts.length > 0 && (
                    <OgChips gap={12}>
                        {partyCounts.map(({ party, count }) => (
                            <OgChip key={party.id} size={20}>
                                <span style={{ width: 12, height: 12, borderRadius: 9999, background: party.colorHex ?? OG.MUTED }} />
                                <span>{getLocalizedName(party, locale)}</span>
                                <span style={{ color: OG.MUTED }}>{count}</span>
                            </OgChip>
                        ))}
                    </OgChips>
                )}
            </div>
        </OgFrame>
    );
};

/** A row of illustrations shipped with the build: what the site is about, drawn as the site draws it. */
function staticStrip(pictures: string[], width: number, height: number): ReactNode {
    return (
        <OgRow gap={12}>
            {pictures.map((src, i) => <OgTile key={i} src={src} wash={OG.BORDER} width={width} height={height} />)}
        </OgRow>
    );
}

// Site pages: the same frame, and no database. The landing unfurl is the one
// every share of the bare domain hits, so it stays the cheapest render.
const LandingOGImage = async (t: Translator, realm: Realm, locale: string) => {
    const pictures = (await getStaticIllustrations()).slice(0, 5);
    return (
        <OgFrame>
            <OgHeader markSrc={LOGO_BLACK_DATA_URI} padBottom={24}>
                {/* The realm decides which country the map covers, so the unfurl names it. */}
                <OgChip size={20}>{getRealmDisplayName(realm, locale)}</OgChip>
            </OgHeader>
            <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'space-between', padding: `8px ${OG.PAD}px ${OG.PAD - 8}px` }}>
                <OgStack gap={18}>
                    <OgHeadline top={t('landing.headlineTop')} bottom={t('landing.headlineBottom')} />
                    <span style={{ maxWidth: 780, fontSize: 24, lineHeight: 1.4, color: OG.MUTED }}>{t('landing.subtitle')}</span>
                </OgStack>
                {pictures.length > 0 && staticStrip(pictures, 208, 119)}
            </div>
        </OgFrame>
    );
};

const AboutOGImage = async (locale: string, t: Translator) => {
    const tHero = await getTranslations({ locale, namespace: 'about.hero' });
    const number = new Intl.NumberFormat(getIntlLocale(locale));
    const pictures = (await getStaticIllustrations()).slice(0, 4);
    return (
        <OgFrame>
            <OgHeader markSrc={LOGO_BLACK_DATA_URI} padBottom={24} />
            <OgBody
                left={
                    <OgStack gap={24}>
                        <OgHeadline top={tHero('title')} bottom={tHero('titleHighlight')} size={50} />
                        <OgChips>
                            {[
                                `${number.format(10)} ${tHero('counters.municipalities')}`,
                                `${number.format(5000)}+ ${tHero('counters.subjects')}`,
                                `${number.format(400)}+ ${tHero('counters.meetingHours')}`,
                            ].map(label => <OgChip key={label}>{label}</OgChip>)}
                        </OgChips>
                        <OgChips>
                            {(t.raw('about.tags') as string[]).map(tag => <OgChip key={tag} tone="orange" size={16}>{tag}</OgChip>)}
                        </OgChips>
                    </OgStack>
                }
                right={pictures.length > 0 && (
                    <OgTileGrid width={216}>{pictures.map((src, i) => <OgTile key={i} src={src} wash={OG.BORDER} width={216} height={123} />)}</OgTileGrid>
                )}
            />
        </OgFrame>
    );
};

// /explain is a Greece-realm page and 404s everywhere else (see hasExplainPage),
// so there is nothing to translate it into.
const EXPLAIN_CHAPTERS: [keyof typeof icons, string][] = [
    ['Landmark', 'Έσοδα των δήμων'],
    ['Users', 'Όργανα & συνεδριάσεις'],
    ['Vote', 'Αποφάσεις'],
    ['Search', 'Πώς δουλεύει το OpenCouncil'],
];

const ExplainOGImage = () => (
    <OgFrame>
        <OgHeader markSrc={LOGO_BLACK_DATA_URI} padBottom={24} />
        <OgBody
            left={
                <OgStack gap={18}>
                    <OgHeadline top="Η τοπική αυτοδιοίκηση," bottom="απλά" />
                    <span style={{ maxWidth: 560, fontSize: 24, lineHeight: 1.4, color: OG.MUTED }}>Πώς λειτουργούν οι δήμοι στην Ελλάδα, και πώς το OpenCouncil τους κάνει κατανοητούς.</span>
                </OgStack>
            }
            right={
                <OgStack gap={10} style={{ width: 420 }}>
                    <OgEyebrow text="Κεφάλαια" locale="el" size={14} color={OG.MUTED} />
                    {EXPLAIN_CHAPTERS.map(([icon, label]) => {
                        const Glyph = icons[icon];
                        return (
                            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12, borderRadius: 16, border: `1px solid ${OG.BORDER}`, background: '#ffffff', padding: '16px 20px', fontSize: 20, color: OG.INK }}>
                                <Glyph size={22} color={OG.ORANGE} />
                                <span style={{ whiteSpace: 'nowrap' }}>{label}</span>
                            </div>
                        );
                    })}
                </OgStack>
            }
        />
    </OgFrame>
);

const SearchOGImage = (t: Translator) => (
    <OgFrame>
        <OgHeader markSrc={LOGO_BLACK_DATA_URI} padBottom={8} />
        <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', gap: 28, padding: `0 ${OG.PAD}px ${OG.PAD}px` }}>
            <OgHeadline top={t('search.title')} bottom={t('search.subtitle')} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: 760, borderRadius: 9999, border: `1px solid ${OG.BORDER}`, background: '#ffffff', padding: '20px 28px' }}>
                <icons.Search size={26} color={OG.MUTED} />
                <span style={{ fontSize: 24, color: OG.MUTED }}>{t('search.placeholder')}</span>
            </div>
            <OgChips>
                {(t.raw('search.chips') as string[]).map(chip => <OgChip key={chip} size={20}>{chip}</OgChip>)}
            </OgChips>
        </div>
    </OgFrame>
);

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const cityId = searchParams.get('cityId');
    const meetingId = searchParams.get('meetingId');
    const consultationId = searchParams.get('consultationId');
    const personId = searchParams.get('personId');
    const partyId = searchParams.get('partyId');
    const subjectId = searchParams.get('subjectId');
    const pageType = searchParams.get('pageType'); // 'people', 'landing', 'about', 'explain', 'search'

    // The page that embeds the image passes its own locale; a request without
    // one falls back to the locale the host's readers see (see resolveOgLocale).
    const realm = await getRealm();
    const locale = resolveOgLocale(searchParams.get(OG_LOCALE_PARAM), realm);
    const t = await getTranslations({ locale, namespace: 'og' });

    // Short per-request id so concurrent requests' logs can be untangled by grepping a tag.
    const reqId = crypto.randomUUID().slice(0, 8);
    console.log(`[og:${reqId}] enter city=${cityId ?? '-'} meeting=${meetingId ?? '-'} subject=${subjectId ?? '-'} pageType=${pageType ?? '-'} locale=${locale}`);

    const slot = tryAcquireOgSlot();
    if (!slot) {
        const stats = getOgConcurrencyStats();
        console.warn(`[og:${reqId}] 429 capacity ${stats.active}/${stats.max}`);
        return new Response('OG image generator at capacity — try again shortly.', {
            status: 429,
            headers: { 'Retry-After': '5' },
        });
    }

    const t0 = Date.now();
    try {
        let element;
        const width = 1200;
        const height = 630;

        if (consultationId && cityId) {
            element = await ConsultationOGImage(cityId, consultationId, locale, t);
        } else if (subjectId && meetingId && cityId) {
            // Subject-specific OG image - reuse the native opengraph-image.tsx logic
            return await SubjectOgImage({ params: Promise.resolve({ locale, cityId, meetingId, subjectId }) });
        } else if (meetingId && cityId) {
            // ?variant=story and ?variant=feed are no longer served here — story exports
            // render client-side via src/lib/export/storyImage.tsx (moved off the server
            // to avoid the satori/yoga hang on Athens-scale data), and the square feed
            // export was removed with the "Post" share option. A stray variant request
            // falls through to the default landscape, which is a reasonable fallback for
            // any external caller still on the old URL shape.
            element = await MeetingOGImage(cityId, meetingId, reqId, locale, t);
        } else if (personId && cityId) {
            element = await PersonOGImage(cityId, personId, locale, t);
        } else if (partyId && cityId) {
            element = await PartyOGImage(cityId, partyId, locale, t);
        } else if (pageType === 'people' && cityId) {
            element = await PeopleOGImage(cityId, locale, t);
        } else if (pageType === 'landing') {
            element = await LandingOGImage(t, realm, locale);
        } else if (pageType === 'about') {
            element = await AboutOGImage(locale, t);
        } else if (pageType === 'explain') {
            element = ExplainOGImage();
        } else if (pageType === 'search') {
            element = SearchOGImage(t);
        } else if (cityId) {
            element = await CityOGImage(cityId, locale, t);
        } else {
            return new Response('Missing required parameters', { status: 400 });
        }

        if (!element) {
            console.log(`[og:${reqId}] not-found before-image-construction t=${Date.now() - t0}ms`);
            return new Response('Not found', { status: 404 });
        }

        // ImageResponse construction is cheap but the satori render is lazy — it runs
        // when the body is consumed. Force it to complete here (inside the slot) by
        // awaiting arrayBuffer(), so the concurrency cap actually caps satori work
        // instead of just capping handler invocations.
        console.log(`[og:${reqId}] image-construct dim=${width}x${height} t=${Date.now() - t0}ms`);
        const satoriT0 = Date.now();
        const imageResponse = new ImageResponse(element, { width, height, fonts: OG_FONTS });
        // Heartbeat while waiting for satori. If these logs FIRE during a hang, the
        // event loop is alive and satori is in an async wait (probably a fetch). If they
        // do NOT fire, satori is sync-blocked in WASM and no JS code can run on this
        // thread until it returns. That's the binary diagnostic we need.
        const heartbeat = setInterval(() => {
            console.log(`[og:${reqId}] still rendering at ${Date.now() - satoriT0}ms`);
        }, 2000);
        let buffer: ArrayBuffer;
        try {
            buffer = await imageResponse.arrayBuffer();
        } finally {
            clearInterval(heartbeat);
        }
        console.log(`[og:${reqId}] rendered bytes=${buffer.byteLength} satori=${Date.now() - satoriT0}ms`);
        // Restore the Cache-Control that next/og's ImageResponse sets by default —
        // dropping it would make every crawler unfurl re-render, defeating the cap.
        // Matches next/og's exact defaults including the dev no-cache branch.
        return new Response(buffer, {
            status: 200,
            headers: {
                'content-type': 'image/png',
                'cache-control': process.env.NODE_ENV === 'development'
                    ? 'no-cache, no-store'
                    : 'public, immutable, no-transform, max-age=31536000',
            },
        });
    } catch (e) {
        console.error(`[og:${reqId}] error:`, e);
        // The reason rides along in development only, where the log is not always in view.
        const detail = process.env.NODE_ENV === 'development' && e instanceof Error ? `: ${e.message}` : '';
        return new Response(`Failed to generate image${detail}`, { status: 500 });
    } finally {
        slot.release();
        const stats = getOgConcurrencyStats();
        // Now includes the satori render itself (we awaited arrayBuffer() above).
        console.log(`[og:${reqId}] exit t=${Date.now() - t0}ms slots=${stats.active}/${stats.max}`);
    }
}
