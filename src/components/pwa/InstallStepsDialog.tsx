"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { MoreVertical, Share, SquarePlus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { InstallPlatform } from "@/lib/pwa/install";

interface InstallStepsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    platform: InstallPlatform;
}

/**
 * The install steps for a browser without an install event: the share sheet
 * on iOS, the browser menu on other Android browsers. Rendered outside the
 * account menu, which unmounts its items when it closes.
 */
export default function InstallStepsDialog({ open, onOpenChange, platform }: InstallStepsDialogProps) {
    const t = useTranslations("pwa.install");
    const steps = platform === 'ios'
        ? [
            { icon: Share, text: t('iosStep1') },
            { icon: SquarePlus, text: t('iosStep2') },
            { icon: SquarePlus, text: t('iosStep3') },
        ]
        : [
            { icon: MoreVertical, text: t('androidStep1') },
            { icon: SquarePlus, text: t('androidStep2') },
        ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100%-2rem)] max-w-[340px] gap-0 rounded-2xl p-6 pt-7">
                <Image
                    src="/logo.png"
                    alt=""
                    width={56}
                    height={56}
                    className="h-14 w-14 rounded-xl border bg-white object-contain p-2"
                />
                <DialogTitle className="mt-4 text-base font-semibold leading-snug">
                    {t('title')}
                </DialogTitle>
                <DialogDescription className="mt-1 text-[13px]">
                    {t('subtitle')}
                </DialogDescription>
                <ol className="mt-5 grid w-full grid-cols-[1.5rem_1rem_minmax(0,1fr)] items-center gap-x-3 gap-y-3 rounded-xl bg-muted p-4 text-left">
                    {steps.map(({ icon: Icon, text }, index) => (
                        <li key={text} className="contents">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-background text-[11px] font-bold tabular-nums">
                                {index + 1}
                            </span>
                            <Icon className="h-4 w-4 text-[hsl(var(--orange))]" aria-hidden="true" />
                            <span className="text-[13px] leading-snug">{text}</span>
                        </li>
                    ))}
                </ol>
            </DialogContent>
        </Dialog>
    );
}
