"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type InputHTMLAttributes } from "react";

export const NumberPrecisionContext = createContext<{ valid(draft: string): boolean; unsafe(id: string, unsafe: boolean): void } | null>(null);

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
  const precision = useContext(NumberPrecisionContext);
  const precisionId = useId();
  useEffect(() => () => precision?.unsafe(precisionId, false), [precision, precisionId]);
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
      if (precision && !precision.valid(draft)) { onBlur?.(event); return; }
      const parsed = parseDraft(draft);
      setDraft(parsed === null ? "" : String(parsed));
      onBlur?.(event);
    }}
    onChange={(event) => {
      const next = event.target.value;
      if (!/^\d*(?:\.\d*)?$/.test(next)) return;
      setDraft(next);
      if (precision) {
        const valid = precision.valid(next);
        precision.unsafe(precisionId, !valid);
        if (!valid) return;
      }
      onValueChange(parseDraft(next));
    }}
  />;
}
