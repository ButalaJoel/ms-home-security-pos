# Handover: MS Home Security Solutions — public website (connected to the POS)

Written 9 Nov 2026 at the end of the POS build chat. Read this before starting. The developer is **Joel** (designer/developer, React, VS Code, Windows). He pushes to GitHub himself from the VS Code terminal; the assistant writes changes into his project folder.

---

## 1. Goal of this chat

Build a **public website** for MS Home Security Solutions (a Kampala security-equipment shop: CCTV, metal detectors, walkie-talkies, access control, smart locks, alarms, convex mirrors, parking/traffic/queue systems; also installation jobs).

- Feature set similar to the **Peacock Paints website** Joel built earlier (same standard of quality; he will list the exact functions).
- A **Buy** option, connected to the existing **POS**, so products, prices and stock come from one database and online orders reach the shop's staff.
- **Joel will communicate the website's functions.** Do not assume the feature list; ask once he has shared it.

### Agreed architecture (decided in the POS chat)
- The website is a **separate app** (own GitHub repo, own folder, own deployment). Do **not** put it inside the POS app.
- It talks to the **existing POS server** through a small set of **new public endpoints** (e.g. `/api/public/products`, `/api/public/orders`, `/api/public/quote-requests`) added to the POS server. No login for these; they expose only safe fields (never cost price, stock-adjustment history, users, customers, sales).
- Online orders/quote requests are stored in the POS database and must appear **inside the POS** for staff (a new "Online orders" page), where staff confirm them; stock is deducted only when staff turn an order into a sale.
- **Payments: undecided.** Options: (a) order → staff confirm → customer pays by Mobile Money or on delivery (no fees, simplest first version); (b) online payment via Flutterwave or Pesapal (MTN/Airtel MoMo + cards, per-transaction fee). Ask Joel.

---

## 2. The POS as it is today

### Where everything lives
| What | Where |
|---|---|
| Code | GitHub `ButalaJoel/ms-home-security-pos`, branch `main`. Local: `C:\Users\DELL\ms-home-security-pos` (`client/` React app, `server/` Express API, root `package.json` with `build`/`start`) |
| Live app (used by the client) | https://ms-home-security-pos.vercel.app — Vercel project, Root Directory `client`; `client/vercel.json` rewrites `/api/*` to the Render server and everything else to `index.html` |
| Server | Render web service `ms-home-security-pos` (id `srv-dbhnro8ae00c73e8loc0`, workspace `tea-da5dterbc2fs738nnj60`, Oregon). Root Directory empty, Build `npm run build` (builds client + server), Start `npm start`. It also serves the built app itself at https://ms-home-security-pos.onrender.com |
| Database | MongoDB Atlas free tier (M0, **no automatic backups**), database `ms_home_security_pos`, native `mongodb` driver (no Mongoose) |
| Images | Cloudinary (logo + optional product photos, folder `ms-home-security-pos/products`); `imageUrl` stored on each product |

