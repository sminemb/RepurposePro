import type {
  GeminiGenerateContentParameters,
  GeminiModelClient,
} from "./gemini-clip-selector.service";

/** Bound the application call even if the SDK does not honor its transport timeout. */
export async function generateGeminiContent(
  client: GeminiModelClient,
  parameters: GeminiGenerateContentParameters,
) {
  const parent = parameters.config.abortSignal;
  parent.throwIfAborted();
  const controller = new AbortController();
  const signal = AbortSignal.any([parent, controller.signal]);
  const timer = setTimeout(
    () => controller.abort(new Error("Gemini request timed out.")),
    parameters.config.httpOptions.timeout,
  );
  let onAbort: (() => void) | undefined;
  try {
    const aborted = new Promise<never>((_resolve, reject) => {
      onAbort = () => {
        const reason: unknown = signal.reason;
        reject(reason instanceof Error ? reason : new Error("Gemini request cancelled."));
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
    const result = await Promise.race([
      client.generateContent({
        ...parameters,
        config: { ...parameters.config, abortSignal: signal },
      }),
      aborted,
    ]);
    signal.throwIfAborted();
    return result;
  } finally {
    clearTimeout(timer);
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}
