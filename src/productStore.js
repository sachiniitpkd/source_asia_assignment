/**
 * In-memory product store.
 *
 * Data model:
 *   products      Map<id, ProductMeta>   — lightweight, used for list queries
 *   productMedia  Map<id, ProductMedia>  — heavy arrays, only loaded for detail/append
 *   skuIndex      Map<sku, id>           — fast duplicate-sku lookup
 *
 * ProductMeta: { id, name, sku, image_count, video_count, thumbnail_url, created_at }
 * ProductMedia: { image_urls: string[], video_urls: string[] }
 *
 * This split means GET /products never touches image_urls / video_urls arrays,
 * satisfying the performance rule even with 1,000+ products × 10 URLs each.
 */

const { v4: uuidv4 } = require("uuid");

const MAX_URLS_PER_REQUEST = 20;
const MAX_URL_LENGTH = 2048;
const URL_REGEX = /^https?:\/\/.+/;

// Storage
const products = new Map();    // id -> meta
const productMedia = new Map(); // id -> { image_urls, video_urls }
const skuIndex = new Map();    // sku -> id

// ── Validation helpers ────────────────────────────────────────────────────────

function validateUrl(url) {
  if (typeof url !== "string") return false;
  if (url.length > MAX_URL_LENGTH) return false;
  return URL_REGEX.test(url);
}

function validateUrlArray(arr, fieldName) {
  if (!Array.isArray(arr)) return `${fieldName} must be an array`;
  if (arr.length > MAX_URLS_PER_REQUEST)
    return `${fieldName} exceeds max of ${MAX_URLS_PER_REQUEST} URLs per request`;
  for (const url of arr) {
    if (!validateUrl(url))
      return `Invalid URL in ${fieldName}: "${url}". Must be http/https, max ${MAX_URL_LENGTH} chars`;
  }
  return null;
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

function createProduct({ name, sku, image_urls = [], video_urls = [] }) {
  // Validate required fields
  if (!name || typeof name !== "string" || name.trim() === "") {
    return { error: "name is required and must be a non-empty string", status: 400 };
  }
  if (!sku || typeof sku !== "string" || sku.trim() === "") {
    return { error: "sku is required and must be a non-empty string", status: 400 };
  }

  // Duplicate SKU
  if (skuIndex.has(sku.trim())) {
    return { error: `SKU "${sku}" already exists`, status: 409 };
  }

  // Validate URLs
  const imgError = validateUrlArray(image_urls, "image_urls");
  if (imgError) return { error: imgError, status: 400 };

  const vidError = validateUrlArray(video_urls, "video_urls");
  if (vidError) return { error: vidError, status: 400 };

  const id = uuidv4();
  const created_at = new Date().toISOString();
  const thumbnail_url = image_urls[0] || null;

  const meta = {
    id,
    name: name.trim(),
    sku: sku.trim(),
    image_count: image_urls.length,
    video_count: video_urls.length,
    thumbnail_url,
    created_at,
  };

  products.set(id, meta);
  productMedia.set(id, {
    image_urls: [...image_urls],
    video_urls: [...video_urls],
  });
  skuIndex.set(sku.trim(), id);

  return { data: { ...meta, image_urls, video_urls }, status: 201 };
}

function listProducts({ limit = 20, offset = 0 }) {
  const MAX_LIMIT = 100;
  limit = Math.min(parseInt(limit) || 20, MAX_LIMIT);
  offset = parseInt(offset) || 0;

  // products.values() insertion order — consistent pagination
  const all = [...products.values()];
  const page = all.slice(offset, offset + limit);

  return {
    data: {
      total: all.length,
      limit,
      offset,
      items: page, // meta only — no URLs arrays
    },
  };
}

function getProduct(id) {
  const meta = products.get(id);
  if (!meta) return null;
  const media = productMedia.get(id);
  return { ...meta, ...media };
}

function appendMedia(id, { image_urls = [], video_urls = [] }) {
  if (!products.has(id)) return { error: "Product not found", status: 404 };

  const hasImages = Array.isArray(image_urls) && image_urls.length > 0;
  const hasVideos = Array.isArray(video_urls) && video_urls.length > 0;
  if (!hasImages && !hasVideos) {
    return {
      error: "At least one of image_urls or video_urls must be provided and non-empty",
      status: 400,
    };
  }

  if (hasImages) {
    const err = validateUrlArray(image_urls, "image_urls");
    if (err) return { error: err, status: 400 };
  }
  if (hasVideos) {
    const err = validateUrlArray(video_urls, "video_urls");
    if (err) return { error: err, status: 400 };
  }

  const media = productMedia.get(id);
  if (hasImages) media.image_urls.push(...image_urls);
  if (hasVideos) media.video_urls.push(...video_urls);

  // Update meta counts and thumbnail
  const meta = products.get(id);
  meta.image_count = media.image_urls.length;
  meta.video_count = media.video_urls.length;
  if (!meta.thumbnail_url && media.image_urls.length > 0) {
    meta.thumbnail_url = media.image_urls[0];
  }

  return { data: { ...meta, ...media }, status: 200 };
}

module.exports = {
  createProduct,
  listProducts,
  getProduct,
  appendMedia,
  MAX_URLS_PER_REQUEST,
};
