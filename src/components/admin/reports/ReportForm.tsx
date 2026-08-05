"use client";

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { startOfMonth, subMonths, endOfMonth, addMonths, subDays, isSameDay, format } from 'date-fns';
import { monthsBetween } from '@/lib/utils';
import { Loader2, Download } from 'lucide-react';
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
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';

const formSchema = z.object({
    cityId: z.string().min(1, 'Επιλέξτε δήμο'),
    dateRange: z.object({
        from: z.date(),
        to: z.date(),
    }, { required_error: 'Επιλέξτε περίοδο' }),
    contractReference: z.string().min(1, 'Απαιτείται αριθμός σύμβασης'),
});

/** The offer a report is about: its coverage period and ΑΔΑΜ (ISO date strings). */
export interface ReportContract {
    startDate: string;
    endDate: string;
    adam: string | null;
}

interface ReportFormProps {
    cities: Array<{ id: string; name: string; name_municipality: string }>;
    /** Map of cityId → the contract the report is about */
    contracts: Record<string, ReportContract>;
}

function getEndOfLastMonth(): Date {
    return endOfMonth(subMonths(startOfMonth(new Date()), 1));
}

type HalfYear = { label: string; from: Date; to: Date };

/**
 * The contract's period split into six-month chunks. Contracts are usually a
 * year (two halves) but not always — the last chunk is clipped to the
 * contract's end date, so a 9-month contract yields a full and a 3-month one.
 */
function getHalfYears(contract: ReportContract): HalfYear[] {
    const start = new Date(contract.startDate);
    const end = new Date(contract.endDate);
    const halves: HalfYear[] = [];

    for (let i = 0; i < 20; i++) {
        const from = addMonths(start, i * 6);
        if (from > end) break;
        const nextStart = addMonths(start, (i + 1) * 6);
        const to = nextStart > end ? end : subDays(nextStart, 1);
        halves.push({ label: `${i + 1}ο εξάμηνο`, from, to });
    }

    return halves;
}

export function ReportForm({ cities, contracts }: ReportFormProps) {
    const [isGenerating, setIsGenerating] = useState(false);
    const { toast } = useToast();

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            cityId: '',
            contractReference: '',
        },
    });

    const selectedCityId = form.watch('cityId');
    const selectedContract = contracts[selectedCityId];
    const halfYears = selectedContract ? getHalfYears(selectedContract) : [];

    function handleCityChange(cityId: string, fieldOnChange: (value: string) => void) {
        fieldOnChange(cityId);
        const contract = contracts[cityId];
        if (contract) {
            form.setValue('dateRange', {
                from: new Date(contract.startDate),
                to: getEndOfLastMonth(),
            });
        }
        form.setValue('contractReference', contract?.adam ?? '');
    }

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setIsGenerating(true);
        try {
            const response = await fetch('/api/admin/reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cityId: values.cityId,
                    startDate: format(values.dateRange.from, 'yyyy-MM-dd'),
                    endDate: format(values.dateRange.to, 'yyyy-MM-dd'),
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
                                    <Input placeholder="π.χ. 25SYMV01234567" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="dateRange"
                        render={({ field }) => (
                            <FormItem className="flex flex-col">
                                <FormLabel>Περίοδος</FormLabel>
                                <FormControl>
                                    <DateRangePicker
                                        value={field.value}
                                        onChange={(range) => {
                                            if (range?.from) {
                                                field.onChange({ from: range.from, to: range.to ?? range.from });
                                            }
                                        }}
                                    />
                                </FormControl>
                                {halfYears.length > 0 && (
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {halfYears.map(half => {
                                            const isSelected = !!field.value?.from && !!field.value?.to
                                                && isSameDay(field.value.from, half.from)
                                                && isSameDay(field.value.to, half.to);
                                            return (
                                                <Button
                                                    key={half.label}
                                                    type="button"
                                                    variant={isSelected ? 'default' : 'outline'}
                                                    size="sm"
                                                    onClick={() => field.onChange({ from: half.from, to: half.to })}
                                                >
                                                    {half.label}
                                                    <span className="ml-2 text-xs opacity-70">
                                                        {format(half.from, 'dd/MM/yy')} – {format(half.to, 'dd/MM/yy')}
                                                    </span>
                                                </Button>
                                            );
                                        })}
                                    </div>
                                )}
                                {field.value?.from && field.value?.to && (
                                    <p className="text-xs text-muted-foreground">
                                        {monthsBetween(field.value.from, field.value.to)} μήνες
                                    </p>
                                )}
                                <FormMessage />
                            </FormItem>
                        )}
                    />

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
