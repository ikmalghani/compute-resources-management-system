export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    if (response.status === 403 && data.error === "Change your password before continuing" && typeof window !== "undefined") {
      window.location.assign("/account/password");
    }
    throw new Error(data.error || "Request failed");
  }
  return data as T;
}
