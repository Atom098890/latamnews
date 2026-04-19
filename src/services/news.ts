import axios, { AxiosError } from 'axios';
import { config } from '../config';
import type { RawNewsArticle } from '../types';

const BASE_URL = 'https://gnews.io/api/v4';
const REQUEST_TIMEOUT_MS = 15_000;

const CATEGORY_TO_TOPIC: Record<string, string> = {
  politics: 'nation',
  economics: 'business',
  sports: 'sports',
  technology: 'technology',
  entertainment: 'entertainment',
  environment: 'science',
};

interface GNewsArticle {
  title: string;
  description: string;
  content: string;
  url: string;
  image: string | null;
  publishedAt: string;
  source: { name: string; url: string };
}

interface GNewsResponse {
  totalArticles: number;
  articles: GNewsArticle[];
}

function urlToId(url: string): number {
  let hash = 2166136261;
  for (let i = 0; i < url.length; i++) {
    hash ^= url.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash | 0; // fit into signed 32-bit (PostgreSQL INTEGER range)
}

function normalize(article: GNewsArticle, country: string, category: string): RawNewsArticle {
  return {
    id: urlToId(article.url),
    title: article.title,
    text: article.content,
    summary: article.description,
    url: article.url,
    image: article.image ?? undefined,
    'publish-date': article.publishedAt,
    language: country === 'br' ? 'pt' : 'es',
    'source-country': country,
    category,
  };
}

export async function fetchNews(params: {
  countries: string[];
  categories: string[];
  offset?: number;
  limit?: number;
}): Promise<{ articles: RawNewsArticle[]; total: number }> {
  const { countries, categories, offset = 0, limit = 5 } = params;

  const topic = CATEGORY_TO_TOPIC[categories[0] ?? ''] ?? 'world';
  const category = categories[0] ?? 'politics';
  const page = Math.floor(offset / limit) + 1;
  const perCountry = Math.max(2, Math.ceil(limit / countries.length));

  const requests = countries.map(country =>
    axios.get<GNewsResponse>(`${BASE_URL}/top-headlines`, {
      params: {
        token: config.GNEWS_API_KEY,
        lang: country === 'br' ? 'pt' : 'es',
        country,
        topic,
        max: perCountry,
        page,
      },
      timeout: REQUEST_TIMEOUT_MS,
    })
  );

  try {
    const results = await Promise.allSettled(requests);

    const articles: RawNewsArticle[] = [];
    let total = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      if (result.status === 'fulfilled') {
        const data = result.value.data;
        articles.push(...data.articles.map(a => normalize(a, countries[i]!, category)));
        total += data.totalArticles;
      } else {
        const err = result.reason as AxiosError;
        console.error(`[news] ${countries[i]} failed ${err.response?.status}:`, err.response?.data ?? err.message);
      }
    }

    const seen = new Set<string>();
    const unique = articles.filter(a => {
      if (seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    });

    return { articles: unique.slice(0, limit), total };
  } catch (err) {
    if (err instanceof AxiosError) {
      const status = err.response?.status;
      if (status === 401 || status === 403) throw new Error('Неверный API ключ GNews');
      if (status === 429) throw new Error('Превышен лимит запросов к новостному API. Попробуйте позже.');
      if (err.code === 'ECONNABORTED') throw new Error('Новостной сервис не отвечает. Попробуйте позже.');
    }
    throw new Error('Не удалось загрузить новости. Попробуйте позже.');
  }
}
