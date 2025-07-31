import { useState, useCallback, useMemo } from 'react';
import { Transcript as TranscriptType } from '@/lib/db/transcript';
import { EditableSpeakerSegmentData } from '@/lib/db/speakerSegments';
import { useCouncilMeetingData } from '@/components/meetings/CouncilMeetingDataContext';
import { toast } from '@/hooks/use-toast';

export function useSpeakerSegmentEditor(segment: TranscriptType[number]) {
    const { updateSpeakerSegmentData } = useCouncilMeetingData();
    const [isEditMode, setIsEditMode] = useState(false);
    const [editedData, setEditedData] = useState<string>('');
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    // Extract editable data from segment
    const extractEditableData = useCallback((segment: TranscriptType[number]): EditableSpeakerSegmentData => {
        return {
            utterances: segment.utterances.map(u => ({
                id: u.id,
                text: u.text,
                startTimestamp: u.startTimestamp,
                endTimestamp: u.endTimestamp
            })),
            summary: segment.summary ? {
                text: segment.summary.text,
                type: segment.summary.type as 'procedural' | 'substantive'
            } : null
        };
    }, []);

    // Get the initial editable data as formatted JSON
    const initialEditableData = useMemo(() => {
        return JSON.stringify(extractEditableData(segment), null, 2);
    }, [segment, extractEditableData]);

    // Validate JSON structure and business rules
    const validateData = useCallback((jsonString: string): string[] => {
        const errors: string[] = [];

        try {
            const data = JSON.parse(jsonString) as EditableSpeakerSegmentData;

            // Check required structure
            if (!data.utterances || !Array.isArray(data.utterances)) {
                errors.push('Utterances must be an array');
                return errors;
            }

            if (data.utterances.length === 0) {
                errors.push('At least one utterance must remain');
                return errors;
            }

            // Validate each utterance
            data.utterances.forEach((utterance, index) => {
                if (!utterance.id || typeof utterance.id !== 'string') {
                    errors.push(`Utterance ${index + 1}: ID is required and must be a string`);
                }
                // if (!utterance.text || typeof utterance.text !== 'string') {
                //     errors.push(`Utterance ${index + 1}: Text is required and must be a string`);
                // }
                if (typeof utterance.startTimestamp !== 'number') {
                    errors.push(`Utterance ${index + 1}: startTimestamp must be a number`);
                }
                if (typeof utterance.endTimestamp !== 'number') {
                    errors.push(`Utterance ${index + 1}: endTimestamp must be a number`);
                }
                if (utterance.startTimestamp >= utterance.endTimestamp) {
                    errors.push(`Utterance ${index + 1}: startTimestamp must be less than endTimestamp`);
                }
            });

            // Validate summary if provided
            if (data.summary) {
                if (!data.summary.text || typeof data.summary.text !== 'string' || data.summary.text.trim().length === 0) {
                    errors.push('Summary text cannot be empty if summary is provided');
                }
                if (!['procedural', 'substantive'].includes(data.summary.type)) {
                    errors.push('Summary type must be either "procedural" or "substantive"');
                }
            }

        } catch (jsonError) {
            errors.push('Invalid JSON format');
        }

        return errors;
    }, []);

    // Enter edit mode
    const enterEditMode = useCallback(() => {
        setIsEditMode(true);
        setEditedData(initialEditableData);
        setValidationErrors([]);
    }, [initialEditableData]);

    // Cancel edit mode
    const cancelEdit = useCallback(() => {
        setIsEditMode(false);
        setEditedData('');
        setValidationErrors([]);
    }, []);

    // Update the edited data
    const updateEditedData = useCallback((newData: string) => {
        setEditedData(newData);
        // Clear validation errors when user is editing
        if (validationErrors.length > 0) {
            setValidationErrors([]);
        }
    }, [validationErrors.length]);

    // Save changes
    const saveChanges = useCallback(async () => {
        const errors = validateData(editedData);
        
        if (errors.length > 0) {
            setValidationErrors(errors);
            return;
        }

        setIsSaving(true);
        setValidationErrors([]);

        try {
            const data = JSON.parse(editedData) as EditableSpeakerSegmentData;
            await updateSpeakerSegmentData(segment.id, data);
            
            setIsEditMode(false);
            setEditedData('');
            
            toast({
                description: "Speaker segment updated successfully",
            });
        } catch (error) {
            console.error('Failed to save speaker segment data:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            setValidationErrors([`Save failed: ${errorMessage}`]);
            
            toast({
                variant: "destructive",
                description: "Failed to save changes",
            });
        } finally {
            setIsSaving(false);
        }
    }, [editedData, validateData, updateSpeakerSegmentData, segment.id]);

    return {
        isEditMode,
        editedData,
        validationErrors,
        isSaving,
        initialEditableData,
        actions: {
            enterEditMode,
            cancelEdit,
            updateEditedData,
            saveChanges,
            validateData
        }
    };
} 