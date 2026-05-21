const express = require("express");
const router = express.Router();
const { checkAndRecord, getStats } = require("../src/rateLimiter");

// POST /request
router.post("/request", (req, res) => {
  const { user_id, payload } = req.body;

  // Validate input
  if (payload === undefined) {
    return res.status(400).json({ error: "payload is required" });
  }
  if (!user_id || typeof user_id !== "string" || user_id.trim() === "") {
    return res.status(400).json({ error: "user_id is required and must be a non-empty string" });
  }

  const uid = user_id.trim();
  const { allowed, state } = checkAndRecord(uid);

  if (!allowed) {
    return res.status(429).json({
      error: "Rate limit exceeded",
      message: `Maximum 5 requests per 1-minute window for user "${uid}"`,
      retry_after_ms: state.windowStart + 60000 - Date.now(),
    });
  }

  return res.status(201).json({
    message: "Request accepted",
    user_id: uid,
    accepted_in_window: state.count,
    remaining_in_window: 5 - state.count,
  });
});

// GET /stats
router.get("/stats", (req, res) => {
  const { user_id } = req.query;

  if (user_id) {
    const stat = getStats(user_id.trim());
    if (!stat) {
      return res.status(404).json({ error: `No data found for user "${user_id}"` });
    }
    return res.json({ user: stat });
  }

  const all = getStats();
  return res.json({
    users: all,
    total_users_tracked: Object.keys(all).length,
  });
});

module.exports = router;
