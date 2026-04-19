import type { BotContext } from '../../types';
import { getSubscription, upsertSubscription, setSubscriptionActive } from '../../services/db';
import { subscribeKeyboard } from '../keyboards';
import { reloadScheduler } from '../../services/scheduler';
import type { Telegraf } from 'telegraf';

let botRef: Telegraf<BotContext> | null = null;

export function setBotRef(bot: Telegraf<BotContext>): void {
  botRef = bot;
}

async function showSubscription(ctx: BotContext, editMessage = false): Promise<void> {
  const sub = await getSubscription(ctx.from!.id);

  let text: string;
  if (sub && sub.is_active) {
    const hour = String(sub.hour).padStart(2, '0');
    const minute = String(sub.minute).padStart(2, '0');
    text = [
      '📅 *Подписка на рассылку*',
      '',
      `✅ Активна — каждый день в *${hour}:${minute}* (UTC)`,
      '',
      'Вы будете получать 3 свежие новости по вашим фильтрам.',
      'Чтобы изменить время — выберите другое:',
    ].join('\n');
  } else {
    text = [
      '📅 *Подписка на рассылку*',
      '',
      '🔕 Рассылка отключена.',
      '',
      'Выберите удобное время (UTC) — и бот будет присылать новости каждый день:',
    ].join('\n');
  }

  const keyboard = subscribeKeyboard(sub?.hour, sub?.minute, sub?.is_active);

  if (editMessage && ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard });
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', ...keyboard });
  }
}

export async function handleSubscribe(ctx: BotContext): Promise<void> {
  await showSubscription(ctx);
}

export async function handleSubscribeTime(ctx: BotContext): Promise<void> {
  if (!ctx.callbackQuery || !('data' in ctx.callbackQuery)) return;

  const parts = ctx.callbackQuery.data.split(':');
  const hour = parseInt(parts[1] ?? '0', 10);
  const minute = parseInt(parts[2] ?? '0', 10);

  if (isNaN(hour) || isNaN(minute)) {
    await ctx.answerCbQuery('Некорректное время', { show_alert: true });
    return;
  }

  await upsertSubscription(ctx.from!.id, hour, minute);

  if (botRef) reloadScheduler(botRef);

  const hourStr = String(hour).padStart(2, '0');
  const minStr = String(minute).padStart(2, '0');

  await ctx.answerCbQuery(`Подписка установлена на ${hourStr}:${minStr} ✅`);
  await showSubscription(ctx, true);
}

export async function handleSubscribeDisable(ctx: BotContext): Promise<void> {
  if (!ctx.callbackQuery) return;

  await setSubscriptionActive(ctx.from!.id, false);

  if (botRef) reloadScheduler(botRef);

  await ctx.answerCbQuery('Рассылка отключена');
  await showSubscription(ctx, true);
}
