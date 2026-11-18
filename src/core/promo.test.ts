import { describe, expect, it } from 'vitest';
import {
  addReferral,
  checkCode,
  codeFromUrl,
  curatorBonus,
  inviteLink,
  isCode,
  latinSurname,
  makeCode,
  makeOffer,
  markPaid,
  normalizeCode,
  offerOpen,
  seatsLeft,
  setReferralStatus,
  type CuratorAccount,
} from './promo';
import { demoCuratorAccount, DEMO_CURATOR_SEQ } from './demo';

const T = '2026-11-18';
const acc = (plan: CuratorAccount['plan'], active: number): CuratorAccount => ({
  surname: 'Иванов',
  displayName: 'Пётр Иванов',
  code: 'IVANOV0001',
  plan,
  createdAt: T,
  referrals: Array.from({ length: active }, (_, i) => ({ id: 'c' + i, name: 'К' + i, linkedAt: T, status: 'active' as const })),
});

describe('код куратора: фамилия латиницей + сквозной номер', () => {
  it('транслитерация фамилий', () => {
    expect(latinSurname('Иванов')).toBe('IVANOV');
    expect(latinSurname('Смирнова')).toBe('SMIRNOVA');
    expect(latinSurname('Щукина')).toBe('SHCHUKINA');
    expect(latinSurname('Юдина')).toBe('YUDINA');
    expect(latinSurname('Хайруллин')).toBe('KHAYRULLIN');
    expect(latinSurname('Мельников-Печерский')).toBe('MELNIKOVPECH'); // обрезано до 12 букв
    expect(latinSurname('Müller')).toBe('MULLER');
    expect(latinSurname(" O'Brien ")).toBe('OBRIEN');
  });
  it('номер — 4 цифры с нулями, дальше просто длиннее', () => {
    expect(makeCode('Иванов', 1)).toBe('IVANOV0001');
    expect(makeCode('Smirnova', 42)).toBe('SMIRNOVA0042');
    expect(makeCode('Ли', 12345)).toBe('LI12345');
    expect(() => makeCode('Ж', 1)).not.toThrow(); // ZH — уже 2 буквы
    expect(() => makeCode('Q', 1)).toThrow();
    expect(() => makeCode('Ivanov', 0)).toThrow();
  });
  it('ввод клиента приводится к коду', () => {
    expect(normalizeCode(' ivanov 0001 ')).toBe('IVANOV0001');
    expect(normalizeCode('Иванов0001')).toBe('IVANOV0001');
    expect(normalizeCode('IVANOV-0001')).toBe('IVANOV0001');
    expect(normalizeCode('https://app.example/#/invite/SMIRNOVA0042')).toBe('SMIRNOVA0042');
    expect(normalizeCode('https://app.example/?code=smirnova0042')).toBe('SMIRNOVA0042');
    expect(isCode('IVANOV0001')).toBe(true);
    expect(isCode('FIT-2048')).toBe(false);
    expect(isCode('IVANOV01')).toBe(false);
  });
  it('ссылка-приглашение туда и обратно', () => {
    const l = inviteLink('https://app.example/demo#/legal/terms', 'IVANOV0001');
    expect(l).toBe('https://app.example/demo#/invite/IVANOV0001');
    expect(codeFromUrl(l)).toBe('IVANOV0001');
    expect(codeFromUrl('https://app.example/#/legal/terms')).toBeNull();
  });
});

describe('места в тарифе и привязка по коду', () => {
  it('код работает, только пока есть свободные места', () => {
    expect(seatsLeft(acc('start', 9))).toBe(1);
    expect(checkCode('IVANOV0001', acc('start', 9), 'me')).toBeNull();
    expect(checkCode('IVANOV0001', acc('start', 10), 'me')).toBe('noSeats');
    expect(checkCode('IVANOV0001', acc('trial', 2), 'me')).toBe('noSeats');
    expect(checkCode('IVANOV0001', acc('pro', 49), 'me')).toBeNull();
  });
  it('ошибки кода', () => {
    expect(checkCode('IVANOV01', acc('start', 0), 'me')).toBe('format');
    expect(checkCode('PETROV0002', acc('start', 0), 'me')).toBe('notFound');
    expect(checkCode('IVANOV0001', undefined, 'me')).toBe('notFound');
    expect(checkCode('IVANOV0001', acc('start', 3), 'c1')).toBe('already');
  });
  it('завершение ведения освобождает место, оплата идёт в бонус', () => {
    let a = addReferral(acc('trial', 1), { id: 'me', name: 'Я' }, T);
    expect(seatsLeft(a)).toBe(0);
    a = setReferralStatus(a, 'me', 'ended', T);
    expect(seatsLeft(a)).toBe(1);
    a = markPaid(a, 'me', T);
    expect(curatorBonus(a)).toEqual({ paid: 1, months: 0, toNext: 2 });
    // отвязанный клиент не оплачивает со скидкой
    a = setReferralStatus(a, 'c0', 'removed', T);
    expect(markPaid(a, 'c0', T).referrals.find((r) => r.id === 'c0')?.paidAt).toBeUndefined();
  });
  it('бонус: месяц тарифа за каждые 3 оплаты', () => {
    const a = acc('start', 0);
    a.referrals = Array.from({ length: 7 }, (_, i) => ({ id: 'p' + i, name: '', linkedAt: T, status: 'ended' as const, paidAt: T }));
    expect(curatorBonus(a)).toEqual({ paid: 7, months: 2, toNext: 2 });
  });
  it('предложение −30 % на 3 мес. действует 30 дней', () => {
    const o = makeOffer('Пётр Иванов', 'IVANOV0001', T);
    expect(o).toMatchObject({ discountPct: 30, months: 3, until: '2026-12-18' });
    expect(offerOpen(o, '2026-12-18')).toBe(true);
    expect(offerOpen(o, '2026-12-19')).toBe(false);
    expect(offerOpen({ ...o, acceptedAt: T }, T)).toBe(false);
  });
  it('демо-куратор: «Старт», 7 на ведении, 3 места свободно, до бонуса одна оплата', () => {
    const d = demoCuratorAccount(T);
    expect(d.code).toBe('SMIRNOVA' + String(DEMO_CURATOR_SEQ).padStart(4, '0'));
    expect(seatsLeft(d)).toBe(3);
    expect(curatorBonus(d)).toEqual({ paid: 2, months: 0, toNext: 1 });
  });
});
