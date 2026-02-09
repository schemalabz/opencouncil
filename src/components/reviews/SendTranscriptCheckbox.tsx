'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

interface SendTranscriptCheckboxProps {
  contactEmails: string[];
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  administrativeBodyName?: string | null;
  separatorClassName?: string;
}

export function SendTranscriptCheckbox({
  contactEmails,
  checked,
  onCheckedChange,
  administrativeBodyName,
  separatorClassName = 'my-2',
}: SendTranscriptCheckboxProps) {
  const t = useTranslations('reviews.completeDialog');
  const id = useId();

  if (contactEmails.length === 0) {
    return null;
  }

  return (
    <>
      <Separator className={separatorClassName} />
      <div className="p-4 border rounded-lg space-y-3">
        <div className="flex items-start space-x-2">
          <Checkbox
            id={id}
            checked={checked}
            onCheckedChange={(value) => onCheckedChange(value === true)}
          />
          <div className="grid gap-1.5 leading-none">
            <Label
              htmlFor={id}
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
            >
              {t('sendTranscript.label')}
            </Label>
            <p className="text-sm text-muted-foreground">
              {t('sendTranscript.help', {
                emails: contactEmails.join(', '),
                bodyName: administrativeBodyName ?? '',
              })}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
