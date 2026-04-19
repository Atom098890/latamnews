import Parser from 'rss-parser';
import type { RawNewsArticle } from '../types';

const parser = new Parser({
  timeout: 15_000,
  headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LatamNewsBot/1.0)' },
});

// Category-specific RSS feeds; _default used when category has no dedicated feed
const RSS_FEEDS: Record<string, Record<string, string | string[]>> = {
  uy: {
    _default: 'https://www.elpais.com.uy/rss/',
    politics: 'https://www.elpais.com.uy/rss/temas/politica/',
    economics: 'https://www.elpais.com.uy/rss/temas/economia/',
    sports: 'https://www.elpais.com.uy/rss/temas/deportes/',
    technology: 'https://www.elpais.com.uy/rss/temas/tecnologia/',
    entertainment: 'https://www.elpais.com.uy/rss/temas/cultura/',
    environment: 'https://www.elpais.com.uy/rss/',
  },
  ar: {
    _default: 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml',
    politics: 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/category/politica/?outputType=xml',
    economics: 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/category/economia/?outputType=xml',
    sports: 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/category/deportes/?outputType=xml',
    technology: 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/category/tecnologia/?outputType=xml',
    entertainment: 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/category/espectaculos/?outputType=xml',
    environment: 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml',
  },
  br: {
    _default: 'https://feeds.folha.uol.com.br/folha/brasil/rss091.xml',
    politics: 'https://feeds.folha.uol.com.br/folha/poder/rss091.xml',
    economics: 'https://feeds.folha.uol.com.br/folha/mercado/rss091.xml',
    sports: 'https://feeds.folha.uol.com.br/folha/esporte/rss091.xml',
    technology: 'https://feeds.folha.uol.com.br/folha/tec/rss091.xml',
    entertainment: 'https://feeds.folha.uol.com.br/folha/ilustrada/rss091.xml',
    environment: 'https://feeds.folha.uol.com.br/folha/ambiente/rss091.xml',
  },
};

function urlToId(url: string): number {
  let hash = 2166136261;
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash | 0; // signed 32-bit for PostgreSQL INTEGER
}

function getFeedUrl(country: string, category: string): string | null {
  const feeds = RSS_FEEDS[country];
  if (!feeds) return null;
  const url = feeds[category] ?? feeds['_default'];
  if (Array.isArray(url)) return url[0] ?? null;
  return url ?? null;
}

async function fetchFeed(country: string, category: string, limit: number): Promise<RawNewsArticle[]> {
  const feedUrl = getFeedUrl(country, category);
  if (!feedUrl) return [];

  try {
    const feed = await parser.parseURL(feedUrl);
    return feed.items.slice(0, limit).map(item => {
      const url = item.link ?? item.guid ?? '';
      return {
        id: urlToId(url),
        title: item.title ?? '',
        text: item.content ?? item.contentSnippet ?? item.summary ?? '',
        summary: item.contentSnippet ?? item.summary ?? '',
        url,
        image: item.enclosure?.url,
        'publish-date': item.isoDate ?? item.pubDate,
        language: country === 'br' ? 'pt' : 'es',
        'source-country': country,
        category,
      };
    }).filter(a => a.url);
  } catch (err) {
    console.error(`[news] RSS fetch failed for ${country}/${category}:`, err instanceof Error ? err.message : err);
    return [];
  }
}

export async function fetchNews(params: {
  countries: string[];
  categories: string[];
  limit?: number;
}): Promise<{ articles: RawNewsArticle[] }> {
  const { countries, categories, limit = 5 } = params;

  const category = categories[0] ?? 'politics';
  const perCountry = Math.max(3, Math.ceil(limit / countries.length));

  const results = await Promise.allSettled(
    countries.map(country => fetchFeed(country, category, perCountry))
  );

  const articles: RawNewsArticle[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      articles.push(...result.value);
    }
  }

  const seen = new Set<string>();
  const unique = articles.filter(a => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });

  return { articles: unique.slice(0, limit) };
}
