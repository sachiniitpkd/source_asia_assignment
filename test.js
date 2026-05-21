/**
 * Automated tests — no extra dependencies, uses Node.js built-in fetch
 * Run: node test.js
 * Make sure the server is running first: node index.js
 */

const BASE = process.env.BASE_URL || "http://localhost:3000";
let passed = 0;
let failed = 0;

async function req(method, path, body) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  let json;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, body: json };
}

function assert(label, condition, info = "") {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}${info ? " — " + info : ""}`);
    failed++;
  }
}

// ─── Rate Limiter Tests ──────────────────────────────────────────────────────

async function testRateLimiter() {
  console.log("\n━━ Part 1: Rate Limiter ━━");
  const uid = `test-user-${Date.now()}`;

  // 1. Valid requests up to limit
  for (let i = 1; i <= 5; i++) {
    const r = await req("POST", "/request", { user_id: uid, payload: { x: i } });
    assert(`Request ${i} accepted (201)`, r.status === 201);
  }

  // 2. 6th request should be rejected
  const r6 = await req("POST", "/request", { user_id: uid, payload: "extra" });
  assert("6th request rejected (429)", r6.status === 429);
  assert("429 body has error field", r6.body && r6.body.error);
  assert("429 body has retry_after_ms", r6.body && typeof r6.body.retry_after_ms === "number");

  // 3. Different user is independent
  const uid2 = `test-user2-${Date.now()}`;
  const r2 = await req("POST", "/request", { user_id: uid2, payload: "hello" });
  assert("Different user still gets accepted (201)", r2.status === 201);

  // 4. Missing user_id → 400
  const r400 = await req("POST", "/request", { payload: "x" });
  assert("Missing user_id → 400", r400.status === 400);

  // 5. Empty user_id → 400
  const r400b = await req("POST", "/request", { user_id: "  ", payload: "x" });
  assert("Empty user_id → 400", r400b.status === 400);

  // 6. Missing payload → 400
  const r400c = await req("POST", "/request", { user_id: "abc" });
  assert("Missing payload → 400", r400c.status === 400);

  // 7. Stats for user
  const stats = await req("GET", `/stats?user_id=${uid}`);
  assert("GET /stats returns user stats", stats.status === 200);
  assert("Stats has accepted_in_current_window", stats.body?.user?.accepted_in_current_window === 5);
  assert("Stats has rejected_cumulative >= 1", stats.body?.user?.rejected_cumulative >= 1);

  // 8. Global stats
  const gstats = await req("GET", "/stats");
  assert("GET /stats global returns 200", gstats.status === 200);
  assert("Global stats has users object", gstats.body?.users !== undefined);
}

// ─── Product Catalog Tests ───────────────────────────────────────────────────

async function testProducts() {
  console.log("\n━━ Part 2: Product Catalog ━━");
  const sku = `SKU-TEST-${Date.now()}`;

  // 1. Create product
  const create = await req("POST", "/products", {
    name: "Widget A",
    sku,
    image_urls: ["https://cdn.example.com/img1.jpg", "https://cdn.example.com/img2.jpg"],
    video_urls: ["https://cdn.example.com/demo.mp4"],
  });
  assert("POST /products → 201", create.status === 201);
  assert("Response has id", !!create.body?.product?.id);
  assert("Response has image_count=2", create.body?.product?.image_count === 2);
  assert("Response has video_count=1", create.body?.product?.video_count === 1);
  const productId = create.body?.product?.id;

  // 2. Duplicate SKU → 409
  const dup = await req("POST", "/products", { name: "Another", sku });
  assert("Duplicate SKU → 409", dup.status === 409);

  // 3. Missing name → 400
  const noName = await req("POST", "/products", { sku: `SKU-NONAME-${Date.now()}` });
  assert("Missing name → 400", noName.status === 400);

  // 4. Invalid URL → 400
  const badUrl = await req("POST", "/products", {
    name: "Bad",
    sku: `SKU-BAD-${Date.now()}`,
    image_urls: ["not-a-url"],
  });
  assert("Invalid URL → 400", badUrl.status === 400);

  // 5. Too many URLs → 400
  const manyUrls = await req("POST", "/products", {
    name: "Many",
    sku: `SKU-MANY-${Date.now()}`,
    image_urls: Array.from({ length: 21 }, (_, i) => `https://cdn.example.com/img${i}.jpg`),
  });
  assert("Too many URLs (21) → 400", manyUrls.status === 400);

  // 6. List products
  const list = await req("GET", "/products?limit=10&offset=0");
  assert("GET /products → 200", list.status === 200);
  assert("List has items array", Array.isArray(list.body?.items));
  assert("List items have no image_urls array", !list.body?.items?.[0]?.image_urls);
  assert("List items have image_count", typeof list.body?.items?.[0]?.image_count === "number");

  // 7. Get product detail
  const detail = await req("GET", `/products/${productId}`);
  assert("GET /products/:id → 200", detail.status === 200);
  assert("Detail has image_urls array", Array.isArray(detail.body?.product?.image_urls));
  assert("Detail has video_urls array", Array.isArray(detail.body?.product?.video_urls));

  // 8. Unknown product → 404
  const notFound = await req("GET", "/products/nonexistent-id");
  assert("Unknown id → 404", notFound.status === 404);

  // 9. Append media
  const append = await req("POST", `/products/${productId}/media`, {
    image_urls: ["https://cdn.example.com/img3.jpg"],
  });
  assert("POST /products/:id/media → 200", append.status === 200);
  assert("image_count updated to 3", append.body?.product?.image_count === 3);

  // 10. Append to unknown product → 404
  const appendNotFound = await req("POST", "/products/bad-id/media", {
    image_urls: ["https://cdn.example.com/x.jpg"],
  });
  assert("Append to unknown product → 404", appendNotFound.status === 404);

  // 11. Empty media body → 400
  const emptyMedia = await req("POST", `/products/${productId}/media`, {});
  assert("Empty media body → 400", emptyMedia.status === 400);

  // 12. Pagination defaults
  const defaultList = await req("GET", "/products");
  assert("Default pagination works (200)", defaultList.status === 200);
  assert("Default limit is 20", defaultList.body?.limit === 20);
}

// ─── Run all tests ────────────────────────────────────────────────────────────

(async () => {
  console.log(`Running tests against ${BASE} ...\n`);
  try {
    await testRateLimiter();
    await testProducts();
  } catch (e) {
    console.error("Test runner error:", e.message);
    failed++;
  }

  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
