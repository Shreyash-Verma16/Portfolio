# Developer Portfolio

A personal static web portfolio showcasing my work as a software developer, tech content creator, and student.

## About

I'm a BCA student focused on backend development and AI-powered software engineering.

This portfolio is a place to present my work, document my progress, and share the projects I'm building.

## Project Structure

This project is a zero-build static HTML/CSS/JavaScript site (styled via Tailwind CSS CDN, animated with GSAP, and charted with Chart.js):

```text
Portfolio/
├── index.html                           # Splash screen & 3D holographic persona gateway
├── developer.html                       # Developer portfolio (academics, skills, Proof of Work, contact)
├── devloper.html                        # Backward-compatibility redirect to developer.html
├── creator.html                         # Creator portfolio (workflow, stats.json analytics, tools, work)
├── person.html                          # Personal profile (background, hobbies, values, principles)
├── stats.json                           # Daily YouTube & Instagram metrics history (ISO YYYY-MM-DD)
├── scripts/
│   └── tracker.js                       # Node.js script that updates stats.json (run daily via GitHub Actions)
├── .github/workflows/
│   └── daily-tracker.yml                # Scheduled daily GitHub Actions workflow
└── google07ffa928433e943a.html          # Google Search Console verification file
```

## Preview Locally

Because `creator.html` fetches `stats.json` via `fetch()`, serve the folder with any static HTTP server rather than opening files directly via `file://`:

1. Clone this repository and enter the directory:
   ```bash
   git clone https://github.com/Shreyash-Verma16/Portfolio.git
   cd Portfolio
   ```
2. Start a local static server (choose any option):
   ```bash
   # Using Python 3
   python -m http.server 8000

   # Or using Node.js (npx)
   npx serve .
   ```
3. Open `http://localhost:8000` in your browser.

## Automated Metrics & Deployment

- **Hosting:** Deployed directly as a static site on Vercel (`shreyashverma.vercel.app`) — no build step or package manager installation is required.
- **Daily Metrics Logger:** `.github/workflows/daily-tracker.yml` runs `node scripts/tracker.js` daily using Node.js 20 and commits changes to `stats.json`.
  - Required GitHub Actions secret: `YT_KEY` (YouTube Data API v3 key).
  - Optional GitHub Actions secret: `IG_FEED_URL` (Behold public feed URL override).

## Live Portfolio

[shreyashverma.vercel.app](https://shreyashverma.vercel.app)

## Connect

- **GitHub:** [github.com/Shreyash-Verma16](https://github.com/Shreyash-Verma16)
- **LinkedIn:** [linkedin.com/in/shreyash-verma-9b791b400](https://www.linkedin.com/in/shreyash-verma-9b791b400/)

## Usage & Rights

© 2026 Shreyash Verma. All rights reserved.

This personal developer portfolio, including its layout, source code, design, copy, and personal branding, is **not** an open-source template. You may view this repository for reference only and may **not** copy, clone for redistribution, or publish this portfolio or its assets as your own without prior written permission.

---

Built and maintained as part of my software development journey.
