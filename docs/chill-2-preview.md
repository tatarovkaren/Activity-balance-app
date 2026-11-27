# Chill 2.0 — UX Preview (Issue #61)

## Safety
This is an **isolated static HTML UX pilot** at `/chill2-preview.html`. It is **not** the app's Production Chill. It contains no external scripts, imports, service workers, localStorage, cookies, authentication, Supabase, API calls or file upload inputs. All sample and entered data are synthetic / in-memory and disappear on reload. Do **not** use sensitive personal data in the pilot; it is unnecessary.

The main application remains version 0.45.0 on Production. **Only open the explicit `/chill2-preview.html` URL on the Vercel Preview branch.** The branch's standard `/` application still shares some of the normal application code and may refer to existing Supabase configuration; it is outside the pilot. No backend migrations, server functions or user data changes were made.

## Approved concept (27.11.2026)
1. Results first, with clear empty/partial/full history states and no invented trend from one weight.
2. Exactly one prominent **+ Добавить** action, then Weight, Food, Activity, Body measurements, Wellbeing.
3. FatSecret importer UX: supported types CSV from website / text PDF report from mobile app, visual examples **before** picking a file, validation, mock preview of date range/duplicates, explicit confirmation. In this pilot it is a *simulation* and does not read actual files; no screenshots supported.
4. All inputs optional, absent inputs not errors. Critical kcal/macros mismatch warning is demonstrated, not hidden.

## Scenarios to test on Xiaomi Fold
- Open the explicit Preview URL. Confirm the yellow safety banner; do not enter real diary data.
- Switch "Первый вход / Мало данных / Есть история": no fake deltas when insufficient weight readings.
- Click **+ Добавить → Вес** and enter a synthetic value. Confirm, cancel, refresh and see that state is not persisted.
- Open **Питание → FatSecret**. Try the supported CSV, PDF and unsupported screenshot examples. Check the error text, preview and confirmation stage.
- Open Activity, Wellbeing, Body measurements; cancel is harmless; empty required value errors are concise.
- Unfold/fold the Xiaomi. Check tap targets, keyboard, scrolling, 320px through expanded window.
- Compare number of taps and confusion with 0.45.0 Chill and collect qualitative feedback.

## Restrictions
This branch contains only a static UX HTML artifact, a supporting unit test and documentation. Full integration with data, real FatSecret validation / deduplication, server-isolated Preview identity and product release must be separately approved following UX review. Do not merge the Draft PR. Do not mark Issue #58 or #61 finished solely from this concept.
