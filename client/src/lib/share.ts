/**
 * Turns a printable HTML document (quotation, invoice, receipt) into a PDF
 * and helps send it by WhatsApp or email.
 *
 * The HTML is laid out in a hidden, A4-wide iframe and captured there with
 * html2canvas, so the document keeps its own <style> (the app's styles cannot
 * leak in) and looks the same on a phone as on a computer. The capture is then
 * cut into A4 pages at gaps between rows and blocks, never through a line of
 * text. html2canvas and jsPDF are loaded only when needed.
 */
import { whatsappNumber } from "./format";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
/** Matches the 9mm page margin the documents use when printed. */
const PAGE_MARGIN_MM = 9;
/** Printable A4 width (210mm minus margins) at 96 dpi, the same scale as printing. */
const RENDER_WIDTH_PX = Math.round(((A4_WIDTH_MM - PAGE_MARGIN_MM * 2) * 96) / 25.4);
const RENDER_SCALE = 2;
/** Stays under the canvas size limit of mobile Safari (about 16.7 million pixels). */
const MAX_CANVAS_PIXELS = 16_000_000;

/** Elements that must not be cut in half by a page break. */
const KEEP_TOGETHER = "tr, p, li, h1, h2, h3, h4, img, .total-row, .customer, .totals, .in-words, .payment-method, .footer";

/**
 * Applies the document's own "@media print" rules on screen, so the PDF is
 * laid out exactly like the printed copy (same spacing, same page count).
 */
function applyPrintRules(doc: Document): void {
  const printCss: string[] = [];
  Array.from(doc.styleSheets).forEach((sheet) => {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      return;
    }
    Array.from(rules).forEach((rule) => {
      if (rule instanceof (doc.defaultView?.CSSMediaRule ?? CSSMediaRule) && /\bprint\b/.test(rule.conditionText ?? rule.media.mediaText)) {
        Array.from(rule.cssRules).forEach((inner) => printCss.push(inner.cssText));
      }
    });
  });
  if (!printCss.length) return;
  const style = doc.createElement("style");
  style.textContent = printCss.join("\n");
  doc.head.appendChild(style);
}

function waitForImages(doc: Document): Promise<void> {
  return Promise.all(
    Array.from(doc.images).map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) return resolve();
          image.onload = () => resolve();
          image.onerror = () => resolve();
        }),
    ),
  ).then(() => undefined);
}

/** Vertical ranges (in CSS px) that a page break must not fall inside. */
function keepTogetherRanges(doc: Document): Array<[number, number]> {
  const view = doc.defaultView;
  const ranges: Array<[number, number]> = [];
  doc.body.querySelectorAll<HTMLElement>("*").forEach((element) => {
    const style = view?.getComputedStyle(element);
    const avoid = element.matches(KEEP_TOGETHER) || style?.breakInside === "avoid" || style?.pageBreakInside === "avoid";
    if (!avoid) return;
    const box = element.getBoundingClientRect();
    if (box.height <= 0) return;
    let bottom = box.bottom;
    // Keep a heading with the first thing under it.
    if (/^H[1-4]$/.test(element.tagName) && element.nextElementSibling) {
      bottom = Math.max(bottom, element.nextElementSibling.getBoundingClientRect().bottom);
    }
    ranges.push([box.top, bottom]);
  });
  return ranges;
}

/** Picks where each page ends so no kept-together block is split. */
function pageBreaks(totalHeight: number, pageHeight: number, ranges: Array<[number, number]>): number[] {
  const ends: number[] = [];
  let start = 0;
  while (start < totalHeight - 1) {
    let end = Math.min(start + pageHeight, totalHeight);
    if (end < totalHeight) {
      let moved = true;
      while (moved) {
        moved = false;
        for (const [top, bottom] of ranges) {
          // Move the break up to the top of any block it would cut, unless the
          // block is taller than a whole page (then it has to be cut anyway).
          if (top < end && bottom > end && top > start + 1) {
            end = top;
            moved = true;
          }
        }
      }
    }
    ends.push(end);
    start = end;
  }
  return ends;
}

