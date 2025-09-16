"use client";

import { Button } from '@/components/ui/button';
import { Star, Loader2 } from 'lucide-react';
import { useHighlight } from './HighlightContext';
import { useTranscriptOptions } from './options/OptionsContext';
import { toast } from '@/hooks/use-toast';

interface CreateHighlightButtonProps {
    className?: string;
    preSelectedUtteranceId?: string;
    variant?: "icon" | "full";
    size?: "sm" | "default" | "lg";
    children?: React.ReactNode;
}

export function CreateHighlightButton({ 
    className, 
    preSelectedUtteranceId,
    variant = "icon",
    size = "default",
    children
}: CreateHighlightButtonProps) {
    const { createHighlight, isCreating, editingHighlight } = useHighlight();
    const { options } = useTranscriptOptions();
    const canEdit = options.editsAllowed;

    if (!canEdit) {
        return null;
    }

    const isEditing = Boolean(editingHighlight);
    const isDisabled = isCreating || isEditing;

    // Hide the icon button when editing, but show the full button
    if (variant === "icon" && isEditing) {
        return null;
    }

    const handleCreateHighlight = async () => {
        if (isDisabled) return;
        
        await createHighlight({
            preSelectedUtteranceId,
            onSuccess: (highlight) => {
                toast({
                    title: "Highlight Created",
                    description: "Start selecting utterances to build your highlight.",
                    variant: "default",
                });
            },
            onError: (error) => {
                toast({
                    title: "Error",
                    description: "Failed to create highlight. Please try again.",
                    variant: "destructive",
                });
            }
        });
    };

    const buttonProps = {
        onClick: handleCreateHighlight,
        disabled: isDisabled,
        className: className || '',
    };

    const getButtonText = () => {
        if (isCreating) return "Creating highlight...";
        if (isEditing) return "Currently editing a highlight";
        return children || (
            <>
                <Star className="h-5 w-5 mr-2" />
                Δημιουργήστε ένα νέο Highlight
            </>
        );
    };

    if (variant === "icon") {
        return (
            <Button
                {...buttonProps}
                variant="ghost"
                size="icon"
                className={`w-9 h-9 rounded-full hover:bg-accent transition-colors shrink-0 ${
                    isEditing ? 'opacity-50 cursor-not-allowed' : ''
                } ${buttonProps.className}`}
                title={isEditing ? "Currently editing a highlight" : "Create a new highlight"}
            >
                {isCreating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                    <Star className="h-4 w-4" />
                )}
            </Button>
        );
    }

    return (
        <Button
            {...buttonProps}
            variant="default"
            size={size}
            className={`w-full ${
                isEditing ? 'opacity-50 cursor-not-allowed' : ''
            } ${buttonProps.className}`}
            title={isEditing ? "Currently editing a highlight" : "Create a new highlight"}
        >
            {isCreating ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
                getButtonText()
            )}
        </Button>
    );
}
