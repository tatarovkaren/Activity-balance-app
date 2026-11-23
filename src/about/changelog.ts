// «Что нового» в Профиль → «О приложении». Новая запись — сверху.
// Правило (docs/versioning.md): PR, который поднимает версию в package.json, добавляет сюда запись
// с тем же номером — 1–3 коротких пункта на каждом языке, словами пользователя, без названий из кода.
// Тест src/about/about.test.ts проверяет, что верхняя запись совпадает с версией приложения.

import type { Lang } from '../core/types';

export type ChangelogEntry = { v: string } & Record<Lang, string[]>;

export const CHANGELOG: ChangelogEntry[] = [
  {
    v: '0.37.0',
    ru: [
      'Итог дня по цели: под калориями и белком — шкала с коридором цели и статус («✓ в коридоре», «▲ перебор +320», «ещё 660–840»), в заголовке питания — «✓ день в цели» или «! мимо: 2». День закрывается в 21:00, кнопкой «Закрыть день» или отправкой отчёта; в календаре под каждым днём — его итог. В Профиле появились цвета для дальтоников.',
      'Подсказка по планке раз в неделю: приложение объясняет, почему вес идёт не по плану, и предлагает одно действие — «Применить» или «Не сейчас». Если есть куратор, подсказка сначала уходит ему.',
      'Исправлено: в режиме набора массы профицит в «Балансе» больше не красный, а дефицит — не зелёный.',
    ],
    en: [
      'Day result against your target: calories and protein get a bar with the target range and a status ("✓ in range", "▲ over +320", "660–840 to go"), and the food card shows "✓ day on target" or "! missed: 2". The day closes at 21:00, with "Close the day" or when you send the report; the calendar shows each day\'s result. Profile now has color-blind friendly colors.',
      'A weekly target tip: the app explains why your weight is off plan and suggests one action — "Apply" or "Not now". If you have a coach, the tip goes to them first.',
      'Fixed: in the weight gain mode, a surplus in "Balance" is no longer red and a deficit no longer green.',
    ],
  },
  {
    v: '0.36.1',
    ru: ['Замеры тела: когда начинаете вводить новый замер, серая подсказка пропадает только у этого поля, остальные прошлые значения остаются видны. Пока замер неполный, виден прошлый % жира и подсказка, что ещё ввести.'],
    en: ['Body measurements: when you start entering a new measurement, only that field loses its grey hint, the other previous values stay visible. Until the measurement is complete you see the previous body fat % and what is still missing.'],
  },
  {
    v: '0.36.0',
    ru: ['Крупный шрифт: Профиль → «Размер шрифта» → «Крупный». Текст, поля и кнопки становятся примерно на 20 % больше, подписи на графиках тоже.'],
    en: ['Large text: Profile → "Text size" → "Large". Text, fields and buttons get about 20% bigger, chart labels too.'],
  },
  {
    v: '0.35.0',
    ru: [
      'Дополнительные замеры по желанию: грудь, бицепс, а мужчинам и бёдра (по ягодицам). На % жира не влияют, в дни без замера видны последние значения.',
      'Новый график «Объёмы тела» на «Графиках»: насколько изменились шея, живот, бёдра, грудь и бицепс за период.',
    ],
    en: [
      'Optional extra measurements: chest, biceps and, for men, hips (around the buttocks). They do not affect body fat %, and your latest values show on days without a measurement.',
      'New "Body measurements" chart: how your neck, waist, hips, chest and biceps changed over the period.',
    ],
  },
  {
    v: '0.34.0',
    ru: ['Справочник продуктов дополнен базой USDA: ещё около 6 400 продуктов (мясо по отрубам, рыба, овощи, фрукты, крупы, молочное), ищутся по-русски и по-английски.'],
    en: ['The food list now includes the USDA database: about 6,400 more foods (meat cuts, fish, vegetables, fruit, grains, dairy), searchable in Russian and English.'],
  },
  {
    v: '0.33.0',
    ru: [
      'Справочник продуктов: кнопка «＋ Продукт» на «Дне» — около 350 продуктов и блюд с КБЖУ на 100 г, обычной порцией и источником, поиск по-русски и по-английски.',
      'Свои продукты и блюда со своими порциями: сохраняются и находятся в поиске, в том числе при подсчёте по фото.',
      'Магазинные товары из открытой базы Open Food Facts: поиск по названию или по штрихкоду (снимок или цифры).',
    ],
    en: [
      'Food list: the "＋ Food" button on the Day screen, about 350 foods and dishes with calories and macros per 100 g, a typical portion and a source, searchable in Russian and English.',
      'Your own foods and dishes with your own portions: saved and found in search, including in photo estimates.',
      'Store products from the open Open Food Facts database: search by name or by barcode (a photo or the digits).',
    ],
  },
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
