import { describe, expect, it } from 'vitest';
import { CHANGELOG } from './changelog';
import { releaseMessage } from './releaseMessage';

describe('сообщение о новой версии', () => {
  it('берёт номер и пункты верхней записи «Что нового»', () => {
    const top = CHANGELOG[0];
    const msg = releaseMessage(top);
    expect(msg).toContain(`Activity Balance ${top.v}`);
    expect(msg.split('\n').filter((l) => l.startsWith('• '))).toHaveLength(top.ru.length);
    expect(msg).toContain('https://activity-balance-app.vercel.app/');
    expect(msg.length).toBeLessThan(4096); // предел Telegram
  });

  it('экранирует < > & для разметки HTML', () => {
    const msg = releaseMessage({ v: '1.0.0', ru: ['a < b & c > d'], en: ['x'] });
    expect(msg).toContain('a &lt; b &amp; c &gt; d');
  });
});
