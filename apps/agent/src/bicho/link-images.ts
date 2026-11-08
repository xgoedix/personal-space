import { assertPublicHost, dohResolver, validateEndpoint } from "../mcp/url";

export interface LinkPicture {
  url: string;
  mime: string;
  bytes: Uint8Array;
}

const PAGE_BYTES = 1024 * 1024;
const IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_CANDIDATES = 8;

function publicUrl(value: string, base?: string): URL {
  const url = new URL(value, base);
  if (url.href.length > 4096 || url.port) throw Error("Unsupported preview URL");
  // Old HTTP bookmarks retain their original URL. Preview traffic uses HTTPS.
  if (url.protocol === "http:") url.protocol = "https:";
  url.hash = "";
  url.hostname = url.hostname.replace(/\.$/, "");
  return validateEndpoint(url.href, { development: false });
}

function productImages(raw: string): string[] {
  const result: string[] = [];
  const objects: Record<string, unknown>[] = [];
  const byId = new Map<string, Record<string, unknown>>();
  function index(node: unknown, depth: number) {
    if (!node || typeof node !== "object" || depth > 20 || objects.length > 1500) return;
    if (Array.isArray(node)) {
      for (const child of node) index(child, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    objects.push(obj);
    if (typeof obj["@id"] === "string" && Object.keys(obj).length > 1) byId.set(obj["@id"], obj);
    for (const child of Object.values(obj)) index(child, depth + 1);
  }
  function image(value: unknown, depth = 0) {
    if (depth > 5 || result.length >= MAX_CANDIDATES) return;
    if (typeof value === "string") result.push(value);
    else if (Array.isArray(value)) {
      for (const child of value) image(child, depth + 1);
    }
    else if (value && typeof value === "object") {
      const obj = value as Record<string, unknown>;
      const ref = obj["@id"];
      image(obj.contentUrl ?? obj.url ?? (typeof ref === "string" ? byId.get(ref) ?? ref : null), depth + 1);
    }
  }
  try { index(JSON.parse(raw), 0); } catch { return []; }
  for (const obj of objects) {
    const types = [obj["@type"]].flat();
    if (types.some(type => typeof type === "string" && /(?:^|[/#])Product(?:Group)?$/i.test(type))) image(obj.image);
  }
  return result;
}

/** Keep each kind separate: document order must not put a social card ahead of a product photo. */
export async function imageCandidates(html: string, page: string): Promise<string[]> {
  const product: string[] = [], gallery: string[] = [], og: string[] = [], twitter: string[] = [];
  let base = page;
  let json = "";
  const rewriter = new HTMLRewriter()
    .on("base[href]", { element(el) { if (base === page) { try { base = publicUrl(el.getAttribute("href")!, page).href; } catch {} } } })
    .on('script[type="application/ld+json"]', {
      element(el) {
        json = "";
        el.onEndTag(() => { if (product.length < MAX_CANDIDATES) product.push(...productImages(json)); });
      },
      text(chunk) { json += chunk.text; },
    })
    .on('[itemtype$="/Product"] [itemprop~="image"], [itemtype$="/ProductGroup"] [itemprop~="image"], .woocommerce-product-gallery__image img, .product__media img, img[data-main-image], [data-product-featured-media] img', {
      element(el) {
        const src = ["content", "data-zoom-image", "data-large_image", "data-src", "src", "href"]
          .map(attr => el.getAttribute(attr)).find(Boolean);
        if (src && gallery.length < MAX_CANDIDATES) gallery.push(src);
      },
    })
    .on("meta[content]", { element(el) {
      const name = (el.getAttribute("property") ?? el.getAttribute("name") ?? "").trim().toLowerCase();
      const content = el.getAttribute("content")!;
      if (/^og:image(?::(?:url|secure_url))?$/.test(name) && og.length < MAX_CANDIDATES) og.push(content);
      if (/^twitter:image(?::src)?$/.test(name) && twitter.length < MAX_CANDIDATES) twitter.push(content);
    } });
  await rewriter.transform(new Response(html)).arrayBuffer();
  const unique = new Set<string>();
  for (const candidate of [...product, ...gallery, ...og, ...twitter]) {
    try {
      const value = candidate.trim().replaceAll("&amp;", "&");
      if (value && !value.startsWith("#")) unique.add(publicUrl(value, base).href);
    } catch { /* Try the next candidate. */ }
  }
  return [...unique];
}

async function boundedBody(response: Response, limit: number, prefixOnly: boolean): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) throw Error("Empty response");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < limit + 1) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, limit + 1 - total);
      chunks.push(chunk);
      total += chunk.length;
    }
  } finally { await reader.cancel().catch(() => {}); }
  if (!prefixOnly && total > limit) throw Error("Preview too large");
  const out = new Uint8Array(Math.min(total, limit));
  let offset = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, out.length - offset);
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function rasterType(bytes: Uint8Array): string | null {
  const matches = (at: number, ...sig: number[]) => sig.every((b, i) => bytes[at + i] === b);
  const ascii = (a: number, b: number) => String.fromCharCode(...bytes.subarray(a, b));
  if (bytes.length < 16) return null;
  if (matches(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (matches(0, 137, 80, 78, 71, 13, 10, 26, 10)) return "image/png";
  if (["GIF87a", "GIF89a"].includes(ascii(0, 6))) return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp" && ["avif", "avis"].includes(ascii(8, 12))) return "image/avif";
  return null;
}

export async function loadPicture(pageUrl: string, preferred = "", previous = "", network: typeof fetch = fetch): Promise<LinkPicture | null> {
  const signal = AbortSignal.timeout(16_000);
  const resolve = dohResolver(network);
  const verified = new Set<string>();
  const tried = new Set<string>();
  let requests = 0;

  async function read(raw: string, accept: string) {
    let url = publicUrl(raw);
    for (let redirects = 0; redirects <= 3; redirects++) {
      if (++requests > 12 || signal.aborted) throw Error("Preview request limit");
      if (!verified.has(url.hostname)) {
        await assertPublicHost(url, resolve, { development: false });
        verified.add(url.hostname);
      }
      const response = await network(url.href, { headers: { accept }, redirect: "manual", signal });
      if (response.ok) return { response, url: url.href };
      await response.body?.cancel();
      const location = response.headers.get("location");
      if (![301,302,303,307,308].includes(response.status) || !location) break;
      url = publicUrl(location, url.href);
    }
    throw Error("Resource unavailable");
  }

  async function tryImage(raw: string): Promise<LinkPicture | null> {
    if (!raw || tried.has(raw)) return null;
    tried.add(raw);
    try {
      const { response, url } = await read(raw, "image/avif,image/webp,image/png,image/jpeg,image/gif");
      const bytes = await boundedBody(response, IMAGE_BYTES, false);
      const mime = rasterType(bytes);
      return mime ? { url, mime, bytes } : null;
    } catch { return null; }
  }

  for (const image of [preferred, previous]) {
    const picture = await tryImage(image);
    if (picture) return picture;
  }
  try {
    const { response, url } = await read(pageUrl, "text/html,application/xhtml+xml");
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.startsWith("image/")) {
      const bytes = await boundedBody(response, IMAGE_BYTES, false);
      const mime = rasterType(bytes);
      return mime ? { url, mime, bytes } : null;
    }
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      await response.body?.cancel();
      return null;
    }
    const html = new TextDecoder().decode(await boundedBody(response, PAGE_BYTES, true));
    for (const candidate of await imageCandidates(html, url)) {
      const picture = await tryImage(candidate);
      if (picture) return picture;
    }
  } catch { /* A bookmark still works when its publisher does not provide a preview. */ }
  return null;
}
