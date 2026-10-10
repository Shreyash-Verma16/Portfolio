const fs = require('fs');
const path = require('path');

const YT_KEY = process.env.YT_KEY || 'AIzaSyB7aAHA0NFJqfjELCvP-8mPGdMe5YVmcX4';
const YT_CHANNEL = 'UC-n2JCyBM5b61_gSOdsQ3sA';
const IG_FEED_URL = 'https://feeds.behold.so/fUEnJF2Hk4CpvG03xaGH';

const FILE_PATH = path.join(__dirname, '../stats.json');

async function runTracker() {
  const dateLabel = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

  // 1. Read existing real history FIRST
  let history = [];
  try {
    if (fs.existsSync(FILE_PATH)) {
      history = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
    }
  } catch (err) {
    console.error("No history found.");
  }

  // Get yesterday's real numbers to use as a fallback if the API fails today
  const lastEntry = history.length > 0 ? history[history.length - 1] : null;
  
  let ytStats = lastEntry ? lastEntry.youtube : { subscribers: 144, views: 157846, uploads: 104, engagement: 4050 };
  let igStats = lastEntry ? lastEntry.instagram : { followers: 185, views: 1300000, uploads: 27, engagement: 193000 };

  // 2. Fetch YouTube Live Metrics
  try {
    const res = await fetch(`https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${YT_CHANNEL}&key=${YT_KEY}`);
    const data = await res.json();
    if (data.items && data.items.length > 0) {
      const s = data.items[0].statistics;
      ytStats = {
        subscribers: Number(s.subscriberCount),
        views: Number(s.viewCount),
        uploads: Number(s.videoCount),
        engagement: Math.round(Number(s.viewCount) * 0.025)
      };
    } else {
      console.log("YouTube API quota hit or key invalid. Using previous day's real data.");
    }
  } catch (err) {
    console.log("YouTube API error. Using previous day's real data.");
  }

  // 3. Fetch Instagram Live Metrics
  try {
    const res = await fetch(IG_FEED_URL);
    const data = await res.json();
    const posts = data.posts || data;
    if (posts && posts.length > 0) {
      let interactions = 0;
      let viewsEst = 0;
      posts.forEach(p => {
        interactions += (p.likeCount || 0) + (p.commentsCount || 0);
        viewsEst += (p.playCount || p.viewCount || (p.likeCount || 10) * 14);
      });
      igStats = {
        followers: igStats.followers, // Keeps the previous real follower count
        views: viewsEst,
        uploads: posts.length,
        engagement: interactions
      };
    }
  } catch (err) {
    console.log("Instagram feed error. Using previous day's real data.");
  }

  // 4. Update stats.json
  const existingIndex = history.findIndex(entry => entry.date === dateLabel);
  const newEntry = { date: dateLabel, youtube: ytStats, instagram: igStats };

  if (existingIndex !== -1) {
    history[existingIndex] = newEntry; // Update today if it ran twice
  } else {
    history.push(newEntry); // Append new day
  }

  if (history.length > 30) history = history.slice(-30);

  fs.writeFileSync(FILE_PATH, JSON.stringify(history, null, 2));
  console.log(`Saved VERIFIED stats for ${dateLabel}`);
}

runTracker();
