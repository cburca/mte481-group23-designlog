/* G23 Tracker — Jira-style tracker for the MTE 481/482 design log. */
(function () {
  "use strict";

  var S = window.Store;
  var STATUSES = [
    { id: "todo", name: "To do" },
    { id: "inprogress", name: "In progress" },
    { id: "review", name: "In review" },
    { id: "done", name: "Done" }
  ];
  var PRIORITIES = [
    { id: "high", name: "High" },
    { id: "medium", name: "Medium" },
    { id: "low", name: "Low" }
  ];
  var VIEWS = { board: "Board", timeline: "Timeline", list: "List", worklog: "Work log", settings: "Settings" };
  var ME_KEY = "g23-tracker-me";
  var PREF_KEY = "g23-tracker-prefs";
  var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  var ui = {
    view: "board",
    ticket: null,
    filters: { disc: "all", epic: "", owner: "", q: "" },
    boardGroup: "none",
    tlZoom: "week",
    tlScroll: null,
    wlRange: "all",
    collapsed: {}
  };
  try {
    var saved = JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
    ["filters", "boardGroup", "tlZoom", "wlRange", "collapsed"].forEach(function (k) { if (saved[k] !== undefined) ui[k] = saved[k]; });
    ui.filters = Object.assign({ disc: "all", epic: "", owner: "", q: "" }, ui.filters);
  } catch (e) {}
  function savePrefs() {
    try { localStorage.setItem(PREF_KEY, JSON.stringify({ filters: ui.filters, boardGroup: ui.boardGroup, tlZoom: ui.tlZoom, wlRange: ui.wlRange, collapsed: ui.collapsed })); } catch (e) {}
  }

  /* ---------------- helpers ---------------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function fmtText(s) {
    var h = esc(s || "");
    h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
    h = h.replace(/(https?:\/\/[^\s<]+)/g, function (u) { return '<a href="' + u + '" target="_blank" rel="noopener">' + u + "</a>"; });
    return h.replace(/\n/g, "<br>");
  }
  function uid(p) { return (p || "x") + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function dstr(dt) { return dt.getFullYear() + "-" + String(dt.getMonth() + 1).padStart(2, "0") + "-" + String(dt.getDate()).padStart(2, "0"); }
  function parseD(s) { var p = s.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function today() { return dstr(new Date()); }
  function addDays(s, n) { var d = parseD(s); d.setDate(d.getDate() + n); return dstr(d); }
  function daysBetween(a, b) { return Math.round((parseD(b) - parseD(a)) / 86400000); }
  function mondayOf(s) { var d = parseD(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dstr(d); }
  function fmtDate(s) { if (!s) return ""; var p = s.split("-").map(Number); return MON[p[1] - 1] + " " + p[2]; }
  function fmtDateY(s) { if (!s) return ""; var p = s.split("-").map(Number); return MON[p[1] - 1] + " " + p[2] + ", " + p[0]; }
  function fmtStamp(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return MON[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function fmtH(n) { var v = Math.round((n || 0) * 100) / 100; return v + "h"; }
  function idNum(t) { return parseInt(String(t.id).split("-").pop(), 10) || 0; }

  function data() { return S.state; }
  function tickets() { return (data() && data().tickets) || []; }
  function epics() { return tickets().filter(function (t) { return t.type === "epic"; }).sort(function (a, b) { return idNum(a) - idNum(b); }); }
  function children(epicId) { return tickets().filter(function (t) { return t.parent === epicId; }); }
  function byId(id) { return tickets().find(function (t) { return t.id === id; }) || null; }
  function members() { return (data() && data().members) || []; }
  function member(id) { return members().find(function (m) { return m.id === id; }) || null; }
  function memberName(id) { if (!id) return "Unassigned"; var m = member(id); return m ? m.name : "Former member"; }
  function disciplines() { return (data() && data().disciplines) || []; }
  function discObj(id) { return disciplines().find(function (d) { return d.id === id; }) || { id: id || "", name: "None", color: "#8a94a3" }; }
  function discOf(t) { if (t.parent) { var p = byId(t.parent); if (p) return p.discipline; } return t.discipline; }
  function statusName(id) { var s = STATUSES.find(function (x) { return x.id === id; }); return s ? s.name : id; }
  function prioName(id) { var s = PRIORITIES.find(function (x) { return x.id === id; }); return s ? s.name : id; }
  function logged(t) { return (t.worklog || []).reduce(function (a, w) { return a + (Number(w.hours) || 0); }, 0); }
  function isOverdue(t) { return t.due && t.status !== "done" && t.due < today(); }

  function me() {
    var id = null;
    try { id = localStorage.getItem(ME_KEY); } catch (e) {}
    return id && member(id) ? id : null;
  }
  function setMe(id) { try { id ? localStorage.setItem(ME_KEY, id) : localStorage.removeItem(ME_KEY); } catch (e) {} }
  function canEdit() { return S.mode === "github"; }

  var AV_COLORS = ["#3d6fb6", "#c0562a", "#1f9a8a", "#7a5bc7", "#a8741a", "#2e8b57", "#b54a7a", "#4a6a8a"];
  function initials(name) { return String(name || "?").replace(/^Prof\.\s*/, "").split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase(); }
  function avatar(id, cls) {
    if (!id) return '<span class="av av--empty ' + (cls || "") + '" title="Unassigned">?</span>';
    var m = member(id), name = m ? m.name : "Former member";
    var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return '<span class="av ' + (cls || "") + '" style="--av:' + AV_COLORS[h % AV_COLORS.length] + '" title="' + esc(name) + '">' + esc(initials(name)) + "</span>";
  }
  function discPill(id, label) {
    var d = discObj(id);
    return '<span class="pill" style="--c:' + esc(d.color) + '">' + esc(label || d.name) + "</span>";
  }
  function statusChip(s) { return '<span class="st st--' + esc(s) + '">' + esc(statusName(s)) + "</span>"; }
  function memberOptions(sel, emptyLabel) {
    var o = '<option value="">' + esc(emptyLabel || "Unassigned") + "</option>";
    var groups = [["student", "Team"], ["instructor", "Instructors"]];
    groups.forEach(function (g) {
      var list = members().filter(function (m) { return (m.role || "student") === g[0]; });
      if (!list.length) return;
      o += '<optgroup label="' + g[1] + '">' + list.map(function (m) {
        return '<option value="' + esc(m.id) + '"' + (m.id === sel ? " selected" : "") + ">" + esc(m.name) + "</option>";
      }).join("") + "</optgroup>";
    });
    if (sel && !member(sel)) o += '<option value="' + esc(sel) + '" selected>Former member</option>';
    return o;
  }
  function discOptions(sel) {
    return disciplines().map(function (d) { return '<option value="' + esc(d.id) + '"' + (d.id === sel ? " selected" : "") + ">" + esc(d.name) + "</option>"; }).join("");
  }
  function epicOptions(sel, emptyLabel) {
    return '<option value="">' + esc(emptyLabel || "No epic") + "</option>" + epics().map(function (e) {
      return '<option value="' + esc(e.id) + '"' + (e.id === sel ? " selected" : "") + ">" + esc(e.id + " · " + e.title) + "</option>";
    }).join("");
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $("#toast");
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 3200);
  }

  function matches(t) {
    var f = ui.filters;
    if (f.disc !== "all" && discOf(t) !== f.disc) return false;
    if (f.epic && t.id !== f.epic && t.parent !== f.epic) return false;
    if (f.owner === "__none" && t.owner) return false;
    if (f.owner && f.owner !== "__none" && t.owner !== f.owner) return false;
    if (f.q) {
      var q = f.q.toLowerCase();
      if ((t.id + " " + t.title).toLowerCase().indexOf(q) === -1) return false;
    }
    return true;
  }
  function filtersActive() { var f = ui.filters; return f.disc !== "all" || f.epic || f.owner || f.q; }
  function sortTasks(list) {
    var pr = { high: 0, medium: 1, low: 2 };
    return list.slice().sort(function (a, b) {
      return (pr[a.priority] - pr[b.priority]) || ((a.due || "9999") < (b.due || "9999") ? -1 : (a.due || "9999") > (b.due || "9999") ? 1 : 0) || idNum(a) - idNum(b);
    });
  }

  /* ---------------- mutations ---------------- */

  function guard() {
    if (!canEdit()) { toast("Read-only. Connect your GitHub account in Settings to make changes."); return null; }
    var who = me();
    if (!who) { toast("Choose who you are in Settings first."); location.hash = "#settings"; return null; }
    return who;
  }
  function hist(t, by, at, text) { (t.history = t.history || []).push({ at: at, by: by, text: text }); }

  /** Change one ticket. fn(ticket, data, who, at) */
  function change(ticketId, fn, msg) {
    var who = guard(); if (!who) return false;
    var at = new Date().toISOString();
    return S.mutate(function (d) {
      var t = d.tickets.find(function (x) { return x.id === ticketId; });
      if (!t) return;
      fn(t, d, who, at);
      t.updated = at;
    }, ticketId + ": " + msg + " (" + memberName(who) + ")");
  }

  var FIELD_LABEL = { status: "status", owner: "owner", reporter: "reporter", approver: "approver", priority: "priority", start: "start date", due: "due date", estimate: "estimate", parent: "epic", discipline: "discipline", title: "title", description: "description" };
  function describe(field, v) {
    if (v === null || v === undefined || v === "") return "none";
    if (field === "status") return statusName(v);
    if (field === "owner" || field === "reporter" || field === "approver") return memberName(v);
    if (field === "priority") return prioName(v);
    if (field === "start" || field === "due") return fmtDateY(v);
    if (field === "estimate") return fmtH(v);
    if (field === "discipline") return discObj(v).name;
    if (field === "parent") { var e = byId(v); return e ? v + " " + e.title : v; }
    return String(v);
  }

  function setField(id, field, raw) {
    var t = byId(id); if (!t) return;
    var value = raw;
    if (["owner", "reporter", "approver", "start", "due", "parent"].indexOf(field) > -1 && value === "") value = null;
    if (field === "estimate") value = raw === "" ? null : Math.max(0, Number(raw));
    if (field === "title") { value = String(raw).trim(); if (!value) { toast("A ticket needs a title."); render(); return; } }
    if ((t[field] === undefined ? null : t[field]) === value) return;
    var start = field === "start" ? value : t.start, due = field === "due" ? value : t.due;
    if (start && due && start > due) { toast("Start date can't be after the due date."); render(); return; }
    var label = FIELD_LABEL[field] || field;
    var msg = field === "description" ? "edit description" : "set " + label + " to " + describe(field, value);
    change(id, function (tk, d, who, at) {
      var old = tk[field] === undefined ? null : tk[field];
      if (field === "parent" && !value && old) {
        var p = d.tickets.find(function (x) { return x.id === old; });
        if (p) tk.discipline = p.discipline;
      }
      tk[field] = value;
      if (field === "status" && value !== "done" && tk.accepted) {
        tk.accepted = null;
        hist(tk, who, at, "Acceptance cleared (moved out of Done)");
      }
      if (field === "description") hist(tk, who, at, "Edited the description");
      else hist(tk, who, at, "Changed " + label + " from " + describe(field, old) + " to " + describe(field, value));
    }, msg);
  }

  /* ---------------- rendering ---------------- */

  function preserveDrafts() {
    var drafts = {};
    $all("[data-keep]").forEach(function (el) { if (el.dataset.dirty === "1") drafts[el.dataset.keep] = el.value; });
    var a = document.activeElement, focus = null;
    if (a && (a.id || a.dataset.keep)) focus = { id: a.id, keep: a.dataset.keep, s: a.selectionStart, e: a.selectionEnd };
    return { drafts: drafts, focus: focus };
  }
  function restoreDrafts(p) {
    Object.keys(p.drafts).forEach(function (k) {
      var el = $('[data-keep="' + k + '"]');
      if (el) { el.value = p.drafts[k]; el.dataset.dirty = "1"; }
    });
    if (p.focus) {
      var el = p.focus.id ? document.getElementById(p.focus.id) : $('[data-keep="' + p.focus.keep + '"]');
      if (el && el !== document.activeElement) {
        el.focus();
        try { if (p.focus.s != null) el.setSelectionRange(p.focus.s, p.focus.e); } catch (e) {}
      }
    }
  }

  function render() {
    var keep = preserveDrafts();
    $all(".nav a").forEach(function (a) { a.classList.toggle("is-active", a.dataset.view === ui.view); });
    $("#view-title").textContent = VIEWS[ui.view];
    document.title = VIEWS[ui.view] + " · G23 Tracker";
    renderSync();
    renderBanner();
    if (!data()) {
      $("#filters").innerHTML = "";
      $("#view").innerHTML = S.mode === "locked"
        ? '<div class="empty"><h2>Connect GitHub to view the tracker</h2><p>Ticket data is kept in a private branch. Team members and instructors who are collaborators on the repository can connect in Settings.</p><p><a class="btn btn--primary" href="#settings">Open Settings</a></p></div>'
        : S.mode === "error"
        ? '<div class="empty"><h2>Couldn\'t load the tracker</h2><p>' + esc(S.lastError) + '</p><p><a href="#settings">Open Settings</a></p></div>'
        : '<div class="empty"><p>Loading tickets…</p></div>';
      if (ui.view === "settings") $("#view").innerHTML = renderSettings();
      renderDrawer();
      restoreDrafts(keep);
      return;
    }
    $("#filters").innerHTML = ui.view === "settings" ? "" : renderFilters();
    var html = "";
    if (ui.view === "board") html = renderBoard();
    else if (ui.view === "timeline") html = renderTimeline();
    else if (ui.view === "list") html = renderList();
    else if (ui.view === "worklog") html = renderWorklog();
    else if (ui.view === "settings") html = renderSettings();
    $("#view").innerHTML = html;
    if (ui.view === "timeline") afterTimeline();
    renderDrawer();
    restoreDrafts(keep);
  }

  function renderSync() {
    var el = $("#sync-status"), who = me();
    var txt, cls;
    if (S.mode === "loading") { txt = "Loading…"; cls = "is-muted"; }
    else if (S.mode === "readonly") { txt = "Read-only"; cls = "is-muted"; }
    else if (S.mode === "locked") { txt = "Not connected"; cls = "is-muted"; }
    else if (S.mode === "error") { txt = "Not connected"; cls = "is-error"; }
    else if (S.status === "saving") { txt = "Saving to GitHub…"; cls = "is-busy"; }
    else if (S.status === "error") { txt = "Last save failed"; cls = "is-error"; }
    else { txt = "Synced with GitHub"; cls = "is-ok"; }
    el.className = "sync " + cls;
    el.innerHTML = '<span class="sync__dot"></span>' + esc(txt);
    $("#whoami").innerHTML = who
      ? avatar(who, "av--sm") + "<span>" + esc(memberName(who)) + (S.login ? '<small>@' + esc(S.login) + "</small>" : "") + "</span>"
      : '<a href="#settings">Set who you are</a>';
  }

  function renderBanner() {
    var b = $("#banner"), html = "";
    if (S.status === "error" && S.lastError) {
      html = '<div class="banner banner--error"><strong>Your last change wasn\'t saved.</strong> ' + esc(S.lastError) + ' <button class="linkbtn" data-action="refresh">Reload</button></div>';
    } else if (S.mode === "error" && data()) {
      html = '<div class="banner banner--error"><strong>Couldn\'t connect to GitHub.</strong> ' + esc(S.lastError) + ' Showing the last published copy, read-only. <a href="#settings">Fix in Settings</a></div>';
    } else if (S.mode === "readonly" && ui.view !== "settings") {
      html = '<div class="banner">Read-only view. To create tickets, log time or comment, <a href="#settings">connect your GitHub account</a>.</div>';
    } else if (S.mode === "github" && !me() && ui.view !== "settings") {
      html = '<div class="banner">Connected to GitHub. <a href="#settings">Choose who you are</a> so your changes are attributed to you.</div>';
    }
    b.innerHTML = html;
  }

  function renderFilters() {
    var f = ui.filters;
    var chips = '<button class="chip' + (f.disc === "all" ? " is-on" : "") + '" data-action="disc" data-disc="all">All</button>' +
      disciplines().map(function (d) {
        return '<button class="chip' + (f.disc === d.id ? " is-on" : "") + '" data-action="disc" data-disc="' + esc(d.id) + '" style="--c:' + esc(d.color) + '"><span class="dot"></span>' + esc(d.name) + "</button>";
      }).join("");
    var epicList = epics().filter(function (e) { return f.disc === "all" || e.discipline === f.disc; });
    var ownerOpts = '<option value="">Anyone</option><option value="__none"' + (f.owner === "__none" ? " selected" : "") + '>Unassigned</option>' +
      members().map(function (m) { return '<option value="' + esc(m.id) + '"' + (f.owner === m.id ? " selected" : "") + ">" + esc(m.name) + "</option>"; }).join("");
    return '<div class="chips" role="group" aria-label="Filter by discipline">' + chips + "</div>" +
      '<div class="filters__right">' +
      '<label class="fsel"><span>Epic</span><select id="f-epic" data-filter="epic"><option value="">All epics</option>' +
      epicList.map(function (e) { return '<option value="' + esc(e.id) + '"' + (f.epic === e.id ? " selected" : "") + ">" + esc(e.id + " · " + e.title) + "</option>"; }).join("") +
      "</select></label>" +
      '<label class="fsel"><span>Owner</span><select id="f-owner" data-filter="owner">' + ownerOpts + "</select></label>" +
      '<input id="f-q" class="search" type="search" placeholder="Search tickets" value="' + esc(f.q) + '" data-filter="q" aria-label="Search tickets">' +
      (filtersActive() ? '<button class="linkbtn" data-action="clear-filters">Clear</button>' : "") +
      "</div>";
  }

  function emptyState(msg) {
    return '<div class="empty"><p>' + esc(msg) + "</p>" + (filtersActive() ? '<button class="btn btn--ghost" data-action="clear-filters">Clear filters</button>' : "") + "</div>";
  }

  /* ----- Board ----- */

  function card(t) {
    var ep = t.parent ? byId(t.parent) : null;
    var ck = t.checklist || [], done = ck.filter(function (c) { return c.done; }).length;
    var meta = "";
    if (ck.length) meta += '<span class="meta" title="Checklist">☑ ' + done + "/" + ck.length + "</span>";
    if ((t.comments || []).length) meta += '<span class="meta" title="Comments">💬 ' + t.comments.length + "</span>";
    var lh = logged(t);
    if (lh) meta += '<span class="meta" title="Time logged">⏱ ' + fmtH(lh) + "</span>";
    if (t.due) meta += '<span class="meta due' + (isOverdue(t) ? " is-late" : "") + '" title="Due date">' + (isOverdue(t) ? "Overdue · " : "Due ") + fmtDate(t.due) + "</span>";
    return '<article class="card" draggable="' + (canEdit() ? "true" : "false") + '" data-open="' + esc(t.id) + '" data-card="' + esc(t.id) + '" tabindex="0">' +
      '<div class="card__title">' + esc(t.title) + "</div>" +
      (ep ? '<div class="card__epic">' + discPill(ep.discipline, ep.title) + "</div>" : (t.discipline ? '<div class="card__epic">' + discPill(t.discipline) + "</div>" : "")) +
      (meta ? '<div class="card__meta">' + meta + "</div>" : "") +
      '<div class="card__foot"><span class="key">' + esc(t.id) + "</span>" +
      '<span class="prio prio--' + esc(t.priority) + '" title="' + esc(prioName(t.priority)) + ' priority"></span>' +
      (t.accepted ? '<span class="accepted" title="Accepted by ' + esc(memberName(t.accepted.by)) + '">✓ Accepted</span>' : (t.status === "done" && t.approver ? '<span class="awaiting" title="Awaiting acceptance">Awaiting acceptance</span>' : "")) +
      '<span class="card__owner">' + avatar(t.owner, "av--sm") + "</span></div></article>";
  }

  function columns(list, laneKey) {
    return '<div class="cols">' + STATUSES.map(function (s) {
      var items = sortTasks(list.filter(function (t) { return t.status === s.id; }));
      return '<div class="col" data-drop="' + s.id + '"' + (laneKey ? ' data-lane="' + esc(laneKey) + '"' : "") + ">" +
        (laneKey ? "" : '<div class="col__head">' + statusChip(s.id) + '<span class="count">' + items.length + "</span></div>") +
        '<div class="col__body">' + items.map(card).join("") + "</div></div>";
    }).join("") + "</div>";
  }

  function renderBoard() {
    var tasks = tickets().filter(function (t) { return t.type !== "epic" && matches(t); });
    var toolbar = '<div class="viewbar"><div class="seg" role="group" aria-label="Group board">' +
      '<button class="' + (ui.boardGroup === "none" ? "is-on" : "") + '" data-action="board-group" data-group="none">No grouping</button>' +
      '<button class="' + (ui.boardGroup === "epic" ? "is-on" : "") + '" data-action="board-group" data-group="epic">Group by epic</button></div>' +
      '<span class="viewbar__note">' + tasks.length + " ticket" + (tasks.length === 1 ? "" : "s") + (canEdit() ? " · drag cards between columns to change status" : "") + "</span></div>";
    if (!tasks.length) return toolbar + emptyState(tickets().length ? "No tickets match these filters." : "No tickets yet. Create the first one.");
    if (ui.boardGroup !== "epic") return toolbar + '<div class="board">' + columns(tasks) + "</div>";

    var head = '<div class="cols cols--head">' + STATUSES.map(function (s) {
      return '<div class="col__head">' + statusChip(s.id) + '<span class="count">' + tasks.filter(function (t) { return t.status === s.id; }).length + "</span></div>";
    }).join("") + "</div>";
    var lanes = epics().map(function (e) {
      var items = tasks.filter(function (t) { return t.parent === e.id; });
      if (!items.length) return "";
      var open = !ui.collapsed["b:" + e.id];
      return '<section class="lane">' +
        '<button class="lane__head" data-action="collapse" data-key="b:' + esc(e.id) + '" aria-expanded="' + open + '">' +
        '<span class="caret">' + (open ? "▾" : "▸") + "</span>" + discPill(e.discipline) +
        '<span class="key">' + esc(e.id) + '</span><span class="lane__title">' + esc(e.title) + '</span><span class="count">' + items.length + "</span></button>" +
        (open ? columns(items, e.id) : "") + "</section>";
    }).join("");
    var orphans = tasks.filter(function (t) { return !t.parent || !byId(t.parent); });
    if (orphans.length) {
      var open = !ui.collapsed["b:none"];
      lanes += '<section class="lane"><button class="lane__head" data-action="collapse" data-key="b:none" aria-expanded="' + open + '">' +
        '<span class="caret">' + (open ? "▾" : "▸") + '</span><span class="lane__title">Tickets without an epic</span><span class="count">' + orphans.length + "</span></button>" +
        (open ? columns(orphans, "none") : "") + "</section>";
    }
    return toolbar + '<div class="board board--lanes">' + head + lanes + "</div>";
  }

  /* ----- Timeline ----- */

  function renderTimeline() {
    var f = ui.filters;
    var dayW = ui.tlZoom === "month" ? 7 : 20;
    var laneEpics = epics().filter(function (e) { return (f.disc === "all" || e.discipline === f.disc) && (!f.epic || e.id === f.epic); });
    var narrow = f.owner || f.q;
    var lanes = laneEpics.map(function (e) {
      var items = children(e.id).filter(matches);
      return { epic: e, items: items };
    }).filter(function (l) { return l.items.length || !narrow; });
    if (!f.epic) {
      var orphans = tickets().filter(function (t) { return t.type !== "epic" && (!t.parent || !byId(t.parent)) && matches(t); });
      if (orphans.length) lanes.push({ epic: null, items: orphans });
    }
    var toolbar = '<div class="viewbar"><div class="seg" role="group" aria-label="Zoom">' +
      '<button class="' + (ui.tlZoom === "week" ? "is-on" : "") + '" data-action="tl-zoom" data-zoom="week">Weeks</button>' +
      '<button class="' + (ui.tlZoom === "month" ? "is-on" : "") + '" data-action="tl-zoom" data-zoom="month">Months</button></div>' +
      '<button class="btn btn--ghost btn--sm" data-action="tl-today">Jump to today</button>' +
      '<span class="legend">' + STATUSES.map(function (s) { return '<span><i class="lg lg--' + s.id + '"></i>' + s.name + "</span>"; }).join("") +
      '<span><i class="lg lg--today"></i>Today</span><span><i class="lg lg--ms"></i>Course milestone</span></span></div>';
    if (!lanes.length) return toolbar + emptyState("No epics match these filters.");

    // Date range
    var dates = [today()];
    lanes.forEach(function (l) {
      if (l.epic) { if (l.epic.start) dates.push(l.epic.start); if (l.epic.due) dates.push(l.epic.due); }
      l.items.forEach(function (t) { if (t.start) dates.push(t.start); if (t.due) dates.push(t.due); });
    });
    var ms = (data().milestones || []);
    ms.forEach(function (m) { dates.push(m.date); });
    dates.sort();
    var start = mondayOf(addDays(dates[0], -7));
    var end = addDays(dates[dates.length - 1], 21);
    var days = Math.ceil((daysBetween(start, end) + 1) / 7) * 7;
    var W = days * dayW;
    function x(s) { return daysBetween(start, s) * dayW; }

    // Header: months + weeks
    var months = "", weeks = "";
    for (var i = 0; i < days; i++) {
      var ds = addDays(start, i), dd = parseD(ds);
      if (dd.getDate() === 1 || i === 0) {
        months += '<span class="tl__month" style="left:' + (i * dayW) + 'px">' + MON[dd.getMonth()] + " " + dd.getFullYear() + "</span>";
      }
      if (dd.getDay() === 1) {
        weeks += '<span class="tl__week" style="left:' + (i * dayW) + 'px">' + (ui.tlZoom === "month" ? dd.getDate() : fmtDate(ds)) + "</span>";
      }
    }
    var marks = ms.map(function (m) {
      return '<span class="tl__mark" style="left:' + (x(m.date) + dayW / 2) + 'px" title="' + esc(fmtDateY(m.date) + " · " + m.name) + '">' + esc(m.name) + "</span>";
    }).join("");
    var tx = x(today()) + dayW / 2;
    var head = '<div class="tl__row tl__row--head"><div class="tl__label tl__corner">Epic / ticket</div>' +
      '<div class="tl__track tl__scale" style="width:' + W + 'px"><div class="tl__months">' + months + '</div><div class="tl__weeks">' + weeks + "</div>" +
      '<div class="tl__marks">' + marks + '<span class="tl__todaytag" style="left:' + tx + 'px">Today</span></div></div></div>';

    function bar(t, cls) {
      if (!t.start && !t.due) return "";
      var s = t.start || t.due, e = t.due || t.start;
      var left = x(s), width = (daysBetween(s, e) + 1) * dayW;
      var single = !t.start || !t.due;
      var text = t.id + " · " + t.title;
      var inside = width >= 260;
      var tip = t.id + " · " + t.title + "\n" + (t.start ? fmtDateY(t.start) : "?") + " → " + (t.due ? fmtDateY(t.due) : "?") + "\n" + statusName(t.status) + " · " + memberName(t.owner);
      return '<button class="bar ' + cls + (single ? " bar--point" : "") + (isOverdue(t) ? " is-late" : "") + '" data-open="' + esc(t.id) + '" style="left:' + left + "px;width:" + Math.max(width, dayW) + 'px" title="' + esc(tip) + '">' +
        (inside ? '<span class="bar__text">' + esc(text) + "</span>" : "") + "</button>" +
        (inside ? "" : '<span class="bar__out" style="left:' + (left + Math.max(width, dayW) + 6) + 'px">' + esc(text) + "</span>");
    }

    var body = lanes.map(function (l) {
      var e = l.epic, key = e ? "t:" + e.id : "t:none", open = !ui.collapsed[key];
      var items = l.items.slice().sort(function (a, b) { return (a.start || a.due || "9999") < (b.start || b.due || "9999") ? -1 : 1; });
      var epicRow;
      if (e) {
        var kids = children(e.id), done = kids.filter(function (k) { return k.status === "done"; }).length;
        var es = e.start, ee = e.due;
        if (!es || !ee) {
          var ks = kids.map(function (k) { return k.start || k.due; }).filter(Boolean).sort();
          var ke = kids.map(function (k) { return k.due || k.start; }).filter(Boolean).sort();
          es = es || ks[0]; ee = ee || ke[ke.length - 1];
        }
        var pct = kids.length ? Math.round(done / kids.length * 100) : 0;
        var eb = "";
        if (es && ee) {
          var left = x(es), width = (daysBetween(es, ee) + 1) * dayW;
          eb = '<button class="ebar" data-open="' + esc(e.id) + '" style="left:' + left + "px;width:" + width + "px;--c:" + esc(discObj(e.discipline).color) + '" title="' + esc(e.id + " · " + e.title + "\n" + fmtDateY(es) + " → " + fmtDateY(ee) + "\n" + done + "/" + kids.length + " done") + '">' +
            '<span class="ebar__fill" style="width:' + pct + '%"></span></button>';
        }
        epicRow = '<div class="tl__row tl__row--epic"><div class="tl__label">' +
          '<button class="caretbtn" data-action="collapse" data-key="' + key + '" aria-expanded="' + open + '" aria-label="Toggle lane">' + (open ? "▾" : "▸") + "</button>" +
          '<span class="swatch" style="--c:' + esc(discObj(e.discipline).color) + '"></span>' +
          '<button class="tl__name" data-open="' + esc(e.id) + '"><span class="key">' + esc(e.id) + "</span> " + esc(e.title) + "</button>" +
          '<span class="tl__pct">' + done + "/" + kids.length + "</span></div>" +
          '<div class="tl__track" style="width:' + W + 'px">' + eb + "</div></div>";
      } else {
        epicRow = '<div class="tl__row tl__row--epic"><div class="tl__label">' +
          '<button class="caretbtn" data-action="collapse" data-key="' + key + '" aria-expanded="' + open + '" aria-label="Toggle lane">' + (open ? "▾" : "▸") + "</button>" +
          '<span class="tl__name tl__name--plain">Tickets without an epic</span></div><div class="tl__track" style="width:' + W + 'px"></div></div>';
      }
      var rows = open ? items.map(function (t) {
        return '<div class="tl__row"><div class="tl__label tl__label--child">' +
          '<i class="sdot sdot--' + esc(t.status) + '" title="' + esc(statusName(t.status)) + '"></i>' +
          '<button class="tl__name" data-open="' + esc(t.id) + '"><span class="key">' + esc(t.id) + "</span> " + esc(t.title) + "</button>" +
          (!t.start && !t.due ? '<span class="nodates">no dates</span>' : "") + avatar(t.owner, "av--xs") + "</div>" +
          '<div class="tl__track" style="width:' + W + 'px">' + bar(t, "bar--" + t.status) + "</div></div>";
      }).join("") : "";
      if (open && !items.length) rows = '<div class="tl__row"><div class="tl__label tl__label--child tl__empty">No child tickets yet</div><div class="tl__track" style="width:' + W + 'px"></div></div>';
      return '<div class="tl__lane">' + epicRow + rows + "</div>";
    }).join("");

    var lines = ms.map(function (m) { return '<span class="tl__msline" style="left:calc(var(--lw) + ' + (x(m.date) + dayW / 2) + 'px)"></span>'; }).join("") +
      '<span class="tl__todayline" style="left:calc(var(--lw) + ' + tx + 'px)"></span>';

    return toolbar + '<div class="tl" id="tl-scroll" data-today="' + tx + '"><div class="tl__inner" style="width:calc(var(--lw) + ' + W + "px);--week:" + (7 * dayW) + 'px">' +
      head + '<div class="tl__body">' + body + lines + "</div></div></div>";
  }

  function afterTimeline() {
    var el = $("#tl-scroll"); if (!el) return;
    if (ui.tlScroll === null) {
      el.scrollLeft = Math.max(0, Number(el.dataset.today) - Math.min(160, el.clientWidth * 0.15));
    } else el.scrollLeft = ui.tlScroll;
    el.addEventListener("scroll", function () { ui.tlScroll = el.scrollLeft; }, { passive: true });
  }

  /* ----- List ----- */

  function renderList() {
    var f = ui.filters;
    var laneEpics = epics().filter(function (e) { return (f.disc === "all" || e.discipline === f.disc) && (!f.epic || e.id === f.epic); });
    var narrow = f.owner || f.q;
    var head = "<thead><tr><th>Key</th><th>Title</th><th>Status</th><th>Owner</th><th>Approver</th><th>Start</th><th>Due</th><th class=\"num\">Logged</th><th>Checklist</th></tr></thead>";
    function row(t, isEpic) {
      var ck = t.checklist || [], done = ck.filter(function (c) { return c.done; }).length;
      var lh = isEpic ? children(t.id).reduce(function (a, k) { return a + logged(k); }, logged(t)) : logged(t);
      return '<tr class="' + (isEpic ? "row--epic" : "") + '" data-open="' + esc(t.id) + '" tabindex="0">' +
        '<td class="key">' + esc(t.id) + "</td>" +
        "<td>" + (isEpic ? discPill(t.discipline) + " " : "") + esc(t.title) + (t.accepted ? ' <span class="accepted">✓</span>' : "") + "</td>" +
        "<td>" + statusChip(t.status) + "</td>" +
        '<td><span class="who">' + avatar(t.owner, "av--xs") + esc(memberName(t.owner)) + "</span></td>" +
        "<td>" + (t.approver ? esc(memberName(t.approver)) : '<span class="muted">—</span>') + "</td>" +
        "<td>" + esc(fmtDate(t.start)) + "</td>" +
        '<td class="' + (isOverdue(t) ? "is-late" : "") + '">' + esc(fmtDate(t.due)) + "</td>" +
        '<td class="num">' + (lh ? fmtH(lh) : '<span class="muted">—</span>') + "</td>" +
        "<td>" + (ck.length ? done + "/" + ck.length : '<span class="muted">—</span>') + "</td></tr>";
    }
    var body = "";
    laneEpics.forEach(function (e) {
      var kids = sortTasks(children(e.id).filter(matches));
      if (narrow && !kids.length) return;
      body += row(e, true) + kids.map(function (k) { return row(k, false); }).join("");
    });
    if (!f.epic) {
      var orphans = sortTasks(tickets().filter(function (t) { return t.type !== "epic" && (!t.parent || !byId(t.parent)) && matches(t); }));
      if (orphans.length) body += '<tr class="row--group"><td colspan="9">Tickets without an epic</td></tr>' + orphans.map(function (k) { return row(k, false); }).join("");
    }
    if (!body) return emptyState("No tickets match these filters.");
    return '<div class="tablewrap"><table class="table">' + head + "<tbody>" + body + "</tbody></table></div>";
  }

  /* ----- Work log ----- */

  function wlEntries() {
    var out = [];
    var r = ui.wlRange, t0 = null, td = today();
    if (r === "week") t0 = mondayOf(td);
    else if (r === "14") t0 = addDays(td, -13);
    else if (r === "30") t0 = addDays(td, -29);
    tickets().filter(matches).forEach(function (t) {
      (t.worklog || []).forEach(function (w) {
        if (t0 && w.date < t0) return;
        out.push({ w: w, t: t });
      });
    });
    return out.sort(function (a, b) { return a.w.date < b.w.date ? 1 : a.w.date > b.w.date ? -1 : 0; });
  }

  function renderWorklog() {
    var entries = wlEntries();
    var ranges = [["all", "All time"], ["week", "This week"], ["14", "Last 14 days"], ["30", "Last 30 days"]];
    var toolbar = '<div class="viewbar"><div class="seg" role="group" aria-label="Date range">' +
      ranges.map(function (r) { return '<button class="' + (ui.wlRange === r[0] ? "is-on" : "") + '" data-action="wl-range" data-range="' + r[0] + '">' + r[1] + "</button>"; }).join("") +
      '</div><button class="btn btn--ghost btn--sm" data-action="export-csv"' + (entries.length ? "" : " disabled") + ">Export CSV</button></div>";

    // Quick log form
    var ticketOpts = '<option value="">Choose a ticket…</option>' + epics().map(function (e) {
      return '<optgroup label="' + esc(e.id + " · " + e.title) + '"><option value="' + esc(e.id) + '">' + esc(e.id + " · " + e.title + " (epic)") + "</option>" +
        sortTasks(children(e.id)).map(function (k) { return '<option value="' + esc(k.id) + '">' + esc(k.id + " · " + k.title) + "</option>"; }).join("") + "</optgroup>";
    }).join("");
    var orph = tickets().filter(function (t) { return t.type !== "epic" && (!t.parent || !byId(t.parent)); });
    if (orph.length) ticketOpts += '<optgroup label="No epic">' + orph.map(function (k) { return '<option value="' + esc(k.id) + '">' + esc(k.id + " · " + k.title) + "</option>"; }).join("") + "</optgroup>";
    var quick = canEdit() ? '<form class="quicklog" data-form="quicklog">' +
      '<h2 class="h2">Log time</h2><div class="quicklog__row">' +
      '<label class="field field--grow"><span>Ticket</span><select name="ticket" required data-keep="ql-ticket">' + ticketOpts + "</select></label>" +
      '<label class="field"><span>Date</span><input type="date" name="date" value="' + today() + '" required data-keep="ql-date"></label>' +
      '<label class="field field--sm"><span>Hours</span><input type="number" name="hours" min="0.25" step="0.25" required placeholder="1.5" data-keep="ql-hours"></label>' +
      '<label class="field field--grow"><span>What did you do?</span><input type="text" name="note" placeholder="e.g. CAD of motor mount, first pass" data-keep="ql-note"></label>' +
      '<button class="btn btn--primary" type="submit">Log time</button></div>' +
      '<p class="hint">Logged as ' + esc(me() ? memberName(me()) : "— choose who you are in Settings") + ".</p></form>" : "";

    if (!entries.length) return toolbar + quick + emptyState("No time logged" + (ui.wlRange === "all" ? "" : " in this range") + (filtersActive() ? " for these filters" : "") + " yet.");

    // Totals per member
    var byMember = {}, total = 0;
    entries.forEach(function (x) { var k = x.w.member; byMember[k] = (byMember[k] || 0) + Number(x.w.hours || 0); total += Number(x.w.hours || 0); });
    var ids = Object.keys(byMember).sort(function (a, b) { return byMember[b] - byMember[a]; });
    var max = Math.max.apply(null, ids.map(function (k) { return byMember[k]; }));
    var totals = '<div class="totals">' + ids.map(function (k) {
      return '<div class="total"><div class="total__who">' + avatar(k, "av--sm") + "<span>" + esc(memberName(k)) + '</span></div><div class="total__num">' + fmtH(byMember[k]) + "</div>" +
        '<div class="total__bar"><span style="width:' + (byMember[k] / max * 100) + '%"></span></div>' +
        '<div class="total__pct">' + Math.round(byMember[k] / total * 100) + "% of team hours</div></div>";
    }).join("") + "</div>";

    // Member × discipline matrix
    var dl = disciplines();
    var mat = '<div class="tablewrap"><table class="table table--compact"><thead><tr><th>Member</th>' + dl.map(function (d) { return "<th class=\"num\">" + discPill(d.id) + "</th>"; }).join("") + '<th class="num">Total</th></tr></thead><tbody>' +
      ids.map(function (k) {
        var cells = dl.map(function (d) {
          var h = entries.filter(function (x) { return x.w.member === k && discOf(x.t) === d.id; }).reduce(function (a, x) { return a + Number(x.w.hours || 0); }, 0);
          return '<td class="num">' + (h ? fmtH(h) : '<span class="muted">—</span>') + "</td>";
        }).join("");
        return "<tr><td>" + esc(memberName(k)) + "</td>" + cells + '<td class="num"><strong>' + fmtH(byMember[k]) + "</strong></td></tr>";
      }).join("") + "</tbody></table></div>";

    // Weekly
    var wk0 = mondayOf(today()), weeks = [];
    for (var i = 7; i >= 0; i--) weeks.push(addDays(wk0, -7 * i));
    var weekly = '<div class="tablewrap"><table class="table table--compact"><thead><tr><th>Member</th>' + weeks.map(function (w) { return '<th class="num">' + fmtDate(w) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      ids.map(function (k) {
        return "<tr><td>" + esc(memberName(k)) + "</td>" + weeks.map(function (w) {
          var end = addDays(w, 6);
          var h = entries.filter(function (x) { return x.w.member === k && x.w.date >= w && x.w.date <= end; }).reduce(function (a, x) { return a + Number(x.w.hours || 0); }, 0);
          return '<td class="num">' + (h ? fmtH(h) : '<span class="muted">·</span>') + "</td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody></table></div>";

    var list = '<div class="tablewrap"><table class="table"><thead><tr><th>Date</th><th>Member</th><th>Ticket</th><th class="num">Hours</th><th>Note</th></tr></thead><tbody>' +
      entries.map(function (x) {
        return '<tr data-open="' + esc(x.t.id) + '" tabindex="0"><td class="nowrap">' + esc(fmtDateY(x.w.date)) + '</td><td><span class="who">' + avatar(x.w.member, "av--xs") + esc(memberName(x.w.member)) + "</span></td>" +
          '<td><span class="key">' + esc(x.t.id) + "</span> " + esc(x.t.title) + '</td><td class="num">' + fmtH(x.w.hours) + "</td><td>" + esc(x.w.note || "") + "</td></tr>";
      }).join("") + "</tbody></table></div>";

    return toolbar + quick +
      '<h2 class="h2">Hours by member <span class="h2__sub">' + fmtH(total) + " total</span></h2>" + totals +
      '<h2 class="h2">By discipline</h2>' + mat +
      '<h2 class="h2">Last 8 weeks</h2>' + weekly +
      '<h2 class="h2">Entries</h2>' + list;
  }

  function exportCsv() {
    var rows = [["Date", "Member", "Ticket", "Title", "Epic", "Discipline", "Hours", "Note"]];
    wlEntries().forEach(function (x) {
      var ep = x.t.type === "epic" ? x.t : (x.t.parent ? byId(x.t.parent) : null);
      rows.push([x.w.date, memberName(x.w.member), x.t.id, x.t.title, ep ? ep.id + " " + ep.title : "", discObj(discOf(x.t)).name, x.w.hours, x.w.note || ""]);
    });
    var csv = rows.map(function (r) { return r.map(function (c) { var s = String(c == null ? "" : c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(","); }).join("\n");
    var blob = new Blob([csv], { type: "text/csv" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "g23-worklog-" + today() + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ----- Settings ----- */

  function renderSettings() {
    var r = S.repoInfo(), who = me();
    var conn;
    if (S.mode === "github") {
      conn = '<p class="ok">Connected' + (S.login ? " as <strong>@" + esc(S.login) + "</strong>" : "") + ". You can create and edit tickets.</p>" +
        '<button class="btn btn--ghost" data-action="disconnect">Disconnect this browser</button>';
    } else {
      conn = (S.mode === "error" ? '<p class="err">' + esc(S.lastError) + "</p>" : '<p class="muted">Not connected. Everything is read-only until you connect.</p>') +
        '<form class="tokenform" data-form="token"><label class="field field--grow"><span>GitHub personal access token</span>' +
        '<input id="token-input" type="password" name="token" autocomplete="off" spellcheck="false" placeholder="ghp_… or github_pat_…" required></label>' +
        '<button class="btn btn--primary" type="submit">Connect</button></form>' +
        '<p class="hint">Create one at <a href="https://github.com/settings/tokens/new?scopes=repo&description=G23%20tracker" target="_blank" rel="noopener">github.com/settings/tokens</a> (classic token, <code>repo</code> scope, expiry at the end of term). ' +
        "The token is stored only in this browser and sent only to api.github.com.</p>";
    }
    var html = '<div class="settings">' +
      '<section class="panel"><h2 class="h2">GitHub connection</h2>' +
      '<dl class="kv"><dt>Repository</dt><dd>' + (r.owner && r.repo ? '<a href="https://github.com/' + esc(r.owner) + "/" + esc(r.repo) + '" target="_blank" rel="noopener">' + esc(r.owner + "/" + r.repo) + "</a>" : '<span class="err">Not detected — set owner and repo in assets/js/config.js</span>') + "</dd>" +
      "<dt>Data branch</dt><dd><code>" + esc(r.branch) + "</code></dd><dt>Data file</dt><dd><code>" + esc(r.path) + "</code></dd></dl>" + conn + "</section>";

    if (data()) {
      html += '<section class="panel"><h2 class="h2">Who are you?</h2>' +
        '<p class="muted">Used as the reporter on tickets you create and the author of your comments and time entries. Saved in this browser only.</p>' +
        '<label class="field"><span>I am</span><select id="me-select" data-action-change="set-me"><option value="">Choose…</option>' +
        members().map(function (m) { return '<option value="' + esc(m.id) + '"' + (m.id === who ? " selected" : "") + ">" + esc(m.name) + "</option>"; }).join("") +
        "</select></label></section>";

      html += '<section class="panel"><h2 class="h2">Team</h2><p class="muted">Changes save to GitHub as soon as you leave a field. Add each person\'s GitHub username and the tracker will recognise them automatically when they connect.</p>' +
        '<div class="tablewrap"><table class="table table--form"><thead><tr><th>Name</th><th>Role</th><th>GitHub username</th><th></th></tr></thead><tbody>' +
        members().map(function (m) {
          var dis = canEdit() ? "" : " disabled";
          return "<tr><td><input type=\"text\" value=\"" + esc(m.name) + '" data-member="' + esc(m.id) + '" data-mfield="name"' + dis + ' aria-label="Name"></td>' +
            '<td><select data-member="' + esc(m.id) + '" data-mfield="role"' + dis + ' aria-label="Role"><option value="student"' + (m.role !== "instructor" ? " selected" : "") + '>Team member</option><option value="instructor"' + (m.role === "instructor" ? " selected" : "") + ">Instructor</option></select></td>" +
            '<td><input type="text" value="' + esc(m.github || "") + '" placeholder="username" data-member="' + esc(m.id) + '" data-mfield="github"' + dis + ' aria-label="GitHub username"></td>' +
            '<td class="num">' + (canEdit() ? '<button class="linkbtn linkbtn--danger" data-action="remove-member" data-id="' + esc(m.id) + '">Remove</button>' : "") + "</td></tr>";
        }).join("") + "</tbody></table></div>" +
        (canEdit() ? '<button class="btn btn--ghost" data-action="add-member">Add person</button>' : "") + "</section>";

      html += '<section class="panel"><h2 class="h2">Backup</h2><p class="muted">Every change is already a commit in the repository history. You can also download the current data as a single JSON file.</p>' +
        '<button class="btn btn--ghost" data-action="download-json">Download tracker.json</button></section>';
    }
    return html + "</div>";
  }

  /* ----- Drawer (ticket detail) ----- */

  function renderDrawer() {
    var dr = $("#drawer"), bd = $("#drawer-backdrop");
    var t = ui.ticket ? byId(ui.ticket) : null;
    if (!t) { dr.hidden = true; bd.hidden = true; dr.innerHTML = ""; document.body.classList.remove("drawer-open"); return; }
    dr.hidden = false; bd.hidden = false; document.body.classList.add("drawer-open");
    var ed = canEdit(), dis = ed ? "" : " disabled";
    var who = me();
    var isEpic = t.type === "epic";
    var ep = t.parent ? byId(t.parent) : null;
    var d = discOf(t);

    var crumbs = discPill(d) + (ep ? '<button class="crumb" data-open="' + esc(ep.id) + '">' + esc(ep.id + " " + ep.title) + '</button><span class="sep">/</span>' : "") +
      '<span class="key">' + esc(t.id) + '</span><span class="typetag">' + (isEpic ? "Epic" : "Task") + "</span>";

    // Acceptance
    var acc = "";
    if (!isEpic || t.approver) {
      if (t.accepted) {
        acc = '<div class="accept accept--yes">✓ Accepted by <strong>' + esc(memberName(t.accepted.by)) + "</strong> · " + esc(fmtStamp(t.accepted.at)) +
          (ed && who === t.accepted.by ? ' <button class="linkbtn" data-action="unaccept">Revoke</button>' : "") + "</div>";
      } else if (t.status === "done" && t.approver) {
        acc = '<div class="accept">Awaiting acceptance by <strong>' + esc(memberName(t.approver)) + "</strong>" +
          (ed ? (who === t.approver ? ' <button class="btn btn--primary btn--sm" data-action="accept">Accept</button>' : ' <span class="muted">(only the approver can accept)</span>') : "") + "</div>";
      } else if (t.approver) {
        acc = '<div class="accept accept--muted">Needs acceptance by ' + esc(memberName(t.approver)) + " once Done</div>";
      }
    }

    // Children (epic)
    var kidsHtml = "";
    if (isEpic) {
      var kids = sortTasks(children(t.id));
      var done = kids.filter(function (k) { return k.status === "done"; }).length;
      kidsHtml = '<section class="dsec"><h3>Child tickets <span class="h3__sub">' + done + "/" + kids.length + " done</span></h3>" +
        (kids.length ? '<div class="progress"><span style="width:' + (kids.length ? done / kids.length * 100 : 0) + '%"></span></div><ul class="kids">' + kids.map(function (k) {
          return '<li data-open="' + esc(k.id) + '" tabindex="0"><span class="key">' + esc(k.id) + '</span><span class="kids__title">' + esc(k.title) + "</span>" + statusChip(k.status) + avatar(k.owner, "av--xs") + "</li>";
        }).join("") + "</ul>" : '<p class="muted">No child tickets yet.</p>') +
        (ed ? '<button class="btn btn--ghost btn--sm" data-action="create-child" data-parent="' + esc(t.id) + '">Add child ticket</button>' : "") + "</section>";
    }

    // Checklist
    var ck = t.checklist || [], ckDone = ck.filter(function (c) { return c.done; }).length;
    var checklist = '<section class="dsec"><h3>Checklist' + (ck.length ? ' <span class="h3__sub">' + ckDone + "/" + ck.length + "</span>" : "") + "</h3>" +
      (ck.length ? '<div class="progress"><span style="width:' + (ckDone / ck.length * 100) + '%"></span></div>' : "") +
      '<ul class="checklist">' + ck.map(function (c) {
        return '<li class="' + (c.done ? "is-done" : "") + '"><label><input type="checkbox" data-action-change="check" data-id="' + esc(c.id) + '"' + (c.done ? " checked" : "") + dis + "><span>" + esc(c.text) + "</span></label>" +
          (ed ? '<button class="x" data-action="check-del" data-id="' + esc(c.id) + '" aria-label="Remove item">×</button>' : "") + "</li>";
      }).join("") + "</ul>" +
      (ed ? '<form class="inline-form" data-form="check-add"><input type="text" name="text" placeholder="Add an item" data-keep="ck-add" required><button class="btn btn--ghost btn--sm" type="submit">Add</button></form>' : "") + "</section>";

    // Work log
    var wl = (t.worklog || []).slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var lh = logged(t);
    var worklog = '<section class="dsec"><h3>Work log <span class="h3__sub">' + fmtH(lh) + " logged" + (t.estimate ? " of " + fmtH(t.estimate) + " estimated" : "") + "</span></h3>" +
      (t.estimate ? '<div class="progress' + (lh > t.estimate ? " is-over" : "") + '"><span style="width:' + Math.min(100, lh / t.estimate * 100) + '%"></span></div>' : "") +
      (wl.length ? '<ul class="wl">' + wl.map(function (w) {
        return "<li>" + avatar(w.member, "av--xs") + '<span class="wl__who">' + esc(memberName(w.member)) + '</span><span class="wl__h">' + fmtH(w.hours) + '</span><span class="wl__date">' + esc(fmtDate(w.date)) + "</span>" +
          (w.note ? '<span class="wl__note">' + esc(w.note) + "</span>" : "") +
          (ed && who === w.member ? '<button class="x" data-action="wl-del" data-id="' + esc(w.id) + '" aria-label="Delete entry">×</button>' : "") + "</li>";
      }).join("") + "</ul>" : '<p class="muted">No time logged yet.</p>') +
      (ed ? '<form class="wlform" data-form="wl-add"><input type="date" name="date" value="' + today() + '" required aria-label="Date" data-keep="wl-date">' +
        '<input type="number" name="hours" min="0.25" step="0.25" placeholder="Hours" required aria-label="Hours" data-keep="wl-hours">' +
        '<input type="text" name="note" placeholder="What did you do?" aria-label="Note" data-keep="wl-note">' +
        '<button class="btn btn--ghost btn--sm" type="submit">Log time</button></form>' : "") + "</section>";

    // Comments
    var cm = t.comments || [];
    var comments = '<section class="dsec"><h3>Comments' + (cm.length ? ' <span class="h3__sub">' + cm.length + "</span>" : "") + "</h3>" +
      '<ul class="comments">' + cm.map(function (c) {
        return "<li>" + avatar(c.author, "av--sm") + '<div class="comment"><div class="comment__head"><strong>' + esc(memberName(c.author)) + "</strong><span>" + esc(fmtStamp(c.at)) + "</span>" +
          (ed && who === c.author ? '<button class="linkbtn linkbtn--danger" data-action="comment-del" data-id="' + esc(c.id) + '">Delete</button>' : "") +
          '</div><div class="comment__body">' + fmtText(c.body) + "</div></div></li>";
      }).join("") + "</ul>" +
      (ed ? '<form class="commentform" data-form="comment"><textarea name="body" rows="3" placeholder="Add a comment" required data-keep="comment"></textarea><button class="btn btn--primary btn--sm" type="submit">Comment</button></form>' : "") + "</section>";

    var history = (t.history || []).slice().reverse();
    var activity = '<section class="dsec"><details><summary><h3>Activity <span class="h3__sub">' + history.length + "</span></h3></summary><ul class=\"activity\">" +
      history.map(function (h) { return "<li><span>" + esc(fmtStamp(h.at)) + "</span> <strong>" + esc(memberName(h.by)) + "</strong> " + esc(h.text) + "</li>"; }).join("") +
      "</ul></details></section>";

    var side = '<dl class="fields">' +
      "<dt>Status</dt><dd><select data-field=\"status\"" + dis + ">" + STATUSES.map(function (s) { return '<option value="' + s.id + '"' + (t.status === s.id ? " selected" : "") + ">" + s.name + "</option>"; }).join("") + "</select></dd>" +
      "<dt>Owner</dt><dd><select data-field=\"owner\"" + dis + ">" + memberOptions(t.owner) + "</select></dd>" +
      "<dt>Approver</dt><dd><select data-field=\"approver\"" + dis + ">" + memberOptions(t.approver, "None") + "</select></dd>" +
      "<dt>Reporter</dt><dd><select data-field=\"reporter\"" + dis + ">" + memberOptions(t.reporter, "None") + "</select></dd>" +
      "<dt>Priority</dt><dd><select data-field=\"priority\"" + dis + ">" + PRIORITIES.map(function (p) { return '<option value="' + p.id + '"' + (t.priority === p.id ? " selected" : "") + ">" + p.name + "</option>"; }).join("") + "</select></dd>" +
      "<dt>Start date</dt><dd><input type=\"date\" data-field=\"start\" value=\"" + esc(t.start || "") + '"' + dis + "></dd>" +
      "<dt>Due date</dt><dd><input type=\"date\" data-field=\"due\" value=\"" + esc(t.due || "") + '"' + dis + (isOverdue(t) ? ' class="is-late"' : "") + "></dd>" +
      "<dt>Estimate (h)</dt><dd><input type=\"number\" min=\"0\" step=\"0.5\" data-field=\"estimate\" value=\"" + (t.estimate == null ? "" : esc(t.estimate)) + '"' + dis + "></dd>" +
      (isEpic
        ? "<dt>Discipline</dt><dd><select data-field=\"discipline\"" + dis + ">" + discOptions(t.discipline) + "</select></dd>"
        : "<dt>Epic</dt><dd><select data-field=\"parent\"" + dis + ">" + epicOptions(t.parent) + "</select></dd>" +
          (!t.parent ? "<dt>Discipline</dt><dd><select data-field=\"discipline\"" + dis + ">" + discOptions(t.discipline) + "</select></dd>" : "")) +
      "</dl>" +
      '<p class="stamp">Created ' + esc(fmtStamp(t.created)) + "<br>Updated " + esc(fmtStamp(t.updated)) + "</p>" +
      (ed ? '<button class="linkbtn linkbtn--danger" data-action="delete-ticket">Delete ' + (isEpic ? "epic" : "ticket") + "</button>" : "");

    dr.innerHTML = '<div class="drawer__head"><div class="crumbs">' + crumbs + "</div>" +
      '<div class="drawer__tools"><button class="btn btn--ghost btn--sm" data-action="copy-link">Copy link</button><button class="iconbtn" data-action="close" aria-label="Close">×</button></div></div>' +
      '<div class="drawer__scroll"><div class="drawer__main">' +
      '<textarea class="title-input" rows="1" data-field="title" data-keep="title" aria-label="Title"' + dis + ">" + esc(t.title) + "</textarea>" +
      acc +
      '<section class="dsec"><h3>Description</h3><textarea class="desc" rows="4" data-field="description" data-keep="desc" placeholder="' + (ed ? "Add a description" : "No description") + '"' + dis + ">" + esc(t.description || "") + "</textarea>" +
      (ed ? '<p class="hint">Saves when you click away.</p>' : "") + "</section>" +
      kidsHtml + checklist + worklog + comments + activity +
      '</div><div class="drawer__side">' + side + "</div></div>";
    autosize($(".title-input", dr));
  }

  function autosize(el) { if (!el) return; el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }

  /* ----- Create dialog ----- */

  function openCreate(opts) {
    if (!guard()) return;
    opts = opts || {};
    var dlg = $("#create-dialog");
    var type = opts.type || "task";
    var parent = opts.parent || (ui.filters.epic || "");
    var disc = ui.filters.disc !== "all" ? ui.filters.disc : (disciplines()[0] || {}).id;
    dlg.innerHTML = '<form method="dialog" class="create" data-form="create">' +
      '<div class="create__head"><h2>Create ticket</h2><button type="button" class="iconbtn" data-action="close-create" aria-label="Close">×</button></div>' +
      '<div class="seg seg--full" role="radiogroup" aria-label="Ticket type">' +
      '<label><input type="radio" name="type" value="task"' + (type === "task" ? " checked" : "") + "><span>Task</span></label>" +
      '<label><input type="radio" name="type" value="epic"' + (type === "epic" ? " checked" : "") + "><span>Epic</span></label></div>" +
      '<label class="field"><span>Title</span><input type="text" name="title" required placeholder="What needs to happen?" autofocus></label>' +
      '<div class="grid2">' +
      '<label class="field only-task"><span>Epic</span><select name="parent">' + epicOptions(parent) + "</select></label>" +
      '<label class="field only-disc"><span>Discipline</span><select name="discipline">' + discOptions(disc) + "</select></label>" +
      '<label class="field"><span>Owner</span><select name="owner">' + memberOptions("") + "</select></label>" +
      '<label class="field"><span>Approver</span><select name="approver">' + memberOptions("", "None") + "</select></label>" +
      '<label class="field"><span>Priority</span><select name="priority">' + PRIORITIES.map(function (p) { return '<option value="' + p.id + '"' + (p.id === "medium" ? " selected" : "") + ">" + p.name + "</option>"; }).join("") + "</select></label>" +
      '<label class="field"><span>Estimate (hours)</span><input type="number" name="estimate" min="0" step="0.5"></label>' +
      '<label class="field"><span>Start date</span><input type="date" name="start"></label>' +
      '<label class="field"><span>Due date</span><input type="date" name="due"></label>' +
      "</div>" +
      '<label class="field"><span>Description</span><textarea name="description" rows="4"></textarea></label>' +
      '<p class="hint">Reporter: ' + esc(memberName(me())) + "</p>" +
      '<div class="create__foot"><button type="button" class="btn btn--ghost" data-action="close-create">Cancel</button><button type="submit" class="btn btn--primary">Create</button></div></form>';
    syncCreateType();
    dlg.showModal();
    var ti = $('input[name="title"]', dlg); if (ti) ti.focus();
  }
  function syncCreateType() {
    var dlg = $("#create-dialog"), f = $("form", dlg); if (!f) return;
    var type = f.type.value, parent = f.parent.value;
    $(".only-task", dlg).hidden = type !== "task";
    $(".only-disc", dlg).hidden = type === "task" && !!parent;
  }
  function submitCreate(form) {
    var who = guard(); if (!who) return;
    var fd = new FormData(form);
    var type = fd.get("type"), title = String(fd.get("title") || "").trim();
    if (!title) return;
    var start = fd.get("start") || null, due = fd.get("due") || null;
    if (start && due && start > due) { toast("Start date can't be after the due date."); return; }
    var parent = type === "task" ? (fd.get("parent") || null) : null;
    var at = new Date().toISOString();
    var est = fd.get("estimate");
    var newId = null;
    var projectKey = (data().project && data().project.key) || "G23";
    var guess = projectKey + "-" + data().nextId;
    var ok = S.mutate(function (d) {
      var id = projectKey + "-" + d.nextId;
      d.nextId += 1;
      newId = id;
      d.tickets.push({
        id: id, type: type, title: title, description: String(fd.get("description") || ""),
        parent: parent, discipline: parent ? null : (fd.get("discipline") || null),
        status: "todo", priority: fd.get("priority") || "medium",
        reporter: who, owner: fd.get("owner") || null, approver: fd.get("approver") || null, accepted: null,
        start: start, due: due, estimate: est ? Number(est) : null,
        checklist: [], worklog: [], comments: [],
        history: [{ at: at, by: who, text: "Created " + (type === "epic" ? "epic" : "ticket") }],
        created: at, updated: at
      });
    }, "Create " + (type === "epic" ? "epic" : "ticket") + ": " + title + " (" + memberName(who) + ")");
    if (ok) {
      $("#create-dialog").close();
      toast("Created " + guess);
      openTicket(guess);
    }
  }

  /* ---------------- routing ---------------- */

  function parseHash() {
    var h = location.hash.replace(/^#\/?/, "").split("/");
    var v = VIEWS[h[0]] ? h[0] : "board";
    ui.view = v;
    ui.ticket = h[1] ? decodeURIComponent(h[1]) : null;
  }
  function openTicket(id) { location.hash = "#" + ui.view + "/" + encodeURIComponent(id); }
  function closeTicket() { if (ui.ticket) location.hash = "#" + ui.view; }

  /* ---------------- events ---------------- */

  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-action]");
    if (a && !a.matches("select, input")) {
      var act = a.dataset.action, t = ui.ticket ? byId(ui.ticket) : null;
      e.preventDefault();
      switch (act) {
        case "create": openCreate(); break;
        case "create-child": openCreate({ type: "task", parent: a.dataset.parent }); break;
        case "close-create": $("#create-dialog").close(); break;
        case "close": closeTicket(); break;
        case "refresh":
          if (S.isBusy()) { toast("Still saving. Try again in a moment."); break; }
          S.load().then(function () { toast("Reloaded"); });
          break;
        case "disc": ui.filters.disc = a.dataset.disc; if (ui.filters.epic) { var ee = byId(ui.filters.epic); if (ee && ui.filters.disc !== "all" && ee.discipline !== ui.filters.disc) ui.filters.epic = ""; } savePrefs(); render(); break;
        case "clear-filters": ui.filters = { disc: "all", epic: "", owner: "", q: "" }; savePrefs(); render(); break;
        case "board-group": ui.boardGroup = a.dataset.group; savePrefs(); render(); break;
        case "tl-zoom": ui.tlZoom = a.dataset.zoom; ui.tlScroll = null; savePrefs(); render(); break;
        case "tl-today": var sc = $("#tl-scroll"); if (sc) sc.scrollTo({ left: Math.max(0, Number(sc.dataset.today) - Math.min(160, sc.clientWidth * 0.15)), behavior: "smooth" }); break;
        case "wl-range": ui.wlRange = a.dataset.range; savePrefs(); render(); break;
        case "export-csv": exportCsv(); break;
        case "collapse": ui.collapsed[a.dataset.key] = !ui.collapsed[a.dataset.key]; savePrefs(); render(); break;
        case "copy-link":
          var url = location.href;
          if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast("Link copied"); }, function () { toast(url); });
          else toast(url);
          break;
        case "accept":
          if (t) change(t.id, function (tk, d, who, at) { tk.accepted = { by: who, at: at }; hist(tk, who, at, "Accepted the ticket"); }, "accepted");
          break;
        case "unaccept":
          if (t) change(t.id, function (tk, d, who, at) { tk.accepted = null; hist(tk, who, at, "Revoked acceptance"); }, "acceptance revoked");
          break;
        case "check-del":
          if (t) { var cid = a.dataset.id; change(t.id, function (tk, d, who, at) { var c = (tk.checklist || []).find(function (x) { return x.id === cid; }); tk.checklist = (tk.checklist || []).filter(function (x) { return x.id !== cid; }); if (c) hist(tk, who, at, "Removed checklist item “" + c.text + "”"); }, "remove checklist item"); }
          break;
        case "wl-del":
          if (t && confirm("Delete this time entry?")) { var wid = a.dataset.id; change(t.id, function (tk, d, who, at) { var w = (tk.worklog || []).find(function (x) { return x.id === wid; }); tk.worklog = (tk.worklog || []).filter(function (x) { return x.id !== wid; }); if (w) hist(tk, who, at, "Deleted a " + fmtH(w.hours) + " time entry"); }, "delete time entry"); }
          break;
        case "comment-del":
          if (t && confirm("Delete this comment?")) { var kid = a.dataset.id; change(t.id, function (tk, d, who, at) { tk.comments = (tk.comments || []).filter(function (x) { return x.id !== kid; }); hist(tk, who, at, "Deleted a comment"); }, "delete comment"); }
          break;
        case "delete-ticket":
          if (!t) break;
          var isEpic = t.type === "epic", n = isEpic ? children(t.id).length : 0;
          if (!confirm("Delete " + t.id + " “" + t.title + "”?" + (n ? "\n\nIts " + n + " child ticket(s) will be kept but no longer belong to an epic." : "") + "\n\nThis can only be undone from the repository history.")) break;
          var who = guard(); if (!who) break;
          var delId = t.id;
          S.mutate(function (d) {
            var victim = d.tickets.find(function (x) { return x.id === delId; });
            if (!victim) return;
            d.tickets.forEach(function (x) { if (x.parent === delId) { x.parent = null; x.discipline = victim.discipline; } });
            d.tickets = d.tickets.filter(function (x) { return x.id !== delId; });
          }, "Delete " + delId + " (" + memberName(who) + ")");
          closeTicket();
          toast("Deleted " + delId);
          break;
        case "disconnect": S.disconnect(); break;
        case "add-member":
          if (!guard()) break;
          var nid = uid("m");
          S.mutate(function (d) { d.members.push({ id: nid, name: "New person", role: "student", github: "" }); }, "Add team member (" + memberName(me()) + ")");
          break;
        case "remove-member":
          var mid = a.dataset.id;
          if (!confirm("Remove " + memberName(mid) + " from the team list? Tickets they own will show “Former member”.")) break;
          if (!guard()) break;
          S.mutate(function (d) { d.members = d.members.filter(function (m) { return m.id !== mid; }); }, "Remove team member (" + memberName(me()) + ")");
          break;
        case "download-json":
          var blob = new Blob([JSON.stringify(data(), null, 2)], { type: "application/json" });
          var dl = document.createElement("a"); dl.href = URL.createObjectURL(blob); dl.download = "tracker-" + today() + ".json";
          document.body.appendChild(dl); dl.click(); dl.remove();
          break;
      }
      return;
    }
    var o = e.target.closest("[data-open]");
    if (o && !e.target.closest("a")) { e.preventDefault(); openTicket(o.dataset.open); return; }
    if (e.target.id === "drawer-backdrop") closeTicket();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && ui.ticket && !$("#create-dialog").open) { closeTicket(); return; }
    if (e.key === "Enter" && e.target.matches("[data-open]:not(button)")) { openTicket(e.target.dataset.open); return; }
    if (e.key === "Enter" && e.target.matches(".title-input")) { e.preventDefault(); e.target.blur(); }
  });

  document.addEventListener("input", function (e) {
    var el = e.target;
    if (el.dataset && el.dataset.keep) el.dataset.dirty = "1";
    if (el.matches(".title-input")) autosize(el);
    if (el.dataset && el.dataset.filter === "q") {
      ui.filters.q = el.value; savePrefs();
      var keep = preserveDrafts();
      $("#view").innerHTML = ui.view === "board" ? renderBoard() : ui.view === "timeline" ? renderTimeline() : ui.view === "list" ? renderList() : ui.view === "worklog" ? renderWorklog() : $("#view").innerHTML;
      if (ui.view === "timeline") afterTimeline();
      restoreDrafts(keep);
    }
  });

  document.addEventListener("change", function (e) {
    var el = e.target;
    if (el.dataset.filter === "epic" || el.dataset.filter === "owner") { ui.filters[el.dataset.filter] = el.value; savePrefs(); render(); return; }
    if (el.id === "me-select") { setMe(el.value); render(); toast(el.value ? "You're " + memberName(el.value) : "Cleared"); return; }
    if (el.closest("#create-dialog")) { syncCreateType(); return; }
    if (el.dataset.member) {
      var mid = el.dataset.member, mf = el.dataset.mfield, val = el.value.trim();
      if (mf === "name" && !val) { toast("Name can't be empty."); render(); return; }
      if (!guard()) return;
      S.mutate(function (d) { var m = d.members.find(function (x) { return x.id === mid; }); if (m) m[mf] = val; }, "Update team member (" + memberName(me()) + ")");
      return;
    }
    if (el.dataset.actionChange === "check" && ui.ticket) {
      var cid = el.dataset.id, val2 = el.checked;
      change(ui.ticket, function (tk, d, who, at) { var c = (tk.checklist || []).find(function (x) { return x.id === cid; }); if (c) { c.done = val2; hist(tk, who, at, (val2 ? "Checked " : "Unchecked ") + "“" + c.text + "”"); } }, (val2 ? "check" : "uncheck") + " checklist item");
      return;
    }
    if (el.dataset.field && ui.ticket && el.closest("#drawer") && el.tagName !== "TEXTAREA") {
      setField(ui.ticket, el.dataset.field, el.value);
    }
  });

  // Title/description save on blur
  document.addEventListener("focusout", function (e) {
    var el = e.target;
    if (el.tagName === "TEXTAREA" && el.dataset.field && ui.ticket && el.closest("#drawer")) {
      if (el.dataset.dirty !== "1") return;
      el.dataset.dirty = "";
      setField(ui.ticket, el.dataset.field, el.value);
    }
  });

  document.addEventListener("submit", function (e) {
    var f = e.target, kind = f.dataset.form;
    if (!kind) return;
    e.preventDefault();
    var fd = new FormData(f);
    if (kind === "create") { submitCreate(f); return; }
    if (kind === "token") {
      var tok = String(fd.get("token") || "").trim(); if (!tok) return;
      toast("Connecting…");
      S.connect(tok).then(function (ok) {
        if (ok) {
          if (!me() && S.login) {
            var m = members().find(function (x) { return (x.github || "").toLowerCase() === S.login.toLowerCase(); });
            if (m) setMe(m.id);
          }
          toast("Connected to GitHub"); render();
        } else toast("Couldn't connect. See the message in Settings.");
      });
      return;
    }
    // Saving re-renders synchronously, replacing this form. Clear draft flags on the
    // old form first (so they aren't carried over), then reset the new one.
    var clearKeeps = function () {
      var nf = $('form[data-form="' + kind + '"]');
      if (nf) { nf.reset(); $all("[data-keep]", nf).forEach(function (el) { el.dataset.dirty = ""; }); }
    };
    $all("[data-keep]", f).forEach(function (el) { el.dataset.dirty = ""; });
    if (kind === "quicklog") {
      var tid = fd.get("ticket"), hrs = Number(fd.get("hours"));
      if (!tid || !(hrs > 0)) { toast("Choose a ticket and enter hours."); return; }
      var entry = { id: uid("w"), date: fd.get("date"), hours: hrs, note: String(fd.get("note") || "").trim() };
      if (change(tid, function (tk, d, who, at) { entry.member = who; (tk.worklog = tk.worklog || []).push(Object.assign({}, entry, { member: who })); hist(tk, who, at, "Logged " + fmtH(hrs)); }, "log " + fmtH(hrs))) {
        clearKeeps(); toast("Logged " + fmtH(hrs) + " on " + tid);
      }
      return;
    }
    if (!ui.ticket) return;
    if (kind === "check-add") {
      var text = String(fd.get("text") || "").trim(); if (!text) return;
      var cid = uid("c");
      if (change(ui.ticket, function (tk, d, who, at) { (tk.checklist = tk.checklist || []).push({ id: cid, text: text, done: false }); hist(tk, who, at, "Added checklist item “" + text + "”"); }, "add checklist item")) { clearKeeps(); }
      return;
    }
    if (kind === "wl-add") {
      var h = Number(fd.get("hours")); if (!(h > 0)) { toast("Enter the hours you worked."); return; }
      var we = { id: uid("w"), date: fd.get("date"), hours: h, note: String(fd.get("note") || "").trim() };
      if (change(ui.ticket, function (tk, d, who, at) { (tk.worklog = tk.worklog || []).push(Object.assign({}, we, { member: who })); hist(tk, who, at, "Logged " + fmtH(h)); }, "log " + fmtH(h))) { clearKeeps(); toast("Logged " + fmtH(h)); }
      return;
    }
    if (kind === "comment") {
      var body = String(fd.get("body") || "").trim(); if (!body) return;
      var com = { id: uid("k"), at: new Date().toISOString(), body: body };
      if (change(ui.ticket, function (tk, d, who, at) { (tk.comments = tk.comments || []).push(Object.assign({}, com, { author: who })); hist(tk, who, at, "Commented"); }, "comment")) { clearKeeps(); }
      return;
    }
  });

  // Drag and drop on the board
  var dragId = null;
  document.addEventListener("dragstart", function (e) {
    var c = e.target.closest && e.target.closest(".card");
    if (!c || !canEdit()) return;
    dragId = c.dataset.card;
    c.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", dragId); } catch (err) {}
  });
  document.addEventListener("dragend", function () { dragId = null; $all(".is-dragging, .is-over").forEach(function (x) { x.classList.remove("is-dragging", "is-over"); }); });
  document.addEventListener("dragover", function (e) {
    var col = e.target.closest && e.target.closest("[data-drop]");
    if (!col || !dragId) return;
    e.preventDefault();
    $all(".col.is-over").forEach(function (x) { if (x !== col) x.classList.remove("is-over"); });
    col.classList.add("is-over");
  });
  document.addEventListener("drop", function (e) {
    var col = e.target.closest && e.target.closest("[data-drop]");
    if (!col || !dragId) return;
    e.preventDefault();
    var t = byId(dragId), st = col.dataset.drop;
    col.classList.remove("is-over");
    if (t && t.status !== st) setField(t.id, "status", st);
    dragId = null;
  });

  window.addEventListener("hashchange", function () { parseHash(); render(); });

  // Pick up teammates' changes when you come back to the tab.
  function maybeReload() {
    if (document.visibilityState !== "visible" || S.isBusy() || S.mode !== "github") return;
    if (document.activeElement && document.activeElement.dataset && document.activeElement.dataset.dirty === "1") return;
    if (Date.now() - S.loadedAt > 30000) S.load();
  }
  window.addEventListener("focus", maybeReload);
  setInterval(maybeReload, 120000);

  S.subscribe(function () {
    if (S.mode === "github" && !me() && S.login) {
      var m = members().find(function (x) { return (x.github || "").toLowerCase() === S.login.toLowerCase(); });
      if (m) setMe(m.id);
    }
    render();
  });
  parseHash();
  render();
  S.load();
})();
