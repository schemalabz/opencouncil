'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2 } from 'lucide-react';

const revalidateSchema = z.object({
    tags: z.array(z.string()).optional(),
    paths: z.array(z.object({
        path: z.string(),
        type: z.enum(['page', 'layout']).optional()
    })).optional()
});

type RevalidateFormData = z.infer<typeof revalidateSchema>;

export function CacheRevalidationForm() {
    const { toast } = useToast();
    const [isLoading, setIsLoading] = useState(false);
    const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<RevalidateFormData>({
        resolver: zodResolver(revalidateSchema),
        defaultValues: {
            tags: [''],
            paths: [{ path: '', type: 'page' }]
        }
    });

    const tags = watch('tags') || [''];
    const paths = watch('paths') || [{ path: '', type: 'page' }];

    const addTag = () => {
        setValue('tags', [...tags, '']);
    };

    const removeTag = (index: number) => {
        setValue('tags', tags.filter((_, i) => i !== index));
    };

    const addPath = () => {
        setValue('paths', [...paths, { path: '', type: 'page' }]);
    };

    const removePath = (index: number) => {
        setValue('paths', paths.filter((_, i) => i !== index));
    };

    const onSubmit = async (data: RevalidateFormData) => {
        setIsLoading(true);
        try {
            const response = await fetch('/api/revalidate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    tags: data.tags?.filter(tag => tag.trim() !== ''),
                    paths: data.paths?.filter(path => path.path.trim() !== '')
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to revalidate cache');
            }

            const result = await response.json();
            toast({
                title: "Cache Revalidated",
                description: `Successfully revalidated ${result.tags?.length || 0} tags and ${result.paths?.length || 0} paths.`,
            });
        } catch (error) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to revalidate cache",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Tags to Revalidate</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {tags.map((_, index) => (
                            <div key={index} className="flex gap-2 items-center">
                                <div className="flex-1">
                                    <Input
                                        {...register(`tags.${index}`)}
                                        placeholder="Enter tag (e.g., city:123)"
                                    />
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeTag(index)}
                                    disabled={tags.length === 1}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                        <Button
                            type="button"
                            variant="outline"
                            onClick={addTag}
                            className="w-full"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Tag
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Paths to Revalidate</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {paths.map((_, index) => (
                            <div key={index} className="flex gap-2 items-center">
                                <div className="flex-1">
                                    <Input
                                        {...register(`paths.${index}.path`)}
                                        placeholder="Enter path (e.g., /123/meetings)"
                                    />
                                </div>
                                <select
                                    {...register(`paths.${index}.type`)}
                                    className="h-10 px-3 py-2 border rounded-md"
                                >
                                    <option value="page">Page</option>
                                    <option value="layout">Layout</option>
                                </select>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removePath(index)}
                                    disabled={paths.length === 1}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                        <Button
                            type="button"
                            variant="outline"
                            onClick={addPath}
                            className="w-full"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            Add Path
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? 'Revalidating...' : 'Revalidate Cache'}
            </Button>
        </form>
    );
} 