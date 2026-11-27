import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync('public/chill2-preview.html', 'utf8');

describe('Chill 2.0 isolated UX preview safety', () => {
  it('clearly identifies itself as a synthetic, non-production prototype', () => {
    expect(html).toContain('ТОЛЬКО UX-ПИЛОТ');
    expect(html).toContain('Все примеры вымышлены');
  });
  it('does not fetch, upload, persist or authenticate user data', () => {
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<input[^>]+type=["']file["']/i);
    expect(html).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|navigator\.sendBeacon/);
    expect(html).not.toMatch(/serviceWorker\.register|supabase\.co\/auth\/|createClient\s*\(/);
  });
  it('has one primary Add button and three demo data states', () => {
    expect((html.match(/id="add"/g) || [])).toHaveLength(1);
    expect(html).toContain('data-mode="full"');
    expect(html).toContain('data-mode="few"');
    expect(html).toContain('data-mode="none"');
  });
  it('models a guided, non-operational FatSecret import', () => {
    expect(html).toContain('CSV-выгрузка с сайта FatSecret');
    expect(html).toContain('PDF-отчёт из мобильного FatSecret');
    expect(html).toContain('Реальные файлы не загружаются');
  });
});
