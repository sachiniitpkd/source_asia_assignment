# Source Asia — Backend Assignment

A single HTTP service built with **Node.js + Express** covering two parts:
1. A rate-limited request API
2. A product catalog API with media management

---

## Quick Start

```bash
npm install
node index.js        # starts on port 3000
```

Optional env variable:
```bash
PORT=8080 node index.js
```

---

## Part 1 — Rate-Limited API

### Design Choices

| Choice | Decision |
|---|---|
| Window type | **Fixed 1-minute window** per user, starting from the first request in that window |
| Success code | **201 Created** — the request was "created/accepted" into the system |
| Rejected stats | **Cumulative** across all windows (never resets), so you can see total abuse |
| Concurrency | Node.js is single-threaded — no race conditions possible on the in-memory map |

### POST /request

**Request body:**
```json
{
  "user_id": "alice",
  "payload": { "any": "json value" }
}
```

**Success (201):**
```json
{
  "message": "Request accepted",
  "user_id": "alice",
  "accepted_in_window": 3,
  "remaining_in_window": 2
}
```

**Rate limited (429):**
```json
{
  "error": "Rate limit exceeded",
  "message": "Maximum 5 requests per 1-minute window for user \"alice\"",
  "retry_after_ms": 43200
}
```

**Validation errors (400):**
- Missing or empty `user_id`
- Missing `payload`
- Malformed JSON body

### GET /stats

Returns stats per user (or for a specific user via `?user_id=`).

**GET /stats**
```json
{
  "users": {
    "alice": {
      "user_id": "alice",
      "accepted_in_current_window": 5,
      "rejected_cumulative": 2,
      "window_start": "2024-01-01T12:00:00.000Z",
      "window_resets_in_ms": 18000
    }
  },
  "total_users_tracked": 1
}
```

**GET /stats?user_id=alice**
```json
{
  "user": {
    "user_id": "alice",
    "accepted_in_current_window": 5,
    "rejected_cumulative": 2,
    "window_start": "2024-01-01T12:00:00.000Z",
    "window_resets_in_ms": 18000
  }
}
```

### Example curl commands

```bash
# Send valid requests (run 5 times — all should succeed with 201)
curl -s -X POST http://localhost:3000/request \
  -H "Content-Type: application/json" \
  -d '{"user_id":"alice","payload":{"order":"abc"}}' | jq

# 6th request — should return 429
curl -s -X POST http://localhost:3000/request \
  -H "Content-Type: application/json" \
  -d '{"user_id":"alice","payload":{"order":"def"}}' | jq

# Stats for alice
curl -s http://localhost:3000/stats?user_id=alice | jq

# Global stats
curl -s http://localhost:3000/stats | jq

# Test 400 — missing user_id
curl -s -X POST http://localhost:3000/request \
  -H "Content-Type: application/json" \
  -d '{"payload":"hello"}' | jq
```

### Production Limitations (Part 1)

1. **Single instance only** — rate limit state lives in a Node.js `Map`. Horizontal scaling (multiple pods/processes) would allow >5 req/min per user because each instance has its own counter.
2. **Restart loses state** — counters reset on process restart. A user blocked at 5/5 can bypass by triggering a restart.
3. **Memory growth** — every unique `user_id` ever seen occupies memory forever. Production needs a TTL eviction (e.g. `node-cache`, Redis with `EXPIRE`).
4. **Fixed window edge case** — a user can send 5 requests at 00:59 and 5 more at 01:01 (10 in ~2 seconds). Rolling window (sliding log) eliminates this but is heavier. Documented choice: fixed window.
5. **No persistence** — for audit/billing purposes, production needs durable storage (Postgres/Redis).

---

## Part 2 — Product Catalog

### Endpoints

#### POST /products

```json
{
  "name": "Widget A",
  "sku": "SKU-001",
  "image_urls": ["https://cdn.example.com/products/sku-001/img-1.jpg"],
  "video_urls": ["https://cdn.example.com/products/sku-001/demo.mp4"]
}
```

**Success (201):** Returns full product including `id`, `image_urls`, `video_urls`, `image_count`, `video_count`, `thumbnail_url`, `created_at`.

**Errors:**
- `400` — missing/empty name or sku, invalid URL, >20 URLs per array
- `409` — duplicate SKU (documented choice: 409 Conflict is semantically more accurate than 400)

#### GET /products

Lists products **without** media URL arrays (performance rule).

**Query params:**

| Param | Default | Max |
|---|---|---|
| `limit` | 20 | 100 |
| `offset` | 0 | — |

