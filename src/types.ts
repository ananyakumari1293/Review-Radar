export interface ProductDetails {
  name: string;
  rating: string;
  price?: string;
  category?: string;
  url: string;
  imageUrl: string;
  reviews: string[];
  lowReviews: boolean;
}

export interface CommonComplaint {
  aspect: string;
  percentage: number;
}

export interface AnalysisResult {
  trustScore: number;
  positivePercent: number;
  neutralPercent: number;
  negativePercent: number;
  pros: string[];
  cons: string[];
  redFlags: string[];
  recommendation: "Recommended" | "Consider Carefully" | "Not Recommended";
  reason: string;
  confidenceScore: "High" | "Medium" | "Low";
  keyDecisionDrivers: {
    love: string[];
    dislike: string[];
  };
  commonComplaints: CommonComplaint[];
  idealFor: string[];
  notIdealFor: string[];
  oneLineVerdict: string;
  category: string;
  priceAssessment: string;
  analyzedAt: string; // ISO date string
  reviewsCount: number;
}

export interface ExtensionSettings {
  apiKey: string;
  geminiModel: string;
}

export interface CacheEntry {
  key: string;
  data: AnalysisResult;
  timestamp: string;
}
