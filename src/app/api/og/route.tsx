// Import directly from @vercel/og rather than next/og: Next 14.2 ships an older
// vendored @vercel/og@0.6.3 (satori@0.10.9) which has known runaway-CPU + memory
// leaks (vercel/next.js#65451, satori#393/#532). The standalone package at 0.11.1
// ships satori@0.25 with those fixes.
import { ImageResponse } from '@vercel/og';
import type { Realm } from '@prisma/client';
import type { ReactElement, ReactNode } from 'react';
import { icons } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { getMeetingDataForOG } from '@/lib/db/meetings';
import { getCity, getPetitionedMapCitiesCached } from '@/lib/db/cities';
import { getConsultationDataForOG } from '@/lib/db/consultations';
import { getLatestSubjectsForSpeaker } from '@/lib/db/subject';
import { getParty, getPartiesForCity } from '@/lib/db/parties';
import { getPeopleForCity, getPerson } from '@/lib/db/people';
import prisma from '@/lib/db/prisma';
import { RegulationData } from '@/components/consultations/types';
import { getHotSubjectCardsCached } from '@/lib/hotSubjectCards';
import { getInitials, getLocalizedMunicipalityName, getLocalizedName, getMunicipalityQualifier } from '@/lib/formatters/name';
import { formatDateStamp, formatDateTime } from '@/lib/formatters/time';
import { sortSubjectsByImportance } from '@/lib/utils';
import { isCustomer } from '@/lib/cityStatus';
import { PETITION_BLUE, PETITION_DISPLAY_THRESHOLD } from '@/lib/landing/petitions';
import { CHAT_SURFACE, NOTIS_CHAT } from '@/lib/notis/chat';
import { authorityKey } from '@/components/cities/overview/authorityKey';
import { getPartyFromRoles, getRoleLabelAt, isActivePartyMember, isRoleActive } from '@/lib/utils/roles';
import { localizeText } from '@/lib/serbian';
import { getRealm } from '@/lib/realm.server';
import { getRealmDisplayName } from '@/lib/realm';
import { storyPreview } from '@/lib/sharing/story';
import { topicStyleHex } from '@/lib/topicStyle';
import { tryAcquireOgSlot, getOgConcurrencyStats } from '@/lib/og/concurrency';
import { OG_LOCALE_PARAM, resolveOgLocale } from '@/lib/og/locale';
import { LOGO_BLACK_DATA_URI, OG_FONTS } from '@/lib/og/serverAssets';
import { getImageData, getPublicImageData, SEAL_BOX, type ImageBox } from '@/lib/og/remoteImage';
import { boundaryPath } from '@/lib/og/boundary';
import { getAboutPageStatsCached, getAllCitiesMinimalCached, getCityPetitionBucketCached } from '@/lib/cache/queries';
import { HERO_AUDIENCES, shotsForRealm } from '@/components/about/config';
import { getPortraitData } from '@/lib/og/portrait';
import { allIllustrated, getStaticIllustrations, getSubjectIllustrations, ILLUSTRATION_BOX } from '@/lib/og/illustration';
import { ogCacheControl } from '@/lib/og/render';
import { subjectOgElement } from '@/lib/og/subjectImage';
import { topicGlyph } from '@/lib/og/topicIcon';
import {
    OG, OgAvatar, OgBody, OgChip, OgChips, OgContextChip, OgEyebrow, OgFacts, OgFrame, OgHeader, OgHeadline,
    OgRow, OgStack, OgTile, OgTileGrid, OgTitle, ogUppercase,
} from '@/components/og/frame';

/**
 * A `getTranslations` result. The `og` catalog holds every string these images
 * draw; the about image also reads `about.hero`, whose copy it mirrors.
 */
type Translator = Awaited<ReturnType<typeof getTranslations>>;

const TILE = { width: 286, height: 163 };
const STACKED_TILE = { width: 300, height: 171 };

type TileSubject = { id: string; name: string; topic?: { colorHex?: string | null; icon?: string | null } | null };

/** An image that draws illustrations, and whether every one it wanted was there; see ogCacheControl. */
type OgRender = { element: ReactElement; settled: boolean } | null;

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

