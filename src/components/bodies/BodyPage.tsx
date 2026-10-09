"use client";
import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ExternalLink, Landmark } from 'lucide-react';
import type { AdministrativeBody, Party } from '@prisma/client';
import { Link } from '@/i18n/routing';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EntityHeader, FactDot } from '@/components/EntityHeader';
import List from '@/components/List';
import MeetingCardV2 from '@/components/meetings/MeetingCardV2';
import AddMeetingForm from '@/components/meetings/AddMeetingForm';
import { BodyMembersTab } from '@/components/bodies/BodyMembersTab';
import { BodyContactsForm } from '@/components/bodies/BodyContactsForm';
import { BodyAdminsCard } from '@/components/bodies/BodyAdminsCard';
import { BodyClaimLinksCard } from '@/components/bodies/BodyClaimLinksCard';
import type { BodyPageRow } from '@/lib/db/administrativeBodies';
import type { CouncilMeetingWithSubjectPreview } from '@/lib/db/meetings';
import type { PersonWithRelations } from '@/lib/db/people';
import { getLocalizedName } from '@/lib/formatters/name';
import { meetingLabel } from '@/lib/meetingName';
import { isSecondaryBody } from '@/lib/utils/bodyTier';
import { isRoleActive } from '@/lib/utils/roles';
import { cn } from '@/lib/utils';
import { TWO_COLUMN_GRID_NARROW_RAIL } from '@/components/ui/surface-card';
import { RailCard } from '@/components/ui/rail-card';

export const underlineTabClass =
    '-mb-px rounded-none no-underline hover:no-underline border-b-2 border-transparent bg-transparent px-0 pb-2.5 pt-0 text-sm font-semibold text-muted-foreground shadow-none ' +
    'data-[state=active]:border-[hsl(var(--orange-deep))] data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none';

export interface BodyPageProps {
    city: { id: string; name: string; name_en: string; timezone: string };
    body: BodyPageRow;
    meetings: CouncilMeetingWithSubjectPreview[];
    /** Everyone who holds, or held, a role on the body. */
    people: PersonWithRelations[];
    /** The body itself, as the member form wants it. Empty for a reader. */
    formBodies: AdministrativeBody[];
    /** The parties the member form may offer. Empty for an admin of the body alone. */
    parties: Party[];
    /** The contact settings of the body. Null for a reader. */
    contacts: { youtubeChannelUrl: string | null; contactEmails: string[] } | null;
    /** An admin of the body, of its city, or a superadmin. */
    canEdit: boolean;
    /** An admin of the city or a superadmin: they may also remove the last admin of the body. */
    canEditCity: boolean;
    /** Fixed by the server page, so a card's stage survives hydration. */
    now: Date;
    cappedAt: number;
}

/**
 * The page of one administrative body (#829). The meetings and the members
 * are public. The third tab exists for the admins of the body: it holds the
 * contact settings and the list of admins, the two things a secretary runs
 * without us (#828).
 */
