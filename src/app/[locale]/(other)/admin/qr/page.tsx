'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type CampaignRow = { id: string; code: string; url: string; name: string | null; isActive: boolean; createdAt: Date };

export default function AdminQrPage() {
    const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function fetchCampaigns() {
        try {
            const res = await fetch('/api/admin/qr');
            if (!res.ok) throw new Error('Failed to fetch campaigns');
            const data = await res.json();
            setCampaigns(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchCampaigns();
    }, []);

    async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        const form = e.currentTarget;
        const formData = new FormData(form);
        const code = String(formData.get('code') || '').trim();
        const url = String(formData.get('url') || '').trim();
        const name = String(formData.get('name') || '').trim() || undefined;

        if (!code || !url) {
            setError('Code and URL are required');
            setIsSubmitting(false);
            return;
        }

        try {
            const res = await fetch('/api/admin/qr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, url, name })
            });

            if (!res.ok) {
                const data = await res.json();
                setError(data.error || 'Failed to create campaign');
                return;
            }

            form.reset();
            fetchCampaigns();
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleToggle(id: string, isActive: boolean) {
        const res = await fetch(`/api/admin/qr/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive })
        });

        if (!res.ok) {
            const data = await res.json();
            alert(`Error: ${data.error || 'Failed to update campaign'}`);
            fetchCampaigns(); // Revert by refetching
        } else {
            fetchCampaigns();
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Are you sure you want to delete this campaign?')) return;

        const res = await fetch(`/api/admin/qr/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json();
            alert(`Error: ${data.error || 'Failed to delete campaign'}`);
            return;
        }

        fetchCampaigns();
    }

    async function handleCopy(value: string) {
        await navigator.clipboard.writeText(value);
    }

    if (loading) {
        return <div className="p-6">Loading...</div>;
    }

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold">QR Campaigns</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Manage short QR code redirects for physical marketing materials
                    </p>
                </div>
            </div>

            {/* Create Form */}
            <Card>
                <CardHeader>
                    <CardTitle>Create Campaign</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleCreate} className="flex gap-4 items-end flex-wrap">
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="code">Code</Label>
                            <Input 
                                id="code"
                                name="code" 
                                placeholder="e.g. chalandri-keyring" 
                                required 
                                disabled={isSubmitting}
                                className="w-48"
                            />
                        </div>
                        <div className="flex flex-col gap-2 flex-1 min-w-[20rem]">
                            <Label htmlFor="url">URL (relative or absolute)</Label>
                            <Input 
                                id="url"
                                name="url" 
                                placeholder="/chalandri or https://..." 
                                required 
                                disabled={isSubmitting}
                            />
                        </div>
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="name">Name (optional)</Label>
                            <Input 
                                id="name"
                                name="name" 
                                placeholder="Partner / notes" 
                                disabled={isSubmitting}
                                className="w-48"
                            />
                        </div>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? 'Creating...' : 'Create'}
                        </Button>
                    </form>
                    {error && (
                        <div className="mt-4 text-sm text-destructive bg-destructive/10 border border-destructive rounded px-3 py-2">
                            {error}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Campaigns Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Campaigns</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Code</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>URL</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead className="text-center">Active</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {campaigns.map((c) => (
                                <TableRow key={c.id}>
                                    <TableCell className="font-mono text-xs">{c.code}</TableCell>
                                    <TableCell>
                                        {c.name ? (
                                            <span className="text-sm">{c.name}</span>
                                        ) : (
                                            <span className="text-sm text-muted-foreground italic">No name</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="max-w-md truncate">
                                        {c.url.startsWith('http') ? (
                                            <a className="text-blue-600 hover:underline text-sm" href={c.url} target="_blank" rel="noopener noreferrer">{c.url}</a>
                                        ) : (
                                            <span className="font-mono text-xs">{c.url}</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {new Date(c.createdAt).toLocaleDateString('en-US', { 
                                            year: 'numeric', 
                                            month: 'short', 
                                            day: 'numeric' 
                                        })}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        <input
                                            type="checkbox"
                                            checked={c.isActive}
                                            onChange={(e) => handleToggle(c.id, e.target.checked)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex gap-2">
                                            <Button 
                                                variant="outline" 
                                                size="sm"
                                                onClick={() => handleCopy(`${process.env.NEXT_PUBLIC_BASE_URL}/qr/${c.code}`)}
                                            >
                                                Copy Link
                                            </Button>
                                            <Button 
                                                variant="destructive" 
                                                size="sm"
                                                onClick={() => handleDelete(c.id)}
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}


