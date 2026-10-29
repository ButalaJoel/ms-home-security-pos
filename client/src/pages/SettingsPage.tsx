
import { useEffect, useRef, useState } from "react";
import {
  Building2,
  Globe,
  FileText,
  Package,
  Receipt,
  Users,
  Database,
  Wifi,
  ChevronRight,
  Upload,
  Save,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  LoaderCircle,
  CreditCard,
  ShieldCheck,
} from "lucide-react";
import { apiFetch } from "../lib/api";
import UsersPage from "./UsersPage";
import { useAuth } from "../context/AuthContext";

type SettingSection =
  | "business"
  | "regional"
  | "documents"
  | "payments"
  | "inventory"
  | "tax"
  | "users"
  | "backups"
  | "sync";

const initialSettings = {
  businessName: "MS Home Security Solutions",
  phone: "+256 759 985 611",
  phone2: "+256 792 977 212",
  phone3: "+256 740 853 303",
  email: "msh0mesecuritysolutionsug01@gmail.com",
  address: "TEC Plaza",
  currency: "UGX",
  country: "Uganda",
  timezone: "Africa/Kampala",
  dateFormat: "DD/MM/YYYY",
  invoicePrefix: "INV",
  receiptPrefix: "REC",
  quotePrefix: "QUO",
  quotationValidityDays: "30",
  paymentTerms: "full_purchase_installment_project",
  lowStockThreshold: "5",
  defaultUnit: "Pieces",
  taxEnabled: false,
  taxLabel: "Tax",
  taxRate: "0",
  bankName: "Standard Chartered",
  bankAccountName: "MATOVU HUSSEIN",
  bankAccountNumber: "0100829916100",
  bankBranch: "",
  mtnRegisteredName: "",
  mtnPaymentNumber: "",
  airtelRegisteredName: "Matovu Hussein",
  airtelPaymentNumber: "+256759985611",
  warrantyDuration: "6 months",
  termsAndConditions:
    "1. Product purchases require full payment unless otherwise agreed.\n" +
    "2. Installation projects follow a 50% deposit, 30% progress payment and 20% on completion.\n" +
    "3. Goods sold are not returnable, subject to applicable law and warranty obligations.\n" +
    "4. Products carry a 6-month warranty, subject to applicable terms and exclusions.\n" +
    "5. Quotations are valid for 30 days unless otherwise stated.",
  logoUrl: "",
};

type BusinessSettings = typeof initialSettings;

const sections: {
  id: SettingSection;
  label: string;
  icon: typeof Building2;
}[] = [
  { id: "business", label: "Business profile", icon: Building2 },
  { id: "regional", label: "Regional preferences", icon: Globe },
  { id: "documents", label: "Invoices & terms", icon: FileText },
  { id: "payments", label: "Payment accounts", icon: CreditCard },
  { id: "inventory", label: "Inventory defaults", icon: Package },
  { id: "tax", label: "Tax settings", icon: Receipt },
  { id: "users", label: "Users & permissions", icon: Users },
  { id: "backups", label: "Data & backups", icon: Database },
  { id: "sync", label: "Connection & sync", icon: Wifi },
];

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000"
).replace(/\/$/, "");

const inputClass =
  "mt-2 w-full min-w-0 rounded-lg border border-[#cbd7e8] bg-white px-3 py-2.5 text-sm text-[#10213b] outline-none transition focus:border-[#08a9df] focus:ring-2 focus:ring-[#08a9df]/10";

