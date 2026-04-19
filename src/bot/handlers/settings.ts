import type { BotContext } from '../../types';
import { countryLabel, categoryLabel } from '../../types';
import { getUser, updateUserPreferences } from '../../services/db';
import { countryKeyboard, categoryKeyboard, settingsKeyboard } from '../keyboards';

async function showSettings(ctx: BotContext, editMessage = false): Promise<void> {
  const user = await getUser(ctx.from!.id);

  const countriesText =
    user && user.country_codes.length > 0
      ? user.country_codes.map(countryLabel).join(', ')
      : '_не выбраны_';

  const categoriesText =
    user && user.categories.length > 0
      ? user.categories.map(categoryLabel).join(', ')
      : '_не выбраны_';

  const text = [
    '⚙️ *Настройки*',
    '',
    `🌍 Страны: ${countriesText}`,
    `📂 Категории: ${categoriesText}`,
    '',
    'Выберите что изменить:',
  ].join('\n');

  const keyboard = settingsKeyboard(user?.country_codes ?? [], user?.categories ?? []);

  if (editMessage && ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
  }
}

export async function handleSettings(ctx: BotContext): Promise<void> {
  await showSettings(ctx);
}

// ─── Edit countries ───────────────────────────────────────────────────────────

export async function handleSettingsEditCountries(ctx: BotContext): Promise<void> {
  if (!ctx.callbackQuery) return;

  const user = await getUser(ctx.from!.id);
  ctx.session.mode = 'edit_countries';
  ctx.session.tempCountries = [...(user?.country_codes ?? [])];

  await ctx.answerCbQuery();
  await ctx.editMessageText('🌍 *Выберите страны:*', {
    parse_mode: 'Markdown',
    ...countryKeyboard(ctx.session.tempCountries),
  });
}

// ─── Edit categories ──────────────────────────────────────────────────────────

export async function handleSettingsEditCategories(ctx: BotContext): Promise<void> {
  if (!ctx.callbackQuery) return;

  const user = await getUser(ctx.from!.id);
  ctx.session.mode = 'edit_categories';
  ctx.session.tempCategories = [...(user?.categories ?? [])];

  await ctx.answerCbQuery();
  await ctx.editMessageText('📂 *Выберите категории:*', {
    parse_mode: 'Markdown',
    ...categoryKeyboard(ctx.session.tempCategories),
  });
}

// ─── Confirm country edit ─────────────────────────────────────────────────────

export async function handleConfirmCountriesEdit(ctx: BotContext): Promise<void> {
  if (!ctx.callbackQuery) return;

  if (ctx.session.tempCountries.length === 0) {
    await ctx.answerCbQuery('Выберите хотя бы одну страну', { show_alert: true });
    return;
  }

  await updateUserPreferences(ctx.from!.id, {
    country_codes: ctx.session.tempCountries,
  });

  ctx.session.mode = undefined;
  await ctx.answerCbQuery('Страны сохранены ✅');
  await showSettings(ctx, true);
}

// ─── Confirm category edit ────────────────────────────────────────────────────

export async function handleConfirmCategoriesEdit(ctx: BotContext): Promise<void> {
  if (!ctx.callbackQuery) return;

  if (ctx.session.tempCategories.length === 0) {
    await ctx.answerCbQuery('Выберите хотя бы одну категорию', { show_alert: true });
    return;
  }

  await updateUserPreferences(ctx.from!.id, {
    categories: ctx.session.tempCategories,
  });

  ctx.session.mode = undefined;
  await ctx.answerCbQuery('Категории сохранены ✅');
  await showSettings(ctx, true);
}
