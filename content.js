(() => {
  const REDDIT_HOST_RE = /(^|\.)reddit\.com$/i;
  const SHORTLINK_HOST_RE = /^redd\.it$/i;
  const POST_PATH_RE = /\/comments\/[a-z0-9]+|\/r\/[^/]+\/s\/[a-z0-9]+/i;

  let enabled = true;
  let blockReddit = false;
  let showComments = false;
  chrome.storage.sync.get({ enabled: true, blockReddit: false, showComments: false }, (s) => {
    enabled = !!s.enabled;
    blockReddit = !!s.blockReddit;
    showComments = !!s.showComments;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    if (changes.enabled) enabled = !!changes.enabled.newValue;
    if (changes.blockReddit) blockReddit = !!changes.blockReddit.newValue;
    if (changes.showComments) showComments = !!changes.showComments.newValue;
  });

  function classifyRedditUrl(href) {
    try {
      const u = new URL(href, location.href);
      if (SHORTLINK_HOST_RE.test(u.hostname)) return "post";
      if (!REDDIT_HOST_RE.test(u.hostname)) return null;
      if (POST_PATH_RE.test(u.pathname)) return "post";
      return "listing";
    } catch {
      return null;
    }
  }

  function findAnchor(target) {
    let el = target;
    while (el && el !== document.body) {
      if (el.tagName === "A" && el.href) return el;
      el = el.parentElement;
    }
    return null;
  }

  document.addEventListener("click", (e) => {
    if (!enabled) return;
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;

    const a = findAnchor(e.target);
    if (!a) return;
    if (a.closest(".redditpeek-chrome")) return;
    const kind = classifyRedditUrl(a.href);
    if (!kind) return;

    e.preventDefault();
    e.stopPropagation();
    if (kind === "listing") openListingNotice(a.href);
    else openPeek(a.href);
  }, true);

  let modalEl = null;

  function closeModal() {
    if (modalEl) {
      modalEl.remove();
      modalEl = null;
      document.removeEventListener("keydown", onKeydown, true);
    }
  }

  function onKeydown(e) {
    if (e.key === "Escape") closeModal();
  }

  function openModalShell(initialBodyHtml) {
    closeModal();
    modalEl = document.createElement("div");
    modalEl.className = "redditpeek-overlay";
    modalEl.innerHTML = `
      <div class="redditpeek-modal" role="dialog" aria-modal="true">
        <button class="redditpeek-close redditpeek-chrome" aria-label="Close">&times;</button>
        <div class="redditpeek-body">${initialBodyHtml}</div>
      </div>`;
    modalEl.addEventListener("click", (e) => {
      if (e.target === modalEl) closeModal();
    });
    modalEl.querySelector(".redditpeek-close").addEventListener("click", closeModal);
    document.addEventListener("keydown", onKeydown, true);
    document.body.appendChild(modalEl);
    return modalEl.querySelector(".redditpeek-body");
  }

  function openListingNotice(url) {
    const body = openModalShell("");
    const h = document.createElement("h2");
    h.className = "redditpeek-title";
    h.textContent = "This is a Reddit listing page";
    const p = document.createElement("p");
    p.className = "redditpeek-empty";
    p.textContent = "RedditPeek only previews individual posts, not feeds or subreddit pages.";
    body.append(h, p);
    if (!blockReddit) {
      const a = document.createElement("a");
      a.href = url;
      a.className = "redditpeek-permalink redditpeek-chrome";
      a.textContent = "Open on Reddit anyway";
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      body.appendChild(a);
    }
  }

  function openPeek(url) {
    const body = openModalShell('<div class="redditpeek-loading">Loading…</div>');

    chrome.runtime.sendMessage({ type: "REDDITPEEK_FETCH", url, withComments: showComments }, (resp) => {
      if (!modalEl) return;
      const body = modalEl.querySelector(".redditpeek-body");
      if (chrome.runtime.lastError) {
        renderError(body, chrome.runtime.lastError.message, url);
        return;
      }
      if (!resp?.ok) {
        renderError(body, resp?.error ?? "Unknown error", url);
        return;
      }
      renderPost(body, resp.post, resp.comments ?? []);
    });
  }

  const URL_RE = /\bhttps?:\/\/[^\s<>()]+[^\s<>().,!?;:'"]/gi;
  const IMAGE_EXT_RE = /\.(?:jpe?g|png|gif|webp|bmp|svg)(?:\?|$)/i;

  function isImageUrl(url) {
    try {
      const u = new URL(url);
      if (/^i\.redd\.it$/i.test(u.hostname)) return true;
      if (/^i\.imgur\.com$/i.test(u.hostname)) return true;
      return IMAGE_EXT_RE.test(u.pathname);
    } catch {
      return false;
    }
  }

  function appendLinkified(parent, text) {
    let last = 0;
    for (const m of text.matchAll(URL_RE)) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      const a = document.createElement("a");
      a.href = m[0];
      a.textContent = m[0];
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      parent.appendChild(a);
      last = m.index + m[0].length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  function formatAge(createdUtc) {
    if (!createdUtc) return "";
    const then = new Date(createdUtc * 1000);
    const secs = Math.max(0, (Date.now() - then.getTime()) / 1000);
    const mins = secs / 60, hours = mins / 60, days = hours / 24;
    if (secs < 60) return "just now";
    if (mins < 60) return `${Math.floor(mins)}m ago`;
    if (hours < 24) return `${Math.floor(hours)}h ago`;
    if (days < 30) return `${Math.floor(days)}d ago`;
    return then.toLocaleDateString();
  }

  function renderError(body, message, url) {
    body.innerHTML = "";
    const p = document.createElement("p");
    p.className = "redditpeek-error";
    p.textContent = `Couldn't load preview: ${message}`;
    const a = document.createElement("a");
    a.href = url;
    a.textContent = "Open on Reddit instead";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    body.append(p, a);
  }

  function renderComments(body, comments) {
    if (!comments.length) return;
    const wrap = document.createElement("div");
    wrap.className = "redditpeek-comments";
    const heading = document.createElement("h3");
    heading.className = "redditpeek-comments-heading";
    heading.textContent = "Top comments";
    wrap.appendChild(heading);
    for (const c of comments) {
      const item = document.createElement("div");
      item.className = "redditpeek-comment";
      const meta = document.createElement("div");
      meta.className = "redditpeek-comment-meta";
      meta.textContent = `u/${c.author} • ${c.score} pts`;
      item.appendChild(meta);
      for (const para of c.body.split(/\n{2,}/)) {
        const p = document.createElement("p");
        appendLinkified(p, para);
        item.appendChild(p);
      }
      wrap.appendChild(item);
    }
    body.appendChild(wrap);
  }

  function renderPost(body, post, comments) {
    body.innerHTML = "";

    const meta = document.createElement("div");
    meta.className = "redditpeek-meta";
    const age = formatAge(post.createdUtc);
    meta.textContent = `${post.subreddit} • u/${post.author} • ${post.score} pts${age ? ` • ${age}` : ""}`;

    const title = document.createElement("h2");
    title.className = "redditpeek-title";
    title.textContent = post.title;

    body.append(meta, title);

    if (post.isSelf && post.selftext) {
      const text = document.createElement("div");
      text.className = "redditpeek-selftext";
      for (const para of post.selftext.split(/\n{2,}/)) {
        const p = document.createElement("p");
        appendLinkified(p, para);
        text.appendChild(p);
      }
      body.appendChild(text);
    } else if (!post.isSelf && post.url) {
      if (isImageUrl(post.url)) {
        const img = document.createElement("img");
        img.className = "redditpeek-image";
        img.src = post.url;
        img.alt = post.title;
        img.loading = "lazy";
        body.appendChild(img);
      }
      const linkWrap = document.createElement("p");
      linkWrap.className = "redditpeek-linkwrap redditpeek-chrome";
      const label = document.createElement("span");
      label.textContent = "Link: ";
      const a = document.createElement("a");
      a.href = post.url;
      a.textContent = post.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      linkWrap.append(label, a);
      body.appendChild(linkWrap);
    } else {
      const empty = document.createElement("p");
      empty.className = "redditpeek-empty";
      empty.textContent = "(no body)";
      body.appendChild(empty);
    }

    if (comments?.length) renderComments(body, comments);

    if (post.permalink && !blockReddit) {
      const perma = document.createElement("a");
      perma.href = post.permalink;
      perma.className = "redditpeek-permalink redditpeek-chrome";
      perma.textContent = "Open on Reddit";
      perma.target = "_blank";
      perma.rel = "noopener noreferrer";
      body.appendChild(perma);
    }
  }
})();
