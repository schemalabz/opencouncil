"use client";
import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { HighlightWithUtterances } from '@/lib/db/highlights';
import { useCouncilMeetingData } from './CouncilMeetingDataContext';
import { toast } from '@/hooks/use-toast';
import Combobox from '@/components/Combobox';

interface HighlightDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  highlight?: HighlightWithUtterances | null;
  onSave: (name: string, subjectId?: string) => Promise<void>;
  mode: 'create' | 'edit';
}

export function HighlightDialog({ 
  open, 
  onOpenChange, 
  highlight, 
  onSave, 
  mode 
}: HighlightDialogProps) {
  const { subjects } = useCouncilMeetingData();
  const [name, setName] = useState('');
  const [selectedSubject, setSelectedSubject] = useState<{ id: string; name: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Reset form when dialog opens/closes or highlight changes
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && highlight) {
        setName(highlight.name);
        const connectedSubject = highlight.subjectId ? subjects.find(s => s.id === highlight.subjectId) : null;
        setSelectedSubject(connectedSubject ? { id: connectedSubject.id, name: connectedSubject.name } : null);
      } else {
        setName('');
        setSelectedSubject(null);
      }
    }
  }, [open, mode, highlight, subjects]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: "Error",
        description: "Please enter a highlight name.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      await onSave(name, selectedSubject?.id);
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to save highlight:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Create New Highlight' : 'Edit Highlight'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Name Input */}
          <div className="space-y-2">
            <Label htmlFor="highlight-name">Highlight Name</Label>
            <Input
              id="highlight-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter highlight name"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
            />
          </div>

          {/* Subject Selection */}
          <div className="space-y-2">
            <Label>Connected Subject</Label>
            
            <Combobox
              items={subjects}
              value={selectedSubject}
              onChange={setSelectedSubject}
              placeholder="Select a subject (optional)"
              searchPlaceholder="Search subjects..."
              getItemLabel={(subject) => subject.name}
              getItemValue={(subject) => subject.id}
              clearable={true}
              emptyMessage="No subjects found"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? 'Saving...' : (mode === 'create' ? 'Create Highlight' : 'Save Changes')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 