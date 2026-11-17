// Реквизиты оператора для юридических документов. Заполняются один раз здесь,
// подставляются во все документы на всех языках (шаблоны в docs/legal/<язык>/*.md).
// Пока поле пустое, в тексте видна пометка «[укажите: …]», а над документом — плашка «Черновик».

import type { Lang } from '../core/types';

/** Версия комплекта документов. При изменении текста — новая дата: пользователей попросим принять заново. */
export const LEGAL_VERSION = '2026-11-17';

/** Пока true, над документами показывается плашка «Черновик, не проверен юристом». */
export const LEGAL_DRAFT = true;

export type LegalField = 'operator' | 'operatorId' | 'address' | 'email' | 'site' | 'processors' | 'jurisdiction' | 'euRep';

/** Значения по языкам. Пустая строка = ещё не заполнено. */
export const OPERATOR: Record<LegalField, Record<Lang, string>> = {
  // ФИО физлица / «ИП Иванов И. И.» / «ООО „…“» — решение о статусе ещё не принято
  operator: { ru: '', en: '' },
  // ИНН (для самозанятого), ИНН и ОГРНИП (для ИП), ИНН и ОГРН (для ООО)
  operatorId: { ru: '', en: '' },
  address: { ru: '', en: '' },
  email: { ru: '', en: '' },
  site: { ru: '', en: '' },
  // хостинг, облачная БД, почта, сервис оценки фото — с названием и страной
  processors: { ru: '', en: '' },
  // право для пользователей вне РФ (в русской редакции — право РФ)
  jurisdiction: { ru: 'Российской Федерации', en: '' },
  // представитель в ЕС по ст. 27 GDPR, если нет компании в ЕС
  euRep: { ru: '', en: '' },
};

const MISSING: Record<Lang, Record<LegalField, string>> = {
  ru: {
    operator: 'ФИО или наименование оператора',
    operatorId: 'ИНН / ОГРНИП',
    address: 'адрес',
    email: 'почта для обращений',
    site: 'адрес сайта',
    processors: 'список подрядчиков с указанием страны',
    jurisdiction: 'применимое право',
    euRep: 'представитель в ЕС или «не требуется»',
  },
  en: {
    operator: 'operator name',
    operatorId: 'tax / registration number',
    address: 'address',
    email: 'contact email',
    site: 'website address',
    processors: 'list of processors and their countries',
    jurisdiction: 'governing law',
    euRep: 'EU representative or "not required"',
  },
};

const FILL: Record<Lang, (what: string) => string> = {
  ru: (w) => `[укажите: ${w}]`,
  en: (w) => `[to be filled: ${w}]`,
};

/** Подставляет реквизиты, версию и дату в шаблон документа. */
export function fillLegal(template: string, lang: Lang, effectiveDate: string): string {
  return template.replace(/\{\{(\w+)\}\}/g, (m, key: string) => {
    if (key === 'version') return LEGAL_VERSION;
    if (key === 'effectiveDate') return effectiveDate;
    const f = OPERATOR[key as LegalField];
    if (!f) return m;
    return f[lang] || FILL[lang](MISSING[lang][key as LegalField]);
  });
}

export const LEGAL_PLACEHOLDERS = ['version', 'effectiveDate', ...(Object.keys(OPERATOR) as LegalField[])];
