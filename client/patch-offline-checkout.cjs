const fs = require("node:fs");
const path = require("node:path");

const file = path.join("src", "pages", "POSPage.tsx");
let source = fs.readFileSync(file, "utf8");

if (source.includes("OFFLINE_CHECKOUT_QUEUE_V1")) {
  console.log("Offline checkout patch already exists; no changes made.");
  process.exit(0);
}

const reactImport = 'import { useEffect, useMemo, useState } from "react";';
const apiImport = 'import { apiFetch } from "../lib/api";';
const componentMarker = "export default function POSPage() {";
const startMarker =
  "  // Submit the sale. The server must validate stock and calculate trusted totals.";
const endMarker = "  function printReceipt() {";

for (const [marker, description] of [
  [reactImport, "React import"],
  [apiImport, "API import"],
  [componentMarker, "POSPage component"],
  [startMarker, "checkout function"],
  [endMarker, "receipt function"],
]) {
  if (!source.includes(marker)) {
    throw new Error(`Missing ${description}. No changes made.`);
  }
}

if (!source.includes("recordLocalSaleWithPayload")) {
  const serviceImport =
    'import { recordLocalSaleWithPayload } from "../db/offlineService";';
  source = source.replace(apiImport, `${apiImport}\n${serviceImport}`);
}

source = source.replace(
  reactImport,
  'import { useEffect, useMemo, useRef, useState } from "react";'
);

source = source.replace(
  componentMarker,
  `${componentMarker}\n  const saleRequestIdRef = useRef<string | null>(null);`
);

const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start);

if (start < 0 || end <= start) {
  throw new Error("Checkout boundaries are invalid. No changes made.");
}

const newFunction = String.raw`  // OFFLINE_CHECKOUT_QUEUE_V1
  // A stable ID allows a retry to reuse the same server-side sale identity.
  async function confirmSale() {
    if (submitting) return;

    setSubmitting(true);
    setMessage("");
    setMessageIsError(false);

    const clientSaleId =
      saleRequestIdRef.current ??
      (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : \`sale-\${Date.now()}-\${Math.random().toString(36).slice(2)}\`);

    saleRequestIdRef.current = clientSaleId;

    const requestPayload: Record<string, unknown> = {
      clientSaleId,
      customer: customerName.trim() || "Walk-in customer",
      customerName: customerName.trim() || "Walk-in customer",
      customerPhone: customerPhone.trim(),
      customerEmail: customerEmail.trim(),
      customerAddress: customerAddress.trim(),
      customerType,
      paymentMethod,
      amountPaid: paidInput,
      overallDiscount: discount,
      taxEnabled,
      items: cart.map((item) => ({
        productId: getProductId(item.product),
        quantity: item.quantity,
        discount: item.discount,
      })),
    };

    try {
      const response = await apiFetch(\`\${API_BASE_URL}/api/sales\`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestPayload),
      });

      const data = await response.json();

      if (!response.ok || !data.success || !data.sale) {
        throw new Error(data.message || "The sale could not be saved.");
      }

      setSavedSale(data.sale as SavedSale);
      setShowConfirmation(false);
      setMessage(\`Sale saved successfully. Receipt \${data.sale.receiptNumber}.\`);
      setMessageIsError(false);
      saleRequestIdRef.current = null;
      setCart([]);
      setAmountPaid("0");
      setOverallDiscount("0");
      await loadProducts();
    } catch (error) {
      const isNetworkFailure =
        !navigator.onLine ||
        error instanceof TypeError ||
        (error instanceof Error &&
          /failed to fetch|networkerror|network request failed|load failed/i.test(error.message));

      if (!isNetworkFailure) {
        setMessage(
          error instanceof Error ? error.message : "Could not complete the sale."
        );
        setMessageIsError(true);
        // Keep the request ID for a safe retry of the same checkout.
        return;
      }

      try {
        const localItems = cart.map((item) => {
          const gross = item.product.sellingPrice * item.quantity;
          const lineDiscount = Math.round(gross * (item.discount / 100));

          return {
            productId: getProductId(item.product),
            productName: item.product.name,
            quantity: item.quantity,
            unitPrice: item.product.sellingPrice,
            lineTotal: gross - lineDiscount,
          };
        });

        const localReceipt =
          \`PENDING-\${clientSaleId.slice(0, 8).toUpperCase()}\`;

        await recordLocalSaleWithPayload(
          {
            id: clientSaleId,
            receiptNumber: localReceipt,
            items: localItems,
            subtotal,
            taxAmount: tax,
            total: grandTotal,
            paymentMethod,
            createdAt: new Date().toISOString(),
            syncStatus: "pending",
          },
          requestPayload
        );

        const localSale: SavedSale = {
          id: clientSaleId,
          receiptNumber: localReceipt,
          customer: customerName.trim() || "Walk-in customer",
          customerName: customerName.trim() || "Walk-in customer",
          customerPhone: customerPhone.trim(),
          customerEmail: customerEmail.trim(),
          customerAddress: customerAddress.trim(),
          customerType,
          items: cart.map((item) => {
            const gross = item.product.sellingPrice * item.quantity;
            const discountAmount = Math.round(gross * (item.discount / 100));

            return {
              name: item.product.name,
              sku: item.product.sku,
              unitPrice: item.product.sellingPrice,
              quantity: item.quantity,
              discountPercent: item.discount,
              discountAmount,
              lineTotal: gross - discountAmount,
            };
          }),
          subtotal,
          lineDiscountTotal,
          overallDiscount: discount,
          taxEnabled,
          taxLabel,
          taxRate,
          tax,
          grandTotal,
          paymentMethod,
          amountPaid: paid,
          balance,
          change,
          paymentStatus:
            paid >= grandTotal ? "paid" : paid > 0 ? "partial" : "unpaid",
          createdAt: new Date().toISOString(),
        };

        setSavedSale(localSale);
        setShowConfirmation(false);
        setMessage(
          \`Sale saved locally as \${localReceipt}. Synchronization is pending; do not enter it again.\`
        );
        setMessageIsError(false);
        saleRequestIdRef.current = null;
        setCart([]);
        setAmountPaid("0");
        setOverallDiscount("0");
      } catch (queueError) {
        setMessage(
          \`The sale could not be confirmed or saved locally. Keep this checkout open and do not submit a second sale. \${queueError instanceof Error ? queueError.message : ""}\`
        );
        setMessageIsError(true);
      }
    } finally {
      setSubmitting(false);
    }
  }

`;

const updated = source.slice(0, start) + newFunction + source.slice(end);
const backup = `${file}.before-offline-checkout.bak`;

fs.copyFileSync(file, backup);
fs.writeFileSync(file, updated, "utf8");

console.log(`Offline checkout patch applied. Backup: ${backup}`);
