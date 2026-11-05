/**
 * Printable HTML for quotations, invoices and receipts.
 * The same HTML is used for printing and for the PDF sent by WhatsApp/email,
 * so both always look identical. Layout copied from the original
 * Invoices & Receipts page designs.
 */
import { amountInWords, escapeHtml, formatUGX } from "./format";

export type Settings = Record<string, unknown>;

export function settingText(settings: Settings, key: string, fallback = ""): string {
  const value = settings[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function company(settings: Settings) {
  return {
    name: settingText(settings, "businessName", "MS Home Security Solutions"),
    phone: settingText(settings, "phone", settingText(settings, "businessPhone")),
    phone2: settingText(settings, "phone2", settingText(settings, "alternatePhone")),
    phone3: settingText(settings, "phone3", settingText(settings, "additionalPhone")),
    email: settingText(settings, "email", settingText(settings, "businessEmail")),
    address: settingText(settings, "address", settingText(settings, "businessAddress")),
    logo: settingText(settings, "logoUrl"),
    warranty: settingText(settings, "warrantyDuration"),
  };
}

function paymentInstructions(settings: Settings): string {
  const bankName = settingText(settings, "bankName");
  const bankAccountName = settingText(settings, "bankAccountName");
  const bankAccountNumber = settingText(settings, "bankAccountNumber");
  const bankBranch = settingText(settings, "bankBranch");
  const mtnNumber = settingText(settings, "mtnPaymentNumber");
  const mtnName = settingText(settings, "mtnRegisteredName", settingText(settings, "mtnAccountName"));
  const airtelNumber = settingText(settings, "airtelPaymentNumber");
  const airtelName = settingText(settings, "airtelRegisteredName", settingText(settings, "airtelAccountName"));
  return `
    ${bankName || bankAccountNumber ? `<div class="payment-method"><h3>Bank transfer</h3>
      ${bankName ? `<p>Bank: ${escapeHtml(bankName)}</p>` : ""}
      ${bankAccountName ? `<p>Account name: ${escapeHtml(bankAccountName)}</p>` : ""}
      ${bankAccountNumber ? `<p>Account number: ${escapeHtml(bankAccountNumber)}</p>` : ""}
      ${bankBranch ? `<p>Branch: ${escapeHtml(bankBranch)}</p>` : ""}</div>` : ""}
    ${mtnNumber ? `<div class="payment-method"><h3>MTN Mobile Money</h3><p>Number: ${escapeHtml(mtnNumber)}</p>${mtnName ? `<p>Registered name: ${escapeHtml(mtnName)}</p>` : ""}</div>` : ""}
    ${airtelNumber ? `<div class="payment-method"><h3>Airtel Money</h3><p>Number: ${escapeHtml(airtelNumber)}</p>${airtelName ? `<p>Registered name: ${escapeHtml(airtelName)}</p>` : ""}</div>` : ""}
  `.trim();
}

// ---------------------------------------------------------------- Quotation

export type QuotationForDocument = {
  number: string;
  createdAt?: string;
  validDays: number;
  validUntil?: string;
  customerName: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
  items: { description: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  discount: number;
  taxEnabled: boolean;
  taxLabel?: string;
  taxRate: number;
  tax: number;
  grandTotal: number;
  notes?: string;
  terms?: string;
};

export function quotationHtml(quote: QuotationForDocument, settings: Settings): string {
  const c = company(settings);
  const rows = quote.items
    .map(
      (item) => `<tr>
        <td class="description">${escapeHtml(item.description)}</td>
        <td class="number">${item.quantity}</td>
        <td class="number">${escapeHtml(formatUGX(item.unitPrice))}</td>
        <td class="number">${escapeHtml(formatUGX(item.quantity * item.unitPrice))}</td>
      </tr>`,
    )
    .join("");
  const termsHtml = escapeHtml(quote.terms ?? "")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => `<p>${line}</p>`)
    .join("");
  const payments = paymentInstructions(settings);
  const logoHtml = c.logo
    ? `<img class="logo" src="${escapeHtml(c.logo)}" alt="Business logo" crossorigin="anonymous">`
    : `<div class="logo-fallback">MS</div>`;
  const date = quote.createdAt ? new Date(quote.createdAt) : new Date();
  const validUntil = quote.validUntil ? new Date(quote.validUntil) : new Date(date.getTime() + quote.validDays * 86400000);
  const taxHtml = quote.taxEnabled
    ? `<div class="total-row"><span>${escapeHtml(quote.taxLabel || "Tax")} (${quote.taxRate}%)</span><strong>${escapeHtml(formatUGX(quote.tax))}</strong></div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(quote.number)}</title>
<style>
  @page { size: A4 portrait; margin: 9mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 100%; color: #243047; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 9pt; line-height: 1.32; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { overflow-wrap: anywhere; }
  .document { width: 100%; max-width: 192mm; margin: 0 auto; padding: 2mm; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; border-bottom: 2px solid #00a9e8; padding-bottom: 4mm; margin-bottom: 5mm; }
  .business { flex: 1; min-width: 0; }
  .brand { display: flex; align-items: center; gap: 3mm; margin-bottom: 3mm; }
  .logo { display: block; width: 24mm; height: 16mm; object-fit: contain; }
  .logo-fallback { width: 16mm; height: 16mm; display: flex; align-items: center; justify-content: center; background: #00a9e8; color: white; font-size: 16pt; font-weight: 800; }
  .business-name { margin: 0; font-size: 13pt; line-height: 1.15; font-weight: 800; }
  .tagline { margin-top: 1mm; color: #008ac4; font-size: 7pt; letter-spacing: 1.5px; text-transform: uppercase; }
  .contact p, .payment-method p { margin: 1mm 0; }
  .quote-meta { flex: 0 0 52mm; max-width: 52mm; text-align: right; }
  .quote-meta h1 { font-size: 20pt; line-height: 1.1; margin: 0 0 2mm; font-weight: 800; }
  .reference { color: #0078b5; font-weight: 700; overflow-wrap: anywhere; }
  .quote-meta p { margin: 1mm 0; }
  .customer { background: #f4f7fb; padding: 3mm; margin-bottom: 5mm; border-radius: 1mm; break-inside: avoid; page-break-inside: avoid; }
  .section-label { font-size: 7pt; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: #64748b; margin: 0 0 1.5mm; }
  .customer-name { font-size: 10pt; font-weight: 700; margin: 0 0 1mm; }
  .customer p { margin: 1mm 0; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0 0 4mm; }
  thead { display: table-header-group; }
  th { background: #1e293b; color: white; text-align: left; font-size: 8pt; font-weight: 700; }
  th, td { padding: 2mm 1.5mm; vertical-align: top; overflow-wrap: anywhere; }
  th:first-child, td:first-child { width: 46%; }
  th:nth-child(2), td:nth-child(2) { width: 10%; }
  th:nth-child(3), td:nth-child(3) { width: 21%; }
  th:nth-child(4), td:nth-child(4) { width: 23%; }
  tbody tr { border-bottom: 1px solid #e2e8f0; break-inside: avoid; page-break-inside: avoid; }
  .number { text-align: right; }
  .totals { width: 78mm; max-width: 100%; margin: 0 0 5mm auto; break-inside: avoid; page-break-inside: avoid; }
  .total-row { display: flex; justify-content: space-between; gap: 4mm; padding: 1.3mm 0; }
  .total-row strong { text-align: right; }
  .grand-total { border-top: 1px solid #cbd5e1; margin-top: 1mm; padding-top: 2.5mm; font-size: 12pt; font-weight: 800; }
  .in-words { margin: -2mm 0 5mm; padding: 2.5mm 3mm; background: #f4f7fb; border-left: 2px solid #00a9e8; font-size: 8.5pt; break-inside: avoid; page-break-inside: avoid; }
  .content-section { margin-top: 4mm; }
  .content-section h2 { font-size: 9pt; margin: 0 0 2mm; }
  .terms p { margin: 0 0 1.5mm; }
  .payment-method { margin: 2mm 0; break-inside: avoid; page-break-inside: avoid; }
  .payment-method h3 { font-size: 8pt; margin: 0 0 1mm; }
  .footer { margin-top: 4mm; padding-top: 2mm; border-top: 1px solid #dbe3ed; color: #64748b; font-size: 7.5pt; break-inside: avoid; page-break-inside: avoid; }
  .footer p { margin: 1mm 0; }
  @media print { .document { max-width: none; padding: 0; } }
</style></head>
<body><main class="document">
  <header class="header">
    <div class="business">
      <div class="brand">${logoHtml}<div><p class="business-name">${escapeHtml(c.name)}</p><div class="tagline">Security Solutions</div></div></div>
      <div class="contact"><p>${escapeHtml(c.address)}</p>${c.phone ? `<p>${escapeHtml(c.phone)}</p>` : ""}${c.phone2 ? `<p>${escapeHtml(c.phone2)}</p>` : ""}${c.phone3 ? `<p>${escapeHtml(c.phone3)}</p>` : ""}${c.email ? `<p>${escapeHtml(c.email)}</p>` : ""}</div>
    </div>
    <div class="quote-meta"><h1>QUOTATION</h1><p class="reference">${escapeHtml(quote.number)}</p>
      <p>Date: ${escapeHtml(date.toLocaleDateString("en-GB"))}</p>
      <p>Valid until: ${escapeHtml(validUntil.toLocaleDateString("en-GB"))}</p></div>
  </header>
  <section class="customer"><p class="section-label">Quotation prepared for</p><p class="customer-name">${escapeHtml(quote.customerName)}</p>
    ${quote.customerPhone ? `<p>${escapeHtml(quote.customerPhone)}</p>` : ""}${quote.customerEmail ? `<p>${escapeHtml(quote.customerEmail)}</p>` : ""}${quote.customerAddress ? `<p>${escapeHtml(quote.customerAddress)}</p>` : ""}</section>
  <table><thead><tr><th>Description</th><th class="number">Qty</th><th class="number">Unit price</th><th class="number">Total</th></tr></thead><tbody>${rows}</tbody></table>
  <section class="totals">
    <div class="total-row"><span>Subtotal</span><strong>${escapeHtml(formatUGX(quote.subtotal))}</strong></div>
    ${quote.discount > 0 ? `<div class="total-row"><span>Discount</span><strong>− ${escapeHtml(formatUGX(quote.discount))}</strong></div>` : ""}
    ${taxHtml}
    <div class="total-row grand-total"><span>Quotation total</span><strong>${escapeHtml(formatUGX(quote.grandTotal))}</strong></div>
  </section>
  <p class="in-words"><b>Amount in words:</b> ${escapeHtml(amountInWords(quote.grandTotal))}</p>
  ${quote.notes?.trim() ? `<section class="content-section"><h2>Additional notes</h2><div class="terms">${escapeHtml(quote.notes).replace(/\r?\n/g, "<br>")}</div></section>` : ""}
  ${termsHtml ? `<section class="content-section terms"><h2>Terms and conditions</h2>${termsHtml}</section>` : ""}
  ${payments ? `<section class="content-section"><h2>Payment instructions</h2>${payments}</section>` : ""}
  <footer class="footer"><p>Thank you for considering ${escapeHtml(c.name)}.</p><p>Please quote ${escapeHtml(quote.number)} when discussing or accepting this quotation.</p>${c.warranty ? `<p>Warranty: ${escapeHtml(c.warranty)}, subject to applicable warranty conditions and exclusions.</p>` : ""}</footer>
</main></body></html>`;
}

// ---------------------------------------------------------------- Invoice / receipt

export type SaleForDocument = {
  _id?: string;
  id?: string;
  receiptNumber?: string;
  customer?: string | { name?: string };
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  items?: {
    type?: string;
    customType?: string;
    name?: string;
    productName?: string;
    description?: string;
    sku?: string;
    quantity: number;
    unitPrice?: number;
    price?: number;
    lineTotal?: number;
    total?: number;
  }[];
  subtotal?: number;
  lineDiscountTotal?: number;
  overallDiscount?: number;
  discount?: number;
  tax?: number;
  taxLabel?: string;
  grandTotal?: number;
  total?: number;
  paymentMethod?: string;
  amountPaid?: number;
  balance?: number;
  change?: number;
  createdAt?: string;
  payments?: { receiptNumber: string; amount: number; method: string; receivedAt: string; note?: string }[];
};

export function saleCustomerName(sale: SaleForDocument): string {
  if (sale.customerName) return sale.customerName;
  return typeof sale.customer === "string" ? sale.customer || "Walk-in customer" : sale.customer?.name || "Walk-in customer";
}
export function saleReference(sale: SaleForDocument): string {
  return sale.receiptNumber || sale._id || sale.id || "Saved sale";
}
export function saleTotal(sale: SaleForDocument): number {
  return Number(sale.grandTotal ?? sale.total ?? 0);
}
export function salePaid(sale: SaleForDocument): number {
  return Number(sale.amountPaid ?? 0);
}
export function saleBalance(sale: SaleForDocument): number {
  return Math.max(0, Number(sale.balance ?? saleTotal(sale) - salePaid(sale)));
}
export function salePaymentStatus(sale: SaleForDocument): "Paid" | "Partially paid" | "Unpaid" {
  if (saleBalance(sale) <= 0) return "Paid";
  if (salePaid(sale) > 0) return "Partially paid";
  return "Unpaid";
}
export function invoiceNumber(sale: SaleForDocument, settings: Settings): string {
  const prefix = settingText(settings, "invoicePrefix", "INV");
  return `${prefix}-${saleReference(sale).replace(/^MS-/, "")}`;
}

export function saleDocumentHtml(sale: SaleForDocument, kind: "invoice" | "receipt", settings: Settings): string {
  const c = company(settings);
  const isReceipt = kind === "receipt";
  const reference = saleReference(sale);
  const number = isReceipt ? reference : invoiceNumber(sale, settings);
  const total = saleTotal(sale);
  const paid = salePaid(sale);
  const balance = saleBalance(sale);
  const status = salePaymentStatus(sale);
  const date = sale.createdAt ? new Date(sale.createdAt).toLocaleString("en-GB") : new Date().toLocaleString("en-GB");
  const rows = (sale.items || [])
    .map((item) => {
      const name = item.name || item.productName || item.description || "Item";
      const qty = Number(item.quantity || 0);
      const price = Number(item.unitPrice ?? item.price ?? 0);
      const line = Number(item.lineTotal ?? item.total ?? qty * price);
      const note =
        item.type === "custom"
          ? `<div class="muted">${escapeHtml(item.customType || "Other")} · Custom item</div>`
          : item.sku
            ? `<div class="muted">SKU: ${escapeHtml(item.sku)}</div>`
            : "";
      return `<tr><td>${escapeHtml(name)}${note}</td><td class="num">${qty}</td><td class="num">${escapeHtml(formatUGX(price))}</td><td class="num">${escapeHtml(formatUGX(line))}</td></tr>`;
    })
    .join("");
  const logo = c.logo
    ? `<img class="logo" src="${escapeHtml(c.logo)}" alt="Company logo" crossorigin="anonymous">`
    : `<div class="logo fallback">MS</div>`;
  const tax = Number(sale.tax || 0);
  const discount = Number(sale.lineDiscountTotal || 0) + Number(sale.overallDiscount ?? sale.discount ?? 0);
  const subtotal = Number(sale.subtotal ?? total);
  const payments = sale.payments ?? [];
  const initialPaid = Math.max(0, paid - payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0));
  const paymentRows = payments.length
    ? `<h3 class="sub">Payment history</h3><table class="payments"><thead><tr><th>Date</th><th>Reference</th><th>Method</th><th class="num">Amount</th></tr></thead><tbody>
        ${initialPaid > 0 ? `<tr><td>${escapeHtml(date)}</td><td>${escapeHtml(reference)}</td><td>${escapeHtml(sale.paymentMethod || "")}</td><td class="num">${escapeHtml(formatUGX(initialPaid))}</td></tr>` : ""}
        ${payments.map((payment) => `<tr><td>${escapeHtml(new Date(payment.receivedAt).toLocaleString("en-GB"))}</td><td>${escapeHtml(payment.receiptNumber)}</td><td>${escapeHtml(payment.method)}</td><td class="num">${escapeHtml(formatUGX(payment.amount))}</td></tr>`).join("")}
      </tbody></table>`
    : "";
  const instructions = !isReceipt && balance > 0 ? paymentInstructions(settings) : "";

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(number)}</title>
<style>
@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font:12px/1.5 Arial,sans-serif;color:#172033;margin:0;padding:6px;background:#fff}
header{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #0ea5e9;padding-bottom:16px}
.brand{display:flex;align-items:center;gap:12px}.logo{width:54px;height:54px;object-fit:contain}.fallback{display:grid;place-items:center;background:#0ea5e9;color:white;font-size:22px;font-weight:bold;border-radius:8px}
h1{font-size:23px;margin:0}h2{font-size:17px;margin:0}p{margin:2px 0}.muted{color:#64748b}.right{text-align:right}
.panel{display:flex;justify-content:space-between;gap:20px;background:#f8fafc;padding:12px;margin:18px 0;border-radius:7px}
table{width:100%;border-collapse:collapse;margin-top:18px}th{background:#172033;color:white;text-align:left}th,td{padding:10px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}.num{text-align:right;white-space:nowrap}
tr{break-inside:avoid;page-break-inside:avoid}
.totals{width:320px;max-width:100%;margin:18px 0 0 auto;break-inside:avoid;page-break-inside:avoid}.row{display:flex;justify-content:space-between;gap:15px;padding:5px 0}.grand{border-top:2px solid #172033;margin-top:5px;padding-top:10px;font-size:16px;font-weight:bold}
.in-words{margin:14px 0 0;padding:9px 12px;background:#f8fafc;border-left:3px solid #0ea5e9;break-inside:avoid}
.sub{font-size:13px;margin:22px 0 0}.payments th{background:#475569}.payments th,.payments td{padding:7px 8px;font-size:11px}
.notice{margin-top:18px;padding:12px;background:#f8fafc;border-left:3px solid #0ea5e9;break-inside:avoid}.payment-method{margin:6px 0}.payment-method h3{font-size:12px;margin:0 0 2px}
.footer{border-top:1px solid #e2e8f0;margin-top:30px;padding-top:12px;color:#64748b;font-size:10px}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;padding:0}}
</style></head><body>
<header><div><div class="brand">${logo}<div><h2>${escapeHtml(c.name)}</h2><p class="muted">Security Solutions</p></div></div>
<p>${escapeHtml(c.address)}</p><p>${escapeHtml(c.phone)}${c.phone2 ? " · " + escapeHtml(c.phone2) : ""}</p>
${c.phone3 ? `<p>${escapeHtml(c.phone3)}</p>` : ""}<p>${escapeHtml(c.email)}</p></div>
<div class="right"><h1>${isReceipt ? "PAYMENT RECEIPT" : "SALES INVOICE"}</h1><p><b>${isReceipt ? "Receipt" : "Invoice"} No:</b> ${escapeHtml(number)}</p>
<p><b>Sale reference:</b> ${escapeHtml(reference)}</p><p><b>Date:</b> ${escapeHtml(date)}</p>
${!isReceipt ? `<p><b>Payment status:</b> ${escapeHtml(status)}</p>` : ""}</div></header>
<div class="panel"><div><p class="muted">${isReceipt ? "Payment received from" : "Bill to"}</p><b>${escapeHtml(saleCustomerName(sale))}</b>
${sale.customerPhone ? `<p>${escapeHtml(sale.customerPhone)}</p>` : ""}${sale.customerAddress ? `<p>${escapeHtml(sale.customerAddress)}</p>` : ""}</div>
<div class="right"><p class="muted">Payment method</p><b>${escapeHtml(sale.paymentMethod || "Not recorded")}</b><p>Currency: UGX</p></div></div>
<table><thead><tr><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Line total</th></tr></thead>
<tbody>${rows || '<tr><td colspan="4">No line items were returned for this sale.</td></tr>'}</tbody></table>
<div class="totals"><div class="row"><span>Subtotal</span><b>${escapeHtml(formatUGX(subtotal))}</b></div>
${discount ? `<div class="row"><span>Discount</span><b>− ${escapeHtml(formatUGX(discount))}</b></div>` : ""}
${tax ? `<div class="row"><span>${escapeHtml(sale.taxLabel || settingText(settings, "taxLabel", "Tax"))}</span><b>${escapeHtml(formatUGX(tax))}</b></div>` : ""}
<div class="row grand"><span>${isReceipt ? "Sale total" : "Invoice total"}</span><b>${escapeHtml(formatUGX(total))}</b></div>
<div class="row"><span>Amount ${isReceipt ? "received" : "paid"}</span><b>${escapeHtml(formatUGX(paid))}</b></div>
<div class="row"><span>Outstanding balance</span><b>${escapeHtml(formatUGX(balance))}</b></div>
${isReceipt && Number(sale.change || 0) > 0 ? `<div class="row"><span>Change given</span><b>${escapeHtml(formatUGX(Number(sale.change)))}</b></div>` : ""}</div>
${isReceipt
  ? `<p class="in-words"><b>Amount received in words:</b> ${escapeHtml(amountInWords(paid))}</p>`
  : `<p class="in-words"><b>Invoice total in words:</b> ${escapeHtml(amountInWords(total))}${balance > 0 && balance !== total ? `<br><b>Balance due in words:</b> ${escapeHtml(amountInWords(balance))}` : ""}</p>`}
${paymentRows}
<div class="notice"><b>${isReceipt ? `Payment status: ${escapeHtml(status)}.` : "Payment terms:"}</b>
${isReceipt ? (paid > 0 ? " This receipt records the payments shown above against the sale." : " No payment is recorded as received.") : balance > 0 ? " Please settle the outstanding balance shown above and quote the invoice number when paying." : " This invoice is fully paid. Thank you."}
${instructions ? `<div style="margin-top:8px">${instructions}</div>` : ""}</div>
<footer class="footer"><b>${escapeHtml(c.name)}</b><p>Thank you for your business.</p>${c.warranty ? `<p>Warranty: ${escapeHtml(c.warranty)}, subject to applicable warranty conditions and exclusions.</p>` : ""}</footer>
</body></html>`;
}
