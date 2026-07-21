"use client";

import { useMemo, useState } from "react";
import { City, CityStatus, Realm } from "@prisma/client";
import { useLocale, useTranslations } from "next-intl";
import { ALL_REALMS, getRealmDisplayName } from "@/lib/realm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import FormSheet from "@/components/FormSheet";
import CityForm from "@/components/cities/CityForm";

type CityCounts = { persons: number; parties: number; councilMeetings: number };
type CityRow = City & { _count: CityCounts };

interface CitiesAdminTableProps {
    cities: CityRow[];
}

const STATUS_VARIANT: Record<CityStatus, "default" | "secondary" | "outline"> = {
    listed: "default",
    unlisted: "secondary",
    pending: "outline",
};

export function CitiesAdminTable({ cities }: CitiesAdminTableProps) {
    const t = useTranslations("admin.cities");
    const locale = useLocale();
    const [searchTerm, setSearchTerm] = useState("");

    const filteredCities = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return cities;
        return cities.filter(
            (city) =>
                city.name.toLowerCase().includes(term) ||
                city.name_en.toLowerCase().includes(term) ||
                city.id.toLowerCase().includes(term)
        );
    }, [cities, searchTerm]);

    const groupedByRealm = useMemo(() => {
        // Iterate every realm in config order and drop empty groups.
        return ALL_REALMS
            .map((realm) => ({ realm, cities: filteredCities.filter((c) => c.realm === realm) }))
            .filter((group) => group.cities.length > 0);
    }, [filteredCities]);

    const realmLabel = (realm: Realm) => getRealmDisplayName(realm, locale);
    const languageLabel = (language: City["language"]) =>
        language === "fr" ? t("languageFrench") : t("languageGreek");

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-semibold">{t("title")}</h1>
                    <p className="text-sm text-muted-foreground">{t("description")}</p>
                </div>
                <FormSheet
                    FormComponent={CityForm}
                    formProps={{}}
                    title={t("addCity")}
                    type="add"
                    closeOnSuccess
                />
            </div>

            <Input
                type="text"
                placeholder={t("searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
            />

            {groupedByRealm.length === 0 ? (
                <p className="text-muted-foreground">{t("noCities")}</p>
            ) : (
                groupedByRealm.map(({ realm, cities: realmCities }) => (
                    <Card key={realm}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                {realmLabel(realm)}
                                <Badge variant="secondary">
                                    {t("cityCount", { count: realmCities.length })}
                                </Badge>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{t("columnName")}</TableHead>
                                        <TableHead>{t("columnId")}</TableHead>
                                        <TableHead>{t("columnLanguage")}</TableHead>
                                        <TableHead>{t("columnStatus")}</TableHead>
                                        <TableHead className="text-right">{t("columnMeetings")}</TableHead>
                                        <TableHead className="text-right">{t("columnPeople")}</TableHead>
                                        <TableHead className="text-right">{t("columnParties")}</TableHead>
                                        <TableHead />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {realmCities.map((city) => (
                                        <TableRow key={city.id}>
                                            <TableCell className="font-medium">{city.name}</TableCell>
                                            <TableCell>
                                                <a
                                                    href={`/${city.id}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-primary hover:underline"
                                                >
                                                    {city.id}
                                                </a>
                                            </TableCell>
                                            <TableCell>{languageLabel(city.language)}</TableCell>
                                            <TableCell>
                                                <Badge variant={STATUS_VARIANT[city.status]}>
                                                    {city.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {city._count.councilMeetings}
                                            </TableCell>
                                            <TableCell className="text-right">{city._count.persons}</TableCell>
                                            <TableCell className="text-right">{city._count.parties}</TableCell>
                                            <TableCell className="text-right">
                                                <FormSheet
                                                    FormComponent={CityForm}
                                                    formProps={{ city }}
                                                    title={t("editCity")}
                                                    type="edit"
                                                    closeOnSuccess
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                ))
            )}
        </div>
    );
}
