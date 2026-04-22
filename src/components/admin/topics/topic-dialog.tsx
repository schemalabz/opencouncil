"use client";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useEffect, useState } from "react";
import { Topic } from "@prisma/client";
import { toast } from "@/hooks/use-toast";
import { IconInput, isValidIconName } from "@/components/admin/icon-input";
import { Sparkles } from "lucide-react";
import { HEX_REGEX, suggestDistinctColor } from "@/lib/utils/colorSuggestion";

interface TopicDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    topic?: Topic;
    existingColors: string[];
    onSaved: () => void;
}
const NONE_ICON = "__none__";

export function TopicDialog({ open, onOpenChange, topic, existingColors, onSaved }: TopicDialogProps) {
    const isEditing = !!topic;
    const [loading, setLoading] = useState(false);

    const [name, setName] = useState("");
    const [nameEn, setNameEn] = useState("");
    const [colorHex, setColorHex] = useState("#4f46e5");
    const [icon, setIcon] = useState<string>(NONE_ICON);
    const [iconInput, setIconInput] = useState("");
    const [description, setDescription] = useState("");
    const [deprecated, setDeprecated] = useState(false);
    const [suggestedHistory, setSuggestedHistory] = useState<string[]>([]);

    useEffect(() => {
        if (open) {
            setName(topic?.name ?? "");
            setNameEn(topic?.name_en ?? "");
            setColorHex(topic?.colorHex ?? "#4f46e5");
            const topicIcon = topic?.icon ?? NONE_ICON;
            setIcon(topicIcon);
            setIconInput(topicIcon === NONE_ICON ? "" : topicIcon);
            setDescription(topic?.description ?? "");
            setDeprecated(topic?.deprecated ?? false);
            setSuggestedHistory([]);
        }
    }, [open, topic]);

    function onManualColorChange(value: string) {
        setColorHex(value);
        setSuggestedHistory([]);
    }

    function onSuggestColor() {
        const suggestion = suggestDistinctColor([...existingColors, ...suggestedHistory, colorHex]);
        setColorHex(suggestion);
        setSuggestedHistory((prev) => [...prev, suggestion]);
    }

    function onIconInputChange(value: string) {
        setIconInput(value);
        if (isValidIconName(value)) {
            setIcon(value);
        } else if (value === "") {
            setIcon(NONE_ICON);
        }
    }

    async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();

        if (!name.trim() || !nameEn.trim()) {
            toast({
                title: "Validation error",
                description: "Name (Greek) and name (English) are required.",
                variant: "destructive",
            });
            return;
        }

        if (!HEX_REGEX.test(colorHex)) {
            toast({
                title: "Validation error",
                description: "Color must be a valid hex code, e.g. #4f46e5.",
                variant: "destructive",
            });
            return;
        }

        if (iconInput && !isValidIconName(iconInput)) {
            toast({
                title: "Validation error",
                description: `"${iconInput}" is not a valid Lucide icon name.`,
                variant: "destructive",
            });
            return;
        }

        setLoading(true);

        const payload = {
            name: name.trim(),
            name_en: nameEn.trim(),
            colorHex,
            icon: icon === NONE_ICON ? null : icon,
            description: description.trim(),
            deprecated,
        };

        try {
            const url = isEditing ? `/api/admin/topics/${topic!.id}` : "/api/admin/topics";
            const response = await fetch(url, {
                method: isEditing ? "PUT" : "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => null);
                throw new Error(errorData?.error || "Failed to save topic");
            }

            toast({
                title: "Success",
                description: isEditing ? "Topic updated." : "Topic created.",
            });

            onSaved();
            onOpenChange(false);
        } catch (error) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to save topic",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[560px]">
                <DialogHeader>
                    <DialogTitle>{isEditing ? "Edit topic" : "Create topic"}</DialogTitle>
                    <DialogDescription>
                        Topics are categories assigned to subjects. The description is passed to the LLM
                        during summarization to help it classify subjects correctly.
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={onSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Name (Greek)</Label>
                            <Input
                                id="name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="name_en">Name (English)</Label>
                            <Input
                                id="name_en"
                                value={nameEn}
                                onChange={(e) => setNameEn(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="colorHex">Color</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    id="colorHex"
                                    type="text"
                                    value={colorHex}
                                    onChange={(e) => onManualColorChange(e.target.value)}
                                    placeholder="#4f46e5"
                                    required
                                />
                                <input
                                    type="color"
                                    value={HEX_REGEX.test(colorHex) ? colorHex : "#4f46e5"}
                                    onChange={(e) => onManualColorChange(e.target.value)}
                                    className="h-9 w-9 cursor-pointer rounded border border-input"
                                    aria-label="Color picker"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    className="h-9 w-9 shrink-0"
                                    onClick={onSuggestColor}
                                    title="Suggest a distinct color"
                                    aria-label="Suggest a distinct color"
                                >
                                    <Sparkles className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="icon">Icon</Label>
                            <IconInput
                                value={iconInput}
                                onChange={onIconInputChange}
                                color={colorHex}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={5}
                            placeholder="Describe which subjects the LLM should classify under this topic."
                        />
                        <p className="text-xs text-muted-foreground">
                            Used as guidance for the LLM when classifying subjects into this topic.
                        </p>
                    </div>

                    <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
                        <div className="space-y-1">
                            <Label htmlFor="deprecated">Deprecated</Label>
                            <p className="text-xs text-muted-foreground">
                                Deprecated topics are never passed to the task API. Existing subjects keep
                                their topic assignment, but the LLM will no longer classify new subjects
                                into this topic.
                            </p>
                        </div>
                        <Switch
                            id="deprecated"
                            checked={deprecated}
                            onCheckedChange={setDeprecated}
                        />
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {loading ? "Saving..." : isEditing ? "Save changes" : "Create topic"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
