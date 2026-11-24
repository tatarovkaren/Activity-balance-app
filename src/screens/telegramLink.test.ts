import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTelegramLinkRequest } from './telegramLink';

afterEach(() => vi.restoreAllMocks());

describe('Telegram link requests', () => {
  it('keeps the same code valid until the bot consumes it, including on a repeated tap', async () => {
    let activeCode: string | undefined;
    let sequence = 0;
    const issue = vi.fn(async () => {
      activeCode = 'code-' + ++sequence;
      return activeCode;
    });
    const link = createTelegramLinkRequest(issue);
    const open = vi.fn(async (_code: string) => {});
    const code = await link.prepare();

    const opening = link.open(open);
    expect(open).toHaveBeenCalledWith(code);
    await opening;
    await link.open(open);

    expect(issue).toHaveBeenCalledTimes(1);
    expect(open.mock.calls).toEqual([[code], [code]]);
    // Simulate the user pressing Start in Telegram after returning to the app.
    expect(activeCode).toBe(code);
    activeCode = undefined;
    link.clear();

    await link.open(open);
    expect(open).toHaveBeenLastCalledWith(activeCode);
    expect(activeCode).not.toBe(code);
    expect(issue).toHaveBeenCalledTimes(2);
  });

  it('shares a pending request between prefetch and the connect button', async () => {
    const server = Promise.withResolvers<string>();
    const issue = vi.fn(() => server.promise);
    const link = createTelegramLinkRequest(issue);
    const open = vi.fn(async (_code: string) => {});

    const prefetch = link.prepare();
    const opening = link.open(open);
    expect(issue).toHaveBeenCalledTimes(1);

    server.resolve('one-code');
    await expect(prefetch).resolves.toBe('one-code');
    await opening;
    expect(open).toHaveBeenCalledExactlyOnceWith('one-code');
  });

  it('waits for obsolete issuance before preparing a new code after unlinking', async () => {
    const server = Promise.withResolvers<string>();
    const issue = vi.fn<() => Promise<string>>()
      .mockReturnValueOnce(server.promise)
      .mockResolvedValueOnce('new-code');
    const link = createTelegramLinkRequest(issue);

    const oldRequest = link.prepare();
    link.clear();
    const newRequest = link.prepare();
    expect(issue).toHaveBeenCalledTimes(1);

    server.resolve('obsolete-code');
    await oldRequest;
    await expect(newRequest).resolves.toBe('new-code');
    expect(issue).toHaveBeenCalledTimes(2);
  });

  it('refreshes an old code and allows a retry after issuance fails', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    const issue = vi.fn<() => Promise<string>>()
      .mockResolvedValueOnce('first')
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce('replacement');
    const link = createTelegramLinkRequest(issue);
    const open = vi.fn(async (_code: string) => {});
    await link.prepare();

    now.mockReturnValue(25 * 60_000);
    await expect(link.open(open)).rejects.toThrow('network');
    expect(open).not.toHaveBeenCalled();
    await link.open(open);
    expect(open).toHaveBeenCalledExactlyOnceWith('replacement');
    expect(issue).toHaveBeenCalledTimes(3);
  });
});
