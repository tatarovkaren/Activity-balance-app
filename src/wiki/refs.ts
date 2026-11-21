// Раздел «Wiki: баланс энергии» (Профиль → Wiki): библиографические данные источников.
// Данные не зависят от языка; суть и ограничения на каждом языке — src/i18n/wiki.*.ts (по id).
// Каждая запись сверена с PubMed (авторы, год, журнал, том, страницы, DOI, PMID) — 21.11.2026.

export type RefKind = 'rct' | 'trial' | 'meta' | 'review' | 'model' | 'obs';

export type WikiRef = {
  id: string;
  /** Авторы как в PubMed: до трёх, дальше «и др.» добавляет экран. */
  authors: string[];
  /** Всего авторов (для «и др.»). */
  nAuthors: number;
  year: number;
  title: string;
  journal: string;
  /** Том(выпуск):страницы. */
  cite: string;
  doi: string;
  pmid: string;
  kind: RefKind;
};

const R = (
  id: string,
  authors: string[],
  nAuthors: number,
  year: number,
  title: string,
  journal: string,
  cite: string,
  doi: string,
  pmid: string,
  kind: RefKind,
): WikiRef => ({ id, authors, nAuthors, year, title, journal, cite, doi, pmid, kind });

export const WIKI_REFS: WikiRef[] = [
  // 1. Динамика веса и метаболическая адаптация
  R('hall2011', ['Hall KD', 'Sacks G', 'Chandramohan D'], 7, 2011, 'Quantification of the effect of energy imbalance on bodyweight', 'Lancet', '378(9793):826–837', '10.1016/S0140-6736(11)60812-X', '21872751', 'model'),
  R('rosenbaum2010', ['Rosenbaum M', 'Leibel RL'], 2, 2010, 'Adaptive thermogenesis in humans', 'Int J Obes (Lond)', '34(Suppl 1):S47–S55', '10.1038/ijo.2010.184', '20935667', 'review'),
  R('fothergill2016', ['Fothergill E', 'Guo J', 'Howard L'], 11, 2016, 'Persistent metabolic adaptation 6 years after "The Biggest Loser" competition', 'Obesity (Silver Spring)', '24(8):1612–1619', '10.1002/oby.21538', '27136388', 'obs'),
  // 2. Калории или состав рациона
  R('hall2015', ['Hall KD', 'Bemis T', 'Brychta R'], 17, 2015, 'Calorie for calorie, dietary fat restriction results in more body fat loss than carbohydrate restriction in people with obesity', 'Cell Metab', '22(3):427–436', '10.1016/j.cmet.2015.07.021', '26278052', 'rct'),
  R('hall2016', ['Hall KD', 'Chen KY', 'Guo J'], 11, 2016, 'Energy expenditure and body composition changes after an isocaloric ketogenic diet in overweight and obese men', 'Am J Clin Nutr', '104(2):324–333', '10.3945/ajcn.116.133561', '27385608', 'trial'),
  R('hallguo2017', ['Hall KD', 'Guo J'], 2, 2017, 'Obesity energetics: body weight regulation and the effects of diet composition', 'Gastroenterology', '152(7):1718–1727.e3', '10.1053/j.gastro.2017.01.052', '28193517', 'review'),
  R('gardner2018', ['Gardner CD', 'Trepanowski JF', 'Del Gobbo LC'], 8, 2018, 'Effect of low-fat vs low-carbohydrate diet on 12-month weight loss in overweight adults and the association with genotype pattern or insulin secretion: the DIETFITS randomized clinical trial', 'JAMA', '319(7):667–679', '10.1001/jama.2018.0245', '29466592', 'rct'),
  R('hall2019', ['Hall KD', 'Ayuketah A', 'Brychta R'], 25, 2019, 'Ultra-processed diets cause excess calorie intake and weight gain: an inpatient randomized controlled trial of ad libitum food intake', 'Cell Metab', '30(1):67–77.e3', '10.1016/j.cmet.2019.05.008', '31105044', 'rct'),
  // 3. Белок, силовые и темп похудения
  R('morton2018', ['Morton RW', 'Murphy KT', 'McKellar SR'], 11, 2018, 'A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength in healthy adults', 'Br J Sports Med', '52(6):376–384', '10.1136/bjsports-2017-097608', '28698222', 'meta'),
  R('helms2014a', ['Helms ER', 'Zinn C', 'Rowlands DS'], 4, 2014, 'A systematic review of dietary protein during caloric restriction in resistance trained lean athletes: a case for higher intakes', 'Int J Sport Nutr Exerc Metab', '24(2):127–138', '10.1123/ijsnem.2013-0054', '24092765', 'review'),
  R('longland2016', ['Longland TM', 'Oikawa SY', 'Mitchell CJ'], 5, 2016, 'Higher compared with lower dietary protein during an energy deficit combined with intense exercise promotes greater lean mass gain and fat mass loss: a randomized trial', 'Am J Clin Nutr', '103(3):738–746', '10.3945/ajcn.115.119339', '26817506', 'rct'),
  R('garthe2011', ['Garthe I', 'Raastad T', 'Refsnes PE'], 5, 2011, 'Effect of two different weight-loss rates on body composition and strength and power-related performance in elite athletes', 'Int J Sport Nutr Exerc Metab', '21(2):97–104', '10.1123/ijsnem.21.2.97', '21558571', 'rct'),
  R('helms2014b', ['Helms ER', 'Aragon AA', 'Fitschen PJ'], 3, 2014, 'Evidence-based recommendations for natural bodybuilding contest preparation: nutrition and supplementation', 'J Int Soc Sports Nutr', '11:20', '10.1186/1550-2783-11-20', '24864135', 'review'),
  // 4. Профицит и набор массы
  R('bray2012', ['Bray GA', 'Smith SR', 'de Jonge L'], 10, 2012, 'Effect of dietary protein content on weight gain, energy expenditure, and body composition during overeating: a randomized controlled trial', 'JAMA', '307(1):47–55', '10.1001/jama.2011.1918', '22215165', 'rct'),
  R('leaf2017', ['Leaf A', 'Antonio J'], 2, 2017, 'The effects of overfeeding on body composition: the role of macronutrient composition — a narrative review', 'Int J Exerc Sci', '10(8):1275–1296', '10.70252/HPPF5281', '29399253', 'review'),
  R('slater2019', ['Slater GJ', 'Dieter BP', 'Marsh DJ'], 6, 2019, 'Is an energy surplus required to maximize skeletal muscle hypertrophy associated with resistance training?', 'Front Nutr', '6:131', '10.3389/fnut.2019.00131', '31482093', 'review'),
  // 5. Расход энергии и NEAT
  R('levine1999', ['Levine JA', 'Eberhardt NL', 'Jensen MD'], 3, 1999, 'Role of nonexercise activity thermogenesis in resistance to fat gain in humans', 'Science', '283(5399):212–214', '10.1126/science.283.5399.212', '9880251', 'trial'),
  R('levine2002', ['Levine JA'], 1, 2002, 'Non-exercise activity thermogenesis (NEAT)', 'Best Pract Res Clin Endocrinol Metab', '16(4):679–702', '10.1053/beem.2002.0227', '12468415', 'review'),
  R('pontzer2016', ['Pontzer H', 'Durazo-Arvizu R', 'Dugas LR'], 10, 2016, 'Constrained total energy expenditure and metabolic adaptation to physical activity in adult humans', 'Curr Biol', '26(3):410–417', '10.1016/j.cub.2015.12.046', '26832439', 'obs'),
  R('pontzer2021', ['Pontzer H', 'Yamada Y', 'Sagayama H'], 83, 2021, 'Daily energy expenditure through the human life course', 'Science', '373(6556):808–812', '10.1126/science.abe5017', '34385400', 'obs'),
];

/** Разделы Wiki и порядок источников в них. */
export const WIKI_SECTIONS: { id: string; refs: string[] }[] = [
  { id: 'adapt', refs: ['hall2011', 'rosenbaum2010', 'fothergill2016'] },
  { id: 'diet', refs: ['hall2015', 'hall2016', 'hallguo2017', 'gardner2018', 'hall2019'] },
  { id: 'protein', refs: ['morton2018', 'helms2014a', 'longland2016', 'garthe2011', 'helms2014b'] },
  { id: 'surplus', refs: ['bray2012', 'leaf2017', 'slater2019'] },
  { id: 'expend', refs: ['levine1999', 'levine2002', 'pontzer2016', 'pontzer2021'] },
];

export const refById = (id: string) => WIKI_REFS.find((r) => r.id === id);
export const doiUrl = (doi: string) => 'https://doi.org/' + doi;
export const pubmedUrl = (pmid: string) => 'https://pubmed.ncbi.nlm.nih.gov/' + pmid + '/';
