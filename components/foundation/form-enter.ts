export type FormEnterIntent = "ignore" | "block" | "native-submit" | "modifier-submit";

export function classifyFormEnter(input: {
  key: string;
  isComposing: boolean;
  defaultPrevented: boolean;
  isTextarea: boolean;
  isSingleLineInput: boolean;
  isSubmitButton: boolean;
  modifier: boolean;
  submitOnEnter: boolean;
  insideExpandedControl: boolean;
}): FormEnterIntent {
  if (input.key !== "Enter") return "ignore";
  if (input.isComposing) return "block";
  if (input.defaultPrevented || input.insideExpandedControl) return "ignore";
  if (input.isTextarea) return input.modifier ? "modifier-submit" : "ignore";
  if (input.modifier) return "modifier-submit";
  if (!input.isSingleLineInput && !input.isSubmitButton) return "ignore";
  return input.submitOnEnter ? "native-submit" : "block";
}
