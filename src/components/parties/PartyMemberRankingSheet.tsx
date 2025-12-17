"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { PersonWithRelations } from '@/lib/db/people';
import { PartyWithPersons } from '@/lib/db/parties';
import { GripVertical, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { compareRanks } from '@/components/utils';

interface PartyMemberRankingSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    party: PartyWithPersons;
    people: PersonWithRelations[];
    cityId: string;
}

interface SortableMember {
    personId: string;
    roleId: string;
    name: string;
    rank: number | null;
}

function SortableMemberRow({ member, index }: { member: SortableMember; index: number }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: member.roleId });
    const t = useTranslations('PartyMemberRankingSheet');

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className="flex items-center gap-3 p-3 border rounded-lg bg-card"
        >
            <div
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
            >
                <GripVertical className="h-5 w-5" />
            </div>
            <div className="flex-1">
                <div className="font-medium">{member.name}</div>
                {member.rank !== null && (
                    <div className="text-sm text-muted-foreground">{t('rank', { rank: member.rank })}</div>
                )}
            </div>
            <div className="text-sm text-muted-foreground">#{index + 1}</div>
        </div>
    );
}

export default function PartyMemberRankingSheet({
    open,
    onOpenChange,
    party,
    people,
    cityId,
}: PartyMemberRankingSheetProps) {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [members, setMembers] = useState<SortableMember[]>([]);
    const t = useTranslations('PartyMemberRankingSheet');

    // Initialize members from people data
    useEffect(() => {
        const activePeople = people.filter(person =>
            person.roles.some(role =>
                role.partyId === party.id &&
                (!role.endDate || new Date(role.endDate) > new Date())
            )
        );

        const membersData: SortableMember[] = activePeople
            .flatMap(person => {
                const partyRole = person.roles.find(role => role.partyId === party.id);
                if (!partyRole) return [];
                return [{
                    personId: person.id,
                    roleId: partyRole.id,
                    name: person.name,
                    rank: partyRole.rank ?? null,
                }];
            })
            .sort((a, b) => {
                // Sort by rank first, then by name
                const rankCompare = compareRanks(a.rank, b.rank);
                if (rankCompare !== 0) return rankCompare;
                return a.name.localeCompare(b.name);
            });

        setMembers(membersData);
    }, [people, party.id]);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setMembers((items) => {
                const oldIndex = items.findIndex(item => item.roleId === active.id);
                const newIndex = items.findIndex(item => item.roleId === over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        setIsResetting(false);
        try {
            const rankings = members.map((member, index) => ({
                roleId: member.roleId,
                rank: index + 1,
            }));

            const response = await fetch(
                `/api/cities/${cityId}/parties/${party.id}/roles/ranking`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ rankings }),
                }
            );

            if (!response.ok) {
                throw new Error('Failed to save rankings');
            }

            toast({
                title: t('rankingsSaved'),
                description: t('rankingsSavedDescription'),
            });

            router.refresh();
            onOpenChange(false);
        } catch (error) {
            console.error('Error saving rankings:', error);
            toast({
                title: t('error'),
                description: t('saveError'),
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = async () => {
        setIsResetting(true);
        setIsSaving(false);
        try {
            const rankings = members.map((member) => ({
                roleId: member.roleId,
                rank: null,
            }));

            const response = await fetch(
                `/api/cities/${cityId}/parties/${party.id}/roles/ranking`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ rankings }),
                }
            );

            if (!response.ok) {
                throw new Error('Failed to reset rankings');
            }

            toast({
                title: t('rankingsReset'),
                description: t('rankingsResetDescription'),
            });

            router.refresh();
            onOpenChange(false);
        } catch (error) {
            console.error('Error resetting rankings:', error);
            toast({
                title: t('error'),
                description: t('resetError'),
                variant: 'destructive',
            });
        } finally {
            setIsResetting(false);
        }
    };

    const isLoading = isSaving || isResetting;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="overflow-y-auto">
                <SheetHeader>
                    <SheetTitle>{t('title')}</SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                    <p className="text-sm text-muted-foreground">
                        {t('description')}
                    </p>
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={members.map(m => m.roleId)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-2">
                                {members.map((member, index) => (
                                    <SortableMemberRow
                                        key={member.roleId}
                                        member={member}
                                        index={index}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                    <div className="flex gap-2 pt-4">
                        <Button
                            onClick={handleSave}
                            disabled={isLoading}
                            className="flex-1"
                        >
                            {isSaving ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {t('saving')}
                                </>
                            ) : (
                                t('save')
                            )}
                        </Button>
                        <Button
                            onClick={handleReset}
                            disabled={isLoading}
                            variant="outline"
                            className="flex-1"
                        >
                            {isResetting ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    {t('resetting')}
                                </>
                            ) : (
                                t('reset')
                            )}
                        </Button>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
