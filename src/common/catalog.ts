export const CATEGORY_CATALOG: Record<string, string[]> = {
  'Social Media': ['facebook.com', 'instagram.com', 'tiktok.com', 'x.com', 'snapchat.com'],
  Streaming: ['youtube.com', 'twitch.tv', 'netflix.com', 'primevideo.com', 'disneyplus.com'],
  Gaming: ['roblox.com', 'epicgames.com', 'steampowered.com', 'steamcommunity.com', 'ea.com'],
  Shopping: ['amazon.com', 'ebay.com', 'walmart.com', 'flipkart.com', 'myntra.com']
};

export const CATEGORY_NAMES = Object.keys(CATEGORY_CATALOG);

export const WEEK_DAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 0, label: 'Sun' }
];
