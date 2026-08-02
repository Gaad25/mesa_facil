"use client";

import {
  useEffect,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from "react";

type EditableNumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "value" | "defaultValue" | "onChange" | "min" | "max"
> & {
  value: number;
  min?: number;
  max?: number;
  onValueChange: (value: number) => void;
};

function boundedValue(value: number, min?: number, max?: number) {
  return Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, value));
}

export function EditableNumberInput({
  value,
  min,
  max,
  onValueChange,
  onBlur,
  onFocus,
  onKeyDown,
  ...inputProps
}: EditableNumberInputProps) {
  const [draft, setDraft] = useState(() => String(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [editing, value]);

  const commit = () => {
    const parsed = Number(draft);
    if (draft.trim() === "" || !Number.isFinite(parsed)) {
      setDraft(String(value));
      setEditing(false);
      return;
    }

    const nextValue = boundedValue(parsed, min, max);
    setDraft(String(nextValue));
    setEditing(false);
    if (nextValue !== value) onValueChange(nextValue);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    if (event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setDraft(String(value));
      event.currentTarget.blur();
    }
  };

  return (
    <input
      {...inputProps}
      type="number"
      min={min}
      max={max}
      value={draft}
      onFocus={(event) => {
        setEditing(true);
        onFocus?.(event);
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        commit();
        onBlur?.(event);
      }}
      onKeyDown={handleKeyDown}
    />
  );
}
