// "Energy balance wiki" (Profile → Wiki). Bibliography is in src/wiki/refs.ts; here are the key
// findings, limitations and the link to the app. Keys of items are ids from refs.ts.

export const wikiEn = {
  title: 'Wiki: energy balance',
  cardNote: 'Key studies on losing fat and gaining mass: short summaries, limitations and links to the original papers.',
  open: 'Open wiki',
  back: 'Back',
  intro:
    'Energy balance (CICO: Calories In, Calories Out) is the basis of body weight regulation. Modern science sees it not as static arithmetic but as a **dynamic system**: changing one side of the equation triggers responses on the other. Below are the studies behind this view and behind the numbers in Activity Balance.',
  checked: 'Every reference is checked against PubMed: authors, year, journal, volume, pages, DOI.',
  howTo: 'Tap a study to see its findings, limitations and links.',
  etAl: 'et al.',
  kinds: {
    rct: 'RCT',
    trial: 'Controlled study',
    meta: 'Meta-analysis',
    review: 'Review',
    model: 'Mathematical model',
    obs: 'Observational study',
  },
  limitsLabel: 'Limitations',
  inAppLabel: 'In the app',
  doi: 'DOI',
  pubmed: 'PubMed',

  sections: {
    adapt: {
      title: 'Weight dynamics and metabolic adaptation',
      note: 'Why weight loss slows down over time and how the body resists a deficit.',
    },
    diet: {
      title: 'Calories or diet composition',
      note: 'The carbohydrate-insulin model versus energy balance: what tightly controlled experiments showed.',
    },
    protein: {
      title: 'Protein, strength training and rate of loss',
      note: 'Whether lost weight comes from fat or muscle, and how to influence it.',
    },
    surplus: {
      title: 'Surplus and gaining mass',
      note: 'Where extra calories go and how big a surplus muscle growth needs.',
    },
    expend: {
      title: 'Energy expenditure and NEAT',
      note: 'What expenditure is made of (basal metabolism + thermic effect of food + exercise + NEAT) and how it changes.',
    },
  },

  items: {
    hall2011: {
      summary: [
        'A mathematical model of adult metabolism that accounts for the fact that **expenditure falls as weight falls**. So the weight curve is non-linear and approaches a new steady state.',
        'Weight responds slowly to a change in intake: about half of the final change takes **about a year**, nearly all of it about 3 years. The authors’ rule of thumb: a lasting change of 100 kJ (~24 kcal) a day eventually gives about 1 kg.',
        'It shows that the "3,500 kcal rule" (a 500 kcal/day deficit always gives −0.45 kg a week) **overestimates** long-term weight loss; in the first weeks it is still close.',
      ],
      limits: 'A model, not an experiment; the online NIH Body Weight Planner is built on it.',
      inApp: 'That is why the app estimates your real expenditure from the weight trend and recalculates the target weekly instead of keeping one number forever.',
    },
    rosenbaum2010: {
      summary: [
        'A review of "adaptive thermogenesis": after weight loss the body spends **less than its new size predicts**.',
        'Main links: lower **leptin**, lower thyroid and sympathetic activity, and **muscles working more efficiently** (more work for the same energy). This markedly lowers non-resting expenditure.',
        'Adaptation occurs in both lean people and people with obesity and lasts as long as the reduced weight is maintained; it is one reason why weight is easily regained.',
      ],
      limits: 'The review relies largely on the authors’ own inpatient studies with liquid diets; the size of the effect varies widely between people.',
      inApp: '',
    },
    fothergill2016: {
      summary: [
        '14 contestants of "The Biggest Loser" lost 58 kg on average in 30 weeks; resting metabolic rate (RMR) fell by ~610 kcal/day.',
        'Six years later most of the weight (41 kg) was regained, yet RMR stayed **~700 kcal/day below baseline**, and metabolic adaptation (the drop beyond what body composition and age explain) was **~500 kcal/day**.',
        'Those who kept off more weight also had more metabolic slowing: adaptation is a proportional but incomplete response to current efforts to keep weight down.',
      ],
      limits: 'A very small sample and extreme weight loss (intense exercise + severe deficit); apply the findings to a usual pace of 0.5–1% of body weight a week with care.',
      inApp: '',
    },
    hall2015: {
      summary: [
        '19 adults with obesity on a metabolic ward, crossover design: for 6 days calories were cut by 30% either from carbohydrate or from fat (same protein).',
        'Although insulin dropped with carbohydrate restriction, **less fat was lost** (~53 g/day) than with fat restriction (~89 g/day).',
        'The authors’ model predicts the difference nearly disappears over the long term as the body evens it out.',
      ],
      limits: 'Short (6 days); fat loss was calculated from fat oxidation balance, not measured directly.',
      inApp: '',
    },
    hall2016: {
      summary: [
        '17 men with overweight on a metabolic ward: 4 weeks of a high-carbohydrate diet, then 4 weeks of an **isocaloric ketogenic** diet with the same protein.',
        'On keto, expenditure rose by only **57 kcal/day** (metabolic chamber) and by ~151 kcal/day (doubly labeled water), near the limit of what can be measured.',
        'Fat loss on keto **did not speed up, it slowed**, and loss of fat-free mass rose slightly. The "metabolic advantage" predicted by the carbohydrate-insulin model was not found.',
      ],
      limits: 'Not randomized: keto always came second; 4 weeks long.',
      inApp: '',
    },
    hallguo2017: {
      summary: [
        'A review of body weight regulation (static, settling point and set point models) with a **meta-analysis of 32 controlled feeding studies** swapping carbohydrate for fat at equal calories.',
        'At equal calories and protein, expenditure (+26 kcal/day) and fat loss (+16 g/day) were **slightly greater on lower-fat** diets: a tiny difference, and not in favour of low-carb.',
        'Practical takeaway: energy balance decides, and real-life differences between diets come mainly from **how easy they are to stick to** and how they affect appetite.',
      ],
      limits: 'A review with a meta-analysis of short, tightly controlled studies; it does not directly describe long-term free-living life.',
      inApp: '',
    },
    gardner2018: {
      summary: [
        'The DIETFITS RCT: 609 adults, 12 months, **healthy low-fat** versus **healthy low-carbohydrate** diet (no calorie counting, focus on food quality).',
        'Weight loss after a year was almost the same: −5.3 and −6.0 kg, not a significant difference.',
        'Neither genotype nor baseline insulin secretion **predicted** which diet would suit a person better.',
      ],
      limits: 'Free-living conditions: intake was assessed by recalls, and individual results varied widely.',
      inApp: 'That is why the app sets targets for calories and protein and leaves the split between fat and carbohydrate up to you.',
    },
    hall2019: {
      summary: [
        '20 adults at the NIH Clinical Center spent 2 weeks on an **ultra-processed** and 2 weeks on an **unprocessed** diet (randomized crossover) and ate as much as they wanted.',
        'The meals offered were matched for calories, energy density, macronutrients, sugar, salt and fibre. Still, people ate **~500 kcal/day more** on the ultra-processed diet (from carbohydrate and fat, not protein).',
        'In 2 weeks weight went up 0.9 kg on ultra-processed food and down 0.9 kg on unprocessed food.',
      ],
      limits: 'Small sample and short duration. The mechanism is unknown: people ate noticeably faster; hypotheses include palatability and energy density of food excluding drinks.',
      inApp: '',
    },
    morton2018: {
      summary: [
        'A systematic review and meta-analysis of 49 RCTs (1,863 people): protein supplements during resistance training of 6 weeks or more **increase gains in strength and fat-free mass**.',
        'The benefit levels off at a total intake of about **1.6 g/kg a day** (95% CI 1.03–2.20 g/kg); more protein adds no further mass.',
        'The effect is smaller with age and larger in trained people.',
      ],
      limits: 'Mostly studies at maintenance or in a surplus; in a deficit protein needs are higher (see Helms 2014).',
      inApp: '',
    },
    helms2014a: {
      summary: [
        'A systematic review of studies in lean resistance-trained people during a **calorie deficit**.',
        'Conclusion: protein needs are likely **2.3–3.1 g per kg of fat-free mass**, higher with a deeper deficit and lower body fat.',
      ],
      limits: 'Only 6 studies (13 groups), small samples.',
      inApp: 'That is why the app calculates protein from lean (fat-free) mass by default and lets you set it manually.',
    },
    longland2016: {
      summary: [
        'An RCT: 40 young men for 4 weeks on a **~40% deficit**, resistance plus interval training 6 days a week; protein 2.4 or 1.2 g/kg.',
        'In the 2.4 g/kg group fat-free mass **rose by 1.2 kg** (versus 0.1 kg) and more fat was lost: −4.8 versus −3.5 kg.',
        'A telling example of **recomposition**: with high protein and a heavy training load you can lose fat and gain fat-free mass at the same time, even in a large deficit.',
      ],
      limits: '4 weeks, young men, untrained or with little experience; fat-free mass is not only muscle (water, glycogen).',
      inApp: '',
    },
    garthe2011: {
      summary: [
        'An RCT: 24 athletes doing resistance training 4 times a week lost weight slowly (planned 0.7% of body weight a week) or fast (planned 1.4% a week; about 1% in practice).',
        'Weight fell equally (~5.5%), but at the slow pace fat-free mass **rose by 2.1%** and strength improved more, while at the fast pace fat-free mass did not change.',
        'The authors advise athletes who want to keep and build muscle to lose **about 0.7% of body weight a week**.',
      ],
      limits: 'A small sample of trained athletes.',
      inApp: 'That is why the pace in the app is set as a percentage of body weight per week.',
    },
    helms2014b: {
      summary: [
        'An evidence review of nutrition for natural bodybuilding contest preparation.',
        'Recommendations: lose **0.5–1% of body weight a week**, protein 2.3–3.1 g/kg of fat-free mass, fat 15–30% of calories, the rest from carbohydrate.',
        'Meal frequency and timing have little effect on fat loss or muscle retention.',
      ],
      limits: 'Recommendations for lean trained people before a contest; for ordinary weight loss they are a guide, not a rule.',
      inApp: '',
    },
    bray2012: {
      summary: [
        'An inpatient RCT: 25 people **overate by ~40%** (≈ +950 kcal/day) for 8 weeks on low (5%), normal (15%) or high (25%) protein.',
        'Fat gain was **the same in all groups**: extra calories determined it. Protein affected something else: with normal and high protein, fat-free mass and resting expenditure went up; with low protein they did not, and weight rose less.',
      ],
      limits: 'No exercise; inpatient, 8 weeks.',
      inApp: '',
    },
    leaf2017: {
      summary: [
        'A narrative (non-systematic) review of overfeeding studies with different macronutrients.',
        'Extra calories **from protein** did not increase body fat in several small studies in trained people, unlike extra fat or carbohydrate. Possible reasons are the high thermic effect of protein and more muscle protein synthesis.',
      ],
      limits: 'The key "protein overfeeding" studies are small, short, largely by the authors themselves, with intake from food diaries. The strict Bray 2012 RCT found fat gain was the same at any protein level.',
      inApp: '',
    },
    slater2019: {
      summary: [
        'A review: is a surplus needed to maximize muscle gain with resistance training, and how big?',
        'A surplus does boost anabolism, but **the optimal size is unknown** and has not been tested in people who train; textbook estimates from the energy in the tissue itself miss this.',
        'In practice the authors suggest a **moderate** surplus adjusted for experience: advanced lifters gain muscle more slowly, and a large surplus goes mostly to fat.',
      ],
      limits: 'A review, not a study; the numbers are practical guides.',
      inApp: '',
    },
    levine1999: {
      summary: [
        '16 non-obese people ate **1,000 kcal/day above** their maintenance needs for 8 weeks.',
        'Two thirds of the rise in expenditure came from **NEAT**: fidgeting, posture, everyday movement. Changes in NEAT explained the **10-fold** difference in fat storage between people.',
      ],
      limits: 'Small sample, overfeeding only.',
      inApp: '',
    },
    levine2002: {
      summary: [
        'A review of NEAT: all energy spent on movement other than sleeping, eating and sport-like exercise (walking, work, chores, gesturing).',
        'NEAT is **most of non-resting expenditure**; it rises with overfeeding and falls with underfeeding. By the author’s estimate it can differ by up to ~2,000 kcal/day between people of similar size, mainly because of occupation and lifestyle (desk job versus manual labour).',
      ],
      limits: 'Levine also published a 2004 paper with the same title in Nutrition Reviews; this reference is the 2002 review.',
      inApp: 'That is why the app counts steps separately: they are the main measurable part of NEAT.',
    },
    pontzer2016: {
      summary: [
        '332 adults from 5 countries: total expenditure (doubly labeled water) was compared with activity from accelerometers.',
        'After adjusting for body size and composition, expenditure rises with activity at **low and moderate** levels and **plateaus** at high levels, supporting the Constrained total energy expenditure model.',
        'The authors suggest that at high activity the body cuts other costs (for example immune or reproductive), but in this paper that is a **hypothesis**, not a measured fact.',
      ],
      limits: 'An observational cross-sectional study: it compares different people, not one person before and after training more.',
      inApp: 'That is why the app does not add workout calories one-to-one forever but checks expenditure against the real weight trend.',
    },
    pontzer2021: {
      summary: [
        'An international database of expenditure measured by doubly labeled water: about 6,400 people aged 8 days to 95 years.',
        'Adjusted for fat-free mass, expenditure is **stable from 20 to 60** (even in pregnancy) and declines after 60.',
      ],
      limits: 'Population averages; an individual’s expenditure depends on body size, composition and activity.',
      inApp: '',
    },
  },

  conclusionsTitle: 'Key takeaways',
  conclusions: [
    {
      aspect: 'Conservation of energy',
      text: 'Body energy stores change by ΔE = intake − expenditure, but both sides **depend on each other**: in a deficit expenditure falls, in a surplus it rises. Daily weight can jump 1–2 kg from water and glycogen, so the trend is what matters.',
    },
    {
      aspect: 'Role of macronutrients',
      text: 'Calories determine the change in weight. **Protein and resistance training** determine what it is made of: fat or muscle. The fat-to-carbohydrate split hardly matters at equal calories and protein.',
    },
    {
      aspect: 'Metabolic adaptation',
      text: 'When you lose weight, expenditure falls more than the lost mass explains: basal metabolism and hormones drop, muscles become more efficient, and many people move less (NEAT). The share of each varies between people.',
    },
    {
      aspect: 'Physical activity',
      text: 'Exercise matters for health and keeping muscle. But total expenditure rises less than expected at high activity, and NEAT varies a lot between people, so expenditure is more reliable when measured from facts rather than formulas.',
    },
    {
      aspect: 'Pace',
      text: 'To keep muscle, a sensible pace is **0.5–1% of body weight a week**, with higher protein than usual in a deficit.',
    },
    {
      aspect: 'Ultra-processed food',
      text: 'In a strict RCT (Hall, Cell Metabolism, 2019) an ultra-processed diet led to spontaneous overeating of ~500 kcal/day with the same calories and macronutrients offered. The mechanism is not yet known.',
    },
  ],

  disclaimer:
    'This is a popular science overview, not medical advice. If you have a medical condition, are pregnant or your weight changes sharply, talk to a doctor.',
};
