import { describe, expect, it } from 'vitest';
import { bundleName } from './update.parse';

describe('проверка новой версии', () => {
  it('имя бандла из index.html', () => {
    const html = '<script src="/_expo/static/js/web/index-360b6a9d3e2106450a6a69f684980149.js" defer></script>';
    expect(bundleName(html)).toBe('_expo/static/js/web/index-360b6a9d3e2106450a6a69f684980149.js');
    expect(bundleName('https://x.app/_expo/static/js/web/index-abc123.js')).toBe('_expo/static/js/web/index-abc123.js');
    expect(bundleName('<html>без бандла</html>')).toBeNull();
  });
});
