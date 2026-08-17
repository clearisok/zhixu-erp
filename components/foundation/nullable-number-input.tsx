"use client";

import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";

type NullableNumber = number | null;

function parseDraft(draft: string): NullableNumber {
  if (draft.trim() === "") return null;
  const parsed = Number(draft);
  return Number.isFinite(parsed) ? parsed : null;
}

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: NullableNumber;
  onValueChange: (value: NullableNumber) => void;
};

export function NullableNumberInput({ value, onValueChange, onFocus, onBlur, ...props }: Props) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const editing = useRef(false);

  useEffect(() => {
    if (!editing.current) setDraft(value === null ? "" : String(value));
  }, [value]);

  return <input
    {...props}
    type="text"
    inputMode="decimal"
    value={draft}
    onFocus={(event) => { editing.current = true; onFocus?.(event); }}
    onBlur={(event) => {
      editing.current = false;
      const parsed = parseDraft(draft);
      setDraft(parsed === null ? "" : String(parsed));
      onBlur?.(event);
    }}
    onChange={(event) => {
      const next = event.target.value;
      if (!/^\d*(?:\.\d*)?$/.test(next)) return;
      setDraft(next);
      onValueChange(parseDraft(next));
    }}
  />;
}
