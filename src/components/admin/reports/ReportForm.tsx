"use client";

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { startOfMonth, subMonths, endOfMonth } from 'date-fns';

const formSchema = z.object({
    cityId: z.string().min(1, 'Επιλέξτε δήμο'),
    startDate: z.date({ required_error: 'Απαιτείται ημερομηνία έναρξης' }),
    endDate: z.date({ required_error: 'Απαιτείται ημερομηνία λήξης' }),
    contractReference: z.string().min(1, 'Απαιτείται αριθμός σύμβασης'),
});

interface ReportFormProps {
    cities: Array<{ id: string; name: string; name_municipality: string }>;
    /** Map of cityId → most recent offer startDate (ISO string) */
    offerStartDates: Record<string, string>;
}

function getEndOfLastMonth(): Date {
    return endOfMonth(subMonths(startOfMonth(new Date()), 1));
}

export function ReportForm({ cities, offerStartDates }: ReportFormProps) {
    const [isGenerating, setIsGenerating] = useState(false);
    const { toast } = useToast();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            cityId: '',
            contractReference: '',
        },
    });

    function handleCityChange(cityId: string, fieldOnChange: (value: string) => void) {
        fieldOnChange(cityId);
        const offerStart = offerStartDates[cityId];
        if (offerStart) {
            form.setValue('startDate', new Date(offerStart));
        }
        form.setValue('endDate', getEndOfLastMonth());
    }

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsGenerating(true);
        try {
            const response = await fetch('/api/admin/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cityId: values.cityId,
                    startDate: values.startDate.toISOString(),
                    endDate: values.endDate.toISOString(),
                    contractReference: values.contractReference,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to generate report');
            }

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const disposition = response.headers.get('Content-Disposition');
            const filenameMatch = disposition?.match(/filename="(.+)"/);
            a.download = filenameMatch?.[1] || 'report.docx';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast({ title: 'Η αναφορά δημιουργήθηκε επιτυχώς' });
        } catch (error) {
            toast({
                title: 'Σφάλμα',
                description: error instanceof Error ? error.message : 'Αποτυχία δημιουργίας αναφοράς',
                variant: 'destructive',
            });
        } finally {
            setIsGenerating(false);
        }
    }

    return (
        <div className="max-w-2xl mx-auto p-6">
            <h1 className="text-2xl font-bold mb-6">Δημιουργία Αναφοράς Προόδου</h1>
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                        control={form.control}
                        name="cityId"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Δήμος</FormLabel>
                                <Select onValueChange={(v) => handleCityChange(v, field.onChange)} value={field.value}>
                                    <FormControl>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Επιλέξτε δήμο" />
                                        </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        {cities.map(city => (
                                            <SelectItem key={city.id} value={city.id}>
                                                {city.name_municipality}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="contractReference"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Αριθμός Σύμβασης</FormLabel>
                                <FormControl>
                                    <Input placeholder="π.χ. 12345/2025" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <div className="grid grid-cols-2 gap-6">
                        <FormField
                            control={form.control}
                            name="startDate"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Από</FormLabel>
                                    <Calendar
                                        mode="single"
                                        selected={field.value}
                                        onSelect={field.onChange}
                                        initialFocus
                                    />
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="endDate"
                            render={({ field }) => (
                                <FormItem className="flex flex-col">
                                    <FormLabel>Έως</FormLabel>
                                    <Calendar
                                        mode="single"
                                        selected={field.value}
                                        onSelect={field.onChange}
                                        disabled={(date) => {
                                            const start = form.getValues('startDate');
                                            return start ? date < start : false;
                                        }}
                                        initialFocus
                                    />
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <Button type="submit" disabled={isGenerating} className="w-full">
                        {isGenerating ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Δημιουργία...
                            </>
                        ) : (
                            <>
                                <Download className="mr-2 h-4 w-4" />
                                Δημιουργία Αναφοράς (.docx)
                            </>
                        )}
                    </Button>
                </form>
            </Form>
        </div>
    );
}