Render environment variables (names only): `CLIENT_URL` (=Vercel URL), `MONGODB_URI`, `MONGODB_USERNAME`, `MONGODB_PASSWORD`, `SESSION_SECRET`, `INITIAL_ADMIN_SETUP_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `NODE_ENV=production`, `NPM_CONFIG_INCLUDE=dev` (needed so the build installs TypeScript). Render also provides `RENDER_EXTERNAL_URL`.

### ⚠️ Open issues at handover
1. **All of Joel's Render services were suspended for billing on 8 Nov 2026** (including the POS server, so the POS showed "503" for sign-in). Joel is adding a card and moving the POS server to the **Starter plan ($7/month)**. Check with Render tools that `ms-home-security-pos` is Live before relying on it.
2. **Joel's internet provider (and his phones) cannot resolve `*.onrender.com`** (`DNS_PROBE_FINISHED_NXDOMAIN`; Google DNS 8.8.8.8 resolves it fine). That's why the client uses the Vercel link. Any public website must not depend on an `onrender.com` address for Ugandan visitors. Plan: **buy a domain in December 2026** (e.g. `mshomesecurity.com`), point it at Render (website at the root, POS at `pos.`), then retire the Vercel project (Vercel Hobby is non-commercial only).
3. A last commit ("Quotation table headings in the logo blue") may still need pushing.

### Stack
- **Client:** React 19, Vite 8, TypeScript 7, Tailwind CSS 4, react-router-dom 7, lucide-react icons, Dexie (IndexedDB for offline sales), html2pdf.js (PDFs). Installable PWA (`public/manifest.webmanifest`, `public/sw.js`).
- **Server:** Express 5 + TypeScript (ESM, `tsc` to `dist/`), `mongodb` 7, `express-session` + `connect-mongo` (cookie sessions, staff login only), `bcryptjs`, `helmet` (strict Content-Security-Policy set in `server/src/index.ts`), `cors` (allow-list: `CLIENT_URL`, `RENDER_EXTERNAL_URL`, `APP_URL`, localhost, Vercel previews), `express-rate-limit`, `multer`, `cloudinary`.
- **New features are separate routers** in `server/src/features/` (quotations, payments, jobs, serials, suppliers, expenses, activity, backup, productPhotos, productImport) with shared helpers in `features/common.ts` (`cleanText`, `toObjectId`, `serialize`, `nextDocumentNumber`, `sendError`, `handleFailure`, Kampala date helpers). Follow this pattern for the public endpoints (`features/public.ts`).
- **Activity log:** a middleware records every successful POST/PUT/PATCH/DELETE by a signed-in user. Public (anonymous) requests are not logged; log online orders explicitly if needed.
- API responses are JSON `{ success: boolean, message?: string, ...data }`. Client helper `client/src/lib/http.ts` (`apiJson`) throws `ApiError` with the server message.
- Auth: `requireAuth` and `requireRole("admin")` in `server/src/authMiddleware.ts`. Staff accounts are admin or staff; staff can do everything except users and backups.

### Product data (the website's catalogue)
Collection `products`: `name`, `sku` (e.g. `ACC-0001`), `category`, `brand`, `costPrice` (**never expose publicly**), `sellingPrice` (UGX), `quantity` (stock), `reorderLevel`, `imageUrl`, `active` (false = archived/hidden), `createdAt`, `updatedAt`.
37 real products were imported on 3 Nov 2026 with **zero stock** (the client is entering counts) and **blank cost prices**. Three have **no price yet** (UGX 0): Gold Detector (Gold Hunter), Hikvision CCTV Camera, Solar CCTV Camera; the website should show "Price on request" for zero-priced items.
Categories: Walkie-Talkies & Radios · Metal Detectors · Access Control & Attendance · Smart Locks · Alarms & Sensors · Convex Mirrors · Parking, Traffic & Queue Systems · CCTV Cameras.

Other collections: `sales` (items, payments, balances), `customers`, `quotations` (QUO-YYYY-0001 numbering via `counters`), `jobs` (installations), `serials`, `suppliers`, `stock_receipts`, `stock_adjustments`, `expenses`, `cashups`, `activity_log`, `settings` (doc `_id: "business"`: business name, phones, email, address, bank and MoMo details, terms, logo URL), `users`, `sessions`, `meta`.

### Business details & branding
- Business details are in Settings (`GET /api/settings` when signed in); read them rather than hard-coding.
- Terms: **installation jobs require a 70% deposit, 30% balance on handover**; warranty 6 months; quotations valid 30 days.
- Logo: `client/public/ms-home-security-logo.png`. Colours sampled from it: **house/brand blue `#00A9E8`**, **navy `#303080`** (logo text); the POS UI also uses dark navy `#0B263B` for the sidebar and sky accents.
- Prices in UGX, shown as `UGX 1,250,000`; documents also show amounts in words ("Uganda Shillings … Only").

---

## 3. How Joel works (follow this)
- The assistant edits files in his project folder; **Joel commits and pushes** from the VS Code terminal (`git add -A`, `git commit -m "…"`, `git push origin main`). Render and Vercel deploy automatically on push.
- He wants finished, tested work: build and type-check before handing over, and test new screens (Playwright with mocked API data has worked well). Say plainly what was and wasn't tested.
- Explain in plain language, step by step; he is sometimes on a phone. Keep costs minimal: the client paid little and expects no surprise bills.
- Previous standard to match: the Peacock Paints website (see Joel's notes on it).

## 4. Suggested first steps in the new chat
1. Confirm the POS server on Render is Live again (billing fixed).
2. Get Joel's list of website functions, the payment choice, and whether the website gets its own repo name (e.g. `ms-home-security-website`).
3. Propose the public API (catalogue, product detail, order/quote request, contact form) and the POS "Online orders" page, then build the website.
4. Plan hosting so Ugandan visitors can reach it (custom domain in December; until then a Vercel preview link works).
