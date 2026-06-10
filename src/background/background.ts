import { ProductDetails, AnalysisResult, ExtensionSettings } from '../types';
import { GEMINI_ENDPOINT, GEMINI_API_VERSION, GEMINI_MODEL } from '../config';

// Generate a robust cache key based on URL, review count, and a snippet of the first review
function generateCacheKey(details: ProductDetails): string {
  const url = details.url.split('?')[0]; // Clean query parameters
  const count = details.reviews.length;
  const snippet = details.reviews[0] ? details.reviews[0].slice(0, 40) : '';
  return `rr_cache_${encodeURIComponent(url)}_${count}_${encodeURIComponent(snippet)}`;
}

// Clean raw Gemini text responses from markdown fences or extra whitespace
function sanitizeJsonResponse(text: string): string {
  let cleaned = text.trim();
  // Strip opening markdown code block indicator
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring(3);
  }
  // Strip closing markdown code block indicator
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

// Perform Gemini API analysis
async function analyzeWithGemini(details: ProductDetails, apiKey: string): Promise<AnalysisResult> {
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
    throw new Error(`Gemini API error (${response.status}): ${errText || response.statusText}`);
  }

  const resultData = await response.json();
  const rawText = resultData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error("Empty response returned from Gemini API.");
  }

  const sanitizedText = sanitizeJsonResponse(rawText);
  const parsed: AnalysisResult = JSON.parse(sanitizedText);
  
  // Basic validation of fields
  if (typeof parsed.trustScore !== 'number' || !parsed.recommendation || !parsed.reason) {
    throw new Error("API response is missing required analysis fields.");
  }

  // Inject metadata
  parsed.analyzedAt = new Date().toISOString();
  parsed.reviewsCount = details.reviews.length;

  return parsed;
}

// Background analysis coordinator with a retry attempt
async function handleAnalysisRequest(details: ProductDetails, forceFresh: boolean): Promise<AnalysisResult> {
  if (!details.reviews || details.reviews.length === 0) {
    throw new Error("No reviews found on the page. Review Radar requires at least one review to analyze.");
  }

  // Calculate Cache Key
  const cacheKey = generateCacheKey(details);

  // Check storage if not forcing refresh
  if (!forceFresh) {
    const cached = await chrome.storage.local.get(cacheKey);
    if (cached[cacheKey]) {
      console.log("Review Radar: Cache Hit for key", cacheKey);
      return cached[cacheKey] as AnalysisResult;
    }
  }

  // Fetch API Key from Settings
  const settingsData = await chrome.storage.local.get('settings');
  const apiKey = (settingsData.settings as ExtensionSettings)?.apiKey;
  if (!apiKey) {
    throw new Error("API_KEY_MISSING");
  }

  // Perform Analysis with retry
  try {
    const result = await analyzeWithGemini(details, apiKey);
    
    // Save to Cache
    await chrome.storage.local.set({ [cacheKey]: result });
    
    return result;
  } catch (error) {
    console.warn("First analysis attempt failed. Retrying...", error);
    try {
      // Single attempt retry
      const result = await analyzeWithGemini(details, apiKey);
      await chrome.storage.local.set({ [cacheKey]: result });
      return result;
    } catch (retryError) {
      console.error("Analysis failed after retry:", retryError);
      throw retryError;
    }
  }
}

// Listener for runtime messages
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'ANALYZE_PRODUCT') {
    handleAnalysisRequest(message.details, message.forceFresh || false)
      .then((result) => {
        sendResponse({ success: true, result });
      })
      .catch((error: Error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep message channel open for async response
  }
  return false;
});
