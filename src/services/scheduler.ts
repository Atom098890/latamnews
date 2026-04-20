import cron from 'node-cron';
import type { Telegraf } from 'telegraf';
import type { BotContext } from '../types';
import { getActiveSubscriptions, getAllActiveUsers, deleteArticlesOlderThan, getCachedArticle, saveArticle, getRecentArticles } from './db';
import { fetchNews } from './news';
import { adaptArticle } from './ai';
import { newsNavKeyboard } from '../bot/keyboards';
import { formatArticle } from '../bot/handlers/news';

const activeTasks = new Map<number, cron.ScheduledTask>();

const ARTICLE_TTL_DAYS = 10;

export function startScheduler(bot: Telegraf<BotContext>): void {
  loadAndSchedule(bot);
  prefetchAllArticles();

  cron.schedule('0 * * * *', () => loadAndSchedule(bot));
  cron.schedule('0 */3 * * *', () => prefetchAllArticles());
  cron.schedule('0 3 * * *', () => {
    deleteArticlesOlderThan(ARTICLE_TTL_DAYS)
      .then((count) => console.log(`[scheduler] Cleaned up ${count} articles older than ${ARTICLE_TTL_DAYS} days`))
      .catch((err) => console.error('[scheduler] Article cleanup failed:', err));
  });
}

async function prefetchAllArticles(): Promise<void> {
  const users = await getAllActiveUsers().catch((err) => {
    console.error('[prefetch] Failed to load users:', err);
    return [];
  });

  if (users.length === 0) return;

  const pairs = new Set<string>();
  for (const user of users) {
    for (const country of user.country_codes) {
      for (const category of user.categories) {
        pairs.add(`${country}:${category}`);
      }
    }
  }

  console.log(`[prefetch] Fetching for ${pairs.size} country+category pair(s)`);

  for (const pair of pairs) {
    const [country, category] = pair.split(':') as [string, string];
    try {
      const { articles } = await fetchNews({ countries: [country], categories: [category], limit: 5 });

      for (const raw of articles) {
        if (await getCachedArticle(raw.id)) continue;

        const adapted = await adaptArticle({
          title: raw.title,
          text: raw.text || raw.summary || raw.title,
          countryCode: country,
          category,
        });

        await saveArticle({
          world_news_id: raw.id,
          adapted_title: adapted.title,
          adapted_summary: adapted.summary,
          adapted_body: adapted.body,
          country_code: country,
          category,
          source_url: raw.url,
          image_url: raw.image ?? null,
          published_at: raw['publish-date'] ?? null,
        });
      }
    } catch (err) {
      console.error(`[prefetch] Failed for ${pair}:`, err);
    }
  }

  console.log('[prefetch] Done');
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

  const articles = await getRecentArticles(user.country_codes, user.categories, 5);

  if (articles.length === 0) {
    await bot.telegram.sendMessage(telegramId, '📭 Свежих новостей пока нет. Проверьте позже.');
    return;
  }

  const first = articles[0]!;

  await bot.telegram.sendMessage(telegramId, formatArticle(first), {
    parse_mode: 'MarkdownV2',
    link_preview_options: { is_disabled: true },
    ...newsNavKeyboard(0, articles.length),
  });
}

export function reloadScheduler(bot: Telegraf<BotContext>): void {
  loadAndSchedule(bot);
}
