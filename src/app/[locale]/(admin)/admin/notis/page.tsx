import { Metadata } from 'next';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { getNotisRolloutOverview, getNotisRolloutUsers } from '@/lib/db/notis-rollout';
import { formatNumericDateTime } from '@/lib/formatters/time';
import { NotisToggleButton } from '@/components/admin/notis/NotisToggleButton';
import { EnableBatchForm } from '@/components/admin/notis/EnableBatchForm';
import { ConversationsPagination } from '@/components/admin/conversations/ConversationsPagination';

export const metadata: Metadata = { title: 'Notis release' };

const PAGE_SIZE = 20;

/**
 * The Notis release panel: per-user rollout via User.notisEnabledAt. Enabling
 * a user stops their old WhatsApp/SMS deliveries immediately (matching-engine
 * exclusion) and Notis enrolls them on its next poll. Disabling reverses it.
 */
export default async function NotisReleasePage(props: {
    searchParams: Promise<{ q?: string; page?: string }>;
}) {
    const searchParams = await props.searchParams;
    const search = typeof searchParams.q === 'string' ? searchParams.q.trim() : '';
    const pageParam = Number.parseInt(searchParams.page ?? '1', 10);
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;

    const [overview, { users, total }] = await Promise.all([
        getNotisRolloutOverview(),
        getNotisRolloutUsers({ search: search || undefined, page, pageSize: PAGE_SIZE }),
    ]);
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return (
        <div className="space-y-6 p-6">
            <div>
                <h1 className="text-2xl font-semibold">Notis release</h1>
                <p className="text-sm text-muted-foreground">
                    Enabled users get ο Νότης on WhatsApp instead of the old notification
                    messages. Email notifications continue for everyone.
                </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Coverage
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-2xl font-semibold">
                            {overview.enabled}
                            <span className="text-base font-normal text-muted-foreground">
                                {' '}of {overview.eligible} eligible
                            </span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Eligible = has a phone and phone delivery on in at least one city.
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Batch enable
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <EnableBatchForm remaining={overview.remaining} />
                    </CardContent>
                </Card>
            </div>

            <form method="GET" className="max-w-sm">
                <Input name="q" placeholder="Search name, email or phone…" defaultValue={search} />
            </form>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Cities</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Notis</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {users.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground">
                                No eligible users{search ? ' match this search' : ' yet'}.
                            </TableCell>
                        </TableRow>
                    )}
                    {users.map((user) => (
                        <TableRow key={user.id}>
                            <TableCell>
                                <div className="font-medium">{user.name ?? '—'}</div>
                                <div className="text-sm text-muted-foreground">{user.email}</div>
                            </TableCell>
                            <TableCell>{user.phone ?? '—'}</TableCell>
                            <TableCell className="max-w-56 truncate">
                                {user.cityNames.join(', ') || '—'}
                            </TableCell>
                            <TableCell>
                                {user.notisEnabledAt ? (
                                    <Badge>
                                        enabled {formatNumericDateTime(user.notisEnabledAt)}
                                    </Badge>
                                ) : (
                                    <Badge variant="outline">old path</Badge>
                                )}
                            </TableCell>
                            <TableCell className="text-right">
                                <NotisToggleButton
                                    userId={user.id}
                                    enabled={Boolean(user.notisEnabledAt)}
                                />
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {totalPages > 1 && (
                <ConversationsPagination
                    currentPage={Math.min(page, totalPages)}
                    totalPages={totalPages}
                    pageSize={PAGE_SIZE}
                />
            )}
        </div>
    );
}
