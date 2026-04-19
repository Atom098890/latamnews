import cron from 'node-cron';
import type { Telegraf } from 'telegraf';
import type { BotContext } from '../types';
import { getActiveSubscriptions, getAllActiveUsers, deleteArticlesOlderThan } from './db';
import { fetchNews } from './news';
import { adaptArticle } from './ai';
import { getCachedArticle, saveArticle } from './db';
import { COUNTRIES, CATEGORIES, countryLabel, categoryLabel } from '../types';

const activeTasks = new Map<number, cron.ScheduledTask>();

const ARTICLE_TTL_DAYS = 30;

export function startScheduler(bot: Telegraf<BotContext>): void {
  loadAndSchedule(bot);
  // Reload subscription list every hour in case users added/changed them
  cron.schedule('0 * * * *', () => loadAndSchedule(bot));
  // Clean up old articles every day at 03:00 UTC
  cron.schedule('0 3 * * *', () => {
    deleteArticlesOlderThan(ARTICLE_TTL_DAYS)
      .then((count) => console.log(`[scheduler] Cleaned up ${count} articles older than ${ARTICLE_TTL_DAYS} days`))
      .catch((err) => console.error('[scheduler] Article cleanup failed:', err));
  });
}

async function loadAndSchedule(bot: Telegraf<BotContext>): Promise<void> {
  const subscriptions = await getActiveSubscriptions().catch((err) => {
    console.error('[scheduler] Failed to load subscriptions:', err);
    return [];
  });

  // Clear existing tasks before rebuilding
  for (const task of activeTasks.values()) task.stop();
  activeTasks.clear();

  for (const sub of subscriptions) {
    const expression = `${sub.minute} ${sub.hour} * * *`;

    if (!cron.validate(expression)) continue;

    const task = cron.schedule(expression, () => {
      deliverNewsToUser(bot, sub.telegram_id).catch((err) => {
        console.error(`[scheduler] Delivery failed for ${sub.telegram_id}:`, err);
      });
    });

    activeTasks.set(sub.telegram_id, task);
  }

  console.log(`[scheduler] Scheduled ${activeTasks.size} active subscription(s)`);
}

async function deliverNewsToUser(bot: Telegraf<BotContext>, telegramId: number): Promise<void> {
  const users = await getAllActiveUsers();
  const user = users.find((u) => u.telegram_id === telegramId);
  if (!user || user.country_codes.length === 0) return;

  const { articles } = await fetchNews({
    countries: user.country_codes,
    categories: user.categories,
    limit: 3,
  });

  if (articles.length === 0) {
    await bot.telegram.sendMessage(telegramId, '📭 Свежих новостей пока нет. Проверьте позже.');
    return;
  }

  await bot.telegram.sendMessage(telegramId, '🌅 *Ваши утренние новости Латинской Америки:*', {
    parse_mode: 'Markdown',
  });

  for (const raw of articles.slice(0, 3)) {
    try {
      const countryCode = raw['source-country'] ?? user.country_codes[0] ?? 'mx';
      const category = raw.category ?? user.categories[0] ?? 'politics';

      let article = await getCachedArticle(raw.id);

      if (!article) {
        const adapted = await adaptArticle({
          worldNewsId: raw.id,
          title: raw.title,
          text: raw.text || raw.summary || raw.title,
          countryCode,
          category,
        });

        article = await saveArticle({
          world_news_id: raw.id,
          adapted_title: adapted.title,
          adapted_summary: adapted.summary,
          adapted_body: adapted.body,
          country_code: countryCode,
          category,
          source_url: raw.url,
          image_url: raw.image ?? null,
          published_at: raw['publish-date'] ?? null,
        });
      }

      const country = COUNTRIES[article.country_code];
      const cat = CATEGORIES[article.category];
      const flag = country?.flag ?? '';
      const catIcon = cat?.icon ?? '';

      const text = [
        `${flag} ${catIcon} *${categoryLabel(article.category)}*`,
        '',
        `*${article.adapted_title}*`,
        '',
        article.adapted_summary,
        '',
        `[Читать источник →](${article.source_url})`,
      ].join('\n');

      await bot.telegram.sendMessage(telegramId, text, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
      });
    } catch (err) {
      console.error('[scheduler] Article delivery error:', err);
    }
  }
}

export function reloadScheduler(bot: Telegraf<BotContext>): void {
  loadAndSchedule(bot);
}
