// «Что нового» в Профиль → «О приложении». Новая запись — сверху.
// Правило (docs/versioning.md): PR, который поднимает версию в package.json, добавляет сюда запись
// с тем же номером — 1–3 коротких пункта на каждом языке, словами пользователя, без названий из кода.
// Тест src/about/about.test.ts проверяет, что верхняя запись совпадает с версией приложения.

import type { Lang } from '../core/types';

export type ChangelogEntry = { v: string } & Record<Lang, string[]>;

export const CHANGELOG: ChangelogEntry[] = [
  {
    v: '0.32.1',
    ru: ['«Обратная связь» теперь открывает группу отзывов в Telegram.'],
    en: ['"Feedback" now opens the feedback group in Telegram.'],
  },
  {
    v: '0.32.0',
    ru: ['Профиль → «Обратная связь»: выберите «ошибка», «идея» или «вопрос», и приложение подготовит сообщение с версией и устройством для отправки в Telegram.'],
    en: ['Profile → "Feedback": pick "bug", "idea" or "question" and the app prepares a message with the version and device to send in Telegram.'],
  },
  {
    v: '0.31.0',
    ru: [
      'Фото: демо-оценка собирает черновик по названию блюда. Продукт из справочника получает своё КБЖУ и обычную порцию, незнакомое блюдо — примерные значения с пометкой «проверьте».',
      'В справочник продуктов добавлены блины и панкейки.',
    ],
    en: [
      'Photo: the demo estimate builds the draft from the dish name. A food from the list gets its own calories, macros and a typical portion; an unknown dish gets rough values marked "check".',
      'Pancakes and crepes added to the food list.',
    ],
  },
  {
    v: '0.30.0',
    ru: ['В «О приложении» появился список «Что нового»: коротко о последних изменениях.'],
    en: ['"About" now has a "What\'s new" list with a short summary of recent changes.'],
  },
  {
    v: '0.29.0',
    ru: ['Приветствие по имени вверху экрана «День» с учётом времени суток.'],
    en: ['A greeting with your name at the top of the Day screen, based on the time of day.'],
  },
  {
    v: '0.28.0',
    ru: ['Профиль → «Wiki: баланс энергии»: 20 исследований об адаптации, белке, составе рациона и расходе энергии, с кратким выводом и ссылками.'],
    en: ['Profile → "Wiki: energy balance": 20 studies on adaptation, protein, diet composition and energy expenditure, with short takeaways and links.'],
  },
  {
    v: '0.27.0',
    ru: ['Профиль → «О приложении»: номер версии и дата выпуска, документы и контакты.'],
    en: ['Profile → "About": version number and release date, documents and contacts.'],
  },
  {
    v: '0.26.0',
    ru: ['Графики: проведите пальцем или мышью, и над графиком появятся дата и значения всех линий в этот день.'],
    en: ['Charts: drag a finger or the mouse to see the date and every line\'s value for that day above the chart.'],
  },
  {
    v: '0.25.0',
    ru: ['Замеры тела: в день без замера серым показаны последние значения и % жира с датой замера.'],
    en: ['Body measurements: on a day without a measurement, the latest values and body fat % are shown in grey with their date.'],
  },
  {
    v: '0.24.0',
    ru: ['Telegram-бот: быстрый ввод веса, шагов и самочувствия одним сообщением и сводка за неделю. Заработает после подключения сервера.'],
    en: ['Telegram bot: log weight, steps and how you feel in one message, plus a weekly summary. Works once the server is connected.'],
  },
  {
    v: '0.23.0',
    ru: ['Перенос данных из прототипа «Ежедневный отчёт»: кнопка «Импорт резервной копии» сама узнаёт его файл и не затирает уже заполненное.'],
    en: ['Move your data from the "Daily report" prototype: "Import backup" recognises its file and keeps what you have already filled in.'],
  },
];
