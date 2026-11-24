// The server issues 30-minute codes. Refresh before expiry to leave time to start the bot.
const REUSE_MS = 25 * 60_000;

export function createTelegramLinkRequest(issue: () => Promise<string>) {
  let cached: { url: string; requestedAt: number } | undefined;
  let pending: { promise: Promise<string>; generation: number } | undefined;
  let generation = 0;

  const current = () => cached && Date.now() - cached.requestedAt < REUSE_MS ? cached.url : undefined;

  function prepare(): Promise<string> {
    const url = current();
    if (url) return Promise.resolve(url);
    if (pending) {
      if (pending.generation === generation) return pending.promise;
      return pending.promise.catch(() => {}).then(prepare);
    }

    const requestedAt = Date.now();
    const requestGeneration = generation;
    const promise = issue().then((url) => {
      if (generation === requestGeneration) cached = { url, requestedAt };
      return url;
    }).finally(() => {
      pending = undefined;
    });
    pending = { promise, generation: requestGeneration };
    return promise;
  }

  return {
    prepare,
    async open(openUrl: (url: string) => Promise<unknown>) {
      // Open an already prepared URL in the same click handler for browser popup policies.
      await openUrl(current() ?? await prepare());
    },
    clear() {
      generation++;
      cached = undefined;
    },
  };
}
