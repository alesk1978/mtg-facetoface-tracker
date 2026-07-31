import type { CardListing } from "./types";

const BASE_URL = "https://www.facetofacegames.com";
const USER_AGENT = "mtg-facetoface-tracker/0.2 (+web price watcher)";

function parsePrice(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  return Number(value);
}

function listingFromProduct(raw: Record<string, unknown>): CardListing | null {
  const vendor = String(raw.vendor ?? "");
  const productType = String(raw.type ?? raw.product_type ?? "");
  if (vendor !== "Magic" && productType !== "Singles") return null;

  const compareRaw = raw.compare_at_price_max ?? raw.compare_at_price_min;
  const compareAt =
    compareRaw !== null &&
    compareRaw !== undefined &&
    compareRaw !== "" &&
    compareRaw !== "0.00" &&
    compareRaw !== 0
      ? parsePrice(compareRaw as string | number)
      : null;

  const handle = String(raw.handle ?? "");
  const url = String(raw.url ?? `/products/${handle}`);

  return {
    shopifyId: Number(raw.id),
    title: String(raw.title ?? ""),
    handle,
    url,
    price: parsePrice((raw.price_min ?? raw.price) as string | number),
    compareAtPrice: compareAt,
    available: Boolean(raw.available ?? true),
    vendor,
    productType,
    productUrl: `${BASE_URL}${url.split("?")[0]}`,
  };
}

async function requestJson<T>(
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const query = params
    ? `?${new URLSearchParams(params).toString()}`
    : "";
  const url = `${BASE_URL}${path}${query}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    throw new Error(`Face to Face request failed (${response.status}): ${url}`);
  }

  return response.json() as Promise<T>;
}

export async function searchCards(
  query: string,
  limit = 20,
): Promise<CardListing[]> {
  const payload = await requestJson<{
    resources?: {
      results?: {
        products?: Record<string, unknown>[];
      };
    };
  }>("/search/suggest.json", {
    q: query,
    "resources[type]": "product",
    "resources[limit]": String(limit),
  });

  const products = payload.resources?.results?.products ?? [];
  return products
    .map((raw) => listingFromProduct(raw))
    .filter((item): item is CardListing => item !== null);
}

export async function fetchByHandle(handle: string): Promise<CardListing> {
  const payload = await requestJson<{ product?: Record<string, unknown> }>(
    `/products/${handle}.json`,
  );
  const product = payload.product;
  if (!product) {
    throw new Error(`Product not found: ${handle}`);
  }

  const variant = (product.variants as Record<string, unknown>[] | undefined)?.[0] ?? {};
  const compareAtRaw = variant.compare_at_price;
  const compareAt =
    compareAtRaw !== null &&
    compareAtRaw !== undefined &&
    compareAtRaw !== "" &&
    compareAtRaw !== "0.00"
      ? parsePrice(compareAtRaw as string | number)
      : null;

  const resolvedHandle = String(product.handle ?? handle);

  return {
    shopifyId: Number(product.id),
    title: String(product.title ?? ""),
    handle: resolvedHandle,
    url: `/products/${resolvedHandle}`,
    price: parsePrice(variant.price as string | number),
    compareAtPrice: compareAt,
    available: Boolean(variant.available ?? true),
    vendor: String(product.vendor ?? ""),
    productType: String(product.product_type ?? ""),
    productUrl: `${BASE_URL}/products/${resolvedHandle}`,
  };
}
