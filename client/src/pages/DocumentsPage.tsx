/**

 * MS Home Security Solutions — Invoices & Receipts

 *

 * PURPOSE

 * This page creates quotation drafts, previews quotations, and prints them.

 *

 * IMPORTANT PROJECT RULES

 * 1. Business settings are loaded from the backend API.

 * 2. Tax follows the saved Settings configuration.

 * 3. The current sample products are temporary and will later move to MongoDB.

 * 4. Quotations are drafts only; permanent document storage and numbering

 *    will be implemented in a later stage.

 * 5. Invoice and receipt registers are not yet connected to transactions.

 */



import { useEffect, useMemo, useState } from "react";

import {

  ArrowLeft,

  FilePlus2,

  FileText,

  Plus,

  Receipt,

  Printer,

  Search,

  Trash2,

} from "lucide-react";
import { apiFetch } from "../lib/api";



// The three document areas shown on the page.

type DocumentTab = "quotations" | "invoices" | "receipts";



// Defines the structure of each item on a quotation.

type QuoteItem = {

  id: number;

  description: string;

  quantity: number;

  unitPrice: number;

};


type SaleLine = {
  productId?: string; name?: string; productName?: string; description?: string;
  sku?: string; quantity: number; unitPrice?: number; price?: number;
  lineDiscountAmount?: number; lineTotal?: number; total?: number;
};
type SaleRecord = {
  _id?: string; id?: string; receiptNumber?: string; reference?: string;
  customer?: string | { name?: string; phone?: string; address?: string };
  customerPhone?: string; customerAddress?: string; items?: SaleLine[];
  subtotal?: number; lineDiscountTotal?: number; overallDiscount?: number;
  discount?: number; tax?: number; taxRate?: number; grandTotal?: number;
  total?: number; paymentMethod?: string; amountPaid?: number; paid?: number;
  balance?: number; change?: number; paymentStatus?: string; createdAt?: string;
};
type PrintableDocument = { sale: SaleRecord; kind: "invoice" | "receipt" };

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function saleCustomerName(sale: SaleRecord): string {
  return typeof sale.customer === "string" ? sale.customer || "Walk-in customer" : sale.customer?.name || "Walk-in customer";
}
function saleReference(sale: SaleRecord): string {
  return sale.receiptNumber || sale.reference || sale._id || sale.id || "Saved sale";
}
function saleTotal(sale: SaleRecord): number { return Number(sale.grandTotal ?? sale.total ?? 0); }
function salePaid(sale: SaleRecord): number { return Number(sale.amountPaid ?? sale.paid ?? 0); }
function saleBalance(sale: SaleRecord): number { return Math.max(0, Number(sale.balance ?? saleTotal(sale) - salePaid(sale))); }
function salePaymentStatus(sale: SaleRecord): string {
  if (saleBalance(sale) <= 0) return "Paid";
  if (salePaid(sale) > 0) return "Partially paid";
  return "Unpaid";
}




// TEMPORARY DATA:

// Keep these prototype products until we reach the agreed database-seeding stage.

const sampleProducts = [

  { name: "Hikvision 4MP ColorVu Dome Camera", price: 385000 },

  { name: "Dahua 8-Channel XVR Recorder", price: 575000 },

  { name: "ZKTeco F18 Biometric Terminal", price: 690000 },

  { name: "Cat6 Outdoor Network Cable — 305m", price: 485000 },

  { name: "12V 10A CCTV Power Supply Box", price: 145000 },

  { name: "Tuya Wi-Fi Smart Door Lock", price: 650000 },

];



// Formats monetary values consistently throughout the quotation.

function formatUGX(amount: number) {

  return `UGX ${Math.round(amount).toLocaleString("en-UG")}`;

}



// Generates a DRAFT quotation reference.

// This is not permanently reserved or saved in MongoDB.

function makeQuoteNumber(prefix = "QUO") {

  const now = new Date();



  const date = [

    now.getFullYear(),

    String(now.getMonth() + 1).padStart(2, "0"),

    String(now.getDate()).padStart(2, "0"),

  ].join("");



  const suffix = Math.floor(1000 + Math.random() * 9000);



  return `${prefix}-${date}-${suffix}`;

}



// Fallback terms used only if Settings has no usable terms saved.

const defaultTerms = `1. This quotation is valid for the period stated above.

2. Work or supply begins after written acceptance and receipt of the agreed deposit.

3. Suggested payment schedule: 50% deposit, 30% upon delivery or commencement of installation, and 20% after completion and handover, unless otherwise agreed in writing.

4. Any additional equipment, materials, cabling, civil works or labour outside this quotation will be discussed and approved by the customer before extra charges are incurred.

5. Installation dates may change due to site access, weather, power or network availability, delayed customer approvals, or supplier delays. Material changes will be communicated.

6. The customer is responsible for providing safe site access and any agreed site preparation.

7. Equipment warranties are subject to the manufacturer's terms and exclusions.

8. The final scope, payment milestones and handover requirements are subject to written agreement.`;