export async function htmlToPdf(html: string, fileName: string): Promise<File> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  // Kept off-screen but rendered at a fixed A4 width.
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${RENDER_WIDTH_PX}px;height:1123px;border:0;visibility:hidden;`;
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("Could not prepare the document.");
    doc.open();
    doc.write(html);
    doc.close();
    applyPrintRules(doc);

    await waitForImages(doc);
    if (doc.fonts?.ready) await doc.fonts.ready;

    // Measure the real content height (shrink the frame first so its own
    // height does not count), then let it grow so nothing is clipped.
    iframe.style.height = "0px";
    const totalHeight = Math.max(1, Math.ceil(doc.documentElement.scrollHeight));
    iframe.style.height = `${totalHeight}px`;

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);

    // Phones (especially iPhones) refuse very large canvases, so long documents
    // are captured at a slightly lower sharpness instead of failing.
    const scale = Math.max(1, Math.min(RENDER_SCALE, Math.sqrt(MAX_CANVAS_PIXELS / (RENDER_WIDTH_PX * totalHeight))));
    const canvas = await html2canvas(doc.documentElement, {
      scale,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: RENDER_WIDTH_PX,
      height: totalHeight,
      windowWidth: RENDER_WIDTH_PX,
      windowHeight: totalHeight,
      scrollX: 0,
      scrollY: 0,
    });

    const contentWidthMm = A4_WIDTH_MM - PAGE_MARGIN_MM * 2;
    const contentHeightMm = A4_HEIGHT_MM - PAGE_MARGIN_MM * 2;
    const pxPerMm = RENDER_WIDTH_PX / contentWidthMm;
    const pageHeightPx = Math.floor(contentHeightMm * pxPerMm);
    // Stop at the last line of text or image so trailing padding and margins
    // never spill onto an empty extra page.
    let contentBottom = 0;
    doc.body.querySelectorAll<HTMLElement>("*").forEach((element) => {
      if (element.children.length > 0 && element.tagName !== "TR") return;
      const box = element.getBoundingClientRect();
      if (box.height > 0 && box.width > 0) contentBottom = Math.max(contentBottom, box.bottom);
    });
    const usedHeight = Math.min(totalHeight, Math.ceil(contentBottom)) || totalHeight;
    const ends = pageBreaks(usedHeight, pageHeightPx, keepTogetherRanges(doc));

    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageCanvas = document.createElement("canvas");
    const context = pageCanvas.getContext("2d");
    if (!context) throw new Error("Could not create the PDF.");

    let start = 0;
    ends.forEach((end, index) => {
      const sliceHeight = end - start;
      pageCanvas.width = canvas.width;
      pageCanvas.height = Math.ceil(sliceHeight * scale);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      context.drawImage(canvas, 0, Math.round(start * scale), canvas.width, pageCanvas.height, 0, 0, canvas.width, pageCanvas.height);
      if (index > 0) pdf.addPage();
      pdf.addImage(pageCanvas.toDataURL("image/jpeg", 0.95), "JPEG", PAGE_MARGIN_MM, PAGE_MARGIN_MM, contentWidthMm, sliceHeight / pxPerMm);
      start = end;
    });

    const blob = pdf.output("blob");
    return new File([blob], fileName, { type: "application/pdf" });
  } finally {
    iframe.remove();
  }
}

export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** True on phones/tablets that can attach files through the share sheet. */
export function canShareFile(file: File): boolean {
  return typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
}

export async function shareFile(file: File, title: string, text: string): Promise<boolean> {
  try {
    await navigator.share({ files: [file], title, text });
    return true;
  } catch (error) {
    // The person closed the share sheet; not an error worth showing.
    if (error instanceof DOMException && error.name === "AbortError") return false;
    throw error;
  }
}

export function whatsappLink(phone: string, text: string): string {
  const number = whatsappNumber(phone);
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function emailLink(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Opens a print dialog for a standalone HTML document. */
export function printHtml(html: string): void {
  const printWindow = window.open("", "_blank", "width=1000,height=800");
  if (!printWindow) {
    window.alert("Allow pop-ups for this app to print, then try again.");
    return;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  const images = Array.from(printWindow.document.images);
  void Promise.all(
    images.map(
      (image) =>
        new Promise<void>((resolve) => {
          if (image.complete) return resolve();
          image.onload = () => resolve();
          image.onerror = () => resolve();
        }),
    ),
  ).then(() => {
    printWindow.focus();
    printWindow.print();
  });
}
