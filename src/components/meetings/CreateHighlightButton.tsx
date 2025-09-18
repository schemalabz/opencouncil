"use client";

import { Button } from '@/components/ui/button';
import { Star, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
    const t = useTranslations('highlights');

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
                    title: t('toasts.highlightCreated'),
                    description: t('toasts.highlightCreatedDescription'),
                    variant: "default",
                });
            },
            onError: (error) => {
                toast({
                    title: t('common.error'),
                    description: t('toasts.generationError'),
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
        if (isCreating) return t('buttons.creating');
        if (isEditing) return t('buttons.currentlyEditing');
        return children || (
            <>
                <Star className="h-5 w-5 mr-2" />
                {t('buttons.createHighlight')}
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
