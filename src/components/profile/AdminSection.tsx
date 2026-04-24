import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Flag, User, Building } from "lucide-react";

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
                ) : user.administers.length > 0 && (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {user.administers.map((admin) => (
                            <AdminCard key={admin.id} admin={admin} t={t} />
                        ))}
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

    let href = '';
    if (adminType === 'city') {
        href = `/${entity.id}`;
    } else if (adminType === 'party') {
        href = `/${(entity as { cityId: string }).cityId}/parties/${entity.id}`;
    } else { // person
        href = `/${(entity as { cityId: string }).cityId}/people/${entity.id}`;
    }

    return (
        <Card>
            <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                    {adminType === 'city' ? (
                        <Building className="h-10 w-10" />
                    ) : adminType === 'party' ? (
                        <Flag className="h-10 w-10" />
                    ) : (
                        <User className="h-10 w-10" />
                    )}
                    <h3 className="font-medium">{t(`admin${adminType.charAt(0).toUpperCase() + adminType.slice(1)}`)}</h3>
                </div>
                <Link
                    href={href}
                    className="text-blue-600 hover:underline mt-2 block"
                >
                    {entity.name}
                </Link>
            </CardContent>
        </Card>
    );
}