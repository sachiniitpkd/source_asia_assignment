const express = require("express");
const router = express.Router();
const {
  createProduct,
  listProducts,
  getProduct,
  appendMedia,
} = require("../src/productStore");

// POST /products
router.post("/", (req, res) => {
  const { name, sku, image_urls, video_urls } = req.body;

  const result = createProduct({
    name,
    sku,
    image_urls: image_urls || [],
    video_urls: video_urls || [],
  });

  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }

  return res.status(201).json({ product: result.data });
});

// GET /products
router.get("/", (req, res) => {
  const { limit, offset } = req.query;

  // Validate pagination params
  const parsedLimit = parseInt(limit);
  const parsedOffset = parseInt(offset);

  if (limit !== undefined && (isNaN(parsedLimit) || parsedLimit < 1)) {
    return res.status(400).json({ error: "limit must be a positive integer" });
  }
  if (offset !== undefined && (isNaN(parsedOffset) || parsedOffset < 0)) {
    return res.status(400).json({ error: "offset must be a non-negative integer" });
  }

  const result = listProducts({ limit: parsedLimit, offset: parsedOffset });
  return res.json(result.data);
});

// GET /products/:id
router.get("/:id", (req, res) => {
  const product = getProduct(req.params.id);
  if (!product) {
    return res.status(404).json({ error: `Product with id "${req.params.id}" not found` });
  }
  return res.json({ product });
});

// POST /products/:id/media
router.post("/:id/media", (req, res) => {
  const { image_urls, video_urls } = req.body;

  const result = appendMedia(req.params.id, {
    image_urls: image_urls || [],
    video_urls: video_urls || [],
  });

  if (result.error) {
    return res.status(result.status).json({ error: result.error });
  }

  return res.status(200).json({ product: result.data });
});

module.exports = router;
