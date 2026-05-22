// Dispatcher for the 4 story OG templates. The route handler calls renderStoryTemplate
// after slicing subjects to the top N — templates themselves do no filtering or splitting.

import type React from "react";
import type { StoryTemplate, StoryTemplateProps } from "./types";
import { renderClassicStory } from "./classic";
import { renderDarkStory } from "./dark";
import { renderCardsStory } from "./cards";
import { renderColorfulStory } from "./colorful";

export type { StoryTemplate, StoryTemplateProps, StorySubject } from "./types";

export const STORY_TEMPLATE_IDS: readonly StoryTemplate[] = ["classic", "dark", "cards", "colorful"] as const;

export function isValidStoryTemplate(value: unknown): value is StoryTemplate {
    return typeof value === "string" && (STORY_TEMPLATE_IDS as readonly string[]).includes(value);
}

export function renderStoryTemplate(template: StoryTemplate, props: StoryTemplateProps): React.ReactElement {
    switch (template) {
        case "dark":
            return renderDarkStory(props);
        case "cards":
            return renderCardsStory(props);
        case "colorful":
            return renderColorfulStory(props);
        case "classic":
        default:
            return renderClassicStory(props);
    }
}
