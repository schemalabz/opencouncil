import { Metadata } from "next";
import { getCityCached } from "@/lib/cache";
import { getConsultationById } from "@/lib/db/consultations";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, FileText, MapPin, MessageSquare, ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import ReactMarkdown from 'react-markdown';
import { formatConsultationEndDate } from "@/lib/utils/date";

interface PageProps {
    params: { cityId: string; id: string };
}

interface RegulationData {
    title: string;
    contactEmail?: string;
    regulation: RegulationItem[];
}

interface RegulationItem {
    type: 'chapter' | 'geoset';
    id: string;
    title?: string;
    name?: string;
    summary?: string;
    description?: string;
    preludeBody?: string;
    articles?: Article[];
    geometries?: any[];
}

interface Article {
    num: number;
    id: string;
    title: string;
    summary?: string;
    body: string;
}

async function fetchRegulationData(jsonUrl: string): Promise<RegulationData | null> {
    try {
        // Handle relative URLs by prepending the base URL
        const url = jsonUrl.startsWith('http') ? jsonUrl : `${process.env.NEXTAUTH_URL || 'http://localhost:3000'}${jsonUrl}`;
        const response = await fetch(url, { cache: 'no-store' });

        if (!response.ok) {
            console.error(`Failed to fetch regulation data: ${response.status}`);
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching regulation data:', error);
        return null;
    }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const consultation = await getConsultationById(params.cityId, params.id);

    if (!consultation) {
        return {
            title: "Διαβούλευση δεν βρέθηκε | OpenCouncil",
        };
    }

    return {
        title: `${consultation.name} | OpenCouncil`,
        description: `Διαβούλευση για ${consultation.name}`,
    };
}

function ChapterView({ chapter }: { chapter: RegulationItem }) {
    if (!chapter.articles) return null;

    return (
        <div className="space-y-6">
            <div className="border-b border-border pb-4">
                <h2 className="text-2xl font-bold mb-2">
                    Κεφάλαιο {chapter.type === 'chapter' ? '' : ''}{chapter.title || chapter.name}
                </h2>
                {chapter.summary && (
                    <p className="text-muted-foreground mb-4">{chapter.summary}</p>
                )}
                {chapter.preludeBody && (
                    <div className="prose prose-sm max-w-none">
                        <ReactMarkdown>{chapter.preludeBody}</ReactMarkdown>
                    </div>
                )}
            </div>

            <div className="space-y-4">
                {chapter.articles.map((article) => (
                    <ArticleView key={article.id} article={article} />
                ))}
            </div>
        </div>
    );
}

function ArticleView({ article }: { article: Article }) {
    return (
        <Collapsible defaultOpen>
            <CollapsibleTrigger className="flex items-center justify-between w-full p-4 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="text-left">
                    <h3 className="font-semibold">Άρθρο {article.num}: {article.title}</h3>
                    {article.summary && (
                        <p className="text-sm text-muted-foreground mt-1">{article.summary}</p>
                    )}
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform data-[state=closed]:rotate-[-90deg]" />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-4 py-4">
                <div className="prose prose-sm max-w-none">
                    <ReactMarkdown>{article.body}</ReactMarkdown>
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

export default async function ConsultationPage({ params }: PageProps) {
    const [city, consultation] = await Promise.all([
        getCityCached(params.cityId),
        getConsultationById(params.cityId, params.id)
    ]);

    if (!city) {
        notFound();
    }

    // Check if consultations are enabled for this city
    if (!(city as any).consultationsEnabled) {
        notFound();
    }

    if (!consultation) {
        notFound();
    }

    // Fetch regulation data
    const regulationData = await fetchRegulationData(consultation.jsonUrl);

    return (
        <div className="container mx-auto px-4 py-6 md:py-8 max-w-4xl">
            {/* Consultation Header */}
            <div className="mb-6 md:mb-8">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
                    <div className="flex-1">
                        <h1 className="text-2xl md:text-3xl font-bold mb-2">
                            {regulationData?.title || consultation.name}
                        </h1>
                        <p className="text-base md:text-lg text-muted-foreground">
                            Διαβούλευση για κανονισμό
                        </p>
                    </div>
                    <Badge
                        variant={consultation.isActive ? "default" : "secondary"}
                        className="shrink-0 self-start"
                    >
                        {consultation.isActive ? "Ενεργή" : "Ανενεργή"}
                    </Badge>
                </div>

                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                        <CalendarDays className="h-4 w-4" />
                        <span>
                            Λήγει: {formatConsultationEndDate(consultation.endDate)}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <MessageSquare className="h-4 w-4" />
                        <span>0 σχόλια</span>
                    </div>
                </div>
            </div>

            {/* Regulation Content */}
            {regulationData ? (
                <div className="space-y-8">
                    {regulationData.regulation
                        .filter(item => item.type === 'chapter')
                        .map((chapter) => (
                            <ChapterView key={chapter.id} chapter={chapter} />
                        ))}
                </div>
            ) : (
                <Card>
                    <CardContent className="p-6">
                        <div className="text-center py-8">
                            <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                            <h3 className="text-lg font-semibold mb-2">Δεν ήταν δυνατή η φόρτωση του κανονισμού</h3>
                            <p className="text-muted-foreground">
                                Υπάρχει πρόβλημα με τη φόρτωση του περιεχομένου από: {consultation.jsonUrl}
                            </p>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Future Features Preview */}
            <div className="mt-8 p-4 md:p-6 bg-muted/30 rounded-lg border-2 border-dashed border-muted-foreground/20">
                <h3 className="text-lg font-semibold mb-2">🚧 Επερχόμενες Λειτουργίες</h3>
                <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Διαδραστικός χάρτης με γεωγραφικές περιοχές</li>
                    <li>• Σύστημα αναφορών {`{REF:id}`} που συνδέει κείμενο με χάρτη</li>
                    <li>• Δυνατότητα σχολιασμού σε άρθρα και γεωγραφικές περιοχές</li>
                    <li>• Σύστημα ψηφοφορίας για σχόλια πολιτών</li>
                </ul>
            </div>
        </div>
    );
} 