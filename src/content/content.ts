import { ProductDetails } from '../types';
import { MAX_REVIEWS_TO_ANALYZE, MIN_REVIEWS_FOR_ACCURACY } from '../config';

// Scrape helper: clean text
const cleanText = (text: string | null | undefined): string => {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
};

// Extract Amazon Product Details
function scrapeAmazon(): ProductDetails {
  // Title
  const titleEl = document.querySelector('#productTitle');
  const name = cleanText(titleEl?.textContent) || document.title;

  // Rating
  const ratingEl = document.querySelector('#acrPopover span.a-icon-alt') || 
                   document.querySelector('span[data-hook="rating-out-of-text"]') ||
                   document.querySelector('.a-icon-star');
  const rating = cleanText(ratingEl?.textContent) || 'No ratings';

  // Price
  const priceEl = document.querySelector('span.a-price span.a-offscreen') || 
                  document.querySelector('span.a-price-whole') ||
                  document.querySelector('#priceblock_ourprice') ||
                  document.querySelector('#priceblock_dealprice');
  const price = cleanText(priceEl?.textContent) || 'Price unavailable';

  // Image
  const imgEl = document.querySelector('#landingImage') || 
                document.querySelector('#imgBlkFront') ||
                document.querySelector('img#main-image') ||
                document.querySelector('.a-dynamic-image');
  const imageUrl = imgEl?.getAttribute('src') || '';

  // Reviews
  const reviewElements = document.querySelectorAll('span[data-hook="review-body"], .review-text-content, .review-text');
  const reviews: string[] = [];
  
  reviewElements.forEach((el) => {
    const text = cleanText(el.textContent);
    // Filter out short reviews or empty texts
    if (text.length > 15 && !reviews.includes(text)) {
      reviews.push(text);
    }
  });

  // Fallback reviews scraping (look for paragraphs or divs with class matching 'review' or 'comment')
  if (reviews.length === 0) {
    const allDivs = document.querySelectorAll('div, span, p');
    allDivs.forEach((el) => {
      const className = el.className;
      if (typeof className === 'string' && (className.includes('review-text') || className.includes('review-body'))) {
        const text = cleanText(el.textContent);
        if (text.length > 20 && !reviews.includes(text)) {
          reviews.push(text);
        }
      }
    });
  }

  // Enforce Max review limit
  const finalReviews = reviews.slice(0, MAX_REVIEWS_TO_ANALYZE);

  return {
    name,
    rating,
    price,
    url: window.location.href,
    imageUrl,
    reviews: finalReviews,
    lowReviews: finalReviews.length < MIN_REVIEWS_FOR_ACCURACY
  };
}

// Extract Flipkart Product Details
function scrapeFlipkart(): ProductDetails {
  // Title
  const titleEl = document.querySelector('span.B_NuCI') || 
                   document.querySelector('.VU-ZEg') || 
                   document.querySelector('h1');
  const name = cleanText(titleEl?.textContent) || document.title;

  // Rating
  const ratingEl = document.querySelector('.XQDdHH') || 
                   document.querySelector('div._3LWZlK') || 
                   document.querySelector('div.ipCwK');
  const ratingVal = cleanText(ratingEl?.textContent);
  const rating = ratingVal ? `${ratingVal} out of 5 stars` : 'No ratings';

  // Price
  const priceEl = document.querySelector('.Nx9nXM') || 
                  document.querySelector('div._30jeq3') || 
                  document.querySelector('div._16JkVK');
  const price = cleanText(priceEl?.textContent) || 'Price unavailable';

  // Image
  const imgEl = document.querySelector('img._396cs4') || 
                document.querySelector('img._2r_T1I') || 
                document.querySelector('img.DByoEF') || 
                document.querySelector('img._1stVak') ||
                document.querySelector('.yAL3q_ img');
  const imageUrl = imgEl?.getAttribute('src') || '';

  // Reviews
  const reviewElements = document.querySelectorAll('div.t-yD1y, div.ZmyZ1b, div._2-N1ha, .ZmyZ1b');
  const reviews: string[] = [];

  reviewElements.forEach((el) => {
    // Flipkart review elements sometimes contain nested spans or comments. Get child div if it's there, or full content
    const text = cleanText(el.textContent);
    if (text.length > 15 && !reviews.includes(text)) {
      reviews.push(text);
    }
  });

  // Fallback for Flipkart reviews - search for containers containing comments
  if (reviews.length === 0) {
    const allDivs = document.querySelectorAll('div');
    allDivs.forEach((div) => {
      const text = cleanText(div.textContent);
      // Commonly flipkart reviews are paragraphs of length 30-300 in specific card grids
      if (div.classList.contains('t-yD1y') || div.classList.contains('ZmyZ1b')) {
        if (text.length > 15 && !reviews.includes(text)) {
          reviews.push(text);
        }
      }
    });
  }

  // Enforce Max review limit
  const finalReviews = reviews.slice(0, MAX_REVIEWS_TO_ANALYZE);

  return {
    name,
    rating,
    price,
    url: window.location.href,
    imageUrl,
    reviews: finalReviews,
    lowReviews: finalReviews.length < MIN_REVIEWS_FOR_ACCURACY
  };
}

// Scrape entry point
function extractProductDetails(): ProductDetails | null {
  const hostname = window.location.hostname;
  
  if (hostname.includes('amazon.')) {
    return scrapeAmazon();
  } else if (hostname.includes('flipkart.')) {
    return scrapeFlipkart();
  }
  
  // Generic fallback if user opened pop-up on another store
  return null;
}

// Message Listener
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'GET_PRODUCT_DETAILS') {
    try {
      const details = extractProductDetails();
      sendResponse({ success: true, details });
    } catch (error) {
      console.error('Scraping error:', error);
      sendResponse({ success: false, error: (error as Error).message });
    }
  }
  return true; // Keep message channel open for async response
});
