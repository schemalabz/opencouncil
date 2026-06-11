// Entry point for the story templates: re-exports types/metadata and provides the
// dispatcher used by the OG route. Each template lives in its own file (classic, dark,
// cards, colorful). Shared building blocks live in `shared.tsx`.

import type React from "react";
import type { StoryTemplateId } from "../story-template-meta";
import type { PreviewData } from "./types";
import { Template1Classic } from "./classic";
import { Template2Dark } from "./dark";
import { Template3WithCards } from "./cards";
import { Template4Colorful } from "./colorful";

export type { StoryTemplateId } from "../story-template-meta";
export { STORY_TEMPLATES, isValidStoryTemplate } from "../story-template-meta";
export type { PreviewSubject, PreviewData } from "./types";

export function renderStoryTemplate(template: StoryTemplateId, data: PreviewData): React.ReactElement {
    switch (template) {
        case "DARK":
            return Template2Dark(data);
        case "CARDS":
            return Template3WithCards(data);
        case "COLORFUL":
            return Template4Colorful(data);
        case "CLASSIC":
        default:
            return Template1Classic(data);
    }
}
