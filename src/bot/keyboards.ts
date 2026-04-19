import { Markup } from 'telegraf';
import { COUNTRIES, CATEGORIES, PRESET_TIMES } from '../types';

// ─── Main persistent keyboard ────────────────────────────────────────────────

export const mainMenu = Markup.keyboard([
  ['📰 Новости', '⚙️ Настройки'],
  ['📅 Подписка', '❓ Помощь'],
])
  .resize()
  .persistent();

// ─── Country multi-select ────────────────────────────────────────────────────

export function countryKeyboard(selected: string[]) {
  const buttons = Object.entries(COUNTRIES).map(([code, { name, flag }]) => {
    const isSelected = selected.includes(code);
    const label = isSelected ? `✅ ${flag} ${name}` : `${flag} ${name}`;
    return Markup.button.callback(label, `toggle_country:${code}`);
  });

  // Two columns
  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }

  const confirmLabel =
    selected.length > 0 ? `Далее → (выбрано: ${selected.length})` : 'Выберите хотя бы одну страну';

  rows.push([Markup.button.callback(confirmLabel, 'confirm_countries')]);

  return Markup.inlineKeyboard(rows);
}

// ─── Category multi-select ───────────────────────────────────────────────────

export function categoryKeyboard(selected: string[]) {
  const buttons = Object.entries(CATEGORIES).map(([key, { name, icon }]) => {
    const isSelected = selected.includes(key);
    const label = isSelected ? `✅ ${icon} ${name}` : `${icon} ${name}`;
    return Markup.button.callback(label, `toggle_category:${key}`);
  });

  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }

  const confirmLabel =
    selected.length > 0
      ? `Готово ✓ (выбрано: ${selected.length})`
      : 'Выберите хотя бы одну категорию';

  rows.push([Markup.button.callback(confirmLabel, 'confirm_categories')]);

  return Markup.inlineKeyboard(rows);
}

// ─── Settings keyboard ───────────────────────────────────────────────────────

export function settingsKeyboard(countries: string[], categories: string[]) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`🌍 Страны (${countries.length})`, 'settings_edit_countries')],
    [Markup.button.callback(`📂 Категории (${categories.length})`, 'settings_edit_categories')],
  ]);
}

// ─── News navigation ─────────────────────────────────────────────────────────

export function newsNavKeyboard(index: number, total: number) {
  const buttons = [];
  if (index > 0) buttons.push(Markup.button.callback('←', `news_nav:${index - 1}`));
  buttons.push(Markup.button.callback(`${index + 1} / ${total}`, 'noop'));
  if (index < total - 1) buttons.push(Markup.button.callback('→', `news_nav:${index + 1}`));
  return Markup.inlineKeyboard([buttons]);
}

// ─── Subscription keyboard ───────────────────────────────────────────────────

export function subscribeKeyboard(
  currentHour?: number,
  currentMinute?: number,
  isActive?: boolean
) {
  const timeButtons = PRESET_TIMES.map(({ label, hour, minute }) => {
    const isCurrentTime = hour === currentHour && minute === currentMinute && isActive;
    return Markup.button.callback(
      isCurrentTime ? `✅ ${label}` : label,
      `subscribe_time:${hour}:${minute}`
    );
  });

  const rows: ReturnType<typeof Markup.button.callback>[][] = [];
  for (let i = 0; i < timeButtons.length; i += 3) {
    rows.push(timeButtons.slice(i, i + 3));
  }

  if (isActive) {
    rows.push([Markup.button.callback('🔕 Отключить рассылку', 'subscribe_disable')]);
  }

  return Markup.inlineKeyboard(rows);
}
