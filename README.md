# Review Radar 🛰️

Review Radar is a production-quality Chrome Extension that helps users make instant, confident shopping decisions on **Amazon** and **Flipkart**. Powered by the Gemini API, it extracts, digests, and evaluates review sentiment in seconds, answering the ultimate consumer question: **"Would I buy this product?"**

Instead of reading hundreds of reviews, users get a high-impact, single-card recommendation, a Trust Score, category-specific drivers, audience targeting, and a percentage breakdown of common complaints.

---

## 🌟 Key Features

* **Recommendation Verdict**: Instant buying suggestion (`✅ Recommended`, `⚠️ Consider Carefully`, `❌ Not Recommended`) displayed with clear, bulleted explanations.
* **Trust Score (0-100)**: A consolidated trust rating that drops significantly on red flags (e.g., product failure after 1 month, customer support complaints).
* **Confidence Rating**: Visual indicator (`High`, `Medium`, `Low`) based directly on the sample size of reviews parsed.
* **Category & Price Awareness**: Automatically classifies the product category and parses the listing price to evaluate overall value for money.
* **Key Decision Drivers**: Displays what users praise most versus what they dislike.
* **Common Complaints breakdown**: An analytical percentage bar chart showing the frequency of recurring complaints (e.g. *Heating (31%)*).
* **Audience Profiles ("Who is this for?")**: Quick checklists highlighting the ideal target demographic (`Ideal For`) and who should avoid the product (`Not Ideal For`).
* **Warning States**: Triggers warnings if limited review data is available (< 5 reviews found) to prevent AI hallucinations.
* **Robust Client-Side Caching**: Automatically hashes and caches analyses based on `URL + ReviewCount + ReviewSnippet`. Re-opening the extension loads instantly, with an option to manually "Re-analyze".

---

## 🚀 Tech Stack

* **Frontend**: React, TypeScript, Tailwind CSS
* **Build Tool**: Vite (Rollup config bundle for service workers & content scripts)
* **AI Engine**: Google Gemini API (`gemini-1.5-flash`)
* **Platform**: Manifest V3 Chrome Extension

---

## 📂 Project Structure

```
Review Radar/
├── dist/                       # Compiled Chrome Extension package (Vite output)
├── docs/
│   └── case-study.md           # Product Case Study (Metrics, Problem, Roadmap)
├── public/
│   ├── manifest.json           # Extension Manifest config
│   └── icons/                  # 16px, 48px, 128px PNG icons
├── screenshots/                # Showcase Mockups & Screenshots
│   ├── onboarding.png
│   ├── analysis.png
│   ├── warning-state.png
│   └── settings.png
└── src/
    ├── types.ts                # TypeScript interfaces
    ├── config.ts               # Configurable constants (GEMINI_MODEL, limits)
    ├── popup/
    │   ├── main.tsx            # React entry
    │   ├── App.tsx             # Dashboard, Onboarding & Settings screens
    │   └── index.css           # CSS with Tailwind imports
    ├── content/
    │   └── content.ts          # Amazon/Flipkart scrapper
    └── background/
        └── background.ts       # Service worker (Gemini fetch, validation, retry, cache)
```

---

## ⚙️ Installation & Setup

### 1. Build the Extension
Ensure you have [Node.js](https://nodejs.org/) installed. Run the following commands in your terminal:

```bash
# Install dependencies
npm install

# Build the project (compiles TypeScript and bundles via Vite)
npm run build
```

This compiles all files into the `/dist` directory.

### 2. Load into Google Chrome
1. Open Google Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** in the top-left corner.
4. Select the `/dist` folder inside the project root.
5. The **Review Radar** extension is now loaded and visible in your extension toolbar!

### 3. Setup Gemini API Key
1. Click the extension icon.
2. The onboarding screen will guide you to input your Gemini API Key. (You can generate a free key instantly in [Google AI Studio](https://aistudio.google.com/)).
3. Paste the key and click **Get Started**. Your key is securely saved in local storage.

---

## 📸 Screenshots Showcase

*To prepare your resume for recruiters, take screenshot captures of the extension screens and save them to `/screenshots/` as referenced below:*

1. **Onboarding Screen (`/screenshots/onboarding.png`)**
   *Shows the clean, slate-dark setup screen guiding the user to enter their API key.*
2. **Main Dashboard (`/screenshots/analysis.png`)**
   *Shows a successfully analyzed product page displaying the ✅ Recommended hero card, Trust Score, Sentiment Bar, decision drivers, and complaints.*
3. **Limited Review Warning (`/screenshots/warning-state.png`)**
   *Shows the yellow alert banner warning the user about limited reviews (< 5).*
4. **Settings Configuration Overlay (`/screenshots/settings.png`)**
   *Shows the options screen allowing the user to update their API key.*

---

## 📄 Product Case Study
To read more about the product decisions, Success metrics, and future roadmap, read our full [Product Case Study](file:///C:/Users/Ananya%20Prakash/Desktop/Review%20Radar/docs/case-study.md).
