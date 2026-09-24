# CLAUDE.md — Pizzaland Backend V2

> This file is the shared context for Claude Code and any AI assistant working on this repo.
> Both the developer (Chris) and Claude Code can update it.
> Last updated: 2026-09-24

---

## Project overview

Pizzaland V2 is a restaurant management platform (ordering, POS, KDS, delivery) built for Yousra Company, a Cameroonian food service business. This repo is the backend API.

**Team:** Chris (backend, de facto tech lead), Franck (frontend). Small team, tight deadlines.

---

## Stack

| Layer | Tech |
|---|---|
| Runtime | Node.js, TypeScript, ES Modules |
| Framework | Express 5 |
| ORM | Prisma 7 (PostgreSQL) |
| Database | PostgreSQL on Supabase |
| Validation | Zod 4 |
| Auth | JWT (jsonwebtoken) + bcrypt, cookie-parser |
| Messaging | Twilio (WhatsApp + SMS) |
| Image storage | Supabase Storage (bucket: `pizzaland-products-images`) |
| File uploads | Multer (memoryStorage) |
| Secrets | Doppler — all commands prefixed with `doppler run --` |
| Hosting | Sevalla (`backend.pizzaland.cm`) |
| Dev env | Windows + WSL2/Ubuntu, VS Code |

---

## Folder structure

```
source/
  authentication/      # Auth module (register, login, verify, refresh, logout)
  configurations/      # supabase.ts and other config
  lib/                 # prisma.ts (shared Prisma client)
  middlewares/         # upload.image.ts (multer), auth, role, error.middleware.ts
  utilities/           # storage.service.ts (Supabase Storage upload + delete)
  products/            # Products, categories, subcategories, addons, menus, variants
    product.controller.ts
    product.schema.ts
    product.route.ts
    category.controller.ts
    category.route.ts
  orders/              # Orders, order items, deliveries, pickups, dine-in
    order.service.ts
    order.schema.ts
    order.includes.ts  # shared fullOrderInclude constant
  delivery/            # Shipping addresses
prisma/
  schema.prisma
  migrations/
```

---

## Commands

```bash
# Dev server
doppler run -- tsx watch source/server.ts

# Prisma
doppler run -- npx prisma migrate dev --name <name>
doppler run -- npx prisma generate
doppler run -- npx prisma studio

# Build
tsc

# Production
doppler run -- node dist/server.js
```

---

## Locked architectural decisions

These are final. Do not change them or propose alternatives.

1. **Response envelope:** `{ data, meta }` for success, `{ error: { message, code? } }` for errors
2. **Soft delete:** `deletedAt` on all reference tables. Never hard-delete records with historical references (orders reference products, etc.)
3. **Server-derived values:** `branchId`, order pricing/totals/statuses, `estimatedReadyAt`, and image URLs are always computed server-side. Never trust these from the client
4. **Zod for runtime validation:** Always use `safeParse` → check `result.success` → use `result.data`. Never use `.parse()` (it throws)
5. **Prisma transactions:** Use `prisma.$transaction()` for all multi-table writes. Use `tx` inside the callback. Keep network calls (Supabase upload, Twilio) OUTSIDE transactions
6. **Prisma Migrate:** Use `migrate dev` in development, `migrate deploy` in production. Never `db push`
7. **Module boundaries:** Other modules import only from a domain's public surface (index.ts or named exports)
8. **Bulk endpoints:** Most entities should support bulk import and bulk delete, not just single-record CRUD
9. **Order types:** Only three — `pickup`, `dineIn`, `delivery`. `takeOut` was removed and merged into `pickup`
10. **Discriminated unions:** Order schema uses Zod discriminated union on `orderType` for single-pass validation

---

## Coding conventions

### Style

- **Explicit over clever:** `if/else if` branching over dynamic dispatch, explicit destructuring over loop-based builders
- **Named exports** for controllers: `export { createProduct, updateProduct }`
- **Default export** for route files and utilities like `uploadImage`
- **Arrow functions** for controllers: `export const createProduct = async (req, res) => { ... }`
- **No unused variables or empty catch blocks** — if a handler isn't implemented yet, don't leave an empty `try {} catch {}`

### Validation

- Schemas live in `<domain>.schema.ts` files (e.g., `product.schema.ts`, `order.schema.ts`)
- Use `z.coerce.number()` instead of `z.number()` on any field that may arrive via form-data (which sends everything as strings)
- Image fields (`imageUrl`, `imagePath`) are NEVER in request schemas — the server sets them after upload
- Update schemas: use `.partial()` on the create schema, optionally with `.omit()` for fields that shouldn't be updatable:
  ```ts
  const UpdateSchema = CreateSchema.omit({ categoryId: true }).partial();
  ```

