"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { MessageCircle, ChevronDown, LogIn, ChevronUp, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConsultationCommentWithUpvotes } from "@/lib/db/consultations";

// Dynamically import ReactQuill to avoid SSR issues
const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });

interface CommentSectionProps {
    entityType: 'chapter' | 'article' | 'geoset' | 'geometry';
    entityId: string;
    entityTitle: string;
    consultationId?: string;
    cityId?: string;
    comments?: ConsultationCommentWithUpvotes[];
    contactEmail?: string;
    className?: string;
    initialOpen?: boolean;
}

export default function CommentSection({
    entityType,
    entityId,
    entityTitle,
    consultationId,
    cityId,
    comments: initialComments,
    contactEmail,
    className,
    initialOpen = false
}: CommentSectionProps) {
    const { data: session, status } = useSession();
    const [isOpen, setIsOpen] = useState(initialOpen);
    const [comment, setComment] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [comments, setComments] = useState(initialComments || []);
    const [upvoting, setUpvoting] = useState<string | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);

    // Debug logging (can be removed in production)
    // console.log('Session:', session);
    // console.log('Comments:', comments);
    // console.log('Current user ID:', session?.user?.id);

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
        if (!comment.trim() || !session || !consultationId || !cityId) return;

        setIsSubmitting(true);
        try {
            const response = await fetch(`/api/consultations/${consultationId}/comments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    cityId,
                    entityType: entityType.toUpperCase(),
                    entityId,
                    body: comment
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to submit comment');
            }

            const { comment: newComment } = await response.json();

            // Add the new comment to the list
            const commentWithUpvotes = {
                ...newComment,
                user: {
                    id: session.user.id,
                    name: session.user.name
                },
                upvoteCount: 0,
                hasUserUpvoted: false
            };

            setComments(prev => [commentWithUpvotes, ...prev]);
            setComment("");
        } catch (error) {
            console.error('Error submitting comment:', error);
            alert(error instanceof Error ? error.message : "Υπήρξε σφάλμα κατά την υποβολή του σχολίου. Παρακαλώ δοκιμάστε ξανά.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleUpvote = async (commentId: string) => {
        if (!session || upvoting) return;

        // console.log('Upvoting comment:', commentId, 'User:', session?.user?.id);

        setUpvoting(commentId);
        try {
            const response = await fetch(`/api/consultations/comments/${commentId}/upvote`, {
                method: 'POST',
            });

            if (!response.ok) {
                throw new Error('Failed to toggle upvote');
            }

            const { upvoted, upvoteCount } = await response.json();
            // console.log('Upvote response:', { upvoted, upvoteCount });

            // Update the comment in the list
            setComments(prev => prev.map(comment => {
                if (comment.id === commentId) {
                    const updated = { ...comment, upvoteCount, hasUserUpvoted: upvoted };
                    // console.log('Updated comment:', updated);
                    return updated;
                }
                return comment;
            }));
        } catch (error) {
            console.error('Error toggling upvote:', error);
            alert("Υπήρξε σφάλμα. Παρακαλώ δοκιμάστε ξανά.");
        } finally {
            setUpvoting(null);
        }
    };

    const handleDelete = async (commentId: string) => {
        if (!session || deleting) return;

        // Confirm deletion
        if (!confirm("Είστε σίγουροι ότι θέλετε να διαγράψετε αυτό το σχόλιο;")) {
            return;
        }

        // console.log('Deleting comment:', commentId, 'User:', session?.user?.id);

        setDeleting(commentId);
        try {
            const response = await fetch(`/api/consultations/comments/${commentId}/delete`, {
                method: 'DELETE',
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to delete comment');
            }

            // Remove the comment from the list
            setComments(prev => prev.filter(comment => comment.id !== commentId));
        } catch (error) {
            console.error('Error deleting comment:', error);
            alert(error instanceof Error ? error.message : "Υπήρξε σφάλμα κατά τη διαγραφή του σχολίου.");
        } finally {
            setDeleting(null);
        }
    };

    const handleLoginRedirect = () => {
        // This would redirect to login page
        window.location.href = '/sign-in';
    };

    const commentCount = comments?.filter(c =>
        c.entityType.toLowerCase() === entityType.toLowerCase() && c.entityId === entityId
    ).length || 0;

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
                        {/* Existing Comments */}
                        {commentCount === 0 ? (
                            <div className="text-center py-6 text-muted-foreground">
                                <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">
                                    Δεν υπάρχουν σχόλια για αυτό {getEntityTypeLabel(entityType)} ακόμα.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-0">
                                {comments
                                    ?.filter(c => c.entityType.toLowerCase() === entityType.toLowerCase() && c.entityId === entityId)
                                    .map((comment, index) => {
                                        // console.log('Rendering comment:', comment.id, 'hasUserUpvoted:', comment.hasUserUpvoted, 'upvoteCount:', comment.upvoteCount);
                                        return (
                                            <div key={comment.id}>
                                                {index > 0 && <div className="border-t border-border my-4" />}
                                                <div className="flex items-start gap-3 py-3">
                                                    {/* Upvote Section */}
                                                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className={cn(
                                                                "h-6 w-6 p-0",
                                                                comment.hasUserUpvoted ? "text-[hsl(var(--orange))]" : "text-muted-foreground"
                                                            )}
                                                            onClick={() => handleUpvote(comment.id)}
                                                            disabled={!session || upvoting === comment.id}
                                                        >
                                                            {upvoting === comment.id ? (
                                                                <div className="animate-spin rounded-full h-3 w-3 border-b border-current"></div>
                                                            ) : (
                                                                <ChevronUp className="h-4 w-4" />
                                                            )}
                                                        </Button>
                                                        <span className={cn(
                                                            "text-xs font-medium",
                                                            comment.hasUserUpvoted ? "text-[hsl(var(--orange))]" : "text-muted-foreground"
                                                        )}>
                                                            {comment.upvoteCount}
                                                        </span>
                                                    </div>

                                                    {/* Comment Content */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-medium text-sm">
                                                                    {comment.user.name || 'Ανώνυμος'}
                                                                </span>
                                                                <span className="text-xs text-muted-foreground">
                                                                    {new Date(comment.createdAt).toLocaleDateString('el-GR', {
                                                                        day: 'numeric',
                                                                        month: 'short',
                                                                        year: 'numeric',
                                                                        hour: '2-digit',
                                                                        minute: '2-digit'
                                                                    })}
                                                                </span>
                                                            </div>

                                                            {/* Delete Button - only show for comment author */}
                                                            {session?.user?.id === comment.userId && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                                                    onClick={() => handleDelete(comment.id)}
                                                                    disabled={deleting === comment.id}
                                                                    title="Διαγραφή σχολίου"
                                                                >
                                                                    {deleting === comment.id ? (
                                                                        <div className="animate-spin rounded-full h-3 w-3 border-b border-current"></div>
                                                                    ) : (
                                                                        <Trash2 className="h-3 w-3" />
                                                                    )}
                                                                </Button>
                                                            )}
                                                        </div>
                                                        <div
                                                            className="prose prose-sm max-w-none text-sm"
                                                            dangerouslySetInnerHTML={{ __html: comment.body }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                            </div>
                        )}

                        {/* Comment Form */}
                        <div className="border-t pt-4">
                            {!consultationId || !cityId ? (
                                <div className="text-center py-4 text-muted-foreground">
                                    <p className="text-sm">Τα σχόλια δεν είναι διαθέσιμα για αυτή τη σελίδα.</p>
                                </div>
                            ) : status === "loading" ? (
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
                                                <strong className="font-medium text-foreground">Πώς λειτουργεί:</strong> To σχόλιο σας θα είναι <span className="text-foreground font-medium">δημόσια ορατό</span> με το όνομα σας (<span className="text-foreground font-medium">{session.user.name}</span>), και θα σταλεί στο
                                                email του δήμου με εσάς σε CC, οπότε και θα μοιραστούμε τη διεύθυνση email σας και το όνομα σας με το δήμο. Θα μπορείτε να διαγράψετε το σχόλιο σας, αλλά όχι το email που θα έχει ήδη σταλεί στο δήμο.
                                                <br />
                                                <span className="text-orange-600 mt-1 block">
                                                    Αν εκπροσωπείτε κάποιο φορέα, μπορείτε να κάνετε καινούργιο λογαριασμό για τον οργανισμό σας.
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