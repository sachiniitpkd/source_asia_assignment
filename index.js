const express = require("express");

const rateLimitRoutes = require("./routes/rateLimit");
const productRoutes = require("./routes/products");

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());

// Reject requests with invalid JSON body
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON in request body" });
  }
  next(err);
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/", rateLimitRoutes);       // POST /request, GET /stats
app.use("/products", productRoutes); // Product catalog

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => res.json({ status: "ok" }));

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON in request body" });
  }
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(` Source Asia API running on http://localhost:${PORT}`);
  console.log(`   POST /request        — rate-limited request endpoint`);
  console.log(`   GET  /stats          — rate limit stats`);
  console.log(`   POST /products       — create product`);
  console.log(`   GET  /products       — list products (paginated)`);
  console.log(`   GET  /products/:id   — product detail`);
  console.log(`   POST /products/:id/media — append media URLs`);
});

module.exports = app; // exported for testing
