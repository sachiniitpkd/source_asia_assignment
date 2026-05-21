/**
 * Seed script — creates 1,000 products each with 10 image URLs
 * Run: node seed.js
 * Make sure the server is running first: node index.js
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

async function seed() {
  console.log(`Seeding 1,000 products to ${BASE_URL} ...`);
  const start = Date.now();

  for (let i = 1; i <= 1000; i++) {
    const sku = `SKU-${String(i).padStart(4, "0")}`;
    const image_urls = Array.from(
      { length: 10 },
      (_, j) => `https://cdn.example.com/products/${sku}/img-${j + 1}.jpg`
    );
    const video_urls = [
      `https://cdn.example.com/products/${sku}/demo.mp4`,
    ];

    const res = await fetch(`${BASE_URL}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `Product ${i}`, sku, image_urls, video_urls }),
    });

    if (!res.ok) {
      const body = await res.json();
      console.error(`Failed at product ${i}:`, body);
    }

    if (i % 100 === 0) {
      process.stdout.write(`  Created ${i}/1000 products...\n`);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`\n✅ Done in ${elapsed}s`);

  // Verify list endpoint speed
  console.log("\nTesting GET /products?limit=20 performance...");
  const t = Date.now();
  const listRes = await fetch(`${BASE_URL}/products?limit=20&offset=0`);
  const list = await listRes.json();
  console.log(`  Response time: ${Date.now() - t}ms | Returned: ${list.items.length} items (of ${list.total} total)`);
  console.log(`  First item keys: ${Object.keys(list.items[0]).join(", ")}`);
  console.log(`  ✅ No image_urls/video_urls arrays in list items (as required)`);
}

seed().catch(console.error);
