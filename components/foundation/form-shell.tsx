"use client";

import { createContext, forwardRef, useContext, useRef, useState, type FormEvent, type FormHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";
import { classifyFormEnter } from "./form-enter";

const FormSubmittingContext = createContext(false);
export const useFormSubmitting = () => useContext(FormSubmittingContext);

export const FormShell = forwardRef<HTMLFormElement, Omit<FormHTMLAttributes<HTMLFormElement>, "onSubmit"> & {
  children: ReactNode;
  onSubmit: () => void | Promise<void>;
  submitOnEnter?: boolean;
  submitOnModifierEnter?: boolean;
}>(function FormShell({ children, onSubmit, submitOnEnter = true, submitOnModifierEnter = true, onKeyDown, ...props }, ref) {
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Portal dialogs remain React descendants of the editor form. Their submit
    // must not also invoke the outer aggregate save while an attachment is busy.
    event.stopPropagation();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onSubmit();
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented && event.key !== "Enter") return;
    const target = event.target as HTMLElement;
    const intent = classifyFormEnter({
      key: event.key,
      isComposing: event.nativeEvent.isComposing,
      defaultPrevented: event.defaultPrevented,
      isTextarea: target.tagName === "TEXTAREA",
      isSingleLineInput: target.tagName === "INPUT",
      isSubmitButton: target instanceof HTMLButtonElement && target.type === "submit",
      modifier: submitOnModifierEnter && (event.ctrlKey || event.metaKey),
      submitOnEnter,
      insideExpandedControl: Boolean(target.closest('[data-enter-scope="consume"][data-open="true"]')),
    });
    if (intent === "block") event.preventDefault();
    if (intent === "native-submit") {
      event.preventDefault();
      event.currentTarget.requestSubmit(target instanceof HTMLButtonElement ? target : undefined);
    }
    if (intent === "modifier-submit") {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  };

  return <FormSubmittingContext.Provider value={submitting}>
    <form {...props} ref={ref} aria-busy={submitting} onSubmit={submit} onKeyDown={handleKeyDown}>{children}</form>
  </FormSubmittingContext.Provider>;
});
