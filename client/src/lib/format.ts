export function formatUGX(amount: number | null | undefined): string {
  return `UGX ${Math.round(Number(amount) || 0).toLocaleString("en-UG")}`;
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Kampala" });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Kampala",
  });
}

/** Today's date in Kampala as YYYY-MM-DD, for date inputs. */
export function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** A stored date as YYYY-MM-DD (Kampala), for date inputs. */
export function dateInputValue(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kampala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Turns a Ugandan phone number into the international form WhatsApp needs:
 * "0759 985 611" -> "256759985611". Returns "" if it does not look valid.
 */
export function whatsappNumber(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("256") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return `256${digits.slice(1)}`;
  if (digits.length === 9) return `256${digits}`;
  return digits.length >= 10 ? digits : "";
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", "Thousand", "Million", "Billion", "Trillion"];

function belowThousand(value: number): string {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest) {
    const words = rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? `-${ONES[rest % 10]}` : ""}`;
    parts.push(hundreds ? `and ${words}` : words);
  }
  return parts.join(" ");
}

/**
 * Amount in words for documents, e.g. 1,250,000 ->
 * "Uganda Shillings One Million, Two Hundred and Fifty Thousand Only".
 */
export function amountInWords(amount: number | null | undefined): string {
  let value = Math.round(Math.abs(Number(amount) || 0));
  if (value === 0) return "Uganda Shillings Zero Only";
  const groups: string[] = [];
  let scale = 0;
  while (value > 0 && scale < SCALES.length) {
    const chunk = value % 1000;
    if (chunk) groups.unshift(`${belowThousand(chunk)}${SCALES[scale] ? ` ${SCALES[scale]}` : ""}`);
    value = Math.floor(value / 1000);
    scale += 1;
  }
  // British style: "One Million and Fifty" when the last group is under 100.
  const last = Math.round(Math.abs(Number(amount) || 0)) % 1000;
  let words = groups.join(", ");
  if (groups.length > 1 && last > 0 && last < 100) {
    words = `${groups.slice(0, -1).join(", ")} and ${groups[groups.length - 1]}`;
  }
  return `Uganda Shillings ${words} Only`;
}
