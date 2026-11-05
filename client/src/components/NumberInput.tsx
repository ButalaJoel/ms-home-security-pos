/**
 * A number box you can clear and retype freely (phones and computers).
 *
 * The usual `value={number}` pattern snaps an emptied box straight back to
 * 1 or 0, so you cannot delete the first digit. This box keeps what you type
 * as text, passes each valid number up as you type, and only tidies the
 * value (empty → minimum, too big → maximum) when you leave the box.
 */
import { useEffect, useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "min" | "max"> & {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Whole numbers only (quantities). */
  integer?: boolean;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export default function NumberInput({ value, onValueChange, min = 0, max = Number.MAX_SAFE_INTEGER, integer = false, onBlur, onFocus, ...rest }: Props) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  // Follow changes made elsewhere (e.g. the + / − buttons) unless the person is typing here.
  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  return (
    <input
      {...rest}
      type="text"
      inputMode={integer ? "numeric" : "decimal"}
      autoComplete="off"
      value={text}
      onFocus={(event) => {
        setFocused(true);
        // Select the number so typing replaces it straight away.
        event.currentTarget.select();
        onFocus?.(event);
      }}
      onChange={(event) => {
        const raw = event.target.value.replace(/,/g, "");
        if (!/^\d*\.?\d*$/.test(raw) || (integer && raw.includes("."))) return;
        setText(raw);
        if (raw === "" || raw === ".") return;
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed >= min) onValueChange(clamp(integer ? Math.floor(parsed) : parsed, min, max));
      }}
      onBlur={(event) => {
        setFocused(false);
        const parsed = Number(text);
        const next = text === "" || !Number.isFinite(parsed) ? min : clamp(integer ? Math.floor(parsed) : parsed, min, max);
        setText(String(next));
        if (next !== value) onValueChange(next);
        onBlur?.(event);
      }}
    />
  );
}
