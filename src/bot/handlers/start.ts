import type { BotContext } from '../../types';
import { countryLabel, categoryLabel } from '../../types';
import { getUser, updateUserPreferences, allowUser } from '../../services/db';
import { countryKeyboard, categoryKeyboard, mainMenu } from '../keyboards';
import { config } from '../../config';

// TODO: заменить реферальный доступ на подписку Telegram Stars

export async function handleStart(ctx: BotContext): Promise<void> {
  const payload = ctx.message && 'text' in ctx.message
    ? ctx.message.text.split(' ')[1]
    : undefined;

  // upsert user first so is_allowed field exists
  const user = await getUser(ctx.from!.id);
  const name = ctx.from?.first_name ?? 'друг';

  // Grant access via invite code
  if (payload === config.INVITE_CODE) {
    await allowUser(ctx.from!.id);
    if (user?.is_allowed) {
      await ctx.reply(`👋 С возвращением, *${name}*!\n\nВыбери действие в меню ниже.`, { parse_mode: 'Markdown', ...mainMenu });
      return;
    }
  }

  // Block if not allowed
  if (!user?.is_allowed && payload !== config.INVITE_CODE) {
    await ctx.reply('🔒 Бот в закрытом доступе.\n\nЕсли у вас есть инвайт-ссылка — перейдите по ней.');
    return;
  }

  if (user && user.country_codes.length > 0 && user.categories.length > 0) {
    await ctx.reply(
      `👋 С возвращением, *${name}*!\n\nВыбери действие в меню ниже.`,
      { parse_mode: 'Markdown', ...mainMenu }
    );
    return;
  }

  // New user onboarding
  ctx.session.mode = 'setup';
  ctx.session.tempCountries = [];
  ctx.session.tempCategories = [];

  await ctx.reply(
    `🌎 Привет, *${name}*\\! Я слежу за новостями Латинской Америки и пересказываю их по\\-русски с помощью ИИ\\.\n\nСначала настроим фильтры — это займёт минуту\\.`,
    { parse_mode: 'MarkdownV2' }
  );

  await ctx.reply(
    '🌍 *Шаг 1/2. Выберите страны* (можно несколько):',
    { parse_mode: 'Markdown', ...countryKeyboard([]) }
  );
}

// ─── Onboarding: toggle country ──────────────────────────────────────────────

export async function handleToggleCountry(ctx: BotContext): Promise<void> {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

  const code = ctx.callbackQuery.data.split(':')[1];
  if (!code) return;

  const selected = ctx.session.tempCountries;
  const idx = selected.indexOf(code);
  if (idx === -1) {
    selected.push(code);
  } else {
    selected.splice(idx, 1);
  }

  await ctx.editMessageReplyMarkup(countryKeyboard(selected).reply_markup);
  await ctx.answerCbQuery();
}

// ─── Onboarding: confirm countries ───────────────────────────────────────────

export async function handleConfirmCountries(ctx: BotContext): Promise<void> {
  if (!ctx.callbackQuery) return;

  if (ctx.session.tempCountries.length === 0) {
    await ctx.answerCbQuery('Выберите хотя бы одну страну', { show_alert: true });
    return;
  }

  await ctx.answerCbQuery();
  await ctx.editMessageText(
    '📂 *Шаг 2/2. Выберите категории новостей* (можно несколько):',
    { parse_mode: 'Markdown', ...categoryKeyboard([]) }
  );
}

// ─── Onboarding: toggle category ─────────────────────────────────────────────

export async function handleToggleCategory(ctx: BotContext): Promise<void> {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

  const key = ctx.callbackQuery.data.split(':')[1];
  if (!key) return;

  const selected = ctx.session.tempCategories;
  const idx = selected.indexOf(key);
  if (idx === -1) {
    selected.push(key);
  } else {
    selected.splice(idx, 1);
  }

  await ctx.editMessageReplyMarkup(categoryKeyboard(selected).reply_markup);
  await ctx.answerCbQuery();
}

// ─── Onboarding: confirm categories ──────────────────────────────────────────

export async function handleConfirmCategories(ctx: BotContext): Promise<void> {
  if (!ctx.callbackQuery) return;

  if (ctx.session.tempCategories.length === 0) {
    await ctx.answerCbQuery('Выберите хотя бы одну категорию', { show_alert: true });
    return;
  }

  await updateUserPreferences(ctx.from!.id, {
    country_codes: ctx.session.tempCountries,
    categories: ctx.session.tempCategories,
  });

  const countriesText = ctx.session.tempCountries.map(countryLabel).join(', ');
  const categoriesText = ctx.session.tempCategories.map(categoryLabel).join(', ');

  ctx.session.mode = undefined;

  await ctx.answerCbQuery('Настройки сохранены ✅');
  await ctx.editMessageText(
    `✅ *Готово\\!* Настройки сохранены\\.\n\n🌍 Страны: ${countriesText}\n📂 Категории: ${categoriesText}\n\nНажмите *📰 Новости*, чтобы получить первую подборку\\.`,
    { parse_mode: 'MarkdownV2' }
  );

  await ctx.reply('Главное меню:', mainMenu);
}
