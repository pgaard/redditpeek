const REDDIT_HOST_RE = /^(?:[a-z0-9-]+\.)?reddit\.com$/i;
const SHORTLINK_HOST_RE = /^redd\.it$/i;

function normalizeToJsonUrl(rawUrl) {
  const u = new URL(rawUrl);
  if (SHORTLINK_HOST_RE.test(u.hostname)) {
    return `https://www.reddit.com${u.pathname}.json`;
  }
  if (!REDDIT_HOST_RE.test(u.hostname)) return null;

  let path = u.pathname.replace(/\/+$/, "");
  if (!/\/comments\//.test(path)) return null;
  if (!path.endsWith(".json")) path += ".json";
  return `https://www.reddit.com${path}`;
}

function extractPost(json) {
  const listing = Array.isArray(json) ? json[0] : json;
  const child = listing?.data?.children?.[0]?.data;
  if (!child) return null;
  return {
    title: child.title ?? "",
    author: child.author ?? "",
    subreddit: child.subreddit_name_prefixed ?? `r/${child.subreddit ?? ""}`,
    isSelf: !!child.is_self,
    selftext: child.selftext ?? "",
    url: child.url ?? "",
    permalink: child.permalink ? `https://www.reddit.com${child.permalink}` : "",
    score: child.score ?? 0,
    createdUtc: child.created_utc ?? 0
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "REDDITPEEK_FETCH") return;
  (async () => {
    try {
      const jsonUrl = normalizeToJsonUrl(msg.url);
      if (!jsonUrl) {
        sendResponse({ ok: false, error: "Not a recognized Reddit post URL." });
        return;
      }
      const res = await fetch(jsonUrl, {
        headers: { "Accept": "application/json" },
        credentials: "omit"
      });
      if (!res.ok) {
        sendResponse({ ok: false, error: `Reddit responded ${res.status}` });
        return;
      }
      const data = await res.json();
      const post = extractPost(data);
      if (!post) {
        sendResponse({ ok: false, error: "Could not parse post." });
        return;
      }
      sendResponse({ ok: true, post });
    } catch (err) {
      sendResponse({ ok: false, error: String(err?.message ?? err) });
    }
  })();
  return true;
});
