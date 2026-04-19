import OpenAI from 'openai';
import { config } from '../config';
import type { AdaptedArticle } from '../types';
import { COUNTRIES, CATEGORIES } from '../types';

const client = new OpenAI({
  apiKey: config.DEEPSEEK_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

const SYSTEM_PROMPT = `Ты опытный журналист-международник и литературный переводчик, специализирующийся на Латинской Америке. Твои материалы читает русскоязычная аудитория, которая хочет глубоко понимать происходящее в регионе.

Переводи статью точно и литературным журналистским языком, полностью сохраняя смысл, контекст и нюансы оригинала. Не упрощай и не теряй важные детали. Незнакомые реалии (политики, партии, события) кратко объясняй прямо в тексте. Тон — нейтральный, без оценочных суждений.
Краткое изложение (summary) — 2–3 предложения: что произошло и почему это важно.

Отвечай строго в JSON-формате без markdown-обёртки:
{"title":"...","summary":"...","body":"..."}`;

export async function adaptArticle(params: {
  worldNewsId: number;
  title: string;
  text: string;
  countryCode: string;
  category: string;
}): Promise<AdaptedArticle> {
  const { title, text, countryCode, category } = params;

  const countryName = COUNTRIES[countryCode]?.name ?? countryCode;
  const categoryName = CATEGORIES[category]?.name ?? category;

  const userPrompt = `Страна: ${countryName}
Рубрика: ${categoryName}
Заголовок: ${title}
Текст: ${text.slice(0, 3000)}`;

  const completion = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.4,
    max_tokens: 1200,
    response_format: { type: 'json_object' },
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('DeepSeek вернул пустой ответ');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Не удалось разобрать ответ ИИ');
  }

  const result = parsed as Record<string, unknown>;
  if (
    typeof result.title !== 'string' ||
    typeof result.summary !== 'string' ||
    typeof result.body !== 'string'
  ) {
    throw new Error('ИИ вернул некорректный формат');
  }

  return {
    title: result.title,
    summary: result.summary,
    body: result.body,
  };
}