export default function DocumentsPage() {

  // Controls the selected document tab.

  const [activeTab, setActiveTab] =

    useState<DocumentTab>("quotations");



  // Controls whether the user is creating a quotation or viewing its preview.

  const [creatingQuote, setCreatingQuote] = useState(false);

  const [showPreview, setShowPreview] = useState(false);

  // Invoices and receipts are generated from the saved POS sale records.
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState("");
  const [salesSearch, setSalesSearch] = useState("");
  const [selectedDocument, setSelectedDocument] = useState<PrintableDocument | null>(null);




  /*

   * These are initial fallback values.

   * The component replaces them with the values returned by GET /api/settings.

   */

  const [businessSettings, setBusinessSettings] =

    useState<Record<string, unknown>>({

      businessName: "MS Home Security Solutions",

      phone: "+256 759 985 611",

      alternatePhone: "+256 792 977 212",

      additionalPhone: "+256 740 853 303",

      email: "msh0mesecuritysolutionsug01@gmail.com",

      address: "TEC Plaza L4-21",

      logoUrl: "",

      currency: "UGX",

      invoicePrefix: "INV",

      receiptPrefix: "REC",

      quotePrefix: "QUO",

      quotationValidityDays: "30",

      paymentTerms: "30",

      defaultPaymentType: "full",

      installationPaymentTerms: "50/30/20",

      bankName: "Standard Chartered",

      bankAccountName: "MATOVU HUSSEIN",

      bankAccountNumber: "0100829916100",

      bankBranch: "",

      mtnAccountName: "",

      mtnPaymentNumber: "",

      airtelAccountName: "Matovu Hussein",

      airtelPaymentNumber: "+256759985611",

      warrantyDuration: "6 months",

      termsAndConditions: defaultTerms,

      taxEnabled: false,

      taxLabel: "Tax",

      taxRate: "0",

    });



  // Tracks whether the initial settings request has completed.

  const [settingsLoaded, setSettingsLoaded] = useState(false);



  // The current quotation draft reference.

  const [quoteNumber, setQuoteNumber] = useState(() =>

    makeQuoteNumber(),

  );



  // The quotation starts with the saved terms when settings finish loading.

  const [terms, setTerms] = useState(defaultTerms);



  // Customer details entered for this quotation.

  const [customer, setCustomer] = useState("");

  const [customerPhone, setCustomerPhone] = useState("");

  const [customerAddress, setCustomerAddress] = useState("");



  // Document options and additional information.

  const [validDays, setValidDays] = useState("30");

  const [notes, setNotes] = useState("");

  const [discount, setDiscount] = useState("0");

  const [productSearch, setProductSearch] = useState("");

  const [nextItemId, setNextItemId] = useState(2);



  // Start each new quotation with one empty line item.

  const [items, setItems] = useState<QuoteItem[]>([

    {

      id: 1,

      description: "",

      quantity: 1,

      unitPrice: 0,

    },

  ]);



  /*

   * Load the business settings from the backend.

   * VITE_API_URL can point to a deployed API; otherwise use the local API.

   */

  useEffect(() => {

    let cancelled = false;



    async function loadBusinessSettings() {

      try {

        const apiBase = (

          import.meta.env.VITE_API_URL || "http://localhost:5000"

        ).replace(/\/+$/, "");



        const response = await apiFetch(`${apiBase}/api/settings`);



        if (!response.ok) {

          throw new Error(

            `Settings request failed (${response.status})`,

          );

        }



        const settingsPayload = (await response.json()) as Record<string, unknown>;
        // The API returns { success: true, settings: {...} }; accept a direct object too.
        const saved = (
          settingsPayload.settings && typeof settingsPayload.settings === "object"
            ? settingsPayload.settings
            : settingsPayload
        ) as Record<string, unknown>;



        // Do not update React state if the component has unmounted.

        if (cancelled) return;



        // Preserve fallbacks for fields that are missing from the response.

        setBusinessSettings((current) => ({

          ...current,

          ...saved,

        }));



        // Use the saved quotation prefix.

        const prefix =

          typeof saved.quotePrefix === "string" &&

          saved.quotePrefix.trim()

            ? saved.quotePrefix.trim()

            : "QUO";



        setQuoteNumber(makeQuoteNumber(prefix));



        // Load the configured quotation validity period.

        setValidDays(

          String(saved.quotationValidityDays ?? "30"),

        );



        // Load the business's saved terms and conditions.

        setTerms(

          typeof saved.termsAndConditions === "string" &&

            saved.termsAndConditions.trim()

            ? saved.termsAndConditions

            : defaultTerms,

        );

      } catch (error) {

        // Keep fallback values available if the API cannot be reached.

        console.error(

          "Could not load business settings for documents:",

          error,

        );

      } finally {

        if (!cancelled) {

          setSettingsLoaded(true);

        }

      }

    }



    void loadBusinessSettings();



    // Prevent state updates after the component unmounts.

    return () => {

      cancelled = true;

    };

  }, []);




  // Fetch saved transactions; this does not create or modify sales.
  async function loadSavedSales() {
    setSalesLoading(true);
    setSalesError("");
    try {
      const apiBase = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/+$/, "");
      const response = await apiFetch(`${apiBase}/api/sales?limit=200`);
      if (!response.ok) throw new Error(`Sales request failed (${response.status})`);
      const payload = await response.json();
      const rows = Array.isArray(payload) ? payload : Array.isArray(payload.sales) ? payload.sales : [];
      setSales(rows as SaleRecord[]);
    } catch (error) {
      console.error("Could not load saved sales:", error);
      setSalesError(error instanceof Error ? error.message : "Could not load saved sales.");
    } finally {
      setSalesLoading(false);
    }
  }

  // Load live sales whenever the invoice or receipt tab is opened.
  useEffect(() => {
    if (activeTab === "invoices" || activeTab === "receipts") void loadSavedSales();
  }, [activeTab]);

  // Opens a print-ready document. In the browser print dialog, choose Save as PDF to download it.
  function printSavedDocument(doc: PrintableDocument) {
    const sale = doc.sale;
    const isReceipt = doc.kind === "receipt";
    const reference = saleReference(sale);
    const number = isReceipt ? reference : `INV-${reference.replace(/^MS-/, "")}`;
    const total = saleTotal(sale);
    const paid = salePaid(sale);
    const balance = saleBalance(sale);
    const date = sale.createdAt ? new Date(sale.createdAt).toLocaleString("en-GB") : new Date().toLocaleString("en-GB");
    const rows = (sale.items || []).map((item) => {
      const name = item.name || item.productName || item.description || "Item";
      const qty = Number(item.quantity || 0);
      const price = Number(item.unitPrice ?? item.price ?? 0);
      const line = Number(item.lineTotal ?? item.total ?? qty * price);
      return `<tr><td>${escapeHtml(name)}${item.sku ? `<div class="muted">SKU: ${escapeHtml(item.sku)}</div>` : ""}</td><td class="num">${qty}</td><td class="num">${escapeHtml(formatUGX(price))}</td><td class="num">${escapeHtml(formatUGX(line))}</td></tr>`;
    }).join("");
    const logo = companyLogo
      ? `<img class="logo" src="${escapeHtml(companyLogo)}" alt="Company logo">`
      : `<div class="logo fallback">MS</div>`;
    const tax = Number(sale.tax || 0);
    const discount = Number(sale.lineDiscountTotal || 0) + Number(sale.overallDiscount ?? sale.discount ?? 0);
    const subtotal = Number(sale.subtotal ?? total);
    const status = salePaymentStatus(sale);
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(number)}</title>
<style>
@page{size:A4;margin:14mm}*{box-sizing:border-box}body{font:12px/1.5 Arial,sans-serif;color:#172033;margin:0}
header{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #0ea5e9;padding-bottom:16px}
.brand{display:flex;align-items:center;gap:12px}.logo{width:54px;height:54px;object-fit:contain}.fallback{display:grid;place-items:center;background:#0ea5e9;color:white;font-size:22px;font-weight:bold;border-radius:8px}
h1{font-size:23px;margin:0}h2{font-size:17px;margin:0}.muted{color:#64748b}.right{text-align:right}
.panel{display:flex;justify-content:space-between;gap:20px;background:#f8fafc;padding:12px;margin:18px 0;border-radius:7px}
table{width:100%;border-collapse:collapse;margin-top:18px}th{background:#172033;color:white;text-align:left}th,td{padding:10px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}.num{text-align:right;white-space:nowrap}
.totals{width:320px;max-width:100%;margin:18px 0 0 auto}.row{display:flex;justify-content:space-between;gap:15px;padding:5px 0}.grand{border-top:2px solid #172033;margin-top:5px;padding-top:10px;font-size:16px;font-weight:bold}
.notice{margin-top:18px;padding:12px;background:#f8fafc;border-left:3px solid #0ea5e9}.footer{border-top:1px solid #e2e8f0;margin-top:30px;padding-top:12px;color:#64748b;font-size:10px}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<header><div><div class="brand">${logo}<div><h2>${escapeHtml(companyName)}</h2><p class="muted">Security Solutions</p></div></div>
<p>${escapeHtml(companyAddress)}</p><p>${escapeHtml(companyPhone)} ${companyPhone2 ? " · " + escapeHtml(companyPhone2) : ""}</p>
${companyPhone3 ? `<p>${escapeHtml(companyPhone3)}</p>` : ""}<p>${escapeHtml(companyEmail)}</p></div>
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
${tax ? `<div class="row"><span>${escapeHtml(settingText("taxLabel", "Tax"))}</span><b>${escapeHtml(formatUGX(tax))}</b></div>` : ""}
<div class="row grand"><span>${isReceipt ? "Sale total" : "Invoice total"}</span><b>${escapeHtml(formatUGX(total))}</b></div>
<div class="row"><span>Amount ${isReceipt ? "received" : "paid"}</span><b>${escapeHtml(formatUGX(paid))}</b></div>
<div class="row"><span>Outstanding balance</span><b>${escapeHtml(formatUGX(balance))}</b></div>
${isReceipt && Number(sale.change || 0) > 0 ? `<div class="row"><span>Change given</span><b>${escapeHtml(formatUGX(Number(sale.change)))}</b></div>` : ""}</div>
<div class="notice"><b>${isReceipt ? `Payment status: ${escapeHtml(status)}.` : "Payment terms:"}</b>
${isReceipt ? (paid > 0 ? " This receipt records the payment shown above against the saved sale." : " No payment is recorded as received.") : " Please settle the outstanding balance shown above and quote the invoice number when paying."}</div>
<footer class="footer"><b>${escapeHtml(companyName)}</b><p>Thank you for your business. Generated from a saved POS transaction.</p></footer>
</body></html>`;
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) {
      window.alert("Allow pop-ups, then try printing or saving as PDF again.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => printWindow.print(), 500);
  }

  /*

   * Read a string setting safely.

   * This also handles fields that are absent or empty in MongoDB.

   */

  const settingText = (

    key: string,

    fallback = "",

  ): string => {

    const value = businessSettings[key];



    return typeof value === "string" && value.trim()

      ? value

      : fallback;

  };



  // Company details shown on the quotation.

  const companyName = settingText(

    "businessName",

    "MS Home Security Solutions",

  );



  const companyPhone = settingText(

    "phone",

    "+256 759 985 611",

  );



  const companyPhone2 = settingText(

    "alternatePhone",

    settingText("phone2", ""),

  );



  const companyPhone3 = settingText(

    "additionalPhone",

    settingText("phone3", ""),

  );



  const companyEmail = settingText(

    "email",

    "msh0mesecuritysolutionsug01@gmail.com",

  );



  const companyAddress = settingText(

    "address",

    "TEC Plaza L4-21",

  );



  const companyLogo = settingText("logoUrl");



  // Document settings.

  const quotePrefix = settingText("quotePrefix", "QUO");



  // Tax must follow Settings. Never assume the business charges 18%.

  // Tax is controlled separately for each quotation.

// It is OFF by default and applies only when the user checks the box.

const [taxEnabled, setTaxEnabled] = useState(false);



const configuredTaxRate = (() => {

  const savedRate = Number(businessSettings.taxRate);

  return Number.isFinite(savedRate) && savedRate > 0

    ? savedRate

    : 18;

})();

  // Saved bank and mobile-money details.

  const bankName = settingText("bankName");

  const bankAccountName = settingText("bankAccountName");

  const bankAccountNumber = settingText("bankAccountNumber");

  const bankBranch = settingText("bankBranch");



  const mtnAccountName = settingText(

    "mtnAccountName",

    settingText("mtnRegisteredName"),

  );



  const mtnPaymentNumber = settingText("mtnPaymentNumber");



  const airtelAccountName = settingText(

    "airtelAccountName",

    settingText("airtelRegisteredName"),

  );



  const airtelPaymentNumber = settingText(

    "airtelPaymentNumber",

  );



  // Warranty information is loaded from business Settings.

  const warrantyDuration = settingText(

    "warrantyDuration",

    "6 months",

  );



  // Calculate the subtotal from all quotation line items.

  const subtotal = useMemo(

    () =>

      items.reduce(

        (sum, item) =>

          sum + item.quantity * item.unitPrice,

        0,

      ),

    [items],

  );



  // Prevent negative discounts or discounts greater than the subtotal.

  const discountAmount = Math.min(

    subtotal,

    Math.max(0, Number(discount) || 0),

  );



  // Calculate the amount remaining after the discount.

  const taxableAmount = Math.max(

    0,

    subtotal - discountAmount,

  );



  // Calculate tax only when the saved Settings explicitly enable it.

  const taxAmount = taxEnabled

  ? taxableAmount * (configuredTaxRate / 100)

  : 0;



  // Final quotation amount after discount and applicable tax.

  const grandTotal = taxableAmount + taxAmount;



  // Filter the temporary prototype catalogue as the user searches.

  const filteredProducts = sampleProducts.filter((product) =>

    product.name

      .toLowerCase()

      .includes(productSearch.toLowerCase()),

  );

    /*

   * Update a single quotation item.

   * The field type ensures only valid item properties can be changed.

   */

  function updateItem(

    id: number,

    field: keyof Omit<QuoteItem, "id">,

    value: string | number,

  ) {

    setItems((current) =>

      current.map((item) =>

        item.id === id

          ? { ...item, [field]: value }

          : item,

      ),

    );

  }



  // Add a blank row for a custom product or service.

  function addBlankItem() {

    setItems((current) => [

      ...current,

      {

        id: nextItemId,

        description: "",

        quantity: 1,

        unitPrice: 0,

      },

    ]);



    setNextItemId((id) => id + 1);

  }



  /*

   * Add a product from the temporary sample catalogue.

   * If it is already on the quotation, increase its quantity.

   */

  function addProduct(

    product: (typeof sampleProducts)[number],

  ) {

    setItems((current) => {

      const existing = current.find(

        (item) => item.description === product.name,

      );



      if (existing) {

        return current.map((item) =>

          item.id === existing.id

            ? {

                ...item,

                quantity: item.quantity + 1,

              }

            : item,

        );

      }



      return [

        ...current,

        {

          id: nextItemId,

          description: product.name,

          quantity: 1,

          unitPrice: product.price,

        },

      ];

    });



    setNextItemId((id) => id + 1);

    setProductSearch("");

  }



  /*

   * Start a fresh quotation using the prefix from Settings.

   * The generated reference is still only a draft reference.

   */

  function startNewQuote() {

    setQuoteNumber(makeQuoteNumber(quotePrefix));

    setShowPreview(false);

    setCreatingQuote(true);

    setActiveTab("quotations");

    setTaxEnabled(false);



    setCustomer("");

    setCustomerPhone("");

    setCustomerAddress("");

    setNotes("");

    setDiscount("0");

    setProductSearch("");



    setValidDays(

      settingText("quotationValidityDays", "30"),

    );



    setTerms(

      settingText("termsAndConditions", defaultTerms),

    );



    setItems([

      {

        id: 1,

        description: "",

        quantity: 1,

        unitPrice: 0,

      },

    ]);



    setNextItemId(2);

  }



  // Reset the current draft without changing the saved business settings.

  function resetQuote() {

    setShowPreview(false);

    setCustomer("");

    setCustomerPhone("");

    setCustomerAddress("");

    setNotes("");

    setDiscount("0");

    setProductSearch("");

    setTaxEnabled(false);



    setValidDays(

      settingText("quotationValidityDays", "30"),

    );



    setTerms(

      settingText("termsAndConditions", defaultTerms),

    );



    setItems([

      {

        id: 1,

        description: "",

        quantity: 1,

        unitPrice: 0,

      },

    ]);



    setNextItemId(2);

    setCreatingQuote(false);

  }





  // Opens a separate print document so the application layout

  // cannot interfere with the quotation's PDF page layout.

  // Print a standalone quotation document. It does not depend on Tailwind CSS.
  function printQuotation() {
    const printWindow = window.open("", "_blank", "width=1000,height=800");

    if (!printWindow) {
      window.alert("Allow pop-ups for this application to print the quotation.");
      return;
    }

    const escapeHtml = (value: unknown) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const validItems = items.filter(
      (item) => item.description.trim() && item.quantity > 0,
    );

    const rows = validItems.map((item) => `
      <tr>
        <td class="description">${escapeHtml(item.description)}</td>
        <td class="number">${item.quantity}</td>
        <td class="number">${escapeHtml(formatUGX(item.unitPrice))}</td>
        <td class="number">${escapeHtml(formatUGX(item.quantity * item.unitPrice))}</td>
      </tr>
    `).join("");

    const termsHtml = escapeHtml(terms)
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => `<p>${line}</p>`)
      .join("");

    const paymentHtml = `
      ${bankName || bankAccountName || bankAccountNumber || bankBranch ? `
        <div class="payment-method">
          <h3>Bank transfer</h3>
          ${bankName ? `<p>Bank: ${escapeHtml(bankName)}</p>` : ""}
          ${bankAccountName ? `<p>Account name: ${escapeHtml(bankAccountName)}</p>` : ""}
          ${bankAccountNumber ? `<p>Account number: ${escapeHtml(bankAccountNumber)}</p>` : ""}
          ${bankBranch ? `<p>Branch: ${escapeHtml(bankBranch)}</p>` : ""}
        </div>` : ""}
      ${mtnPaymentNumber ? `
        <div class="payment-method">
          <h3>MTN Mobile Money</h3>
          <p>Number: ${escapeHtml(mtnPaymentNumber)}</p>
          ${mtnAccountName ? `<p>Registered name: ${escapeHtml(mtnAccountName)}</p>` : ""}
        </div>` : ""}
      ${airtelPaymentNumber ? `
        <div class="payment-method">
          <h3>Airtel Money</h3>
          <p>Number: ${escapeHtml(airtelPaymentNumber)}</p>
          ${airtelAccountName ? `<p>Registered name: ${escapeHtml(airtelAccountName)}</p>` : ""}
        </div>` : ""}
    `;

    const logoHtml = companyLogo
      ? `<img class="logo" src="${escapeHtml(companyLogo)}" alt="Business logo">`
      : `<div class="logo-fallback">MS</div>`;

    const taxHtml = taxEnabled
      ? `<div class="total-row"><span>${escapeHtml(settingText("taxLabel", "Tax"))} (${configuredTaxRate}%)</span><strong>${escapeHtml(formatUGX(taxAmount))}</strong></div>`
      : "";

    const documentHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(quoteNumber)}</title>
<style>
  @page { size: A4 portrait; margin: 9mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; width: 100%; color: #243047; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 9pt; line-height: 1.32; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { overflow-wrap: anywhere; }
  .document { width: 100%; max-width: 192mm; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8mm; border-bottom: 2px solid #00a9e8; padding-bottom: 4mm; margin-bottom: 5mm; }
  .business { flex: 1; min-width: 0; }
  .brand { display: flex; align-items: center; gap: 3mm; margin-bottom: 3mm; }
  .logo { display: block; width: 24mm; height: 16mm; object-fit: contain; }
  .logo-fallback { width: 16mm; height: 16mm; display: flex; align-items: center; justify-content: center; background: #00a9e8; color: white; font-size: 16pt; font-weight: 800; }
  .business-name { margin: 0; font-size: 13pt; line-height: 1.15; font-weight: 800; }
  .tagline { margin-top: 1mm; color: #008ac4; font-size: 7pt; letter-spacing: 1.5px; text-transform: uppercase; }
  .contact p, .payment-method p { margin: 1mm 0; }
  .quote-meta { flex: 0 0 48mm; max-width: 48mm; text-align: right; }
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
  .totals { width: 78mm; max-width: 100%; margin: 0 0 5mm auto; }
  .total-row { display: flex; justify-content: space-between; gap: 4mm; padding: 1.3mm 0; }
  .total-row strong { text-align: right; }
  .grand-total { border-top: 1px solid #cbd5e1; margin-top: 1mm; padding-top: 2.5mm; font-size: 12pt; font-weight: 800; }
  .content-section { margin-top: 4mm; }
  .content-section h2 { font-size: 9pt; margin: 0 0 2mm; }
  .terms p { margin: 0 0 1.5mm; }
  .payment-method { margin: 2mm 0; break-inside: avoid; page-break-inside: avoid; }
  .payment-method h3 { font-size: 8pt; margin: 0 0 1mm; }
  .footer { margin-top: 4mm; padding-top: 2mm; border-top: 1px solid #dbe3ed; color: #64748b; font-size: 7.5pt; break-inside: avoid; page-break-inside: avoid; }
  .footer p { margin: 1mm 0; }
  @media print { .document { max-width: none; } }
</style>
</head>
<body>
<main class="document">
  <header class="header">
    <div class="business">
      <div class="brand">${logoHtml}<div><p class="business-name">${escapeHtml(companyName)}</p><div class="tagline">Security Solutions</div></div></div>
      <div class="contact"><p>${escapeHtml(companyAddress)}</p>${companyPhone ? `<p>${escapeHtml(companyPhone)}</p>` : ""}${companyPhone2 ? `<p>${escapeHtml(companyPhone2)}</p>` : ""}${companyPhone3 ? `<p>${escapeHtml(companyPhone3)}</p>` : ""}${companyEmail ? `<p>${escapeHtml(companyEmail)}</p>` : ""}</div>
    </div>
    <div class="quote-meta"><h1>QUOTATION</h1><p class="reference">${escapeHtml(quoteNumber)}</p><p>Date: ${escapeHtml(new Date().toLocaleDateString("en-GB"))}</p><p>Valid for: ${escapeHtml(validDays)} days</p></div>
  </header>
  <section class="customer"><p class="section-label">Quotation prepared for</p><p class="customer-name">${escapeHtml(customer)}</p>${customerPhone ? `<p>${escapeHtml(customerPhone)}</p>` : ""}${customerAddress ? `<p>${escapeHtml(customerAddress)}</p>` : ""}</section>
  <table><thead><tr><th>Description</th><th class="number">Qty</th><th class="number">Unit price</th><th class="number">Total</th></tr></thead><tbody>${rows}</tbody></table>
  <section class="totals"><div class="total-row"><span>Subtotal</span><strong>${escapeHtml(formatUGX(subtotal))}</strong></div><div class="total-row"><span>Discount</span><strong>− ${escapeHtml(formatUGX(discountAmount))}</strong></div>${taxHtml}<div class="total-row grand-total"><span>Quotation total</span><strong>${escapeHtml(formatUGX(grandTotal))}</strong></div></section>
  ${notes.trim() ? `<section class="content-section"><h2>Additional notes</h2><div class="terms">${escapeHtml(notes).replace(/\r?\n/g, "<br>")}</div></section>` : ""}
  ${terms.trim() ? `<section class="content-section terms"><h2>Terms and conditions</h2>${termsHtml}</section>` : ""}
  ${paymentHtml.trim() ? `<section class="content-section"><h2>Payment instructions</h2>${paymentHtml}</section>` : ""}
  <footer class="footer"><p>Thank you for considering ${escapeHtml(companyName)}.</p><p>Please reference ${escapeHtml(quoteNumber)} when discussing this quotation.</p>${warrantyDuration ? `<p>Warranty: ${escapeHtml(warrantyDuration)}, subject to applicable warranty conditions and exclusions.</p>` : ""}</footer>
</main>
</body>
</html>`;

    printWindow.document.open();
    printWindow.document.write(documentHtml);
    printWindow.document.close();

    // Wait for the logo before opening the print dialog.
    const images = Array.from(printWindow.document.images);
    void Promise.all(images.map((image) => new Promise<void>((resolve) => {
      if (image.complete) return resolve();
      image.onload = () => resolve();
      image.onerror = () => resolve();
    }))).then(() => {
      printWindow.focus();
      printWindow.print();
    });
  }


  /*

   * Validate the customer and quotation items before showing the preview.

   * Empty rows are ignored, but the quotation must contain one valid item.

   */

  function previewQuote() {

    const validItems = items.filter(

      (item) =>

        item.description.trim() &&

        item.quantity > 0 &&

        item.unitPrice >= 0,

    );



    if (!customer.trim()) {

      window.alert(

        "Please enter the customer or business name.",

      );

      return;

    }



    if (validItems.length === 0) {

      window.alert(

        "Please add at least one item with a description.",

      );

      return;

    }



    setShowPreview(true);

  }



  // Navigation tabs for the document workspace.

  const tabs: {

    id: DocumentTab;

    label: string;

    icon: typeof FileText;

  }[] = [

    {

      id: "quotations",

      label: "Quotations",

      icon: FileText,

    },

    {

      id: "invoices",

      label: "Invoices",

      icon: FilePlus2,

    },

    {

      id: "receipts",

      label: "Receipts",

      icon: Receipt,

    },

  ];



  return (

    <div className="space-y-6">

      {/* Page heading and primary action. */}

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">

        <div>

          <p className="text-xs font-semibold uppercase tracking-widest text-sky-600">

            Documents & billing

          </p>



          <h2 className="mt-2 text-2xl font-bold text-slate-900">

            Invoices & Receipts

          </h2>



          <p className="mt-1 text-sm text-slate-500">

            Prepare quotations, invoices and payment receipts.

          </p>

        </div>



        {!creatingQuote && (

          <button

            type="button"

            onClick={startNewQuote}

            className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-600"

          >

            <Plus size={18} />

            Create quotation

          </button>

        )}

      </div>



      {/* Switch between quotation, invoice and receipt registers. */}

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-2">

        {tabs.map((tab) => {

          const Icon = tab.icon;

          const selected =

            activeTab === tab.id && !creatingQuote;



          return (

            <button

              key={tab.id}

              type="button"

              onClick={() => {

                setActiveTab(tab.id);

                setCreatingQuote(false);

                setShowPreview(false);

              }}

              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${

                selected

                  ? "bg-sky-500 text-white"

                  : "text-slate-600 hover:bg-slate-100"

              }`}

            >

              <Icon size={17} />

              {tab.label}

            </button>

          );

        })}

      </div>



      {/* The quotation editor is shown while creating a draft. */}

      {creatingQuote ? (

        <div className="space-y-5">

          <div className="flex items-center justify-between gap-3">

            <div>

              <h3 className="text-xl font-bold text-slate-900">

                Create quotation

              </h3>



              <p className="mt-1 text-sm text-slate-500">

                Add customer details and the items being quoted.

              </p>

            </div>



            <button

              type="button"

              onClick={() => setCreatingQuote(false)}

              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"

            >

              <ArrowLeft size={16} />

              Back

            </button>

          </div>



          {/* Two-column layout: editor on the left and summary on the right. */}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,0.8fr)]">

            <div className="space-y-5">

              {/* Customer information. */}

              <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">

                <h4 className="font-semibold text-slate-900">

                  Customer details

                </h4>



                <div className="mt-4 grid gap-4 sm:grid-cols-2">

                  <label className="text-sm text-slate-600 sm:col-span-2">

                    Customer / business name *

                    <input

                      value={customer}

                      onChange={(event) =>

                        setCustomer(event.target.value)

                      }

                      placeholder="e.g. Apex Apartments Ltd"

                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"

                    />

                  </label>



                  <label className="text-sm text-slate-600">

                    Phone number

                    <input

                      value={customerPhone}

                      onChange={(event) =>

                        setCustomerPhone(event.target.value)

                      }

                      placeholder="+256..."

                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"

                    />

                  </label>



                  <label className="text-sm text-slate-600">

                    Quotation valid for

                    <select

                      value={validDays}

                      onChange={(event) =>

                        setValidDays(event.target.value)

                      }

                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none focus:border-sky-400"

                    >

                      <option value="7">7 days</option>

                      <option value="14">14 days</option>

                      <option value="30">30 days</option>

                      <option value="60">60 days</option>

                    </select>

                  </label>



                  <label className="text-sm text-slate-600 sm:col-span-2">

                    Customer address

                    <input

                      value={customerAddress}

                      onChange={(event) =>

                        setCustomerAddress(event.target.value)

                      }

                      placeholder="Location or address"

                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"

                    />

                  </label>

                </div>

              </section>



              {/* Quotation line items and the temporary product search. */}

              <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">

                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">

                  <div>

                    <h4 className="font-semibold text-slate-900">

                      Quotation items

                    </h4>



                    <p className="mt-1 text-xs text-slate-500">

                      Search your temporary catalogue or add a custom item.

                    </p>

                  </div>



                  <button

                    type="button"

                    onClick={addBlankItem}

                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50"

                  >

                    <Plus size={16} />

                    Add custom item

                  </button>

                </div>



                <div className="relative mt-5">

                  <Search

                    size={18}

                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"

                  />



                  <input

                    value={productSearch}

                    onChange={(event) =>

                      setProductSearch(event.target.value)

                    }

                    placeholder="Search products to add..."

                    className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"

                  />

                </div>



                {/* Search results from the temporary prototype catalogue. */}

                {productSearch.trim() && (

                  <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">

                    {filteredProducts.length > 0 ? (

                      filteredProducts.map((product) => (

                        <button

                          key={product.name}

                          type="button"

                          onClick={() => addProduct(product)}

                          className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 text-left last:border-b-0 hover:bg-sky-50"

                        >

                          <span className="text-sm text-slate-700">

                            {product.name}

                          </span>



                          <span className="shrink-0 text-sm font-semibold text-slate-900">

                            {formatUGX(product.price)}

                          </span>

                        </button>

                      ))

                    ) : (

                      <p className="p-3 text-sm text-slate-500">

                        No catalogue match. Use Add custom item to enter it manually.

                      </p>

                    )}

                  </div>

                )}



                {/* Editable quotation lines. */}

                <div className="mt-5 space-y-4">

                  {items.map((item, index) => (

                    <div

                      key={item.id}

                      className="rounded-xl border border-slate-200 p-3 sm:p-4"

                    >

                      <div className="mb-3 flex items-center justify-between">

                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">

                          Item {index + 1}

                        </span>



                        {items.length > 1 && (

                          <button

                            type="button"

                            onClick={() =>

                              setItems((current) =>

                                current.filter(

                                  (row) => row.id !== item.id,

                                ),

                              )

                            }

                            aria-label={`Remove item ${index + 1}`}

                            className="rounded-lg p-2 text-rose-500 hover:bg-rose-50"

                          >

                            <Trash2 size={16} />

                          </button>

                        )}

                      </div>



                      <div className="grid gap-3 sm:grid-cols-12">

                        <label className="text-xs text-slate-500 sm:col-span-5">

                          Item description

                          <input

                            value={item.description}

                            onChange={(event) =>

                              updateItem(

                                item.id,

                                "description",

                                event.target.value,

                              )

                            }

                            placeholder="Camera installation, screws..."

                            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-400"

                          />

                        </label>



                        <label className="text-xs text-slate-500 sm:col-span-2">

                          Quantity

                          <input

                            type="number"

                            min="1"

                            value={item.quantity}

                            onChange={(event) =>

                              updateItem(

                                item.id,

                                "quantity",

                                Math.max(

                                  1,

                                  Number(event.target.value) || 1,

                                ),

                              )

                            }

                            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-400"

                          />

                        </label>



                        <label className="text-xs text-slate-500 sm:col-span-2">

                          Unit price (UGX)

                          <input

                            type="number"

                            min="0"

                            value={item.unitPrice}

                            onChange={(event) =>

                              updateItem(

                                item.id,

                                "unitPrice",

                                Math.max(

                                  0,

                                  Number(event.target.value) || 0,

                                ),

                              )

                            }

                            className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-sky-400"

                          />

                        </label>



                        <div className="sm:col-span-3">

                          <p className="text-xs text-slate-500">

                            Line total

                          </p>



                          <p className="mt-1.5 break-words text-sm font-bold text-slate-900">

                            {formatUGX(

                              item.quantity * item.unitPrice,

                            )}

                          </p>

                        </div>

                      </div>

                    </div>

                  ))}

                </div>



                <button

                  type="button"

                  onClick={addBlankItem}

                  className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-sky-600 hover:text-sky-700"

                >

                  <Plus size={17} />

                  Add another line

                </button>

              </section>



              {/* Additional notes and saved terms. */}

              <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">

                <h4 className="font-semibold text-slate-900">

                  Notes and terms

                </h4>



                <label className="mt-4 block text-sm text-slate-600">

                  Additional notes for this quotation

                  <textarea

                    value={notes}

                    onChange={(event) =>

                      setNotes(event.target.value)

                    }

                    rows={3}

                    placeholder="Site-specific details, exclusions or installation notes..."

                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"

                  />

                </label>



                <label className="mt-4 block text-sm text-slate-600">

                  Terms and conditions (from Settings; editable for this draft)

                  <textarea

                    value={terms}

                    onChange={(event) =>

                      setTerms(event.target.value)

                    }

                    rows={8}

                    className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm leading-6 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"

                  />

                </label>



                <p className="mt-2 text-xs text-slate-400">

                  The default terms come from your saved business Settings.

                  Changes here affect this draft only; they do not change

                  the business-wide terms in Settings.

                </p>

              </section>

            </div>



            {/* Sticky summary panel: calculations update as the draft changes. */}

            <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 xl:sticky xl:top-24">

              <h4 className="font-semibold text-slate-900">

                Quotation summary

              </h4>



              <div className="mt-5 space-y-4 text-sm">

                <div className="flex justify-between gap-3 text-slate-500">

                  <span>Items</span>

                  <span className="font-medium text-slate-900">

                    {

                      items.filter((item) =>

                        item.description.trim(),

                      ).length

                    }

                  </span>

                </div>



                <div className="flex justify-between gap-3 text-slate-500">

                  <span>Subtotal</span>

                  <span className="font-semibold text-slate-900">

                    {formatUGX(subtotal)}

                  </span>

                </div>



                <label className="block text-slate-500">

                  Discount (UGX)

                  <input

                    type="number"

                    min="0"

                    max={subtotal}

                    value={discount}

                    onChange={(event) =>

                      setDiscount(event.target.value)

                    }

                    className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-sky-400"

                  />

                </label>





{/* Optional tax checkbox for this quotation */}

<label className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 cursor-pointer">

  <input

    type="checkbox"

    checked={taxEnabled}

    onChange={(event) => setTaxEnabled(event.target.checked)}

    className="h-4 w-4 rounded"

  />



  <span className="text-sm font-medium text-slate-700">

    Apply tax ({configuredTaxRate}%)

  </span>

</label>



{taxEnabled && (

  <div className="flex justify-between gap-3 text-slate-500">

    <span>

      {settingText("taxLabel", "Tax")} ({configuredTaxRate}%)

    </span>

    <span>{formatUGX(taxAmount)}</span>

  </div>

)}

               <div className="border-t border-dashed border-slate-300 pt-4">

                  <p className="text-sm font-medium text-slate-600">

                    Quotation total

                  </p>



                  <p className="mt-2 break-words text-2xl font-extrabold text-slate-900">

                    {formatUGX(grandTotal)}

                  </p>

                </div>



                <button

                  type="button"

                  onClick={previewQuote}

                  disabled={!settingsLoaded}

                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-3 font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"

                >

                  <FileText size={18} />

                  {settingsLoaded

                    ? "Preview quotation"

                    : "Loading business settings..."}

                </button>



                <button

                  type="button"

                  onClick={resetQuote}

                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50"

                >

                  Cancel quotation

                </button>

              </div>

            </aside>

          </div>

        </div>

      ) : (

        <section className="space-y-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <h3 className="text-lg font-bold text-slate-900">{activeTab === "quotations" ? "Your quotations" : activeTab === "invoices" ? "Sales invoices" : "Payment receipts"}</h3>
              <p className="mt-1 text-sm text-slate-500">
                {activeTab === "quotations" ? "Create quotations for equipment, installation and services." : activeTab === "invoices" ? "Generate professional invoices from saved sales." : "Print or save receipts for payments recorded against saved sales."}
              </p>
            </div>
            {activeTab === "quotations" ? (
              <button type="button" onClick={startNewQuote} className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-600"><Plus size={17} /> Create quotation</button>
            ) : (
              <button type="button" onClick={() => void loadSavedSales()} disabled={salesLoading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Search size={16} /> {salesLoading ? "Refreshing..." : "Refresh sales"}</button>
            )}
          </div>

          {activeTab === "quotations" ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <p className="text-sm text-slate-600">Your quotation builder remains unchanged and separate from POS sales.</p>
              <button type="button" onClick={startNewQuote} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white hover:bg-sky-600"><Plus size={17} /> Create quotation</button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-4">
                <label className="relative block max-w-lg"><span className="sr-only">Search sales</span><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={salesSearch} onChange={(event) => setSalesSearch(event.target.value)} placeholder="Search reference, customer, product or SKU..." className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
                </label>
              </div>
              {salesError && <div className="m-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">Could not load saved sales: {salesError}. Check that the backend is running and GET /api/sales is available.</div>}
              {salesLoading ? <p className="p-8 text-center text-sm text-slate-500">Loading saved sales...</p> : (
                <div className="overflow-x-auto"><table className="w-full min-w-[900px] border-collapse text-left">
                  <thead><tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-4">Sale reference</th><th className="px-4 py-4">Date</th><th className="px-4 py-4">Customer</th><th className="px-4 py-4 text-right">Total</th><th className="px-4 py-4 text-right">Paid</th><th className="px-4 py-4 text-right">Balance</th><th className="px-4 py-4">Status</th><th className="px-4 py-4">Document</th>
                  </tr></thead><tbody className="divide-y divide-slate-100">
                    {sales.filter((sale) => {
                      // A receipt should only be available when a payment was recorded.
                      if (activeTab === "receipts" && salePaid(sale) <= 0) return false;
                      const q = salesSearch.trim().toLowerCase();
                      return !q || saleReference(sale).toLowerCase().includes(q) || saleCustomerName(sale).toLowerCase().includes(q) || String(sale.paymentMethod || "").toLowerCase().includes(q) || (sale.items || []).some((item) => `${item.name || item.productName || item.description || ""} ${item.sku || ""}`.toLowerCase().includes(q));
                    }).map((sale) => {
                      const paid = salePaid(sale); const balance = saleBalance(sale); const status = salePaymentStatus(sale);
                      const date = sale.createdAt ? new Date(sale.createdAt) : null;
                      const doc: PrintableDocument = { sale, kind: activeTab === "invoices" ? "invoice" : "receipt" };
                      return <tr key={sale._id || sale.id || saleReference(sale)} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-4 py-4"><button type="button" onClick={() => setSelectedDocument(doc)} className="text-sm font-semibold text-sky-600 hover:underline">{saleReference(sale)}</button><p className="mt-1 text-xs text-slate-400">{(sale.items || []).length} line item(s)</p></td>
                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-500">{date && !Number.isNaN(date.getTime()) ? date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                        <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-slate-800">{saleCustomerName(sale)}</td>
                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm">{formatUGX(saleTotal(sale))}</td><td className="whitespace-nowrap px-4 py-4 text-right text-sm text-emerald-700">{formatUGX(paid)}</td><td className="whitespace-nowrap px-4 py-4 text-right text-sm text-amber-700">{formatUGX(balance)}</td>
                        <td className="whitespace-nowrap px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${balance <= 0 ? "bg-emerald-50 text-emerald-700" : paid > 0 ? "bg-amber-50 text-amber-700" : "bg-rose-50 text-rose-700"}`}>{status}</span></td>
                        <td className="whitespace-nowrap px-4 py-4"><button type="button" onClick={() => setSelectedDocument(doc)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">{activeTab === "invoices" ? <FileText size={14} /> : <Receipt size={14} />} Preview / print</button></td>
                      </tr>;
                    })}
                    {sales.filter((sale) => {
                      // A receipt should only be available when a payment was recorded.
                      if (activeTab === "receipts" && salePaid(sale) <= 0) return false;
                      const q = salesSearch.trim().toLowerCase();
                      return !q || saleReference(sale).toLowerCase().includes(q) || saleCustomerName(sale).toLowerCase().includes(q) || String(sale.paymentMethod || "").toLowerCase().includes(q) || (sale.items || []).some((item) => `${item.name || item.productName || item.description || ""} ${item.sku || ""}`.toLowerCase().includes(q));
                    }).length === 0 && <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-500">{salesError ? "Sales could not be loaded." : "No saved sales match your search."}</td></tr>}
                  </tbody>
                </table></div>
              )}
              <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400">{activeTab === "invoices" ? "Invoices are generated from saved sale details and show the outstanding balance." : "Receipts show the amount actually recorded as paid; unpaid balances remain visible."}</div>
            </div>
          )}
        </section>
      )}

      {selectedDocument && (
        <div className="fixed inset-0 z-[110] overflow-y-auto bg-slate-950/60 p-3 sm:p-6">
          <div className="mx-auto my-4 max-w-3xl rounded-2xl bg-white shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
              <div><h3 className="font-bold text-slate-900">{selectedDocument.kind === "invoice" ? "Invoice preview" : "Receipt preview"}</h3><p className="text-xs text-slate-500">Generated from saved POS sale {saleReference(selectedDocument.sale)}.</p></div>
              <div className="flex flex-wrap gap-2"><button type="button" onClick={() => printSavedDocument(selectedDocument)} className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"><Printer size={16} /> Print / Save PDF</button><button type="button" onClick={() => setSelectedDocument(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50">Close</button></div>
            </div>
            <div className="p-5 sm:p-7">
              <div className="flex flex-col justify-between gap-4 border-b-2 border-sky-500 pb-5 sm:flex-row">
                <div><div className="flex items-center gap-3">{companyLogo ? <img src={companyLogo} alt={`${companyName} logo`} className="h-14 w-14 object-contain" /> : <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500 font-extrabold text-white">MS</div>}<div><h4 className="font-bold text-slate-900">{companyName}</h4><p className="text-xs uppercase tracking-widest text-sky-600">Security Solutions</p></div></div>
                  <p className="mt-3 text-sm text-slate-500">{companyAddress}</p><p className="text-sm text-slate-500">{companyPhone}{companyPhone2 ? ` · ${companyPhone2}` : ""}</p>{companyPhone3 && <p className="text-sm text-slate-500">{companyPhone3}</p>}<p className="text-sm text-slate-500">{companyEmail}</p></div>
                <div className="sm:text-right"><h2 className="text-2xl font-extrabold">{selectedDocument.kind === "invoice" ? "INVOICE" : "RECEIPT"}</h2><p className="mt-1 text-sm font-bold text-sky-700">{selectedDocument.kind === "invoice" ? `INV-${saleReference(selectedDocument.sale).replace(/^MS-/, "")}` : saleReference(selectedDocument.sale)}</p><p className="text-sm text-slate-500">{selectedDocument.sale.createdAt ? new Date(selectedDocument.sale.createdAt).toLocaleString("en-GB") : "Date unavailable"}</p><p className="mt-2 text-sm">Payment status: <strong>{salePaymentStatus(selectedDocument.sale)}</strong></p></div>
              </div>
              <div className="mt-5 rounded-xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{selectedDocument.kind === "invoice" ? "Bill to" : "Payment received from"}</p><p className="mt-1 font-semibold">{saleCustomerName(selectedDocument.sale)}</p><p className="mt-2 text-sm text-slate-500">Payment method: {selectedDocument.sale.paymentMethod || "Not recorded"}</p></div>
              <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead><tr className="bg-slate-800 text-white"><th className="p-3">Description</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Unit price</th><th className="p-3 text-right">Line total</th></tr></thead><tbody>{(selectedDocument.sale.items || []).map((item, index) => <tr key={`${item.productId || item.sku || item.name || "line"}-${index}`} className="border-b border-slate-200"><td className="p-3">{item.name || item.productName || item.description || "Item"}{item.sku && <p className="text-xs text-slate-400">SKU: {item.sku}</p>}</td><td className="p-3 text-right">{item.quantity}</td><td className="p-3 text-right">{formatUGX(Number(item.unitPrice ?? item.price ?? 0))}</td><td className="p-3 text-right font-semibold">{formatUGX(Number(item.lineTotal ?? item.total ?? Number(item.quantity || 0) * Number(item.unitPrice ?? item.price ?? 0)))}</td></tr>)}</tbody></table></div>
              <div className="ml-auto mt-5 max-w-sm space-y-2 text-sm"><div className="flex justify-between gap-4"><span>Sale total</span><strong>{formatUGX(saleTotal(selectedDocument.sale))}</strong></div><div className="flex justify-between gap-4"><span>Amount paid</span><strong>{formatUGX(salePaid(selectedDocument.sale))}</strong></div><div className="flex justify-between gap-4"><span>Outstanding balance</span><strong>{formatUGX(saleBalance(selectedDocument.sale))}</strong></div>{selectedDocument.kind === "receipt" && Number(selectedDocument.sale.change || 0) > 0 && <div className="flex justify-between gap-4"><span>Change given</span><strong>{formatUGX(Number(selectedDocument.sale.change))}</strong></div>}</div>
              <p className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500">Generated from a saved POS transaction. Choose Print / Save PDF to print or download a PDF copy.</p>
            </div>
          </div>
        </div>
      )}

      {/* Show the quotation preview only after the user validates the draft. */}

      {showPreview && (

        <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/60 p-3 sm:p-6">

          <div className="mx-auto my-4 max-w-4xl rounded-2xl bg-white shadow-2xl">



            {/* Preview controls are excluded from the printed document. */}

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4 print:hidden">

              <div>

                <h3 className="font-bold text-slate-900">

                  Quotation preview

                </h3>

                <p className="text-xs text-slate-500">

                  Review your quotation before printing or saving as PDF.

                </p>

              </div>



              <div className="flex gap-2">

                <button

  type="button"

  onClick={printQuotation}

  className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"

>

  <Printer size={16} />

  Print / Save PDF

</button>

                <button

                  type="button"

                  onClick={() => setShowPreview(false)}

                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"

                >

                  Back to edit

                </button>

              </div>

            </div>



            {/* This article is the printable A4 quotation document. */}

            <article

              id="quotation-print"

              className="p-6 text-slate-800 sm:p-10 print:p-0"

            >

              {/* Business identity and quotation reference. */}

              <div className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-sky-500 pb-5">

                <div className="min-w-0 flex-1">

                  <div className="flex items-center gap-3">

                    {companyLogo ? (

                      /* Use the logo URL stored in business Settings. */

                      <img

                        src={companyLogo}

                        alt={`${companyName} logo`}

                        className="h-16 w-16 rounded-lg object-contain"

                      />

                    ) : (

                      /* Fallback mark if no logo URL has been saved. */

                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500 font-extrabold text-white">

                        MS

                      </div>

                    )}



                    <div>

                      <p className="text-lg font-extrabold tracking-wide">

                        {companyName}

                      </p>

                      <p className="text-xs uppercase tracking-[0.2em] text-sky-600">

                        Security Solutions

                      </p>

                    </div>

                  </div>



                  {/* Company contacts appear in a consistent order. */}

                  <div className="mt-4 space-y-1 text-sm text-slate-600">

                    <p>{companyAddress}</p>

                    <p>{companyPhone}</p>



                    {companyPhone2 && <p>{companyPhone2}</p>}

                    {companyPhone3 && <p>{companyPhone3}</p>}



                    <p>{companyEmail}</p>

                  </div>

                </div>



                <div className="min-w-0 text-left sm:text-right">

                  <h2 className="text-3xl font-extrabold tracking-wide">

                    QUOTATION

                  </h2>



                  <p className="mt-2 break-all font-bold text-sky-700">

                    {quoteNumber}

                  </p>



                  <p className="mt-1 text-sm text-slate-500">

                    Date:{" "}

                    {new Date().toLocaleDateString("en-GB")}

                  </p>



                  <p className="text-sm text-slate-500">

                    Valid for: {validDays} days

                  </p>

                </div>

              </div>



              {/* Customer details are separated from the company details. */}

              <div className="my-6 rounded-lg bg-slate-50 p-4">

                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">

                  Quotation prepared for

                </p>



                <p className="mt-2 font-bold">{customer}</p>



                {customerPhone && (

                  <p className="mt-1 text-sm">{customerPhone}</p>

                )}



                {customerAddress && (

                  <p className="mt-1 text-sm">{customerAddress}</p>

                )}

              </div>



              {/* Quotation items and line totals. */}

              <table className="w-full border-collapse text-left text-sm">

                <thead>

                  <tr className="bg-slate-800 text-white">

                    <th className="p-3">Description</th>

                    <th className="p-3 text-right">Qty</th>

                    <th className="p-3 text-right">Unit price</th>

                    <th className="p-3 text-right">Total</th>

                  </tr>

                </thead>



                <tbody>

                  {items

                    .filter((item) => item.description.trim())

                    .map((item) => (

                      <tr

                        key={item.id}

                        className="border-b border-slate-200"

                      >

                        <td className="break-words p-3">

                          {item.description}

                        </td>



                        <td className="p-3 text-right">

                          {item.quantity}

                        </td>



                        <td className="p-3 text-right">

                          {formatUGX(item.unitPrice)}

                        </td>



                        <td className="p-3 text-right font-semibold">

                          {formatUGX(

                            item.quantity * item.unitPrice,

                          )}

                        </td>

                      </tr>

                    ))}

                </tbody>

              </table>



              {/* Totals use the same calculations as the quotation summary. */}

              <div className="ml-auto mt-6 w-full max-w-sm space-y-3 text-sm">

                <div className="flex justify-between gap-3">

                  <span>Subtotal</span>

                  <span>{formatUGX(subtotal)}</span>

                </div>



                <div className="flex justify-between gap-3">

                  <span>Discount</span>

                  <span>− {formatUGX(discountAmount)}</span>

                </div>



                {/* Do not display an 18% charge when tax is disabled. */}

                {/* Display tax only when the quotation checkbox is selected. */}

{taxEnabled && (

  <div className="flex justify-between gap-3">

    <span>

      {settingText("taxLabel", "Tax")} ({configuredTaxRate}%)

    </span>

    <span>{formatUGX(taxAmount)}</span>

  </div>

)}



                <div className="flex justify-between gap-3 border-t border-slate-300 pt-3 text-lg font-extrabold">

                  <span>Quotation total</span>

                  <span>{formatUGX(grandTotal)}</span>

                </div>

              </div>



              {/* Include additional instructions only when the user entered notes. */}

              {notes.trim() && (

                <div className="mt-7">

                  <h4 className="font-bold">Additional notes</h4>

                  <p className="mt-2 whitespace-pre-line text-sm leading-6">

                    {notes}

                  </p>

                </div>

              )}



              {/* Show the terms loaded from Settings or edited for this draft. */}

              <div className="mt-7">

                <h4 className="font-bold">Terms and conditions</h4>

                <p className="mt-2 whitespace-pre-line text-sm leading-6">

                  {terms}

                </p>

              </div>



              {/* Payment instructions are sourced from the saved settings. */}

              {(bankName ||

                bankAccountName ||

                bankAccountNumber ||

                bankBranch ||

                mtnPaymentNumber ||

                airtelPaymentNumber) && (

                <div className="mt-7 border-t border-slate-200 pt-5">

                  <h4 className="font-bold">Payment instructions</h4>



                  {bankName && (

                    <div className="mt-3">

                      <p className="text-sm font-semibold">

                        Bank transfer

                      </p>



                      <div className="mt-1 space-y-1 text-sm text-slate-600">

                        <p>Bank: {bankName}</p>



                        {bankAccountName && (

                          <p>Account name: {bankAccountName}</p>

                        )}



                        {bankAccountNumber && (

                          <p>Account number: {bankAccountNumber}</p>

                        )}



                        {bankBranch && <p>Branch: {bankBranch}</p>}

                      </div>

                    </div>

                  )}



                  {mtnPaymentNumber && (

                    <div className="mt-3">

                      <p className="text-sm font-semibold">

                        MTN Mobile Money

                      </p>

                      <p className="text-sm text-slate-600">

                        Number: {mtnPaymentNumber}

                      </p>



                      {mtnAccountName && (

                        <p className="text-sm text-slate-600">

                          Registered name: {mtnAccountName}

                        </p>

                      )}

                    </div>

                  )}



                  {airtelPaymentNumber && (

                    <div className="mt-3">

                      <p className="text-sm font-semibold">

                        Airtel Money

                      </p>

                      <p className="text-sm text-slate-600">

                        Number: {airtelPaymentNumber}

                      </p>



                      {airtelAccountName && (

                        <p className="text-sm text-slate-600">

                          Registered name: {airtelAccountName}

                        </p>

                      )}

                    </div>

                  )}

                </div>

              )}



              {/* Footer and warranty details. */}

              <div className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-500">

                <p>

                  Thank you for considering {companyName}.

                </p>



                <p className="mt-1">

                  Please reference {quoteNumber} when discussing

                  this quotation.

                </p>



                {warrantyDuration && (

                  <p className="mt-1">

                    Warranty: {warrantyDuration}, subject to the

                    applicable warranty conditions and exclusions.

                  </p>

                )}

              </div>



            </article>

          </div>

        </div>

      )}



    </div>

  );

}
