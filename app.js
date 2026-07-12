"use strict";
/* ============================================================
   แผนของ Papi 💜 & Mami 💗 — couple edition
   ============================================================ */

const $ = (s, r = document) => r.querySelector(s);
const PREFIX = "w12:";
const store = {
  get(k, d) { try { const v = localStorage.getItem(PREFIX + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(PREFIX + k); } catch {} },
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const NAMES = { you: "Papi", partner: "Mami" };
const EMO = { you: "💜", partner: "💗" };
const other = (p) => (p === "you" ? "partner" : "you");
const nameOf = (p) => NAMES[p];

let PLAN = null;
const now0 = new Date();
const state = {
  tab: "home",
  profile: store.get("profile", "you"),
  mode: store.get("mode", "gym"),
  week: store.get("week", 1),
  session: "A",
  foodIdx: 0,
  cal: { y: now0.getFullYear(), m: now0.getMonth() },
  calSel: null,
};

/* ---------- crypto ---------- */
const b64ToBuf = (b64) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
async function decryptContent(passcode) {
  const res = await fetch("content.enc.json", { cache: "no-store" });
  if (!res.ok) throw new Error("fetch failed");
  const data = await res.json();
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(passcode), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64ToBuf(data.salt), iterations: data.iterations, hash: "SHA-256" },
    baseKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64ToBuf(data.iv) }, key, b64ToBuf(data.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

/* ---------- dates ---------- */
const pad = (n) => String(n).padStart(2, "0");
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => isoOf(new Date());
const TH_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const TH_MON_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
function fmtISO(iso) { const [y, m, d] = iso.split("-").map(Number); return `${d} ${TH_MON[m - 1]}`; }
function relDay(iso) {
  const a = new Date(iso + "T00:00:00"), b = new Date(todayISO() + "T00:00:00");
  const diff = Math.round((b - a) / 86400000);
  if (diff === 0) return "วันนี้"; if (diff === 1) return "เมื่อวาน"; if (diff > 1 && diff < 7) return diff + " วันก่อน";
  return fmtISO(iso);
}
function currentWeekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return t.getUTCFullYear() + "-W" + pad(week);
}
function ensureWeeklyTokens() {
  const wk = currentWeekKey();
  if (store.get("tokWeek") !== wk) { store.set("tokWeek", wk); store.set("tokens", { you: [false, false, false], partner: [false, false, false] }); }
}

/* ---------- data accessors ---------- */
const getLogs = () => store.get("logs", []);
const getStickers = () => store.get("stickers", { you: 0, partner: 0 });
const getQuests = () => store.get("quests", { you: {}, partner: {} });
const getLikes = () => store.get("mealLikes", []);
const workoutCount = (p) => getLogs().filter((l) => l.profile === p).length;
const emergencyCount = (p) => getLogs().filter((l) => l.profile === p && l.session === "E").length;
function didAllABC(p) { const s = new Set(getLogs().filter((l) => l.profile === p).map((l) => l.session)); return ["A", "B", "C"].every((x) => s.has(x)); }
function trackCount() { return store.get("tracklogs", []).length; }

const SES = { A: { e: "💪", l: "Workout A" }, B: { e: "🍑", l: "Workout B" }, C: { e: "🔥", l: "Workout C" }, E: { e: "⏱️", l: "ฉุกเฉิน 12′" } };

/* ---------- praise ---------- */
const PRAISE = [
  (f, t) => `${f} ภูมิใจใน ${t} มากเลยน้า 🥹`,
  (f, t) => `เก่งที่สุดเลย ${t} ของ ${f} 💪`,
  (f, t) => `${t} ทำได้จริง ๆ ด้วย! ${f} รักเลย 💗`,
  (f, t) => `อีกก้าวของเราแล้วน้า สู้ ๆ ${t}! ✨`,
  (f, t) => `${f} เห็นความตั้งใจของ ${t} นะ เก่งมาก 🥰`,
  (f, t) => `วันนี้ ${t} ทำดีมาก ${f} ขอกอดหนึ่งที 🤗`,
];
function praiseFor(achiever) { const f = nameOf(other(achiever)), t = nameOf(achiever); return PRAISE[Math.floor(Math.random() * PRAISE.length)](f, t); }

/* ---------- notifications ---------- */
const notifyOn = () => store.get("notify", false) && "Notification" in window && Notification.permission === "granted";
function fireNotify(title, body) { if (!notifyOn()) return; try { new Notification(title, { body, icon: "icons/icon-192.png", tag: "w12", badge: "icons/icon-192.png" }); } catch {} }
async function requestNotify() {
  if (!("Notification" in window)) { toast("อุปกรณ์นี้ไม่รองรับการแจ้งเตือน"); return; }
  const p = await Notification.requestPermission();
  store.set("notify", p === "granted");
  toast(p === "granted" ? "เปิดแจ้งเตือนแล้ว 🔔" : "ยังไม่ได้อนุญาตแจ้งเตือน");
  if (p === "granted") fireNotify("แผนของเรา 💞", "จะคอยส่งกำลังใจให้ Papi & Mami นะ!");
  render();
}
let reminderTimer;
function scheduleReminder() {
  clearTimeout(reminderTimer);
  const t = store.get("reminderTime", null);
  if (!t || !notifyOn()) return;
  const [h, mi] = t.split(":").map(Number);
  const nd = new Date(); const target = new Date(); target.setHours(h, mi, 0, 0);
  if (target <= nd) return; // only for later today while app is open
  reminderTimer = setTimeout(() => {
    const didToday = getLogs().some((l) => l.iso === todayISO());
    fireNotify("ถึงเวลาขยับตัวแล้ว 💪", didToday ? "เก่งมากวันนี้! อย่าลืมพักผ่อนด้วยน้า" : "Papi & Mami มาขยับตัวกันเถอะ แค่ 12 นาทีก็ได้ ⏱️");
  }, target - nd);
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  let t = $(".toast"); if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg; requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

/* ---------- celebration ---------- */
function shareBrag(text) {
  if (navigator.share) { navigator.share({ text }).catch(() => {}); }
  else if (navigator.clipboard) { navigator.clipboard.writeText(text).then(() => toast("คัดลอกข้อความแล้ว ส่งให้แฟนได้เลย 💌")).catch(() => toast(text)); }
  else toast(text);
}
function celebrate({ icon, title, achiever }) {
  const partnerName = nameOf(other(achiever)), meName = nameOf(achiever);
  const praise = praiseFor(achiever);
  const shareText = `${meName} เพิ่งทำสำเร็จ: ${title} ${icon} — ในแผนสุขภาพของเรา! 💞`;
  fireNotify(`${meName} ทำสำเร็จ! ${icon}`, title);

  const ov = document.createElement("div");
  ov.className = "cele";
  const bits = ["🎉", "✨", "💜", "💗", "⭐", "🌟", "🥳", "💪"];
  const confetti = Array.from({ length: 16 }, (_, i) =>
    `<span class="confo" style="left:${(i * 6.2 + 3).toFixed(1)}%;animation-delay:${(i % 6) * 0.12}s">${bits[i % bits.length]}</span>`).join("");
  ov.innerHTML = `
    <div class="cele-confetti">${confetti}</div>
    <div class="cele-card">
      <div class="cele-icon">${icon}</div>
      <div class="cele-eyebrow">${esc(meName)} เก็บภารกิจได้! 🎊</div>
      <h2 class="cele-title">${esc(title)}</h2>
      <div class="cele-praise"><span class="pf ${other(achiever) === "partner" ? "partner" : ""}">${esc(partnerName)}</span> ${esc(praise)}</div>
      <div class="cele-btns">
        <button class="btn grad block" data-cele="close">เย้! 🎉</button>
        <button class="btn block" data-cele="share">อวดให้ ${esc(partnerName)} 💌</button>
      </div>
    </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("show"));
  ov.addEventListener("click", (e) => {
    const b = e.target.closest("[data-cele]");
    if (e.target === ov || (b && b.dataset.cele === "close")) { ov.classList.remove("show"); setTimeout(() => ov.remove(), 250); }
    else if (b && b.dataset.cele === "share") shareBrag(shareText);
  });
  setTimeout(() => { const c = ov.querySelector(".cele-confetti"); if (c) c.style.opacity = "0"; }, 2600);
}

/* ---------- quests ---------- */
function metricMet(p, m) {
  switch (m) {
    case "firstWorkout": return workoutCount(p) >= 1;
    case "variety": return didAllABC(p);
    case "workout3": return workoutCount(p) >= 3;
    case "emergency1": return emergencyCount(p) >= 1;
    case "sticker5": return (getStickers()[p] || 0) >= 5;
    case "sticker10": return (getStickers()[p] || 0) >= 10;
    case "track1": return trackCount() >= 1;
    case "likes3": return getLikes().length >= 3;
    default: return false;
  }
}
function collectQuest(p, quest, doCelebrate) {
  const q = getQuests(); q[p] = q[p] || {};
  if (q[p][quest.id]) return false;
  q[p][quest.id] = todayISO(); store.set("quests", q);
  if (doCelebrate) celebrate({ icon: quest.icon, title: quest.title, achiever: p });
  return true;
}
function syncAutoQuests(p, doCelebrate) {
  let any = false;
  for (const q of PLAN.quests) {
    if (!q.auto) continue;
    const done = getQuests()[p] && getQuests()[p][q.id];
    if (!done && metricMet(p, q.auto)) { if (collectQuest(p, q, doCelebrate)) any = true; }
  }
  return any;
}

/* ---------- ui helpers ---------- */
const ICONS = {
  home: '<path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  act: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  food: '<path d="M4 3v7a3 3 0 0 0 6 0V3M7 10v11M20 3s-2 1-2 5 2 5 2 5v8"/>',
  goal: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.6" fill="currentColor"/>',
  cal: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};
const svg = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]}</svg>`;
const TABS = [
  { id: "home", label: "บ้านเรา", icon: "home" },
  { id: "workouts", label: "ออกกำลัง", icon: "act" },
  { id: "food", label: "กินอะไรดี", icon: "food" },
  { id: "quests", label: "ภารกิจ", icon: "goal" },
  { id: "calendar", label: "ปฏิทิน", icon: "cal" },
];
function li(items, cls = "") { return `<ul class="clean ${cls}">${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`; }
function ol(items) { return `<ol class="steps">${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>`; }
function weekRowIndex(w) { if (w <= 2) return 0; if (w <= 4) return 1; if (w <= 7) return 2; if (w === 8) return 3; if (w <= 11) return 4; return 5; }
const clampWeek = (w) => Math.max(1, Math.min(12, w));

/* ============================================================ RENDER */
function render() {
  ensureWeeklyTokens();
  syncAutoQuests("you", false); syncAutoQuests("partner", false);
  $("#brand-week").textContent = "สัปดาห์ " + state.week;
  const chip = $("#profile-chip");
  chip.classList.toggle("partner", state.profile === "partner");
  $("#profile-label").textContent = nameOf(state.profile) + " " + EMO[state.profile];

  const view = $("#view");
  const builder = { home: viewHome, workouts: viewWorkouts, food: viewFood, quests: viewQuests, calendar: viewCalendar, plan: viewPlan }[state.tab];
  view.innerHTML = builder();
  view.scrollTop = 0; window.scrollTo(0, 0);
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === state.tab));
  if (state.tab === "food") setupSwipe();
}

/* ---------- HOME ---------- */
function recentEvents(n) {
  const ev = [];
  getLogs().forEach((l) => ev.push({ iso: l.iso, emoji: SES[l.session].e, label: SES[l.session].l, profile: l.profile }));
  const q = getQuests();
  ["you", "partner"].forEach((p) => Object.entries(q[p] || {}).forEach(([id, iso]) => {
    const qq = PLAN.quests.find((x) => x.id === id); if (qq) ev.push({ iso, emoji: qq.icon, label: qq.title, profile: p });
  }));
  ev.sort((a, b) => (a.iso < b.iso ? 1 : a.iso > b.iso ? -1 : 0));
  return ev.slice(0, n);
}
function viewHome() {
  const p = state.profile;
  const wr = PLAN.schedule.weeks[weekRowIndex(state.week)];
  const sug = (() => { const L = getLogs(); for (let i = L.length - 1; i >= 0; i--) { const s = L[i].session; if (s === "A") return "B"; if (s === "B") return "C"; if (s === "C") return "A"; } return "A"; })();
  const st = getStickers(); const q = getQuests();
  const collected = (q.you ? Object.keys(q.you).length : 0) + (q.partner ? Object.keys(q.partner).length : 0);
  const feed = recentEvents(5);

  const qtile = (id) => `<button class="qtile" data-act="quick" data-session="${id}">
      <span class="qk">${SES[id].e}</span><span class="qt">${id === "E" ? "ฉุกเฉิน" : "Workout " + id}</span>
      <span class="qs">${esc(id === "E" ? "12 นาที" : PLAN.workouts.sessions.find((s) => s.id === id).focus)}</span></button>`;

  return `
    <div class="hero">
      <div class="hero-emoji">🌈💞</div>
      <h2>สวัสดี ${esc(nameOf(p))} ${EMO[p]}</h2>
      <p>${esc(PLAN.meta.tagline)}</p>
      <div class="hero-stats">
        <div><b>${st.you + st.partner}</b><span>ดาวรวม ⭐</span></div>
        <div><b>${collected}</b><span>ภารกิจ 🎯</span></div>
        <div><b>${state.week}/12</b><span>สัปดาห์ 🗓️</span></div>
      </div>
    </div>

    <div class="card">
      <div class="row-between">
        <h3 style="margin:0">🗓️ สัปดาห์ที่ ${state.week}</h3>
        <div class="stepper"><button data-act="week-prev">‹</button><button data-act="week-next">›</button></div>
      </div>
      <div class="tbl-wrap mt"><table class="tbl">
        <tr><th>💪 เวท</th><td>${esc(wr.weight)}</td></tr>
        <tr><th>🏃 คาร์ดิโอ</th><td>${esc(wr.cardio)}</td></tr>
        <tr><th>🎯 ความหนัก</th><td>${esc(wr.rpe)}</td></tr>
      </table></div>
    </div>

    <div class="card tint">
      <div class="row-between"><span class="muted">แนะนำวันนี้</span><b style="font-size:19px">${SES[sug].e} Workout ${sug}</b></div>
      <button class="btn grad block mt" data-act="quick" data-session="${sug}">ไปเริ่มเลย →</button>
    </div>

    <h2 class="section-title">⚡ เริ่มเร็ว</h2>
    <div class="qgrid">${qtile("A")}${qtile("B")}${qtile("C")}${qtile("E")}</div>

    <h2 class="section-title">🎊 ช่วงเวลาของเรา</h2>
    <div class="card">
      ${feed.length ? feed.map((e) => `<div class="feed">
          <span class="feed-emo">${e.emoji}</span>
          <span class="feed-txt"><b class="nm ${e.profile === "partner" ? "partner" : ""}">${esc(nameOf(e.profile))}</b> ${esc(e.label)}</span>
          <span class="feed-day">${esc(relDay(e.iso))}</span></div>`).join("")
        : `<p class="muted center">ยังไม่มีบันทึก — มาเริ่มเก็บชัยแรกกันเถอะ! 💪</p>`}
      <button class="btn block mt" data-act="goto" data-tab="quests">ดูภารกิจทั้งหมด 🎯</button>
    </div>`;
}

/* ---------- WORKOUTS ---------- */
function sessionById(id) { return id === "E" ? null : PLAN.workouts.sessions.find((s) => s.id === id); }
function exercisesFor(id) {
  if (id === "E") return PLAN.emergency.exercises.map((e) => ({ emoji: e.emoji, name: e.name, reps: "" }));
  return sessionById(id).exercises.map((e) => ({ emoji: e.emoji, name: state.mode === "gym" ? e.gym : e.home, reps: e.reps }));
}
function getChecks(id) { const all = store.get("checks", {}); const n = exercisesFor(id).length; let a = all[id]; if (!Array.isArray(a) || a.length !== n) a = new Array(n).fill(false); return a; }
function setChecks(id, a) { const all = store.get("checks", {}); all[id] = a; store.set("checks", all); }

function viewWorkouts() {
  const id = state.session, isE = id === "E", s = sessionById(id);
  const exs = exercisesFor(id), checks = getChecks(id);
  const done = checks.filter(Boolean).length, pct = Math.round((done / exs.length) * 100);
  const w = PLAN.workouts;
  const sel = (sid) => `<button class="${state.session === sid ? "on" : ""}" data-act="set-session" data-session="${sid}">${SES[sid].e} ${sid === "E" ? "12′" : sid}</button>`;

  const rows = exs.map((e, i) => `
    <button class="ex-row ${checks[i] ? "done" : ""}" data-act="toggle-ex" data-i="${i}">
      <span class="ex-emo">${e.emoji}</span>
      <span class="ex-body"><span class="ex-name">${esc(e.name)}</span>${e.reps ? `<span class="ex-reps">${esc(e.reps)}</span>` : ""}</span>
      <span class="ex-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${ICONS.check}</svg></span>
    </button>`).join("");

  return `
    <h2 class="section-title">💪 ออกกำลังกาย</h2>
    <div class="seg mb">${sel("A")}${sel("B")}${sel("C")}${sel("E")}</div>
    ${isE ? "" : `<div class="seg mb"><button class="${state.mode === "gym" ? "on" : ""}" data-act="set-mode" data-mode="gym">🏋️ ฟิตเนส</button><button class="${state.mode === "home" ? "on" : ""}" data-act="set-mode" data-mode="home">🏠 ที่บ้าน</button></div>`}

    <div class="wk-hero ${isE ? "emg" : "s" + id}">
      <div class="wk-emoji">${isE ? PLAN.emergency.emoji : s.emoji}</div>
      <div><div class="wk-name">${isE ? esc(PLAN.emergency.title) : esc(s.name) + " · " + esc(s.focus)}</div>
      <div class="wk-blurb">${esc(isE ? PLAN.emergency.blurb : s.blurb)}</div></div>
    </div>

    <div class="card">
      ${isE ? `<p class="faint">${esc(PLAN.emergency.warmup)}</p><p class="faint">${esc(PLAN.emergency.format)}</p>` : ""}
      <div class="progress"><span style="width:${pct}%"></span></div>
      <div class="faint">ทำแล้ว ${done}/${exs.length} ท่า ${done === exs.length ? "— เยี่ยมมาก! 🎉" : ""}</div>
      <div class="ex">${rows}</div>
      <div class="btn-row">
        <button class="btn" data-act="reset-checks">ล้าง</button>
        <button class="btn grad" data-act="log-workout">เก็บชัยวันนี้ ✅</button>
      </div>
      ${isE ? `<div class="callout mt"><span class="ci">💪</span><div>${esc(PLAN.emergency.rule)}</div></div>` : (s.note ? `<p class="faint mt">💡 ${esc(s.note)}</p>` : "")}
    </div>

    <details class="acc"><summary>${esc(w.warmupTitle)} <span class="caret">▾</span></summary><div class="acc-body">${li(w.warmup)}<p class="faint mt">⏳ ${esc(w.rest)}</p></div></details>
    <details class="acc"><summary>${esc(w.progressionTitle)} <span class="caret">▾</span></summary><div class="acc-body">${li(w.progression)}</div></details>
    <details class="acc"><summary>${esc(w.formCuesTitle)} <span class="caret">▾</span></summary><div class="acc-body">${li(w.formCues)}<div class="linkrow mt">${w.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">🔗 ${esc(l.label)}</a>`).join("")}</div></div></details>`;
}

/* ---------- FOOD (swipe deck) ---------- */
function viewFood() {
  const n = PLAN.nutrition;
  const likes = getLikes();
  const menus = n.menus;
  const deckDone = state.foodIdx >= menus.length;

  let deck;
  if (deckDone) {
    deck = `<div class="deck-done card">
      <div style="font-size:40px">🍽️</div>
      <h3 class="center">ปัดครบแล้ว!</h3>
      <p class="muted center">เมนูที่อยากกิน (${likes.length})</p>
      ${likes.length ? `<div class="chips mt">${likes.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div>` : `<p class="faint center">ยังไม่ได้เลือกเลย ลองปัดใหม่นะ</p>`}
      <button class="btn grad block mt" data-act="food-replay">ปัดใหม่อีกรอบ 🔄</button>
    </div>`;
  } else {
    const top = menus[state.foodIdx];
    const next = menus[state.foodIdx + 1];
    const cardHTML = (mm, cls) => `<div class="swipe-card ${cls}"><div class="sc-emoji">${mm.emoji}</div><div class="sc-name">${esc(mm.name)}</div><div class="sc-tip">💡 ${esc(mm.tip)}</div></div>`;
    deck = `<div class="deck">
      ${next ? cardHTML(next, "behind") : ""}
      <div class="swipe-card top" id="swipe-top">
        <div class="swipe-badge like">อยากกิน 💚</div>
        <div class="swipe-badge nope">ผ่าน 🙅</div>
        <div class="sc-emoji">${top.emoji}</div><div class="sc-name">${esc(top.name)}</div><div class="sc-tip">💡 ${esc(top.tip)}</div>
      </div>
    </div>
    <div class="deck-ctrl">
      <button class="round-btn nope" data-act="food-swipe" data-dir="left">✖️</button>
      <span class="deck-count">${state.foodIdx + 1}/${menus.length}</span>
      <button class="round-btn like" data-act="food-swipe" data-dir="right">❤️</button>
    </div>
    <p class="faint center">ปัดขวา = อยากกิน · ปัดซ้าย = ผ่าน${likes.length ? ` · เลือกไว้แล้ว ${likes.length}` : ""}</p>`;
  }

  const targets = n.targets.map((t) => `<tr><td>${esc(t.who)}</td><td>${esc(t.energy)}</td><td>${esc(t.protein)}</td></tr>`).join("");
  return `
    <h2 class="section-title">🍽️ กินอะไรดี</h2>
    <p class="muted" style="margin:0 2px 12px">ปัดการ์ดเลือกเมนูที่อยากกินวันนี้กันเลย!</p>
    ${deck}

    <h2 class="section-title">⚖️ พลังงาน & โปรตีน</h2>
    <div class="card"><p class="muted">${esc(n.intro)}</p>
      <div class="tbl-wrap mt"><table class="tbl"><tr><th>คน</th><th>พลังงาน</th><th>โปรตีน</th></tr>${targets}</table></div>
      <p class="faint mt">${esc(n.proteinNote)}</p></div>

    <h2 class="section-title">🖐️ สัดส่วน 1 มื้อ</h2>
    <div class="grid-2">
      <div class="card"><div class="eyebrow" style="color:var(--you)">${nameOf("you")} 💜</div><div class="spacer"></div>${li(n.portionsYou)}</div>
      <div class="card"><div class="eyebrow" style="color:var(--partner)">${nameOf("partner")} 💗</div><div class="spacer"></div>${li(n.portionsPartner, "partner")}</div>
    </div>
    <div class="card tint"><p class="muted">${esc(n.mealNote)}</p></div>

    <h2 class="section-title">🥤 ของว่างโปรตีน</h2>
    <div class="grid-2">
      <div class="card"><div class="eyebrow" style="color:var(--you)">${nameOf("you")} · เลือก 1/วัน</div><div class="spacer"></div>${li(n.snacksYou.map((x) => x.emoji + " " + x.name))}</div>
      <div class="card"><div class="eyebrow" style="color:var(--partner)">${nameOf("partner")}</div><div class="spacer"></div>${li(n.snacksPartner.map((x) => x.emoji + " " + x.name), "partner")}</div>
    </div>

    <h2 class="section-title">🍰 โทเคนของหวาน</h2>
    <div class="card"><h3>${esc(n.tokens.rule)}</h3>
      ${tokenRow("you")}${tokenRow("partner")}
      <p class="faint mt">1 โทเคน = อย่างใดอย่างหนึ่ง:</p>${li(n.tokens.oneTokenIs)}
      <p class="faint mt">${esc(n.tokens.note)}</p>
      <div class="callout mt"><span class="ci">🧀</span><div>${esc(n.tokens.youNote)}</div></div>
      <div class="callout danger mt"><span class="ci">🍺</span><div>${esc(n.tokens.partnerNote)}</div></div>
    </div>
    <div class="card"><h3>💕 มื้อเดต</h3>${li(n.dateMeals)}</div>

    <h2 class="section-title">🧠 เวลาหิวเพราะเครียด</h2>
    <div class="card">${ol(n.stressSteps)}<p class="faint mt">${esc(n.stressNote)}</p></div>`;
}
function tokenRow(who) {
  const tok = store.get("tokens", { you: [false, false, false], partner: [false, false, false] })[who];
  const cells = tok.map((u, i) => `<button class="token ${u ? "used" : ""}" data-act="token" data-who="${who}" data-i="${i}">${u ? "ใช้แล้ว" : "ว่าง"}</button>`).join("");
  return `<div class="tokrow"><span class="who ${who === "partner" ? "partner" : ""}">${nameOf(who)}</span><div class="tokens">${cells}</div></div>`;
}

/* ---------- QUESTS ---------- */
function viewQuests() {
  const p = state.profile, st = getStickers(), q = getQuests();
  const sc = st[p] || 0, filled = sc % 10 === 0 && sc > 0 ? 10 : sc % 10;
  const cells = Array.from({ length: 10 }, (_, i) => `<div class="sticker ${i < filled ? "on" : ""}">${i < filled ? "★" : ""}</div>`).join("");
  const mine = q[p] || {};

  const cards = PLAN.quests.map((qu) => {
    const doneISO = mine[qu.id];
    const auto = !!qu.auto;
    const cls = doneISO ? "done" : "";
    let right;
    if (doneISO) right = `<span class="q-done">✓ ${esc(fmtISO(doneISO))}</span>`;
    else if (auto) right = `<span class="q-lock">🔒 ทำในแอพ</span>`;
    else right = `<button class="btn grad q-collect" data-act="collect-quest" data-id="${qu.id}">เก็บ 🎯</button>`;
    return `<div class="quest ${cls}"><span class="q-icon">${qu.icon}</span>
      <span class="q-body"><span class="q-title">${esc(qu.title)}</span><span class="q-desc">${esc(qu.desc)}</span></span>
      <span class="q-right">${right}</span></div>`;
  }).join("");

  const doneCount = Object.keys(mine).length;
  return `
    <h2 class="section-title">🎯 ภารกิจของ ${esc(nameOf(p))} ${EMO[p]}</h2>
    <div class="card">
      <div class="row-between"><div class="stat"><b>${sc}</b><span class="muted">ดาวสะสม ⭐</span></div>
        <div class="stat"><b>${doneCount}/${PLAN.quests.length}</b><span class="muted">ภารกิจ</span></div></div>
      <div class="stickers mt">${cells}</div>
      <p class="faint mt center">ครบ 10 ดวง คนที่ครบก่อนได้เลือกกิจกรรมเดต 💞</p>
    </div>
    <p class="muted" style="margin:0 2px 10px">เก็บทีละขั้น ฉลองด้วยกันทุกครั้งที่ทำได้ — สลับ ${EMO.you}Papi/${EMO.partner}Mami ที่มุมขวาบน</p>
    <div class="quests">${cards}</div>`;
}

/* ---------- CALENDAR ---------- */
function buildEventMap() {
  const map = {};
  const push = (iso, e) => { (map[iso] = map[iso] || []).push(e); };
  getLogs().forEach((l) => push(l.iso, { emoji: SES[l.session].e, label: SES[l.session].l, profile: l.profile }));
  store.get("tracklogs", []).forEach((t) => push(t.iso, { emoji: "📊", label: "บันทึกผล", profile: null }));
  const q = getQuests();
  ["you", "partner"].forEach((p) => Object.entries(q[p] || {}).forEach(([id, iso]) => {
    const qq = PLAN.quests.find((x) => x.id === id); if (qq) push(iso, { emoji: qq.icon, label: qq.title, profile: p });
  }));
  return map;
}
function viewCalendar() {
  const { y, m } = state.cal;
  const map = buildEventMap();
  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7; // Mon-first
  const days = new Date(y, m + 1, 0).getDate();
  const tISO = todayISO();
  const wd = ["จ", "อ", "พ", "พฤ", "ศ", "ส", "อา"];

  let cells = "";
  for (let i = 0; i < lead; i++) cells += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= days; d++) {
    const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
    const evs = map[iso] || [];
    const dots = [...new Set(evs.map((e) => e.profile))].map((pr) =>
      `<span class="cdot ${pr === "partner" ? "partner" : pr === "you" ? "" : "neutral"}"></span>`).join("");
    const emo = evs.slice(0, 2).map((e) => e.emoji).join("");
    cells += `<button class="cal-cell ${evs.length ? "has" : ""} ${iso === tISO ? "today" : ""} ${iso === state.calSel ? "sel" : ""}" data-act="cal-day" data-iso="${iso}">
        <span class="cal-num">${d}</span>${emo ? `<span class="cal-emo">${emo}</span>` : ""}<span class="cal-dots">${dots}</span></button>`;
  }

  const sel = state.calSel && map[state.calSel] ? map[state.calSel] : (state.calSel ? [] : null);
  let detail = "";
  if (state.calSel) {
    detail = `<div class="card"><h3>🗓️ ${esc(fmtISO(state.calSel))}</h3>${
      sel && sel.length ? `<div class="loglist mt">${sel.map((e) => `<div class="feed">
          <span class="feed-emo">${e.emoji}</span>
          <span class="feed-txt">${e.profile ? `<b class="nm ${e.profile === "partner" ? "partner" : ""}">${esc(nameOf(e.profile))}</b> ` : ""}${esc(e.label)}</span></div>`).join("")}</div>`
        : `<p class="muted mt">วันนี้ยังไม่มีบันทึก 🌱</p>`}</div>`;
  }

  return `
    <h2 class="section-title">📅 ปฏิทินของเรา</h2>
    <div class="card">
      <div class="cal-head"><button data-act="cal-prev">‹</button><b>${TH_MON_FULL[m]} ${y + 543}</b><button data-act="cal-next">›</button></div>
      <div class="cal-wd">${wd.map((x) => `<span>${x}</span>`).join("")}</div>
      <div class="cal-grid">${cells}</div>
      <div class="cal-legend"><span><i class="cdot"></i> ${nameOf("you")}</span><span><i class="cdot partner"></i> ${nameOf("partner")}</span><span><i class="cdot neutral"></i> บันทึกผล</span></div>
    </div>
    ${detail}

    <h2 class="section-title">📊 บันทึกผลรายสัปดาห์</h2>
    <div class="card">
      <div class="grid-2">
        <div class="field"><label>⚖️ น้ำหนัก (กก.)</label><input id="t-w" type="number" inputmode="decimal" step="0.1" placeholder="74.5"></div>
        <div class="field"><label>📏 รอบเอว (ซม.)</label><input id="t-waist" type="number" inputmode="decimal" step="0.5" placeholder="92"></div>
        <div class="field"><label>👟 ก้าวเฉลี่ย/วัน</label><input id="t-steps" type="number" inputmode="numeric" placeholder="6500"></div>
        <div class="field"><label>😴 นอนเฉลี่ย (ชม.)</label><input id="t-sleep" type="number" inputmode="decimal" step="0.5" placeholder="6.5"></div>
        <div class="field"><label>💓 Mami หน้ามืด (ครั้ง)</label><input id="t-faint" type="number" inputmode="numeric" placeholder="0"></div>
      </div>
      <button class="btn grad block" data-act="save-track">บันทึกวันนี้ ✅</button>
      <p class="faint mt">วัดเช้าวันเดียวกัน · น้ำหนักใช้ค่าเฉลี่ย 2–3 เช้า</p>
    </div>`;
}

/* ---------- PLAN (full reference + settings) ---------- */
function viewPlan() {
  const m = PLAN.medical, g = PLAN.goals, s = PLAN.schedule, c = PLAN.cardio, sl = PLAN.sleep, tr = PLAN.tracking, r = PLAN.rules;
  const weeks = s.weeks.map((w) => `<tr><td>${esc(w.wk)}</td><td>${esc(w.weight)}</td><td>${esc(w.cardio)}</td><td>${esc(w.rpe)}</td></tr>`).join("");
  const sample = s.sampleWeek.map((d) => `<tr><td>${esc(d.day)}</td><td>${esc(d.plan)}</td></tr>`).join("");
  const rt = store.get("reminderTime", "18:30");

  return `
    <div class="row-between" style="margin:2px 2px 12px"><h2 style="margin:0">📖 แผนเต็ม & ตั้งค่า</h2><button class="btn" data-act="goto" data-tab="home">✕ ปิด</button></div>

    <h2 class="section-title">🗓️ ตาราง 12 สัปดาห์</h2>
    <div class="card"><p class="muted">${esc(s.intro)}</p></div>
    <div class="card"><div class="tbl-wrap"><table class="tbl"><tr><th>สัปดาห์</th><th>เวท</th><th>คาร์ดิโอ</th><th>หนัก</th></tr>${weeks}</table></div>
      <div class="callout mt"><span class="ci">🎯</span><div>${esc(s.rpeNote)}</div></div></div>
    <div class="card"><h3>ตัวอย่างสัปดาห์</h3><div class="tbl-wrap"><table class="tbl">${sample}</table></div><p class="faint mt">${esc(s.sampleNote)}</p></div>

    <h2 class="section-title">🏃 คาร์ดิโอ & ก้าว</h2>
    <div class="card"><div class="eyebrow" style="color:var(--you)">${nameOf("you")} 💜</div><p class="muted" style="margin:4px 0 8px">${esc(c.you.intro)}</p>${li(c.you.items)}<div class="callout mt"><span class="ci">👟</span><div>${esc(c.you.steps)}</div></div></div>
    <div class="card"><div class="eyebrow" style="color:var(--partner)">${nameOf("partner")} 💗</div><div class="spacer"></div>${li(c.partner.items, "partner")}</div>

    <h2 class="section-title">⚠️ ก่อนเริ่มฝึกหนัก</h2>
    <div class="card"><p class="muted">${esc(m.intro)}</p></div>
    <details class="acc" open><summary>สำหรับ Papi <span class="caret">▾</span></summary><div class="acc-body">${li(m.you)}</div></details>
    <details class="acc" open><summary>สำหรับ Mami <span class="caret">▾</span></summary><div class="acc-body">${li(m.partner, "partner")}<div class="callout mt"><span class="ci">🩺</span><div><b>ก่อนแพทย์ประเมิน Mami ทำได้เฉพาะ:</b></div></div><div class="spacer"></div>${li(m.partnerAllowed, "partner")}<p class="faint mt">${esc(m.earNote)}</p><div class="linkrow mt">${m.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">🔗 ${esc(l.label)}</a>`).join("")}</div></div></details>

    <h2 class="section-title">🎯 เป้าหมายร่างกาย</h2>
    <div class="card"><div class="eyebrow" style="color:var(--you)">${nameOf("you")} — ${esc(g.you.now)}</div><div class="spacer"></div>${li(g.you.items)}<p class="faint mt">${esc(g.you.note)}</p></div>
    <div class="card"><div class="eyebrow" style="color:var(--partner)">${nameOf("partner")} — ${esc(g.partner.now)}</div><div class="spacer"></div>${li(g.partner.items, "partner")}<p class="faint mt">${esc(g.partner.note)}</p></div>

    <h2 class="section-title">😴 การนอน</h2>
    <div class="card"><p class="muted">${esc(sl.intro)}</p></div>
    <details class="acc"><summary>สัปดาห์ 1–2 <span class="caret">▾</span></summary><div class="acc-body">${li(sl.week12)}</div></details>
    <details class="acc"><summary>สัปดาห์ 3 เป็นต้นไป <span class="caret">▾</span></summary><div class="acc-body">${li(sl.week3)}</div></details>

    <h2 class="section-title">📏 วิธีติดตามผล</h2>
    <details class="acc"><summary>ทุกสัปดาห์ <span class="caret">▾</span></summary><div class="acc-body">${li(tr.weekly)}<p class="faint mt">${esc(tr.weeklyNote)}</p></div></details>
    <details class="acc"><summary>ทุก 2 สัปดาห์ <span class="caret">▾</span></summary><div class="acc-body">${li(tr.biweekly)}</div></details>
    <details class="acc"><summary>ทุก 4 สัปดาห์ <span class="caret">▾</span></summary><div class="acc-body">${li(tr.monthly)}<p class="faint mt">${esc(tr.monthlyNote)}</p></div></details>
    <details class="acc"><summary>วิธีปรับอาหาร <span class="caret">▾</span></summary><div class="acc-body"><div class="eyebrow" style="color:var(--you)">${nameOf("you")}</div><div class="spacer"></div>${li(tr.adjustYou)}<div class="spacer"></div><div class="eyebrow" style="color:var(--partner)">${nameOf("partner")}</div><div class="spacer"></div>${li(tr.adjustPartner, "partner")}</div></details>

    <h2 class="section-title">💞 กติกาคู่รัก</h2>
    <div class="card">${li(r.couple)}</div>
    <details class="acc"><summary>รางวัลที่ไม่ใช่อาหาร <span class="caret">▾</span></summary><div class="acc-body">${li(r.rewards)}</div></details>
    <details class="acc" open><summary>7 วันแรกเริ่มเลย <span class="caret">▾</span></summary><div class="acc-body">${ol(r.first7days)}<div class="callout mt"><span class="ci">📅</span><div>${esc(r.closing)}</div></div></div></details>

    <h2 class="section-title">⚙️ ตั้งค่า</h2>
    <div class="card">
      <p class="muted" style="margin-bottom:6px">ตอนนี้เป็นใคร</p>
      <div class="seg"><button class="${state.profile === "you" ? "on" : ""}" data-act="set-profile" data-profile="you">💜 Papi</button><button class="${state.profile === "partner" ? "on" : ""}" data-act="set-profile" data-profile="partner">💗 Mami</button></div>

      <hr class="soft">
      <div class="row-between"><span>🔔 การแจ้งเตือนในเครื่อง</span>
        <button class="btn ${notifyOn() ? "grad" : ""}" data-act="toggle-notify">${notifyOn() ? "เปิดอยู่ ✓" : "เปิดใช้งาน"}</button></div>
      <div class="field mt"><label>⏰ เวลาเตือนออกกำลังกาย (ขณะเปิดแอพ)</label><input id="rt" type="time" value="${esc(rt)}" data-act="set-reminder"></div>
      <p class="faint">แจ้งเตือนแสดงบนเครื่องนี้เอง · อยากบอกอีกฝ่ายให้กดปุ่ม “อวด…” ตอนฉลอง จะส่งผ่านแชทที่ใช้อยู่</p>

      <hr class="soft">
      <div class="btn-row"><button class="btn" data-act="lock-now">🔒 ล็อกตอนนี้</button><button class="btn" data-act="forget-pass">ลืมรหัสในเครื่อง</button></div>
      <button class="btn block mt" data-act="reset-all" style="color:var(--danger)">ล้างข้อมูลทั้งหมดในเครื่อง</button>
      <p class="faint mt center">${esc(PLAN.meta.disclaimer)}</p>
    </div>`;
}

/* ============================================================ SWIPE */
function decideFood(dir) {
  const menus = PLAN.nutrition.menus;
  if (state.foodIdx >= menus.length) return;
  if (dir === "right") {
    const name = menus[state.foodIdx].name;
    const likes = getLikes(); if (!likes.includes(name)) { likes.push(name); store.set("mealLikes", likes); }
  }
  state.foodIdx++;
  if (getLikes().length >= 3) syncAutoQuests(state.profile, true);
  render();
}
function setupSwipe() {
  const card = $("#swipe-top"); if (!card) return;
  let sx = 0, sy = 0, dx = 0, dy = 0, active = false;
  const like = card.querySelector(".swipe-badge.like"), nope = card.querySelector(".swipe-badge.nope");
  const down = (x, y) => { active = true; sx = x; sy = y; card.style.transition = "none"; };
  const move = (x, y) => {
    if (!active) return; dx = x - sx; dy = y - sy;
    card.style.transform = `translate(${dx}px,${dy}px) rotate(${dx / 18}deg)`;
    if (like) like.style.opacity = Math.max(0, Math.min(1, dx / 90));
    if (nope) nope.style.opacity = Math.max(0, Math.min(1, -dx / 90));
  };
  const up = () => {
    if (!active) return; active = false; card.style.transition = "transform .28s ease, opacity .28s ease";
    if (Math.abs(dx) > 90) {
      const dir = dx > 0 ? "right" : "left";
      card.style.transform = `translate(${dx > 0 ? 500 : -500}px,${dy}px) rotate(${dx / 12}deg)`; card.style.opacity = "0";
      setTimeout(() => decideFood(dir), 180);
    } else { card.style.transform = ""; if (like) like.style.opacity = 0; if (nope) nope.style.opacity = 0; }
    dx = dy = 0;
  };
  card.addEventListener("pointerdown", (e) => { card.setPointerCapture(e.pointerId); down(e.clientX, e.clientY); });
  card.addEventListener("pointermove", (e) => move(e.clientX, e.clientY));
  card.addEventListener("pointerup", up);
  card.addEventListener("pointercancel", up);
}

/* ============================================================ EVENTS */
document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act]"); if (!t) return;
  const a = t.dataset.act;
  switch (a) {
    case "quick": state.session = t.dataset.session; state.tab = "workouts"; render(); break;
    case "set-session": state.session = t.dataset.session; render(); break;
    case "set-mode": state.mode = t.dataset.mode; store.set("mode", state.mode); render(); break;
    case "toggle-ex": { const i = +t.dataset.i; const arr = getChecks(state.session); arr[i] = !arr[i]; setChecks(state.session, arr); render(); break; }
    case "reset-checks": setChecks(state.session, exercisesFor(state.session).map(() => false)); render(); break;
    case "log-workout": logWorkout(); break;
    case "token": toggleToken(t.dataset.who, +t.dataset.i); break;
    case "week-prev": state.week = clampWeek(state.week - 1); store.set("week", state.week); render(); break;
    case "week-next": state.week = clampWeek(state.week + 1); store.set("week", state.week); render(); break;
    case "goto": state.tab = t.dataset.tab; render(); break;
    case "set-profile": state.profile = t.dataset.profile; store.set("profile", state.profile); render(); break;
    case "save-track": saveTrack(); break;
    case "collect-quest": { const qu = PLAN.quests.find((x) => x.id === t.dataset.id); if (qu) collectQuest(state.profile, qu, true), render(); break; }
    case "food-swipe": decideFood(t.dataset.dir); break;
    case "food-replay": state.foodIdx = 0; render(); break;
    case "cal-prev": state.cal.m--; if (state.cal.m < 0) { state.cal.m = 11; state.cal.y--; } render(); break;
    case "cal-next": state.cal.m++; if (state.cal.m > 11) { state.cal.m = 0; state.cal.y++; } render(); break;
    case "cal-day": state.calSel = t.dataset.iso; render(); break;
    case "toggle-notify": requestNotify(); break;
    case "lock-now": lockNow(); break;
    case "forget-pass": store.del("pass"); toast("ลบรหัสในเครื่องแล้ว"); break;
    case "reset-all": resetAll(); break;
  }
});
document.addEventListener("change", (e) => {
  const t = e.target.closest("[data-act]"); if (!t) return;
  if (t.dataset.act === "set-reminder") { store.set("reminderTime", t.value); scheduleReminder(); toast("ตั้งเวลาเตือน " + t.value); }
});

function logWorkout() {
  const id = state.session, p = state.profile;
  const logs = getLogs(); logs.push({ iso: todayISO(), session: id, profile: p, week: currentWeekKey() }); store.set("logs", logs);
  const st = getStickers(); st[p] = (st[p] || 0) + 1; store.set("stickers", st);
  setChecks(id, exercisesFor(id).map(() => false));
  toast("🎉 " + nameOf(p) + " ทำ " + SES[id].l + " สำเร็จ +1 ดาว");
  syncAutoQuests(p, true);
  render();
}
function toggleToken(who, i) { const tok = store.get("tokens", { you: [false, false, false], partner: [false, false, false] }); tok[who][i] = !tok[who][i]; store.set("tokens", tok); render(); }
function saveTrack() {
  const val = (id) => { const el = $("#" + id); return el && el.value.trim() ? el.value.trim() : ""; };
  const entry = { iso: todayISO(), w: val("t-w"), waist: val("t-waist"), steps: val("t-steps"), sleep: val("t-sleep"), faint: val("t-faint") };
  if (!entry.w && !entry.waist && !entry.steps && !entry.sleep && !entry.faint) { toast("กรอกอย่างน้อย 1 ช่อง"); return; }
  const logs = store.get("tracklogs", []); logs.push(entry); store.set("tracklogs", logs);
  toast("บันทึกแล้ว ✓"); syncAutoQuests(state.profile, true); render();
}
function lockNow() { store.del("pass"); PLAN = null; $("#app").hidden = true; $("#lock").style.display = "grid"; $("#pass").value = ""; $("#lock-error").hidden = true; }
function resetAll() {
  if (!confirm("ล้างข้อมูลความคืบหน้าทั้งหมดในเครื่องนี้?")) return;
  ["profile", "mode", "week", "checks", "logs", "stickers", "tokens", "tokWeek", "tracklogs", "quests", "mealLikes"].forEach(store.del);
  state.profile = "you"; state.mode = "gym"; state.week = 1; state.foodIdx = 0;
  toast("ล้างข้อมูลแล้ว"); render();
}

/* ============================================================ BOOT */
function buildTabs() {
  $("#tabbar").innerHTML = TABS.map((t) => `<button class="tab" data-tab="${t.id}">${svg(t.icon)}<span>${t.label}</span></button>`).join("");
  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => { state.tab = b.dataset.tab; render(); }));
}
function startApp() {
  $("#lock").style.display = "none"; $("#app").hidden = false;
  state.calSel = todayISO();
  buildTabs(); render(); scheduleReminder();
}
async function tryUnlock(passcode, remember) { PLAN = await decryptContent(passcode); if (remember) store.set("pass", passcode); startApp(); }

$("#menu-btn").addEventListener("click", () => { state.tab = "plan"; render(); });
$("#profile-chip").addEventListener("click", () => { state.profile = other(state.profile); store.set("profile", state.profile); render(); });

$("#lock-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#unlock-btn"), err = $("#lock-error"), pass = $("#pass").value; if (!pass) return;
  btn.disabled = true; btn.textContent = "กำลังเปิด…"; err.hidden = true;
  try { await tryUnlock(pass, $("#remember").checked); }
  catch { err.hidden = false; $("#pass").value = ""; $("#pass").focus(); }
  finally { btn.disabled = false; btn.textContent = "เปิดแผน"; }
});

(async function auto() { const saved = store.get("pass", null); if (saved) { try { await tryUnlock(saved, false); } catch { store.del("pass"); } } })();

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
