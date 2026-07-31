export interface CardListing {
  shopifyId: number;
  title: string;
  handle: string;
  url: string;
  price: number;
  compareAtPrice: number | null;
  available: boolean;
  vendor: string;
  productType: string;
  productUrl: string;
}

export interface WatchedProduct {
  shopifyId: number;
  title: string;
  handle: string;
  url: string;
  addedAt: string;
}

export interface PriceSnapshot {
  shopifyId: number;
  title: string;
  price: number;
  compareAtPrice: number | null;
  available: boolean;
  checkedAt: string;
}

export interface PriceChange {
  shopifyId: number;
  title: string;
  previousPrice: number;
  currentPrice: number;
  delta: number;
  deltaPct: number;
  previousCheckedAt: string;
  currentCheckedAt: string;
}
