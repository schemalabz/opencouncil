'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type CityOption = { id: string; name: string };

type ConsultationRow = {
    id: string;
    name: string;
    jsonUrl: string;
    endDate: string;
    isActive: boolean;
    createdAt: string;
    city: { id: string; name: string };
    _count: { comments: number };
};

export default function AdminConsultationsPage() {
    const [consultations, setConsultations] = useState<ConsultationRow[]>([]);
    const [cities, setCities] = useState<CityOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function fetchConsultations() {
        try {
            const res = await fetch('/api/admin/consultations');
            if (!res.ok) throw new Error('Failed to fetch consultations');
            const data = await res.json();
            setConsultations(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }

    async function fetchCities() {
        try {
            const res = await fetch('/api/admin/entities');
            if (!res.ok) throw new Error('Failed to fetch cities');
            const data = await res.json();
            setCities(data.filter((e: { type: string }) => e.type === 'city'));
        } catch (err) {
            console.error(err);
        }
    }

    useEffect(() => {
        fetchConsultations();
        fetchCities();
    }, []);

    async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setError(null);
        setIsSubmitting(true);

        const form = e.currentTarget;
        const formData = new FormData(form);
        const name = String(formData.get('name') || '').trim();
        const jsonUrl = String(formData.get('jsonUrl') || '').trim();
        const endDate = String(formData.get('endDate') || '').trim();
        const cityId = String(formData.get('cityId') || '').trim();

        if (!name || !jsonUrl || !endDate || !cityId) {
            setError('All fields are required');
            setIsSubmitting(false);
            return;
        }

        try {
            const res = await fetch('/api/admin/consultations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, jsonUrl, endDate, cityId })
            });

            if (!res.ok) {
                const data = await res.json();
                setError(data.error || 'Failed to create consultation');
                return;
            }

            form.reset();
            fetchConsultations();
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleToggle(id: string, isActive: boolean) {
        const res = await fetch(`/api/admin/consultations/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive })
        });

        if (!res.ok) {
            const data = await res.json();
            alert(`Error: ${data.error || 'Failed to update consultation'}`);
        }
        fetchConsultations();
    }

    async function handleDelete(id: string) {
        if (!confirm('Are you sure you want to delete this consultation? All comments will also be deleted.')) return;

        const res = await fetch(`/api/admin/consultations/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json();
            alert(`Error: ${data.error || 'Failed to delete consultation'}`);
            return;
        }

        fetchConsultations();
    }

    if (loading) {
        return <div className="p-6">Loading...</div>;
    }

    return (
        <div className="p-6 space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Consultations</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Manage public consultations for regulation documents
                </p>
            </div>

            {/* Create Form */}
            <Card>
                <CardHeader>
                    <CardTitle>Create Consultation</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div className="flex gap-4 items-end flex-wrap">
                            <div className="flex flex-col gap-2 flex-1 min-w-[12rem]">
                                <Label htmlFor="name">Name</Label>
                                <Input
                                    id="name"
                                    name="name"
                                    placeholder="e.g. Cooking Oil Collection Points"
                                    required
                                    disabled={isSubmitting}
                                />
                            </div>
                            <div className="flex flex-col gap-2 w-48">
                                <Label htmlFor="cityId">City</Label>
                                <select
                                    id="cityId"
                                    name="cityId"
                                    required
                                    disabled={isSubmitting}
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <option value="">Select city...</option>
                                    {cities.map((city) => (
                                        <option key={city.id} value={city.id}>
                                            {city.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-4 items-end flex-wrap">
                            <div className="flex flex-col gap-2 flex-1 min-w-[20rem]">
                                <Label htmlFor="jsonUrl">Regulation JSON URL</Label>
                                <Input
                                    id="jsonUrl"
                                    name="jsonUrl"
                                    placeholder="/regulation-cooking-oil.json or https://..."
                                    required
                                    disabled={isSubmitting}
                                />
                            </div>
                            <div className="flex flex-col gap-2 w-48">
                                <Label htmlFor="endDate">End Date</Label>
                                <Input
                                    id="endDate"
                                    name="endDate"
                                    type="datetime-local"
                                    required
                                    disabled={isSubmitting}
                                />
                            </div>
                            <Button type="submit" disabled={isSubmitting}>
                                {isSubmitting ? 'Creating...' : 'Create'}
                            </Button>
                        </div>
                    </form>
                    {error && (
                        <div className="mt-4 text-sm text-destructive bg-destructive/10 border border-destructive rounded px-3 py-2">
                            {error}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Consultations Table */}
            <Card>
                <CardHeader>
                    <CardTitle>All Consultations</CardTitle>
                </CardHeader>
                <CardContent>
                    {consultations.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No consultations yet.</p>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Name</TableHead>
                                    <TableHead>City</TableHead>
                                    <TableHead>End Date</TableHead>
                                    <TableHead>Comments</TableHead>
                                    <TableHead className="text-center">Active</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {consultations.map((c) => (
                                    <TableRow key={c.id}>
                                        <TableCell>
                                            <div>
                                                <span className="font-medium">{c.name}</span>
                                                <span className="block text-xs text-muted-foreground font-mono truncate max-w-xs">
                                                    {c.jsonUrl}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm">{c.city.name}</TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {new Date(c.endDate).toLocaleDateString('en-US', {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric',
                                                hour: '2-digit',
                                                minute: '2-digit'
                                            })}
                                        </TableCell>
                                        <TableCell className="text-sm">{c._count.comments}</TableCell>
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
                                                    onClick={() => window.open(`/${c.city.id}/consultation/${c.id}`, '_blank')}
                                                >
                                                    View
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
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