### Image upload pattern

All image uploads follow this exact pattern:

```ts
// 1. Validate text fields FIRST (before any upload)
// 2. Check req.file if image is required
// 3. Upload to Supabase: uploadImage(req.file.buffer, req.file.mimetype, "<folder>")
// 4. DB write with imageUrl: uploaded.url, imagePath: uploaded.path
// 5. On DB failure: deleteImage(uploaded.path) to clean up orphan
```

**For updates with image replacement:**
```ts
// 1. findUnique to get existing.imagePath
// 2. Upload new image if req.file exists
// 3. DB update with ...result.data + ...imageData
// 4. AFTER DB success: deleteImage(existing.imagePath) — log-only try/catch
// 5. On DB failure: deleteImage(uploadedPath) — clean up the NEW file
```

Key rules:
- `let uploadedPath: string | null = null` declared OUTSIDE the try block so catch can see it
- Delete OLD image only AFTER DB update succeeds (never before)
- Delete NEW image only if DB update fails
- Cleanup failures are log-only — never block the response
- Folder names: `"products"`, `"categories"`, `"subcategories"`, `"addons"`, `"menus"`

**Utility location:** `source/utilities/storage.service.ts`
- `uploadImage(buffer, mimetype, folder)` → returns `{ path, url }`
- `deleteImage(path)` → named export

**Multer location:** `source/middlewares/upload.image.ts` — its errors (wrong type, >5 MB, wrong field) are turned into 400 JSON by `source/middlewares/error.middleware.ts`, registered last in `app.ts`
- `upload.single("image")` in routes that accept images
- Limits: 5 MB, JPEG/PNG/WEBP only

### Database columns for images

Every model that has images uses these two columns:
- `imageUrl` (`String?` or `String`) — the full public URL for frontend display
- `imagePath` (`String?` or `String`) — the Supabase Storage path for deletion/replacement

### Error handling

- Controllers use try/catch (not middleware-based error handling yet)
- Always `console.error` the actual error for debugging
- Return the envelope format: `res.status(500).json({ error: { message: "..." } })`
- Never expose raw Prisma or Zod errors to the client in production

### Routes

- RESTful naming: `/products`, `/products/:id`, `/products/bulk`
- Image routes include `upload.single("image")` middleware
- Delete routes do NOT include multer (no file involved)

---

## Prisma model names → prisma client names

| Model | Prisma client accessor |
|---|---|
| Products | `prisma.products` |
| Category | `prisma.category` |
| SubCategory | `prisma.subCategory` |
| Addons | `prisma.addons` |
| Menu | `prisma.menu` |
| MenuItems | `prisma.menuItems` |
| ProductVariants | `prisma.productVariants` |
| Orders | `prisma.orders` |
| OrderItems | `prisma.orderItems` |
| Employees | `prisma.employees` |
| Customers | `prisma.customers` |
| Branches | `prisma.branches` |
| Stations | `prisma.stations` |

---

## Environment variables (via Doppler)

```
SUPABASE_PROJECT_URL
SUPABASE_SERVICE_ROLE_KEY
DATABASE_URL
JWT_ACCESS_SECRET
JWT_REFRESH_SECRET
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
```

Never hardcode these. Never commit `.env` files. Always run via `doppler run --`.

---

## What NOT to do

- Don't add `companyId` — this is a single-company app, not multi-tenant
- Don't use Cloudinary — we migrated to Supabase Storage
- Don't use `db push` — always `migrate dev`
- Don't put network calls (uploads, Twilio) inside `prisma.$transaction()`
- Don't trust image URLs from the client — always generate them server-side after upload
- Don't hard-delete products, categories, menus, or anything referenced by orders
- Don't use `z.number()` for fields that arrive via form-data — use `z.coerce.number()`
- Don't create a new file for something that belongs in an existing module

---

## Rules for Claude (set by Chris, 2026-09-24)

- **Never apply migrations or take other high-impact actions on your own** (applying migrations, `db push`, writing to or resetting the database, deleting data, deploying, pushing, or anything hard to reverse). Chris, as the backend developer, makes those decisions and runs them himself unless he explicitly says otherwise. Prepare the change (e.g. a migration file) and hand it over.
- **Do what is asked, no more.** A request to "review" means report findings; only change code when asked to fix.
- **Avoid extreme code changes.** Prefer small, readable fixes that are easy to understand yet efficient over rewrites or clever abstractions.

## Developer preferences (Chris)

