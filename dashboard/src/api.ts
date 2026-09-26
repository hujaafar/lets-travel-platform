let csrf = "";
export const setCsrf = (value: string) => {
  csrf = value;
};
export async function api<T = void>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const requestCsrf = csrf;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(requestCsrf ? { "X-CSRF-Token": requestCsrf } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const data = await response.json().catch((error: unknown) => {
        if (controller.signal.aborted) throw error;
        return {
          message: "The service is temporarily unavailable. Please try again.",
        };
      });
      if (
        response.status === 401 &&
        !path.includes("login") &&
        requestCsrf === csrf
      )
        window.dispatchEvent(new Event("session-expired"));
      throw new Error(
        typeof data?.message === "string" && data.message
          ? data.message
          : "Request failed",
      );
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : undefined) as T;
  } catch (error) {
    if (controller.signal.aborted)
      throw new Error(
        "The service took too long to respond. Please try again.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
