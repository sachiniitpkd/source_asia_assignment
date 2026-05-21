/**
 * Fixed 1-minute window rate limiter (in-memory)
 * Thread-safety: Node.js is single-threaded, so no mutex needed.
 * Each user gets a window that resets every 60 seconds from the first
 * request in that window.
 */

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 5;

// Map<userId, { count: number, windowStart: number, rejected: number }>
const userState = new Map();

function getRateLimitState(userId) {
  const now = Date.now();
  let state = userState.get(userId);

  if (!state || now - state.windowStart >= WINDOW_MS) {
    // New user or window expired — start a fresh window
    state = { count: 0, windowStart: now, rejected: 0 };
    userState.set(userId, state);
  }

  return state;
}

/**
 * Returns { allowed: boolean, state }
 */
function checkAndRecord(userId) {
  const state = getRateLimitState(userId);

  if (state.count < MAX_REQUESTS) {
    state.count += 1;
    return { allowed: true, state };
  } else {
    state.rejected += 1;
    return { allowed: false, state };
  }
}

/**
 * Returns stats for all users (or a specific user)
 */
function getStats(userId = null) {
  const now = Date.now();

  const buildEntry = (uid, s) => {
    const windowActive = now - s.windowStart < WINDOW_MS;
    return {
      user_id: uid,
      accepted_in_current_window: windowActive ? s.count : 0,
      rejected_cumulative: s.rejected, // cumulative across all windows
      window_start: new Date(s.windowStart).toISOString(),
      window_resets_in_ms: windowActive
        ? WINDOW_MS - (now - s.windowStart)
        : 0,
    };
  };

  if (userId) {
    const s = userState.get(userId);
    if (!s) return null;
    return buildEntry(userId, s);
  }

  const result = {};
  for (const [uid, s] of userState.entries()) {
    result[uid] = buildEntry(uid, s);
  }
  return result;
}

module.exports = { checkAndRecord, getStats, MAX_REQUESTS, WINDOW_MS };
