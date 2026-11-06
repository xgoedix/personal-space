/** A failed/offline check must never trigger a reload or erase a local draft. */
export async function availableVersion(current: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  if (!current) return null;
  try {
    const response = await fetcher("/release.json", { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return null;
    const value: unknown = await response.json();
    const version = value && typeof value === "object" && "version" in value ? value.version : null;
    return typeof version === "string" && /^[a-zA-Z0-9.-]{8,80}$/.test(version) && version !== current ? version : null;
  } catch {
    return null;
  }
}

export function hasLocalDraft(document: Document): boolean {
  return [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input:not([type=checkbox]):not([type=radio]):not([type=hidden]), textarea")]
    .some((input) => input.value.trim().length > 0)
    || [...document.querySelectorAll<HTMLElement>('[contenteditable="true"]')].some((element) => !!element.textContent?.trim());
}
