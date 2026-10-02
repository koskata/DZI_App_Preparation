(() => {
  "use strict";

  // ---------- helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem("bel." + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("bel." + k, JSON.stringify(v)); } catch {} if (window.__belSyncDirty && ["notes", "stats", "writeDraft"].includes(k)) window.__belSyncDirty(k); }
  };
  const WORKS = window.WORKS || [];
  const THEMES = window.THEMES || [];
  const LANG = window.LANG || [];
  const W = window.WRITING;
  const workById = (id) => WORKS.find((w) => w.id === id);
  const view = $("#view");

  // ---------- merge extra question banks ----------
  (function merge() {
    const M = window.MORE || {};
    for (const w of WORKS) {
      if (M.mcq && M.mcq[w.id]) w.mcq = (w.mcq || []).concat(M.mcq[w.id]);
      if (M.open && M.open[w.id]) w.open = (w.open || []).concat(M.open[w.id]);
      (w.mcq || []).forEach((q) => { if (q.a == null) q.a = 0; });
    }
    const ML = window.MORE_LANG || {};
    for (const t of LANG) if (ML[t.id]) t.ex = t.ex.concat(ML[t.id]);
    for (const t of window.MORE_TOPICS || []) if (!LANG.some((x) => x.id === t.id)) LANG.push(t);
    for (const t of LANG) t.ex.forEach((q) => { if (q.a == null) q.a = 0; });
    if (window.MORE_EDITS) window.EDIT_TASKS = (window.EDIT_TASKS || []).concat(window.MORE_EDITS);
  })();

  // ---------- generated questions (built from the verified data) ----------
  const shortGenre = (g) => g.split(/[,(]/)[0].trim();
  const themeName = (id) => (THEMES.find((t) => t.id === id) || {}).name;
  function distinct(correct, pool, n = 3) {
    const out = []; const seen = new Set([correct]);
    for (const x of shuffle(pool)) { if (!seen.has(x)) { seen.add(x); out.push(x); } if (out.length === n) break; }
    return out.length === n ? [correct, ...out] : null;
  }
  function genPool() {
    const out = [];
    const add = (id, w, q, o, e) => { if (o) out.push({ id: "g:" + id, q, o, a: 0, e, src: `${w.author} — „${w.title}“`, workId: w.id }); };
    const titles = WORKS.map((w) => `„${w.title}“`);
    const authors = [...new Set(WORKS.map((w) => w.author))];
    const genres = [...new Set(WORKS.map((w) => shortGenre(w.genre)))];
    for (const w of WORKS) {
      const T = `„${w.title}“`;
      add(`auth:${w.id}`, w, `Кой е авторът на ${T}?`, distinct(w.author, authors), `${T} е от ${w.author}.`);
      add(`genre:${w.id}`, w, `Какъв е жанрът на ${T}?`, distinct(shortGenre(w.genre), genres), `Жанр: ${w.genre}.`);
      add(`theme:${w.id}`, w, `В кой тематичен кръг е ${T}?`, distinct(themeName(w.theme), THEMES.map((t) => t.name)), `Кръг „${themeName(w.theme)}“ (${w.cls} клас).`);
      const others = WORKS.filter((x) => x.author !== w.author).map((x) => `„${x.title}“`);
      add(`bywork:${w.id}`, w, `Коя творба е написана от ${w.author}?`, distinct(T, others), `${w.author} е автор на ${T}.`);
      const outCircle = WORKS.filter((x) => x.theme !== w.theme).map((x) => `„${x.title}“`);
      add(`circle:${w.id}`, w, `Коя творба е от тематичния кръг „${themeName(w.theme)}“?`, distinct(T, outCircle), `${T} е в кръга „${themeName(w.theme)}“.`);
      add(`pair:${w.id}`, w, "Коя двойка автор — творба е вярна?", distinct(`${w.author} — ${T}`, WORKS.filter((x) => x.author !== w.author).map((x) => `${w.author} — „${x.title}“`)), `${T} е от ${w.author}.`);
      const norm = (x) => x.toLowerCase().replace(/[^а-яa-zѝ ]+/g, " ");
      const names = (w.characters || []).flatMap((c) => ((c.match(/<b>([^<]+)<\/b>/) || [])[1] || "").split(/[\s()]+/)).filter((x) => x.length > 3 && !/^(дядо|баба|старата|децата|разказвачът|бащата|майката)$/i.test(x)).map(norm);
      (w.quotes || []).forEach((qt, i) => {
        const line = qt.split("\n").slice(0, 2).join(" / ");
        const nl = norm(line);
        if (nl.includes(norm(w.title).trim()) || names.some((n) => nl.includes(n.trim()))) return;
        add(`qw:${w.id}:${i}`, w, `От коя творба е цитатът: „${line}“?`, distinct(T, titles), `Цитатът е от ${T} (${w.author}).`);
        add(`qa:${w.id}:${i}`, w, `Чии са думите: „${line}“?`, distinct(w.author, authors), `${w.author}, ${T}.`);
      });
      if (!w.lyric) (w.characters || []).forEach((c, i) => {
        const m = c.match(/<b>([^<]+)<\/b>/); if (!m) return;
        const name = m[1].replace(/\s*\(.*\)/, "");
        if (/^(Разказвачът|Децата|Старата|Ординарецът|Бащата|Майката|Сватбарите|Героите)/i.test(name)) return;
        add(`ch:${w.id}:${i}`, w, `В коя творба е героят/героинята ${name}?`, distinct(T, WORKS.filter((x) => !x.lyric && x.id !== w.id).map((x) => `„${x.title}“`)), `${name} е герой от ${T}.`);
      });
      (w.symbols || []).forEach((s, i) => {
        const m = s.match(/<b>([^<]+)<\/b>\s*—\s*(.+)/); if (!m) return;
        add(`sym:${w.id}:${i}`, w, `Какво символизира ${m[1]} в ${T}?`, distinct(m[2].replace(/<[^>]+>/g, ""), WORKS.filter((x) => x.id !== w.id).flatMap((x) => (x.symbols || []).map((y) => (y.split("—")[1] || "").replace(/<[^>]+>/g, "").trim())).filter(Boolean)), `${m[1]} — ${m[2].replace(/<[^>]+>/g, "")}.`);
      });
    }
    return out;
  }
  let GEN = null;
  const genAll = () => (GEN ||= genPool());

  // ---------- history (archive of everything done) ----------
  const HTYPES = { test: "Тест", lang: "Език", open: "Отворен въпрос", mock: "Пробна матура", essay: "Съчинение", edit: "Редактиране", ai: "Въпроси от Claude" };
  const getHistory = () => store.get("history", []);
  function logHistory(entry) {
    const h = getHistory();
    entry.id = "h" + Date.now() + Math.floor(Math.random() * 1000);
    entry.d = Date.now();
    h.push(entry);
    saveHistoryList(h);
    sync.entry(entry);
    return entry.id;
  }
  function historyRows(types, limit = 8, empty = "Все още няма записи.") {
    const h = getHistory().filter((x) => !types || types.includes(x.t)).slice(-limit).reverse();
    if (!h.length) return `<p class="muted">${esc(empty)}</p>`;
    return `<ul class="hrows">${h.map(hRow).join("")}</ul>`;
  }
  function hRow(x) {
    const pct = x.max ? x.score / x.max : null;
    return `<li><a href="#history-${x.id}" data-go="history" data-arg="${x.id}">
      <span class="hdate tnum">${new Date(x.d).toLocaleDateString("bg-BG", { day: "2-digit", month: "2-digit" })} <small>${new Date(x.d).toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit" })}</small></span>
      <span class="pill t-${x.t}">${esc(HTYPES[x.t] || x.t)}</span>
      <span class="htitle">${esc(x.title || "")}</span>
      <span class="hscore tnum">${x.grade ? esc(x.grade) : x.max ? `${x.score}/${x.max}` : "—"}${pct != null ? `<span class="meter sm"><span style="width:${Math.round(pct * 100)}%"></span></span>` : ""}</span>
    </a></li>`;
  }

  // Bulgarian 2–6 scale (approximate, linear)
  function grade(pct) {
    const g = Math.max(2, Math.min(6, 2 + 4 * pct));
    const n = g < 3 ? "Слаб" : g < 3.5 ? "Среден" : g < 4.5 ? "Добър" : g < 5.5 ? "Много добър" : "Отличен";
    return { value: g.toFixed(2), name: n };
  }

  // ---------- question pools ----------
  function litPool(filter = {}) {
    const out = [];
    for (const w of WORKS) {
      if (filter.cls && !filter.cls.includes(w.cls)) continue;
      if (filter.themes && filter.themes.length && !filter.themes.includes(w.theme)) continue;
      if (filter.works && filter.works.length && !filter.works.includes(w.id)) continue;
      (w.mcq || []).forEach((q, i) => out.push({ ...q, id: `w:${w.id}:${i}`, src: `${w.author} — „${w.title}“`, workId: w.id }));
      if (filter.gen !== false) genAll().forEach((q) => { if (q.workId === w.id) out.push(q); });
    }
    return out;
  }
  function langPool(topicIds) {
    const out = [];
    for (const t of LANG) {
      if (topicIds && topicIds.length && !topicIds.includes(t.id)) continue;
      t.ex.forEach((q, i) => out.push({ ...q, id: `l:${t.id}:${i}`, src: t.title }));
    }
    return out;
  }
  function allById() {
    const m = {};
    for (const q of litPool()) m[q.id] = q;
    for (const q of genAll()) m[q.id] = q;
    for (const q of langPool()) m[q.id] = q;
    return m;
  }

  // ---------- stats ----------
  const stats = () => store.get("stats", { answered: 0, correct: 0, wrong: {}, byWork: {}, tests: [] });
  function record(q, ok) {
    const s = stats();
    s.answered++; if (ok) s.correct++;
    if (!ok) s.wrong[q.id] = (s.wrong[q.id] || 0) + 1;
    else if (s.wrong[q.id]) { s.wrong[q.id]--; if (s.wrong[q.id] <= 0) delete s.wrong[q.id]; }
    if (q.workId) { const b = (s.byWork[q.workId] ||= { a: 0, c: 0 }); b.a++; if (ok) b.c++; }
    store.set("stats", s);
  }

  // ---------- Claude (sample) ----------
  let samplePromise = null;
  function getSample() {
    if (!samplePromise) samplePromise = (window.claude && window.claude.use) ? window.claude.use("sample").catch(() => null) : Promise.resolve(null);
    return samplePromise;
  }
  let aiState = "unknown"; // unknown | ready | off
  getSample().then((s) => { aiState = s ? "ready" : "off"; document.body.dataset.ai = aiState; });
  const aiErr = (e) => ({
    not_granted: "Проверката с Claude не е разрешена. Разреши я при следващия опит или ползвай образеца за самопроверка.",
    rate_limited: "Твърде много проверки наведнъж. Изчакай минута и опитай пак.",
    invalid_json: "Отговорът не се получи в правилен вид. Натисни „Провери“ още веднъж.",
    prompt_too_large: "Текстът е твърде дълъг за една проверка. Раздели го на части.",
    cancelled: "Проверката е спряна."
  }[e && e.code] || "Проверката не успя. Опитай пак след малко.");

  let lastPrompt = "";
  // Outside claude.ai there is no built-in check: offer the same instructions to paste into any AI chat.
  function copyForAI(intro) {
    const chat = lastPrompt.split(/Отговори само с JSON/)[0].trim() + "\n\nОтговори на ясен български текст, подредено: оценка, какво е добре, какво липсва или е неточно, езикови грешки (грешно → правилно, с правилото) и конкретни съвети.";
    return `<div class="copyai"><p><b>${esc(intro)}</b> Натисни бутона, отвори ChatGPT, Gemini или Claude и постави текста — ще получиш проверка по същите критерии.</p>
      <div class="row"><button class="btn primary" type="button" data-copy-ai>Копирай за проверка с AI</button><span class="muted small" data-copy-state></span></div>
      <textarea class="copy-src" rows="6" readonly hidden>${esc(chat)}</textarea></div>`;
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-copy-ai]"); if (!b) return;
    const box = b.closest(".copyai"), ta = $(".copy-src", box), st = $("[data-copy-state]", box);
    try { await navigator.clipboard.writeText(ta.value); st.textContent = "Копирано. Постави го в AI чата."; }
    catch { ta.hidden = false; ta.select(); st.textContent = "Маркирано е — копирай го с Ctrl+C / Cmd+C."; }
  });
  const offline = (e) => e && (e.code === "unavailable");

  async function askJSON(prompt, opts = {}) {
    lastPrompt = prompt;
    const s = await getSample();
    if (!s) throw { code: "unavailable" };
    return s.json(prompt, opts);
  }
  function workBrief(w) {
    if (!w) return "";
    return `Творба: ${w.author} — „${w.title}“ (${w.year}). Жанр: ${w.genre}.
Теми: ${(w.themes || []).join("; ")}.
Съдържание: ${w.plot}
Композиция: ${w.composition}
Проблеми: ${(w.problems || []).join("; ")}.
Образи и символи: ${(w.symbols || []).join("; ")}.`;
  }
  const TEACHER = "Ти си опитен учител по български език и литература, който подготвя ученичка за държавния зрелостен изпит (ДЗИ) по БЕЛ в 12 клас в България. Пиши на правилен български книжовен език. Бъди конкретен, насърчаващ и честен. Не измисляй факти за творбите — ако не си сигурен, не твърди.";

  // ---------- account & sync (Supabase; active only when config.js is filled in) ----------
  const SYNC_KEYS = ["notes", "stats", "writeDraft"];
  function saveHistoryList(list) {
    list = list.slice(-400);
    for (let tries = 0; tries < 8; tries++) {
      try { localStorage.setItem("bel.history", JSON.stringify(list)); return; }
      catch { list = list.slice(Math.ceil(list.length * 0.15)); }
    }
  }
  const sync = (() => {
    const cfg = window.BEL_CONFIG || {};
    const on = !!(window.supabase && cfg.supabaseUrl && cfg.supabaseAnonKey);
    const sb = on ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
    let user = null, state = "idle", lastSync = store.get("lastSync", null), kvTimer = null, pulling = false;
    const q = (k) => store.get(k, []);
    const addQ = (k, id) => { const a = q(k); if (!a.includes(id)) { a.push(id); store.set(k, a); } };
    const rowOf = (e) => ({ user_id: user.id, id: e.id, d: e.d, t: e.t, title: String(e.title || "").slice(0, 300), score: e.score ?? null, max: e.max ?? null, grade: e.grade ? String(e.grade) : null, data: e });
    function paint() {
      const txt = !on ? "" : !user ? "Не си влязла — данните са само на това устройство" : state === "busy" ? "Синхронизиране…" : state === "error" ? "Няма връзка — ще синхронизирам по-късно" : `Синхронизирано${lastSync ? " · " + new Date(lastSync).toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit" }) : ""}`;
      $$("[data-sync-status]").forEach((el) => { el.textContent = txt; el.dataset.state = !user ? "off" : state; });
      document.body.dataset.sync = !on ? "none" : user ? "in" : "out";
    }
    const done = () => { state = "ok"; lastSync = Date.now(); store.set("lastSync", lastSync); paint(); };
    const fail = () => { state = "error"; paint(); };
    async function flushEntries() {
      if (!user) return;
      const del = q("syncDeleted");
      if (del.length) { const { error } = await sb.from("entries").delete().in("id", del); if (error) throw error; store.set("syncDeleted", []); }
      const ids = q("syncPending"); if (!ids.length) return;
      const rows = getHistory().filter((x) => ids.includes(x.id)).map(rowOf);
      if (rows.length) { const { error } = await sb.from("entries").upsert(rows, { onConflict: "user_id,id" }); if (error) throw error; }
      store.set("syncPending", q("syncPending").filter((id) => !ids.includes(id)));
    }
    async function flushKV() {
      if (!user) return;
      const keys = q("syncDirty"); if (!keys.length) return;
      const rows = keys.map((k) => ({ user_id: user.id, key: k, value: store.get(k, null), updated_at: new Date().toISOString() }));
      const { error } = await sb.from("kv").upsert(rows, { onConflict: "user_id,key" }); if (error) throw error;
      store.set("syncDirty", q("syncDirty").filter((k) => !keys.includes(k)));
    }
    async function flush() { if (!user) return; state = "busy"; paint(); try { await flushEntries(); await flushKV(); done(); } catch { fail(); } }
    async function pull() {
      if (!user || pulling) return; pulling = true; state = "busy"; paint();
      try {
        const { data: kv, error: e1 } = await sb.from("kv").select("key,value"); if (e1) throw e1;
        const R = Object.fromEntries((kv || []).map((r) => [r.key, r.value]));
        if (R.notes) { const m = new Map(); for (const n of [...R.notes, ...store.get("notes", [])]) { const o = m.get(n.id); if (!o || (n.updated || 0) >= (o.updated || 0)) m.set(n.id, n); } localStorage.setItem("bel.notes", JSON.stringify([...m.values()].sort((a, b) => (b.updated || 0) - (a.updated || 0)))); }
        if (R.stats && (R.stats.answered || 0) > (stats().answered || 0)) localStorage.setItem("bel.stats", JSON.stringify(R.stats));
        const wd = store.get("writeDraft", null);
        if (R.writeDraft && (!wd || !(wd.text || "").trim())) localStorage.setItem("bel.writeDraft", JSON.stringify(R.writeDraft));
        const { data: rows, error: e2 } = await sb.from("entries").select("id,data").order("d", { ascending: false }).limit(400); if (e2) throw e2;
        const remote = new Set((rows || []).map((r) => r.id)), del = new Set(q("syncDeleted"));
        const local = getHistory();
        const m = new Map(local.map((x) => [x.id, x]));
        for (const r of rows || []) if (!del.has(r.id) && !m.has(r.id)) m.set(r.id, r.data);
        saveHistoryList([...m.values()].sort((a, b) => a.d - b.d));
        const missing = local.filter((x) => !remote.has(x.id)).map((x) => x.id);
        store.set("syncPending", [...new Set([...q("syncPending"), ...missing])]);
        store.set("syncDirty", [...SYNC_KEYS]);
        await flushEntries(); await flushKV();
        done(); render();
      } catch { fail(); } finally { pulling = false; }
    }
    async function start() {
      paint(); if (!on) return;
      const { data } = await sb.auth.getSession();
      user = data.session ? data.session.user : null; paint();
      if (user) pull();
      sb.auth.onAuthStateChange((_ev, session) => {
        const u = session ? session.user : null; const changed = (u && u.id) !== (user && user.id);
        user = u; paint(); if (u && changed) pull(); if (changed) render();
      });
      window.addEventListener("online", flush);
      setInterval(() => { if (user && (q("syncPending").length || q("syncDirty").length || q("syncDeleted").length)) flush(); }, 60000);
    }
    return {
      get on() { return on; }, get user() { return user; }, sb, start, pull, paint,
      entry(e) { if (!on) return; addQ("syncPending", e.id); flush(); },
      remove(id) { if (!on) return; store.set("syncPending", q("syncPending").filter((x) => x !== id)); addQ("syncDeleted", id); flush(); },
      dirty(k) { if (!on) return; addQ("syncDirty", k); clearTimeout(kvTimer); kvTimer = setTimeout(flush, 1500); },
      pushAll() { if (!on) return; store.set("syncPending", getHistory().map((x) => x.id)); store.set("syncDirty", [...SYNC_KEYS]); flush(); },
      async listAll() {
        const out = [];
        for (let from = 0; from < 20000; from += 1000) {
          const { data, error } = await sb.from("entries").select("id,d,t,title,score,max,grade").order("d", { ascending: true }).range(from, from + 999);
          if (error) throw error; out.push(...data); if (data.length < 1000) break;
        }
        return out.map((r) => ({ ...r, score: r.score == null ? undefined : +r.score, max: r.max == null ? undefined : +r.max }));
      },
      async get(id) { const { data, error } = await sb.from("entries").select("data").eq("id", id).maybeSingle(); if (error) throw error; return data && data.data; }
    };
  })();

  function renderAccount() {
    if (!sync.on) {
      view.innerHTML = `<header class="page-head"><p class="eyebrow">Профил</p><h1>Синхронизация</h1><p class="lead">Синхронизацията между устройства не е включена в тази версия. Данните се пазят в този браузър; използвай резервното копие в „История“.</p></header>`;
      return;
    }
    const u = sync.user;
    view.innerHTML = `
      <header class="page-head"><p class="eyebrow">Профил</p><h1>${u ? "Твоят профил" : "Влез, за да пазиш всичко"}</h1>
      <p class="lead">${u ? "Всички тестове, отговори, съчинения и бележки се пазят в профила ти и се виждат от всяко устройство, от което влезеш." : "С профил историята, бележките и напредъкът ти се пазят онлайн — отвори сайта от телефона или от компютъра и всичко е там."}</p></header>
      <section class="panel acct">
        ${u ? `
          <p>Влязла си като <b>${esc(u.email)}</b>.</p>
          <p class="sync-line" data-sync-status></p>
          <div class="row"><button class="btn primary" id="ac-sync">Синхронизирай сега</button><button class="btn ghost" id="ac-out">Изход</button></div>
          <div id="ac-msg"></div>` : `
          <form id="ac-form" class="acct-form">
            <label class="fld"><span>Имейл</span><input type="email" id="ac-email" autocomplete="email" required></label>
            <label class="fld"><span>Парола (поне 6 знака)</span><input type="password" id="ac-pw" autocomplete="current-password" minlength="6" required></label>
            <div class="row"><button class="btn primary" type="submit" id="ac-in">Вход</button><button class="btn" type="button" id="ac-up">Създай профил</button></div>
            <div id="ac-msg"></div>
          </form>`}
      </section>`;
    sync.paint();
    const msg = (t, warn) => { $("#ac-msg").innerHTML = `<p class="${warn ? "warn" : "muted"}">${esc(t)}</p>`; };
    const errText = (e) => /invalid login/i.test(e.message) ? "Грешен имейл или парола." : /already registered/i.test(e.message) ? "Вече има профил с този имейл — натисни „Вход“." : /confirm/i.test(e.message) ? "Първо потвърди профила от линка в имейла си." : e.message;
    if (u) {
      $("#ac-sync").onclick = () => sync.pull();
      $("#ac-out").onclick = async () => { await sync.sb.auth.signOut(); go("account"); };
      return;
    }
    $("#ac-form").onsubmit = async (e) => {
      e.preventDefault(); $("#ac-in").disabled = true;
      const { error } = await sync.sb.auth.signInWithPassword({ email: $("#ac-email").value.trim(), password: $("#ac-pw").value });
      $("#ac-in").disabled = false;
      if (error) msg(errText(error), true); else go("account");
    };
    $("#ac-up").onclick = async () => {
      const email = $("#ac-email").value.trim(), password = $("#ac-pw").value;
      if (!email || password.length < 6) { msg("Въведи имейл и парола от поне 6 знака.", true); return; }
      $("#ac-up").disabled = true;
      const { data, error } = await sync.sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
      $("#ac-up").disabled = false;
      if (error) msg(errText(error), true);
      else if (!data.session) msg("Профилът е създаден. Отвори имейла си, натисни линка за потвърждение и после влез тук.");
      else go("account");
    };
  }

  window.__belSyncDirty = (k) => sync.dirty(k);

  // ---------- router ----------
  const ROUTES = { home: renderHome, works: renderWorks, tests: renderTests, open: renderOpen, dzi: renderDZI, lang: renderLang, write: renderWrite, notes: renderNotes, history: renderHistory, account: renderAccount };
  function go(route, arg) {
    const hash = arg ? `${route}-${arg}` : route;
    if (location.hash.slice(1) !== hash) window.history.replaceState(null, "", "#" + hash);
    render();
  }
  function render() {
    const h = location.hash.slice(1) || "home";
    const [route, ...rest] = h.split("-");
    const arg = rest.join("-");
    $$(".nav a").forEach((a) => a.classList.toggle("on", a.dataset.r === route || (route === "work" && a.dataset.r === "works")));
    view.innerHTML = "";
    if (route === "work") renderWork(arg);
    else (ROUTES[route] || renderHome)(arg);
    view.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", render);
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-go]");
    if (a) { e.preventDefault(); go(a.dataset.go, a.dataset.arg); }
  });

  // ---------- reusable: quiz runner ----------
  function runQuiz(host, questions, { title, onDone, type = "test", endless = null, noLog = false } = {}) {
    let i = 0, score = 0, done = false; const log = [];
    const prep = (q) => ({ ...q, order: shuffle(q.o.map((_, k) => k)) });
    const qs = questions.map(prep);
    function refill() { if (endless && i >= qs.length - 2) { const seen = new Set(qs.slice(-40).map((q) => q.id)); qs.push(...shuffle(endless()).filter((q) => !seen.has(q.id)).slice(0, 20).map(prep)); } }
    function show() {
      refill();
      if (i >= qs.length) return finish();
      const q = qs[i];
      const hideSrc = revealsAnswer(q);
      host.innerHTML = `
        <div class="quiz">
          <div class="quiz-top"><span class="eyebrow">${esc(title || "Тест")}</span><span class="count">${endless ? `${score} верни от ${i}` : `${i + 1} / ${qs.length}`}</span></div>
          <div class="bar"><span style="width:${endless ? (i ? (score / i) * 100 : 0) : (i / qs.length) * 100}%"></span></div>
          <p class="q-src"${hideSrc ? " hidden" : ""}>${esc(q.src || "")}</p>
          <h3 class="q-text">${esc(q.q)}</h3>
          <div class="opts">${q.order.map((k, n) => `<button class="opt" data-k="${k}"><span class="letter">${"АБВГД"[n]}</span><span>${esc(q.o[k])}</span></button>`).join("")}</div>
          <div class="fb" hidden></div>
          <div class="quiz-actions"><button class="btn ghost" data-act="quit">${endless ? "Край и резултат" : "Прекрати"}</button><button class="btn primary" data-act="next" hidden>${!endless && i + 1 === qs.length ? "Резултат" : "Следващ"}</button></div>
        </div>`;
      $$(".opt", host).forEach((b) => b.onclick = () => answer(+b.dataset.k));
      $("[data-act=quit]", host).onclick = finish;
      $("[data-act=next]", host).onclick = () => { i++; show(); };
    }
    function answer(k) {
      const q = qs[i]; const ok = k === q.a;
      if (ok) score++;
      log.push({ q, chosen: k, ok }); record(q, ok);
      $$(".opt", host).forEach((b) => {
        b.disabled = true; const bk = +b.dataset.k;
        if (bk === q.a) b.classList.add("right");
        if (bk === k && !ok) b.classList.add("wrong");
      });
      const fb = $(".fb", host); fb.hidden = false;
      fb.className = "fb " + (ok ? "ok" : "no");
      fb.innerHTML = `<b>${ok ? "Вярно." : "Грешно."}</b> ${esc(q.e || "")}`;
      const src = $(".q-src", host); if (src) src.hidden = false;
      $("[data-act=next]", host).hidden = false;
      $("[data-act=next]", host).focus();
    }
    function finish() {
      if (done) return; done = true;
      const n = log.length;
      const pct = n ? score / n : 0; const g = grade(pct);
      let hid = null;
      if (n && !noLog) {
        hid = logHistory({ t: type, title: title || "Тест", score, max: n, grade: g.value, items: log.map((l) => ({ q: l.q.q, o: l.q.o, a: l.q.a, c: l.chosen, e: l.q.e, src: l.q.src, w: l.q.workId })) });
        const s = stats(); s.tests.push({ d: Date.now(), n, c: score, t: title }); s.tests = s.tests.slice(-50); store.set("stats", s);
      }
      const wrong = log.filter((l) => !l.ok);
      host.innerHTML = `
        <div class="result">
          <div class="grade-card">
            <div class="grade-num">${n ? g.value : "—"}</div>
            <div><div class="grade-name">${n ? g.name : "Няма отговори"}</div><div class="muted">${score} от ${n} верни${n ? ` · ${Math.round(pct * 100)}%` : ""}${hid ? " · записано в историята" : ""}</div></div>
          </div>
          ${wrong.length ? `<h3>За преговор</h3>${reviewList(wrong.map((l) => ({ q: l.q.q, o: l.q.o, a: l.q.a, c: l.chosen, e: l.q.e, src: l.q.src, w: l.q.workId })))}` : n ? `<p class="lead">Без нито една грешка. Браво!</p>` : ""}
          <div class="row"><button class="btn primary" data-act="again">Нов тест</button>${hid ? `<a class="btn ghost" href="#history" data-go="history">Към историята</a>` : ""}</div>
        </div>`;
      $("[data-act=again]", host).onclick = () => onDone ? onDone() : render();
    }
    show();
  }
  // Does the "Author — „Title“" label above a question give the answer away?
  function revealsAnswer(q) {
    const w = q.workId && workById(q.workId);
    if (!w) return false;
    const surname = w.author.split(" ").pop();
    return q.o.some((o) => o.includes(w.title) || o.includes(w.author) || o.includes(surname));
  }
  // In a test about one work, "which work / which author" questions answer themselves.
  function answerIsWork(q, w) {
    const c = String(q.o[q.a]);
    return c.includes(w.title) || c.includes(w.author) || c.includes(w.author.split(" ").pop());
  }
  function reviewList(items) {
    return `<ol class="review">${items.map((l) => `<li class="${l.c === l.a ? "is-ok" : "is-no"}"><p class="q-src">${esc(l.src || "")}</p><p><b>${esc(l.q)}</b></p>${l.c === l.a ? `<p class="red-pen"><span>✓ ${esc(l.o[l.a])}</span></p>` : `<p class="red-pen">${l.c != null ? `<s>${esc(l.o[l.c])}</s> → ` : `<i class="muted">без отговор</i> → `}<span>${esc(l.o[l.a])}</span></p>`}<p class="muted">${esc(l.e || "")}</p>${l.w && l.c !== l.a ? `<a href="#work-${l.w}" data-go="work" data-arg="${l.w}">Прочети за творбата</a>` : ""}</li>`).join("")}</ol>`;
  }

  // ---------- HOME ----------
  function renderHome() {
    const s = stats();
    const pct = s.answered ? s.correct / s.answered : 0;
    const weak = Object.entries(s.byWork).filter(([, b]) => b.a >= 3).map(([id, b]) => ({ w: workById(id), p: b.c / b.a })).filter((x) => x.w).sort((a, b) => a.p - b.p).slice(0, 4);
    const wrongN = Object.keys(s.wrong).length;
    const pool = litPool();
    const q = pool.length ? pick(pool) : null;
    view.innerHTML = `
      <header class="hero">
        <p class="eyebrow">ДЗИ · Български език и литература · 12 клас</p>
        <h1>Подготовка за матурата</h1>
        <p class="lead">${WORKS.length} произведения от 11 и 12 клас, тестове на случаен принцип, отворени въпроси, езикови правила и проверка на съчинения.</p>
      </header>
      <section class="stat-row">
        <div class="stat"><span class="k">Отговорени въпроси</span><span class="v">${s.answered}</span></div>
        <div class="stat"><span class="k">Успеваемост</span><span class="v">${s.answered ? Math.round(pct * 100) + "%" : "—"}</span></div>
        <div class="stat"><span class="k">Приблизителна оценка</span><span class="v">${s.answered ? grade(pct).value : "—"}</span></div>
        <div class="stat"><span class="k">Въпроси за преговор</span><span class="v">${wrongN}</span></div>
      </section>
      <div class="grid2">
        <section class="panel">
          <h2>Бърз старт</h2>
          <div class="quick">
            <button class="qa" data-quick="mix"><b>Смесен тест</b><span>20 въпроса · литература и език</span></button>
            <button class="qa" data-quick="lit"><b>Само литература</b><span>15 въпроса от всички творби</span></button>
            <button class="qa" data-quick="endless"><b>Тест без край</b><span>Въпроси един след друг, докато спреш</span></button>
            <button class="qa" data-quick="lang"><b>Само език</b><span>15 въпроса по правопис и граматика</span></button>
            <button class="qa" data-quick="wrong" ${wrongN ? "" : "disabled"}><b>Моите грешки</b><span>${wrongN ? wrongN + " въпроса, сгрешени досега" : "Все още няма сгрешени"}</span></button>
            <a class="qa" href="#dzi" data-go="dzi"><b>Пробна матура</b><span>Пълен вариант по формата на ДЗИ</span></a>
          </div>
          ${weak.length ? `<h3>Най-слаби творби</h3><ul class="weak">${weak.map((x) => `<li><a href="#work-${x.w.id}" data-go="work" data-arg="${x.w.id}">„${esc(x.w.title)}“</a><span class="meter"><span style="width:${Math.round(x.p * 100)}%"></span></span><span class="tnum">${Math.round(x.p * 100)}%</span></li>`).join("")}</ul>` : ""}
        </section>
        <section class="panel" id="daily">
          <h2>Въпрос за загрявка</h2>
          <div id="dq"></div>
        </section>
      </div>
      <section class="panel"><div class="panel-head"><h2>Последно направено</h2><a href="#history" data-go="history">Цялата история →</a></div>${historyRows(null, 6, "Тук ще се появява всичко, което решиш — тестове, отговори, съчинения.")}</section>`;
    if (q) runQuiz($("#dq"), [q], { title: "Един въпрос", onDone: renderHome, noLog: true });
    $$("[data-quick]").forEach((b) => b.onclick = () => quickStart(b.dataset.quick));
  }
  function quickStart(kind) {
    let qs;
    if (kind === "mix") qs = shuffle(litPool()).slice(0, 12).concat(shuffle(langPool()).slice(0, 8));
    else if (kind === "lit") qs = shuffle(litPool()).slice(0, 15);
    else if (kind === "lang") qs = shuffle(langPool()).slice(0, 15);
    else if (kind === "endless") qs = shuffle(litPool().concat(langPool())).slice(0, 20);
    else { const m = allById(); qs = Object.keys(stats().wrong).map((id) => m[id]).filter(Boolean); }
    view.innerHTML = `<div class="page-narrow" id="qhost"></div>`;
    const titles = { wrong: "Моите грешки", lit: "Литература", lang: "Български език", endless: "Тест без край", mix: "Смесен тест" };
    runQuiz($("#qhost"), shuffle(qs), { title: titles[kind], onDone: renderHome, type: kind === "lang" ? "lang" : "test", endless: kind === "endless" ? () => litPool().concat(langPool()) : null });
  }

  // ---------- WORKS ----------
  function renderWorks() {
    const s = stats();
    view.innerHTML = `
      <header class="page-head"><p class="eyebrow">Литература</p><h1>Произведения</h1><p class="lead">Жанр, теми, съдържание, композиция и проблеми за всяка творба. Отвори творба, за да я прегледаш, да си направиш тест или да си запишеш бележка.</p></header>
      ${[11, 12].map((cls) => `
        <section class="cls">
          <h2 class="cls-h">${cls} клас</h2>
          ${THEMES.filter((t) => t.cls === cls).map((t) => `
            <div class="theme">
              <h3 class="theme-h">${esc(t.name)}</h3>
              <div class="cards">${WORKS.filter((w) => w.theme === t.id).map((w) => {
                const b = s.byWork[w.id];
                return `<a class="wcard" href="#work-${w.id}" data-go="work" data-arg="${w.id}">
                  <span class="wauthor">${esc(w.author)}</span>
                  <span class="wtitle">„${esc(w.title)}“</span>
                  <span class="wmeta">${esc(w.genre)}${b ? ` · <span class="tnum">${Math.round((b.c / b.a) * 100)}%</span>` : ""}</span>
                </a>`;
              }).join("")}</div>
            </div>`).join("")}
        </section>`).join("")}`;
  }

  function renderWork(id) {
    const w = workById(id);
    if (!w) return renderWorks();
    const t = THEMES.find((x) => x.id === w.theme);
    const notes = store.get("notes", []);
    const note = notes.find((n) => n.workId === w.id);
    const list = (a) => `<ul>${(a || []).map((x) => `<li>${x}</li>`).join("")}</ul>`;
    view.innerHTML = `
      <nav class="crumbs"><a href="#works" data-go="works">Произведения</a> / ${w.cls} клас / ${esc(t ? t.name : "")}</nav>
      <header class="work-head">
        <p class="eyebrow">${esc(w.author)}</p>
        <h1>„${esc(w.title)}“</h1>
        <dl class="facts">
          <div><dt>Жанр</dt><dd>${esc(w.genre)}</dd></div>
          <div><dt>Година</dt><dd>${esc(w.year)}</dd></div>
          ${w.book ? `<div><dt>Книга / цикъл</dt><dd>${esc(w.book)}</dd></div>` : ""}
          <div><dt>Тематичен кръг</dt><dd>${esc(t ? t.name : "")}</dd></div>
        </dl>
        <div class="row">
          <button class="btn primary" data-act="test">Тест върху творбата</button>
          <button class="btn" data-act="open">Отворени въпроси</button>
          <button class="btn ghost ai-gen" data-act="ai">Нови въпроси от Claude</button>
        </div>
      </header>
      <div class="work-body">
        <article class="study">
          ${w.quotes && w.quotes.length ? `<section><h2>Ключови цитати</h2>${w.quotes.map((q) => `<blockquote>${esc(q)}</blockquote>`).join("")}</section>` : ""}
          <section><h2>Съдържание</h2>${storyHTML(w)}</section>
          ${circleHTML(w, t)}
          ${w.characters ? `<section><h2>${w.lyric ? "Лирически говорител и адресат" : "Герои"}</h2>${list(w.characters)}</section>` : ""}
          <section><h2>Теми</h2>${list(w.themes)}</section>
          <section><h2>Композиция</h2><p>${w.composition}</p></section>
          <section><h2>Проблеми</h2>${list(w.problems)}</section>
          <section><h2>Образи и символи</h2>${list(w.symbols)}</section>
          ${w.extra ? `<section><h2>Важно за матурата</h2>${list(w.extra)}</section>` : ""}
        </article>
        <aside class="side-note">
          <h2>Моята бележка</h2>
          <textarea id="wnote" rows="10" placeholder="Какво да запомня за „${esc(w.title)}“…">${esc(note ? note.body : "")}</textarea>
          <p class="muted small" id="wnote-state">${note ? "Запазено" : "Записва се автоматично"}</p>
        </aside>
      </div>
      <div id="whost"></div>
      <section class="panel"><h2>Моите тестове за „${esc(w.title)}“</h2>${(() => { const h = getHistory().filter((x) => x.title === w.title || x.title === `Нови въпроси · „${w.title}“` || (x.t === "open" && x.w === w.id)); return h.length ? `<ul class="hrows">${h.slice(-8).reverse().map(hRow).join("")}</ul>` : `<p class="muted">Все още нищо за тази творба.</p>`; })()}</section>`;
    const ta = $("#wnote"); let tmr;
    ta.oninput = () => { clearTimeout(tmr); $("#wnote-state").textContent = "Записване…"; tmr = setTimeout(() => { saveWorkNote(w, ta.value); $("#wnote-state").textContent = "Запазено"; }, 500); };
    $("[data-act=test]").onclick = () => { const h = $("#whost"); h.innerHTML = `<div class="page-narrow" id="wq"></div>`; runQuiz($("#wq"), shuffle(litPool({ works: [w.id] }).filter((q) => !answerIsWork(q, w))), { title: w.title, onDone: () => renderWork(w.id) }); h.scrollIntoView({ behavior: "smooth" }); };
    $("[data-act=open]").onclick = () => go("open", w.id);
    $("[data-act=ai]").onclick = () => aiQuestions(w);
  }
  // Ordered summary: short intro + numbered steps; quotations are set apart from the narration.
  function storyHTML(w) {
    const st = (window.STORY || {})[w.id];
    if (!st) return `<p>${w.plot}</p>`;
    const fmt = (t) => esc(t).replace(/„([^“]+)“/g, '<span class="qt">„$1“</span>');
    return `${st.intro ? `<p class="story-intro">${fmt(st.intro)}</p>` : ""}
      <ol class="story">${st.steps.map(([h, t]) => `<li><span class="story-h">${esc(h)}</span><p>${fmt(t)}</p></li>`).join("")}</ol>`;
  }
  // The work seen through the two poles of its thematic circle.
  const CIRCLE_LABELS = {
    rodno: ["Родното", "Чуждото"], pamet: ["Миналото", "Паметта"], vlast: ["Обществото", "Властта"],
    smart: ["Животът", "Смъртта"], priroda: ["Образът на природата", "Човекът и природата"],
    lubov: ["Каква е любовта", "Какво ѝ противостои"], vyara: ["Вярата", "Надеждата"],
    trud: ["Трудът", "Творчеството"], izbor: ["Изборът", "Раздвоението"]
  };
  function circleHTML(w, t) {
    const c = (window.CIRCLE || {})[w.id], L = CIRCLE_LABELS[w.theme];
    if (!c || !L || !t) return "";
    const fmt = (x) => x.replace(/„([^“]+)“/g, '<span class="qt">„$1“</span>');
    const col = (label, items) => `<div class="pole"><h3>${esc(label)}</h3><ul>${items.map((x) => `<li>${fmt(x)}</li>`).join("")}</ul></div>`;
    return `<section class="circle"><h2>${esc(t.name)} в творбата</h2>
      <div class="poles">${col(L[0], c.a)}${col(L[1], c.b)}</div>
      ${c.sum ? `<p class="circle-sum"><b>Извод.</b> ${fmt(c.sum)}</p>` : ""}</section>`;
  }
  function saveWorkNote(w, body) {
    const notes = store.get("notes", []);
    let n = notes.find((x) => x.workId === w.id);
    if (!n) { n = { id: "n" + Date.now(), workId: w.id, title: `${w.author} — „${w.title}“` }; notes.unshift(n); }
    n.body = body; n.updated = Date.now();
    store.set("notes", body.trim() ? notes : notes.filter((x) => x !== n));
  }

  async function aiQuestions(w) {
    const h = $("#whost");
    h.innerHTML = `<div class="page-narrow"><div class="thinking">Claude подготвя 8 нови въпроса за „${esc(w.title)}“…</div></div>`;
    h.scrollIntoView({ behavior: "smooth" });
    try {
      const prompt = `${TEACHER}

Съчини 8 НОВИ въпроса с избираем отговор (по 4 възможности, само един верен) за творбата по-долу, в стила на задачите от ДЗИ: жанр, тема, мотив, образ, символ, композиция, художествено средство, смисъл на цитат, контекст. Опирай се САМО на фактите от описанието — не измисляй детайли.

${workBrief(w)}

Отговори само с JSON масив: [{"q":"въпрос","o":["А","Б","В","Г"],"a":0,"e":"кратко обяснение защо това е верният отговор"}]. "a" е индексът на верния отговор (0–3).`;
      const arr = await askJSON(prompt, { modelTier: "default", cache: false });
      const qs = (Array.isArray(arr) ? arr : []).filter((q) => q && q.q && Array.isArray(q.o) && q.o.length >= 2 && Number.isInteger(q.a) && q.a < q.o.length)
        .map((q, i) => ({ ...q, id: `ai:${w.id}:${Date.now()}:${i}`, src: `Нов въпрос от Claude · „${w.title}“`, workId: w.id }));
      if (!qs.length) throw { code: "invalid_json" };
      h.innerHTML = `<div class="page-narrow" id="wq"></div>`;
      runQuiz($("#wq"), qs, { title: `Нови въпроси · „${w.title}“`, type: "ai", onDone: () => renderWork(w.id) });
    } catch (e) {
      h.innerHTML = `<div class="page-narrow"><p class="warn">${e.code === "unavailable" ? "Генерирането на нови въпроси работи, когато приложението е отворено в claude.ai." : aiErr(e)}</p></div>`;
    }
  }

  async function aiMixed(ws, h) {
    h.innerHTML = `<div class="page-narrow"><div class="thinking">Claude подготвя 10 нови въпроса за ${ws.map((w) => "„" + esc(w.title) + "“").join(", ")}…</div></div>`;
    try {
      const prompt = `${TEACHER}

Съчини 10 НОВИ въпроса с избираем отговор (по 4 възможности, само един верен) върху творбите по-долу, в стила на ДЗИ: жанр, тема, мотив, образ, символ, композиция, художествено средство, смисъл на цитат, сравнение между творбите. Опирай се САМО на фактите от описанията.

${ws.map(workBrief).join("\n\n")}

Отговори само с JSON масив: [{"work":"точното заглавие","q":"въпрос","o":["А","Б","В","Г"],"a":0,"e":"кратко обяснение"}]`;
      const arr = await askJSON(prompt, { modelTier: "default", cache: false });
      const qs = (Array.isArray(arr) ? arr : []).filter((q) => q && q.q && Array.isArray(q.o) && q.o.length >= 2 && Number.isInteger(q.a) && q.a < q.o.length)
        .map((q, i) => { const w = ws.find((x) => x.title === q.work); return { ...q, id: `ai:${Date.now()}:${i}`, src: w ? `Claude · ${w.author} — „${w.title}“` : "Нов въпрос от Claude", workId: w && w.id }; });
      if (!qs.length) throw { code: "invalid_json" };
      h.innerHTML = `<div class="page-narrow" id="aiq"></div>`;
      runQuiz($("#aiq"), qs, { title: "Нови въпроси от Claude", type: "ai", onDone: renderTests });
    } catch (e) {
      h.innerHTML = `<div class="page-narrow"><p class="warn">${e.code === "unavailable" ? "Новите въпроси от Claude работят, когато приложението е отворено в claude.ai." : aiErr(e)}</p></div>`;
    }
  }

  // ---------- TESTS ----------
  function renderTests() {
    const cfg = store.get("testcfg", { cls: [11, 12], themes: [], n: 20, lang: true, lit: true });
    view.innerHTML = `
      <header class="page-head"><p class="eyebrow">Тестове</p><h1>Направи си тест</h1><p class="lead">Въпросите се теглят на случаен принцип и се повтарят в различни тестове. Всеки грешен отговор влиза в „Моите грешки“, докато не го отговориш вярно.</p></header>
      <form class="panel cfg" id="cfg">
        <fieldset><legend>Какво да включва</legend>
          <label class="chk"><input type="checkbox" id="c-lit" ${cfg.lit ? "checked" : ""}> Литература (${litPool().length} въпроса)</label>
          <label class="chk"><input type="checkbox" id="c-lang" ${cfg.lang ? "checked" : ""}> Български език (${langPool().length} въпроса)</label>
        </fieldset>
        <fieldset><legend>Клас</legend>
          <label class="chk"><input type="checkbox" id="c-11" ${cfg.cls.includes(11) ? "checked" : ""}> 11 клас</label>
          <label class="chk"><input type="checkbox" id="c-12" ${cfg.cls.includes(12) ? "checked" : ""}> 12 клас</label>
        </fieldset>
        <fieldset><legend>Тематични кръгове <span class="muted">(нищо избрано = всички)</span></legend>
          <div class="chips">${THEMES.map((t) => `<label class="chip"><input type="checkbox" name="th" value="${t.id}" ${cfg.themes.includes(t.id) ? "checked" : ""}><span>${esc(t.name)}</span></label>`).join("")}</div>
        </fieldset>
        <fieldset><legend>Брой въпроси</legend>
          <div class="seg">${[10, 20, 30, 50, 100, 0].map((n) => `<label><input type="radio" name="n" value="${n}" ${cfg.n === n ? "checked" : ""}><span>${n || "Без край"}</span></label>`).join("")}</div>
        </fieldset>
        <div class="row"><button class="btn primary" type="submit">Започни теста</button><button class="btn ghost ai-gen" type="button" id="cfg-ai">10 нови въпроса от Claude</button><p class="muted small" id="cfg-msg"></p></div>
      </form>
      <div id="ai-host"></div>
      <section class="panel">
        <div class="panel-head"><h2>Моите тестове</h2><a href="#history" data-go="history">Цялата история →</a></div>
        ${historyRows(["test", "lang", "ai"], 12, "Все още няма направени тестове.")}
      </section>`;
    $("#cfg-ai").onclick = () => {
      const cls = [11, 12].filter((n) => $("#c-" + n).checked), th = $$("input[name=th]:checked").map((x) => x.value);
      const ws = WORKS.filter((w) => cls.includes(w.cls) && (!th.length || th.includes(w.theme)));
      if (!ws.length) { $("#cfg-msg").textContent = "Избери поне един клас."; return; }
      aiMixed(shuffle(ws).slice(0, 4), $("#ai-host"));
    };
    $("#cfg").onsubmit = (e) => {
      e.preventDefault();
      const c = { lit: $("#c-lit").checked, lang: $("#c-lang").checked, cls: [11, 12].filter((n) => $("#c-" + n).checked), themes: $$("input[name=th]:checked").map((x) => x.value), n: +($("input[name=n]:checked") || { value: 20 }).value };
      store.set("testcfg", c);
      let lit = c.lit ? litPool({ cls: c.cls, themes: c.themes }) : [];
      const lang = c.lang ? langPool() : [];
      if (!lit.length && !lang.length) { $("#cfg-msg").textContent = "Избери поне литература или език и поне един клас."; return; }
      let qs;
      if (lit.length && lang.length) { const nl = Math.round(c.n * 0.65); qs = shuffle(lit).slice(0, nl).concat(shuffle(lang).slice(0, c.n - nl)); }
      else qs = shuffle(lit.length ? lit : lang).slice(0, c.n);
      if (!c.n) qs = shuffle(lit.concat(lang)).slice(0, 20);
      const label = [c.lit && "литература", c.lang && "език"].filter(Boolean).join(" + ");
      const thl = c.themes.length ? " · " + c.themes.map(themeName).join(", ") : "";
      view.innerHTML = `<div class="page-narrow" id="qhost"></div>`;
      runQuiz($("#qhost"), shuffle(qs), { title: (c.n ? `Тест (${label})` : `Без край (${label})`) + thl, type: !c.lit ? "lang" : "test", onDone: renderTests, endless: c.n ? null : () => lit.concat(lang) });
    };
  }

  // ---------- OPEN QUESTIONS ----------
  function renderOpen(preWork) {
    const opts = WORKS.map((w) => `<option value="${w.id}" ${w.id === preWork ? "selected" : ""}>${esc(w.author)} — „${esc(w.title)}“</option>`).join("");
    view.innerHTML = `
      <header class="page-head"><p class="eyebrow">Отворени въпроси</p><h1>Отговори със свои думи</h1><p class="lead">Като задачите с кратък и разширен свободен отговор на ДЗИ: 4–5 свързани изречения — твърдение, обосновка, пример от текста, извод. Проверката оценява отговора и казва какво липсва.</p></header>
      <div class="panel">
        <div class="row wrap">
          <label class="fld"><span>Творба</span><select id="o-work"><option value="">Всички творби (случайно)</option>${opts}</select></label>
          <button class="btn" id="o-next">Друг въпрос</button>
        </div>
        <div id="o-q"></div>
      </div>
      <details class="panel">
        <summary><b>Провери отговор на свой въпрос</b> <span class="muted">— например задача от реален тест от ДЗИ</span></summary>
        <label class="fld"><span>Въпрос / задача</span><textarea id="c-q" rows="3" placeholder="Постави условието на задачата…"></textarea></label>
        <label class="fld"><span>Моят отговор</span><textarea id="c-a" rows="6" placeholder="Напиши отговора си…"></textarea></label>
        <div class="row"><button class="btn primary" id="c-check" data-needs-ai>Провери</button></div>
        <div id="c-out"></div>
      </details>
      <section class="panel"><div class="panel-head"><h2>Моите отговори</h2><a href="#history" data-go="history">Цялата история →</a></div>${historyRows(["open"], 10, "Все още няма проверени отговори.")}</section>`;
    const next = () => {
      const wid = $("#o-work").value;
      const pool = [];
      for (const w of WORKS) if (!wid || w.id === wid) (w.open || []).forEach((q) => pool.push({ ...q, w }));
      if (!pool.length) { $("#o-q").innerHTML = `<p class="muted">Няма отворени въпроси за тази творба.</p>`; return; }
      showOpen($("#o-q"), pick(pool));
    };
    $("#o-work").onchange = next; $("#o-next").onclick = next; next();
    $("#c-check").onclick = () => checkOpen($("#c-out"), { q: $("#c-q").value, key: "" }, $("#c-a").value, null, $("#c-check"));
  }
  function showOpen(host, item) {
    const draftKey = "draft." + item.w.id + "." + item.q.slice(0, 30);
    host.innerHTML = `
      <p class="q-src">${esc(item.w.author)} — „${esc(item.w.title)}“</p>
      <h3 class="q-text">${esc(item.q)}</h3>
      <textarea id="o-a" rows="7" placeholder="Твоят отговор (4–5 изречения)…">${esc(store.get(draftKey, ""))}</textarea>
      <div class="row"><button class="btn primary" id="o-check">Провери</button><button class="btn ghost" id="o-key">Покажи образец</button><span class="muted small" id="o-len"></span></div>
      <div id="o-out"></div>`;
    const ta = $("#o-a", host);
    const upd = () => { const n = (ta.value.match(/[.!?…]+(\s|$)/g) || []).length; $("#o-len", host).textContent = ta.value.trim() ? `${n} изречения` : ""; store.set(draftKey, ta.value); };
    ta.oninput = upd; upd();
    $("#o-key", host).onclick = () => { $("#o-out", host).innerHTML = `<div class="keybox"><h4>Какво трябва да съдържа добрият отговор</h4><p>${esc(item.key)}</p></div>`; };
    $("#o-check", host).onclick = () => checkOpen($("#o-out", host), item, ta.value, item.w, $("#o-check", host));
  }
  async function checkOpen(out, item, answer, w, btn) {
    if (!answer.trim() || (!item.q || !item.q.trim())) { out.innerHTML = `<p class="warn">Напиши ${item.q && item.q.trim() ? "отговор" : "въпроса и отговора"}, преди да проверяваш.</p>`; return; }
    btn.disabled = true;
    out.innerHTML = `<div class="thinking">Проверявам отговора…</div>`;
    try {
      const prompt = `${TEACHER}

Провери отговора на ученичката на задача със свободен отговор, както би я оценил проверител на ДЗИ.
${w ? workBrief(w) + "\n" : ""}
ЗАДАЧА: ${item.q}
${item.key ? "ОПОРНИ ТОЧКИ ЗА ВЕРЕН ОТГОВОР: " + item.key + "\n" : ""}
ОТГОВОР НА УЧЕНИЧКАТА:
"""${answer.slice(0, 6000)}"""

Оцени по скала от 0 до 3 точки (3 = пълен, точен, свързан текст с позоваване на творбата; 2 = верен, но непълен; 1 = частично верен; 0 = грешен или по друг въпрос). Отбележи и езиковите грешки (правопис, пунктуация, граматика).
Отговори само с JSON: {"score":0-3,"verdict":"едно изречение обща оценка","good":["какво е добре"],"missing":["какво липсва или е неточно"],"errors":[{"wrong":"грешен откъс","right":"поправка","why":"правило"}],"better":"примерен подобрен отговор в 4-5 изречения"}`;
      const r = await askJSON(prompt, { modelTier: "default", cache: false });
      const sc = Math.max(0, Math.min(3, +r.score || 0));
      logHistory({ t: "open", title: w ? `„${w.title}“ — ${item.q}` : item.q, w: w && w.id, score: sc, max: 3, q: item.q, answer, key: item.key, fb: r });
      out.innerHTML = feedbackHTML(r, 3) + `<p class="muted small">Записано в историята.</p>`;
    } catch (e) {
      if (e.code === "unavailable" || e.code === "not_granted") logHistory({ t: "open", title: w ? `„${w.title}“ — ${item.q}` : item.q, w: w && w.id, q: item.q, answer, key: item.key });
      out.innerHTML = (offline(e) ? copyForAI("Отговорът ти е записан в историята.") : `<p class="warn">${aiErr(e)}</p>`) + (item.key ? `<div class="keybox"><h4>Образец за самопроверка</h4><p>${esc(item.key)}</p></div>` : "");
    } finally { btn.disabled = false; }
  }
  function feedbackHTML(r, max) {
    const arr = (a) => (Array.isArray(a) ? a : []).filter(Boolean);
    return `<div class="feedback">
      <div class="fb-score"><span class="pts tnum">${esc(r.score ?? "?")}<small>/${max}</small></span><p>${esc(r.verdict || "")}</p></div>
      ${arr(r.good).length ? `<h4>Добре</h4><ul class="good">${arr(r.good).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${arr(r.missing).length ? `<h4>Липсва / неточно</h4><ul class="miss">${arr(r.missing).map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${arr(r.errors).length ? `<h4>Езикови грешки</h4><ul class="errs">${arr(r.errors).map((x) => `<li><span class="red-pen"><s>${esc(x.wrong)}</s> → <span>${esc(x.right)}</span></span> <span class="muted">${esc(x.why || "")}</span></li>`).join("")}</ul>` : ""}
      ${r.better ? `<h4>Как може да звучи</h4><p class="better">${esc(r.better)}</p>` : ""}
    </div>`;
  }

  // ---------- DZI (mock exam + archive) ----------
  // ---------- DZI: archive + faithful mock exam (41 tasks, 3 parts, 100 points) ----------
  const DZI = () => window.DZI || {};
  const OFFICIAL = [
    ["Матура по БЕЛ, 20 май 2026", "https://www.mon.bg/nfs/2026/05/dzi_bel_otgovori_20.05.2026.pdf"],
    ["Матура по БЕЛ, 21 май 2025", "https://www.mon.bg/nfs/2025/05/dzi-bel_21052025.pdf"],
    ["Матура по БЕЛ, 17 май 2024", "https://www.mon.bg/nfs/2024/05/dzi-bel_17052024-otgovori.pdf"]
  ];
  function renderDZI() {
    const run = store.get("mockRun", null);
    view.innerHTML = `
      <header class="page-head"><p class="eyebrow">ДЗИ</p><h1>Матури и пробен изпит</h1>
      <p class="lead">Изпитът има 41 задачи в три части: 22 с избираем отговор, 16 с кратък свободен отговор, 2 с разширен свободен отговор (текст до 5 изречения) и задача 41 — есе или интерпретативно съчинение. Общо 100 точки за 4 часа.</p></header>
      <div class="grid2">
        <section class="panel">
          <h2>Пробен изпит като на ДЗИ</h2>
          <p>Нов вариант при всяко пускане, със същия ред на задачите, формулировки и точки като на истинския изпит.</p>
          <table class="dzi-plan"><tbody>
            <tr><th>Част 1 · 60 мин.</th><td>1–7 правопис, граматика, пунктуация · 8–12 запишете правилната форма · 13 пропуснати препинателни знаци · 14–21 текст и диаграма</td><td class="r tnum">37 т.</td></tr>
            <tr><th>Част 2 · 60 мин.</th><td>22–23 лексика · 24–34 литература (вкл. непознат текст и откъс) · 35–38 кратки отговори · 39 автор–творба · 40 съпоставка на два откъса</td><td class="r tnum">33 т.</td></tr>
            <tr><th>Част 3 · 120 мин.</th><td>41 есе или интерпретативно съчинение</td><td class="r tnum">30 т.</td></tr>
          </tbody></table>
          <div class="row">${run && !run.done ? `<button class="btn primary" id="mock-resume">Продължи започнатия изпит</button><button class="btn" id="mock-go">Нов изпит</button>` : `<button class="btn primary" id="mock-go">Започни пробен изпит</button>`}</div>
        </section>
        <section class="panel">
          <h2>Официални изпити на МОН</h2>
          <p>Пълните тестове с ключовете за отговори. Реши ги на хартия, после провери свободните отговори в „Отворени въпроси → Провери отговор на свой въпрос“.</p>
          <ul class="links">${OFFICIAL.map(([t, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${esc(t)}</a><span class="muted small">PDF · тест и ключ</span></li>`).join("")}
            <li><a href="https://www.mon.bg/obshto-obrazovanie/darzhavni-zrelostni-izpiti-dzi/izpitni-materiali-za-dzi-po-predmeti/balgarski-ezik/" target="_blank" rel="noopener">Архив на МОН — всички сесии</a><span class="muted small">по-стари изпити</span></li>
          </ul>
        </section>
      </div>
      <div id="mock"></div>
      <section class="panel"><div class="panel-head"><h2>Моите пробни изпити</h2><a href="#history" data-go="history">Цялата история →</a></div>${historyRows(["mock"], 10, "Все още няма решени пробни изпити.")}</section>`;
    $("#mock-go").onclick = () => { const ex = buildExam(); store.set("mockRun", { exam: ex, ans: {}, start: Date.now() }); showExam(); };
    if ($("#mock-resume")) $("#mock-resume").onclick = showExam;
  }

  // ----- building one exam variant -----
  const normA = (s) => String(s || "").toLowerCase().replace(/ѝ/g, "и").replace(/[„“"'«».,!?;:()–—-]/g, " ").replace(/\s+/g, " ").trim();
  const mcqOf = (q, n, extra = {}) => ({ n, kind: "mcq", pts: 1, q: q.q, o: q.o, a: q.a ?? 0, e: q.e || "", src: q.src || "", order: shuffle(q.o.map((_, k) => k)), ...extra });
  function pickLang(ids, used) {
    const pool = langPool(ids).filter((q) => q.o.length === 4 && !used.has(q.id));
    const q = pick(pool.length ? pool : langPool(ids)); used.add(q.id); return q;
  }
  function buildExam() {
    const D = DZI(), used = new Set(), T = [];
    // Part 1: 1–7
    [["vowels", "double", "yi"], ["vowels", "double", "yi"], ["together", "caps"], ["clen", "grammar"], ["grammar", "verbforms"], ["punct", "speech"], ["punct", "speech"]]
      .forEach((ids, i) => T.push(mcqOf(pickLang(ids, used), i + 1)));
    // 8–12
    const fb = shuffle(D.formInBrackets || []), gw = shuffle(D.grammarWord || []);
    const short = (n, it, instr, pts = 2) => T.push({ n, kind: "short", pts, instr, s: it.s, a: it.a, e: it.e || "" });
    if (fb[0]) short(8, fb[0], "В листа за отговори запишете правилната за изречението форма на думата, поставена в скоби.");
    const sw = pick(D.spellWord || []); if (sw) short(9, sw, "В листа за отговори запишете правилно САМО думата, в която е допусната правописна грешка.");
    if (fb[1]) short(10, fb[1], "В листа за отговори запишете правилната за изречението форма на думата, поставена в скоби.");
    if (gw[0]) short(11, gw[0], "В листа за отговори запишете САМО правилната за изречението форма на думата, в която е допусната граматична грешка.");
    if (gw[1]) short(12, gw[1], "В листа за отговори запишете САМО правилната за изречението форма на думата, в която е допусната граматична грешка.");
    const pt = pick(D.punctText || []); if (pt) T.push({ n: 13, kind: "punct", pts: 5, t: pt.t, key: pt.key, e: pt.e || "" });
    // 14–21: Text 1 + Text 2 (diagram)
    const R = pick(D.reading || []);
    if (R) {
      T.push(mcqOf(R.t14, 14), mcqOf(R.t15, 15), mcqOf(R.t16, 16), mcqOf(R.t17, 17));
      T.push({ n: 18, kind: "short", pts: 1, instr: R.t18.q, a: R.t18.a, e: R.t18.e || "", contains: true });
      T.push({ n: 19, kind: "short", pts: 2, instr: R.t19.q, a: R.t19.a, e: R.t19.e || "", contains: true });
      T.push({ n: 20, kind: "open", pts: 2, instr: R.t20.q, key: (R.t20.a || []).join("; "), rows: 3 });
      T.push({ n: 21, kind: "open", pts: 6, instr: R.t21.q, key: R.t21.key, rows: 7 });
    }
    // Part 2
    const pr = pick(D.paronym || []); if (pr) short(22, pr, "В листа за отговори запишете САМО паронима, с който да поправите лексикалната грешка в изречението.");
    const gp = pick(D.gaps || []); if (gp) T.push({ n: 23, kind: "gaps", pts: 3, t: gp.t, opts: gp.opts, a: gp.a, e: gp.e || "" });
    const cmp = shuffle(D.compareMCQ || []);
    const litFill = shuffle(litPool({ gen: false }).filter((q) => q.o.length === 4));
    const nextLit = () => cmp.length ? cmp.pop() : litFill.pop();
    for (let n = 24; n <= 29; n++) T.push(mcqOf(nextLit(), n));
    const un = pick(D.unknown || []);
    if (un) T.push(mcqOf(un, 30, { excerpt: un.excerpt, exHead: `${un.author} — „${un.title}“ (откъс)` })); else T.push(mcqOf(nextLit(), 30));
    T.push(mcqOf(nextLit(), 31), mcqOf(nextLit(), 32));
    const P = pick(D.prose || []);
    const pm = P ? P.tasks.filter((t) => t.type === "mcq") : [], ps = P ? P.tasks.find((t) => t.type === "short") : null;
    if (P) T.push({ n: 33, kind: "passage", intro: P.intro, excerpt: P.excerpt });
    T.push(mcqOf(pm[0] || nextLit(), 33), mcqOf(pm[1] || nextLit(), 34));
    const ls = shuffle(D.litShort || []);
    const lsTask = (n, it) => T.push({ n, kind: "open", pts: 2, instr: it.q, excerpt: it.excerpt || "", key: it.key, rows: 3 });
    if (ps) lsTask(35, ps); else if (ls.length) lsTask(35, ls.pop());
    [36, 37, 38].forEach((n) => { if (ls.length) lsTask(n, ls.pop()); });
    // 39 author–work matching (3 distinct authors)
    const byAuthor = shuffle([...new Set(WORKS.map((w) => w.author))]).slice(0, 3).map((a) => pick(WORKS.filter((w) => w.author === a)));
    T.push({ n: 39, kind: "match", pts: 3, works: byAuthor.map((w) => w.title), authors: shuffle(byAuthor.map((w) => w.author)), a: byAuthor.map((w) => w.author) });
    const c40 = pick(D.compare40 || []); if (c40) T.push({ n: 40, kind: "open", pts: 6, instr: c40.q, A: c40.A, B: c40.B, key: c40.key, rows: 7 });
    // Part 3
    const is = pick(D.is41 || []), es = pick(D.essay41 || W.topicsEssay);
    T.push({ n: 41, kind: "write", pts: 30, essay: es, is: is ? { topic: is.topic, label: is.label, excerpt: is.excerpt || "", work: is.work } : { topic: pick(W.topicsIS), label: "(Интерпретативно съчинение)", excerpt: "" } });
    return { reading: R ? { text1: R.text1, chart: R.chart } : null, tasks: T };
  }

  // ----- diagram (Text 2): grouped horizontal bars with exam-like textures -----
  function chartSVG(c) {
    const id = "p" + Math.random().toString(36).slice(2, 7);
    const S = c.series.length, rowH = S * 17 + 18, labW = 200, plotW = 380, valW = 44, top = 8;
    const max = Math.max(10, Math.ceil(Math.max(...c.series.flatMap((s) => s.values)) / 10) * 10);
    const H = top + c.categories.length * rowH + 30, Wd = labW + plotW + valW;
    const x = (v) => labW + (v / max) * plotW;
    const pats = [
      `<pattern id="${id}0" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="currentColor"/><circle cx="2" cy="2" r=".9" class="pbg"/></pattern>`,
      `<pattern id="${id}1" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" class="pbg"/><rect width="4" height="2.2" fill="currentColor"/></pattern>`,
      `<pattern id="${id}2" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" class="pbg"/><rect width="2.2" height="4" fill="currentColor"/></pattern>`
    ];
    const ticks = []; for (let v = 0; v <= max; v += max <= 50 ? 10 : 20) ticks.push(v);
    let bars = "";
    c.categories.forEach((cat, i) => {
      const y0 = top + i * rowH + 9;
      bars += `<text x="${labW - 10}" y="${y0 + (S * 17) / 2}" class="cl" text-anchor="end" dominant-baseline="middle">${esc(cat)}</text>`;
      c.series.forEach((s, j) => {
        const v = s.values[i], y = y0 + j * 17;
        bars += `<rect x="${labW}" y="${y}" width="${Math.max(1, x(v) - labW)}" height="14" fill="url(#${id}${j % 3})" class="bar"><title>${esc(s.name)}: ${v}${esc(c.unit || "")}</title></rect><text x="${x(v) + 5}" y="${y + 7}" class="cv" dominant-baseline="middle">${v}${esc(c.unit || "")}</text>`;
      });
    });
    const axis = ticks.map((v) => `<line x1="${x(v)}" x2="${x(v)}" y1="${top}" y2="${H - 26}" class="cg"/><text x="${x(v)}" y="${H - 12}" class="ct" text-anchor="middle">${v}${esc(c.unit || "")}</text>`).join("");
    const legend = c.series.map((s, j) => `<span class="lg"><svg width="22" height="12" aria-hidden="true"><defs>${pats[j % 3].replace(`id="${id}${j % 3}"`, `id="${id}L${j}"`)}</defs><rect width="22" height="12" fill="url(#${id}L${j})" class="bar"/></svg>${esc(s.name)}</span>`).join("");
    return `<figure class="dchart"><figcaption>${esc(c.title)}</figcaption>
      <div class="dchart-scroll"><svg viewBox="0 0 ${Wd} ${H}" role="img" aria-label="${esc(c.title)}"><defs>${pats.join("")}</defs>${axis}${bars}</svg></div>
      <div class="legend">${legend}</div>${c.source ? `<p class="muted small">${esc(c.source)}</p>` : ""}</figure>`;
  }

  // ----- showing the exam -----
  function showExam() {
    const run = store.get("mockRun", null); if (!run) return renderDZI();
    const { exam } = run, ans = run.ans || {};
    const host = $("#mock");
    const L = "АБВГ";
    const val = (k) => esc(ans[k] || "");
    const excerptBox = (head, txt) => `<div class="excerpt">${head ? `<p class="exhead">${esc(head)}</p>` : ""}<p>${esc(txt)}</p></div>`;
    const task = (t) => {
      const num = `<span class="num">${t.n}.</span>`;
      const pts = t.pts ? `<span class="tpts">${t.pts} т.</span>` : "";
      if (t.kind === "passage") return `<div class="passage"><p><b>${esc(t.intro)}</b></p>${excerptBox("", t.excerpt)}</div>`;
      if (t.kind === "mcq") return `<fieldset class="mq" data-n="${t.n}"><legend>${num} ${esc(t.q)} ${pts}</legend>${t.excerpt ? excerptBox(t.exHead, t.excerpt) : ""}${t.order.map((k, j) => `<label class="mopt"><input type="radio" name="q${t.n}" value="${k}" ${ans["q" + t.n] === String(k) ? "checked" : ""}><span class="letter">${L[j]}</span> ${esc(t.o[k])}</label>`).join("")}</fieldset>`;
      if (t.kind === "short") return `<div class="oq" data-n="${t.n}"><p>${num} ${esc(t.instr)} ${pts}</p>${t.s ? `<p class="sent">${esc(t.s)}</p>` : ""}<input type="text" name="q${t.n}" value="${val("q" + t.n)}" autocomplete="off"></div>`;
      if (t.kind === "punct") return `<div class="oq" data-n="${t.n}"><p>${num} В текста са пропуснати САМО ПЕТ препинателни знака. Препишете ЦЕЛИЯ текст в листа за отговори, като поставите пропуснатите знаци. ${pts}</p><p class="sent">${esc(t.t)}</p><textarea name="q${t.n}" rows="4">${ans["q" + t.n] != null ? val("q" + t.n) : esc(t.t)}</textarea></div>`;
      if (t.kind === "gaps") return `<div class="oq" data-n="${t.n}"><p>${num} Прочетете текста. За всяко празно място изберете УМЕСТНАТА дума и я запишете срещу съответната буква в листа за отговори. ${pts}</p><p class="sent">${esc(t.t)}</p><div class="gaprow">${Object.keys(t.opts).map((g) => `<label class="fld"><span>(${g})</span><select name="q${t.n}${g}"><option value="">—</option>${t.opts[g].map((o) => `<option ${ans["q" + t.n + g] === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`).join("")}</div></div>`;
      if (t.kind === "match") return `<div class="oq" data-n="${t.n}"><p>${num} Свържете заглавието на всяка от творбите с нейния автор, като в листа за отговори срещу съответната буква запишете номера, под който е записано името на автора. ${pts}</p><div class="match"><ol class="mt">${t.works.map((w, i) => `<li><b>${"АБВ"[i]})</b> „${esc(w)}“ <select name="q${t.n}${i}"><option value="">—</option>${t.authors.map((_, k) => `<option value="${k}" ${ans["q" + t.n + i] === String(k) ? "selected" : ""}>${k + 1}</option>`).join("")}</select></li>`).join("")}</ol><ol class="ma">${t.authors.map((a, k) => `<li><b>${k + 1}.</b> ${esc(a)}</li>`).join("")}</ol></div></div>`;
      if (t.kind === "open") return `<div class="oq" data-n="${t.n}"><p>${num} ${esc(t.instr)} ${pts}</p>${t.excerpt ? excerptBox("", t.excerpt) : ""}${t.A ? `<div class="pair">${excerptBox(`${t.A.author} — „${t.A.title}“`, t.A.excerpt)}${excerptBox(`${t.B.author} — „${t.B.title}“`, t.B.excerpt)}</div>` : ""}<textarea name="q${t.n}" rows="${t.rows || 4}">${val("q" + t.n)}</textarea></div>`;
      if (t.kind === "write") return `<div class="oq" data-n="${t.n}"><p>${num} Напишете аргументативен текст в обем до 4 страници по ЕДНА от следните две теми: ${pts}</p>
        <div class="pair"><button type="button" class="topic-btn" data-kind="essay" data-t="${esc(t.essay)}"><span class="eyebrow">Тема за есе</span>${esc(t.essay)} (Есе)</button>
        <button type="button" class="topic-btn" data-kind="is" data-t="${esc(t.is.topic)}"><span class="eyebrow">Тема за интерпретативно съчинение</span>${esc(t.is.topic)} ${esc(t.is.label)}</button></div>
        ${t.is.excerpt ? `<details class="isx"><summary>Откъс към темата за интерпретативно съчинение</summary>${excerptBox("", t.is.excerpt)}<p class="muted small">* Откъсите са опора за създаването на интерпретативното съчинение, като може да се използват и други моменти от творбата.</p></details>` : ""}
        <p class="muted small">Натисни тема, за да я напишеш в раздел „Съчинения“ и да я провериш по критериите. Тази задача не влиза в автоматичния резултат по-долу.</p></div>`;
      return "";
    };
    const part = (from, to) => exam.tasks.filter((t) => t.n >= from && t.n <= to && t.kind !== "write");
    const R = exam.reading;
    host.innerHTML = `
      <form class="mock" id="mockf" autocomplete="off">
        <div class="mock-bar"><b>Пробен ДЗИ</b><span class="tnum" id="mock-clock"></span><a href="#mock-p2">Част 2</a><a href="#mock-p3">Част 3</a></div>
        <h3 class="part">Част 1 · 60 минути · задачи 1–21</h3>
        ${part(1, 13).map(task).join("")}
        ${R ? `<div class="reading"><p><b>Запознайте се с текста и диаграмата и изпълнете задачите към тях (от 14. до 21. включително).</b></p>
          <div class="text1"><p class="exhead">ТЕКСТ 1</p>${R.text1.split(/\n\s*\n/).map((p) => `<p>${esc(p)}</p>`).join("")}</div>
          <div class="text2"><p class="exhead">ТЕКСТ 2 (ДИАГРАМА)</p>${chartSVG(R.chart)}</div></div>` : ""}
        ${part(14, 21).map(task).join("")}
        <h3 class="part" id="mock-p2">Част 2 · 60 минути · задачи 22–40</h3>
        ${part(22, 40).map(task).join("")}
        <h3 class="part" id="mock-p3">Част 3 · 120 минути · задача 41</h3>
        ${exam.tasks.filter((t) => t.kind === "write").map(task).join("")}
        <div class="row"><button class="btn primary" type="submit" id="mock-submit">Предай части 1 и 2</button><span class="muted small">Отговорите се пазят, докато пишеш — можеш да продължиш по-късно.</span></div>
        <div id="mock-res"></div>
      </form>`;
    // clock
    const clock = $("#mock-clock");
    const tick = () => { if (!document.body.contains(clock)) return clearInterval(iv); const left = 240 * 60 - Math.floor((Date.now() - run.start) / 1000); const a = Math.abs(left); clock.textContent = `${left < 0 ? "−" : ""}${Math.floor(a / 3600)}:${String(Math.floor(a / 60) % 60).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`; clock.classList.toggle("over", left < 0); };
    const iv = setInterval(tick, 1000); tick();
    // autosave
    const f = $("#mockf"); let sv;
    f.addEventListener("input", () => { clearTimeout(sv); sv = setTimeout(() => { const r = store.get("mockRun", null); if (!r) return; const a = {}; new FormData(f).forEach((v, k) => { a[k] = String(v); }); r.ans = a; store.set("mockRun", r); }, 400); });
    $$(".topic-btn", host).forEach((b) => b.onclick = () => { store.set("writeTopic", { kind: b.dataset.kind, topic: b.dataset.t }); go("write"); });
    $$(".mock-bar a", host).forEach((a) => a.onclick = (e) => { e.preventDefault(); $(a.getAttribute("href")).scrollIntoView({ behavior: "smooth" }); });
    host.scrollIntoView({ behavior: "smooth" });
    f.onsubmit = (e) => { e.preventDefault(); gradeExam(f, exam, run); };
  }

  // ----- grading -----
  function punctScore(t, key, answer) {
    // words with the punctuation that follows them; a free-standing mark (e.g. a dash) joins the previous word
    const tok = (s) => { const out = []; String(s).trim().split(/\s+/).forEach((w) => { if (out.length && !/[а-яa-zѝ0-9]/i.test(w)) out[out.length - 1] += w; else if (w) out.push(w); }); return out; };
    const bare = (w) => w.replace(/[^а-яa-zѝ0-9]/gi, "").toLowerCase();
    const K = tok(key), G = tok(t), A = tok(answer || "");
    if (K.map(bare).join(" ") !== A.map(bare).join(" ") || K.length !== G.length) return null;
    let s = 0; K.forEach((k, i) => { if (k !== G[i] && A[i] === k) s++; });
    let extra = 0; A.forEach((a, i) => { if (K[i] === G[i] && a !== K[i]) extra++; });
    return Math.max(0, Math.min(5, s - extra));
  }
  function gradeExam(f, exam, run) {
    const fd = (k) => (f.elements[k] && f.elements[k].value) || "";
    let auto = 0; const items = [], open = [];
    exam.tasks.forEach((t) => {
      const box = f.querySelector(`[data-n="${t.n}"]`);
      if (t.kind === "mcq") {
        const v = f.querySelector(`input[name=q${t.n}]:checked`), c = v ? +v.value : null, ok = c === t.a;
        if (ok) auto++;
        items.push({ q: `${t.n}. ${t.q}`, o: t.o, a: t.a, c, e: t.e, src: t.src });
        $$("label", box).forEach((l) => { const k = +l.querySelector("input").value; if (k === t.a) l.classList.add("right"); else if (k === c) l.classList.add("wrong"); });
      } else if (t.kind === "short") {
        const g = normA(fd("q" + t.n));
        const ok = !!g && t.a.some((x) => { const a = normA(x); return g === a || (t.contains && (g.includes(a) || (a.includes(g) && g.length > 3))); });
        const sc = ok ? t.pts : 0; auto += sc;
        open.push({ type: `${t.n}. Кратък отговор`, task: (t.instr || "") + (t.s ? " " + t.s : ""), max: t.pts, ans: fd("q" + t.n), key: t.a.join(" / "), r: { score: sc, correct: t.a[0], comment: t.e } });
        box.insertAdjacentHTML("beforeend", `<p class="fb ${ok ? "ok" : "no"}"><b>${sc}/${t.pts} т.</b> ${ok ? "Вярно." : `Верен отговор: <b>${esc(t.a[0])}</b>.`} <span class="muted">${esc(t.e)}</span></p>`);
      } else if (t.kind === "punct") {
        const sc = punctScore(t.t, t.key, fd("q" + t.n));
        if (sc != null) auto += sc;
        open.push({ type: `${t.n}. Пунктуация`, task: t.t, max: 5, ans: fd("q" + t.n), key: t.key, r: sc != null ? { score: sc, correct: t.key, comment: t.e } : null, self: sc == null });
        box.insertAdjacentHTML("beforeend", `<p class="fb ${sc === 5 ? "ok" : "no"}">${sc != null ? `<b>${sc}/5 т.</b>` : `<b>Текстът е променен</b> — сравни сам и си дай точки по-долу.`} Правилно: <span class="keyline">${esc(t.key)}</span> <span class="muted">${esc(t.e)}</span></p>`);
      } else if (t.kind === "gaps") {
        let sc = 0; Object.keys(t.a).forEach((g) => { if (fd("q" + t.n + g) === t.a[g]) sc++; }); auto += sc;
        open.push({ type: `${t.n}. Уместна дума`, task: t.t, max: 3, ans: Object.keys(t.a).map((g) => `(${g}) ${fd("q" + t.n + g)}`).join(", "), key: Object.keys(t.a).map((g) => `(${g}) ${t.a[g]}`).join(", "), r: { score: sc, correct: Object.keys(t.a).map((g) => `(${g}) ${t.a[g]}`).join(", "), comment: t.e } });
        box.insertAdjacentHTML("beforeend", `<p class="fb ${sc === 3 ? "ok" : "no"}"><b>${sc}/3 т.</b> Правилно: ${Object.keys(t.a).map((g) => `(${g}) <b>${esc(t.a[g])}</b>`).join(", ")}. <span class="muted">${esc(t.e)}</span></p>`);
      } else if (t.kind === "match") {
        let sc = 0; t.works.forEach((w, i) => { const k = fd("q" + t.n + i); if (k !== "" && t.authors[+k] === t.a[i]) sc++; }); auto += sc;
        const corr = t.works.map((w, i) => `„${w}“ — ${t.a[i]}`).join("; ");
        open.push({ type: `${t.n}. Автор и творба`, task: "Свържете заглавията с авторите.", max: 3, ans: t.works.map((w, i) => { const k = fd("q" + t.n + i); return `${"АБВ"[i]}) ${k === "" ? "—" : +k + 1}`; }).join(", "), key: corr, r: { score: sc, correct: corr } });
        box.insertAdjacentHTML("beforeend", `<p class="fb ${sc === 3 ? "ok" : "no"}"><b>${sc}/3 т.</b> ${esc(corr)}</p>`);
      } else if (t.kind === "open") {
        open.push({ type: `${t.n}. Свободен отговор`, task: t.instr, max: t.pts, ans: fd("q" + t.n), key: t.key, self: true, n: t.n });
      }
    });
    const selfItems = open.filter((o) => o.self);
    const autoMax = exam.tasks.filter((t) => t.kind !== "write" && t.kind !== "passage" && !(t.kind === "open")).reduce((s, t) => s + (t.pts || 0), 0);
    $("#mock-submit").disabled = true;
    const res = $("#mock-res");
    res.innerHTML = `
      <div class="grade-card"><div class="grade-num tnum" id="mk-total">${auto}<small>/70</small></div><div><div class="grade-name">Части 1 и 2</div><div class="muted" id="mk-sub">${auto} т. автоматично (от ${autoMax}) · свободните отговори — оцени ги по-долу</div></div></div>
      <section class="panel selfscore"><h3>Оцени свободните отговори</h3>
        <p class="muted">Сравни отговора си с примерния и си дай точки. На ДЗИ се приемат и други адекватни отговори, не само дословните.</p>
        <div class="row" id="mk-ai-row"></div>
        <ol class="review">${selfItems.map((o, i) => `<li><p class="q-src">${esc(o.type)} · до ${o.max} т.</p><p><b>${esc(o.task)}</b></p>${o.ans ? `<p class="yours">${esc(o.ans)}</p>` : `<p class="muted">Без отговор</p>`}<p class="keyline">${esc(o.key)}</p><p class="ai-c muted" id="mk-c${i}"></p><label class="fld inline"><span>Точки</span><select data-self="${i}">${Array.from({ length: o.max + 1 }, (_, p) => `<option value="${p}">${p}</option>`).join("")}</select></label></li>`).join("")}</ol>
        <div class="row"><button class="btn primary" type="button" id="mk-save">Запиши резултата</button><span class="muted small" id="mk-saved"></span></div>
      </section>`;
    const total = () => auto + $$("[data-self]", res).reduce((s, el) => s + +el.value, 0);
    const upd = () => { const t = total(); $("#mk-total").innerHTML = `${t}<small>/70</small>`; $("#mk-sub").textContent = `${auto} т. автоматично + ${t - auto} т. свободни отговори · ≈ ${grade(t / 70).value} без задача 41`; };
    $$("[data-self]", res).forEach((el) => el.onchange = upd); upd();
    // Claude check of open answers (only inside claude.ai) / copy for any AI chat elsewhere
    const aiRow = $("#mk-ai-row");
    const prompt = `${TEACHER}

Провери свободните отговори от пробен ДЗИ по БЕЛ. За всяка задача дай точки (0 до max), кратък коментар и примерен верен отговор. Празен отговор = 0 точки. Приемай адекватни отговори, не само дословни.
${selfItems.map((it, i) => `#${i + 1} [${it.type}, max ${it.max}]\nЗАДАЧА: ${it.task}\nОПОРА: ${it.key}\nОТГОВОР: """${(it.ans || "").slice(0, 2500)}"""`).join("\n\n")}

Отговори само с JSON масив в същия ред: [{"score":число,"comment":"едно-две изречения"}]`;
    if (aiState === "ready") {
      aiRow.innerHTML = `<button class="btn" type="button" id="mk-ai">Провери свободните отговори с Claude</button>`;
      $("#mk-ai").onclick = async () => {
        $("#mk-ai").disabled = true; $("#mk-ai").textContent = "Проверявам…";
        try {
          const r = await askJSON(prompt, { modelTier: "default", cache: false });
          selfItems.forEach((it, i) => { const x = (Array.isArray(r) && r[i]) || {}; const s = Math.max(0, Math.min(it.max, +x.score || 0)); const sel = $(`[data-self="${i}"]`, res); sel.value = String(s); $("#mk-c" + i).textContent = x.comment || ""; });
          upd(); $("#mk-ai").textContent = "Проверено — можеш да промениш точките";
        } catch (e) { $("#mk-ai").disabled = false; $("#mk-ai").textContent = "Провери свободните отговори с Claude"; aiRow.insertAdjacentHTML("beforeend", `<span class="warn">${aiErr(e)}</span>`); }
      };
    } else { lastPrompt = prompt; aiRow.innerHTML = copyForAI("Искаш ли външна проверка?"); }
    $("#mk-save").onclick = () => {
      const t = total();
      selfItems.forEach((it, i) => { it.r = { score: +$(`[data-self="${i}"]`, res).value, correct: it.key, comment: $("#mk-c" + i).textContent }; });
      const w41 = exam.tasks.find((x) => x.kind === "write");
      logHistory({ t: "mock", title: "Пробен ДЗИ (части 1 и 2)", score: t, max: 70, grade: grade(t / 70).value, items, open, topics: w41 ? { essay: w41.essay, is: w41.is.topic } : null });
      const r2 = store.get("mockRun", null); if (r2) { r2.done = true; store.set("mockRun", r2); }
      $("#mk-save").disabled = true; $("#mk-saved").textContent = "Записано в историята.";
    };
    res.scrollIntoView({ behavior: "smooth" });
  }

  // ---------- LANGUAGE ----------
  function renderLang(topicId) {
    const t = LANG.find((x) => x.id === topicId) || LANG[0];
    const areas = [...new Set(LANG.map((x) => x.area))];
    view.innerHTML = `
      <header class="page-head"><p class="eyebrow">Български език</p><h1>Правила и упражнения</h1><p class="lead">Най-честите теми в езиковите задачи на ДЗИ. Прочети правилото, после го упражни.</p></header>
      <div class="lang-layout">
        <nav class="topics">${areas.map((a) => `<p class="area">${esc(a)}</p>${LANG.filter((x) => x.area === a).map((x) => `<a href="#lang-${x.id}" data-go="lang" data-arg="${x.id}" class="${x.id === t.id ? "on" : ""}">${esc(x.title)}</a>`).join("")}`).join("")}
          <p class="area">Редактиране</p><a href="#lang-edit" data-go="lang" data-arg="edit" class="${topicId === "edit" ? "on" : ""}">Поправи изречението</a>
        </nav>
        <article class="rules" id="lang-main"></article>
      </div>`;
    const main = $("#lang-main");
    if (topicId === "edit") return renderEdit(main);
    main.innerHTML = `<h2>${esc(t.title)}</h2>${t.rules}<div class="row"><button class="btn primary" id="l-go">Упражнение (20 от ${t.ex.length} въпроса)</button><button class="btn" id="l-all">Смесено от всички теми</button></div><div id="l-q"></div>
      <section class="lang-hist"><h3>Моите упражнения по език</h3>${historyRows(["lang", "edit"], 8, "Все още няма решени упражнения.")}</section>`;
    $("#l-go").onclick = () => runQuiz($("#l-q"), shuffle(langPool([t.id])).slice(0, 20), { title: t.title, type: "lang", onDone: () => go("lang", t.id) });
    $("#l-all").onclick = () => runQuiz($("#l-q"), shuffle(langPool()).slice(0, 20), { title: "Български език (смесено)", type: "lang", onDone: () => go("lang", t.id) });
  }
  function renderEdit(main) {
    const list = shuffle(window.EDIT_TASKS || []);
    let i = 0;
    const show = () => {
      const t = list[i % list.length];
      main.innerHTML = `<h2>Поправи изречението</h2><p class="muted">Като задачите за редактиране на ДЗИ: препиши изречението без правописни, граматични и пунктуационни грешки.</p>
        <blockquote class="edit-src">${esc(t.text)}</blockquote>
        <textarea id="ed-a" rows="3">${esc(t.text)}</textarea>
        <div class="row"><button class="btn primary" id="ed-c">Сравни</button><button class="btn ghost" id="ed-n">Следващо</button></div>
        <div id="ed-o"></div>`;
      $("#ed-c").onclick = () => {
        const norm = (s) => s.replace(/\s+/g, " ").trim();
        const ok = norm($("#ed-a").value) === norm(t.fixed);
        logHistory({ t: "edit", title: t.text, score: ok ? 1 : 0, max: 1, text: t.text, answer: $("#ed-a").value, fixed: t.fixed, note: t.note });
        $("#ed-o").innerHTML = `<div class="fb ${ok ? "ok" : "no"}"><b>${ok ? "Точно така." : "Сравни с правилния вариант:"}</b></div><p class="keyline">${esc(t.fixed)}</p><p class="muted">${esc(t.note)}</p>`;
      };
      $("#ed-n").onclick = () => { i++; show(); };
    };
    show();
  }

  // ---------- WRITING ----------
  function renderWrite() {
    const pre = store.get("writeTopic", null);
    const draft = store.get("writeDraft", { kind: pre ? pre.kind : "is", topic: pre ? pre.topic : "", text: "" });
    if (pre) { draft.kind = pre.kind; draft.topic = pre.topic; store.set("writeTopic", null); }
    let kind = draft.kind;
    view.innerHTML = `
      <header class="page-head"><p class="eyebrow">Задача 41</p><h1>Интерпретативно съчинение и есе</h1><p class="lead">Правилата, структурата, критериите и пример. Напиши своя текст и го провери по критериите на ДЗИ.</p></header>
      <div class="tabs" role="tablist">
        <button role="tab" data-k="is">Интерпретативно съчинение</button>
        <button role="tab" data-k="essay">Есе</button>
        <button role="tab" data-k="check">Провери моя текст</button>
      </div>
      <div id="w-main"></div>
      <section class="panel"><div class="panel-head"><h2>Моите съчинения</h2><a href="#history" data-go="history">Цялата история →</a></div>${historyRows(["essay"], 10, "Все още няма проверени съчинения.")}</section>`;
    const tabs = $$(".tabs button");
    const show = (k) => {
      tabs.forEach((b) => b.setAttribute("aria-selected", b.dataset.k === k));
      const m = $("#w-main");
      if (k === "check") return renderChecker(m, draft);
      kind = k; draft.kind = k; store.set("writeDraft", draft);
      const g = W[k];
      m.innerHTML = `
        <section class="panel"><h2>Какво е ${esc(g.name.toLowerCase())}</h2><p>${g.what}</p></section>
        <section class="panel"><h2>Структура</h2><div class="structure">${g.structure.map((s) => `<div class="sblock"><div class="shead"><b>${esc(s.part)}</b><span class="muted small">${esc(s.size)}</span></div><p>${s.body}</p></div>`).join("")}</div></section>
        <div class="grid2">
          <section class="panel"><h2>Правила</h2><ul class="rules-list">${g.rules.map((r) => `<li>${r}</li>`).join("")}</ul></section>
          <section class="panel"><h2>Чести грешки</h2><ul class="miss">${g.mistakes.map((r) => `<li>${esc(r)}</li>`).join("")}</ul>
            <h2>Как се оценява</h2><ul class="crit">${W.criteria.map((c) => `<li><b>${esc(c.name)}</b><span>${esc(c.desc)}</span></li>`).join("")}</ul></section>
        </div>
        ${k === "essay" ? exampleHTML(W.exampleEssay) : W.exampleIS ? exampleHTML(W.exampleIS) : ""}
        <section class="panel"><h2>Теми за упражнение</h2><p class="muted">Натисни тема, за да започнеш да пишеш по нея.</p>
          <div class="topic-list">${(k === "is" ? W.topicsIS : W.topicsEssay).map((t) => `<button class="topic" data-t="${esc(t)}">${esc(t)}</button>`).join("")}</div></section>`;
      $$(".topic", m).forEach((b) => b.onclick = () => { draft.kind = k; draft.topic = b.dataset.t; store.set("writeDraft", draft); show("check"); });
    };
    tabs.forEach((b) => b.onclick = () => show(b.dataset.k));
    show(pre ? "check" : kind);
  }
  function exampleHTML(ex) {
    return `<section class="panel example"><h2>Пример: ${esc(ex.kind)}</h2><p class="muted">${esc(ex.note)}</p>
      <h3 class="ex-title">${esc(ex.title)}</h3>
      <div class="ex-body">${ex.parts.map((p) => `<div class="ex-part"><span class="ex-role">${esc(p.role)}</span><p>${esc(p.text)}</p></div>`).join("")}</div></section>`;
  }
  function renderChecker(m, draft) {
    m.innerHTML = `
      <section class="panel checker">
        <div class="row wrap">
          <label class="fld"><span>Вид</span><select id="k-kind"><option value="is">Интерпретативно съчинение</option><option value="essay">Есе</option></select></label>
          <label class="fld grow"><span>Тема</span><input id="k-topic" type="text" placeholder="Напиши или избери тема" list="k-topics"></label>
          <datalist id="k-topics"></datalist>
          <button class="btn ghost" id="k-rand" type="button">Случайна тема</button>
        </div>
        <label class="fld"><span>Твоят текст</span><textarea id="k-text" class="paper" rows="18" placeholder="Започни с увода…"></textarea></label>
        <div class="row wrap">
          <span class="muted small tnum" id="k-count"></span>
          <label class="btn ghost file" id="k-photo-l" hidden><input type="file" id="k-photo" accept="image/*" multiple hidden>Добави снимки на ръкописа</label>
          <span class="muted small" id="k-photos"></span>
          <span class="grow"></span>
          <button class="btn primary" id="k-check" data-needs-ai>Провери по критериите на ДЗИ</button>
          <button class="btn ghost" id="k-stop" hidden>Спри</button>
        </div>
      </section>
      <div id="k-out"></div>`;
    const kindSel = $("#k-kind"), topic = $("#k-topic"), text = $("#k-text");
    kindSel.value = draft.kind === "essay" ? "essay" : "is"; topic.value = draft.topic || ""; text.value = draft.text || "";
    const fillTopics = () => { $("#k-topics").innerHTML = (kindSel.value === "is" ? W.topicsIS : W.topicsEssay).map((t) => `<option value="${esc(t)}">`).join(""); };
    const count = () => { const w = text.value.trim() ? text.value.trim().split(/\s+/).length : 0; $("#k-count").textContent = `${w} думи · ≈ ${(w / 250).toFixed(1)} ръкописни стр.`; };
    const save = () => { draft.kind = kindSel.value; draft.topic = topic.value; draft.text = text.value; store.set("writeDraft", draft); };
    fillTopics(); count();
    kindSel.onchange = () => { fillTopics(); save(); };
    topic.oninput = save; text.oninput = () => { count(); save(); };
    $("#k-rand").onclick = () => { topic.value = pick(kindSel.value === "is" ? W.topicsIS : W.topicsEssay); save(); };
    let photos = [];
    getSample().then(async (s) => {
      if (!s) return;
      const lim = await s.limits().catch(() => null);
      if (lim && lim.images) {
        $("#k-photo-l").hidden = false;
        $("#k-photo").accept = lim.images.mediaTypes.join(",");
        $("#k-photo").onchange = (e) => { photos = [...e.target.files].slice(0, lim.images.maxCount); $("#k-photos").textContent = photos.length ? `${photos.length} снимки` : ""; };
      }
    });
    let ctl;
    $("#k-stop").onclick = () => ctl && ctl.abort();
    $("#k-check").onclick = async () => {
      const out = $("#k-out");
      if (!topic.value.trim()) { out.innerHTML = `<p class="warn">Избери или напиши тема.</p>`; return; }
      if (text.value.trim().split(/\s+/).length < 80 && !photos.length) { out.innerHTML = `<p class="warn">Текстът е твърде кратък за проверка. Напиши поне няколко абзаца или добави снимки.</p>`; return; }
      const k = kindSel.value, g = W[k];
      const wk = WORKS.find((w) => topic.value.includes(w.title));
      ctl = new AbortController();
      $("#k-check").disabled = true; $("#k-stop").hidden = false;
      out.innerHTML = `<div class="thinking">Проверявам текста внимателно. Това отнема до минута…</div>`;
      const prompt = `${TEACHER}

Оцени ${g.name.toUpperCase()} на ученичка като проверител на задача 41 от ДЗИ по БЕЛ.
ТЕМА: ${topic.value}
${wk ? "\nСПРАВКА ЗА ТВОРБАТА (за проверка на фактите):\n" + workBrief(wk) + "\n" : ""}
ИЗИСКВАНИЯ ЗА ЖАНРА: ${g.what.replace(/<[^>]+>/g, "")}
СТРУКТУРА: ${g.structure.map((s) => s.part + ": " + s.body.replace(/<[^>]+>/g, "")).join(" | ")}
КРИТЕРИИ: ${W.criteria.map((c) => c.name + " — " + c.desc).join("; ")}.
${photos.length ? "Текстът е (и) на приложените снимки на ръкопис — прочети го от тях." : ""}
ТЕКСТ НА УЧЕНИЧКАТА:
"""${text.value.slice(0, 30000)}"""

Оцени всеки критерий от 0 до 5. Посочи конкретни езикови грешки (до 15 най-важни) с точния грешен откъс. Дай съвети, които могат да се приложат веднага.
Отговори само с JSON:
{"thesis":"тезата, както я разбираш от текста (или 'Липсва ясна теза')","criteria":[{"name":"име на критерия","score":0-5,"comment":"1-2 изречения"}],"strengths":["..."],"weaknesses":["..."],"errors":[{"wrong":"откъс","right":"поправка","why":"правило"}],"structure":"коментар за увод, изложение, заключение","advice":["3-5 конкретни съвета"],"grade":"оценка по шестобалната система с десети, напр. 5.25"}`;
      try {
        lastPrompt = prompt;
        const s = await getSample(); if (!s) throw { code: "unavailable" };
        const opts = { modelTier: "complex", cache: false, signal: ctl.signal };
        if (photos.length) opts.images = photos;
        const r = await s.json(prompt, opts);
        out.innerHTML = writingFeedback(r);
        logHistory({ t: "essay", title: `${k === "is" ? "ИС" : "Есе"}: ${topic.value}`, grade: r.grade ? String(r.grade) : "", kind: k, topic: topic.value, text: text.value, photos: photos.length, fb: r });
        out.insertAdjacentHTML("beforeend", `<p class="muted small">Съчинението и оценката са записани в историята.</p>`);
      } catch (e) {
        if (offline(e)) logHistory({ t: "essay", title: `${k === "is" ? "ИС" : "Есе"}: ${topic.value}`, kind: k, topic: topic.value, text: text.value });
        out.innerHTML = offline(e) ? copyForAI("Съчинението е записано в историята.") : `<p class="warn">${aiErr(e)}</p>`;
      } finally { $("#k-check").disabled = false; $("#k-stop").hidden = true; }
    };
  }
  function writingFeedback(r) {
    const arr = (a) => (Array.isArray(a) ? a : []).filter(Boolean);
    const crit = arr(r.criteria);
    return `<section class="panel feedback big">
      <div class="fb-score"><span class="pts tnum">${esc(r.grade || "—")}</span><p><b>Теза:</b> ${esc(r.thesis || "")}</p></div>
      <table class="crit-table"><tbody>${crit.map((c) => `<tr><th>${esc(c.name)}</th><td class="tnum">${esc(c.score)}/5</td><td><span class="meter"><span style="width:${(Math.max(0, Math.min(5, +c.score || 0)) / 5) * 100}%"></span></span></td><td>${esc(c.comment)}</td></tr>`).join("")}</tbody></table>
      ${r.structure ? `<h4>Композиция</h4><p>${esc(r.structure)}</p>` : ""}
      <div class="grid2">
        <div><h4>Силни страни</h4><ul class="good">${arr(r.strengths).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
        <div><h4>За подобряване</h4><ul class="miss">${arr(r.weaknesses).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      </div>
      ${arr(r.errors).length ? `<h4>Езикови грешки</h4><ul class="errs">${arr(r.errors).map((x) => `<li><span class="red-pen"><s>${esc(x.wrong)}</s> → <span>${esc(x.right)}</span></span> <span class="muted">${esc(x.why || "")}</span></li>`).join("")}</ul>` : ""}
      ${arr(r.advice).length ? `<h4>Какво да направиш следващия път</h4><ol>${arr(r.advice).map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}
    </section>`;
  }

  // ---------- HISTORY ----------
  function renderHistory(id, remoteAll) {
    if (id) return renderHistoryItem(id);
    if (sync.user && !remoteAll) {
      view.innerHTML = `<header class="page-head"><p class="eyebrow">Архив</p><h1>История</h1></header><div class="thinking">Зареждам всички записи от профила ти…</div>`;
      sync.listAll().then((rows) => { if (location.hash.slice(1) === "history") renderHistory(null, rows); }).catch(() => { if (location.hash.slice(1) === "history") renderHistory(null, []); });
      return;
    }
    const local = getHistory();
    const all = remoteAll ? (() => { const m = new Map(remoteAll.map((x) => [x.id, x])); local.forEach((x) => m.set(x.id, x)); const del = new Set(store.get("syncDeleted", [])); return [...m.values()].filter((x) => !del.has(x.id)).sort((a, b) => a.d - b.d); })() : local;
    const f = store.get("hfilter", "all");
    const counts = {}; all.forEach((x) => counts[x.t] = (counts[x.t] || 0) + 1);
    const scored = all.filter((x) => x.max && ["test", "lang", "ai", "mock"].includes(x.t));
    const last10 = scored.slice(-10); const prev10 = scored.slice(-20, -10);
    const avg = (a) => a.length ? a.reduce((s, x) => s + x.score / x.max, 0) / a.length : null;
    const a1 = avg(last10), a0 = avg(prev10);
    const days = new Set(all.map((x) => new Date(x.d).toDateString())).size;
    view.innerHTML = `
      <header class="page-head"><p class="eyebrow">Архив</p><h1>История</h1><p class="lead">Всеки тест, упражнение, отговор и съчинение, което си направила. Отвори запис, за да видиш въпросите, отговорите си и обратната връзка.</p></header>
      <section class="stat-row">
        <div class="stat"><span class="k">Записи</span><span class="v">${all.length}</span></div>
        <div class="stat"><span class="k">Дни с учене</span><span class="v">${days}</span></div>
        <div class="stat"><span class="k">Последни 10 теста</span><span class="v">${a1 != null ? grade(a1).value : "—"}</span></div>
        <div class="stat"><span class="k">Спрямо предните 10</span><span class="v ${a1 != null && a0 != null ? (a1 >= a0 ? "up" : "down") : ""}">${a1 != null && a0 != null ? (a1 >= a0 ? "+" : "−") + Math.abs(Math.round((a1 - a0) * 100)) + "%" : "—"}</span></div>
      </section>
      ${scored.length > 1 ? `<section class="panel"><h2>Успеваемост в тестовете</h2>${trendSVG(scored.slice(-40))}</section>` : ""}
      <div class="chips hfilter">${[["all", "Всички", all.length], ...Object.keys(HTYPES).map((k) => [k, HTYPES[k], counts[k] || 0])].filter(([k, , n]) => k === "all" || n).map(([k, l, n]) => `<label class="chip"><input type="radio" name="hf" value="${k}" ${f === k ? "checked" : ""}><span>${esc(l)} <small class="tnum">${n}</small></span></label>`).join("")}</div>
      <section class="panel" id="hlist"></section>
      <section class="panel backup">
        <h2>Резервно копие</h2>
        <p class="muted">Историята, бележките и статистиката се пазят в този браузър. Запази копие от време на време — така няма да ги загубиш, ако смениш устройството или изчистиш браузъра.</p>
        <div class="row">
          <button class="btn primary" id="bk-save">Запази копие във файл</button>
          <button class="btn" id="bk-copy">Копирай като текст</button>
          <label class="btn ghost file"><input type="file" id="bk-load" accept=".json,application/json,text/plain" hidden>Възстанови от файл</label>
        </div>
        <div id="bk-out"></div>
      </section>`;
    const list = () => {
      const cur = ($("input[name=hf]:checked") || { value: "all" }).value; store.set("hfilter", cur);
      const items = all.filter((x) => cur === "all" || x.t === cur).reverse();
      const byDay = {};
      items.forEach((x) => { const k = new Date(x.d).toLocaleDateString("bg-BG", { weekday: "long", day: "numeric", month: "long" }); (byDay[k] ||= []).push(x); });
      $("#hlist").innerHTML = items.length ? Object.entries(byDay).map(([d, xs]) => `<h3 class="hday">${esc(d)}</h3><ul class="hrows">${xs.map(hRow).join("")}</ul>`).join("") : `<p class="muted">Все още няма записи. Направи тест или упражнение и то ще се появи тук.</p>`;
    };
    $$("input[name=hf]").forEach((r) => r.onchange = list); list();
    const dump = () => JSON.stringify({ app: "matura-bel", v: 1, saved: new Date().toISOString(), history: getHistory(), notes: store.get("notes", []), stats: stats(), writeDraft: store.get("writeDraft", null) });
    $("#bk-save").onclick = async () => {
      const out = $("#bk-out");
      const dl = window.claude && window.claude.use ? await window.claude.use("downloads").catch(() => null) : null;
      if (!dl) {
        try {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([dump()], { type: "application/json" }));
          a.download = `matura-bel-${new Date().toISOString().slice(0, 10)}.json`;
          document.body.appendChild(a); a.click(); a.remove();
          out.innerHTML = `<p class="muted small">Файлът е свален. Пази го — с него можеш да възстановиш всичко.</p>`;
        } catch { out.innerHTML = `<p class="warn">Файлът не можа да се свали. Използвай „Копирай като текст“.</p>`; }
        return;
      }
      try { await dl.save({ filename: `matura-bel-${new Date().toISOString().slice(0, 10)}.json`, data: dump() }); out.innerHTML = `<p class="muted small">Копието е запазено.</p>`; }
      catch (e) { out.innerHTML = `<p class="muted small">Копието не е запазено${e && e.code ? " (" + esc(e.code) + ")" : ""}.</p>`; }
    };
    $("#bk-copy").onclick = async () => {
      const txt = dump();
      try { await navigator.clipboard.writeText(txt); $("#bk-out").innerHTML = `<p class="muted small">Копирано (${Math.round(txt.length / 1024)} KB текст).</p>`; }
      catch { $("#bk-out").innerHTML = `<textarea rows="6" readonly>${esc(txt)}</textarea>`; $("#bk-out textarea").select(); }
    };
    $("#bk-load").onchange = (e) => {
      const file = e.target.files[0]; if (!file) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const d = JSON.parse(rd.result);
          if (d.app !== "matura-bel") throw 0;
          const ids = new Set(getHistory().map((x) => x.id));
          const merged = getHistory().concat((d.history || []).filter((x) => !ids.has(x.id))).sort((a, b) => a.d - b.d).slice(-400);
          store.set("history", merged); sync.pushAll();
          const nIds = new Set(store.get("notes", []).map((n) => n.id));
          store.set("notes", store.get("notes", []).concat((d.notes || []).filter((n) => !nIds.has(n.id))));
          if (d.stats && d.stats.answered > stats().answered) store.set("stats", d.stats);
          $("#bk-out").innerHTML = `<p class="muted small">Възстановено: ${d.history ? d.history.length : 0} записа и ${d.notes ? d.notes.length : 0} бележки.</p>`;
          setTimeout(() => renderHistory(), 900);
        } catch { $("#bk-out").innerHTML = `<p class="warn">Файлът не е копие от това приложение.</p>`; }
      };
      rd.readAsText(file);
    };
  }
  function trendSVG(xs) {
    const W = 640, H = 170, pl = 34, pr = 10, pt = 10, pb = 22;
    const x = (i) => pl + (xs.length === 1 ? 0 : (i / (xs.length - 1)) * (W - pl - pr));
    const y = (p) => pt + (1 - p) * (H - pt - pb);
    const pts = xs.map((e, i) => [x(i), y(e.score / e.max)]);
    const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
    const area = line + ` L${pts[pts.length - 1][0].toFixed(1)} ${y(0)} L${pts[0][0].toFixed(1)} ${y(0)} Z`;
    const last = pts[pts.length - 1];
    return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Процент верни отговори в последните ${xs.length} теста">
      ${[0, 0.5, 1].map((g) => `<line x1="${pl}" x2="${W - pr}" y1="${y(g)}" y2="${y(g)}" class="grid"/><text x="${pl - 6}" y="${y(g) + 4}" class="ax" text-anchor="end">${g * 100}%</text>`).join("")}
      <path d="${area}" class="area"/><path d="${line}" class="ln"/>
      ${pts.map((p, i) => `<g class="pt"><circle cx="${p[0]}" cy="${p[1]}" r="${i === pts.length - 1 ? 4.5 : 3}" class="${i === pts.length - 1 ? "end" : "dot"}"/><circle cx="${p[0]}" cy="${p[1]}" r="11" class="hit"><title>${esc(xs[i].title)} — ${Math.round((xs[i].score / xs[i].max) * 100)}% (${new Date(xs[i].d).toLocaleDateString("bg-BG")})</title></circle></g>`).join("")}
      <text x="${Math.min(last[0], W - pr - 4)}" y="${Math.max(last[1] - 10, 12)}" class="lbl" text-anchor="end">${Math.round((xs[xs.length - 1].score / xs[xs.length - 1].max) * 100)}%</text>
      <text x="${pl}" y="${H - 4}" class="ax">по-стари</text><text x="${W - pr}" y="${H - 4}" class="ax" text-anchor="end">последен</text>
    </svg></div>`;
  }
  function renderHistoryItem(id, fetched) {
    const x = fetched || getHistory().find((e) => e.id === id);
    if (!x) {
      if (sync.user && !fetched) {
        view.innerHTML = `<div class="thinking">Зареждам записа…</div>`;
        sync.get(id).then((d) => d ? renderHistoryItem(id, d) : go("history")).catch(() => go("history"));
        return;
      }
      return renderHistory();
    }
    const when = new Date(x.d).toLocaleString("bg-BG", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
    let body = "";
    if (x.items) body += `<h2>${x.t === "mock" ? "Част 1 · Избираем отговор" : "Въпроси"}</h2>${reviewList(x.items)}`;
    if (x.t === "mock" && x.open) body += `<h2>Свободни отговори</h2><ol class="review">${x.open.map((it) => `<li><p class="q-src">${esc(it.type)}${it.r ? ` · <b class="tnum">${it.r.score}/${it.max}</b>` : ""}</p><p><b>${esc(it.task)}</b></p>${it.ans ? `<p class="yours">${esc(it.ans)}</p>` : `<p class="muted">Без отговор</p>`}${it.r && it.r.comment ? `<p>${esc(it.r.comment)}</p>` : ""}<p class="keyline">${esc((it.r && it.r.correct) || it.key)}</p></li>`).join("")}</ol>${x.topics ? `<p class="muted">Теми за задача 41: ${esc(x.topics.is)} / ${esc(x.topics.essay)}</p>` : ""}`;
    if (x.t === "open") body += `<h2>Въпрос</h2><p class="q-text">${esc(x.q)}</p><h2>Моят отговор</h2><p class="yours big">${esc(x.answer)}</p>${x.fb ? feedbackHTML(x.fb, 3) : x.key ? `<div class="keybox"><h4>Образец</h4><p>${esc(x.key)}</p></div>` : ""}`;
    if (x.t === "edit") body += `<h2>Изречение</h2><blockquote class="edit-src">${esc(x.text)}</blockquote><h2>Моят вариант</h2><p class="yours big">${esc(x.answer)}</p><h2>Правилно</h2><p class="keyline">${esc(x.fixed)}</p><p class="muted">${esc(x.note)}</p>`;
    if (x.t === "essay") body += `<p class="muted">${x.kind === "is" ? "Интерпретативно съчинение" : "Есе"} · тема: ${esc(x.topic)}${x.photos ? ` · ${x.photos} снимки на ръкопис` : ""}</p>${x.fb ? writingFeedback(x.fb) : ""}${x.text && x.text.trim() ? `<section class="panel"><h2>Моят текст</h2><div class="essay-text">${esc(x.text).split(/\n+/).map((p) => `<p>${p}</p>`).join("")}</div><div class="row"><button class="btn" id="h-reuse">Продължи да работиш по този текст</button></div></section>` : ""}`;
    view.innerHTML = `
      <nav class="crumbs"><a href="#history" data-go="history">История</a> / ${esc(HTYPES[x.t] || x.t)}</nav>
      <header class="page-head"><p class="eyebrow">${esc(when)}</p><h1 class="h-title">${esc(x.title)}</h1>
        ${x.max ? `<div class="grade-card"><div class="grade-num tnum">${x.grade && x.t !== "open" && x.t !== "edit" ? esc(x.grade) : `${x.score}<small>/${x.max}</small>`}</div><div><div class="grade-name">${x.max ? `${x.score} от ${x.max}` : ""}</div><div class="muted">${Math.round((x.score / x.max) * 100)}%</div></div></div>` : x.grade ? `<div class="grade-card"><div class="grade-num">${esc(x.grade)}</div><div class="grade-name">оценка от Claude</div></div>` : ""}
      </header>
      <div class="hbody">${body}</div>
      <div class="row">${x.items ? `<button class="btn primary" id="h-redo">Реши отново</button>` : ""}${x.items && x.items.some((i) => i.c !== i.a) ? `<button class="btn" id="h-wrong">Само сгрешените</button>` : ""}<span class="grow"></span><button class="btn ghost" id="h-del">Изтрий записа</button></div>
      <div id="h-quiz"></div>`;
    const toQ = (it, k) => ({ id: `h:${x.id}:${k}`, q: it.q, o: it.o, a: it.a, e: it.e, src: it.src, workId: it.w });
    const redo = (items) => { const h = $("#h-quiz"); h.innerHTML = `<div class="page-narrow" id="hq"></div>`; runQuiz($("#hq"), shuffle(items.map(toQ)), { title: "Повторение: " + x.title, type: x.t === "lang" ? "lang" : "test", onDone: () => go("history") }); h.scrollIntoView({ behavior: "smooth" }); };
    if ($("#h-redo")) $("#h-redo").onclick = () => redo(x.items);
    if ($("#h-wrong")) $("#h-wrong").onclick = () => redo(x.items.filter((i) => i.c !== i.a));
    if ($("#h-reuse")) $("#h-reuse").onclick = () => { store.set("writeDraft", { kind: x.kind, topic: x.topic, text: x.text }); store.set("writeTopic", { kind: x.kind, topic: x.topic }); go("write"); };
    $("#h-del").onclick = (e) => {
      const b = e.currentTarget;
      if (!b.dataset.confirm) { b.dataset.confirm = "1"; b.textContent = "Сигурна ли си? Натисни пак"; b.classList.add("danger"); return; }
      store.set("history", getHistory().filter((e2) => e2.id !== x.id)); sync.remove(x.id); go("history");
    };
  }

  // ---------- NOTES ----------
  function renderNotes() {
    let notes = store.get("notes", []);
    let q = "";
    view.innerHTML = `
      <header class="page-head"><p class="eyebrow">Бележки</p><h1>Моите записки</h1><p class="lead">Важни неща за запомняне. Бележките към произведения се появяват тук автоматично.</p></header>
      <div class="notes-bar row wrap">
        <input type="search" id="n-q" placeholder="Търси в бележките" class="grow">
        <button class="btn primary" id="n-new">Нова бележка</button>
        <button class="btn ghost" id="n-copy">Копирай всички</button>
      </div>
      <p class="muted small">Бележките се пазят в този браузър. Копирай ги от време на време, за да имаш резервно копие.</p>
      <div id="n-edit"></div>
      <div class="notes" id="n-list"></div>`;
    const list = () => {
      const f = notes.filter((n) => !q || (n.title + " " + n.body).toLowerCase().includes(q));
      $("#n-list").innerHTML = f.length ? f.map((n) => `<article class="note" data-id="${n.id}"><h3>${esc(n.title || "Без заглавие")}</h3><p>${esc((n.body || "").slice(0, 280))}${(n.body || "").length > 280 ? "…" : ""}</p><div class="row"><span class="muted small">${new Date(n.updated || Date.now()).toLocaleDateString("bg-BG")}</span>${n.workId ? `<a href="#work-${n.workId}" data-go="work" data-arg="${n.workId}" class="small">към творбата</a>` : ""}<span class="grow"></span><button class="btn ghost sm" data-e="${n.id}">Редактирай</button><button class="btn ghost sm" data-d="${n.id}">Изтрий</button></div></article>`).join("") : `<p class="muted">${q ? "Няма бележки с това търсене." : "Още няма бележки. Започни с „Нова бележка“ или пиши към някое произведение."}</p>`;
      $$("[data-e]").forEach((b) => b.onclick = () => edit(notes.find((n) => n.id === b.dataset.e)));
      $$("[data-d]").forEach((b) => b.onclick = () => {
        if (b.dataset.confirm) { notes = notes.filter((n) => n.id !== b.dataset.d); store.set("notes", notes); list(); }
        else { b.dataset.confirm = "1"; b.textContent = "Сигурна ли си?"; b.classList.add("danger"); }
      });
    };
    const edit = (n) => {
      const isNew = !n; n = n || { id: "n" + Date.now(), title: "", body: "" };
      $("#n-edit").innerHTML = `<div class="panel note-edit"><input id="ne-t" type="text" placeholder="Заглавие" value="${esc(n.title)}"><textarea id="ne-b" rows="8" placeholder="Текст на бележката">${esc(n.body)}</textarea><div class="row"><button class="btn primary" id="ne-s">Запази</button><button class="btn ghost" id="ne-c">Отказ</button></div></div>`;
      $("#ne-t").focus();
      $("#ne-c").onclick = () => $("#n-edit").innerHTML = "";
      $("#ne-s").onclick = () => {
        n.title = $("#ne-t").value.trim(); n.body = $("#ne-b").value; n.updated = Date.now();
        if (isNew) notes.unshift(n);
        store.set("notes", notes); $("#n-edit").innerHTML = ""; list();
      };
    };
    $("#n-q").oninput = (e) => { q = e.target.value.toLowerCase(); list(); };
    $("#n-new").onclick = () => edit(null);
    $("#n-copy").onclick = async (e) => {
      const txt = notes.map((n) => `# ${n.title}\n${n.body}`).join("\n\n");
      try { await navigator.clipboard.writeText(txt); e.target.textContent = "Копирано"; }
      catch { $("#n-edit").innerHTML = `<div class="panel"><p class="muted small">Маркирай текста и го копирай:</p><textarea rows="10" readonly>${esc(txt)}</textarea></div>`; $("#n-edit textarea").select(); }
    };
    list();
  }

  render();
  sync.start();
})();
