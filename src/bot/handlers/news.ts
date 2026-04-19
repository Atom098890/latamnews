import type { BotContext } from '../../types';
import { COUNTRIES, CATEGORIES, countryLabel, categoryLabel } from '../../types';
import { getUser, getCachedArticle, saveArticle } from '../../services/db';
import { fetchNews } from '../../services/news';
import { adaptArticle } from '../../services/ai';
import { newsNavKeyboard, mainMenu } from '../keyboards';

const PAGE_SIZE = 5;

export async function handleNews(ctx: BotContext): Promise<void> {
  ctx.session.newsOffset = 0;
  await sendNewsPage(ctx, 0);
}

export async function handleNewsPage(ctx: BotContext): Promise<void> {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

  const offsetStr = ctx.callbackQuery.data.split(':')[1];
  const offset = parseInt(offsetStr ?? '0', 10);

  await ctx.answerCbQuery();

  // Delete the navigation message and send a fresh page
  try {
    await ctx.deleteMessage();
  } catch {
    // Message may already be deleted — ignore
  }

  await sendNewsPage(ctx, offset);
}

async function sendNewsPage(ctx: BotContext, offset: number): Promise<void> {
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
    const { articles, total } = await fetchNews({
      countries: user.country_codes,
      categories: user.categories,
      offset,
      limit: PAGE_SIZE,
    });

    await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id).catch(() => undefined);

    if (articles.length === 0) {
      await ctx.reply(
        '📭 По вашим фильтрам новостей пока нет. Попробуйте расширить выбор стран или категорий в настройках.',
        mainMenu
      );
      return;
    }

    const header = `📰 *Новости Латинской Америки*\n_Страницы ${Math.floor(offset / PAGE_SIZE) + 1} из ${Math.ceil(total / PAGE_SIZE)}_`;
    await ctx.reply(header, { parse_mode: 'Markdown' });

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

        const country = COUNTRIES[article.country_code];
        const cat = CATEGORIES[article.category];
        const flag = country?.flag ?? '';
        const catIcon = cat?.icon ?? '';
        const date = article.published_at
          ? new Date(article.published_at).toLocaleDateString('ru-RU', {
              day: 'numeric',
              month: 'short',
            })
          : '';

        const text = [
          `${flag} ${catIcon} *${categoryLabel(article.category)}* · ${countryLabel(article.country_code)}${date ? `  _${date}_` : ''}`,
          '',
          `*${escapeMarkdown(article.adapted_title)}*`,
          '',
          escapeMarkdown(article.adapted_summary),
          '',
          `[Читать источник →](${article.source_url})`,
        ].join('\n');

        await ctx.reply(text, {
          parse_mode: 'MarkdownV2',
          link_preview_options: { is_disabled: true },
        });
      } catch (err) {
        console.error('[news] Failed to process article:', err);
        // Show at least the original title as fallback
        await ctx.reply(`📄 *${raw.title}*\n\n[Читать источник →](${raw.url})`, {
          parse_mode: 'Markdown',
          link_preview_options: { is_disabled: true },
        });
      }
    }

    const hasMore = offset + PAGE_SIZE < total;
    await ctx.reply('─────────────────', newsNavKeyboard(offset, hasMore));
  } catch (err) {
    await ctx.telegram.deleteMessage(ctx.chat!.id, loadingMsg.message_id).catch(() => undefined);
    const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
    await ctx.reply(`❌ ${message}`, mainMenu);
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, '\\$&');
}
