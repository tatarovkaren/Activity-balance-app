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

/**
 * Маска даты по шаблону подсказки («ДД.ММ.ГГГГ» / «YYYY-MM-DD»): оставляет только цифры и
 * сама ставит разделители. Разделитель добавляется перед следующей цифрой, а не после
 * набранной группы, — поэтому стирание назад работает без «залипания» точки.
 * Если вставлен текст с буквами (например, «14 марта 1980»), он не трогается.
 */
export function maskDate(input: string, pattern: string): string {
  if (/[^\d\s.\-/]/.test(input)) return input;
  const digits = input.replace(/\D/g, '');
  const slots = pattern.replace(/[.\-/\s]/g, '').length;
  let out = '';
  let di = 0;
  for (const ch of pattern) {
    if (di >= digits.length || di >= slots) break;
    if (/[.\-/\s]/.test(ch)) out += ch;
    else out += digits[di++];
  }
  return out;
}
