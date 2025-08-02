import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, FileText, Settings, Search } from 'lucide-react';
import Link from 'next/link';

export default function Page() {
    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>
            <p className="text-muted-foreground mb-6">
                Welcome to the OpenCouncil admin panel. Manage users, content, and system settings.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Link href="/admin/users">
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Users</CardTitle>
                            <Users className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <p className="text-xs text-muted-foreground">
                                Manage user accounts and permissions
                            </p>
                        </CardContent>
                    </Card>
                </Link>
                
                <Link href="/admin/meetings">
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Meetings</CardTitle>
                            <FileText className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <p className="text-xs text-muted-foreground">
                                Review council meetings and transcripts
                            </p>
                        </CardContent>
                    </Card>
                </Link>
                
                <Link href="/admin/elasticsearch">
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Elasticsearch</CardTitle>
                            <Search className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <p className="text-xs text-muted-foreground">
                                Configure search indexing and sync
                            </p>
                        </CardContent>
                    </Card>
                </Link>
                
                <Link href="/admin/settings">
                    <Card className="hover:shadow-md transition-shadow cursor-pointer">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Settings</CardTitle>
                            <Settings className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <p className="text-xs text-muted-foreground">
                                System configuration and preferences
                            </p>
                        </CardContent>
                    </Card>
                </Link>
            </div>
        </div>
    );
}
