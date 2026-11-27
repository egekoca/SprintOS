/**
 * Bound how long an external call may take.
 *
 * Without this, a slow or unreachable RPC/Horizon node leaves the caller
 * waiting forever with nothing to time out and nothing to report — the same
 * failure mode `lib/stellar/contract.ts` already guards reads against. Pulled
 * out here so every server-side network call in the app, not only that one
 * file, can apply the same bound.
 */
export function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
