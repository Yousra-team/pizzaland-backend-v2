# Pizzaland API v2 — Frontend conventions

For Franck · from Chris (backend) · 2026-09-24

Base URL: `https://backend.pizzaland.cm/api/v2`

## 1. Response format

```jsonc
// Success
{ "data": { ... } }                    // or an array

// Error
{ "error": { "message": "Product not found", "code": "NOT_FOUND" } }
```

- Always show `error.message`; use `error.code` for logic.
- Validation errors (400) may add `error.details`: `{ "fieldName": ["what is wrong"] }`, handy for form field messages.
- **Temporary:** auth and branch endpoints still sometimes return `{ "error": "text" }` or `{ "message": "text" }`. Handle all three shapes until we align them.

| Status | Meaning | What to do |
|---|---|---|
| 400 | Invalid input | Show the message / field errors |
| 401 | Not logged in or token expired | Refresh the token (see 2), then retry once |
| 403 | Logged in but not allowed (wrong role/branch) | Show "not allowed" |
| 404 | Not found | |
| 409 | Conflict (e.g. delivery already claimed by another driver) | Refresh the list |

## 2. Authentication

1. `POST /auth/customers/login` (or `/employees/login`) sends a verification code.
2. `POST /auth/verify` returns `{ "authToken": "..." }` and sets a refresh cookie.
3. Send the token on every protected request:
   ```
   Authorization: Bearer <authToken>
   ```
4. The access token lasts **15 minutes**. On a 401, call `POST /auth/refresh` to get a new one; the refresh token lasts 7 days.
5. The refresh token lives in an **httpOnly cookie** you can't read. For `/auth/verify`, `/auth/refresh` and `/auth/logout`, send cookies:
   ```js
   fetch(url, { method: "POST", credentials: "include" })   // axios: withCredentials: true
   ```

Never send your own `customerPhone`, `branchId` or driver email for "my" data. The server reads them from the token.

## 3. Uploading images

Routes that accept an image (create/update product, category, subcategory, addon, menu) use **`multipart/form-data`**:

- File field name: **`image`** (exactly this name)
- JPEG, PNG or WEBP, **max 5 MB**
- **Don't** set the `Content-Type` header yourself; the browser adds the boundary.
- **Never** send `imageUrl` or `imagePath`. The server creates them after upload.
- Numbers can be sent as strings (`"2500"`); the server converts them.
- For arrays of objects (variants, addons, menu items), use **bracket names**, not `JSON.stringify`:

```js
const form = new FormData();
form.append("image", file);                    // File from <input type="file">
form.append("name", "Pepperoni");
form.append("description", "Classic");
form.append("price", "4500");
form.append("categoryId", categoryId);
form.append("variants[0][name]", "Large");
form.append("variants[0][price]", "6500");
form.append("addons[0][id]", existingAddonId); // existing addon: id only

await fetch(`${BASE}/products/products`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
```

Upload errors come back as 400 with `code`:
- `INVALID_FILE_TYPE`: not JPEG/PNG/WEBP
- `LIMIT_FILE_SIZE`: over 5 MB
- `LIMIT_UNEXPECTED_FILE`: field not named `image`

On updates the image is optional: send one only to replace it.

## 4. Data formats

- Dates: ISO 8601 strings (`"2026-09-24T14:30:00.000Z"`)
- Phone numbers: E.164 (`"+2376XXXXXXXX"`)
- Non-image endpoints: JSON body with `Content-Type: application/json`

## 5. Route changes

| Old | New |
|---|---|
| `POST /addresses` | removed → `POST /branches/shipping-addresses` |
| none | `/branches/shipping-addresses` (GET list, GET/PATCH/DELETE `/:name`) |
| none | `/crm/...` favorites, reviews, preferences (login required) |
| none | `/deliveries/...` (delivery drivers only) |

**Deliveries (role `DELIVERY_DRIVER`):**
- `GET /deliveries/available`: unclaimed deliveries at my branch
- `GET /deliveries/mine`: my active deliveries (`?view=history` for finished)
- `PATCH /deliveries/:id/claim`: take a delivery; **409** means another driver got it first
- `PATCH /deliveries/:id/status` with body `{ "status": "in_transit" | "delivered" | "failed" }`

**CRM:**
- `GET /crm/products/:productId/reviews`: public
- `POST|GET /crm/favorites`, `POST|GET /crm/reviews`: customers only
- `PUT|GET /crm/preferences`: any logged-in user; `PUT` body `{ "name": "preferredLanguage", "value": "fr" }`

Questions: ask Chris before assuming a field or route.
