import type { MiddlewareFn } from 'telegraf';
import type { BotContext } from '../types';
import { upsertUser } from '../services/db';
import { isDev } from '../config';

// ─── Session initializer ─────────────────────────────────────────────────────

export const initSession: MiddlewareFn<BotContext> = (ctx, next) => {
  ctx.session ??= { tempCountries: [], tempCategories: [], newsArticleIds: [], newsIndex: 0 };
  ctx.session.tempCountries ??= [];
  ctx.session.tempCategories ??= [];
  ctx.session.newsArticleIds ??= [];
  ctx.session.newsIndex ??= 0;
  return next();
};

// ─── Auto-register user ──────────────────────────────────────────────────────

export const registerUser: MiddlewareFn<BotContext> = async (ctx, next) => {
  if (!ctx.from) return next();

  try {
    await upsertUser({
      telegram_id: ctx.from.id,
      username: ctx.from.username,
      first_name: ctx.from.first_name,
    });
  } catch (err) {
    console.error('[middleware] Failed to register user:', err);
  }

  return next();
};

// ─── Per-user rate limiting ──────────────────────────────────────────────────

const requestMap = new Map<number, number[]>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;

export const rateLimiter: MiddlewareFn<BotContext> = (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  const now = Date.now();
  const timestamps = (requestMap.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS) {
    return ctx.reply('⏳ Слишком много запросов. Подождите немного.').then(() => undefined);
  }

  timestamps.push(now);
  requestMap.set(userId, timestamps);

  // Clean up old entries periodically
  if (requestMap.size > 10_000) {
    for (const [id, ts] of requestMap.entries()) {
      if (ts.every((t) => now - t >= WINDOW_MS)) requestMap.delete(id);
    }
  }

  return next();
};

// ─── Logger ──────────────────────────────────────────────────────────────────

export const logger: MiddlewareFn<BotContext> = (ctx, next) => {
  if (!isDev) return next();

  const user = ctx.from
    ? `@${ctx.from.username ?? ctx.from.id}`
    : 'unknown';
  const update = ctx.updateType;
  const text =
    ctx.message && 'text' in ctx.message
      ? ctx.message.text
      : ctx.callbackQuery && 'data' in ctx.callbackQuery
        ? ctx.callbackQuery.data
        : '';

  console.log(`[${new Date().toISOString()}] ${update} from ${user}: ${text}`);
  return next();
};

// ─── Global error handler ─────────────────────────────────────────────────────

export function onError(err: unknown, ctx: BotContext): void {
  const user = ctx.from?.id ?? 'unknown';
  console.error(`[error] User ${user}:`, err);

  ctx
    .reply('❌ Что-то пошло не так. Попробуйте ещё раз.')
    .catch(() => undefined);
}
