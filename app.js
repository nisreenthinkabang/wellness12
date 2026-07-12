"use strict";
/* ============================================================
   แผนสุขภาพของเราสองคน — app logic
   - decrypts content.enc.json with a passcode (PBKDF2 + AES-GCM)
   - renders a tabbed PWA, all progress stored locally on device
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

let PLAN = null;
const state = {
  tab: "home",
  profile: store.get("profile", "you"),   // "you" | "partner"
  mode: store.get("mode", "gym"),          // "gym" | "home"
  week: store.get("week", 1),              // 1..12
  session: "A",
};

/* ---------- crypto ---------- */
const b64ToBuf = (b64) => {
  const bin = atob(b64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
};
async function decryptContent(passcode) {
  const res = await fetch("content.enc.json", { cache: "no-store" });
  if (!res.ok) throw new Error("fetch failed");
  const data = await res.json();
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(passcode), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64ToBuf(data.salt), iterations: data.iterations, hash: "SHA-256" },
    baseKey, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64ToBuf(data.iv) }, key, b64ToBuf(data.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

/* ---------- weekly token reset key ---------- */
function currentWeekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (t.getUTCDay() + 6) % 7;            // Mon=0
  t.setUTCDate(t.getUTCDate() - day + 3);          // nearest Thursday
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return t.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
}
function ensureWeeklyTokens() {
  const wk = currentWeekKey();
  if (store.get("tokWeek") !== wk) {
    store.set("tokWeek", wk);
    store.set("tokens", { you: [false, false, false], partner: [false, false, false] });
  }
}

