import axios from 'axios';
import { config } from '../config';
import type { RawNewsArticle } from '../types';

const BASE_URL = 'https://newsdata.io/api/1/latest';
const REQUEST_TIMEOUT_MS = 15_000;

const CATEGORY_MAP: Record<string, string> = {
  politics: 'politics',
  economics: 'business',
  sports: 'sports',
  technology: 'technology',
  entertainment: 'entertainment',
  environment: 'environment',
};

interface NewsDataArticle {
  article_id: string;
  title: string;
  link: string;
  description: string | null;
  content: string | null;
  pubDate: string | null;
  image_url: string | null;
  country: string[];
  category: string[];
  language: string;
}

interface NewsDataResponse {
  status: string;
  totalResults: number;
  results: NewsDataArticle[];
}

function urlToId(url: string): number {
  let hash = 2166136261;
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash | 0; // signed 32-bit for PostgreSQL INTEGER
}

async function fetchForCountry(country: string, category: string, size: number): Promise<RawNewsArticle[]> {
  try {
    const { data } = await axios.get<NewsDataResponse>(BASE_URL, {
      params: {
        apikey: config.NEWSDATA_API_KEY,
        country,
        category: CATEGORY_MAP[category] ?? 'politics',
        language: country === 'br' ? 'pt' : 'es',
        size,
      },
      timeout: REQUEST_TIMEOUT_MS,
    });

    return data.results
      .filter((a: NewsDataArticle) => a.link)
      .map((a: NewsDataArticle) => ({
        id: urlToId(a.link),
        title: a.title,
        text: a.content ?? a.description ?? '',
        summary: a.description ?? '',
        url: a.link,
        image: a.image_url ?? undefined,
        'publish-date': a.pubDate ?? undefined,
        language: a.language,
        'source-country': country,
        category,
      }));
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error(`[news] NewsData fetch failed for ${country}/${category}: ${err.response?.status} ${JSON.stringify(err.response?.data)}`);
    } else {
      console.error(`[news] NewsData fetch failed for ${country}/${category}:`, err instanceof Error ? err.message : err);
    }
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
    countries.map(country => fetchForCountry(country, category, perCountry))
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
