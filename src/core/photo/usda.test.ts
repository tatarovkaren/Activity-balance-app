import { describe, expect, it } from 'vitest';
import { loadUsda, parseUsda, usdaFoods } from './usda';
import { USDA_ROWS } from './usda.gen';
import { ruFromUsda } from './usda-ru';
import { FOODS } from './foods';
import { searchFoods } from './search';

const usda = parseUsda(USDA_ROWS);
const all = [...FOODS, ...usda];
const ids = (q: string) => searchFoods(q, all, 10).map((h) => h.food.id);

describe('база USDA', () => {
  it('6 000+ продуктов, id уникальные и не пересекаются с ядром', () => {
    expect(usda.length).toBeGreaterThan(6000);
    const set = new Set(all.map((f) => f.id));
    expect(set.size).toBe(all.length);
    for (const f of usda) {
      expect(f.source).toBe('usda');
      expect(f.p + f.f + f.c, f.nameEn).toBeLessThanOrEqual(101);
    }
  });

  it('у большинства продуктов ккал сходятся с БЖУ (данные разобраны без сдвига колонок)', () => {
    const ok = usda.filter((f) => f.kcal < 40 || Math.abs(f.kcal - (f.p * 4 + f.f * 9 + f.c * 4)) / f.kcal < 0.2);
    expect(ok.length / usda.length).toBeGreaterThan(0.9);
  });

  it('марки и детское питание не попали', () => {
    expect(usda.some((f) => /KELLOGG|McDONALD|pillsbury|oscar mayer/i.test(f.nameEn || ''))).toBe(false);
    expect(usda.some((f) => /^Babyfood/i.test(f.nameEn || ''))).toBe(false);
  });

  it('русское название из описания, непереведённое остаётся как есть', () => {
    expect(ruFromUsda('Beef, ground, raw')).toBe('Говядина, фарш, сырой');
    expect(ruFromUsda('Blueberries, canned, unknown part')).toBe('Голубика, консервированный, unknown part');
    expect(ruFromUsda('Abiyuch, raw')).toBeNull();
    const tr = usda.filter((f) => f.name !== f.nameEn).length;
    expect(tr / usda.length).toBeGreaterThan(0.9);
  });

  it('поиск: ядро выше USDA, по-русски и по-английски находится база', () => {
    expect(ids('гречка')[0]).toBe('buckwheat');
    expect(ids('говядина фарш').some((id) => id.startsWith('usda_'))).toBe(true);
    expect(ids('quinoa').length).toBeGreaterThan(1);
    expect(ids('брюссельская капуста').some((id) => id.startsWith('usda_'))).toBe(true);
  });

  it('загрузка отдельным куском — один раз', async () => {
    const a = await loadUsda();
    const b = await loadUsda();
    expect(a).toBe(b);
    expect(usdaFoods().length).toBe(usda.length);
  });
});
