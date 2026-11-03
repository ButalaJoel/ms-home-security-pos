/**
 * Turns a printable HTML document (quotation, invoice, receipt) into a PDF
 * and helps send it by WhatsApp or email.
 *
 * The HTML is rendered in a hidden iframe so the app's own styles cannot
 * change how the document looks. html2pdf.js is loaded only when needed.
 */
import { whatsappNumber } from "./format";

export async function htmlToPdf(html: string, fileName: string): Promise<File> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  // A4 width at 96 dpi; kept off-screen but rendered.
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;visibility:hidden;";
  document.body.appendChild(iframe);

  try {
    const doc = iframe.contentDocument;
    if (!doc) throw new Error("Could not prepare the document.");
    doc.open();
    doc.write(html);
    doc.close();

    // Wait for the logo and any other images before capturing.
    await Promise.all(
      Array.from(doc.images).map(
        (image) =>
          new Promise<void>((resolve) => {
            if (image.complete) return resolve();
            image.onload = () => resolve();
            image.onerror = () => resolve();
          }),
      ),
    );

    const { default: html2pdf } = await import("html2pdf.js");
    // "pagebreak" is supported by html2pdf.js but missing from its type file.
    const options = {
        margin: [8, 8, 8, 8],
        filename: fileName,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", windowWidth: 794 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
    };
    const worker = html2pdf();
    const blob: Blob = await worker
      .set(options as unknown as Parameters<typeof worker.set>[0])
      .from(doc.body)
      .outputPdf("blob");

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
