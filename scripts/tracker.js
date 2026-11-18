const fs = require('fs');
const path = require('path');

// Security: Never hardcode API keys in source control.
// Configure YT_KEY in GitHub Actions Secrets (or local environment).
const YT_KEY = (process.env.YT_KEY || '').trim();
const YT_CHANNEL = (process.env.YT_CHANNEL || 'UC-n2JCyBM5b61_gSOdsQ3sA').trim();
const IG_FEED_URL = (process.env.IG_FEED_URL || 'https://feeds.behold.so/fUEnJF2Hk4CpvG03xaGH').trim();

const FILE_PATH = path.join(__dirname, '../stats.json');
const MAX_HISTORY_DAYS = 90;

const MONTH_MAP = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
};

/**
 * Formats a Date into canonical ISO YYYY-MM-DD (UTC) to prevent multi-year collisions.
 */
function getIsoDateUTC(dateObj = new Date()) {
  return dateObj.toISOString().slice(0, 10);
}

/**
 * Normalizes legacy "DD Mon" dates (if encountered) to YYYY-MM-DD.
 */
function normalizeDateKey(rawDate, fallbackYear) {
  if (typeof rawDate !== 'string') return null;
  const trimmed = rawDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/^(\d{1,2})\s+([A-Za-z]{3})(?:\s+(\d{4}))?$/);
  if (!match) return null;

  const day = match[1].padStart(2, '0');
  const month = MONTH_MAP[match[2].toLowerCase()];
  if (!month) return null;
  const year = match[3] || String(fallbackYear);
  return `${year}-${month}-${day}`;
}

