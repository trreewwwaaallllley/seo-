import { XMLParser } from 'fast-xml-parser';

export interface DiscoveredSitemapUrl {
  url: string;
  title: string;
  pageType: 'product' | 'category' | 'guide' | 'brand' | 'blog';
  category: string;
  keywords: string[];
}

const parser = new XMLParser({ ignoreAttributes: false });

function inferUrlMetadata(rawUrl: string): DiscoveredSitemapUrl {
  let pathname = '/';
  try {
    pathname = new URL(rawUrl).pathname;
  } catch {
    pathname = rawUrl;
  }
  const lower = pathname.toLowerCase();
  const segments = pathname.split('/').filter(Boolean);
  const lastSlug = segments[segments.length - 1] || 'treewalley-home';
  const cleanTitle = lastSlug
    .replace(/\.(html|php|aspx)$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  let pageType: DiscoveredSitemapUrl['pageType'] = 'category';
  if (lower.includes('/product') || lower.includes('/products/') || lower.includes('/p/')) {
    pageType = 'product';
  } else if (lower.includes('/blog') || lower.includes('/journal') || lower.includes('/article')) {
    pageType = 'blog';
  } else if (lower.includes('/guide') || lower.includes('/care')) {
    pageType = 'guide';
  } else if (segments.length === 0 || lower.includes('about') || lower.includes('story')) {
    pageType = 'brand';
  }

  let category = 'Solid wood furniture';
  if (lower.includes('king')) category = 'King size beds';
  else if (lower.includes('queen')) category = 'Queen size beds';
  else if (lower.includes('bed') || lower.includes('palang')) category = 'Wooden beds';
  else if (lower.includes('wardrobe') || lower.includes('almari') || lower.includes('almirah'))
    category = 'Wooden wardrobes';
  else if (lower.includes('coffee') || lower.includes('center-table')) category = 'Coffee tables';
  else if (lower.includes('cabinet') || lower.includes('sideboard')) category = 'Cabinets';
  else if (lower.includes('dining')) category = 'Dining tables';
  else if (lower.includes('tv')) category = 'TV units';
  else if (lower.includes('sofa')) category = 'Sofas';

  const keywords = lastSlug
    .replace(/[-_]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 2);

  return {
    url: rawUrl,
    title: cleanTitle || 'TreeWalley Furniture Page',
    pageType,
    category,
    keywords,
  };
}

export async function crawlXmlSitemap(sitemapUrl: string, maxUrls = 150): Promise<DiscoveredSitemapUrl[]> {
  const discovered: string[] = [];
  const visitedSitemaps = new Set<string>();

  async function fetchSitemap(url: string, depth: number) {
    if (depth > 2 || visitedSitemaps.has(url) || discovered.length >= maxUrls) return;
    visitedSitemaps.add(url);

    const res = await fetch(url, {
      headers: { 'User-Agent': 'TreeWalleySEOCommandCenter/1.0' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch sitemap ${url} (HTTP ${res.status})`);
    }
    const xml = await res.text();
    const parsed = parser.parse(xml);

    if (parsed?.sitemapindex?.sitemap) {
      const childList = Array.isArray(parsed.sitemapindex.sitemap)
        ? parsed.sitemapindex.sitemap
        : [parsed.sitemapindex.sitemap];
      for (const item of childList.slice(0, 8)) {
        if (item?.loc && discovered.length < maxUrls) {
          await fetchSitemap(String(item.loc), depth + 1);
        }
      }
    }

    if (parsed?.urlset?.url) {
      const urlList = Array.isArray(parsed.urlset.url)
        ? parsed.urlset.url
        : [parsed.urlset.url];
      for (const entry of urlList) {
        if (entry?.loc && discovered.length < maxUrls) {
          discovered.push(String(entry.loc).trim());
        }
      }
    }
  }

  await fetchSitemap(sitemapUrl, 0);
  return Array.from(new Set(discovered)).map(inferUrlMetadata);
}

export async function verifyHttpUrl(url: string): Promise<number> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(7000),
      headers: { 'User-Agent': 'TreeWalleyLinkVerifier/1.0' },
    });
    if (res.status === 405) {
      const getRes = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: AbortSignal.timeout(7000),
      });
      return getRes.status;
    }
    return res.status;
  } catch {
    return 0;
  }
}