/* ---------- helpers ---------- */
const todayStr = () => {
  const d = new Date();
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
};
const profileName = (p) => (p === "you" ? "ฉัน" : "แฟน");
function weekRowIndex(w) {
  if (w <= 2) return 0; if (w <= 4) return 1; if (w <= 7) return 2;
  if (w === 8) return 3; if (w <= 11) return 4; return 5;
}
const ICONS = {
  home: '<path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  act: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  cal: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  food: '<path d="M4 3v7a3 3 0 0 0 6 0V3M7 10v11M20 3s-2 1-2 5 2 5 2 5v8"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
const TABS = [
  { id: "home", label: "วันนี้", icon: "home" },
  { id: "workouts", label: "เวท", icon: "act" },
  { id: "schedule", label: "ตาราง", icon: "cal" },
  { id: "nutrition", label: "อาหาร", icon: "food" },
  { id: "more", label: "อื่นๆ", icon: "more" },
];

let toastTimer;
function toast(msg) {
  let t = $(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg; requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---------- workout data + progress ---------- */
function sessionById(id) {
  if (id === "E") return null;
  return PLAN.workouts.sessions.find((s) => s.id === id);
}
function exercisesFor(id) {
  if (id === "E") return PLAN.emergency.exercises.map((n) => ({ name: n, reps: "" }));
  const s = sessionById(id);
  return s.exercises.map((e) => ({ name: state.mode === "gym" ? e.gym : e.home, reps: e.reps }));
}
function getChecks(id) {
  const all = store.get("checks", {});
  const n = exercisesFor(id).length;
  let arr = all[id];
  if (!Array.isArray(arr) || arr.length !== n) arr = new Array(n).fill(false);
  return arr;
}
function setChecks(id, arr) { const all = store.get("checks", {}); all[id] = arr; store.set("checks", all); }
function suggestNext() {
  const logs = store.get("logs", []);
  for (let i = logs.length - 1; i >= 0; i--) {
    const s = logs[i].session;
    if (s === "A") return "B"; if (s === "B") return "C"; if (s === "C") return "A";
  }
  return "A";
}

/* ============================================================
   RENDERERS
   ============================================================ */
function render() {
  ensureWeeklyTokens();
  $("#brand-week").textContent = "สัปดาห์ " + state.week;
  const chip = $("#profile-chip");
  chip.classList.toggle("partner", state.profile === "partner");
  $("#profile-label").textContent = profileName(state.profile);

  const view = $("#view");
  view.innerHTML = ({
    home: viewHome, workouts: viewWorkouts, schedule: viewSchedule,
    nutrition: viewNutrition, more: viewMore,
  })[state.tab]();
  view.scrollTop = 0;
  window.scrollTo(0, 0);

  document.querySelectorAll(".tab").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === state.tab));
}

function li(items, cls = "") {
  return `<ul class="clean ${cls}">${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
}
function ol(items) { return `<ol class="steps">${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ol>`; }

/* ---------- HOME ---------- */
function viewHome() {
  const wr = PLAN.schedule.weeks[weekRowIndex(state.week)];
  const sug = suggestNext();
  const logs = store.get("logs", []);
  const wk = currentWeekKey();
  const thisWeekCount = logs.filter((l) => l.week === wk).length;
  const stickers = store.get("stickers", { you: 0, partner: 0 });
  const sc = stickers[state.profile] || 0;
  const filled = sc % 10 === 0 && sc > 0 ? 10 : sc % 10;

  const stickerCells = Array.from({ length: 10 }, (_, i) =>
    `<div class="sticker ${i < filled ? "on" : ""}">${i < filled ? "★" : ""}</div>`).join("");

  const qtile = (id, title, sub) =>
    `<button class="qtile" data-act="quick" data-session="${id}">
       <span class="qk">${id === "E" ? "12′" : id}</span>
       <span class="qt">${esc(title)}</span><span class="qs">${esc(sub)}</span></button>`;

  return `
    <div class="hero">
      <h2>${esc(PLAN.meta.title)}</h2>
      <p>${esc(PLAN.meta.tagline)}</p>
    </div>

    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <h3 style="margin:0">สัปดาห์ที่ ${state.week} / 12</h3>
        <div class="seg" style="width:auto">
          <button data-act="week-prev" aria-label="สัปดาห์ก่อน" style="flex:none;padding:6px 12px">‹</button>
          <button data-act="week-next" aria-label="สัปดาห์ถัดไป" style="flex:none;padding:6px 12px">›</button>
        </div>
      </div>
      <div class="tbl-wrap mt"><table class="tbl">
        <tr><th>เวท</th><td>${esc(wr.weight)}</td></tr>
        <tr><th>คาร์ดิโอ</th><td>${esc(wr.cardio)}</td></tr>
        <tr><th>ความหนัก</th><td>${esc(wr.rpe)}</td></tr>
      </table></div>
    </div>

    <h2 class="section-title">เริ่มเลย</h2>
    <div class="card tint" style="margin-bottom:12px">
      <div class="stat"><span class="muted">แนะนำวันนี้&nbsp;</span><b style="font-size:20px">Workout ${sug}</b></div>
      <div class="faint">ทำตามลำดับ A → B → C ในรอบ 7 วัน</div>
    </div>
    <div class="qgrid">
      ${qtile("A", "หลัง + ขา", "Workout A")}
      ${qtile("B", "สะโพก ไหล่", "Workout B")}
      ${qtile("C", "เต็มตัว", "Workout C")}
      ${qtile("E", "ฉุกเฉิน", "12 นาที")}
    </div>

    <h2 class="section-title">สติกเกอร์ของ ${profileName(state.profile)}</h2>
    <div class="card">
      <div class="stat"><b>${sc}</b><span class="muted">ดวงสะสม · สัปดาห์นี้ออก ${thisWeekCount} ครั้ง</span></div>
      <div class="stickers mt">${stickerCells}</div>
      <p class="faint mt">ครบ 10 ดวง คนที่ครบก่อนได้เลือกกิจกรรมเดต 💞</p>
    </div>

    <h2 class="section-title">โทเคนของหวาน (สัปดาห์นี้)</h2>
    <div class="card">
      ${tokenRow("you")}${tokenRow("partner")}
      <p class="faint mt">คนละ 3 โทเคน/สัปดาห์ · แตะเพื่อใช้ · รีเซ็ตอัตโนมัติทุกสัปดาห์</p>
    </div>`;
}
function tokenRow(who) {
  const tok = store.get("tokens", { you: [false, false, false], partner: [false, false, false] })[who];
  const cells = tok.map((used, i) =>
    `<button class="token ${used ? "used" : ""}" data-act="token" data-who="${who}" data-i="${i}">${used ? "ใช้แล้ว" : "ว่าง"}</button>`).join("");
  return `<div class="tokrow"><span class="who">${profileName(who)}</span><div class="tokens">${cells}</div></div>`;
}

/* ---------- WORKOUTS ---------- */
function viewWorkouts() {
  const id = state.session;
  const isE = id === "E";
  const s = sessionById(id);
  const exs = exercisesFor(id);
  const checks = getChecks(id);
  const doneCount = checks.filter(Boolean).length;
  const pct = Math.round((doneCount / exs.length) * 100);

  const selBtn = (sid, label) =>
    `<button class="${state.session === sid ? "on" : ""}" data-act="set-session" data-session="${sid}">${label}</button>`;

  const exRows = exs.map((e, i) => `
    <button class="ex-row ${checks[i] ? "done" : ""}" data-act="toggle-ex" data-i="${i}">
      <span class="ex-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${ICONS.check}</svg></span>
      <span class="ex-body"><span class="ex-name">${esc(e.name)}</span>${e.reps ? `<span class="ex-reps"> · ${esc(e.reps)}</span>` : ""}</span>
    </button>`).join("");

  const w = PLAN.workouts;
  return `
    <h2 class="section-title">โปรแกรมเวท</h2>

    <div class="seg" style="margin-bottom:12px">
      ${selBtn("A", "A")}${selBtn("B", "B")}${selBtn("C", "C")}${selBtn("E", "ฉุกเฉิน")}
    </div>

    ${isE ? "" : `<div class="seg" style="margin-bottom:14px">
      <button class="${state.mode === "gym" ? "on" : ""}" data-act="set-mode" data-mode="gym">🏋️ ฟิตเนส</button>
      <button class="${state.mode === "home" ? "on" : ""}" data-act="set-mode" data-mode="home">🏠 ที่บ้าน</button>
    </div>`}

    <div class="card">
      ${isE
        ? `<h3>${esc(PLAN.emergency.title)}</h3><p class="muted">${esc(PLAN.emergency.intro)}</p>
           <p class="faint mt">${esc(PLAN.emergency.warmup)}</p>
           <p class="faint">${esc(PLAN.emergency.format)}</p>`
        : `<div class="eyebrow">Workout ${id}</div><h3 style="margin-top:2px">${esc(s.focus)}</h3>`}
      <div class="progress"><span style="width:${pct}%"></span></div>
      <div class="faint">${doneCount}/${exs.length} ท่า</div>
      <div class="ex">${exRows}</div>
      <div class="btn-row">
        <button class="btn" data-act="reset-checks">ล้างเครื่องหมาย</button>
        <button class="btn grad" data-act="log-workout">✓ บันทึกว่าเสร็จ</button>
      </div>
      ${isE ? `<div class="callout mt"><span class="ci">💪</span><div>${esc(PLAN.emergency.rule)}</div></div>`
            : (s.note ? `<p class="faint mt">${esc(s.note)}</p>` : "")}
    </div>

    <details class="acc"><summary>วอร์มอัป 6–8 นาที <span class="caret">▾</span></summary>
      <div class="acc-body">${li(w.warmup)}<p class="faint mt">${esc(w.rest)}</p></div></details>

    <details class="acc"><summary>${esc(w.progressionTitle)} <span class="caret">▾</span></summary>
      <div class="acc-body">${li(w.progression)}</div></details>

    <details class="acc"><summary>${esc(w.formCuesTitle)} <span class="caret">▾</span></summary>
      <div class="acc-body">${li(w.formCues)}
        <div class="linkrow mt">${w.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join("")}</div>
      </div></details>`;
}

/* ---------- SCHEDULE ---------- */
function viewSchedule() {
  const s = PLAN.schedule, c = PLAN.cardio;
  const rows = s.weeks.map((w) => `<tr><td>${esc(w.wk)}</td><td>${esc(w.weight)}</td><td>${esc(w.cardio)}</td><td>${esc(w.rpe)}</td></tr>`).join("");
  const sample = s.sampleWeek.map((d) => `<tr><td>${esc(d.day)}</td><td>${esc(d.plan)}</td></tr>`).join("");
  return `
    <h2 class="section-title">ตาราง 12 สัปดาห์</h2>
    <div class="card"><p class="muted">${esc(s.intro)}</p></div>
    <div class="card"><div class="tbl-wrap"><table class="tbl">
      <tr><th>สัปดาห์</th><th>เวท</th><th>คาร์ดิโอ</th><th>ความหนัก</th></tr>${rows}
    </table></div>
    <div class="callout mt"><span class="ci">🎯</span><div>${esc(s.rpeNote)}</div></div></div>

    <h2 class="section-title">ตัวอย่างสัปดาห์</h2>
    <div class="card"><div class="tbl-wrap"><table class="tbl">${sample}</table></div>
      <p class="faint mt">${esc(s.sampleNote)}</p></div>

    <h2 class="section-title">คาร์ดิโอและจำนวนก้าว</h2>
    <div class="card"><div class="eyebrow" style="color:var(--you)">ฉัน</div>
      <p class="muted" style="margin:4px 0 8px">${esc(c.you.intro)}</p>
      ${li(c.you.items)}
      <div class="callout mt"><span class="ci">👟</span><div>${esc(c.you.steps)}</div></div>
    </div>
    <div class="card"><div class="eyebrow" style="color:var(--partner)">แฟน</div>
      <div class="spacer"></div>${li(c.partner.items, "partner")}</div>`;
}

/* ---------- NUTRITION ---------- */
function viewNutrition() {
  const n = PLAN.nutrition;
  const targets = n.targets.map((t) => `<tr><td>${esc(t.who)}</td><td>${esc(t.energy)}</td><td>${esc(t.protein)}</td></tr>`).join("");
  const menus = `<div class="chips">${n.menus.map((m) => `<span class="chip">${esc(m)}</span>`).join("")}</div>`;
  return `
    <h2 class="section-title">พลังงานและโปรตีน</h2>
    <div class="card"><p class="muted">${esc(n.intro)}</p>
      <div class="tbl-wrap mt"><table class="tbl">
        <tr><th>คน</th><th>พลังงาน</th><th>โปรตีน</th></tr>${targets}
      </table></div>
      <p class="faint mt">${esc(n.proteinNote)}</p>
    </div>

    <h2 class="section-title">สัดส่วนหนึ่งมื้อ</h2>
    <div class="grid-2">
      <div class="card"><div class="eyebrow" style="color:var(--you)">ฉัน</div><div class="spacer"></div>${li(n.portionsYou)}</div>
      <div class="card"><div class="eyebrow" style="color:var(--partner)">แฟน</div><div class="spacer"></div>${li(n.portionsPartner, "partner")}</div>
    </div>
    <div class="card tint"><p class="muted">${esc(n.mealNote)}</p></div>

    <h2 class="section-title">เมนูหลัก (สลับเลือก)</h2>
    <div class="card">${menus}</div>

    <h2 class="section-title">ของว่างโปรตีน</h2>
    <div class="grid-2">
      <div class="card"><div class="eyebrow" style="color:var(--you)">ฉัน · เลือก 1 ชุด/วัน</div><div class="spacer"></div>${li(n.snacksYou)}</div>
      <div class="card"><div class="eyebrow" style="color:var(--partner)">แฟน</div><div class="spacer"></div>${li(n.snacksPartner, "partner")}</div>
    </div>

    <h2 class="section-title">โทเคนของหวาน · มื้อเดต</h2>
    <div class="card"><h3>${esc(n.tokens.rule)}</h3>
      <p class="muted" style="margin-bottom:6px">1 โทเคน = อย่างใดอย่างหนึ่ง:</p>
      ${li(n.tokens.oneTokenIs)}
      <p class="faint mt">${esc(n.tokens.note)}</p>
      <div class="callout mt"><span class="ci">🧀</span><div>${esc(n.tokens.youNote)}</div></div>
      <div class="callout danger mt"><span class="ci">🍺</span><div>${esc(n.tokens.partnerNote)}</div></div>
      <button class="btn block mt" data-act="goto" data-tab="home">ไปกดใช้โทเคน →</button>
    </div>
    <div class="card"><h3>มื้อเดต</h3>${li(n.dateMeals)}</div>

    <h2 class="section-title">เวลาหิวเพราะเครียด</h2>
    <div class="card">${ol(n.stressSteps)}<p class="faint mt">${esc(n.stressNote)}</p></div>`;
}

/* ---------- MORE ---------- */
function viewMore() {
  const m = PLAN.medical, g = PLAN.goals, sl = PLAN.sleep, tr = PLAN.tracking, r = PLAN.rules;
  const tlogs = store.get("tracklogs", []);
  const recent = tlogs.slice(-8).reverse().map((e) => `
    <div class="logitem"><span class="d">${esc(e.date)}</span>
      <span>${[e.w && "นน. " + esc(e.w), e.waist && "เอว " + esc(e.waist), e.steps && "ก้าว " + esc(e.steps), e.sleep && "นอน " + esc(e.sleep) + "ชม.", e.faint && "หน้ามืด " + esc(e.faint)].filter(Boolean).join(" · ") || "—"}</span>
    </div>`).join("");

  return `
    <h2 class="section-title">⚠️ ก่อนเริ่มฝึกหนัก</h2>
    <div class="card"><p class="muted">${esc(m.intro)}</p></div>
    <details class="acc" open><summary>สำหรับฉัน <span class="caret">▾</span></summary><div class="acc-body">${li(m.you)}</div></details>
    <details class="acc" open><summary>สำหรับแฟน <span class="caret">▾</span></summary>
      <div class="acc-body">${li(m.partner, "partner")}
        <div class="callout mt"><span class="ci">🩺</span><div><b>ก่อนแพทย์ประเมิน ทำได้เฉพาะ:</b></div></div>
        <div class="spacer"></div>${li(m.partnerAllowed, "partner")}
        <p class="faint mt">${esc(m.earNote)}</p>
        <div class="linkrow mt">${m.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join("")}</div>
      </div></details>

    <h2 class="section-title">เป้าหมาย</h2>
    <div class="card"><div class="eyebrow" style="color:var(--you)">ฉัน — ${esc(g.you.now)}</div><div class="spacer"></div>
      ${li(g.you.items)}<p class="faint mt">${esc(g.you.note)}</p></div>
    <div class="card"><div class="eyebrow" style="color:var(--partner)">แฟน — ${esc(g.partner.now)}</div><div class="spacer"></div>
      ${li(g.partner.items, "partner")}<p class="faint mt">${esc(g.partner.note)}</p></div>

    <h2 class="section-title">การนอนและงาน</h2>
    <div class="card"><p class="muted">${esc(sl.intro)}</p></div>
    <details class="acc"><summary>สัปดาห์ 1–2 <span class="caret">▾</span></summary><div class="acc-body">${li(sl.week12)}</div></details>
    <details class="acc"><summary>สัปดาห์ 3 เป็นต้นไป <span class="caret">▾</span></summary><div class="acc-body">${li(sl.week3)}</div></details>

    <h2 class="section-title">บันทึกผลรายสัปดาห์</h2>
    <div class="card">
      <div class="grid-2">
        <div class="field"><label>น้ำหนัก (กก.)</label><input id="t-w" type="number" inputmode="decimal" step="0.1" placeholder="เช่น 74.5"></div>
        <div class="field"><label>รอบเอว (ซม.)</label><input id="t-waist" type="number" inputmode="decimal" step="0.5" placeholder="เช่น 92"></div>
        <div class="field"><label>ก้าวเฉลี่ย/วัน</label><input id="t-steps" type="number" inputmode="numeric" placeholder="เช่น 6500"></div>
        <div class="field"><label>นอนเฉลี่ย (ชม.)</label><input id="t-sleep" type="number" inputmode="decimal" step="0.5" placeholder="เช่น 6.5"></div>
        <div class="field"><label>แฟนหน้ามืด (ครั้ง)</label><input id="t-faint" type="number" inputmode="numeric" placeholder="เช่น 0"></div>
      </div>
      <button class="btn grad block" data-act="save-track">บันทึกสัปดาห์นี้</button>
      <p class="faint mt">${esc(tr.weeklyNote)} · น้ำหนักใช้ค่าเฉลี่ย 2–3 เช้า</p>
      ${recent ? `<hr class="soft"><div class="loglist">${recent}</div>` : ""}
    </div>
    <details class="acc"><summary>วัดทุก 2 สัปดาห์ <span class="caret">▾</span></summary><div class="acc-body">${li(tr.biweekly)}</div></details>
    <details class="acc"><summary>ทดสอบทุก 4 สัปดาห์ <span class="caret">▾</span></summary>
      <div class="acc-body">${li(tr.monthly)}<p class="faint mt">${esc(tr.monthlyNote)}</p></div></details>
    <details class="acc"><summary>วิธีปรับอาหาร <span class="caret">▾</span></summary>
      <div class="acc-body"><div class="eyebrow" style="color:var(--you)">ฉัน</div><div class="spacer"></div>${li(tr.adjustYou)}
        <div class="spacer"></div><div class="eyebrow" style="color:var(--partner)">แฟน</div><div class="spacer"></div>${li(tr.adjustPartner, "partner")}</div></details>

    <h2 class="section-title">กติกาคู่รัก 💞</h2>
    <div class="card">${li(r.couple)}</div>
    <details class="acc"><summary>รางวัลที่ไม่ใช่อาหาร <span class="caret">▾</span></summary><div class="acc-body">${li(r.rewards)}</div></details>
    <details class="acc" open><summary>สิ่งที่เริ่มทำใน 7 วันแรก <span class="caret">▾</span></summary>
      <div class="acc-body">${ol(r.first7days)}<div class="callout mt"><span class="ci">📅</span><div>${esc(r.closing)}</div></div></div></details>

    <h2 class="section-title">ตั้งค่า</h2>
    <div class="card">
      <p class="muted" style="margin-bottom:8px">ผู้ใช้งานตอนนี้</p>
      <div class="seg"><button class="${state.profile === "you" ? "on" : ""}" data-act="set-profile" data-profile="you">ฉัน</button>
        <button class="${state.profile === "partner" ? "on" : ""}" data-act="set-profile" data-profile="partner">แฟน</button></div>
      <div class="btn-row mt">
        <button class="btn" data-act="lock-now">🔒 ล็อกตอนนี้</button>
        <button class="btn" data-act="forget-pass">ลืมรหัสในเครื่อง</button>
      </div>
      <button class="btn block mt" data-act="reset-all" style="color:var(--danger)">ล้างข้อมูลทั้งหมดในเครื่อง</button>
      <p class="faint mt center">${esc(PLAN.meta.disclaimer)}</p>
    </div>`;
}

/* ============================================================
   EVENTS
   ============================================================ */
function clampWeek(w) { return Math.max(1, Math.min(12, w)); }

document.addEventListener("click", (e) => {
  const t = e.target.closest("[data-act]");
  if (!t) return;
  const act = t.dataset.act;
  switch (act) {
    case "quick":
      state.session = t.dataset.session; state.tab = "workouts"; render(); break;
    case "set-session":
      state.session = t.dataset.session; render(); break;
    case "set-mode":
      state.mode = t.dataset.mode; store.set("mode", state.mode); render(); break;
    case "toggle-ex": {
      const i = +t.dataset.i; const arr = getChecks(state.session);
      arr[i] = !arr[i]; setChecks(state.session, arr); render(); break;
    }
    case "reset-checks":
      setChecks(state.session, exercisesFor(state.session).map(() => false)); render(); break;
    case "log-workout": logWorkout(); break;
    case "token": toggleToken(t.dataset.who, +t.dataset.i); break;
    case "week-prev": state.week = clampWeek(state.week - 1); store.set("week", state.week); render(); break;
    case "week-next": state.week = clampWeek(state.week + 1); store.set("week", state.week); render(); break;
    case "goto": state.tab = t.dataset.tab; render(); break;
    case "set-profile":
      state.profile = t.dataset.profile; store.set("profile", state.profile); render(); break;
    case "save-track": saveTrack(); break;
    case "lock-now": lockNow(); break;
    case "forget-pass": store.del("pass"); toast("ลบรหัสในเครื่องแล้ว"); break;
    case "reset-all": resetAll(); break;
  }
});

function logWorkout() {
  const id = state.session;
  const logs = store.get("logs", []);
  logs.push({ date: todayStr(), session: id, profile: state.profile, week: currentWeekKey() });
  store.set("logs", logs);
  const stickers = store.get("stickers", { you: 0, partner: 0 });
  stickers[state.profile] = (stickers[state.profile] || 0) + 1;
  store.set("stickers", stickers);
  setChecks(id, exercisesFor(id).map(() => false));
  const label = id === "E" ? "โปรแกรม 12 นาที" : "Workout " + id;
  toast("🎉 " + profileName(state.profile) + " ทำ " + label + " สำเร็จ +1 ดวง");
  if (stickers[state.profile] % 10 === 0) setTimeout(() => toast("✨ ครบ 10 ดวง! เลือกกิจกรรมเดตได้เลย"), 900);
  render();
}
function toggleToken(who, i) {
  const tok = store.get("tokens", { you: [false, false, false], partner: [false, false, false] });
  tok[who][i] = !tok[who][i]; store.set("tokens", tok); render();
}
function saveTrack() {
  const val = (id) => { const el = $("#" + id); return el && el.value.trim() ? el.value.trim() : ""; };
  const entry = { date: todayStr(), w: val("t-w"), waist: val("t-waist"), steps: val("t-steps"), sleep: val("t-sleep"), faint: val("t-faint") };
  if (!entry.w && !entry.waist && !entry.steps && !entry.sleep && !entry.faint) { toast("กรอกอย่างน้อย 1 ช่อง"); return; }
  const logs = store.get("tracklogs", []); logs.push(entry); store.set("tracklogs", logs);
  toast("บันทึกแล้ว ✓"); render();
}
function lockNow() {
  store.del("pass"); PLAN = null;
  $("#app").hidden = true; $("#lock").style.display = "grid";
  $("#pass").value = ""; $("#lock-error").hidden = true;
}
function resetAll() {
  if (!confirm("ล้างข้อมูลความคืบหน้าทั้งหมดในเครื่องนี้? (รหัสผ่านและแผนไม่ถูกลบออกจากเว็บ)")) return;
  ["profile", "mode", "week", "checks", "logs", "stickers", "tokens", "tokWeek", "tracklogs"].forEach(store.del);
  state.profile = "you"; state.mode = "gym"; state.week = 1;
  toast("ล้างข้อมูลแล้ว"); render();
}

$("#profile-chip").addEventListener("click", () => {
  state.profile = state.profile === "you" ? "partner" : "you";
  store.set("profile", state.profile); render();
});

/* ============================================================
   BOOT
   ============================================================ */
function buildTabs() {
  $("#tabbar").innerHTML = TABS.map((t) =>
    `<button class="tab" data-tab="${t.id}">${svg(t.icon)}<span>${t.label}</span></button>`).join("");
  document.querySelectorAll(".tab").forEach((b) =>
    b.addEventListener("click", () => { state.tab = b.dataset.tab; render(); }));
}
function startApp() {
  $("#lock").style.display = "none";
  $("#app").hidden = false;
  buildTabs();
  render();
}
async function tryUnlock(passcode, remember) {
  PLAN = await decryptContent(passcode);
  if (remember) store.set("pass", passcode);
  startApp();
}

$("#lock-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#unlock-btn"); const err = $("#lock-error");
  const pass = $("#pass").value; if (!pass) return;
  btn.disabled = true; btn.textContent = "กำลังเปิด…"; err.hidden = true;
  try {
    await tryUnlock(pass, $("#remember").checked);
  } catch {
    err.hidden = false; $("#pass").value = ""; $("#pass").focus();
  } finally { btn.disabled = false; btn.textContent = "เปิดแผน"; }
});

// auto-unlock if remembered
(async function auto() {
  const saved = store.get("pass", null);
  if (saved) { try { await tryUnlock(saved, false); } catch { store.del("pass"); } }
})();

// service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
