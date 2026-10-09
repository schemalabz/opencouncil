"use client";
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarX2, UserMinus } from 'lucide-react';
import type { AdministrativeBody, Party } from '@prisma/client';
import FormSheet from '@/components/FormSheet';
import PersonCard from '@/components/persons/PersonCard';
import PersonForm from '@/components/persons/PersonForm';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { RosterImportDialog } from '@/components/bodies/RosterImportDialog';
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
 * which offers this body alone, imports a pasted list, ends a membership, or
 * starts a new term (#829).
 */
export function BodyMembersTab({ cityId, bodyId, people, members, canEdit, formBodies, parties }: BodyMembersTabProps) {
    const t = useTranslations('body');
    const router = useRouter();
    const { toast } = useToast();
    const [busyId, setBusyId] = useState<string | null>(null);

    const membersUrl = `/api/cities/${cityId}/administrative-bodies/${bodyId}/members`;

    async function post(url: string, key: string, done: string, failed: string) {
        setBusyId(key);
        try {
            const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
            if (!response.ok) {
                const data = await response.json().catch(() => null);
                throw new Error(typeof data?.error === 'string' ? data.error : failed);
            }
            toast({ title: done });
            router.refresh();
        } catch (error) {
            toast({ title: failed, description: error instanceof Error ? error.message : undefined, variant: 'destructive' });
        } finally {
            setBusyId(null);
        }
    }

    function endMembership(person: PersonWithRelations) {
        if (!window.confirm(t('endMembershipConfirm', { name: person.name }))) return;
        return post(`${membersUrl}/${person.id}/end`, person.id, t('endMembershipDone'), t('endMembershipFailed'));
    }

    function newTerm() {
        if (!window.confirm(t('newTermConfirm', { count: members.length }))) return;
        return post(`${membersUrl}/new-term`, 'new-term', t('newTermDone'), t('newTermFailed'));
    }

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
                        <div className="flex flex-wrap items-center gap-2">
                            <FormSheet
                                FormComponent={PersonForm}
                                formProps={{ cityId, parties, administrativeBodies: formBodies }}
                                title={t('addMember')}
                                type="add"
                                triggerVariant="outline"
                                triggerSize="sm"
                            />
                            <RosterImportDialog cityId={cityId} bodyId={bodyId} />
                            {members.length > 0 && (
                                <Button type="button" variant="outline" size="sm" onClick={newTerm} disabled={busyId !== null}>
                                    <CalendarX2 className="mr-2 h-4 w-4" aria-hidden />
                                    {t('newTerm')}
                                </Button>
                            )}
                        </div>
                    )}
                </div>
                {ordered.length === 0 ? (
                    <p className="rounded-lg border bg-card/50 px-4 py-8 text-center text-sm text-muted-foreground">{t('noMembers')}</p>
                ) : (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {ordered.map(person => (
                            <div key={person.id} className="flex flex-col gap-1">
                                <PersonCard item={person} editable={canEdit} analyticsSurface="body_members" />
                                {canEdit && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="self-end text-xs text-muted-foreground"
                                        onClick={() => endMembership(person)}
                                        disabled={busyId !== null}
                                    >
                                        <UserMinus className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                                        {t('endMembership')}
                                    </Button>
                                )}
                            </div>
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