/** The header chip's text: the city's short name, as every image's chip says it, and the body. */
function cityDisplayName(city: { name: string; name_en: string | null }, body: { name: string; name_en: string | null } | null, locale: string): string {
    const name = getLocalizedName(city, locale);
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
    const stamp = formatDateStamp(date, data.city.timezone, locale);
    // The meeting card's own facts line under its stamp; the stamp carries the day and the month.
    const when = formatDateTime(date, data.city.timezone, 'medium', locale);
    const remaining = sorted.length - top.length;

    const element = (
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
                            <OgTitle size={40} maxWidth={440}>{getLocalizedName(data, locale)}</OgTitle>
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
    return { element, settled: allIllustrated(illustrations) };
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

    const element = (
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
    return { element, settled: allIllustrated(illustrations) };
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
                <OgContextChip text={getLocalizedName(consultation.city, locale)} logoSrc={seal} />
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
    // The label the site's badges give the role, so the mayor reads as the mayor here too.
    const tPerson = await getTranslations({ locale, namespace: 'Person' });
    const roleName = getRoleLabelAt(person.roles, tPerson, new Date()) ?? t('person.council');
    // Released meetings only: this image is public and cached, whoever asked for it.
    const [portrait, seal, subjects] = await Promise.all([
        getPortraitData(person.image),
        getImageData(city.logoImage, SEAL_BOX),
        getLatestSubjectsForSpeaker(person.id, 2).catch(() => []),
    ]);
    const illustrations = await getSubjectIllustrations(subjects.map(s => s.id), ILLUSTRATION_BOX.tile);
    const name = getLocalizedName(person, locale);

    const element = (
        <OgFrame>
            <OgHeader markSrc={LOGO_BLACK_DATA_URI} padBottom={20}>
                <OgContextChip text={getLocalizedName(city, locale)} logoSrc={seal} />
            </OgHeader>
            <OgBody
                left={
                    <OgRow gap={32}>
                        <OgAvatar src={portrait} initials={getInitials(name)} size={168} ring={party?.colorHex ?? OG.BORDER} />
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
    return { element, settled: allIllustrated(illustrations) };
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
                <OgContextChip text={getLocalizedName(city, locale)} logoSrc={seal} />
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
                            <OgAvatar key={person.id} src={portraits[i]} initials={getInitials(getLocalizedName(person, locale))} size={52} ring={color} />
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
                <OgContextChip text={getLocalizedName(city, locale)} logoSrc={seal} />
            </OgHeader>
            <div style={{ display: 'flex', flex: 1, flexDirection: 'column', justifyContent: 'center', gap: 28, padding: `0 ${OG.PAD}px ${OG.PAD}px` }}>
                <OgStack gap={12}>
                    <OgTitle size={52}>{t('people.title')}</OgTitle>
                    <OgFacts items={[t('city.people', { count: people.length }), t('city.parties', { count: parties.length })]} />
                </OgStack>
                <OgRow gap={14}>
                    {shown.map((person, i) => (
                        <OgAvatar key={person.id} src={portraits[i]} initials={getInitials(getLocalizedName(person, locale))} size={84} ring={getPartyFromRoles(person.roles)?.colorHex ?? OG.BORDER} />
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

/** The realm's hero screenshot, at twice the size the image draws it so the page inside stays legible. */
const ABOUT_SHOT_BOX: ImageBox = { width: 920, height: 575 };

/** A screenshot in browser chrome, as the page frames it. */
function browserTile(src: string, width: number, height: number): ReactNode {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', width: width + 2, borderRadius: 14, border: `1px solid ${OG.BORDER}`, background: '#ffffff', overflow: 'hidden', boxShadow: '0 24px 48px -24px rgba(12,10,9,0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 12px', borderBottom: `1px solid ${OG.BORDER}`, background: '#fafaf9' }}>
                {['#ff5f57', '#ffbd2e', '#28c840'].map(color => <span key={color} style={{ width: 9, height: 9, borderRadius: 9999, background: color }} />)}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} width={width} height={height} alt="" />
        </div>
    );
}

// About: the sales page's own words beside the product they describe, with the
// counts the page shows. The screenshot is the realm's own, as on the page.
const AboutOGImage = async (locale: string, t: Translator, realm: Realm) => {
    const tHero = await getTranslations({ locale, namespace: 'about.hero' });
    const [stats, shot] = await Promise.all([
        getAboutPageStatsCached().catch(error => {
            console.error('[og] about stats failed:', error);
            return null;
        }),
        getPublicImageData(shotsForRealm(realm).shots['hero-desktop'].src, ABOUT_SHOT_BOX),
    ]);
    const facts = stats
        ? [t('about.municipalities', { count: stats.municipalityCount }), t('city.meetings', { count: stats.meetingCount })]
        : [];
    return (
        <OgFrame>
            <OgHeader markSrc={LOGO_BLACK_DATA_URI} padBottom={20} />
            <OgBody
                left={
                    <OgStack gap={22}>
                        <OgHeadline top={tHero('title')} bottom={tHero('titleHighlight')} size={44} />
                        <OgStack gap={12}>
                            {HERO_AUDIENCES.map(({ id, icon: Icon }) => (
                                <OgRow key={id} gap={10} style={{ alignItems: 'flex-start' }}>
                                    <Icon size={22} color={OG.ORANGE_INK} style={{ marginTop: 2 }} />
                                    <OgStack gap={2}>
                                        <span style={{ fontSize: 20, lineHeight: 1.3, color: OG.INK }}>{tHero(`audiences.${id}.lead`)}</span>
                                        <span style={{ maxWidth: 500, fontSize: 19, lineHeight: 1.35, color: OG.MUTED }}>{tHero(`audiences.${id}.text`)}</span>
                                    </OgStack>
                                </OgRow>
                            ))}
                        </OgStack>
                        {facts.length > 0 && <OgChips>{facts.map(fact => <OgChip key={fact}>{fact}</OgChip>)}</OgChips>}
                    </OgStack>
                }
                right={shot && browserTile(shot, ABOUT_SHOT_BOX.width / 2, ABOUT_SHOT_BOX.height / 2)}
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

/** One bubble of Νότης's thread, as the page draws it: his in white at the left, the reader's in green at the right. */
function chatBubble(text: string, from: 'notis' | 'user', lines: number): ReactNode {
    const notis = from === 'notis';
    return (
        <div
            key={text}
            style={{
                display: 'flex',
                alignSelf: notis ? 'flex-start' : 'flex-end',
                maxWidth: '86%',
                // The squared corner is the tail: satori draws no CSS border triangle.
                borderRadius: 10,
                borderTopLeftRadius: notis ? 2 : 10,
                borderTopRightRadius: notis ? 10 : 2,
                background: notis ? NOTIS_CHAT.NOTIS_BUBBLE : NOTIS_CHAT.USER_BUBBLE,
                padding: '9px 12px',
            }}
        >
            <span style={{ display: 'block', fontSize: 16, lineHeight: 1.35, color: NOTIS_CHAT.INK, lineClamp: lines }}>{text}</span>
        </div>
    );
}

/** The widths the signup images are laid out on: the box at the right, and the text column beside it. */
const NOTIS_BOX = 470;
const PETITION_BOX = 420;
const SIGNUP_COLUMN = 540;
/** The box the municipality itself is drawn in, at the top of the petition's card. */
const SEAL_CARD = { width: 240, height: 200 };
/** How far down the petitioned list the image goes before the tail line takes over. */
const PETITIONED_ROWS = 4;

/**
 * Νότης in his box, as the city page and the signup's first step show him: the
 * header a WhatsApp thread has, then the first beat of the example — he says
 * something, the reader asks, he answers. Labelled an example, as the page
 * labels it: the script is not a message about this reader's municipality.
 */
function notisThread(locale: string, tc: Translator, intro: string): ReactNode {
    return (
        <div style={{ display: 'flex', width: NOTIS_BOX, flexDirection: 'column', overflow: 'hidden', borderRadius: 18, border: `1px solid ${OG.BORDER}`, background: '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${OG.BORDER}`, padding: '12px 16px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={LOGO_BLACK_DATA_URI} width={34} height={34} alt="" style={{ objectFit: 'contain' }} />
                <div style={{ display: 'flex', minWidth: 0, flexDirection: 'column', gap: 3 }}>
                    <span style={{ fontSize: 18, lineHeight: 1.1 }}>{tc('notisName')}</span>
                    <span style={{ display: 'block', width: 360, fontSize: 13, lineHeight: 1.25, color: OG.MUTED, lineClamp: 1 }}>{intro}</span>
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 14, ...CHAT_SURFACE }}>
                {/* Where WhatsApp puts its date chip, and where the signup's own
                    preview puts its label. In flow rather than absolute: the pane
                    clipped an absolute chip against the card's rounded edge. */}
                <div style={{ display: 'flex', alignSelf: 'center', borderRadius: 9999, background: 'rgba(255,255,255,0.75)', padding: '3px 10px', fontSize: 12, lineHeight: 1.2, color: NOTIS_CHAT.MUTED }}>
                    {ogUppercase(tc('notisExampleLabel'), locale)}
                </div>
                {chatBubble(tc('notisMsg1'), 'notis', 3)}
                {chatBubble(tc('notisMsg2'), 'user', 1)}
                {chatBubble(tc('notisMsg3'), 'notis', 3)}
            </div>
        </div>
    );
}

/** A signup image's lead: the step's own sentence, under its heading. */
function signupLead(text: string, maxWidth: number): ReactNode {
    return <span style={{ display: 'block', maxWidth, fontSize: 19, lineHeight: 1.4, color: OG.INK_SOFT, lineClamp: 3 }}>{text}</span>;
}

/**
 * The heading block both signup images draw: the eyebrow, the title, the lead
 * and the footnote of the step the page opens on, in that order, because that
 * is the order the page reads in.
 */
function signupHeading({ locale, eyebrow, title, lead, note, chip }: {
    locale: string; eyebrow: string; title: string; lead: string; note?: string; chip?: ReactNode;
}): ReactNode {
    return (
        <OgStack gap={16}>
            <OgEyebrow text={eyebrow} locale={locale} />
            <OgTitle size={44} lines={3} maxWidth={SIGNUP_COLUMN}>{title}</OgTitle>
            {signupLead(lead, SIGNUP_COLUMN)}
            {chip && <OgChips>{chip}</OgChips>}
            {note && <span style={{ display: 'block', maxWidth: SIGNUP_COLUMN, fontSize: 16, lineHeight: 1.4, color: OG.MUTED, lineClamp: 2 }}>{note}</span>}
        </OgStack>
    );
}

/**
 * The notifications signup — one municipality's, or the picker that covers
 * every municipality Νότης serves.
 *
 * Νότης is what the page offers, so he is what the image shows: the same box,
 * the same first beat of the same example. Beside him the step's own heading.
 * A municipality that is not found, or that Νότης does not serve, has no
 * image — the page itself redirects to the petition.
 */
const NotificationsOGImage = async (locale: string, t: Translator, realm: Realm, cityId: string | null) => {
    const [tn, tc, city] = await Promise.all([
        getTranslations({ locale, namespace: 'notificationSignup' }),
        getTranslations({ locale, namespace: 'cityOverview' }),
        cityId ? getCity(cityId) : null,
    ]);
    if (cityId && (!city || !city.supportsNotifications)) return null;

    const [seal, supported] = await Promise.all([
        getImageData(city?.logoImage, SEAL_BOX),
        // The municipalities the picker lists: what the page offers a reader who has not chosen one.
        city ? null : getAllCitiesMinimalCached(realm).then(cities => cities.filter(c => c.supportsNotifications).length),
    ]);

    const title = city
        ? tn(authorityKey('introTitle', city), { qualifier: getMunicipalityQualifier(city, locale) })
        : tn('pickerTitle');
    // The city's own chip is the official-support badge its first step shows; the
    // picker's is how many municipalities there are to pick from.
    const chip = city
        ? (isCustomer(city.status) ? <OgChip tone="success">{tn('officialSupport')}</OgChip> : null)
        : <OgChip>{t('about.municipalities', { count: supported ?? 0 })}</OgChip>;

    return (
        <OgFrame>
            <OgHeader markSrc={LOGO_BLACK_DATA_URI} padBottom={20}>
                {city && <OgContextChip text={getLocalizedName(city, locale)} logoSrc={seal} />}
            </OgHeader>
            <OgBody
                left={signupHeading({
                    locale,
                    eyebrow: tn('eyebrow'),
                    title,
                    lead: tn('lead'),
                    chip,
                    // The line the step itself closes on: how often he writes and
                    // how to stop, or which channels the picker's reader will get.
                    note: city ? tn('introNote') : tn('pickerChannels'),
                })}
                right={notisThread(locale, tc, tc(authorityKey('notisIntro', city ?? { authorityType: 'municipality' })))}
            />
        </OgFrame>
    );
};

/**
 * A municipality's seal, or its initial where none is stored — as the signup's
 * own card draws it. A municipality that is not covered yet rarely has a seal,
 * which is exactly the municipality the petition images are about.
 */
function ogSeal(name: string, src: string | null, size: number): ReactNode {
    return (
        <div style={{ display: 'flex', width: size, height: size, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 9999, background: src ? '#ffffff' : '#f5f5f4' }}>
            {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} width={size} height={size} alt="" style={{ objectFit: 'contain' }} />
            ) : (
                <span style={{ fontSize: Math.round(size * 0.4), color: OG.MUTED }}>{Array.from(name)[0] ?? ''}</span>
            )}
        </div>
    );
}

/**
 * One municipality already being asked for, as the landing's leaderboard lists
 * it: its rank, its name, and the coarse "N+" bucket. The exact number of
 * petitioners is never drawn, because it is never published.
 */
function petitionedRow(rank: number, name: string, bucket: number): ReactNode {
    return (
        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 14, width: PETITION_BOX, borderRadius: 14, border: `1px solid ${OG.BORDER}`, background: '#ffffff', padding: '13px 18px' }}>
            <span style={{ width: 24, fontSize: 17, color: OG.MUTED }}>{rank}.</span>
            <span style={{ flex: 1, fontSize: 21, lineHeight: 1.15, whiteSpace: 'nowrap' }}>{storyPreview(name, 22)}</span>
            {/* The ramp's pale end, which is the badge the landing draws for the
                lowest bucket. The renderer takes no other step of the ramp:
                `petitionFill` mixes with color-mix, which satori cannot read,
                and the rank beside the name already carries the order. */}
            <div style={{ display: 'flex', borderRadius: 9999, background: PETITION_BLUE.pale, padding: '4px 11px', fontSize: 17, lineHeight: 1.2, color: PETITION_BLUE.deep }}>{bucket}+</div>
        </div>
    );
}

/**
 * The petition — one municipality's, or the picker that opens on the ones
 * already being asked for.
 *
 * The picker shows that list, ranked as the landing map ranks it and with the
 * landing map's coarse counts; an exact number of petitioners never reaches an
 * image, as it never reaches a page. One municipality's petition shows the
 * municipality instead, with how many have asked for it so far. A municipality
 * that already has notifications has nothing to ask for, and so has no image.
 */
const PetitionOGImage = async (locale: string, realm: Realm, cityId: string | null) => {
    const [tp, tc, tl, city] = await Promise.all([
        getTranslations({ locale, namespace: 'petition' }),
        getTranslations({ locale, namespace: 'cityOverview' }),
        getTranslations({ locale, namespace: 'landingV2' }),
        cityId ? getCity(cityId, { includeGeometry: true }) : null,
    ]);
    if (cityId && (!city || city.supportsNotifications)) return null;

    if (city) {
        // The boundary is what the step's own second column draws. The seal is
        // the fallback, and the municipality's initial the fallback after that:
        // a municipality outside the network often has no seal stored. The seal
        // is only fetched when the boundary did not draw.
        const outline = boundaryPath(city.geometry, SEAL_CARD.width, SEAL_CARD.height, 6);
        const [seal, bucket] = await Promise.all([
            outline ? null : getImageData(city.logoImage, { width: 300, height: 300, fit: 'inside' }),
            getCityPetitionBucketCached(city.id).catch(error => {
                console.error('[og] petition bucket failed:', error);
                return null;
            }),
        ]);
        return (
            <OgFrame>
                <OgHeader markSrc={LOGO_BLACK_DATA_URI} padBottom={20} />
                <OgBody
                    left={signupHeading({
                        locale,
                        eyebrow: tp('eyebrow'),
                        title: tp(authorityKey('introTitle', city), { qualifier: getMunicipalityQualifier(city, locale) }),
                        lead: tp('lead'),
                        note: tp('introNote'),
                    })}
                    // The municipality, as the step's own card names it: the place
                    // itself, its full name, and how many have asked for it.
                    right={
                        <div style={{ display: 'flex', width: PETITION_BOX, flexDirection: 'column', alignItems: 'center', gap: 18, borderRadius: 20, border: `1px solid ${OG.BORDER}`, background: '#ffffff', padding: '36px 28px' }}>
                            {outline ?? ogSeal(getLocalizedName(city, locale), seal, 150)}
                            <div style={{ display: 'block', maxWidth: 340, fontSize: 24, lineHeight: 1.2, textAlign: 'center', lineClamp: 2 }}>
                                {getLocalizedMunicipalityName(city, locale)}
                            </div>
                            {/* Only when there is something to say. The step's card
                                falls back to "not in the network yet", which this
                                image's own headline has already said. */}
                            {bucket !== null && <OgChip size={18} tone="orange">{tc('petitionCount', { count: bucket })}</OgChip>}
                        </div>
                    }
                />
            </OgFrame>
        );
    }

    const petitioned = await getPetitionedMapCitiesCached(realm).catch(error => {
        console.error('[og] petitioned cities failed:', error);
        return null;
    });
    const shown = petitioned?.cities ?? [];
    const top = shown.slice(0, PETITIONED_ROWS);
    const overflow = shown.length - top.length;
    // Municipalities with petitions under the display threshold. In a young
    // realm nobody has reached it yet, and this count is the only petition
    // signal there is — the landing's leaderboard renders for it alone.
    const below = petitioned?.belowThresholdCount ?? 0;

    return (
        <OgFrame>
            <OgHeader markSrc={LOGO_BLACK_DATA_URI} padBottom={20} />
            <OgBody
                left={signupHeading({ locale, eyebrow: tp('eyebrow'), title: tp('pickerTitle'), lead: tp('pickerLead') })}
                right={(top.length > 0 || below > 0) && (
                    <OgStack gap={10}>
                        <OgEyebrow text={tl('municipality.petitionedTitle')} locale={locale} size={14} color={OG.MUTED} />
                        {top.map((entry, i) => petitionedRow(i + 1, entry.name, entry.bucket))}
                        {/* One tail line, as the landing's phone strip does it: the
                            municipalities at or above the threshold come first, because
                            the rows above are only the top of that list. */}
                        {(overflow > 0 || below > 0) && (
                            <span style={{ paddingLeft: 4, maxWidth: PETITION_BOX, fontSize: 16, lineHeight: 1.35, color: OG.MUTED }}>
                                {overflow > 0
                                    ? tl('municipality.petitionedOverflow', { count: overflow, threshold: PETITION_DISPLAY_THRESHOLD })
                                    : tl('municipality.petitionedMore', { count: below, threshold: PETITION_DISPLAY_THRESHOLD })}
                            </span>
                        )}
                    </OgStack>
                )}
            />
        </OgFrame>
    );
};

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const cityId = searchParams.get('cityId');
    const meetingId = searchParams.get('meetingId');
    const consultationId = searchParams.get('consultationId');
    const personId = searchParams.get('personId');
    const partyId = searchParams.get('partyId');
    const subjectId = searchParams.get('subjectId');
    const pageType = searchParams.get('pageType'); // 'people', 'landing', 'about', 'explain', 'search', 'notifications', 'petition'

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
        // False when a picture the image wanted was still missing, or the subject was not found: the cache then keeps it for an hour, not a year.
        let settled = true;
        const drew = (built: OgRender) => { if (built) settled = built.settled; return built?.element ?? null; };
        const width = 1200;
        const height = 630;

        if (consultationId && cityId) {
            element = await ConsultationOGImage(cityId, consultationId, locale, t);
        } else if (subjectId && meetingId && cityId) {
            // The element the subject page's opengraph-image.tsx serves, rendered here inside the slot.
            element = drew(await subjectOgElement(locale, cityId, meetingId, subjectId));
        } else if (meetingId && cityId) {
            // ?variant=story and ?variant=feed are no longer served here — story exports
            // render client-side via src/lib/export/storyImage.tsx (moved off the server
            // to avoid the satori/yoga hang on Athens-scale data), and the square feed
            // export was removed with the "Post" share option. A stray variant request
            // falls through to the default landscape, which is a reasonable fallback for
            // any external caller still on the old URL shape.
            element = drew(await MeetingOGImage(cityId, meetingId, reqId, locale, t));
        } else if (personId && cityId) {
            element = drew(await PersonOGImage(cityId, personId, locale, t));
        } else if (partyId && cityId) {
            element = await PartyOGImage(cityId, partyId, locale, t);
        } else if (pageType === 'people' && cityId) {
            element = await PeopleOGImage(cityId, locale, t);
        } else if (pageType === 'landing') {
            element = await LandingOGImage(t, realm, locale);
        } else if (pageType === 'notifications') {
            // Both signup flows read their own cityId: with one, the image is that
            // municipality's step 1; without one, the picker that opens the flow.
            element = await NotificationsOGImage(locale, t, realm, cityId);
        } else if (pageType === 'petition') {
            element = await PetitionOGImage(locale, realm, cityId);
        } else if (pageType === 'about') {
            element = await AboutOGImage(locale, t, realm);
        } else if (pageType === 'explain') {
            element = ExplainOGImage();
        } else if (pageType === 'search') {
            element = SearchOGImage(t);
        } else if (cityId) {
            element = drew(await CityOGImage(cityId, locale, t));
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
        // Without a Cache-Control every crawler unfurl would re-render, defeating the cap.
        return new Response(buffer, {
            status: 200,
            headers: { 'content-type': 'image/png', 'cache-control': ogCacheControl(settled) },
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
