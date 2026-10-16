"use client";

import * as React from "react";
import { FormMessage as BaseFormMessage } from "../../../packages/ui/src/form";
import { useValidationMessage } from "@/hooks/useLocalizedValidation";

export * from "../../../packages/ui/src/form";

/** The message of a form field, in the language of the reader. */
export const FormMessage = React.forwardRef<
    HTMLParagraphElement,
    React.ComponentPropsWithoutRef<typeof BaseFormMessage>
>((props, ref) => {
    const validationMessage = useValidationMessage();
    return <BaseFormMessage ref={ref} formatError={validationMessage} {...props} />;
});
FormMessage.displayName = "FormMessage";
