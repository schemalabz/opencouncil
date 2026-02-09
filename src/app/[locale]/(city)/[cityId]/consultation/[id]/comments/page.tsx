import { Metadata } from "next";
import { getCityCached } from "@/lib/cache";
import { getConsultationById, getConsultationComments } from "@/lib/db/consultations";
import { notFound } from "next/navigation";
import { RegulationData } from "@/components/consultations/types";
import { auth } from "@/auth";
import { formatDate } from "@/lib/utils";
import { ExternalLink } from "lucide-react";
import PrintButton from "@/components/consultations/PrintButton";
import { env } from "@/env.mjs";

interface PageProps {
    params: { cityId: string; id: string };
}

async function fetchRegulationData(jsonUrl: string): Promise<RegulationData | null> {
    try {
        const response = await fetch(jsonUrl, { cache: 'no-store' });

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
    const [consultation, city] = await Promise.all([
        getConsultationById(params.cityId, params.id),
        getCityCached(params.cityId)
    ]);

    if (!consultation || !city) {
        return {
            title: "Σχόλια Διαβούλευσης | OpenCouncil",
            description: "Η διαβούλευση που ζητάτε δεν βρέθηκε ή δεν είναι διαθέσιμη.",
        };
    }

    const regulationData = await fetchRegulationData(consultation.jsonUrl);
    const title = regulationData?.title || consultation.name;

    return {
        title: `Σχόλια - ${title} | ${city.name} | OpenCouncil`,
        description: `Σύνοψη όλων των σχολίων για τη διαβούλευση "${title}" στον Δήμο ${city.name}.`,
        robots: {
            index: false, // Don't index the print page
            follow: false,
        }
    };
}

// Helper function to order comments by document appearance
function orderCommentsByDocumentStructure(
    comments: any[],
    regulationData: RegulationData
): { documentComments: any[], locationComments: any[] } {
    const documentComments: any[] = [];
    const locationComments: any[] = [];

    // Create ordering maps
    const chapterOrder = new Map<string, number>();
    const articleOrder = new Map<string, number>();
    const geosetOrder = new Map<string, number>();
    const geometryOrder = new Map<string, number>();

    let orderIndex = 0;

    // Build ordering for chapters and articles
    regulationData.regulation
        .filter(item => item.type === 'chapter')
        .forEach((chapter, chapterIndex) => {
            chapterOrder.set(chapter.id, chapterIndex);

            chapter.articles?.forEach((article, articleIndex) => {
                articleOrder.set(article.id, orderIndex++);
            });
        });

    // Build ordering for geosets and geometries
    regulationData.regulation
        .filter(item => item.type === 'geoset')
        .forEach((geoset, geosetIndex) => {
            geosetOrder.set(geoset.id, geosetIndex);

            geoset.geometries?.forEach((geometry, geometryIndex) => {
                geometryOrder.set(geometry.id, orderIndex++);
            });
        });

    // Separate and order comments
    comments.forEach(comment => {
        if (comment.entityType === 'CHAPTER' || comment.entityType === 'ARTICLE') {
            documentComments.push(comment);
        } else if (comment.entityType === 'GEOSET' || comment.entityType === 'GEOMETRY') {
            locationComments.push(comment);
        }
    });

    // Sort document comments by appearance order
    documentComments.sort((a, b) => {
        if (a.entityType === 'CHAPTER' && b.entityType === 'CHAPTER') {
            return (chapterOrder.get(a.entityId) || 0) - (chapterOrder.get(b.entityId) || 0);
        }
        if (a.entityType === 'ARTICLE' && b.entityType === 'ARTICLE') {
            return (articleOrder.get(a.entityId) || 0) - (articleOrder.get(b.entityId) || 0);
        }
        if (a.entityType === 'CHAPTER' && b.entityType === 'ARTICLE') {
            // Find which chapter contains the article
            const articleChapter = regulationData.regulation
                .filter(item => item.type === 'chapter')
                .find(chapter => chapter.articles?.some(article => article.id === b.entityId));

            const chapterOrderA = chapterOrder.get(a.entityId) || 0;
            const chapterOrderB = chapterOrder.get(articleChapter?.id || '') || 0;

            if (chapterOrderA !== chapterOrderB) {
                return chapterOrderA - chapterOrderB;
            }
            // If same chapter, chapter comment comes first
            return -1;
        }
        if (a.entityType === 'ARTICLE' && b.entityType === 'CHAPTER') {
            // Find which chapter contains the article
            const articleChapter = regulationData.regulation
                .filter(item => item.type === 'chapter')
                .find(chapter => chapter.articles?.some(article => article.id === a.entityId));

            const chapterOrderA = chapterOrder.get(articleChapter?.id || '') || 0;
            const chapterOrderB = chapterOrder.get(b.entityId) || 0;

            if (chapterOrderA !== chapterOrderB) {
                return chapterOrderA - chapterOrderB;
            }
            // If same chapter, chapter comment comes first
            return 1;
        }
        return 0;
    });

    // Sort location comments by appearance order
    locationComments.sort((a, b) => {
        if (a.entityType === 'GEOSET' && b.entityType === 'GEOSET') {
            return (geosetOrder.get(a.entityId) || 0) - (geosetOrder.get(b.entityId) || 0);
        }
        if (a.entityType === 'GEOMETRY' && b.entityType === 'GEOMETRY') {
            return (geometryOrder.get(a.entityId) || 0) - (geometryOrder.get(b.entityId) || 0);
        }
        if (a.entityType === 'GEOSET' && b.entityType === 'GEOMETRY') {
            // Find which geoset contains the geometry
            const geometryGeoset = regulationData.regulation
                .filter(item => item.type === 'geoset')
                .find(geoset => geoset.geometries?.some(geometry => geometry.id === b.entityId));

            const geosetOrderA = geosetOrder.get(a.entityId) || 0;
            const geosetOrderB = geosetOrder.get(geometryGeoset?.id || '') || 0;

            if (geosetOrderA !== geosetOrderB) {
                return geosetOrderA - geosetOrderB;
            }
            // If same geoset, geoset comment comes first
            return -1;
        }
        if (a.entityType === 'GEOMETRY' && b.entityType === 'GEOSET') {
            // Find which geoset contains the geometry
            const geometryGeoset = regulationData.regulation
                .filter(item => item.type === 'geoset')
                .find(geoset => geoset.geometries?.some(geometry => geometry.id === a.entityId));

            const geosetOrderA = geosetOrder.get(geometryGeoset?.id || '') || 0;
            const geosetOrderB = geosetOrder.get(b.entityId) || 0;

            if (geosetOrderA !== geosetOrderB) {
                return geosetOrderA - geosetOrderB;
            }
            // If same geoset, geoset comment comes first
            return 1;
        }
        return 0;
    });

    return { documentComments, locationComments };
}

// Helper function to get entity details for display
function getEntityDetails(entityType: string, entityId: string, regulationData: RegulationData) {
    switch (entityType) {
        case 'CHAPTER': {
            const chapter = regulationData.regulation
                .filter(item => item.type === 'chapter')
                .find(chapter => chapter.id === entityId);

            return {
                type: 'κεφάλαιο',
                title: chapter?.title || 'Άγνωστο κεφάλαιο',
                number: chapter?.num,
                parentContext: null
            };
        }
        case 'ARTICLE': {
            for (const chapter of regulationData.regulation.filter(item => item.type === 'chapter')) {
                const article = chapter.articles?.find(article => article.id === entityId);
                if (article) {
                    return {
                        type: 'άρθρο',
                        title: article.title,
                        number: article.num,
                        parentContext: `κεφάλαιο ${chapter.num}`
                    };
                }
            }
            return {
                type: 'άρθρο',
                title: 'Άγνωστο άρθρο',
                number: null,
                parentContext: null
            };
        }
        case 'GEOSET': {
            const geoset = regulationData.regulation
                .filter(item => item.type === 'geoset')
                .find(geoset => geoset.id === entityId);

            return {
                type: 'γεωγραφικό σύνολο',
                title: geoset?.name || 'Άγνωστο σύνολο περιοχών',
                number: null,
                parentContext: null
            };
        }
        case 'GEOMETRY': {
            for (const geoset of regulationData.regulation.filter(item => item.type === 'geoset')) {
                const geometry = geoset.geometries?.find(geometry => geometry.id === entityId);
                if (geometry) {
                    return {
                        type: 'τοποθεσία',
                        title: geometry.name,
                        number: null,
                        parentContext: `γεωγραφικό σύνολο &quot;${geoset.name}&quot;`
                    };
                }
            }
            return {
                type: 'τοποθεσία',
                title: 'Άγνωστη περιοχή',
                number: null,
                parentContext: null
            };
        }
        default:
            return {
                type: 'στοιχείο',
                title: 'Άγνωστο στοιχείο',
                number: null,
                parentContext: null
            };
    }
}

export default async function CommentsPage({ params }: PageProps) {
    const [city, consultation, session] = await Promise.all([
        getCityCached(params.cityId),
        getConsultationById(params.cityId, params.id),
        auth()
    ]);

    if (!city) {
        notFound();
    }

    // Check if consultations are enabled for this city
    if (!(city as any).consultationsEnabled) {
        notFound();
    }

    if (!consultation) {
        console.error(`Consultation not found: ${params.id}`);
        notFound();
    }

    // Fetch regulation data and comments in parallel
    const [regulationData, comments] = await Promise.all([
        fetchRegulationData(consultation.jsonUrl),
        getConsultationComments(params.id, params.cityId, session)
    ]);

    if (!regulationData) {
        notFound();
    }

    // Order comments by document structure
    const { documentComments, locationComments } = orderCommentsByDocumentStructure(comments, regulationData);

    const currentDate = new Date();
    const consultationUrl = `/${params.cityId}/consultation/${params.id}`;

    return (
        <div className="min-h-screen bg-white">
            {/* Header - visible on screen only */}
            <div className="print:hidden bg-gray-50 border-b p-4">
                <div className="max-w-4xl mx-auto flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">Σχόλια Διαβούλευσης</h1>
                        <p className="text-sm text-gray-600">{regulationData.title}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <a
                            href={consultationUrl}
                            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                        >
                            <ExternalLink className="h-4 w-4" />
                            Επιστροφή στη Διαβούλευση
                        </a>
                        <PrintButton />
                    </div>
                </div>
            </div>

            {/* Main content */}
            <div className="max-w-4xl mx-auto p-6 print:p-8">
                {/* Document header */}
                <div className="text-center mb-8 print:mb-12">
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">
                        Σύνοψη Διαβούλευσης
                    </h1>
                    <h2 className="text-xl text-gray-700 mb-4">
                        {regulationData.title}
                    </h2>
                    <div className="text-sm text-gray-600 space-y-1">
                        <p>{city.name_municipality}</p>
                        <p>Συνολικά {comments.length} σχόλια</p>
                        <p>Εκτυπώθηκε στις {formatDate(currentDate)}</p>
                    </div>
                </div>

                {/* Document comments section */}
                {documentComments.length > 0 && (
                    <div className="mb-12">
                        <h2 className="text-lg font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-300">
                            Σχόλια στα κεφάλαια και άρθρα της κανονιστικής ({documentComments.length})
                        </h2>

                        <div className="space-y-6">
                            {documentComments.map((comment, index) => {
                                const entityDetails = getEntityDetails(comment.entityType, comment.entityId, regulationData);

                                return (
                                    <div key={comment.id} className="border-l-4 border-blue-200 pl-4">
                                        <div className="text-sm font-medium text-gray-900 mb-2">
                                            Στο {entityDetails.type} {entityDetails.number && `${entityDetails.number} `}
                                            {entityDetails.parentContext && `(${entityDetails.parentContext})`},
                                            ο χρήστης <span className="font-semibold">{comment.user.name || 'Ανώνυμος'}</span> στις{' '}
                                            {formatDate(new Date(comment.createdAt))}:
                                        </div>
                                        <div
                                            className="text-gray-700 prose prose-sm max-w-none"
                                            dangerouslySetInnerHTML={{ __html: comment.body }}
                                        />
                                        {index < documentComments.length - 1 && (
                                            <div className="mt-4 border-b border-gray-100"></div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Location comments section */}
                {locationComments.length > 0 && (
                    <div className={documentComments.length > 0 ? "print:break-before-page" : ""}>
                        <h2 className="text-lg font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-300">
                            Σχόλια σε γεωγραφικές τοποθεσίες ({locationComments.length})
                        </h2>

                        <div className="space-y-6">
                            {locationComments.map((comment, index) => {
                                const entityDetails = getEntityDetails(comment.entityType, comment.entityId, regulationData);

                                return (
                                    <div key={comment.id} className="border-l-4 border-green-200 pl-4">
                                        <div className="text-sm font-medium text-gray-900 mb-2">
                                            Στη {entityDetails.type} &quot;{entityDetails.title}&quot;
                                            {entityDetails.parentContext && ` του ${entityDetails.parentContext}`},
                                            ο χρήστης <span className="font-semibold">{comment.user.name || 'Ανώνυμος'}</span> στις{' '}
                                            {formatDate(new Date(comment.createdAt))}:
                                        </div>
                                        <div
                                            className="text-gray-700 prose prose-sm max-w-none"
                                            dangerouslySetInnerHTML={{ __html: comment.body }}
                                        />
                                        {index < locationComments.length - 1 && (
                                            <div className="mt-4 border-b border-gray-100"></div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* No comments message */}
                {comments.length === 0 && (
                    <div className="text-center py-12">
                        <p className="text-gray-500">Δεν έχουν υποβληθεί σχόλια σε αυτή τη διαβούλευση.</p>
                    </div>
                )}

                {/* Footer */}
                <div className="mt-12 pt-6 border-t border-gray-200 text-xs text-gray-500">
                    <p>
                        Αυτή η αναφορά δημιουργήθηκε από το OpenCouncil ({env.NEXTAUTH_URL}).
                        Για ερωτήσεις και τεχνική υποστήριξη: {env.NEXT_PUBLIC_CONTACT_EMAIL} ή {env.NEXT_PUBLIC_CONTACT_PHONE}
                    </p>
                </div>
            </div>
        </div>
    );
} 