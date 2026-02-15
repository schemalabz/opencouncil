'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, ExternalLink, Pencil, Check, X } from 'lucide-react';

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
    const [isUploading, setIsUploading] = useState(false);
    const [editingUrlId, setEditingUrlId] = useState<string | null>(null);
    const [editingUrlValue, setEditingUrlValue] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const jsonUrlInputRef = useRef<HTMLInputElement>(null);

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

    async function uploadJsonFile(file: File): Promise<string | null> {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
        });

        if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Upload failed');
        }

        const data = await res.json();
        return data.url;
    }

    async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.name.endsWith('.json')) {
            setError('Please select a JSON file');
            return;
        }

        setIsUploading(true);
        setError(null);

        try {
            const url = await uploadJsonFile(file);
            if (url && jsonUrlInputRef.current) {
                jsonUrlInputRef.current.value = url;
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setIsUploading(false);
            // Reset file input
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }

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

    async function handleUpdateUrl(id: string, newUrl: string) {
        const res = await fetch(`/api/admin/consultations/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonUrl: newUrl })
        });

        if (!res.ok) {
            const data = await res.json();
            alert(`Error: ${data.error || 'Failed to update URL'}`);
        } else {
            setEditingUrlId(null);
            fetchConsultations();
        }
    }

    async function handleUploadAndUpdateUrl(id: string, file: File) {
        setIsUploading(true);
        try {
            const url = await uploadJsonFile(file);
            if (url) {
                await handleUpdateUrl(id, url);
            }
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setIsUploading(false);
        }
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
                                <div className="flex gap-2">
                                    <Input
                                        ref={jsonUrlInputRef}
                                        id="jsonUrl"
                                        name="jsonUrl"
                                        placeholder="Upload a file or paste a URL..."
                                        required
                                        disabled={isSubmitting || isUploading}
                                    />
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept=".json"
                                        className="hidden"
                                        onChange={handleFileUpload}
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="icon"
                                        disabled={isSubmitting || isUploading}
                                        onClick={() => fileInputRef.current?.click()}
                                        title="Upload JSON file to S3"
                                    >
                                        <Upload className="h-4 w-4" />
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Upload a .json file to S3, or paste a URL directly.
                                </p>
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
                            <Button type="submit" disabled={isSubmitting || isUploading}>
                                {isUploading ? 'Uploading...' : isSubmitting ? 'Creating...' : 'Create'}
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
                                    <TableHead>JSON URL</TableHead>
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
                                            <span className="font-medium">{c.name}</span>
                                        </TableCell>
                                        <TableCell className="text-sm">{c.city.name}</TableCell>
                                        <TableCell className="text-sm max-w-xs">
                                            {editingUrlId === c.id ? (
                                                <div className="flex items-center gap-1">
                                                    <Input
                                                        value={editingUrlValue}
                                                        onChange={(e) => setEditingUrlValue(e.target.value)}
                                                        className="h-7 text-xs"
                                                    />
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 w-7 p-0"
                                                        onClick={() => handleUpdateUrl(c.id, editingUrlValue)}
                                                    >
                                                        <Check className="h-3 w-3" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 w-7 p-0"
                                                        onClick={() => setEditingUrlId(null)}
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                    <input
                                                        type="file"
                                                        accept=".json"
                                                        className="hidden"
                                                        id={`upload-${c.id}`}
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (file) handleUploadAndUpdateUrl(c.id, file);
                                                        }}
                                                    />
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-7 w-7 p-0"
                                                        disabled={isUploading}
                                                        onClick={() => document.getElementById(`upload-${c.id}`)?.click()}
                                                        title="Upload new JSON"
                                                    >
                                                        <Upload className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1 group">
                                                    <a
                                                        href={c.jsonUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs font-mono text-muted-foreground hover:text-foreground truncate max-w-[200px] inline-block"
                                                        title={c.jsonUrl}
                                                    >
                                                        {c.jsonUrl}
                                                    </a>
                                                    <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        onClick={() => {
                                                            setEditingUrlId(c.id);
                                                            setEditingUrlValue(c.jsonUrl);
                                                        }}
                                                        title="Edit URL"
                                                    >
                                                        <Pencil className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            )}
                                        </TableCell>
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
