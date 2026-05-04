const REDDIT_HOST_RE = /^(?:[a-z0-9-]+\.)?reddit\.com$/i;
const SHORTLINK_HOST_RE = /^redd\.it$/i;

let blockReddit = false;
chrome.storage.sync.get({ blockReddit: false }, (s) => { blockReddit = !!s.blockReddit; });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes.blockReddit) blockReddit = !!changes.blockReddit.newValue;
});

function isRedditNavigation(url) {
  try {
    const u = new URL(url);
    return REDDIT_HOST_RE.test(u.hostname) || SHORTLINK_HOST_RE.test(u.hostname);
  } catch {
    return false;
  }
}

chrome.webNavigation.onBeforeNavigate.addListener((details) => {
  if (!blockReddit) return;
  if (details.frameId !== 0) return;
  if (!isRedditNavigation(details.url)) return;
  chrome.tabs.update(details.tabId, { url: chrome.runtime.getURL("blocked.html") });
});

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
