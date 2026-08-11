"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { useToast } from "@/hooks/use-toast";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

interface OperatorUser {
    id: string;
    name: string | null;
    email: string;
}

const NOT_ATTENDED = "not-attended";

export default function MeetingOperator({
    cityId,
    meetingId,
}: {
    cityId: string;
    meetingId: string;
}) {
    const { data: session } = useSession();
    const isSuperAdmin = session?.user?.isSuperAdmin ?? false;

    if (!isSuperAdmin) return null;

    return <MeetingOperatorInner cityId={cityId} meetingId={meetingId} />;
}

function MeetingOperatorInner({
    cityId,
    meetingId,
}: {
    cityId: string;
    meetingId: string;
}) {
    const { toast } = useToast();
    const t = useTranslations("admin.adminActions.operator");
    const [operator, setOperator] = useState<OperatorUser | null>(null);
    const [superadmins, setSuperadmins] = useState<OperatorUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchData = useCallback(async () => {
        try {
            const [operatorRes, usersRes] = await Promise.all([
                fetch(`/api/cities/${cityId}/meetings/${meetingId}/operator`),
                fetch("/api/admin/users"),
            ]);

            if (operatorRes.ok) {
                const data = await operatorRes.json();
                setOperator(data.operator);
            }

            if (usersRes.ok) {
                const users = await usersRes.json();
                setSuperadmins(
                    users
                        .filter((u: { isSuperAdmin: boolean }) => u.isSuperAdmin)
                        .map((u: { id: string; name: string | null; email: string }) => ({
                            id: u.id,
                            name: u.name,
                            email: u.email,
                        }))
                );
            }
        } catch (error) {
            console.error("Failed to fetch operator data:", error);
        } finally {
            setIsLoading(false);
        }
    }, [cityId, meetingId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleChange = async (value: string) => {
        const userId = value === NOT_ATTENDED ? null : value;

        try {
            const res = await fetch(
                `/api/cities/${cityId}/meetings/${meetingId}/operator`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId }),
                }
            );

            if (!res.ok) {
                throw new Error(`Operator update failed: ${res.status}`);
            }

            const data = await res.json();
            setOperator(data.operator);

            toast({
                title: t("updatedTitle"),
                description: userId
                    ? t("assigned", { name: data.operator?.name || data.operator?.email || "" })
                    : t("markedNotAttended"),
            });
        } catch (error) {
            // Every failure here means one thing to the reader: the change didn't
            // save. The underlying message is either browser boilerplate ("Failed
            // to fetch") or our own status text — neither is worth showing over a
            // sentence in their language, so it goes to the console instead.
            console.error("Failed to update meeting operator:", error);
            toast({
                title: t("errorTitle"),
                description: t("updateFailed"),
                variant: "destructive",
            });
        }
    };

    if (isLoading) return null;

    return (
        <div className="mt-6">
            <h3 className="text-lg font-semibold">{t("title")}</h3>
            <p className="text-sm text-muted-foreground mb-4">{t("subtitle")}</p>
            <Select
                value={operator?.id ?? NOT_ATTENDED}
                onValueChange={handleChange}
            >
                <SelectTrigger className="w-[280px]">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value={NOT_ATTENDED}>{t("notAttended")}</SelectItem>
                    {superadmins.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                            {user.name || user.email}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}