- Prefers step-by-step explanations that mirror course material formatting
- Wants array/object methods (filter, map) and TypeScript concepts (type narrowing, generics) explained in plain language, not terse shorthand
- Understanding-first: doesn't write code he doesn't understand
- Iterative workflow: shares working-but-messy code for review, then modifies suggestions before accepting
- Simplicity as a hard constraint: pushes back on over-engineered solutions
- Prefers inline schemas over named refinements when complexity isn't justified
- API-design-before-coding: Postman collection is designed before implementation begins

---

## Status / changelog

_Update this section as features are completed._

- [x] Auth module (register, login, verify, refresh, logout)
- [x] Image upload wired (Supabase Storage): create product, update product, update category, update subcategory, update addons
- [x] Order domain: createOrder, updateOrder, getAllOrders, getOrderById, getOrdersByStatus, getActiveOrders
- [x] Product schemas with z.coerce for form-data compatibility
- [ ] Delete endpoints (soft delete with deletedAt)
- [ ] Menu CRUD with image upload
- [ ] Auth middleware on protected routes
- [x] Multer error handling in error middleware (2026-09-24) — also handles malformed JSON (400) and unexpected errors (500, fixed message)
- [x] Branches + shipping addresses: full CRUD routed at `/api/v2/branches` (2026-09-24) — still uses old `{ error: "..." }` strings and hard delete, needs aligning with the locked decisions
- [x] CRM (favorites, reviews, preferences) mounted at `/api/v2/crm` with auth (2026-09-24)
- [ ] Apply migration `20260924120000_crm_decimal_balance_unique_favorites` (written, NOT yet applied — run `npm run migrate`)
- [x] Delivery driver flow at `/api/v2/deliveries` (DELIVERY_DRIVER only): available, mine, claim, status (2026-09-24). `PATCH /:deliveryId/status` allows assigned → in_transit → delivered/failed (order status follows: `out_for_delivery` / `delivered`). Claim and status updates use a conditional `updateMany` so a delivery can't be double-claimed or finished twice
- [ ] Migration for new `Deliveries` indexes `[driverEmail, status]` and `[status]` (in schema only — Chris creates/applies it)
- [ ] Later (Chris): pagination for `GET /deliveries/mine?view=history`
- [x] Orders routed at `/api/v2/orders` with auth + roles (2026-09-24). Customers can order (phone from token; pickup/dineIn send the chosen `branchId`, delivery uses the shipping address's branch). Prices are server-side incl. variant price (required when the product has variants), addons and delivery fee; `estimatedDeliveryTime` = now + `ShippingAddresses.deliveryTime` (assumed minutes); cashier/employee emails from the token. Discount updates are capped at the subtotal and recompute the total. Dispatch and item-ready promotion only act on orders still being prepared (conditional `updateMany`). Expected errors use the `OrderError` class in `order.service.ts`
- [ ] Migration for walk-in customers: `Orders.customerPhone` is now optional (null = walk-in, pickup/dine-in only) — in schema, Chris creates/applies it

---

## Notes (Claude, 2026-09-24)

- **Auth identity:** for customers `req.user.userId` is the phone number, for employees it is the email. `role` is `"CUSTOMER"` for customers. CRM handlers take `customerPhone` from the token, never from the body
- **`source/crm/account.ts`** holds wallet helpers (`creditAccount`, `debitAccount`, `getAccountBalance`, coin conversions) meant to be called from orders/payments. `debitAccount` uses a single conditional `updateMany` so the balance can never go negative, even with parallel requests. They use the global `prisma`, so they can't yet join a `$transaction` — add a `tx` parameter when payments start using them
- **Money:** `Accounts.balance` is `Decimal(14, 2)`. Do money/coin math with `Prisma.Decimal` (`.add/.sub/.mul/.div`), never JS `number`. Prisma returns Decimal objects; send them as `.toString()` in JSON. Other money columns (order totals, prices, variant prices, delivery fees) are still `Float` — candidates for the same change
- **Favorites** has `@@unique([customerPhone, productId])`; `addFavorite` uses `upsert` on `customerPhone_productId`
- **Migrations in a non-interactive shell (Claude):** `prisma migrate dev` refuses to run. Preview with `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, write the folder by hand, and let Chris apply it
- **Schema gaps still open:** `@@unique([customerPhone, name])` on `UserPreferences` doesn't cover employees; no `deletedAt` on `Branches`/`ShippingAddresses` yet
- **Env var not listed above:** `YOUSRA_COINS_EXCHANGE_RATE` (XAF per coin, defaults to 25)