export default function BodyPage({ city, body, meetings, people, formBodies, parties, contacts, canEdit, canEditCity, now, cappedAt }: BodyPageProps) {
    const t = useTranslations('body');
    const tCommon = useTranslations('Common');
    const tMeetings = useTranslations('CouncilMeeting');
    const locale = useLocale();

    const name = getLocalizedName(body, locale);
    const typeLabel = tCommon(`adminBodyType_${body.type}`);

    const members = useMemo(
        () => people.filter(person => person.roles.some(role => role.administrativeBodyId === body.id && isRoleActive(role))),
        [people, body.id],
    );

    const searchKeys = (meeting: CouncilMeetingWithSubjectPreview) => [
        meetingLabel(meeting, 'el', city.timezone),
        meetingLabel(meeting, 'en', city.timezone),
        meetingLabel(meeting, locale, city.timezone),
        ...meeting.subjects.map(subject => subject.name),
    ];

    return (
        <div className="min-h-screen bg-background">
            <div className="container mx-auto px-4 py-4 sm:py-6 lg:py-8 space-y-6 sm:space-y-8">
                <Breadcrumb className="mb-4 sm:mb-6">
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbLink asChild>
                                <Link href="/">{t('breadcrumbHome')}</Link>
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbLink asChild>
                                <Link href={`/${city.id}`}>{getLocalizedName(city, locale)}</Link>
                            </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                        <BreadcrumbItem>
                            <BreadcrumbLink href={`/${city.id}/bodies/${body.id}`}>{name}</BreadcrumbLink>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>

                <EntityHeader
                    avatar={(
                        <span
                            className="flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-[21.5%] bg-[hsl(var(--orange))]/[0.10] text-[hsl(var(--orange-deep))]"
                            aria-hidden
                        >
                            <Landmark className="h-9 w-9" />
                        </span>
                    )}
                    name={name}
                    // A body often carries the name of its type; the badge then says nothing new.
                    badges={typeLabel !== name && (
                        <span className="inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold">
                            {typeLabel}
                        </span>
                    )}
                    facts={(
                        <>
                            <span>{t('membersCount', { count: members.length })}</span>
                            <FactDot />
                            <span>{t('meetingsCount', { count: body._count.meetings })}</span>
                            {body.place && (
                                <>
                                    <FactDot />
                                    <span>{body.place}</span>
                                </>
                            )}
                            {body.youtubeChannelUrl && (
                                <>
                                    <FactDot />
                                    <a href={body.youtubeChannelUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:underline">
                                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                                        {t('channel')}
                                    </a>
                                </>
                            )}
                        </>
                    )}
                />

                <div className={cn("mt-8", TWO_COLUMN_GRID_NARROW_RAIL)}>
                    <Tabs defaultValue="meetings" className="min-w-0">
                        <TabsList className="h-auto w-full justify-start gap-6 overflow-x-visible rounded-none border-b border-border bg-transparent p-0">
                            <TabsTrigger value="meetings" className={underlineTabClass}>
                                {t('tabMeetings')}
                                <span className="ml-1.5 font-normal text-muted-foreground">({meetings.length})</span>
                            </TabsTrigger>
                            <TabsTrigger value="members" className={underlineTabClass}>
                                {t('tabMembers')}
                                <span className="ml-1.5 font-normal text-muted-foreground">({members.length})</span>
                            </TabsTrigger>
                            {canEdit && (
                                <TabsTrigger value="admin" className={underlineTabClass}>
                                    {t('tabAdmin')}
                                </TabsTrigger>
                            )}
                        </TabsList>
                        <TabsContent value="meetings" className="mt-6">
                            <List<CouncilMeetingWithSubjectPreview, { cityTimezone: string; now: Date }, undefined>
                                items={meetings}
                                editable={canEdit}
                                ItemComponent={MeetingCardV2}
                                itemProps={{ cityTimezone: city.timezone, now }}
                                cappedAt={cappedAt}
                                FormComponent={AddMeetingForm}
                                formProps={{ cityId: city.id, allowedBodyIds: [body.id] }}
                                t={tMeetings}
                                searchKeys={searchKeys}
                                showCount
                                smColumns={1}
                                mdColumns={2}
                                lgColumns={2}
                                pagination={{ pageSize: 12 }}
                            />
                        </TabsContent>
                        <TabsContent value="members" className="mt-6">
                            <BodyMembersTab
                                cityId={city.id}
                                bodyId={body.id}
                                people={people}
                                members={members}
                                canEdit={canEdit}
                                formBodies={formBodies}
                                parties={parties}
                            />
                        </TabsContent>
                        {canEdit && (
                            <TabsContent value="admin" className="mt-6 space-y-8">
                                {contacts && <BodyContactsForm cityId={city.id} bodyId={body.id} contacts={contacts} />}
                                <BodyAdminsCard cityId={city.id} bodyId={body.id} canRemoveLast={canEditCity} />
                                <BodyClaimLinksCard cityId={city.id} bodyId={body.id} />
                            </TabsContent>
                        )}
                    </Tabs>

                    <aside className="space-y-4">
                        <RailCard title={t('aboutTitle')}>
                            <p className="text-sm text-muted-foreground">
                                {isSecondaryBody(body) ? t('aboutSecondary', { type: typeLabel }) : t('aboutPrimary', { type: typeLabel })}
                            </p>
                        </RailCard>
                    </aside>
                </div>
            </div>
        </div>
    );
}
