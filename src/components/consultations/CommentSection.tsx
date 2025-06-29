"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MessageCircle, ChevronDown, LogIn } from "lucide-react";
import { cn } from "@/lib/utils";

// Dynamically import ReactQuill to avoid SSR issues
const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });

interface CommentSectionProps {
    entityType: 'chapter' | 'article' | 'geoset' | 'geometry';
    entityId: string;
    entityTitle: string;
    contactEmail?: string;
    className?: string;
    initialOpen?: boolean;
}

export default function CommentSection({
    entityType,
    entityId,
    entityTitle,
    contactEmail,
    className,
    initialOpen = false
}: CommentSectionProps) {
    const { data: session, status } = useSession();
    const [isOpen, setIsOpen] = useState(initialOpen);
    const [comment, setComment] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const getEntityTypeLabel = (type: string) => {
        switch (type) {
            case 'chapter':
                return 'το κεφάλαιο';
            case 'article':
                return 'το άρθρο';
            case 'geoset':
                return 'το σύνολο περιοχών';
            case 'geometry':
                return 'την περιοχή';
            default:
                return 'το στοιχείο';
        }
    };

    const getEntityTypeLabelGenitive = (type: string) => {
        switch (type) {
            case 'chapter':
                return 'κεφαλαίου';
            case 'article':
                return 'άρθρου';
            case 'geoset':
                return 'συνόλου περιοχών';
            case 'geometry':
                return 'περιοχής';
            default:
                return 'στοιχείου';
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!comment.trim() || !session) return;

        setIsSubmitting(true);
        try {
            // Show the markdown content in an alert for now
            alert(`Markdown Content:\n\n${comment}\n\n---\n\nSubmitting for: ${getEntityTypeLabel(entityType)} "${entityTitle}"\nUser: ${session.user?.email}\nContact: ${contactEmail}`);

            // Simulate API call
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Clear form on success
            setComment("");
        } catch (error) {
            console.error('Error submitting comment:', error);
            alert("Υπήρξε σφάλμα κατά την υποβολή του σχολίου. Παρακαλώ δοκιμάστε ξανά.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleLoginRedirect = () => {
        // This would redirect to login page
        window.location.href = '/sign-in';
    };

    const commentCount = 0; // TODO: Replace with actual comment count

    return (
        <Card className={cn("mt-4", className)}>
            <Collapsible open={isOpen} onOpenChange={setIsOpen}>
                <CollapsibleTrigger className="w-full">
                    <div className="flex items-center justify-between w-full hover:bg-muted/50 rounded-md p-4 transition-colors">
                        <div className="flex items-center gap-2">
                            <MessageCircle className="h-4 w-4" style={{ color: 'hsl(var(--orange))' }} />
                            <span className="text-md font-bold">
                                Σχόλια {getEntityTypeLabelGenitive(entityType)} {commentCount > 0 && `(${commentCount})`}
                            </span>
                        </div>
                        <ChevronDown className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform",
                            isOpen && "rotate-180"
                        )} />
                    </div>
                </CollapsibleTrigger>

                <CollapsibleContent className="px-4 pb-4">
                    <div className="space-y-4">
                        {/* Existing Comments Placeholder */}
                        {commentCount === 0 ? (
                            <div className="text-center py-6 text-muted-foreground">
                                <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">
                                    Δεν υπάρχουν σχόλια για αυτό {getEntityTypeLabel(entityType)} ακόμα.
                                </p>
                                <p className="text-xs mt-1">
                                    Γίνετε ο πρώτος που θα σχολιάσει!
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {/* TODO: Render existing comments here */}
                                <div className="text-sm text-muted-foreground text-center py-2">
                                    Τα υπάρχοντα σχόλια θα εμφανιστούν εδώ
                                </div>
                            </div>
                        )}

                        {/* Comment Form */}
                        <div className="border-t pt-4">
                            {status === "loading" ? (
                                <div className="text-center py-4">
                                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                                </div>
                            ) : session ? (
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div>
                                        <div className="border rounded-md">
                                            <ReactQuill
                                                value={comment}
                                                onChange={setComment}
                                                placeholder="Γράψτε το σχόλιό σας εδώ..."
                                                theme="snow"
                                                modules={{
                                                    toolbar: [
                                                        ['bold', 'italic'],
                                                        ['link']
                                                    ]
                                                }}
                                                style={{
                                                    minHeight: '150px',
                                                    border: 'none'
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        <div className="bg-muted/50 p-4 rounded-lg">
                                            <p className="text-xs text-muted-foreground leading-relaxed">
                                                <strong className="font-medium text-foreground">Σημαντικό:</strong> To σχόλιο σας θα είναι <span className="text-foreground font-medium">δημόσια ορατό</span> με το όνομα σας (<span className="text-foreground font-medium">{session.user.name}</span>), και θα σταλεί στο
                                                email του δήμου με εσάς σε CC, οπότε και θα μοιραστούμε τη διεύθυνση email σας και το όνομα σας με το δήμο.
                                                <br />
                                                <span className="text-orange-600 mt-1 block">
                                                    Θα μπορείτε να διαγράψετε το σχόλιο σας, αλλά όχι το email που θα έχει ήδη σταλεί στο δήμο.
                                                </span>
                                            </p>
                                        </div>

                                        <div className="flex justify-end">
                                            <Button
                                                type="submit"
                                                disabled={!comment.trim() || isSubmitting}
                                                className="w-full md:w-auto md:min-w-[250px] h-auto py-3"
                                            >
                                                {isSubmitting ? (
                                                    <>
                                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                                        <span>Υποβολή...</span>
                                                    </>
                                                ) : (
                                                    <span className="whitespace-nowrap">Δημοσιεύση και αποστολή στο δήμο</span>
                                                )}
                                            </Button>
                                        </div>
                                    </div>
                                </form>
                            ) : (
                                <div className="text-center py-6 space-y-4">
                                    <div className="text-muted-foreground">
                                        <LogIn className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                        <p className="text-sm">
                                            Συνδεθείτε για να αφήσετε σχόλιο για αυτό το {getEntityTypeLabel(entityType)}
                                        </p>
                                    </div>
                                    <div className="flex items-center justify-center">
                                        <Button
                                            onClick={handleLoginRedirect}
                                            variant="default"
                                            size="sm"
                                            className="flex items-center gap-2"
                                        >
                                            <LogIn className="h-4 w-4" />
                                            Συνδεθείτε
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </Card>
    );
} 