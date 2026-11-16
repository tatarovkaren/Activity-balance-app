// Разбор чисел из полей ввода (без React — тестируется в vitest).

/**
 * Строка в число: принимает и запятую, и точку как десятичный знак. Пусто → undefined (нет данных).
 * Если в интерфейсе десятичная точка (английский), «12,000» читается как двенадцать тысяч.
 */
export function parseNum(s: string, decimal: string = ','): number | undefined {
  let x = s.replace(/\s/g, '');
  if (x.includes(',') && x.includes('.')) x = x.replace(/,/g, ''); // 1,234.5
  else if (decimal === '.' && /^-?\d{1,3}(,\d{3})+$/.test(x)) x = x.replace(/,/g, ''); // 12,000
  const v = parseFloat(x.replace(',', '.'));
  return Number.isFinite(v) ? v : undefined;
}
