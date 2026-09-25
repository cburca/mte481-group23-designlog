/**
 * Store: keeps tracker data in one JSON file in the GitHub repo.
 *
 * - With a GitHub token: reads and writes through the GitHub API. Every
 *   change is a commit, so the repo history is a full audit trail.
 * - Without a token: read-only, loaded from the copy GitHub Pages serves.
 *
 * Writes are queued as small "mutation" functions. Each one is applied to the
 * latest committed data and saved; if someone else committed in between
 * (GitHub reports a SHA conflict), the store re-fetches and re-applies the
 * mutation instead of overwriting their work.
 */
window.Store = (function () {
  var cfg = window.TRACKER_CONFIG || {};
  var TOKEN_KEY = "g23-tracker-token";
  var API = "https://api.github.com";

  var base = null;       // last data confirmed on GitHub
  var baseSha = null;
  var pending = [];      // [{fn, message}] not yet committed
  var state = null;      // base + pending, what the UI shows
  var mode = "loading";  // "loading" | "github" | "readonly" | "locked" | "error"
  var status = "idle";   // "idle" | "saving" | "error"
  var lastError = "";
  var login = null;      // GitHub username of the token owner
  var listeners = [];
  var saving = false;
  var loadedAt = 0;

  function repoInfo() {
    var owner = cfg.owner, repo = cfg.repo;
    var host = location.hostname;
    if (!owner && /\.github\.io$/i.test(host)) owner = host.split(".")[0];
    if (!repo && owner) {
      var seg = location.pathname.split("/").filter(Boolean)[0];
      repo = seg && !/\.html?$/i.test(seg) ? seg : owner + ".github.io";
    }
    return { owner: owner || "", repo: repo || "", branch: cfg.dataBranch || "main", path: cfg.dataPath || "data/tracker.json" };
  }

  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } }
  function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} }

  function b64encode(str) {
    var bytes = new TextEncoder().encode(str), bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function b64decode(b64) {
    var bin = atob(b64.replace(/\s/g, "")), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function api(path, opts) {
    opts = opts || {};
    var headers = Object.assign({
      "Accept": "application/vnd.github+json",
      "Authorization": "Bearer " + getToken(),
      "X-GitHub-Api-Version": "2022-11-28"
    }, opts.headers || {});
    return fetch(API + path, Object.assign({}, opts, { headers: headers, cache: "no-store" }));
  }

  function contentsPath() {
    var r = repoInfo();
    return "/repos/" + encodeURIComponent(r.owner) + "/" + encodeURIComponent(r.repo) + "/contents/" + r.path.split("/").map(encodeURIComponent).join("/");
  }

  async function explain(res) {
    var msg = "";
    try { msg = (await res.json()).message || ""; } catch (e) {}
    if (res.status === 401) return "GitHub rejected the token (401). It may be expired or mistyped — reconnect in Settings.";
    if (res.status === 403) return "GitHub refused access (403). The token needs write access to this repository's contents. " + msg;
    if (res.status === 404) return "Repository, branch or file not found (404). Check the repo name and data branch in Settings. " + msg;
    return "GitHub error " + res.status + (msg ? ": " + msg : "");
  }

  async function fetchRemote() {
    var r = repoInfo();
    var res = await api(contentsPath() + "?ref=" + encodeURIComponent(r.branch));
    if (res.status === 404) return { data: null, sha: null, missing: true };
    if (!res.ok) throw new Error(await explain(res));
    var j = await res.json();
    var text;
    if (j.content) {
      text = b64decode(j.content);
    } else {
      // Files over 1 MB come back without inline content; fetch raw.
      var raw = await api(contentsPath() + "?ref=" + encodeURIComponent(r.branch), { headers: { Accept: "application/vnd.github.raw+json" } });
      if (!raw.ok) throw new Error(await explain(raw));
      text = await raw.text();
    }
    return { data: JSON.parse(text), sha: j.sha };
  }

  async function fetchStatic() {
    var r = repoInfo();
    var res = await fetch(r.path + "?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("Couldn't load " + r.path + " (" + res.status + ").");
    return await res.json();
  }

  async function putRemote(data, sha, message) {
    var r = repoInfo();
    var body = { message: message, content: b64encode(JSON.stringify(data, null, 2) + "\n"), branch: r.branch };
    if (sha) body.sha = sha;
    var res = await api(contentsPath(), { method: "PUT", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
    if (res.status === 409 || res.status === 422) {
      var j = {};
      try { j = await res.clone().json(); } catch (e) {}
      if (res.status === 409 || /sha/i.test(j.message || "")) return { conflict: true };
    }
    if (!res.ok) throw new Error(await explain(res));
    var out = await res.json();
    return { sha: out.content.sha };
  }

  function recompute() {
    var s = base ? clone(base) : null;
    if (s) pending.forEach(function (p) { try { p.fn(s); } catch (e) { console.error(e); } });
    state = s;
  }

  function emit() { listeners.forEach(function (l) { l(); }); }

  async function pump() {
    if (saving) return;
    saving = true;
    while (pending.length) {
      status = "saving"; emit();
      var job = pending[0];
      try {
        var ok = false;
        for (var attempt = 0; attempt < 5 && !ok; attempt++) {
          if (attempt > 0) {
            var fresh = await fetchRemote();
            if (fresh.missing) throw new Error("The data file disappeared from the repository.");
            base = fresh.data; baseSha = fresh.sha;
          }
          var next = clone(base);
          job.fn(next);
          var res = await putRemote(next, baseSha, job.message);
          if (res.conflict) continue;
          base = next; baseSha = res.sha; ok = true;
        }
        if (!ok) throw new Error("Couldn't save after several tries because others kept editing at the same time. Refresh and try again.");
        pending.shift();
        recompute();
        status = "idle"; lastError = "";
      } catch (err) {
        console.error(err);
        pending = [];
        status = "error"; lastError = err.message || String(err);
        recompute();
        emit();
        break;
      }
    }
    saving = false;
    emit();
  }

  return {
    repoInfo: repoInfo,
    get state() { return state; },
    get mode() { return mode; },
    get status() { return status; },
    get lastError() { return lastError; },
    get login() { return login; },
    get loadedAt() { return loadedAt; },
    hasToken: function () { return !!getToken(); },
    subscribe: function (fn) { listeners.push(fn); },

    load: async function () {
      lastError = "";
      if (getToken()) {
        try {
          if (!login) {
            var u = await api("/user");
            if (u.ok) login = (await u.json()).login;
          }
          var remote = await fetchRemote();
          if (remote.missing) {
            // First run on a branch without the file: seed from the site copy.
            var seed = await fetchStatic();
            var created = await putRemote(seed, null, "Initialize tracker data");
            base = seed; baseSha = created.sha;
          } else {
            base = remote.data; baseSha = remote.sha;
          }
          mode = "github";
        } catch (err) {
          console.error(err);
          lastError = err.message || String(err);
          mode = "error";
          if (cfg.publicRead !== false) { try { base = await fetchStatic(); } catch (e) {} }
        }
      } else if (cfg.publicRead === false) {
        base = null; mode = "locked";
      } else {
        try { base = await fetchStatic(); mode = "readonly"; }
        catch (err) { lastError = err.message; mode = "error"; }
      }
      loadedAt = Date.now();
      recompute(); emit();
    },

    /** Apply fn(draft) now for the UI, then commit it to GitHub. */
    mutate: function (fn, message) {
      if (mode !== "github") return false;
      pending.push({ fn: fn, message: message });
      recompute(); emit();
      pump();
      return true;
    },

    isBusy: function () { return saving || pending.length > 0; },

    connect: async function (token) {
      setToken(token.trim());
      login = null;
      await this.load();
      return mode === "github";
    },
    disconnect: async function () {
      setToken("");
      login = null;
      await this.load();
    }
  };
})();
