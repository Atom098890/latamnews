import type { Context } from 'telegraf';

// ─── Domain types ────────────────────────────────────────────────────────────

export interface DbUser {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  country_codes: string[];
  categories: string[];
  is_active: boolean;
  is_allowed: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbArticle {
  id: number;
  world_news_id: number;
  adapted_title: string;
  adapted_summary: string;
  adapted_body: string;
  country_code: string;
  category: string;
  source_url: string;
  image_url: string | null;
  published_at: string | null;
  created_at: string;
}

export interface DbSubscription {
  id: number;
  telegram_id: number;
  hour: number;
  minute: number;
  is_active: boolean;
  created_at: string;
}

// ─── World News API ──────────────────────────────────────────────────────────

export interface RawNewsArticle {
  id: number;
  title: string;
  text: string;
  summary?: string;
  url: string;
  image?: string;
  'publish-date'?: string;
  language: string;
  'source-country'?: string;
  category?: string;
}

export interface NewsApiResponse {
  offset: number;
  number: number;
  available: number;
  news: RawNewsArticle[];
}

// ─── AI ──────────────────────────────────────────────────────────────────────

export interface AdaptedArticle {
  title: string;
  summary: string;
  body: string;
}

// ─── Bot session ─────────────────────────────────────────────────────────────

export interface SessionData {
  mode?: 'setup' | 'edit_countries' | 'edit_categories';
  tempCountries: string[];
  tempCategories: string[];
  newsArticleIds: number[];
  newsIndex: number;
}

export interface BotContext extends Context {
  session: SessionData;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const COUNTRIES: Record<string, { name: string; flag: string }> = {
  mx: { name: 'Мексика', flag: '🇲🇽' },
  ar: { name: 'Аргентина', flag: '🇦🇷' },
  br: { name: 'Бразилия', flag: '🇧🇷' },
  cl: { name: 'Чили', flag: '🇨🇱' },
  co: { name: 'Колумбия', flag: '🇨🇴' },
  pe: { name: 'Перу', flag: '🇵🇪' },
  ve: { name: 'Венесуэла', flag: '🇻🇪' },
  ec: { name: 'Эквадор', flag: '🇪🇨' },
  uy: { name: 'Уругвай', flag: '🇺🇾' },
  bo: { name: 'Боливия', flag: '🇧🇴' },
};

export const CATEGORIES: Record<string, { name: string; icon: string }> = {
  politics: { name: 'Политика', icon: '🏛' },
  economics: { name: 'Экономика', icon: '💰' },
  sports: { name: 'Спорт', icon: '⚽' },
  technology: { name: 'Технологии', icon: '💻' },
  entertainment: { name: 'Культура', icon: '🎭' },
  environment: { name: 'Экология', icon: '🌿' },
};

export const PRESET_TIMES = [
  { label: '02:00', hour: 2, minute: 0 },
  { label: '06:00', hour: 6, minute: 0 },
  { label: '08:00', hour: 8, minute: 0 },
  { label: '10:00', hour: 10, minute: 0 },
  { label: '12:00', hour: 12, minute: 0 },
  { label: '18:00', hour: 18, minute: 0 },
  { label: '20:00', hour: 20, minute: 0 },
  { label: '22:00', hour: 22, minute: 0 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function countryLabel(code: string): string {
  const c = COUNTRIES[code];
  return c ? `${c.flag} ${c.name}` : code;
}

export function categoryLabel(key: string): string {
  const c = CATEGORIES[key];
  return c ? `${c.icon} ${c.name}` : key;
}
