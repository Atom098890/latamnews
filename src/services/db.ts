import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import type { DbUser, DbArticle, DbSubscription } from '../types';

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false },
});

// ─── Users ───────────────────────────────────────────────────────────────────

export async function upsertUser(data: {
  telegram_id: number;
  username?: string | null;
  first_name?: string | null;
}): Promise<DbUser> {
  const { data: user, error } = await supabase
    .from('users')
    .upsert(
      {
        telegram_id: data.telegram_id,
        username: data.username ?? null,
        first_name: data.first_name ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'telegram_id', ignoreDuplicates: false }
    )
    .select()
    .single();

  if (error) throw new Error(`upsertUser: ${error.message}`);
  return user;
}

export async function getUser(telegramId: number): Promise<DbUser | null> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (error) throw new Error(`getUser: ${error.message}`);
  return data;
}

export async function updateUserPreferences(
  telegramId: number,
  preferences: { country_codes?: string[]; categories?: string[] }
): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ ...preferences, updated_at: new Date().toISOString() })
    .eq('telegram_id', telegramId);

  if (error) throw new Error(`updateUserPreferences: ${error.message}`);
}

export async function getAllActiveUsers(): Promise<DbUser[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('is_active', true);

  if (error) throw new Error(`getAllActiveUsers: ${error.message}`);
  return data ?? [];
}

// ─── Article cache ───────────────────────────────────────────────────────────

export async function getCachedArticle(worldNewsId: number): Promise<DbArticle | null> {
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .eq('world_news_id', worldNewsId)
    .maybeSingle();

  if (error) throw new Error(`getCachedArticle: ${error.message}`);
  return data;
}

export async function deleteArticlesOlderThan(days: number): Promise<number> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('articles')
    .delete()
    .lt('created_at', cutoff)
    .select('id');

  if (error) throw new Error(`deleteArticlesOlderThan: ${error.message}`);
  return data?.length ?? 0;
}

export async function saveArticle(article: Omit<DbArticle, 'id' | 'created_at'>): Promise<DbArticle> {
  const { data, error } = await supabase
    .from('articles')
    .upsert(article, { onConflict: 'world_news_id' })
    .select()
    .single();

  if (error) throw new Error(`saveArticle: ${error.message}`);
  return data;
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

export async function getSubscription(telegramId: number): Promise<DbSubscription | null> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('telegram_id', telegramId)
    .maybeSingle();

  if (error) throw new Error(`getSubscription: ${error.message}`);
  return data;
}

export async function upsertSubscription(
  telegramId: number,
  hour: number,
  minute: number
): Promise<DbSubscription> {
  const { data, error } = await supabase
    .from('subscriptions')
    .upsert(
      { telegram_id: telegramId, hour, minute, is_active: true },
      { onConflict: 'telegram_id' }
    )
    .select()
    .single();

  if (error) throw new Error(`upsertSubscription: ${error.message}`);
  return data;
}

export async function setSubscriptionActive(telegramId: number, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('subscriptions')
    .update({ is_active: isActive })
    .eq('telegram_id', telegramId);

  if (error) throw new Error(`setSubscriptionActive: ${error.message}`);
}

export async function getActiveSubscriptions(): Promise<DbSubscription[]> {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('is_active', true);

  if (error) throw new Error(`getActiveSubscriptions: ${error.message}`);
  return data ?? [];
}
