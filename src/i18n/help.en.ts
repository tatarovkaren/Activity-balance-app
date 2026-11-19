// Help & FAQ (Profile → Help & FAQ). Same structure and section ids as help.ru.ts.

import type { helpRu } from './help.ru';

export const helpEn: typeof helpRu = {
  title: 'Help & FAQ',
  cardNote: 'How to keep your log, what the numbers mean, and answers to common questions.',
  open: 'Open help',
  back: 'Back',
  motto:
    'Everything in this universe obeys the law of conservation of energy: eat more than you burn and you store it; burn more than you eat and you lose weight. Activity Balance is your assistant in managing your energy balance.',
  intro:
    'Activity Balance shows how much energy you really burn: it compares what you eat with how your weight changes and refines your burn every day. The more complete your log, the more accurate the numbers.',

  quickTitle: 'Get started in 5 minutes',
  quick: [
    'On first launch, fill in a short form: sex, date of birth, height, weight and goal.',
    'Choose a starting target: deficit, maintenance or surplus. The app works out your calorie and macro target. You can change all of it later in **Profile**.',
    'Every morning, enter your fasted weight on the **Day** tab.',
    'During the day, add calories and macros (by hand or imported from FatSecret), steps and your workout.',
    'After 2–4 weeks, open the **Burn** tab: it shows your actual burn instead of the formula.',
  ],

  guideTitle: 'How to use the app',
  guideNote: 'Tap a section to see a picture and explanations.',
  shotCaption: 'Example with demo data',
  guide: [
    {
      id: 'start',
      title: 'First launch',
      text: [
        'Choose the language at the top: Russian, English or same as system.',
        'Tick the three required boxes: terms of service, privacy policy and consent to data processing. The newsletter box is optional.',
        'Sign in with Google, Apple, Yandex ID, VK ID or email to keep your data in the cloud and on all your devices. Before signing in, choose "I’m a client" or "I’m a coach": a coach goes straight to the dashboard.',
        'You can start without signing in: your data then stays on this device only. "View demo" opens the app with made-up data.',
      ],
    },
    {
      id: 'onboard',
      title: 'First-launch form',
      text: [
        'Enter your sex, name, date of birth, height, current weight and goal. Type the date as digits only: separators appear by themselves, and your age is shown below.',
        'The burn formulas need this data: age, height and weight change the result by hundreds of kcal.',
        'In the second step, choose a starting target: mode and pace. You can skip it and pick a target later in Profile, or your coach can suggest one.',
      ],
    },
    {
      id: 'profile',
      title: 'Profile and starting data',
      text: [
        'Sex changes the formulas: basal metabolism, body fat norms and a hip measurement for women.',
        'Date of birth, height and goal weight are needed to estimate your burn and forecast your goal date. You can change any field at any time.',
        '"Step goal" is your daily step target, shown as a bar on the Day tab.',
        'Body measurement frequency sets how often the app reminds you to measure your neck, waist (and hips).',
        '"How I log food": if you weigh grains dry and meat raw, photo estimates convert portions to raw weight.',
        'At the top of Profile is the **app mode**: basic shows only the essentials, advanced shows every metric and fine-tuning.',
      ],
    },
    {
      id: 'goal',
      title: 'Calorie and macro target',
      text: [
        'Pick a mode: **deficit** (lose weight), **maintenance** or **surplus** (gain).',
        'Pace is set as a percentage of body weight per week. In advanced mode you can set your own pace or "by date" if a specific date matters.',
        'Target = actual burn ± pace. It is the same for every day of the week and is recalculated on Mondays, when you change the mode, or with "Recalculate now".',
        'Protein: until you have a body fat measurement it is per kg of body weight (1.6 g by default); after one, per kg of lean mass. In advanced mode you can set the factor by hand, and the field label shows what it is based on. Fat is 0.8 g per kg of body weight, carbs are the remaining calories.',
        'You can also set the target by hand in "Custom calorie target, kcal a day". Protein and fat are calculated as usual, carbs are the rest, and the pace and goal date come from the gap to your burn. Clear the field or pick a pace to go back to the calculation.',
        'The target never drops below a safe minimum: 1500 kcal for men and 1200 for women, with at least 50 g of carbs. If the target had to be raised, the app tells you.',
        'If your coach suggests a different target, a card appears at the top of Profile: accept or decline it.',
      ],
    },
    {
      id: 'day',
      title: 'Daily log: weight, steps, food',
      text: [
        'The ‹ › arrows at the top switch days, and the calendar button lets you jump to any date (days with entries are marked with a dot). You can fill in past days too.',
        '**Morning weight**: fasted, after the toilet. Below it you see the change since yesterday and the weekly average.',
        '**Steps**: from your phone or tracker, for the whole day.',
        '**Food**: enter calories and macros by hand, tap "Import FatSecret", or tap "📷 Snap a meal" and pick the meal. If calories are empty, they are calculated from macros.',
        'The fields show "actual / target": the colour tells you whether you are within your target.',
      ],
    },
    {
      id: 'workout',
      title: 'Workout and energy balance',
      text: [
        'Choose **Cardio** or **Strength**: the calculation depends on it. In the field below, add a name such as "running", "elliptical" or "legs + back", so your coach knows what you did.',
        'Enter the duration and average heart rate. Strength is counted by load and time, cardio by heart rate.',
        '"Workout steps" is for on-foot cardio only. The app subtracts them from your daily steps so the same effort is not counted twice. If the field is empty, steps are estimated from your usual pace.',
        'The **Energy balance** card shows what you ate and burned today and over 7 days, and the expected weight change per week.',
      ],
    },
    {
      id: 'comment',
      title: 'Wellbeing, unusual days and reports',
      text: [
        'Use the comment for sleep, mood or anything unusual. Wellbeing is a score from 1 to 10.',
        'An **unusual day** is a trip, a feast, illness, an incomplete log (and the cycle for women). Such days and the 2–3 days after them are left out of the burn estimate, so water and salt are not mistaken for fat.',
        'The app highlights suspicious days on its own (a weight jump or very few calories). If the day was normal, tap "include again".',
        '"Send report to coach" sends a summary of the day, "Report as image" saves it as a picture.',
      ],
    },
    {
      id: 'fact',
      title: 'Actual burn',
      text: [
        'At first the burn comes from a formula. As weigh-ins and logged days add up, the app compares what you ate with your weight trend and moves the estimate towards your real burn.',
        '**Reliability** shows how far you can trust the number: it grows with weigh-ins and logged days and drops with gaps and many unusual days.',
        'In advanced mode this screen also shows reliability and the days left out of the estimate: you can include any of them again or exclude it once more.',
        '**Goal forecast** is the date you will reach your goal weight at the current pace.',
      ],
    },
    {
      id: 'charts',
      title: 'Charts',
      text: [
        'Choose a period: week, month, 3 months, all time or custom dates.',
        'Weight and trend: dots are your weigh-ins, the line is the trend without unusual days.',
        'Eaten and burned, expected versus actual weight change, and body fat: every chart can be saved as PNG or PDF.',
        'If the actual weight line runs well above the expected one, your log is probably incomplete or the formula overestimates your burn.',
      ],
    },
    {
      id: 'photo',
      title: 'Meal photo (beta)',
      text: [
        'Measure your hand once (Profile → Hand for photo estimates): it serves as a ruler. You can check it with a photo of your palm next to a bank card.',
        'In the log, tap "📷 Snap a meal" on the food card and pick the meal: breakfast, lunch, dinner or snack.',
        'Take two shots: **from above** and **from the side at 30–45°**, with your hand next to the plate at the same level as the food. For soup, stand your fist on its edge next to the bowl and shoot from the side so the level shows. Everything on the table can go in one shot: it is one meal.',
        'The app shows a draft: foods, **weight in grams**, kcal and macros with an honest range (±15–20%, ±30% for a poor photo). Fried and restaurant food gets +50–100 kcal of hidden oil.',
        'Correct the grams if you know better and tap "Save". The entry is marked **"from photo"**, adds to what is already logged for the day without overwriting anything, and goes straight into actual expenditure and macro targets. No need to copy it into FatSecret.',
        'Your gram corrections are saved: they show whether estimates run high or low, and later drive a personal adjustment. If you weighed the portion, enter the real weight to save a personal reference.',
        'Free plan: 2 photo meals a day; Premium: no limit. Without a connected server the demo estimate runs: it shows the whole flow but does not analyse the photo.',
      ],
    },
    {
      id: 'import',
      title: 'Importing data and backups',
      text: [
        '**FatSecret**: export your food diary as CSV or a PDF report and tap "Import FatSecret". You can load one day or a whole period. Empty days are skipped, and days you filled in by hand are not overwritten. PDF is read in the web version for now.',
        '**Weight history**: a CSV with "date; weight" rows from smart scales, Google Fit or Excel. Days already logged stay as they are.',
        '**Export data** saves all your records to a file, and "Import backup" brings them back without overwriting anything. If there was no backup for 7 days, the Day screen shows a reminder with a "Save" button; you can turn it off here, in "Data sources".',
        'Health Connect, Apple Health, Garmin and Huawei will arrive with the mobile app.',
      ],
    },
    {
      id: 'curator',
      title: 'Working with a coach',
      text: [
        'Each coach has a personal code: their surname in Latin letters plus a number, e.g. **IVANOV0001**. Enter it in the sign-up questionnaire or later in the "Coach" card in Profile. If your coach sent an invite link, the code fills in by itself.',
        'While your coach works with you, **Premium is free for you**: your coach pays for it with their plan.',
        'Choose what your coach sees: food, workouts, weight and measurements, comments, meal photos. You can change or revoke access at any time.',
        'Your coach sees your log and reports, can comment on a day and suggest a new target, which you then accept or decline. A coach comment appears on the Day screen above your own comment.',
        'For your coach to see your log from their phone, sign in (Google or email). Without signing in, data stays on your device only.',
        'When coaching ends, your log and all your history stay with you, and Profile shows an offer of Premium at a discount.',
      ],
    },
    {
      id: 'notify',
      title: 'Notifications: push and Telegram',
      text: [
        'Profile → **Notifications**: choose what to be reminded about: morning weigh-in, diary not filled in, coach comment, backup. You can change the time of the morning and evening reminders; it is your local time.',
        '**Browser push**: tap “Turn on” and allow notifications. On Android and computers it works right away. On iPhone and iPad it works only in the app added to the Home Screen (Safari → Share → “Add to Home Screen”), iOS 16.4 or later: open Activity Balance from the icon and turn push on there.',
        '**Telegram**: tap “Connect”, our bot opens in Telegram, tap “Start” there. Come back to the app and tap “Check”. You can disconnect here or by sending /stop to the bot.',
        '“Send a test” checks that everything arrives. Notifications contain none of your numbers or comment texts, only a reason to open the app.',
        'Notifications work once you sign in. Push is turned on separately on each device, Telegram once per account.',
      ],
    },
    {
      id: 'settings',
      title: 'Mode, language, theme and account',
      text: [
        '**App mode**: basic shows weight, steps, food, workouts and the day summary; advanced adds the burn breakdown, reliability, excluded days, custom pace, protein factor and BMR formula. The calculation is the same in both.',
        'Language: Russian, English or same as system. Dates, numbers and the coach report follow your choice.',
        'Theme: light, dark or same as system.',
        'The "Account and data" card holds your consents, documents, the coach dashboard and sign-out.',
      ],
    },
  ],

  faqTitle: 'Frequently asked questions',
  faq: [
    {
      q: 'Why does my actual burn differ from the formula?',
      a: 'A formula gives an average for people of your sex, age, height and weight. Real metabolism varies, and trackers and food logs are never perfect. Actual burn is based on how your weight really changes with your food, so it is more accurate. A difference of 5–15% is common.',
    },
    {
      q: 'How much data do I need before I can trust the numbers?',
      a: 'A weight trend appears after 8 weigh-ins on normal days spanning at least 15 days. Full trust in the actual burn comes with 14 weigh-ins and 20 days with calories in the last 28 days. Until then the app blends the formula and the actual data smoothly.',
    },
    {
      q: 'When should I weigh myself?',
      a: 'In the morning, fasted, after the toilet, in the same clothes. Daytime weight is usually 0.5–1.5 kg higher and confuses the trend. You do not have to weigh in every day, but the more often you do, the faster your burn is refined.',
    },
    {
      q: 'My weight went up by a kilo overnight. Did I gain fat?',
      a: 'Almost certainly not: water, salt and gut contents shift that much. Gaining a kilo of fat takes about 7,000 kcal above your burn. Watch the trend, not a single weigh-in. If the day was special (a feast, a trip), mark it as unusual.',
    },
    {
      q: 'What happens if I skip a few days?',
      a: 'Nothing breaks. Skipped days are simply not counted, but reliability drops, and the app points out gaps of 3 days or more. If you only logged part of a day, mark it as "incomplete log".',
    },
    {
      q: 'Why enter workout steps separately?',
      a: 'Steps on a treadmill or elliptical are already part of your daily steps. Without subtracting them the workout would be counted twice. Enter the number from your tracker; if you do not have it, the app estimates steps from your usual pace.',
    },
    {
      q: 'What is the difference between basic and advanced mode?',
      a: 'Only what is shown on screen. The burn and target calculations are the same, and your coach sees everything. Basic is a good start without extra numbers; advanced is for when you want the burn breakdown, reliability and excluded days, and fine control over your target. Switch it at the top of Profile.',
    },
    {
      q: 'Why is strength training not counted by heart rate?',
      a: 'In strength training your heart rate jumps with effort and rests, and a heart-rate estimate greatly overstates the burn. So strength is counted by time and load, and heart rate is used for cardio.',
    },
    {
      q: 'How do I bring over my FatSecret diary?',
      a: 'In FatSecret, export your food diary for the period you need as CSV or a PDF report, then tap "Import FatSecret" on the Day tab or in Profile. All days load at once, empty days are skipped, and data you already entered is not overwritten. PDF is read in the web version only for now.',
    },
    {
      q: 'When does my calorie and macro target change?',
      a: 'On Mondays, when you change the mode or pace, and when you tap "Recalculate now". The target stays the same during the week so it does not jump every day.',
    },
    {
      q: 'How is my protein target calculated?',
      a: 'Until you have a body fat measurement, per kg of body weight: 1.6 g by default, your own factor from 1.0 to 2.5 g. After a measurement, per kg of lean mass (without fat): 2.0 g by default in a deficit and 1.8 g for maintenance and gain, your own from 1.6 to 3.0 g. The field label in Profile shows which one is used now.',
    },
    {
      q: 'Can I set the calorie target by hand?',
      a: 'Yes: Profile → "Calorie and macro target" → "Custom calorie target, kcal a day" (1000 to 5000). Protein and fat are calculated as usual, carbs are the rest. The app works out the pace and goal date forecast from the gap between the target and your burn. It never goes below the safe minimum (1500 kcal for men, 1200 for women). Clear the field or pick a pace to go back to the calculation.',
    },
    {
      q: 'What does my coach see? How do I disconnect them?',
      a: 'Your coach sees only what you allow in the "Coach" card: food, workouts and steps, weight and measurements, comments, meal photos (off by default). "Disconnect coach" closes access immediately.',
    },
    {
      q: 'My coach’s code does not work. What should I do?',
      a: 'The code uses Latin letters, e.g. IVANOV0001; case, spaces and hyphens do not matter. If the app says your coach has no free seats, every seat on their plan is taken: ask your coach to free a seat or move to a bigger plan.',
    },
    {
      q: 'What happens when coaching ends?',
      a: 'You stay in the app with all your data, and your plan goes back to your own. Profile shows an offer: Premium at −30% for 3 months, valid for 30 days. Payments are not connected yet; nothing is charged during the pilot.',
    },
    {
      q: 'I am a coach. Where is my code and how many clients can I have?',
      a: 'At the bottom of the coach dashboard: enter your surname and the system issues a code with a system-wide number and an invite link. Seats: Trial 2, Start 10, Pro 50. The same place lists everyone who joined with your code: you can end coaching or remove a client, and the seat is freed. Client logs refresh when you open the dashboard and with the "Refresh client data" button. For every 3 Premium payments by former clients you get a month of your plan free.',
    },
    {
      q: 'Why do notifications not arrive on my iPhone?',
      a: 'On iPhone and iPad, push arrives only in the app added to the Home Screen and only on iOS 16.4 or later. Open the site in Safari → Share → “Add to Home Screen”, launch Activity Balance from the icon and turn push on in Profile → “Notifications”. If that does not work, connect Telegram: it works on any phone.',
    },
    {
      q: 'A reminder came at the wrong time. Why?',
      a: 'Reminder times are local, using your phone’s time zone, shown under the list of reminders. After moving, open Profile and the time zone updates itself. The server checks reminders every 5 minutes, so they may arrive a few minutes late. If the weight or calories for the day are already entered, the reminder does not come.',
    },
    {
      q: 'Where is my data stored?',
      a: 'Without signing in, data is stored on this device only: clearing the browser deletes it, so use "Export data" from time to time. After you sign in, data is kept in the cloud and available on all your devices.',
    },
    {
      q: 'How accurate are photo estimates?',
      a: 'They are a draft: usually ±15–20%, up to ±30% for a poor photo. Two shots with your hand next to the plate give the best result. Hidden oil in fried and restaurant food adds another 50–100 kcal. Only what you confirm goes into your log.',
    },
    {
      q: 'Is this medical advice?',
      a: 'No. All numbers are estimates from formulas and your weight trend. If you have a medical condition, are pregnant or your weight changes sharply, talk to a doctor.',
    },
  ],

  moreTitle: 'Did not find an answer?',
  more: 'Write to your coach in the comment in today’s report. Documents on data processing are in the "Account and data" card.',
};
