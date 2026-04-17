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
import { GripVertical, Loader2, Download, Upload } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useTranslations } from 'next-intl';
import { isRoleActive } from '@/lib/utils';
import { compareRanks } from '@/lib/sorting/people';
import { downloadFile } from '@/lib/export/meetings';

interface ElectedOrderSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    people: PersonWithRelations[];
    cityId: string;
}

interface SortableMember {
    personId: string;
    roleId: string;
    name: string;
    electedOrder: number | null;
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
    const t = useTranslations('ElectedOrderSheet');

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
                {member.electedOrder !== null && (
                    <div className="text-sm text-muted-foreground">{t('currentOrder', { order: member.electedOrder })}</div>
                )}
            </div>
            <div className="text-sm text-muted-foreground">#{index + 1}</div>
        </div>
    );
}

/**
 * Find the best representative role for a person to store electedOrder on.
 * Prefers a role that already has electedOrder, otherwise first active role in the city.
 */
function getRepresentativeRole(person: PersonWithRelations, cityId: string) {
    return person.roles.find(r => r.electedOrder != null)
        ?? person.roles.find(r => r.cityId === cityId && isRoleActive(r))
        ?? person.roles[0];
}

export default function ElectedOrderSheet({
    open,
    onOpenChange,
    people,
    cityId,
}: ElectedOrderSheetProps) {
    const router = useRouter();
    const [isSaving, setIsSaving] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [members, setMembers] = useState<SortableMember[]>([]);
    const t = useTranslations('ElectedOrderSheet');

    // Initialize members from people data
    useEffect(() => {
        const membersData: SortableMember[] = people
            .flatMap(person => {
                const role = getRepresentativeRole(person, cityId);
                if (!role) return [];
                return [{
                    personId: person.id,
                    roleId: role.id,
                    name: person.name,
                    electedOrder: role.electedOrder ?? null,
                }];
            })
            .sort((a, b) => {
                const orderCompare = compareRanks(a.electedOrder, b.electedOrder);
                if (orderCompare !== 0) return orderCompare;
                return a.name.localeCompare(b.name);
            });

        setMembers(membersData);
    }, [people, cityId]);

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
                electedOrder: index + 1,
            }));

            const response = await fetch(
                `/api/cities/${cityId}/roles/elected-order`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rankings }),
                }
            );

            if (!response.ok) {
                throw new Error('Failed to save elected order');
            }

            toast({
                title: t('orderSaved'),
                description: t('orderSavedDescription'),
            });

            router.refresh();
            onOpenChange(false);
        } catch (error) {
            console.error('Error saving elected order:', error);
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
                electedOrder: null,
            }));

            const response = await fetch(
                `/api/cities/${cityId}/roles/elected-order`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rankings }),
                }
            );

            if (!response.ok) {
                throw new Error('Failed to reset elected order');
            }

            toast({
                title: t('orderReset'),
                description: t('orderResetDescription'),
            });

            router.refresh();
            onOpenChange(false);
        } catch (error) {
            console.error('Error resetting elected order:', error);
            toast({
                title: t('error'),
                description: t('resetError'),
                variant: 'destructive',
            });
        } finally {
            setIsResetting(false);
        }
    };

    const handleExport = () => {
        const data = {
            cityId,
            exportedAt: new Date().toISOString(),
            members: members.map((m, index) => ({
                roleId: m.roleId,
                personId: m.personId,
                name: m.name,
                electedOrder: index + 1,
            })),
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        downloadFile(blob, `elected-order-${cityId}.json`);
    };

    const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        // Reset so the same file can be re-selected
        event.target.value = '';

        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (!Array.isArray(data?.members)) throw new Error('Invalid format');

            const rankings = data.members.map((m: { roleId: string; electedOrder: number }) => ({
                roleId: m.roleId,
                electedOrder: m.electedOrder,
            }));

            const response = await fetch(
                `/api/cities/${cityId}/roles/elected-order`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ rankings }),
                }
            );

            if (!response.ok) throw new Error('Failed to save');

            toast({
                title: t('importSuccess'),
                description: t('importSuccessDescription', { count: rankings.length, total: members.length }),
            });

            router.refresh();
            onOpenChange(false);
        } catch {
            toast({
                title: t('importError'),
                description: t('importErrorDescription'),
                variant: 'destructive',
            });
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
                    <div className="flex items-center justify-between rounded-md border border-dashed px-3 py-2">
                        <p className="text-xs text-muted-foreground">
                            {t('backupHint')}
                        </p>
                        <div className="flex gap-1 shrink-0">
                            <Button
                                onClick={handleExport}
                                disabled={isLoading}
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground h-7 px-2 text-xs"
                            >
                                <Download className="mr-1 h-3 w-3" />
                                {t('export')}
                            </Button>
                            <Button
                                onClick={() => document.getElementById('import-elected-order')?.click()}
                                disabled={isLoading}
                                variant="ghost"
                                size="sm"
                                className="text-muted-foreground h-7 px-2 text-xs"
                            >
                                <Upload className="mr-1 h-3 w-3" />
                                {t('import')}
                            </Button>
                            <input
                                id="import-elected-order"
                                type="file"
                                accept=".json"
                                className="hidden"
                                onChange={handleImport}
                            />
                        </div>
                    </div>
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
