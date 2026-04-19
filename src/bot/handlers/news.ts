import type { BotContext, DbArticle } from '../../types';
import { COUNTRIES, CATEGORIES, categoryLabel } from '../../types';
import { getUser, getCachedArticle, getRecentArticles } from '../../services/db';
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

  const loadingMsg = await ctx.reply('⏳ Загружаю новости...');

  try {
    const cached = await getRecentArticles(user.country_codes, user.categories, PAGE_SIZE);

    await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id).catch(() => undefined);

    if (cached.length === 0) {
      await ctx.reply('📭 Новости ещё не загружены. Попробуйте через несколько минут.', mainMenu);
      return;
    }

    const articleIds = cached.map(a => a.world_news_id);

    if (articleIds.length === 0) {
      await ctx.reply('❌ Не удалось загрузить новости. Попробуйте позже.', mainMenu);
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

  const countryName = country?.name ?? article.country_code.toUpperCase();

  return [
    `${flag} *${escapeMarkdown(countryName)}*  ${catIcon} ${escapeMarkdown(categoryLabel(article.category))}${date ? `  _${escapeMarkdown(date)}_` : ''}`,
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
