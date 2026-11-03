/**
 * "Send" dialog for quotations, invoices and receipts.
 *
 * The PDF is generated as soon as the dialog opens. The buttons then act on a
 * ready file, which phones (especially iPhones) require for sharing.
 *
 * - Phones: "Share PDF" opens the share sheet; pick WhatsApp or Gmail and the
 *   PDF is attached automatically.
 * - Computers: WhatsApp / Email download the PDF and open WhatsApp Web or the
 *   email app with the message filled in; attach the downloaded PDF.
 */
import { useEffect, useState } from "react";
import { Download, Mail, MessageCircle, Share2 } from "lucide-react";
import { Modal, Notice, inputClass, labelClass, primaryButton, secondaryButton } from "./ui";
import { canShareFile, downloadFile, emailLink, htmlToPdf, shareFile, whatsappLink } from "../lib/share";
import { whatsappNumber } from "../lib/format";

type Props = {
  title: string;
  html: string;
  fileName: string;
  message: string;
  emailSubject: string;
  phone?: string;
  email?: string;
  onClose: () => void;
  /** Called after the document was sent or shared (e.g. to mark a quotation "Sent"). */
  onSent?: () => void;
};

export default function ShareDialog({ title, html, fileName, message, emailSubject, phone = "", email = "", onClose, onSent }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(true);
  const [error, setError] = useState("");
  const [toPhone, setToPhone] = useState(phone);
  const [toEmail, setToEmail] = useState(email);
  const [text, setText] = useState(message);
  const [done, setDone] = useState("");

  useEffect(() => {
    let cancelled = false;
    htmlToPdf(html, fileName)
      .then((pdf) => {
        if (!cancelled) setFile(pdf);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not create the PDF.");
      })
      .finally(() => {
        if (!cancelled) setPreparing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [html, fileName]);

  const phoneReady = Boolean(whatsappNumber(toPhone));
  const mobileShare = file ? canShareFile(file) : false;

  async function handleShare() {
    if (!file) return;
    setError("");
    try {
      const shared = await shareFile(file, title, text);
      if (shared) {
        setDone("Shared.");
        onSent?.();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sharing failed. Use Download PDF instead.");
    }
  }

  function handleWhatsApp() {
    if (!file) return;
    if (!mobileShare) downloadFile(file);
    window.open(whatsappLink(toPhone, text), "_blank", "noopener");
    setDone(mobileShare ? "WhatsApp opened." : "PDF downloaded and WhatsApp opened. Attach the PDF from your Downloads folder.");
    onSent?.();
  }

  function handleEmail() {
    if (!file) return;
    downloadFile(file);
    window.location.href = emailLink(toEmail, emailSubject, text);
    setDone("PDF downloaded and your email app opened. Attach the PDF from your Downloads folder.");
    onSent?.();
  }

  return (
    <Modal
      title={`Send ${title}`}
      description={preparing ? "Preparing the PDF…" : file ? `${file.name} is ready.` : undefined}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={secondaryButton} disabled={!file} onClick={() => file && downloadFile(file)}>
            <Download size={16} /> Download PDF
          </button>
          <button type="button" className={secondaryButton} onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Notice tone="error">{error}</Notice>}
        {done && <Notice tone="success">{done}</Notice>}

        {mobileShare && (
          <button type="button" onClick={handleShare} disabled={!file} className={`${primaryButton} w-full py-3`}>
            <Share2 size={18} /> Share PDF (WhatsApp, Gmail…)
          </button>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelClass}>
            Customer WhatsApp number
            <input className={inputClass} value={toPhone} onChange={(e) => setToPhone(e.target.value)} placeholder="0772 123 456" inputMode="tel" />
          </label>
          <label className={labelClass}>
            Customer email
            <input className={inputClass} value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="name@example.com" inputMode="email" />
          </label>
        </div>

        <label className={labelClass}>
          Message
          <textarea className={`${inputClass} min-h-28`} value={text} onChange={(e) => setText(e.target.value)} />
        </label>

        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" onClick={handleWhatsApp} disabled={!file || !phoneReady} className={`${secondaryButton} border-emerald-200 text-emerald-700 hover:bg-emerald-50`}>
            <MessageCircle size={16} /> WhatsApp message
          </button>
          <button type="button" onClick={handleEmail} disabled={!file || !toEmail.includes("@")} className={secondaryButton}>
            <Mail size={16} /> Email
          </button>
        </div>
        {!phoneReady && <p className="text-xs text-slate-500">Enter a valid phone number to use WhatsApp.</p>}
        {!mobileShare && file && (
          <p className="text-xs text-slate-500">
            On a computer, WhatsApp and email links cannot attach files by themselves. The PDF is downloaded so you can attach it. On a phone, use “Share PDF” to attach it automatically.
          </p>
        )}
      </div>
    </Modal>
  );
}
