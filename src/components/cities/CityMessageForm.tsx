import { useState, useEffect, useCallback } from 'react'
import { CityMessage } from '@prisma/client'
import { MessageSquare, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useTranslations } from 'next-intl'
import { IconInput } from "@/components/admin/icon-input"

// Message state type based on Prisma CityMessage but with additional form fields
export type MessageFormState = Omit<CityMessage, 'id' | 'cityId' | 'createdAt' | 'updatedAt'> & {
    hasMessage: boolean;
};

// Default state for message form
const DEFAULT_MESSAGE_STATE: MessageFormState = {
    hasMessage: false,
    emoji: '',
    title: '',
    description: '',
    callToActionText: null,
    callToActionUrl: null,
    callToActionExternal: false,
    isActive: true
};

interface CityMessageFormProps {
    existingMessage?: CityMessage | null;
    onMessageChange?: (messageData: MessageFormState) => void;
}

export default function CityMessageForm({ existingMessage, onMessageChange }: CityMessageFormProps) {
    const t = useTranslations('CityForm.CityMessageForm')
    const [isOpen, setIsOpen] = useState(false);

    // Message state using Prisma type with form additions
    const [messageState, setMessageState] = useState<MessageFormState>(DEFAULT_MESSAGE_STATE);

    // Initialize message state from existing message prop
    useEffect(() => {
        const newState = existingMessage ? {
            ...DEFAULT_MESSAGE_STATE,
            hasMessage: true,
            emoji: existingMessage.emoji,
            title: existingMessage.title,
            description: existingMessage.description,
            callToActionText: existingMessage.callToActionText,
            callToActionUrl: existingMessage.callToActionUrl,
            callToActionExternal: existingMessage.callToActionExternal,
            isActive: existingMessage.isActive
        } : DEFAULT_MESSAGE_STATE;

        setMessageState(newState);
    }, [existingMessage]);

    // Helper function to update message state and notify parent
    const updateMessageState = useCallback((updates: Partial<MessageFormState>) => {
        const newState = { ...messageState, ...updates };
        setMessageState(newState);
        onMessageChange?.(newState);
    }, [messageState, onMessageChange]);

    return (
        <Collapsible
            open={isOpen}
            onOpenChange={setIsOpen}
            className="space-y-2"
        >
            <div className="flex items-center justify-between space-x-4 px-4">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    {t('sectionTitle')}
                </h4>
                <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="w-9 p-0">
                        {isOpen ? (
                            <ChevronUp className="h-4 w-4" />
                        ) : (
                            <ChevronDown className="h-4 w-4" />
                        )}
                        <span className="sr-only">{t('toggle')}</span>
                    </Button>
                </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="space-y-4 px-4">
                <div className="text-sm text-muted-foreground">
                    {existingMessage
                        ? t('currentMessageStatus', {
                            status: existingMessage.isActive ? t('statusActive') : t('statusInactive')
                          })
                        : t('noMessageSet')
                    }
                </div>

                <div className="flex items-center space-x-2">
                    <Checkbox
                        id="has-message"
                        checked={messageState.hasMessage}
                        onCheckedChange={(checked) => updateMessageState({ hasMessage: checked === true })}
                    />
                    <label htmlFor="has-message" className="text-sm font-medium">
                        {t('enableMessage')}
                    </label>
                </div>

                {messageState.hasMessage && (
                    <>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('icon')}</label>
                            <IconInput
                                value={messageState.emoji}
                                onChange={(value) => updateMessageState({ emoji: value })}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('title')}</label>
                            <Input
                                placeholder={t('titlePlaceholder')}
                                value={messageState.title}
                                onChange={(e) => updateMessageState({ title: e.target.value })}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('description')}</label>
                            <textarea
                                placeholder={t('descriptionPlaceholder')}
                                value={messageState.description}
                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateMessageState({ description: e.target.value })}
                                rows={3}
                                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('callToAction')}</label>
                            <Input
                                placeholder={t('callToActionPlaceholder')}
                                value={messageState.callToActionText || ''}
                                onChange={(e) => updateMessageState({ callToActionText: e.target.value || null })}
                            />
                            {messageState.callToActionText && (
                                <>
                                    <Input
                                        placeholder={t('urlPlaceholder')}
                                        value={messageState.callToActionUrl || ''}
                                        onChange={(e) => updateMessageState({ callToActionUrl: e.target.value || null })}
                                    />
                                    <div className="flex items-center space-x-2">
                                        <Checkbox
                                            id="external-link"
                                            checked={messageState.callToActionExternal}
                                            onCheckedChange={(checked) => updateMessageState({ callToActionExternal: checked === true })}
                                        />
                                        <label htmlFor="external-link" className="text-sm">
                                            {t('externalLink')}
                                        </label>
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="flex items-center space-x-2">
                            <Checkbox
                                id="message-active"
                                checked={messageState.isActive}
                                onCheckedChange={(checked) => updateMessageState({ isActive: checked === true })}
                            />
                            <label htmlFor="message-active" className="text-sm">
                                {t('activeLabel')}
                            </label>
                        </div>
                        {!messageState.isActive && (
                            <div className="text-xs text-muted-foreground">
                                {t('inactiveDescription')}
                            </div>
                        )}
                    </>
                )}
            </CollapsibleContent>
        </Collapsible>
    );
}
