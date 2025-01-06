import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ContactBadge } from "../layout/contact-badge";

type AdminSectionProps = {
    user: {
        isSuperAdmin: boolean;
        administers: Array<{
            id: string;
            city?: { id: string; name: string } | null;
            party?: { id: string; cityId: string; name: string } | null;
            person?: { id: string; cityId: string; name: string } | null;
        }>;
    };
    t: (key: string, params?: Record<string, string>) => string;
};

export function AdminSection({ user, t }: AdminSectionProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>{t("administration")}</CardTitle>
            </CardHeader>
            <CardContent>
                {user.isSuperAdmin ? (
                    <div className="space-y-4">
                        <p className="text-green-600 font-medium">
                            {t("superAdminAccess")}
                        </p>
                        <Button asChild>
                            <Link href="/admin">{t("goToAdmin")}</Link>
                        </Button>
                    </div>
                ) : user.administers.length > 0 ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {user.administers.map((admin) => (
                            <AdminCard key={admin.id} admin={admin} t={t} />
                        ))}
                    </div>
                ) : (
                    <div className="text-gray-600">
                        <p className="text-md">{t("noAdminAccess")}</p>
                        <p className="mt-16 text-sm">
                            {t("contactForAccess")}
                        </p>
                        <div className="mt-4">
                            <ContactBadge type="Email" size="md" className="mr-4" />
                            <ContactBadge type="Phone" size="md" />
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function AdminCard({ admin, t }: { admin: AdminSectionProps['user']['administers'][0], t: AdminSectionProps['t'] }) {
    const adminType = admin.city ? 'city' : admin.party ? 'party' : 'person';
    const entity = admin[adminType];

    if (!entity) return null;

    return (
        <Card>
            <CardContent className="pt-6">
                <h3 className="font-medium mb-2">{t(`admin${adminType.charAt(0).toUpperCase() + adminType.slice(1)}`)}</h3>
                <Link
                    href={`/${adminType === 'city' ? entity.id : `${(entity as { cityId: string }).cityId}/${entity.id}`}`}
                    className="text-blue-600 hover:underline"
                >
                    {entity.name}
                </Link>
            </CardContent>
        </Card>
    );
}