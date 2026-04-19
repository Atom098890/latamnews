import { Telegraf, session } from 'telegraf';
import type { BotContext, SessionData } from '../types';
import { config } from '../config';

import { initSession, registerUser, rateLimiter, logger, filterMessages, checkAccess, onError } from './middleware';

import { handleStart, handleToggleCountry, handleToggleCategory, handleConfirmCountries, handleConfirmCategories } from './handlers/start';
import { handleNews, handleNewsNav } from './handlers/news';
import { handleSettings, handleSettingsEditCountries, handleSettingsEditCategories, handleConfirmCountriesEdit, handleConfirmCategoriesEdit } from './handlers/settings';
import { handleSubscribe, handleSubscribeTime, handleSubscribeDisable, setBotRef } from './handlers/subscribe';
import { handleHelp } from './handlers/help';

// toggle_country / toggle_category callbacks are shared between onboarding and settings.
// ctx.session.mode decides which confirm path runs.

export function createBot(): Telegraf<BotContext> {
  const bot = new Telegraf<BotContext>(config.BOT_TOKEN);

  setBotRef(bot);

  // ─── Middleware stack ───────────────────────────────────────────────────────
  bot.use(filterMessages);
  bot.use(checkAccess);
  bot.use(logger);
  bot.use(session<SessionData, BotContext>({ defaultSession: () => ({ tempCountries: [], tempCategories: [], newsArticleIds: [], newsIndex: 0 }) }));
  bot.use(initSession);
  bot.use(registerUser);
  bot.use(rateLimiter);

  // ─── Commands ───────────────────────────────────────────────────────────────
  bot.command('start', handleStart);
  bot.command('news', handleNews);
  bot.command('settings', handleSettings);
  bot.command('subscribe', handleSubscribe);
  bot.command('help', handleHelp);

  // ─── Main menu text buttons ─────────────────────────────────────────────────
  bot.hears('📰 Новости', handleNews);
  bot.hears('⚙️ Настройки', handleSettings);
  bot.hears('📅 Подписка', handleSubscribe);
  bot.hears('❓ Помощь', handleHelp);

  // ─── Callback: country/category toggles ────────────────────────────────────
  // Same callbacks used in both onboarding and settings; session.mode decides confirm target
  bot.action(/^toggle_country:(.+)$/, async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    await handleToggleCountry(ctx);
  });

  bot.action(/^toggle_category:(.+)$/, async (ctx) => {
    if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;
    await handleToggleCategory(ctx);
  });

  // ─── Callback: confirm selections (mode-aware) ──────────────────────────────
  bot.action('confirm_countries', async (ctx) => {
    const mode = ctx.session.mode;
    if (mode === 'edit_countries') {
      await handleConfirmCountriesEdit(ctx);
    } else {
      await handleConfirmCountries(ctx);
    }
  });

  bot.action('confirm_categories', async (ctx) => {
    const mode = ctx.session.mode;
    if (mode === 'edit_categories') {
      await handleConfirmCategoriesEdit(ctx);
    } else {
      await handleConfirmCategories(ctx);
    }
  });

  // ─── Callback: settings ─────────────────────────────────────────────────────
  bot.action('settings_edit_countries', handleSettingsEditCountries);
  bot.action('settings_edit_categories', handleSettingsEditCategories);

  // ─── Callback: news navigation ──────────────────────────────────────────────
  bot.action(/^news_nav:\d+$/, handleNewsNav);
  bot.action('noop', ctx => ctx.answerCbQuery());

  // ─── Callback: subscriptions ────────────────────────────────────────────────
  bot.action(/^subscribe_time:\d+:\d+$/, handleSubscribeTime);
  bot.action('subscribe_disable', handleSubscribeDisable);

  // ─── Error handler ──────────────────────────────────────────────────────────
  bot.catch(onError);

  return bot;
}