const labelClass = "block text-xs font-medium text-[#526985]";

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeSection, setActiveSection] =
    useState<SettingSection>("business");

  const [settings, setSettings] =
    useState<BusinessSettings>(initialSettings);

  const [savedSettings, setSavedSettings] =
    useState<BusinessSettings>(initialSettings);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [loadError, setLoadError] = useState("");

  const logoInputRef = useRef<HTMLInputElement>(null);

  // Load saved settings, retaining defaults for newly added fields.
  useEffect(() => {
    let cancelled = false;

    async function loadSettings() {
      setIsLoading(true);
      setLoadError("");

      try {
        const response = await apiFetch(`${API_URL}/api/settings`);

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            result.message ||
              `Could not load settings. Server returned ${response.status}.`,
          );
        }

        const data = result.settings ?? result;

const loaded: BusinessSettings = {
  ...initialSettings,
  ...data,
  logoUrl:
    typeof data.logoUrl === "string"
      ? data.logoUrl
      : "",
};

        if (!cancelled) {
          setSettings(loaded);
          setSavedSettings(loaded);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Could not connect to the settings API.",
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  const updateSetting = (
    field: keyof BusinessSettings,
    value: string | boolean,
  ) => {
    setSettings((current) => ({
      ...current,
      [field]: value,
    }));

    setSaveMessage("");
    setLoadError("");
  };

  // Save the complete settings object through the existing API.
  const saveSettings = async () => {
    setIsSaving(true);
    setSaveMessage("");
    setLoadError("");

    try {
      const response = await apiFetch(`${API_URL}/api/settings`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(settings),
      });

      const result: {
        message?: string;
        settings?: Partial<BusinessSettings>;
      } = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.message ||
            `Could not save settings. Server returned ${response.status}.`,
        );
      }

      const persisted: BusinessSettings = {
        ...initialSettings,
        ...settings,
        ...(result.settings || {}),
      };

      setSettings(persisted);
      setSavedSettings(persisted);
      setSaveMessage(result.message || "Settings saved successfully.");
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not save settings. Check your server connection.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Upload the logo through Express to Cloudinary.
  const uploadBusinessLogo = async (file: File) => {
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setLoadError("Choose a PNG, JPEG or WebP image.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setLoadError("The logo must be 5 MB or smaller.");
      return;
    }

    setIsUploadingLogo(true);
    setSaveMessage("");
    setLoadError("");

    try {
      const formData = new FormData();
      formData.append("logo", file);

      const response = await apiFetch(`${API_URL}/api/settings/logo`, {
        method: "POST",
        body: formData,
      });

      const result: {
        message?: string;
        logoUrl?: string;
      } = await response.json().catch(() => ({}));

      if (!response.ok || !result.logoUrl) {
        throw new Error(
          result.message || "Could not upload the business logo.",
        );
      }

      setSettings((current) => ({
        ...current,
        logoUrl: result.logoUrl!,
      }));

      setSavedSettings((current) => ({
        ...current,
        logoUrl: result.logoUrl!,
      }));

      setSaveMessage(
        result.message || "Business logo uploaded and saved successfully.",
      );
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Could not upload the business logo.",
      );
    } finally {
      setIsUploadingLogo(false);

      if (logoInputRef.current) {
        logoInputRef.current.value = "";
      }
    }
  };

  const discardChanges = () => {
    setSettings({ ...savedSettings });
    setSaveMessage("");
    setLoadError("");
  };

  const renderField = (
    label: string,
    field: keyof BusinessSettings,
    type = "text",
    placeholder?: string,
  ) => (
    <label className={labelClass} key={field}>
      {label}
      <input
        type={type}
        min={type === "number" ? 0 : undefined}
        className={inputClass}
        value={String(settings[field])}
        placeholder={placeholder}
        onChange={(event) =>
          updateSetting(field, event.target.value)
        }
      />
    </label>
  );

  const renderSelect = (
    label: string,
    field: keyof BusinessSettings,
    options: { label: string; value: string }[],
  ) => (
    <label className={labelClass} key={field}>
      {label}
      <select
        className={inputClass}
        value={String(settings[field])}
        onChange={(event) =>
          updateSetting(field, event.target.value)
        }
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  const renderTextarea = (
    label: string,
    field: keyof BusinessSettings,
    rows = 7,
  ) => (
    <label className={labelClass} key={field}>
      {label}
      <textarea
        rows={rows}
        className={`${inputClass} resize-y leading-6`}
        value={String(settings[field])}
        onChange={(event) =>
          updateSetting(field, event.target.value)
        }
      />
    </label>
  );

  const sectionHeading = (title: string, description: string) => (
    <div className="border-b border-[#dce5f0] pb-5">
      <h2 className="font-semibold text-[#10213b]">{title}</h2>
      <p className="mt-1 text-xs text-[#7a8eaa]">{description}</p>
    </div>
  );

  const renderComingSoon = (
    title: string,
    description: string,
    Icon: typeof Building2,
  ) => (
    <div className="flex min-h-[300px] flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-5 rounded-full bg-[#f1f6fb] p-4">
        <Icon size={34} className="text-[#94a6bf]" />
      </div>
      <h3 className="text-sm font-semibold text-[#10213b]">{title}</h3>
      <p className="mt-2 max-w-md text-sm leading-6 text-[#7a8eaa]">
        {description}
      </p>
      <p className="mt-3 text-xs text-[#94a6bf]">
        Configuration will be connected in a later phase.
      </p>
    </div>
  );

  const renderSection = () => {
    switch (activeSection) {
      case "business":
        return (
          <>
            {sectionHeading(
              "Business profile",
              "Company details displayed on quotations, invoices and receipts.",
            )}

            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#dce5f0] py-5">
              <div className="flex min-w-0 items-center gap-3">
                {settings.logoUrl ? (
                  <img
                    src={settings.logoUrl}
                    alt="Business logo"
                    className="h-14 w-14 rounded-xl border border-[#dce5f0] bg-white object-contain p-1"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#08a9df] text-lg font-bold text-white">
                    MS
                  </div>
                )}

                <div>
                  <p className="text-sm font-bold text-[#10213b]">
                    {settings.businessName || "MS HOME SECURITY"}
                  </p>
                  <p className="text-[10px] font-semibold tracking-[0.25em] text-[#08a9df]">
                    SOLUTIONS
                  </p>
                </div>
              </div>

              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={isUploadingLogo}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void uploadBusinessLogo(file);
                }}
              />

              <button
                type="button"
                disabled={isUploadingLogo}
                onClick={() => logoInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-[#cbd7e8] px-3 py-2 text-xs font-medium hover:bg-[#f7fafc] disabled:opacity-50"
              >
                {isUploadingLogo ? (
                  <LoaderCircle size={15} className="animate-spin" />
                ) : (
                  <Upload size={15} />
                )}
                {isUploadingLogo ? "Uploading..." : "Replace logo"}
              </button>

              <p className="w-full text-xs text-[#7a8eaa]">
                PNG, JPEG or WebP · Maximum 5 MB.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-5 py-5 sm:grid-cols-2">
              {renderField("Business name", "businessName")}
              {renderField("Primary phone", "phone", "tel")}
              {renderField("Additional phone 2", "phone2", "tel")}
              {renderField("Additional phone 3", "phone3", "tel")}
              {renderField("Business email", "email", "email")}
              {renderField("Physical address", "address")}
            </div>
          </>
        );

      case "regional":
        return (
          <>
            {sectionHeading(
              "Regional preferences",
              "Set currency, country, date format and time zone.",
            )}
            <div className="grid grid-cols-1 gap-5 py-5 sm:grid-cols-2">
              {renderSelect("Business country", "country", [
                { label: "Uganda", value: "Uganda" },
                { label: "Kenya", value: "Kenya" },
                { label: "Tanzania", value: "Tanzania" },
                { label: "Rwanda", value: "Rwanda" },
              ])}
              {renderSelect("Currency", "currency", [
                { label: "UGX — Ugandan Shilling", value: "UGX" },
                { label: "USD — US Dollar", value: "USD" },
                { label: "KES — Kenyan Shilling", value: "KES" },
                { label: "TZS — Tanzanian Shilling", value: "TZS" },
              ])}
              {renderSelect("Time zone", "timezone", [
                { label: "Africa/Kampala", value: "Africa/Kampala" },
                { label: "Africa/Nairobi", value: "Africa/Nairobi" },
                {
                  label: "Africa/Dar_es_Salaam",
                  value: "Africa/Dar_es_Salaam",
                },
              ])}
              {renderSelect("Date format", "dateFormat", [
                { label: "DD/MM/YYYY", value: "DD/MM/YYYY" },
                { label: "MM/DD/YYYY", value: "MM/DD/YYYY" },
                { label: "YYYY-MM-DD", value: "YYYY-MM-DD" },
              ])}
            </div>
          </>
        );

      case "documents":
        return (
          <>
            {sectionHeading(
              "Invoices, quotations & terms",
              "Configure document numbering, quotation validity and short terms.",
            )}

            <div className="grid grid-cols-1 gap-5 py-5 sm:grid-cols-2">
              {renderField("Invoice number prefix", "invoicePrefix")}
              {renderField("Receipt number prefix", "receiptPrefix")}
              {renderField("Quotation number prefix", "quotePrefix")}
              {renderField(
                "Quotation validity (days)",
                "quotationValidityDays",
                "number",
              )}
              {renderSelect("Default payment arrangement", "paymentTerms", [
                {
                  label:
                    "Full payment for products; 50/30/20 for installation",
                  value: "full_purchase_installment_project",
                },
                {
                  label: "Full payment before supply",
                  value: "full_payment_before_supply",
                },
                {
                  label: "50% deposit, 30% progress, 20% completion",
                  value: "50_30_20_installation",
                },
              ])}
              {renderField("Warranty duration", "warrantyDuration")}
            </div>

            <div className="mb-5 rounded-lg border border-[#dce5f0] bg-[#f8fbfe] p-4 text-xs leading-5 text-[#627995]">
              <FileText size={17} className="mb-2 text-[#08a9df]" />
              <p className="font-semibold text-[#10213b]">
                Document terms
              </p>
              <p className="mt-2 whitespace-pre-line">
                {settings.termsAndConditions}
              </p>
            </div>

            {renderTextarea(
              "Terms and conditions (printed on documents)",
              "termsAndConditions",
              8,
            )}
          </>
        );

      case "payments":
        return (
          <>
            {sectionHeading(
              "Payment accounts",
              "Only use confirmed account details on customer documents.",
            )}

            <div className="mt-5 rounded-lg border border-[#dce5f0] p-4">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#10213b]">
                <CreditCard size={17} className="text-[#08a9df]" />
                Bank account
              </h3>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {renderField("Bank name", "bankName")}
                {renderField("Account name", "bankAccountName")}
                {renderField("Account number", "bankAccountNumber")}
                {renderField(
                  "Bank branch (not provided)",
                  "bankBranch",
                  "text",
                  "Enter confirmed branch",
                )}
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-[#dce5f0] p-4">
              <h3 className="mb-4 text-sm font-semibold text-[#10213b]">
                MTN Mobile Money
              </h3>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {renderField(
                  "Registered name (not provided)",
                  "mtnRegisteredName",
                  "text",
                  "Enter confirmed registered name",
                )}
                {renderField(
                  "Payment number (not provided)",
                  "mtnPaymentNumber",
                  "tel",
                  "Enter confirmed MTN number",
                )}
              </div>
            </div>

            <div className="mt-5 rounded-lg border border-[#dce5f0] p-4">
              <h3 className="mb-4 text-sm font-semibold text-[#10213b]">
                Airtel Money
              </h3>
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                {renderField(
                  "Registered name",
                  "airtelRegisteredName",
                )}
                {renderField(
                  "Payment number",
                  "airtelPaymentNumber",
                  "tel",
                )}
              </div>
            </div>

            <div className="mt-5 flex gap-3 rounded-lg border border-[#dce5f0] bg-[#f8fbfe] p-4 text-xs leading-5 text-[#627995]">
              <ShieldCheck size={18} className="shrink-0 text-[#08a9df]" />
              <p>
                Verify payment account details before printing them on
                customer documents. Unconfirmed MTN details and bank
                branch remain blank.
              </p>
            </div>
          </>
        );

      case "inventory":
        return (
          <>
            {sectionHeading(
              "Inventory defaults",
              "Configure default units and low-stock alerts.",
            )}
            <div className="grid grid-cols-1 gap-5 py-5 sm:grid-cols-2">
              {renderField(
                "Low-stock alert threshold",
                "lowStockThreshold",
                "number",
              )}
              {renderSelect("Default stock unit", "defaultUnit", [
                { label: "Pieces", value: "Pieces" },
                { label: "Boxes", value: "Boxes" },
                { label: "Pairs", value: "Pairs" },
                { label: "Metres", value: "Metres" },
                { label: "Sets", value: "Sets" },
              ])}
            </div>
            <div className="rounded-lg border border-[#dce5f0] bg-[#f8fbfe] p-4 text-xs leading-5 text-[#627995]">
              <Package size={17} className="mb-2 text-[#08a9df]" />
              Inventory workflows must read these settings to apply
              stock alerts and product-unit validation.
            </div>
          </>
        );

      case "tax":
        return (
          <>
            {sectionHeading(
              "Tax settings",
              "Tax remains disabled unless the business confirms its tax treatment.",
            )}

            <div className="mt-5 flex gap-3 rounded-lg border border-[#ffcf83] bg-[#fff8e9] p-4">
              <AlertTriangle
                size={20}
                className="mt-0.5 shrink-0 text-[#b66a00]"
              />
              <div>
                <p className="text-sm font-semibold text-[#8e5000]">
                  Tax is disabled by default
                </p>
                <p className="mt-1 text-xs leading-5 text-[#9c6a27]">
                  These settings do not establish VAT registration or
                  EFRIS compliance.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 border-b border-[#dce5f0] py-5">
              <div>
                <p className="text-sm font-semibold text-[#10213b]">
                  Apply tax to sales
                </p>
                <p className="mt-1 text-xs text-[#7a8eaa]">
                  {settings.taxEnabled
                    ? "Currently enabled"
                    : "Currently disabled"}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-label="Apply tax to sales"
                aria-checked={settings.taxEnabled}
                onClick={() =>
                  updateSetting("taxEnabled", !settings.taxEnabled)
                }
                className={`relative h-6 w-11 rounded-full transition ${
                  settings.taxEnabled ? "bg-[#08a9df]" : "bg-[#cbd5e1]"
                }`}
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${
                    settings.taxEnabled ? "left-6" : "left-1"
                  }`}
                />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-5 py-5 sm:grid-cols-2">
              {renderField("Tax label", "taxLabel")}
              {renderField("Tax rate (%)", "taxRate", "number")}
            </div>
          </>
        );

      case "users":
        return <UsersPage />;

      case "backups":
        return renderComingSoon(
          "Data & backups",
          "Backup scheduling, data export, restore tools and recovery controls will be configured here.",
          Database,
        );

      case "sync":
        return (
          <>
            {sectionHeading(
              "Connection & sync",
              "Connection and synchronisation status for the shop system.",
            )}
            <div className="mt-5 flex flex-wrap items-center gap-4 rounded-lg border border-[#a9e7bf] bg-[#eaf9ef] p-4">
              <div className="rounded-full bg-[#16a34a] p-3 text-white">
                <Wifi size={20} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-[#14532d]">
                  Interface preview
                </p>
                <p className="mt-1 text-xs text-[#43815b]">
                  Live connection and synchronisation status are not
                  connected yet.
                </p>
              </div>
              <span className="text-xs font-semibold text-[#15803d]">
                Demo
              </span>
            </div>
          </>
        );
    }
  };

  const active = sections.find(
    (section) => section.id === activeSection,
  )!;

  return (
    <div className="min-h-full bg-[#f3f7fb] p-4 sm:p-6 lg:p-7">
      <div className="mb-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#08a9df]">
          System configuration
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-[#10213b]">
          Settings
        </h1>
        <p className="mt-2 text-sm text-[#637b99]">
          Manage company details, payment accounts, documents and system
          preferences.
        </p>
      </div>

      {saveMessage && (
        <div
          role="status"
          className="mb-5 flex items-center gap-2 rounded-lg border border-[#b7e6ca] bg-[#edfaf1] px-4 py-3 text-sm text-[#166534]"
        >
          <CheckCircle2 size={17} />
          {saveMessage}
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="mb-5 flex items-center gap-2 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]"
        >
          <AlertTriangle size={17} />
          {loadError}
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-5">
        <nav
          aria-label="Settings sections"
          className="rounded-xl border border-[#dce5f0] bg-white p-2 shadow-sm"
        >
          {sections.filter((section) => section.id !== "users" || user?.role === "admin").map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;

            return (
              <button
                type="button"
                key={section.id}
                aria-current={isActive ? "page" : undefined}
                onClick={() => {
                  setActiveSection(section.id);
                  setSaveMessage("");
                  setLoadError("");
                }}
                className={`mb-1 flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left text-xs transition last:mb-0 ${
                  isActive
                    ? "bg-[#e7f7fd] font-semibold text-[#008fc4]"
                    : "text-[#526985] hover:bg-[#f3f7fb] hover:text-[#008fc4]"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon size={16} />
                  {section.label}
                </span>
                <ChevronRight size={15} />
              </button>
            );
          })}
        </nav>

        <section className="min-w-0 rounded-xl border border-[#dce5f0] bg-white p-5 shadow-sm sm:p-6 lg:p-7">
          {isLoading ? (
            <div
              className="flex min-h-[280px] items-center justify-center gap-2 text-sm text-[#637b99]"
              role="status"
            >
              <LoaderCircle size={18} className="animate-spin" />
              Loading saved settings…
            </div>
          ) : (
            renderSection()
          )}

          {activeSection !== "users" && (
          <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-[#dce5f0] pt-5">
            <button
              type="button"
              onClick={discardChanges}
              disabled={isLoading || isSaving || isUploadingLogo}
              className="inline-flex items-center gap-2 rounded-lg border border-[#cbd7e8] px-4 py-2.5 text-xs font-semibold text-[#10213b] transition hover:bg-[#f7fafc] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw size={14} />
              Discard changes
            </button>

            <button
              type="button"
              onClick={() => void saveSettings()}
              disabled={isLoading || isSaving || isUploadingLogo}
              className="inline-flex items-center gap-2 rounded-lg bg-[#08a9df] px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#078cba] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? (
                <LoaderCircle size={14} className="animate-spin" />
              ) : (
                <Save size={14} />
              )}
              {isSaving ? "Saving…" : "Save settings"}
            </button>
          </div>
          )}



          <p className={`mt-4 text-[11px] leading-5 text-[#8a9db6] ${activeSection === "users" ? "hidden" : ""}`}>
            Active section: {active.label}. Settings are loaded from and
            saved through the connected backend.
          </p>
        </section>
      </div>
    </div>
  );
}
