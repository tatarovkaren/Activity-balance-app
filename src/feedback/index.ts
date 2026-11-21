// Обратная связь от тестеров: заготовка сообщения (версия, устройство, язык, режим) и адрес чата.
// Адрес чата — одна настройка: FEEDBACK_CHAT ниже или переменная EXPO_PUBLIC_FEEDBACK_CHAT при сборке.
// В заготовке нет данных пользователя: ни цифр, ни имени, ни почты.

/** Ссылка на Telegram-чат для отзывов, например https://t.me/+AbCdEf… Пусто = чата ещё нет. */
export const FEEDBACK_CHAT = '';

export function feedbackChat(): string {
  const env = (process.env.EXPO_PUBLIC_FEEDBACK_CHAT || '').trim();
  return normChat(env || FEEDBACK_CHAT);
}

/** «t.me/+abc», «@group», «https://t.me/x» → https-ссылка; мусор → ''. */
export function normChat(s: string): string {
  const v = s.trim();
  if (!v) return '';
  if (/^@[A-Za-z0-9_]{4,}$/.test(v)) return 'https://t.me/' + v.slice(1);
  if (/^(https?:\/\/)?(t\.me|telegram\.me)\/\S+$/i.test(v)) return v.replace(/^(https?:\/\/)?/i, 'https://');
  if (/^tg:\/\/\S+$/i.test(v)) return v;
  return '';
}

export const FEEDBACK_KINDS = ['bug', 'idea', 'question'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/** Коротко об устройстве по строке браузера: «iPhone · iOS 18.1 · Safari». */
export function describeUA(ua: string): string {
  if (!ua) return '';
  const parts: string[] = [];
  let m: RegExpMatchArray | null;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && /Mobile/.test(ua))) parts.push('iPad');
  else if (/iPhone/.test(ua)) parts.push('iPhone');
  if ((m = ua.match(/OS (\d+)[_.](\d+)/)) && /iPhone|iPad|iPod/.test(ua)) parts.push('iOS ' + m[1] + '.' + m[2]);
  else if ((m = ua.match(/Android (\d+(?:\.\d+)?)/))) {
    const model = ua.match(/Android [^;)]*;\s*([^;)]+?)(?:\s+Build\/[^;)]*)?\)/);
    if (model && model[1] && !/^(K|wv|Linux|U)$/.test(model[1].trim())) parts.push(model[1].trim());
    parts.push('Android ' + m[1]);
  } else if (/Windows NT/.test(ua)) parts.push('Windows');
  else if ((m = ua.match(/Mac OS X (\d+)[_.](\d+)/))) parts.push('macOS ' + m[1] + '.' + m[2]);
  else if (/CrOS/.test(ua)) parts.push('ChromeOS');
  else if (/Linux/.test(ua)) parts.push('Linux');
  const br: [RegExp, string][] = [
    [/YaBrowser\/(\d+)/, 'Яндекс Браузер'],
    [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
    [/Edg(?:A|iOS)?\/(\d+)/, 'Edge'],
    [/OPR\/(\d+)/, 'Opera'],
    [/Firefox\/(\d+)|FxiOS\/(\d+)/, 'Firefox'],
    [/CriOS\/(\d+)|Chrome\/(\d+)/, 'Chrome'],
    [/Version\/(\d+).*Safari/, 'Safari'],
  ];
  for (const [re, name] of br) {
    const b = ua.match(re);
    if (b) {
      parts.push(name + ' ' + (b[1] || b[2]));
      break;
    }
  }
  return parts.join(' · ');
}

export type FeedbackInfo = {
  version: string;
  build?: string;
  device: string;
  screen?: string;
  installed?: boolean;
  lang: string;
  mode: string;
  date: string;
};

export type FeedbackTexts = {
  kinds: Record<FeedbackKind, string>;
  head: (kind: string) => string;
  version: string;
  device: string;
  screenSize: string;
  installed: string;
  lang: string;
  mode: string;
  date: string;
  body: Record<FeedbackKind, string>;
};

/** Текст заготовки: шапка с техническими данными и место для описания. */
export function buildReport(kind: FeedbackKind, info: FeedbackInfo, L: FeedbackTexts): string {
  const rows: string[] = [L.head(L.kinds[kind]), ''];
  rows.push(L.version + ': ' + info.version + (info.build ? ' (' + info.build + ')' : ''));
  if (info.device) rows.push(L.device + ': ' + info.device + (info.installed ? ' · ' + L.installed : ''));
  if (info.screen) rows.push(L.screenSize + ': ' + info.screen);
  rows.push(L.lang + ': ' + info.lang + ' · ' + L.mode + ': ' + info.mode);
  rows.push(L.date + ': ' + info.date);
  rows.push('', L.body[kind]);
  return rows.join('\n');
}
