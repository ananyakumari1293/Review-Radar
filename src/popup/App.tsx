import React, { useState, useEffect } from 'react';
import { 
  Settings, ArrowLeft, AlertTriangle, CheckCircle2, XCircle, 
  RotateCw, ThumbsUp, ThumbsDown, ShieldAlert, Award,
  Sparkles, Eye, EyeOff, Check, X, Bookmark
} from 'lucide-react';
import { ProductDetails, AnalysisResult, ExtensionSettings } from '../types';
import { GEMINI_ENDPOINT, GEMINI_API_VERSION, GEMINI_MODEL } from '../config';

// Detect if running inside a Chrome Extension context
const isExtension = typeof chrome !== 'undefined' && 
                    typeof chrome.storage !== 'undefined' && 
                    typeof chrome.storage.local !== 'undefined';

// LocalStorage mock wrapper matching the chrome.storage.local API structure
const mockStorage = {
  get: async (keys: string | string[] | Record<string, any>) => {
    const res: Record<string, any> = {};
    const getSingle = (k: string) => {
      const item = localStorage.getItem(k);
      return item ? JSON.parse(item) : undefined;
    };

    if (typeof keys === 'string') {
      res[keys] = getSingle(keys);
    } else if (Array.isArray(keys)) {
      keys.forEach(k => {
        res[k] = getSingle(k);
      });
    } else if (typeof keys === 'object' && keys !== null) {
      Object.keys(keys).forEach(k => {
        const val = getSingle(k);
        res[k] = val !== undefined ? val : keys[k];
      });
    }
    return res;
  },
  set: async (items: Record<string, any>) => {
    Object.entries(items).forEach(([key, val]) => {
      localStorage.setItem(key, JSON.stringify(val));
    });
  }
};

const chromeStorage = isExtension ? chrome.storage.local : mockStorage;

// Fallback mock product details for localhost development mode
const MOCK_PRODUCT: ProductDetails = {
  name: "Sony WH-1000XM4 Wireless Noise Cancelling Headphones",
  rating: "4.6 out of 5 stars",
  price: "$278.00",
  category: "Headphones",
  url: "https://www.amazon.com/Sony-WH-1000XM4-Canceling-Headphones-Refurbished/dp/B08H2HMB9Z",
  imageUrl: "https://images-na.ssl-images-amazon.com/images/I/71o8Q5GLAbL._AC_SL1500_.jpg",
  reviews: [
    "Amazing sound quality and the noise cancelling is the best I've ever experienced! Battery life easily lasts me a whole week of commuting.",
    "Very comfortable to wear for long hours. The touch controls on the ear cup are a bit sensitive but you get used to it.",
    "The mic quality is decent but not great for noisy environments. However, for music and ANC, these are unmatched.",
    "Extremely disappointed with the multi-device connection. It keeps dropping connection to my laptop when my phone gets a notification.",
    "Excellent value for money. The sound profile is slightly bass-heavy out of the box but the EQ in the app is highly customizable.",
    "Mine started making a high-pitched squealing noise in the left ear cup after 3 months. Customer support was helpful and replaced them quickly though.",
    "Great battery life, foldability is a nice plus. The case is premium. Best headphones of the year definitely.",
    "ANC is top tier. Audio is crisp. Highly recommended for travelers."
  ],
  lowReviews: false
};

// Robust cache key generator (matching background.ts)
function generateCacheKey(details: ProductDetails): string {
  const url = details.url.split('?')[0];
  const count = details.reviews.length;
  const snippet = details.reviews[0] ? details.reviews[0].slice(0, 40) : '';
  return `rr_cache_${encodeURIComponent(url)}_${count}_${encodeURIComponent(snippet)}`;
}

