"use client";

import { Button } from '@/components/ui/button';
import { Clapperboard, Loader2 } from 'lucide-react';
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
    const canCreateHighlight = options.canCreateHighlights;
    const t = useTranslations('highlights');

    // Do not render if overall editing (structural) is active
    if (options.editable) {
        return null;
    }

    if (!canCreateHighlight) {
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
                <Clapperboard className="h-5 w-5 mr-2" />
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
                className={`h-9 w-9 lg:w-auto lg:px-3 gap-1.5 rounded-full text-foreground/80 transition-colors hover:bg-foreground/[0.06] hover:text-foreground shrink-0 ${
                    isEditing ? 'opacity-50 cursor-not-allowed' : ''
                } ${buttonProps.className}`}
                title={isEditing ? t('buttons.currentlyEditing') : t('buttons.createHighlight')}
            >
                {isCreating ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                ) : (
                    <Clapperboard className="h-4 w-4 shrink-0" />
                )}
                <span className="hidden text-sm lg:inline">{t('buttons.highlightShort')}</span>
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
            title={isEditing ? t('buttons.currentlyEditing') : t('buttons.createHighlight')}
        >
            {isCreating ? (
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            ) : (
                getButtonText()
            )}
        </Button>
    );
}