**Response:**
```json
{
  "total": 1000,
  "limit": 20,
  "offset": 0,
  "items": [
    {
      "id": "uuid",
      "name": "Widget A",
      "sku": "SKU-001",
      "image_count": 10,
      "video_count": 1,
      "thumbnail_url": "https://cdn.example.com/...",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

> ✅ No `image_urls` or `video_urls` arrays are returned — only counts and one thumbnail.

#### GET /products/:id

Returns full product with all `image_urls` and `video_urls`.

**Error:** `404` if id not found.

#### POST /products/:id/media

Appends URLs to an existing product.

```json
{
  "image_urls": ["https://cdn.example.com/new-img.jpg"],
  "video_urls": ["https://cdn.example.com/new-vid.mp4"]
}
```

At least one of `image_urls` or `video_urls` must be provided and non-empty.

**Errors:** `404` unknown id, `400` empty body or invalid URLs.

### Validation Rules

| Rule | Detail |
|---|---|
| URL format | Must start with `http://` or `https://` |
| URL max length | 2048 characters |
| Max URLs per request | 20 per array (image_urls and video_urls each) |
| Duplicate SKU | 409 Conflict |
| name / sku | Must be non-empty strings |

### Example curl commands

```bash
# Create product
curl -s -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Widget A",
    "sku": "SKU-001",
    "image_urls": ["https://cdn.example.com/img1.jpg","https://cdn.example.com/img2.jpg"],
    "video_urls": ["https://cdn.example.com/demo.mp4"]
  }' | jq

# List products (no URL arrays in response)
curl -s "http://localhost:3000/products?limit=10&offset=0" | jq

# Get product detail (full URLs)
curl -s http://localhost:3000/products/<id> | jq

# Append media
curl -s -X POST http://localhost:3000/products/<id>/media \
  -H "Content-Type: application/json" \
  -d '{"image_urls":["https://cdn.example.com/img3.jpg"]}' | jq
```

### Data Model & Performance

**In-memory storage uses two separate Maps:**

```
products      Map<id, ProductMeta>    — lightweight row used for listing
productMedia  Map<id, ProductMedia>   — heavy arrays, only loaded for detail
skuIndex      Map<sku, id>            — O(1) duplicate-SKU lookup
```

`ProductMeta` stores only: `id`, `name`, `sku`, `image_count`, `video_count`, `thumbnail_url`, `created_at`.

`ProductMedia` stores: `image_urls[]`, `video_urls[]`.

**GET /products** (list): iterates `products` Map only. With 1,000 products × 10 images each = 10,000 URLs — **none** are touched or serialized.

**GET /products/:id** (detail): fetches one `products` entry + one `productMedia` entry. Only 10 URLs loaded, not 10,000.

### What Would Change in Production (PostgreSQL + CDN)

| Concern | In-memory | PostgreSQL + CDN |
|---|---|---|
| List query | Slice a JS array | `SELECT id, name, sku, image_count, thumbnail_url FROM products LIMIT ? OFFSET ?` — media table never joined |
| Detail query | Two Map lookups | `SELECT * FROM products JOIN product_media ON ...` or separate queries |
| Media table | Part of in-memory Map | Separate `product_media` table with `product_id` FK, indexed |
| image_count | Updated on every append | Maintained as a column (updated on insert/delete) or computed via `COUNT()` |
| thumbnail_url | First image URL string | Could be a dedicated column or derived from `ORDER BY position LIMIT 1` |
| Pagination | `Array.slice(offset, offset+limit)` | `LIMIT / OFFSET` or keyset pagination (more efficient at high offsets) |
| CDN | Fake URLs | Real pre-signed S3/CloudFront URLs generated on demand; never stored permanently |

---

## Running Tests

```bash
# Terminal 1
node index.js

# Terminal 2
node test.js
```

## Seeding 1,000 Products

```bash
# Terminal 1
node index.js

# Terminal 2
node seed.js
```

After seeding, confirm `GET /products?limit=20` doesn't return URL arrays and responds quickly.

---

## Project Structure

```
source-asia/
├── index.js              # Express app entry point
├── src/
│   ├── rateLimiter.js    # Fixed-window rate limit state & logic
│   └── productStore.js   # In-memory product store (split meta/media)
├── routes/
│   ├── rateLimit.js      # POST /request, GET /stats
│   └── products.js       # Product CRUD + media
├── test.js               # Automated tests (no extra deps)
├── seed.js               # Seeds 1,000 products for perf testing
├── package.json
└── README.md
```
