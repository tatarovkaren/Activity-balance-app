import { describe, expect, it } from 'vitest';
import { buildReport, describeUA, normChat } from '.';
import { LANG_CODES, LANGS } from '../i18n/core';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  androidK: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
  yandex: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 YaBrowser/24.12.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
};

describe('обратная связь', () => {
  it('устройство по строке браузера', () => {
    expect(describeUA(UA.iphone)).toBe('iPhone · iOS 18.1 · Safari 18');
    expect(describeUA(UA.android)).toBe('SM-S918B · Android 14 · Chrome 131');
    expect(describeUA(UA.androidK)).toBe('Android 10 · Chrome 131');
    expect(describeUA(UA.yandex)).toBe('Windows · Яндекс Браузер 24');
    expect(describeUA(UA.mac)).toBe('macOS 10.15 · Safari 18');
    expect(describeUA('')).toBe('');
  });
  it('адрес чата: ссылка-приглашение, @имя, мусор', () => {
    expect(normChat('t.me/+AbC123')).toBe('https://t.me/+AbC123');
    expect(normChat(' https://t.me/+AbC123 ')).toBe('https://t.me/+AbC123');
    expect(normChat('@ab_feedback')).toBe('https://t.me/ab_feedback');
    expect(normChat('')).toBe('');
    expect(normChat('javascript:alert(1)')).toBe('');
    expect(normChat('https://evil.example/t.me/x')).toBe('');
  });
  it('заготовка на всех языках: версия, устройство, место для описания', () => {
    for (const code of LANG_CODES) {
      const F = LANGS[code].dict.feedback;
      const s = buildReport('bug', { version: '0.32.0', build: 'abc1234', device: 'iPhone · iOS 18.1', screen: '390×844', installed: true, lang: 'Русский', mode: F.modes.demo, date: '21.11.2026' }, F);
      expect(s).toContain('0.32.0 (abc1234)');
      expect(s).toContain('iPhone · iOS 18.1 · ' + F.installed);
      expect(s).toContain('390×844');
      expect(s.endsWith(F.body.bug)).toBe(true);
      expect(s.startsWith('Activity Balance · ' + F.kinds.bug)).toBe(true);
    }
  });
});
