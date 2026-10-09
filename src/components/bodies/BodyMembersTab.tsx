"use client";
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { AdministrativeBody, Party } from '@prisma/client';
import FormSheet from '@/components/FormSheet';
import PersonCard from '@/components/persons/PersonCard';
import PersonForm from '@/components/persons/PersonForm';
import type { PersonWithRelations } from '@/lib/db/people';
import { sortBodyMembers } from '@/lib/sorting/people';

interface BodyMembersTabProps {
    cityId: string;
    bodyId: string;
    /** Everyone who holds, or held, a role on the body. */
    people: PersonWithRelations[];
    /** The people whose role on the body is active now. */
    members: PersonWithRelations[];
    canEdit: boolean;
    formBodies: AdministrativeBody[];
    parties: Party[];
}

/**
 * The members of a body, in the order of the body, and below them the people
 * whose role on the body ended. An admin adds a member with the person form,
 * which offers this body alone.
 */
export function BodyMembersTab({ cityId, bodyId, people, members, canEdit, formBodies, parties }: BodyMembersTabProps) {
    const t = useTranslations('body');

    const ordered = useMemo(() => sortBodyMembers(members, bodyId), [members, bodyId]);
    const former = useMemo(() => {
        const memberIds = new Set(members.map(person => person.id));
        return people.filter(person => !memberIds.has(person.id));
    }, [people, members]);

    return (
        <div className="space-y-8">
            <section>
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <h2 className="!m-0 !text-left">{t('currentMembers')}</h2>
                        <span className="text-sm text-muted-foreground">({ordered.length})</span>
                    </div>
                    {canEdit && (
                        <FormSheet
                            FormComponent={PersonForm}
                            formProps={{ cityId, parties, administrativeBodies: formBodies }}
                            title={t('addMember')}
                            type="add"
                            triggerVariant="outline"
                            triggerSize="sm"
                        />
                    )}
                </div>
                {ordered.length === 0 ? (
                    <p className="rounded-lg border bg-card/50 px-4 py-8 text-center text-sm text-muted-foreground">{t('noMembers')}</p>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {ordered.map(person => (
                            <PersonCard key={person.id} item={person} editable={canEdit} analyticsSurface="body_members" />
                        ))}
                    </div>
                )}
            </section>
            {former.length > 0 && (
                <section>
                    <div className="mb-4 flex items-center gap-2">
                        <h2 className="!m-0 !text-left">{t('formerMembers')}</h2>
                        <span className="text-sm text-muted-foreground">({former.length})</span>
                    </div>
                    <div className="grid grid-cols-1 gap-4 opacity-80 sm:grid-cols-2 lg:grid-cols-3">
                        {former.map(person => (
                            <PersonCard key={person.id} item={person} editable={canEdit} analyticsSurface="body_former_members" />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