function toFiniteNumberOrNull(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

/**
 * Strips sensitive query parameters (like key=...) from any error messages before logging.
 */
function sanitizeLogMessage(msg) {
  return String(msg || '').replace(/([?&]key=)[^&\s]+/gi, '$1[REDACTED]');
}

function loadHistory() {
  if (!fs.existsSync(FILE_PATH)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
    if (!Array.isArray(parsed)) {
      console.error('[Tracker] stats.json root is not an array; starting fresh array.');
      return [];
    }
    const currentYear = new Date().getUTCFullYear();
    return parsed
      .filter((entry) => entry && typeof entry === 'object')
      .map((entry) => ({
        ...entry,
        date: normalizeDateKey(entry.date, currentYear) || entry.date
      }));
  } catch (err) {
    console.error(`[Tracker] Failed to parse stats.json: ${sanitizeLogMessage(err.message)}`);
    return [];
  }
}

async function fetchYouTubeStats(previousYouTube) {
  const cached = previousYouTube && typeof previousYouTube === 'object' ? { ...previousYouTube } : null;

  if (!YT_KEY) {
    console.error(
      '[YouTube] Missing YT_KEY environment variable. Set GitHub Actions Secret "YT_KEY" to enable live YouTube tracking.'
    );
    return {
      stats: cached
        ? { ...cached, status: 'missing_key', scope: 'lifetime_channel' }
        : { subscribers: null, views: null, uploads: null, engagement: null, status: 'missing_key', scope: 'lifetime_channel' },
      updated: false,
      error: 'MISSING_YT_KEY'
    };
  }

  try {
    const endpoint = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(YT_CHANNEL)}&key=${encodeURIComponent(YT_KEY)}`;
    const res = await fetch(endpoint);

    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }

    if (!res.ok) {
      const apiReason = data && data.error && data.error.message ? data.error.message : `HTTP ${res.status}`;
      console.error(`[YouTube] API request failed (${res.status}): ${sanitizeLogMessage(apiReason)}`);
      return {
        stats: cached
          ? { ...cached, status: 'api_error_cached', scope: 'lifetime_channel' }
          : { subscribers: null, views: null, uploads: null, engagement: null, status: 'api_error', scope: 'lifetime_channel' },
        updated: false,
        error: `HTTP_${res.status}`
      };
    }

    if (!data || !Array.isArray(data.items) || data.items.length === 0 || !data.items[0].statistics) {
      console.error('[YouTube] API returned no channel statistics for the configured channel ID.');
      return {
        stats: cached
          ? { ...cached, status: 'empty_response_cached', scope: 'lifetime_channel' }
          : { subscribers: null, views: null, uploads: null, engagement: null, status: 'empty_response', scope: 'lifetime_channel' },
        updated: false,
        error: 'EMPTY_ITEMS'
      };
    }

    const s = data.items[0].statistics;
    const subscribers = toFiniteNumberOrNull(s.subscriberCount);
    const views = toFiniteNumberOrNull(s.viewCount);
    const uploads = toFiniteNumberOrNull(s.videoCount);

    // Note: YouTube Data API v3 channels.statistics does not return lifetime likes/comments.
    // Never fabricate engagement via synthetic multipliers; record null when unavailable.
    return {
      stats: {
        subscribers,
        views,
        uploads,
        engagement: null,
        scope: 'lifetime_channel',
        status: 'live'
      },
      updated: true,
      error: null
    };
  } catch (err) {
    console.error(`[YouTube] Network or fetch error: ${sanitizeLogMessage(err.message)}`);
    return {
      stats: cached
        ? { ...cached, status: 'network_error_cached', scope: 'lifetime_channel' }
        : { subscribers: null, views: null, uploads: null, engagement: null, status: 'network_error', scope: 'lifetime_channel' },
      updated: false,
      error: 'NETWORK_ERROR'
    };
  }
}

async function fetchInstagramStats(previousInstagram) {
  const prev = previousInstagram && typeof previousInstagram === 'object' ? previousInstagram : {};

  // Preserve any known lifetime baseline without letting the 6-post Behold feed overwrite or shrink it.
  const prevLifetime = prev.lifetime && typeof prev.lifetime === 'object'
    ? { ...prev.lifetime }
    : {
        followers: toFiniteNumberOrNull(prev.followers),
        views: null,
        uploads: null,
        engagement: null
      };

  try {
    const res = await fetch(IG_FEED_URL);
    if (!res.ok) {
      console.error(`[Instagram] Behold feed request failed with HTTP ${res.status}.`);
      return {
        stats: {
          followers: prevLifetime.followers,
          views: toFiniteNumberOrNull(prev.views),
          uploads: prevLifetime.uploads,
          engagement: toFiniteNumberOrNull(prev.engagement),
          scope: prev.scope || 'recent_feed_snapshot',
          status: 'api_error_cached',
          lifetime: prevLifetime,
          recentFeed: prev.recentFeed || null
        },
        updated: false,
        error: `HTTP_${res.status}`
      };
    }

    const data = await res.json();
    const posts = Array.isArray(data) ? data : (Array.isArray(data && data.posts) ? data.posts : []);

    if (posts.length === 0) {
      console.error('[Instagram] Behold feed returned 0 posts.');
      return {
        stats: {
          followers: prevLifetime.followers,
          views: toFiniteNumberOrNull(prev.views),
          uploads: prevLifetime.uploads,
          engagement: toFiniteNumberOrNull(prev.engagement),
          scope: prev.scope || 'recent_feed_snapshot',
          status: 'empty_response_cached',
          lifetime: prevLifetime,
          recentFeed: prev.recentFeed || null
        },
        updated: false,
        error: 'EMPTY_POSTS'
      };
    }

    let totalLikes = 0;
    let totalComments = 0;
    let trackedViewsSum = 0;
    let postsWithNativeViews = 0;

    for (const p of posts) {
      const likes = toFiniteNumberOrNull(p.likeCount) || 0;
      const comments = toFiniteNumberOrNull(p.commentsCount) || 0;
      totalLikes += likes;
      totalComments += comments;

      // Only count actual view/play counts reported by the feed — never fabricate views via likeCount * 14.
      const nativeViews = toFiniteNumberOrNull(p.playCount ?? p.viewCount);
      if (nativeViews !== null) {
        trackedViewsSum += nativeViews;
        postsWithNativeViews += 1;
      }
    }

    const totalInteractions = totalLikes + totalComments;
    const trackedViews = postsWithNativeViews > 0 ? trackedViewsSum : null;

    // Never overwrite lifetime uploads or lifetime totals with the 6-post feed window.
    // Keep top-level followers from known baseline, keep top-level uploads null/lifetime (not posts.length),
    // and store the 6-post feed window explicitly in recentFeed.
    return {
      stats: {
        followers: prevLifetime.followers,
        views: prevLifetime.views,
        uploads: prevLifetime.uploads,
        engagement: prevLifetime.engagement,
        scope: 'recent_feed_snapshot',
        status: 'live_recent_feed',
        lifetime: prevLifetime,
        recentFeed: {
          postCount: posts.length,
          likes: totalLikes,
          comments: totalComments,
          engagement: totalInteractions,
          views: trackedViews,
          postsWithNativeViews,
          source: 'behold_recent_feed'
        }
      },
      updated: true,
      error: null
    };
  } catch (err) {
    console.error(`[Instagram] Network or parse error: ${sanitizeLogMessage(err.message)}`);
    return {
      stats: {
        followers: prevLifetime.followers,
        views: toFiniteNumberOrNull(prev.views),
        uploads: prevLifetime.uploads,
        engagement: toFiniteNumberOrNull(prev.engagement),
        scope: prev.scope || 'recent_feed_snapshot',
        status: 'network_error_cached',
        lifetime: prevLifetime,
        recentFeed: prev.recentFeed || null
      },
      updated: false,
      error: 'NETWORK_ERROR'
    };
  }
}

async function runTracker() {
  const dateKey = getIsoDateUTC(new Date());
  const history = loadHistory();
  const lastEntry = history.length > 0 ? history[history.length - 1] : null;

  const ytResult = await fetchYouTubeStats(lastEntry ? lastEntry.youtube : null);
  const igResult = await fetchInstagramStats(lastEntry ? lastEntry.instagram : null);

  if (!ytResult.updated && !igResult.updated) {
    console.error(
      `[Tracker] Both YouTube (${ytResult.error}) and Instagram (${igResult.error}) failed to fetch live data. Leaving stats.json unchanged.`
    );
    process.exitCode = 1;
    return;
  }

  const newEntry = {
    date: dateKey,
    recordedAt: new Date().toISOString(),
    youtube: ytResult.stats,
    instagram: igResult.stats
  };

  const existingIndex = history.findIndex((entry) => entry.date === dateKey);
  if (existingIndex !== -1) {
    history[existingIndex] = newEntry;
  } else {
    history.push(newEntry);
  }

  // Sort chronologically by ISO YYYY-MM-DD date and keep latest MAX_HISTORY_DAYS entries
  history.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const trimmedHistory = history.length > MAX_HISTORY_DAYS ? history.slice(-MAX_HISTORY_DAYS) : history;

  fs.writeFileSync(FILE_PATH, JSON.stringify(trimmedHistory, null, 2) + '\n', 'utf-8');
  console.log(
    `[Tracker] Saved metrics for ${dateKey} (YouTube: ${ytResult.stats.status}, Instagram: ${igResult.stats.status}).`
  );
}

runTracker().catch((err) => {
  console.error(`[Tracker] Unhandled fatal error: ${sanitizeLogMessage(err.message)}`);
  process.exitCode = 1;
});
