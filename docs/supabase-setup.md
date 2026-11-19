# Подключить сервер (Supabase) для пилота

Сервер нужен, чтобы клиент и куратор работали с разных телефонов: клиент вводит код куратора,
и его дневник появляется в кабинете куратора. Без сервера данные живут только в браузере.

Тариф Supabase Free бесплатный. Подходит для пилота на тестовых данных или с согласия клиентов.
Серверы за рубежом, поэтому настоящие данные пользователей из РФ потом переедут в российское облако
(242-ФЗ), приложение для этого менять почти не придётся.

Займёт около 30 минут. Удобнее с компьютера.

## 1. Создать проект

1. Открыть https://supabase.com → **Start your project** → войти через GitHub.
2. **New project**:
   - Name: `activity-balance`;
   - Database Password: нажать **Generate a password** и сохранить его у себя (в чат не присылать);
   - Region: **Central EU (Frankfurt)**;
   - тариф Free.
3. Подождать 1–2 минуты, пока проект создаётся.

## 2. Создать таблицы (один раз)

1. Слева **SQL Editor** → **New query**.
2. Открыть файл [`supabase/setup.sql`](../supabase/setup.sql), скопировать **всё** содержимое и вставить.
3. **Run**. Должно появиться `Success. No rows returned`.

Повторно этот файл в том же проекте не запускать: таблицы уже есть, будет ошибка «already exists».
Новые изменения базы приходят отдельными файлами в `supabase/migrations/`.

## 3. Адрес сайта

**Authentication** → **URL Configuration**:

- Site URL: адрес сайта на Vercel: `https://activity-balance-app.vercel.app`;
- Redirect URLs → **Add URL**: тот же адрес со звёздочками на конце, `https://activity-balance-app.vercel.app/**`.

Без этого после входа через Google браузер вернётся не туда.

## 4. Вход через Google

Понадобится Google Cloud (бесплатно).

1. В Supabase: **Authentication** → **Sign In / Providers** → **Google**. Скопировать строку
   **Callback URL** (вида `https://xxxx.supabase.co/auth/v1/callback`). Окно не закрывать.
2. Открыть https://console.cloud.google.com → вверху выбор проекта → **New project** → `Activity Balance` → Create.
3. Меню → **APIs & Services** → **OAuth consent screen** (или **Google Auth Platform**) → **Get started**:
   - App name: `Activity Balance`, support email — ваша почта;
   - Audience: **External**;
   - Contact email — ваша почта → Create.
4. **Audience** → **Publish app** → Confirm. Иначе войти смогут только адреса из списка тестировщиков.
   Проверка Google не нужна: приложение просит только имя и почту.
5. **Clients** (или **Credentials** → **Create credentials** → **OAuth client ID**):
   - Application type: **Web application**, Name: `Activity Balance web`;
   - Authorized redirect URIs → **Add URI** → вставить Callback URL из шага 1 → Create.
6. Google покажет **Client ID** и **Client secret**. Вставить оба в окно Google в Supabase,
   включить **Enable Sign in with Google** → **Save**.

Client secret остаётся в Supabase, в чат его присылать не нужно.

## 5. Вход по коду на почту (по желанию)

Запасной вход для тех, у кого нет Google.

1. **Authentication** → **Emails** → **Templates** → **Magic Link**.
2. В текст письма добавить строку: `Ваш код входа: {{ .Token }}` → Save.

Встроенная почта Supabase отправляет всего несколько писем в час на весь проект, поэтому для пилота
основной вход — Google. Если почтой будут входить многие, подключим свою почтовую службу.

## 6. Ключи для приложения

**Project Settings** → **API Keys** (или **Data API**). Нужны два значения:

- **Project URL** — вида `https://xxxx.supabase.co`;
- **anon public** (или **Publishable key**, начинается с `sb_publishable_`).

Эти два значения можно прислать в чат: они и так видны в коде сайта, а доступ к данным закрывают
правила базы. **Не присылать** `service_role` / **Secret key** и пароль базы: с ними можно прочитать всё.

Дальше разработчик (Claude) вписывает ключи в файл `.env` в репозитории, Vercel пересобирает сайт сам.
Вариант без репозитория: Vercel → проект → **Settings** → **Environment Variables** → добавить
`EXPO_PUBLIC_SUPABASE_URL` и `EXPO_PUBLIC_SUPABASE_ANON_KEY` → **Deployments** → **Redeploy**.

## 7. Проверка

1. Открыть сайт, выбрать «Я клиент», отметить галочки, **Войти через Google**.
2. Внизу «Дня» статус: «Синхронизировано …».
3. Во втором браузере (или на другом телефоне) войти другим Google-аккаунтом как «Я куратор»,
   создать код в кабинете.
4. Клиентом ввести код в Профиле → «Куратор». Куратору нажать «Обновить данные клиентов» — клиент
   появится в таблице.

## 8. Уведомления (по желанию)

Пуши в браузере и Telegram-бот: [notifications.md](notifications.md). Около 15 минут, из ключей нужен только токен бота.

## Что важно знать

- Бесплатный проект Supabase засыпает, если им не пользоваться 7 дней. Разбудить: зайти на supabase.com
  и нажать **Restore project**. Во время пилота это не случится.
- Фото-подсчёт через ИИ на сервере для пилота не нужен: он подключается отдельно
  (см. [photo-provider.md](photo-provider.md)).
- Бесплатный тариф не хранит резервные копии базы. Каждый пользователь может сохранить свою копию
  в Профиле («Резервная копия»).
