/** WebViews may omit Origin or use an opaque Origin. The unguessable URL plus
 * hidden CSRF token are still required; a concrete foreign origin is rejected. */
export function allowsSetupPost(headers: { origin?: string; contentType?: string; fetchSite?: string }, localOrigin: string): boolean {
  if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(headers.contentType ?? "")) return false;
  if (headers.fetchSite === "cross-site") return false;
  return !headers.origin || headers.origin === "null" || headers.origin === localOrigin;
}
