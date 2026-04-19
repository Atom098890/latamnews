import type { BotContext, DbArticle } from '../../types';
import { COUNTRIES, CATEGORIES, countryLabel, categoryLabel } from '../../types';
import { getUser, getCachedArticle, saveArticle } from '../../services/db';
import { fetchNews } from '../../services/news';
import { adaptArticle } from '../../services/ai';
import { newsNavKeyboard, mainMenu } from '../keyboards';

const PAGE_SIZE = 5;

export async function handleNews(ctx: BotContext): Promise<void> {
  const user = await getUser(ctx.from!.id);

  if (!user || user.country_codes.length === 0 || user.categories.length === 0) {
    await ctx.reply(
      '⚙️ Сначала настройте фильтры — нажмите *⚙️ Настройки* или отправьте /start',
      { parse_mode: 'Markdown' }
    );
    return;
  }

  const loadingMsg = await ctx.reply('⏳ Загружаю и перевожу новости...');

  try {
    const { articles } = await fetchNews({
      countries: user.country_codes,
      categories: user.categories,
      limit: PAGE_SIZE,
    });

    await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id).catch(() => undefined);

    if (articles.length === 0) {
      await ctx.reply('📭 По вашим фильтрам новостей пока нет. Попробуйте расширить выбор стран или категорий в настройках.', mainMenu);
      return;
    }

    const articleIds: number[] = [];

    for (const raw of articles) {
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

        articleIds.push(raw.id);
      } catch (err) {
        console.error('[news] Failed to process article:', err);
      }
    }

    if (articleIds.length === 0) {
      await ctx.reply('❌ Не удалось обработать новости. Попробуйте позже.', mainMenu);
      return;
    }

    ctx.session.newsArticleIds = articleIds;
    ctx.session.newsIndex = 0;

    const first = await getCachedArticle(articleIds[0]!);
    if (!first) return;

    await ctx.reply(formatArticle(first), {
      parse_mode: 'MarkdownV2',
      link_preview_options: { is_disabled: true },
      ...newsNavKeyboard(0, articleIds.length),
    });
  } catch (err) {
    await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id).catch(() => undefined);
    const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
    await ctx.reply(`❌ ${message}`, mainMenu);
  }
}

export async function handleNewsNav(ctx: BotContext): Promise<void> {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

  const indexStr = ctx.callbackQuery.data.split(':')[1];
  const index = parseInt(indexStr ?? '0', 10);
  const articleIds = ctx.session.newsArticleIds ?? [];

  if (index < 0 || index >= articleIds.length) {
    await ctx.answerCbQuery();
    return;
  }

  const article = await getCachedArticle(articleIds[index]!);
  if (!article) {
    await ctx.answerCbQuery('Статья не найдена');
    return;
  }

  ctx.session.newsIndex = index;
  await ctx.answerCbQuery();

  await ctx.editMessageText(formatArticle(article), {
    parse_mode: 'MarkdownV2',
    link_preview_options: { is_disabled: true },
    ...newsNavKeyboard(index, articleIds.length),
  });
}

function formatArticle(article: DbArticle): string {
  const country = COUNTRIES[article.country_code];
  const cat = CATEGORIES[article.category];
  const flag = country?.flag ?? '';
  const catIcon = cat?.icon ?? '';
  const date = article.published_at
    ? new Date(article.published_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
    : '';

  return [
    `${flag} ${catIcon} *${escapeMarkdown(categoryLabel(article.category))}* · ${escapeMarkdown(countryLabel(article.country_code))}${date ? `  _${escapeMarkdown(date)}_` : ''}`,
    '',
    `*${escapeMarkdown(article.adapted_title)}*`,
    '',
    escapeMarkdown(article.adapted_body),
    '',
    `[Читать источник →](${article.source_url})`,
  ].join('\n');
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&');
}