// Sanitize raw text to JSON (matching background.ts)
function sanitizeJsonResponse(text: string): string {
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

// Perform direct Gemini API content generation call (Localhost fallback)
async function analyzeWithGeminiDirect(details: ProductDetails, apiKey: string): Promise<AnalysisResult> {
  const reviewsBlock = details.reviews.length > 0 
    ? details.reviews.map((r, i) => `[Review ${i + 1}]: "${r}"`).join('\n\n')
    : "No reviews provided.";

  const prompt = `You are Review Radar, a highly experienced Product Manager and consumer buying assistant.
Analyze the following product information and reviews:

Product Name: ${details.name}
Public Star Rating: ${details.rating}
Product Price: ${details.price || 'Not listed'}

Product Reviews:
${reviewsBlock}

Your task is to analyze these product details and reviews to provide a comprehensive, objective recommendation report.

Determine:
1. Product Category: e.g., Smartphone, Laptop, Headphones, Clothing, Kitchen Appliance, etc.
2. Value for money assessment based on price and typical complaints.
3. Trust Score: An integer from 0 to 100 indicating general product trust. If there are red flags (fake reviews, broken after a month), lower the score significantly.
4. Sentiment breakdown percentage (Positive, Neutral, Negative). Must sum up to 100.
5. Key Decision Drivers: Top 2-4 items that users love (e.g. Battery Life, Build Quality) and top 2-4 items that users dislike (e.g. Heating, Camera, Shipping).
6. 3-5 Pros (specific aspects) and 3-5 Cons.
7. Red Flags: List critical repeated issues like "stops working after one week", "counterfeit product", "horrible support". If none, return empty array [].
8. Purchase Recommendation: Choose EXACTLY one of: "Recommended", "Consider Carefully", "Not Recommended".
   - Choose "Recommended" if trust is high, pros far outweigh cons, and there are no critical red flags.
   - Choose "Consider Carefully" if there are mixed opinions, minor cons, or is overpriced but otherwise functional.
   - Choose "Not Recommended" if trust is low, there are severe red flags, or complaints are widespread.
9. A short, constructive explanation for this recommendation.
10. Confidence Score ("High", "Medium", "Low") based on number of reviews (e.g. >15 reviews is High, 5-15 is Medium, <5 is Low).
11. Common Complaints: An array of objects with "aspect" and "percentage" (approximate percentage of reviews complaining about this, e.g. [{"aspect": "Heating", "percentage": 30}]). If none, return empty array [].
12. Target Audience lists: idealFor (e.g. "Gamers", "Budget buyers") and notIdealFor.
13. One-line Verdict: A direct, punchy one-liner summarizing the analysis.

You MUST respond with a valid JSON object ONLY. Do not include markdown codeblocks (do not wrap in \`\`\`json), and do not include explanations outside the JSON.

Expected JSON Structure:
{
  "trustScore": 84,
  "positivePercent": 72,
  "neutralPercent": 18,
  "negativePercent": 10,
  "pros": ["Pros list"],
  "cons": ["Cons list"],
  "redFlags": ["Red flags list"],
  "recommendation": "Recommended",
  "reason": "Explanatory text...",
  "confidenceScore": "High",
  "keyDecisionDrivers": {
    "love": ["aspect 1", "aspect 2"],
    "dislike": ["aspect 1", "aspect 2"]
  },
  "commonComplaints": [
    { "aspect": "Heating", "percentage": 31 }
  ],
  "idealFor": ["User type 1", "User type 2"],
  "notIdealFor": ["User type 1"],
  "oneLineVerdict": "Verdict...",
  "category": "Product Category",
  "priceAssessment": "Price value assessment..."
}`;

  const url = `${GEMINI_ENDPOINT}/${GEMINI_API_VERSION}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt }
        ]
      }
    ]
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errText = await response.text();
    if (response.status === 404) {
      let modelList = 'None listed';
      try {
        const diagUrl = `${GEMINI_ENDPOINT}/${GEMINI_API_VERSION}/models?key=${apiKey}`;
        const diagRes = await fetch(diagUrl);
        if (diagRes.ok) {
          const diagData = await diagRes.json();
          if (diagData.models && Array.isArray(diagData.models)) {
            modelList = diagData.models.map((m: any) => m.name.replace('models/', '')).join(', ');
          }
        }
      } catch (diagErr) {
        console.error("Diagnostics list failed:", diagErr);
      }
      throw new Error(`Model not found (404): The model "${GEMINI_MODEL}" is not found. Available models for your API Key: [${modelList}]. Please configure one in src/config.ts.`);
    }
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const resultData = await response.json();
  const rawText = resultData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error("Empty response returned from Gemini API.");
  }

  const sanitizedText = sanitizeJsonResponse(rawText);
  const parsed: AnalysisResult = JSON.parse(sanitizedText);
  
  if (typeof parsed.trustScore !== 'number' || !parsed.recommendation || !parsed.reason) {
    throw new Error("API response is missing required analysis fields.");
  }

  parsed.analyzedAt = new Date().toISOString();
  parsed.reviewsCount = details.reviews.length;

  return parsed;
}

export default function App() {
  // Navigation & UI States
  const [view, setView] = useState<'loading' | 'dashboard' | 'onboarding' | 'unsupported' | 'error'>('loading');
  const [showSettings, setShowSettings] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  
  // Data States
  const [productDetails, setProductDetails] = useState<ProductDetails | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [loadingTextIndex, setLoadingTextIndex] = useState(0);

  // Loading Screen text cycle
  const loadingMessages = [
    "Radar scanning reviews...",
    "Isolating genuine comments...",
    "Consulting Gemini AI...",
    "Assessing price and category value...",
    "Compiling recommendation profile..."
  ];

  useEffect(() => {
    if (view !== 'loading') return;
    const interval = setInterval(() => {
      setLoadingTextIndex((prev) => (prev + 1) % loadingMessages.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [view]);

  // Load configuration on mount
  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      console.log("Review Radar: Starting initialization...");
      console.log(`Review Radar System Config:
- Model: ${GEMINI_MODEL}
- Endpoint: ${GEMINI_ENDPOINT}
- API Version: ${GEMINI_API_VERSION}`);
      setView('loading');
      
      // 1. Check if API Key is configured using environment-aware storage helper
      console.log("Review Radar: Fetching settings...");
      const settingsObj = await chromeStorage.get('settings');
      const savedKey = (settingsObj?.settings as ExtensionSettings)?.apiKey || '';
      setApiKey(savedKey);
      
      if (!savedKey) {
        console.log("Review Radar: Gemini API Key missing, showing onboarding screen.");
        setView('onboarding');
        return;
      }

      // 2. Fallback check for localhost / browser tab query
      if (!isExtension) {
        console.log("Review Radar: Running in web browser context. Loading mock product details.");
        setProductDetails(MOCK_PRODUCT);
        await triggerAnalysis(MOCK_PRODUCT, false);
        return;
      }

      console.log("Review Radar: Querying Chrome active tab...");
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || !tab.url) {
        throw new Error("Unable to access the active browser tab. Make sure you are on a web page.");
      }

      const url = tab.url;
      const isSupported = url.includes('amazon.') || url.includes('flipkart.com');
      if (!isSupported) {
        console.log("Review Radar: Tab URL is not a supported store.");
        setView('unsupported');
        return;
      }

      // 3. Message content script to scrape product details
      if (tab.id) {
        console.log("Review Radar: Sending GET_PRODUCT_DETAILS message to tab ID", tab.id);
        chrome.tabs.sendMessage(tab.id, { action: 'GET_PRODUCT_DETAILS' }, (response) => {
          if (chrome.runtime.lastError) {
            console.error("Messaging error:", chrome.runtime.lastError);
            setErrorMessage("Please refresh the product page to enable Review Radar scraper.");
            setView('error');
            return;
          }

          if (response && response.success && response.details) {
            console.log("Review Radar: Scraped product details successfully:", response.details.name);
            setProductDetails(response.details);
            triggerAnalysis(response.details, false);
          } else {
            setErrorMessage(response?.error || "Failed to extract product details from this page.");
            setView('error');
          }
        });
      }
    } catch (err: any) {
      console.error("Initialization error details:", err);
      let msg = err?.message || "An unexpected error occurred during startup.";
      if (msg.includes("Failed to fetch")) {
        msg = "Network connection failed. Please check your internet connection and try again.";
      }
      setErrorMessage(msg);
      setView('error');
    }
  };

  // Trigger Gemini analysis
  const triggerAnalysis = async (details: ProductDetails, forceFresh: boolean) => {
    setView('loading');
    
    // Fallback for Local Environment (direct API fetching)
    if (!isExtension) {
      console.log("Review Radar: Performing direct analysis for local development...");
      try {
        const cacheKey = generateCacheKey(details);
        if (!forceFresh) {
          const cached = await chromeStorage.get(cacheKey);
          if (cached && cached[cacheKey]) {
            console.log("Review Radar: Mock Cache Hit for key", cacheKey);
            setAnalysis(cached[cacheKey]);
            setView('dashboard');
            return;
          }
        }
        
        // Fetch API key directly from settings
        const settingsObj = await chromeStorage.get('settings');
        const key = (settingsObj?.settings as ExtensionSettings)?.apiKey;
        if (!key) {
          console.warn("Review Radar: API key not set in mock storage.");
          setView('onboarding');
          return;
        }
        
        const result = await analyzeWithGeminiDirect(details, key);
        // Cache result in mock localStorage
        await chromeStorage.set({ [cacheKey]: result });
        setAnalysis(result);
        setView('dashboard');
      } catch (err: any) {
        console.error("Direct API analysis failure:", err);
        let msg = err?.message || "Failed to analyze reviews using direct Gemini API.";
        if (msg.includes("Failed to fetch")) {
          msg = "Network connection failed. Please check your internet connection and try again.";
        }
        setErrorMessage(msg);
        setView('error');
      }
      return;
    }

    // Extension environment using Background script
    console.log("Review Radar: Sending ANALYZE_PRODUCT message to background script...");
    chrome.runtime.sendMessage({ 
      action: 'ANALYZE_PRODUCT', 
      details, 
      forceFresh 
    }, (response) => {
      if (response && response.success && response.result) {
        console.log("Review Radar: Analysis retrieved successfully:", response.result.trustScore);
        setAnalysis(response.result);
        setView('dashboard');
      } else {
        const err = response?.error || "Review analysis failed.";
        console.error("Analysis background response failure:", err);
        if (err === 'API_KEY_MISSING') {
          setView('onboarding');
        } else {
          setErrorMessage(err);
          setView('error');
        }
      }
    });
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    
    console.log("Review Radar: Saving settings to environment storage...");
    await chromeStorage.set({
      settings: {
        apiKey: apiKey.trim(),
        geminiModel: 'gemini-1.5-flash'
      }
    });
    
    setShowSettings(false);
    initializeApp();
  };

  // Helper: Get recommendation styles
  const getRecStyles = (rec: "Recommended" | "Consider Carefully" | "Not Recommended") => {
    switch (rec) {
      case "Recommended":
        return {
          bg: "bg-emerald-950/40 border-emerald-500/30 text-emerald-300",
          badge: "bg-emerald-500 text-slate-950 font-bold",
          icon: <CheckCircle2 className="w-6 h-6 text-emerald-400" />,
          color: "text-emerald-400"
        };
      case "Consider Carefully":
        return {
          bg: "bg-amber-950/40 border-amber-500/30 text-amber-300",
          badge: "bg-amber-500 text-slate-950 font-bold",
          icon: <AlertTriangle className="w-6 h-6 text-amber-400" />,
          color: "text-amber-400"
        };
      case "Not Recommended":
        return {
          bg: "bg-rose-950/40 border-rose-500/30 text-rose-300",
          badge: "bg-rose-500 text-white font-bold",
          icon: <XCircle className="w-6 h-6 text-rose-400" />,
          color: "text-rose-400"
        };
    }
  };

  // Helper: calculate relative time
  const getRelativeTime = (isoString?: string): string => {
    if (!isoString) return 'Just now';
    const diff = Date.now() - new Date(isoString).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes === 1) return '1 minute ago';
    return `${minutes} minutes ago`;
  };

  // Direct render for Onboarding screen
  if (view === 'onboarding') {
    return (
      <div className="w-[420px] min-h-[580px] p-6 bg-slate-900 flex flex-col justify-between select-none">
        <div>
          <div className="flex items-center gap-2 mb-6">
            <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
              <Sparkles className="w-6 h-6 text-emerald-400 animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white font-outfit">Review Radar</h1>
              <p className="text-xs text-slate-400">AI purchase-decision companion</p>
            </div>
          </div>

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 mb-6">
            <h2 className="text-sm font-semibold text-slate-200 mb-2 font-outfit">Set Up Gemini API</h2>
            <p className="text-xs text-slate-400 leading-relaxed mb-3">
              This extension uses Google's Gemini Flash model to analyze ecommerce review patterns.
            </p>
            <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside">
              <li>Go to <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">Google AI Studio</a></li>
              <li>Sign in and click <strong>Create API Key</strong></li>
              <li>Paste your key in the field below</li>
            </ol>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">Gemini API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-emerald-500 pr-10 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={!apiKey.trim()}
              className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 text-sm font-semibold py-2 px-4 rounded-lg transition-colors font-outfit"
            >
              Get Started
            </button>
          </form>
        </div>
        
        <div className="text-center text-[10px] text-slate-500">
          Your key is stored locally on this device.
        </div>
      </div>
    );
  }

  // Settings View Overlay
  if (showSettings) {
    return (
      <div className="w-[420px] min-h-[580px] p-6 bg-slate-900 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3 mb-6">
            <button 
              onClick={() => setShowSettings(false)}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-bold text-white font-outfit">Extension Settings</h1>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Gemini API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 pr-10 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Active AI Model</label>
              <input
                type="text"
                disabled
                value="gemini-1.5-flash (Configurable)"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-500 font-mono cursor-not-allowed"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-bold py-2 rounded-lg transition-colors font-outfit"
            >
              Save Configuration
            </button>
          </form>
        </div>

        <div className="bg-slate-800/40 border border-slate-800 p-3 rounded-lg text-[10px] text-slate-500 space-y-1">
          <p>Review Radar v1.0.0</p>
          <p>Caching: Indexed by URL + review count + snippet hash.</p>
        </div>
      </div>
    );
  }

  // Loading Screen
  if (view === 'loading') {
    return (
      <div className="w-[420px] min-h-[580px] p-6 bg-slate-900 flex flex-col items-center justify-center space-y-6">
        <div className="relative flex items-center justify-center w-20 h-20">
          <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20 animate-pulse"></div>
          <div className="absolute inset-2 rounded-full border-4 border-t-emerald-500 border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>
          <Sparkles className="w-8 h-8 text-emerald-400" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-sm font-semibold text-slate-200 font-outfit tracking-wide uppercase">
            Scanning Reviews
          </h2>
          <p className="text-xs text-slate-400 h-4 transition-all duration-300">
            {loadingMessages[loadingTextIndex]}
          </p>
        </div>
      </div>
    );
  }

  // Unsupported Store Error Screen
  if (view === 'unsupported') {
    return (
      <div className="w-[420px] min-h-[580px] p-6 bg-slate-900 flex flex-col items-center justify-center text-center space-y-6">
        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-full">
          <AlertTriangle className="w-10 h-10 text-amber-400" />
        </div>
        <div className="space-y-2 max-w-sm">
          <h2 className="text-base font-bold text-slate-100 font-outfit">Unsupported Store Page</h2>
          <p className="text-xs text-slate-400 leading-relaxed px-4">
            Review Radar operates on product pages of <strong>Amazon</strong> and <strong>Flipkart</strong>.
          </p>
          <p className="text-[11px] text-slate-500 mt-2">
            Please navigate to an active product detail view on these websites and try again.
          </p>
        </div>
      </div>
    );
  }

  // General Error Screen
  if (view === 'error') {
    return (
      <div className="w-[420px] min-h-[580px] p-6 bg-slate-900 flex flex-col items-center justify-center text-center space-y-6">
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-full">
          <XCircle className="w-10 h-10 text-rose-400" />
        </div>
        <div className="space-y-2">
          <h2 className="text-base font-bold text-slate-100 font-outfit">Analysis Disrupted</h2>
          <p className="text-xs text-slate-400 max-w-xs leading-relaxed mx-auto">
            {errorMessage}
          </p>
        </div>
        <div className="flex gap-3 w-full max-w-xs">
          <button
            onClick={initializeApp}
            className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5"
          >
            <RotateCw className="w-3.5 h-3.5" />
            Retry Check
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="flex-1 bg-slate-700 hover:bg-slate-650 text-slate-200 text-xs font-semibold py-2 rounded-lg transition-colors"
          >
            Edit API Key
          </button>
        </div>
      </div>
    );
  }

  // Dashboard View (Data available)
  if (view === 'dashboard' && analysis && productDetails) {
    const recStyle = getRecStyles(analysis.recommendation);

    return (
      <div className="w-[420px] max-h-[600px] bg-slate-950 flex flex-col select-none overflow-y-auto">
        {/* Header */}
        <header className="sticky top-0 z-10 px-4 py-3 bg-slate-950/90 backdrop-blur-md border-b border-slate-900 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping"></div>
            <h1 className="text-sm font-bold text-white font-outfit tracking-wide">REVIEW RADAR</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => triggerAnalysis(productDetails, true)}
              title="Force re-analyze"
              className="p-1.5 hover:bg-slate-900 rounded-md text-slate-400 hover:text-slate-200 transition-colors"
            >
              <RotateCw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowSettings(true)}
              title="Settings"
              className="p-1.5 hover:bg-slate-900 rounded-md text-slate-400 hover:text-slate-200 transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Content Container */}
        <main className="p-4 space-y-4">
          
          {/* Limited Review Warning Banner */}
          {productDetails.lowReviews && (
            <div className="flex items-start gap-2.5 bg-amber-950/40 border border-amber-500/20 text-amber-300 p-3 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                <span className="font-semibold block mb-0.5">Limited Reviews Scraped</span>
                Only {productDetails.reviews.length} reviews were found on the page. AI summarization metrics may be less representative.
              </div>
            </div>
          )}

          {/* Product Name Header */}
          <div className="space-y-1">
            <span className="text-[10px] text-slate-500 tracking-wider uppercase font-semibold">
              Scanned Item ({analysis.category})
            </span>
            <h2 className="text-sm font-bold text-slate-200 line-clamp-1 leading-snug font-outfit">
              {productDetails.name}
            </h2>
          </div>

          {/* HERO BUY RECOMMENDATION CARD */}
          <div className={`p-4 rounded-xl border ${recStyle.bg} space-y-3`}>
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                {recStyle.icon}
                <span className="text-sm font-bold tracking-tight text-white font-outfit">
                  {analysis.recommendation}
                </span>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-400">Trust Score</div>
                <div className="text-lg font-bold font-outfit text-white">
                  {analysis.trustScore}<span className="text-xs font-normal text-slate-400">/100</span>
                </div>
              </div>
            </div>

            {/* Confidence metric indicator */}
            <div className="flex items-center gap-1.5 border-t border-slate-700/20 pt-2 text-[10px] text-slate-400">
              <Award className="w-3.5 h-3.5 text-slate-400" />
              <span>
                Confidence: <strong className="text-slate-200">{analysis.confidenceScore}</strong> (Based on {analysis.reviewsCount} reviews)
              </span>
            </div>

            {/* Verdict Bullet */}
            <p className="text-[11px] leading-relaxed text-slate-300 pt-1 border-t border-slate-700/20">
              {analysis.reason}
            </p>
          </div>

          {/* ONE-LINE VERDICT CARD */}
          <div className="p-3 bg-slate-900 border border-slate-800/80 rounded-xl space-y-1.5">
            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block">
              Verdict Summary
            </span>
            <p className="text-xs font-medium text-slate-200 italic leading-relaxed">
              "{analysis.oneLineVerdict}"
            </p>
          </div>

          {/* CATEGORY & PRICE AWARENESS */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-900/60 border border-slate-850 p-2.5 rounded-lg">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-1">
                Product Category
              </span>
              <span className="font-semibold text-slate-200">{analysis.category}</span>
            </div>
            <div className="bg-slate-900/60 border border-slate-850 p-2.5 rounded-lg">
              <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider block mb-1">
                Value Assessment ({productDetails.price || 'NA'})
              </span>
              <span className="font-semibold text-slate-200 line-clamp-1">{analysis.priceAssessment}</span>
            </div>
          </div>

          {/* KEY DECISION DRIVERS (PM FEATURE) */}
          <div className="bg-slate-900/80 border border-slate-850 rounded-xl p-3.5 space-y-3">
            <h3 className="text-xs font-bold text-slate-300 font-outfit uppercase tracking-wider">
              Key Decision Drivers
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                  <ThumbsUp className="w-3 h-3" /> Users Love
                </span>
                <div className="flex flex-wrap gap-1">
                  {analysis.keyDecisionDrivers.love.map((drv, i) => (
                    <span key={i} className="text-[9px] px-2 py-0.5 bg-emerald-950/50 border border-emerald-500/20 text-emerald-300 rounded">
                      {drv}
                    </span>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-rose-400 flex items-center gap-1">
                  <ThumbsDown className="w-3 h-3" /> Users Dislike
                </span>
                <div className="flex flex-wrap gap-1">
                  {analysis.keyDecisionDrivers.dislike.map((drv, i) => (
                    <span key={i} className="text-[9px] px-2 py-0.5 bg-rose-950/50 border border-rose-500/20 text-rose-300 rounded">
                      {drv}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* SENTIMENT DISTRIBUTION CHART */}
          <div className="bg-slate-900/60 border border-slate-850 p-3 rounded-xl space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-300 font-outfit uppercase tracking-wider">
                Sentiment Split
              </span>
              <span className="text-[10px] text-slate-400">AI Verified Sentiment</span>
            </div>
            
            {/* Multi-segment progress bar */}
            <div className="w-full h-3.5 bg-slate-800 rounded-full flex overflow-hidden">
              <div 
                className="bg-emerald-500 h-full hover:opacity-90 transition-opacity" 
                style={{ width: `${analysis.positivePercent}%` }}
                title={`Positive: ${analysis.positivePercent}%`}
              />
              <div 
                className="bg-slate-500 h-full hover:opacity-90 transition-opacity" 
                style={{ width: `${analysis.neutralPercent}%` }}
                title={`Neutral: ${analysis.neutralPercent}%`}
              />
              <div 
                className="bg-rose-500 h-full hover:opacity-90 transition-opacity" 
                style={{ width: `${analysis.negativePercent}%` }}
                title={`Negative: ${analysis.negativePercent}%`}
              />
            </div>

            {/* Labels */}
            <div className="flex justify-between text-[10px] text-slate-400 pt-0.5">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                Pos: {analysis.positivePercent}%
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                Neu: {analysis.neutralPercent}%
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                Neg: {analysis.negativePercent}%
              </span>
            </div>
          </div>

          {/* COMMON COMPLAINTS (RESUME BOOSTER) */}
          {analysis.commonComplaints && analysis.commonComplaints.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-850 p-3 rounded-xl space-y-2.5">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-300 font-outfit uppercase tracking-wider">
                  Common Complaints
                </span>
                <span className="text-[10px] text-rose-400 font-semibold">% reviews reporting</span>
              </div>
              <div className="space-y-2">
                {analysis.commonComplaints.map((comp, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex justify-between text-[10px] text-slate-300">
                      <span>{idx + 1}. {comp.aspect}</span>
                      <span className="font-bold">{comp.percentage}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className="bg-rose-500/70 h-full rounded-full" 
                        style={{ width: `${comp.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TARGET AUDIENCE (WHO IS THIS FOR?) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900/60 border border-slate-850 p-3 rounded-xl space-y-2">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                Ideal For
              </span>
              <ul className="space-y-1 text-[10px] text-slate-300">
                {analysis.idealFor.map((item, i) => (
                  <li key={i} className="flex items-start gap-1 leading-snug">
                    <Check className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-slate-900/60 border border-slate-850 p-3 rounded-xl space-y-2">
              <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">
                Not Ideal For
              </span>
              <ul className="space-y-1 text-[10px] text-slate-300">
                {analysis.notIdealFor.map((item, i) => (
                  <li key={i} className="flex items-start gap-1 leading-snug">
                    <X className="w-3 h-3 text-rose-500 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* PROS & CONS */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-900/60 border border-slate-850 p-3 rounded-xl space-y-2">
              <span className="text-xs font-bold text-slate-300 font-outfit uppercase tracking-wider block">
                Pros
              </span>
              <ul className="space-y-1.5 text-[10px] text-slate-300">
                {analysis.pros.map((item, i) => (
                  <li key={i} className="flex items-start gap-1 leading-normal">
                    <span className="text-emerald-500 font-bold shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-slate-900/60 border border-slate-850 p-3 rounded-xl space-y-2">
              <span className="text-xs font-bold text-slate-300 font-outfit uppercase tracking-wider block">
                Cons
              </span>
              <ul className="space-y-1.5 text-[10px] text-slate-300">
                {analysis.cons.map((item, i) => (
                  <li key={i} className="flex items-start gap-1 leading-normal">
                    <span className="text-rose-400 font-bold shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* RED FLAGS ALERT CARD */}
          {analysis.redFlags && analysis.redFlags.length > 0 && (
            <div className="p-3 bg-rose-950/20 border border-rose-500/20 rounded-xl space-y-2">
              <div className="flex items-center gap-1.5 text-rose-400 font-bold text-[11px] uppercase tracking-wider font-outfit">
                <ShieldAlert className="w-4 h-4 animate-bounce" /> Warning: Critical Red Flags
              </div>
              <ul className="space-y-1 text-[10px] text-rose-300 pl-1">
                {analysis.redFlags.map((flag, idx) => (
                  <li key={idx} className="flex items-start gap-1 leading-relaxed">
                    <span className="text-rose-400">•</span>
                    <span>{flag}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

        </main>

        {/* Footer Cache Status */}
        <footer className="px-4 py-2.5 bg-slate-950 border-t border-slate-900 text-center text-[10px] text-slate-500 flex justify-between items-center">
          <span>Analyzed {getRelativeTime(analysis.analyzedAt)}</span>
          <span className="flex items-center gap-1">
            <Bookmark className="w-3 h-3 text-slate-500" /> Cache Active
          </span>
        </footer>
      </div>
    );
  }

  return null;
}
