// The Staff bot's forms (bots plan step 4a, DL-174; owner rules of 3 Nov 2026, staff forms
// mock-up v14, HR plan PR-HR-060 to 068). A Telegram Mini App page served by the relay at
// /app/staff. Staff see Khmer only. It holds no data: it asks /form/staff/start with the
// person's Telegram sign-in for their name, report roles and shift, then sends each form to
// /form/staff. The office records it with the HR rules and the bot answers in the chat.
//
// Check in and Check out: the page asks for the phone's Location first (Telegram's location
// access); when it is off it asks the person to turn it on and opens the settings. Then the
// camera scans the place QR. Scan employee card (caretakers and Authorizers): check in or out,
// scan the card, pick the reason (a text for Other) and take a half-body photo; Save stays off
// until all are given. The person's name comes back in the chat with the answer.
//
// Report a problem (step 4b, DL-175; everyone): Unit Problem or Building problem, the Unit or
// the place and floor, the problem type picture, at least one photo (up to 4), and a text or a
// voice note (up to 1 minute). At a place with an open Building problem the person picks Same
// problem or Something else. Close job (Technicians): pick a planned repair, take the after
// photo (1 to 3) and choose No cost, or the parts and paid outside workers in dollars with a
// receipt photo (1 or 2).
//
// Utility reading (step 4c, DL-176; meter readers and Authorizers): one table of each Unit with a
// meter, Electricity (kWh) and Water (m³), with last month's reading under each box. No photo
// (owner rule, 22 Oct 2026). A reading lower than last month, or Electricity more than 300 kWh
// above it, shows "Look again" before sending; the readings wait for a Manager in Utilities.
// The flag beside a Unit opens the Meter check request (which meter, the problem, a photo if
// possible and a note) for the Technical team. The Khmer waits for the native-speaker check.

const PAGE = String.raw`<!doctype html>
<html lang="km">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CHETANA staff</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  :root { --bg: #ffffff; --fg: #1d2330; --muted: #5f6b7a; --line: #d8dee6; --accent: #2a6fdb;
    --accent-fg: #ffffff; --soft: #f2f5f9; --warn: #b42318; --ok: #157347; }
  body { margin: 0; font: 16px/1.5 -apple-system, "Segoe UI", Roboto, "Noto Sans Khmer", sans-serif;
    background: var(--tg-theme-bg-color, var(--bg)); color: var(--tg-theme-text-color, var(--fg)); }
  main { padding: 16px; max-width: 560px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 20px 0 8px; }
  p.hint { color: var(--tg-theme-hint-color, var(--muted)); font-size: 14px; margin: 4px 0 8px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .row > button { flex: 1 1 40%; }
  button.big { padding: 18px 8px; border-radius: 14px; border: 0; font: inherit; font-weight: 600;
    background: var(--tg-theme-button-color, var(--accent));
    color: var(--tg-theme-button-text-color, var(--accent-fg)); cursor: pointer; }
  button.big.out { background: var(--soft); color: inherit; border: 1px solid var(--line); }
  .choice { border: 1px solid var(--line); border-radius: 10px; background: var(--soft);
    color: inherit; font: inherit; padding: 10px 6px; cursor: pointer; }
  .choice.on { border-color: var(--accent); outline: 2px solid var(--accent); }
  .list .choice { display: block; width: 100%; text-align: left; margin: 6px 0; padding: 10px; }
  textarea { width: 100%; box-sizing: border-box; font: inherit; border: 1px solid var(--line);
    border-radius: 10px; padding: 10px; background: inherit; color: inherit; min-height: 72px; }
  .card { border: 1px solid var(--line); border-radius: 12px; padding: 12px; margin: 12px 0; }
  .scanned { color: var(--ok); font-weight: 600; }
  img.photo { width: 120px; height: 160px; object-fit: cover; border-radius: 10px; display: block; }
  button.main { width: 100%; margin-top: 20px; padding: 14px; border: 0; border-radius: 12px;
    background: var(--tg-theme-button-color, var(--accent));
    color: var(--tg-theme-button-text-color, var(--accent-fg)); font: inherit; font-weight: 600; }
  button.main:disabled { opacity: 0.45; }
  label.small { display: inline-block; }
  button.small, label.small { padding: 8px 12px; border-radius: 8px; border: 1px solid var(--line);
    background: var(--soft); color: inherit; font: inherit; cursor: pointer; }
  .error { color: var(--warn); font-weight: 600; margin-top: 12px; }
  .done { text-align: center; padding: 40px 0; font-size: 18px; }
  .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .tile { border: 1px solid var(--line); border-radius: 12px; background: var(--soft); color: inherit;
    font: inherit; font-size: 14px; padding: 10px 4px; cursor: pointer; }
  .tile.on { border-color: var(--accent); outline: 2px solid var(--accent); }
  .tile.danger { border-color: var(--warn); }
  .tile .icon { display: block; font-size: 26px; }
  .urgent { color: var(--warn); font-weight: 600; }
  .photos { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .photos img { width: 72px; height: 72px; object-fit: cover; border-radius: 8px; }
  select, input.text { width: 100%; box-sizing: border-box; font: inherit; padding: 10px;
    border: 1px solid var(--line); border-radius: 10px; background: inherit; color: inherit; }
  .money { display: flex; gap: 8px; }
  .money label { flex: 1; font-size: 14px; }
  table.util { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  table.util th { font-size: 13px; text-align: left; padding: 4px; color: var(--tg-theme-hint-color, var(--muted)); }
  table.util td { padding: 4px; vertical-align: top; }
  table.util input.text { padding: 8px; }
  table.util tr.warn td { background: #fff4e5; }
  .small-line { font-size: 12px; margin: 2px 0 0; }
  td.flagline { font-size: 13px; padding-top: 0; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<main id="app"><p class="hint">កំពុងផ្ទុក…</p></main>
<script>
"use strict";
(function () {
  var T = {
    failed: "មិនអាចបើកទម្រង់បានទេ។ សូមបិទ ហើយព្យាយាមម្ដងទៀត។",
    not_linked: "គណនីរបស់អ្នកមិនទាន់បានភ្ជាប់ទេ។ សូមចុច Start ក្នុងការជជែក ហើយរង់ចាំការអនុម័ត។",
    shift: "វេន", check_in: "ចូល", check_out: "ចេញ",
    attendance: "វត្តមាន", attendance_hint: "សូមបើក Location ជាមុន បន្ទាប់មកស្កេន QR នៅទីតាំង។",
    location_off: "សូមបើក Location នៅលើទូរស័ព្ទ ហើយអនុញ្ញាតឲ្យ Telegram ប្រើវា។",
    open_settings: "បើកការកំណត់",
    old_telegram: "Telegram របស់អ្នកចាស់ពេក។ សូមធ្វើបច្ចុប្បន្នភាព Telegram។",
    finding: "កំពុងរកទីតាំង…",
    scan_place: "ស្កេន QR នៅទីតាំង",
    card: "ស្កេនកាតបុគ្គលិក", card_hint: "សម្រាប់បុគ្គលិកដែលគ្មានទូរស័ព្ទ។ ស្កេនកាតជាមុនសិន។",
    scan_card: "ស្កេនកាត", card_scanned: "✓ បានស្កេនកាត", scan_again: "ស្កេនម្តងទៀត",
    reason: "មូលហេតុ",
    NO_PHONE: "គ្មានទូរស័ព្ទ", PHONE_BROKEN: "ទូរស័ព្ទខូច", PHONE_LOST: "ទូរស័ព្ទបាត់",
    PHONE_STOLEN: "ទូរស័ព្ទត្រូវគេលួច", OTHER: "ផ្សេងទៀត",
    other_text: "សូមសរសេរមូលហេតុ (រហូតដល់ 300 តួអក្សរ)",
    photo: "រូបថតពាក់កណ្តាលខ្លួន", take_photo: "📷 ថតរូប", retake: "ថតម្តងទៀត",
    save: "រក្សាទុក", sending: "កំពុងផ្ញើ…", back: "ត្រឡប់",
    too_many: "ព្យាយាមច្រើនពេក។ សូមរង់ចាំមួយនាទី។",
    report: "រាយការណ៍បញ្ហា", report_hint: "ឃើញអ្វីខូចពេលដើរពិនិត្យ",
    unit_problem: "បញ្ហាក្នុងបន្ទប់", building_problem: "បញ្ហាអគារ",
    unit: "បន្ទប់", choose: "ជ្រើស", where: "កន្លែង", floor: "ជាន់ (បើដឹង)",
    what: "បញ្ហាអ្វី? ចុចរូប",
    always_urgent: "បន្ទាន់ជានិច្ច៖ អ្នកថែរក្សាអគារវេន និងអ្នកគ្រប់គ្រងទទួលដំណឹងភ្លាមៗ។ ភ្លើងឆេះ 118 · ប៉ូលិស 117",
    open_here: "មានរបាយការណ៍បើកនៅទីនេះ", same: "បញ្ហាដូចគ្នា", something_else: "បញ្ហាផ្សេង",
    photos: "រូបថត (យ៉ាងហោចណាស់ 1 រហូតដល់ 4)", add_photo: "📷 ថតរូប",
    what_wrong: "អ្វីខូច", what_wrong_hint: "សរសេរ ឬថតសារជាសំឡេង ឬទាំងពីរ។",
    record: "🎤 ថតសារជាសំឡេង (រហូតដល់ 1 នាទី)", stop: "■ ឈប់", recording: "កំពុងថត… ",
    voice: "🎤 សារជាសំឡេង ", remove: "លុប",
    no_mic: "មិនអាចប្រើមីក្រូហ្វូននៅទីនេះបានទេ។ សូមសរសេរជំនួសវិញ។",
    tenant_told: "អ្នកជួលបន្ទប់នេះ នឹងទទួលដំណឹង តែពេលអ្នកគ្រប់គ្រងរៀបចំពេលមកពិនិត្យប៉ុណ្ណោះ។",
    send: "ផ្ញើ", report_ready: "សូមជ្រើសប្រភេទ បន្ទប់ ឬកន្លែង បញ្ហា ថតរូប 1 សន្លឹក ហើយសរសេរ ឬថតសារជាសំឡេង។",
    close: "បិទការងារ", close_hint: "រូបថតក្រោយជួសជុល និងថ្លៃ", no_jobs: "គ្មានការងាររង់ចាំជួសជុលទេ។",
    job: "ការងារ", after: "រូបថតក្រោយជួសជុល (ត្រូវតែមាន រហូតដល់ 3)",
    cost: "ថ្លៃជួសជុល", no_cost: "គ្មានថ្លៃ", paid: "មានថ្លៃ",
    cost_hint: "តែគ្រឿងបន្លាស់ និងជាងខាងក្រៅដែលបង់លុយប៉ុណ្ណោះ។ ពេលធ្វើការរបស់បុគ្គលិកយើង មិនបញ្ចូលទេ។",
    parts: "គ្រឿងបន្លាស់ $", outside: "ជាងខាងក្រៅ $",
    receipt: "រូបថតវិក្កយបត្រ (ត្រូវតែមាន រហូតដល់ 2)",
    total: "សរុប $", total_hint: "អ្នកគ្រប់គ្រងពិនិត្យ រួចកម្មវិធីធ្វើសំណើចំណាយ។",
    close_ready: "ថតរូបក្រោយជួសជុល ហើយជ្រើសថ្លៃ (មានថ្លៃ ត្រូវមានចំនួន និងរូបថតវិក្កយបត្រ)។",
    sent: "បានផ្ញើហើយ។ លទ្ធផលនឹងមកក្នុងការជជែក ក្នុងរយៈពេលប្រហែលមួយនាទី។",
    meter: "អំណានមីទ័រទឹក និងភ្លើង", meter_hint: "កត់អំណានមីទ័រគ្រប់បន្ទប់ រួចផ្ញើឲ្យអ្នកគ្រប់គ្រងពិនិត្យ",
    col_unit: "បន្ទប់", col_e: "ភ្លើង (kWh)", col_w: "ទឹក (m³)", last: "ខែមុន ",
    look_again: "ត្រួតពិនិត្យម្ដងទៀត", lower_e: "អំណានភ្លើងទាបជាងខែមុន", lower_w: "អំណានទឹកទាបជាងខែមុន",
    high_e: "ប្រើភ្លើងច្រើនជាងធម្មតាខ្លាំង", look_hint: "សូមមើលមីទ័រម្តងទៀត មុនពេលផ្ញើ។",
    not_number: "សូមសរសេរលេខ", filled: "បានបំពេញ ", of: " ក្នុងចំណោម ", units_word: " បន្ទប់",
    to_check: " ត្រូវពិនិត្យ",
    meter_note: "មិនចាំបាច់ថតរូប។ អ្នកគ្រប់គ្រង ឬអ្នកមានសិទ្ធិ នឹងបញ្ជាក់អំណាន មុនចេញវិក្កយបត្រទឹកភ្លើង។",
    send_review: "ផ្ញើឱ្យពិនិត្យ", no_meters: "មិនទាន់មានមីទ័រក្នុងកម្មវិធីទេ។",
    meter_ready: "សូមបំពេញអំណានយ៉ាងហោចណាស់មួយ ជាលេខត្រឹមត្រូវ។",
    meter_flag: "រាយការណ៍បញ្ហាមីទ័រ",
    metercheck: "សំណើពិនិត្យមីទ័រ", meter_which: "មីទ័រ", meter_e: "ភ្លើង", meter_w: "ទឹក",
    problem: "បញ្ហា", BROKEN: "ខូច", CANNOT_READ: "មើលលេខមិនឃើញ", NOT_SURE: "លេខមិនប្រាកដ",
    OTHER_METER: "ផ្សេងៗ", photo_optional: "រូបថត (បើអាច រហូតដល់ 2)", mc_note: "កំណត់សម្គាល់",
    mc_hint: "បន្ទាប់ពីផ្ញើ សំណើនេះទៅក្រុមបច្ចេកទេស។ អ្នកបច្ចេកទេសនឹងពិនិត្យមីទ័រ។",
    mc_ready: "សូមជ្រើសមីទ័រ និងបញ្ហា (ផ្សេងៗ ត្រូវសរសេរកំណត់សម្គាល់)។"
  };
  var REASONS = ["NO_PHONE", "PHONE_BROKEN", "PHONE_LOST", "PHONE_STOLEN", "OTHER"];
  var CARD_ROLES = { CARETAKER: true, AUTHORIZER: true };
  var ROLE_NAMES = { CLEANER: "អ្នកសម្អាត", TECHNICIAN: "អ្នកបច្ចេកទេស",
    CARETAKER: "អ្នកថែរក្សាអគារ", METER_READER: "អ្នកអានមីទ័រ", AUTHORIZER: "អ្នកអនុម័ត" };
  var PHOTO_SIDE = 1600, MAX_REASON = 300, MAX_TEXT = 1000, MAX_VOICE_SECONDS = 60;
  var LIMITS = { report: 4, after: 3, receipt: 2, mc: 2 };
  var METER_ROLES = { METER_READER: true, AUTHORIZER: true };
  var METER_PROBLEMS = ["BROKEN", "CANNOT_READ", "NOT_SURE", "OTHER"];
  var HIGH_KWH = 300, MAX_NOTE = 300;
  var ICONS = { drop: "💧", zap: "⚡", snow: "❄️", lock: "🚪", window: "🪟", sofa: "🛋️",
    wifi: "📶", bug: "🐜", broom: "🧹", volume: "🔊", flame: "🔥", dots: "❓" };

  var tg = window.Telegram && window.Telegram.WebApp;
  var app = document.getElementById("app");
  var me = null, choices = {};
  var view = "home";
  var rep = null, job = null, readings = {}, mc = null;
  var recorder = null, recordTimer = null, recordStart = 0;
  var card = { mode: "IN", code: "", reason: "", text: "", photo: null };
  var error = "", note = "", busy = false;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function roles() { return (me && me.roles) || []; }
  function mayScanCards() { return roles().some(function (role) { return CARD_ROLES[role]; }); }
  function cardReady() {
    return card.code && card.reason && card.photo &&
      (card.reason !== "OTHER" || card.text.trim().length > 0);
  }

  function mayReadMeters() { return roles().some(function (role) { return METER_ROLES[role]; }); }
  function meters() { return choices.meters || []; }
  // A typed reading: digits with up to 3 decimals, as a number; "" is empty; null is wrong.
  function readingValue(value) {
    if (!value || !value.trim()) { return ""; }
    var match = /^\s*(\d{1,9})(\.\d{1,3})?\s*$/.exec(value);
    return match ? Number(match[1] + (match[2] || "")) : null;
  }
  function typed(id) { return readings[id] || (readings[id] = { e: "", w: "" }); }
  // What to look at again for one Unit (mock-up v14): lower than last month, or Electricity
  // more than 300 kWh above it, or not a number.
  function meterFlags(row) {
    var out = [], value = typed(row.id);
    [["e", T.lower_e], ["w", T.lower_w]].forEach(function (pair) {
      var meter = row[pair[0]];
      if (!meter) { return; }
      var number = readingValue(value[pair[0]]);
      if (number === null) { out.push(T.not_number); return; }
      if (number === "" || meter.last == null) { return; }
      if (number < meter.last) { out.push(pair[1]); }
      else if (pair[0] === "e" && number - meter.last > HIGH_KWH) { out.push(T.high_e); }
    });
    return out;
  }
  function meterReady() {
    var any = false, wrong = false;
    meters().forEach(function (row) {
      ["e", "w"].forEach(function (key) {
        if (!row[key]) { return; }
        var number = readingValue(typed(row.id)[key]);
        if (number === null) { wrong = true; } else if (number !== "") { any = true; }
      });
    });
    return any && !wrong;
  }
  function meterCount() {
    var rows = meters(), filled = 0, flagged = 0;
    rows.forEach(function (row) {
      var value = typed(row.id);
      if ((!row.e || readingValue(value.e) !== "") && (!row.w || readingValue(value.w) !== "")) { filled += 1; }
      if (meterFlags(row).length) { flagged += 1; }
    });
    return T.filled + filled + T.of + rows.length + T.units_word + (flagged ? " · " + flagged + T.to_check : "");
  }
  function mcReady() {
    return !!mc && !!mc.meter && !!mc.problem && (mc.problem !== "OTHER" || mc.note.trim().length > 0);
  }

  function newReport() {
    return { kind: "", unit: "", place: "", floor: "", type: "", same: null, decided: false,
      photos: [], text: "", voice: null };
  }
  function newJob() {
    return { id: "", after: [], cost: "", parts: "", outside: "", receipts: [] };
  }
  function typeOf(id) {
    return (choices.types || []).filter(function (row) { return row.id === id; })[0] || null;
  }
  function openHere() {
    if (rep.kind !== "BUILDING" || !rep.place) { return []; }
    return (choices.open_building || []).filter(function (row) { return row.problem_place_id === rep.place; });
  }
  function reportReady() {
    if (!rep.kind || !rep.type || rep.photos.length < 1) { return false; }
    if (rep.kind === "UNIT" ? !rep.unit : !rep.place) { return false; }
    if (openHere().length && !rep.decided) { return false; }
    return rep.text.trim().length > 0 || !!rep.voice || !!rep.same;
  }
  // Dollars as typed ("12" or "12.50") to whole cents, or null.
  function cents(value) {
    var match = /^\s*(\d{1,6})(?:\.(\d{1,2}))?\s*$/.exec(value || "");
    if (!match) { return null; }
    return Number(match[1]) * 100 + Number(((match[2] || "") + "00").slice(0, 2));
  }
  function jobCost() {
    var parts = job.parts.trim() ? cents(job.parts) : 0, outside = job.outside.trim() ? cents(job.outside) : 0;
    if (parts === null || outside === null) { return null; }
    return { parts: parts, outside: outside };
  }
  function jobReady() {
    if (!job.id || job.after.length < 1 || !job.cost) { return false; }
    if (job.cost === "NONE") { return true; }
    var money = jobCost();
    return !!money && money.parts + money.outside > 0 && job.receipts.length > 0;
  }
  function photoRow(list, target) {
    var html = '<div class="photos">' + list.map(function (photo, index) {
      return '<img alt="" src="' + photo.url + '" data-act="drop-photo" data-value="' + target + ":" + index + '">';
    }).join("");
    if (list.length < LIMITS[target]) {
      html += '<label class="small">' + esc(T.add_photo) +
        '<input type="file" accept="image/*" capture="environment" data-photo="' + target + '" hidden></label>';
    }
    return html + "</div>";
  }
  function sendButton(ready, hint) {
    var html = '<button class="main" data-act="send"' + (ready && !busy ? "" : " disabled") + ">" +
      esc(busy ? T.sending : T.send) + "</button>";
    if (!ready) { html += '<p class="hint">' + esc(hint) + "</p>"; }
    return html + '<button class="small" style="margin-top:12px" data-act="home">' + esc(T.back) + "</button>";
  }

  function reportView() {
    var html = "<h1>⚠ " + esc(T.report) + "</h1>";
    html += '<div class="row">' + [["UNIT", T.unit_problem], ["BUILDING", T.building_problem]].map(function (k) {
      return '<button class="choice' + (rep.kind === k[0] ? " on" : "") + '" data-act="kind" data-value="' + k[0] + '">' +
        esc(k[1]) + "</button>";
    }).join("") + "</div>";
    if (!rep.kind) { return html + '<button class="small" style="margin-top:12px" data-act="home">' + esc(T.back) + "</button>"; }
    if (rep.kind === "UNIT") {
      html += "<h2>" + esc(T.unit) + '</h2><select id="unit"><option value="">' + esc(T.choose) + "</option>" +
        (choices.units || []).map(function (unit) {
          return '<option value="' + esc(unit.id) + '"' + (rep.unit === unit.id ? " selected" : "") + ">" + esc(unit.number) + "</option>";
        }).join("") + "</select>";
    } else {
      html += "<h2>" + esc(T.where) + '</h2><div class="row">' + (choices.places || []).map(function (place) {
        return '<button class="choice' + (rep.place === place.id ? " on" : "") + '" data-act="place" data-value="' +
          esc(place.id) + '">' + esc(place.name_kh) + "</button>";
      }).join("") + "</div>";
      html += '<input class="text" id="floor" maxlength="20" placeholder="' + esc(T.floor) + '" value="' + esc(rep.floor) + '">';
    }
    html += "<h2>" + esc(T.what) + '</h2><div class="tiles">' + (choices.types || []).map(function (row) {
      return '<button class="tile' + (rep.type === row.id ? " on" : "") + (row.always_urgent ? " danger" : "") +
        '" data-act="type" data-value="' + esc(row.id) + '"><span class="icon">' + (ICONS[row.icon] || "❓") +
        "</span>" + esc(row.name_kh) + "</button>";
    }).join("") + "</div>";
    var type = typeOf(rep.type);
    if (type && type.always_urgent) { html += '<p class="urgent">' + esc(T.always_urgent) + "</p>"; }
    var open = openHere();
    if (open.length) {
      html += '<div class="card"><b>' + esc(T.open_here) + "</b>" + open.map(function (row) {
        var kind = typeOf(row.problem_type_id);
        return '<div class="row"><button class="choice' + (rep.same === row.report_id ? " on" : "") +
          '" data-act="same" data-value="' + esc(row.report_id) + '">' + (kind ? (ICONS[kind.icon] || "") + " " : "") +
          esc(row.report_number) + (row.floor ? " · " + esc(row.floor) : "") + " · " + esc(T.same) + "</button></div>";
      }).join("") + '<div class="row"><button class="choice' + (rep.decided && !rep.same ? " on" : "") +
        '" data-act="same" data-value="">' + esc(T.something_else) + "</button></div></div>";
    }
    html += "<h2>" + esc(T.photos) + "</h2>" + photoRow(rep.photos, "report");
    html += "<h2>" + esc(T.what_wrong) + '</h2><p class="hint">' + esc(T.what_wrong_hint) + "</p>";
    html += '<textarea id="text" maxlength="' + MAX_TEXT + '">' + esc(rep.text) + "</textarea>";
    if (rep.voice) {
      html += "<p>" + esc(T.voice) + "0:" + String(rep.voice.seconds).padStart(2, "0") +
        ' <button class="small" data-act="voice-remove">' + esc(T.remove) + "</button></p>";
    } else if (recorder) {
      html += '<p><span id="recording">' + esc(T.recording) + '</span> <button class="small" data-act="voice-stop">' +
        esc(T.stop) + "</button></p>";
    } else {
      html += '<p><button class="small" data-act="voice-start">' + esc(T.record) + "</button></p>";
    }
    if (rep.kind === "UNIT" && rep.unit) { html += '<p class="hint">' + esc(T.tenant_told) + "</p>"; }
    return html + sendButton(reportReady(), T.report_ready);
  }

  function jobView() {
    var jobs = (me && me.jobs) || [];
    var html = "<h1>✓ " + esc(T.close) + "</h1>";
    if (!jobs.length) {
      return html + '<p class="hint">' + esc(T.no_jobs) + '</p><button class="small" data-act="home">' + esc(T.back) + "</button>";
    }
    html += "<h2>" + esc(T.job) + '</h2><div class="list">' + jobs.map(function (row) {
      var where = row.unit || [row.place_km, row.floor].filter(Boolean).join(" · ");
      return '<button class="choice' + (job.id === row.report_id ? " on" : "") + '" data-act="job" data-value="' +
        esc(row.report_id) + '"><b>' + esc(row.report_number) + "</b> · " + esc(where) + " · " +
        (ICONS[row.icon] || "") + " " + esc(row.type_km) + (row.urgent ? ' <span class="urgent">!</span>' : "") +
        '<br><span class="hint">' + esc(row.description) + "</span></button>";
    }).join("") + "</div>";
    html += "<h2>" + esc(T.after) + "</h2>" + photoRow(job.after, "after");
    html += "<h2>" + esc(T.cost) + '</h2><div class="row">' + [["NONE", T.no_cost], ["PAID", T.paid]].map(function (c) {
      return '<button class="choice' + (job.cost === c[0] ? " on" : "") + '" data-act="cost" data-value="' + c[0] + '">' +
        esc(c[1]) + "</button>";
    }).join("") + '</div><p class="hint">' + esc(T.cost_hint) + "</p>";
    if (job.cost === "PAID") {
      html += '<div class="money"><label>' + esc(T.parts) + '<input class="text" id="parts" inputmode="decimal" value="' +
        esc(job.parts) + '"></label><label>' + esc(T.outside) + '<input class="text" id="outside" inputmode="decimal" value="' +
        esc(job.outside) + '"></label></div>';
      html += "<h2>" + esc(T.receipt) + "</h2>" + photoRow(job.receipts, "receipt");
      var money = jobCost();
      if (money) {
        var sum = money.parts + money.outside;
        html += '<p class="hint" id="total">' + esc(T.total) + Math.floor(sum / 100) + "." +
          String(sum % 100).padStart(2, "0") + " · " + esc(T.total_hint) + "</p>";
      }
    }
    return html + sendButton(jobReady(), T.close_ready);
  }

  function meterCell(row, key, index) {
    if (!row[key]) { return "<td>–</td>"; }
    var last = row[key].last;
    return '<td><input class="text" inputmode="decimal" id="m-' + key + "-" + index + '" aria-label="' +
      esc(row.n + " " + (key === "e" ? T.meter_e : T.meter_w)) + '" value="' + esc(typed(row.id)[key]) + '">' +
      '<div class="hint small-line">' + esc(T.last) + (last == null ? "–" : esc(last)) + "</div></td>";
  }
  function flagLine(row) {
    var flags = meterFlags(row);
    return flags.length ? '<span class="urgent">' + esc(T.look_again) + "</span> " + esc(flags.join("។ ") + "។ " + T.look_hint) : "";
  }
  function meterView() {
    var rows = meters();
    var html = "<h1>⚡ " + esc(T.meter) + "</h1>";
    if (!rows.length) {
      return html + '<p class="hint">' + esc(T.no_meters) + '</p><button class="small" data-act="home">' + esc(T.back) + "</button>";
    }
    html += '<table class="util"><thead><tr><th>' + esc(T.col_unit) + "</th><th>" + esc(T.col_e) + "</th><th>" +
      esc(T.col_w) + "</th><th></th></tr></thead><tbody>" + rows.map(function (row, index) {
        var flags = meterFlags(row);
        return '<tr id="row-' + index + '"' + (flags.length ? ' class="warn"' : "") + "><td><b>" + esc(row.n) + "</b></td>" +
          meterCell(row, "e", index) + meterCell(row, "w", index) +
          '<td><button class="small" data-act="metercheck" data-value="' + index + '" aria-label="' +
          esc(T.meter_flag + " " + row.n) + '" title="' + esc(T.meter_flag) + '">⚑</button></td></tr>' +
          '<tr><td colspan="4" class="flagline" id="flag-' + index + '">' + flagLine(row) + "</td></tr>";
      }).join("") + "</tbody></table>";
    html += '<p class="hint" id="count">' + esc(meterCount()) + "</p>";
    html += '<p class="hint">' + esc(T.meter_note) + "</p>";
    return html + sendButton(meterReady(), T.meter_ready).replace(esc(T.send) + "</button>", esc(T.send_review) + "</button>");
  }
  function meterCheckView() {
    var row = meters()[mc.index];
    var html = "<h1>⚑ " + esc(T.metercheck) + "</h1><p><b>" + esc(T.col_unit) + " " + esc(row.n) + "</b></p>";
    html += "<h2>" + esc(T.meter_which) + '</h2><div class="row">' + [["ELECTRICITY", T.meter_e], ["WATER", T.meter_w]].map(function (pair) {
      return '<button class="choice' + (mc.meter === pair[0] ? " on" : "") + '" data-act="mc-meter" data-value="' + pair[0] + '">' +
        esc(pair[1]) + "</button>";
    }).join("") + "</div>";
    html += "<h2>" + esc(T.problem) + '</h2><div class="row">' + METER_PROBLEMS.map(function (problem) {
      return '<button class="choice' + (mc.problem === problem ? " on" : "") + '" data-act="mc-problem" data-value="' + problem + '">' +
        esc(problem === "OTHER" ? T.OTHER_METER : T[problem]) + "</button>";
    }).join("") + "</div>";
    html += "<h2>" + esc(T.photo_optional) + "</h2>" + photoRow(mc.photos, "mc");
    html += "<h2>" + esc(T.mc_note) + '</h2><textarea id="mcnote" maxlength="' + MAX_NOTE + '">' + esc(mc.note) + "</textarea>";
    html += '<p class="hint">' + esc(T.mc_hint) + "</p>";
    return html + sendButton(mcReady(), T.mc_ready).replace('data-act="home"', 'data-act="meter-back"');
  }
  function refreshMeterRow(index) {
    var row = meters()[index];
    var line = document.getElementById("flag-" + index);
    if (line) { line.innerHTML = flagLine(row); }
    var tr = document.getElementById("row-" + index);
    if (tr) { tr.className = meterFlags(row).length ? "warn" : ""; }
    var count = document.getElementById("count");
    if (count) { count.textContent = meterCount(); }
  }

  function render() {
    var html = "";
    if (view === "meter") { app.innerHTML = meterView() + (error ? '<p class="error">' + esc(error) + "</p>" : ""); return; }
    if (view === "metercheck") { app.innerHTML = meterCheckView() + (error ? '<p class="error">' + esc(error) + "</p>" : ""); return; }
    if (view === "report") { app.innerHTML = reportView() + (error ? '<p class="error">' + esc(error) + "</p>" : ""); return; }
    if (view === "close") { app.innerHTML = jobView() + (error ? '<p class="error">' + esc(error) + "</p>" : ""); return; }
    if (view === "home") {
      html += "<h1>" + esc(me.name_km || me.name_en || "") + "</h1>";
      html += '<p class="hint">' + esc(roles().map(function (role) { return ROLE_NAMES[role] || role; }).join(" · "));
      if (me.shift_km) { html += " · " + esc(T.shift) + " " + esc(me.shift_km); }
      html += "</p>";
      html += "<h2>" + esc(T.attendance) + '</h2><p class="hint">' + esc(T.attendance_hint) + "</p>";
      html += '<div class="row"><button class="big" data-act="check" data-value="IN">' + esc(T.check_in) +
        '</button><button class="big out" data-act="check" data-value="OUT">' + esc(T.check_out) + "</button></div>";
      if (note) { html += '<p class="hint">' + esc(note) + "</p>"; }
      html += '<div class="card"><h2>⚠ ' + esc(T.report) + '</h2><p class="hint">' + esc(T.report_hint) +
        '</p><button class="small" data-act="report">' + esc(T.report) + "</button></div>";
      if (roles().indexOf("TECHNICIAN") >= 0) {
        html += '<div class="card"><h2>✓ ' + esc(T.close) + " (" + ((me.jobs || []).length) + ')</h2><p class="hint">' +
          esc(T.close_hint) + '</p><button class="small" data-act="close">' + esc(T.close) + "</button></div>";
      }
      if (mayReadMeters()) {
        html += '<div class="card"><h2>⚡ ' + esc(T.meter) + '</h2><p class="hint">' + esc(T.meter_hint) +
          '</p><button class="small" data-act="meter">' + esc(T.meter) + "</button></div>";
      }
      if (mayScanCards()) {
        html += '<div class="card"><h2>▣ ' + esc(T.card) + '</h2><p class="hint">' + esc(T.card_hint) +
          '</p><button class="small" data-act="card">' + esc(T.scan_card) + "</button></div>";
      }
    } else {
      html += "<h1>" + esc(T.card) + "</h1>";
      html += '<div class="row">' + ["IN", "OUT"].map(function (mode) {
        return '<button class="choice' + (card.mode === mode ? " on" : "") + '" data-act="mode" data-value="' +
          mode + '">' + esc(mode === "IN" ? T.check_in : T.check_out) + "</button>";
      }).join("") + "</div>";
      html += "<h2>1. " + esc(T.scan_card) + "</h2>";
      html += card.code
        ? '<p class="scanned">' + esc(T.card_scanned) + '</p><button class="small" data-act="scan-card">' + esc(T.scan_again) + "</button>"
        : '<button class="small" data-act="scan-card">' + esc(T.scan_card) + "</button>";
      html += "<h2>2. " + esc(T.reason) + '</h2><div class="list">' + REASONS.map(function (reason) {
        return '<button class="choice' + (card.reason === reason ? " on" : "") + '" data-act="reason" data-value="' +
          reason + '">' + esc(T[reason]) + "</button>";
      }).join("") + "</div>";
      if (card.reason === "OTHER") {
        html += '<textarea id="other" maxlength="' + MAX_REASON + '" placeholder="' + esc(T.other_text) + '">' +
          esc(card.text) + "</textarea>";
      }
      html += "<h2>3. " + esc(T.photo) + "</h2>";
      if (card.photo) { html += '<img class="photo" alt="" src="' + card.photo.url + '">'; }
      html += '<label class="small">' + esc(card.photo ? T.retake : T.take_photo) +
        '<input type="file" accept="image/*" capture="user" hidden></label>';
      html += '<button class="main" data-act="save"' + (cardReady() && !busy ? "" : " disabled") + ">" +
        esc(busy ? T.sending : T.save) + "</button>";
      html += '<button class="small" style="margin-top:12px" data-act="home">' + esc(T.back) + "</button>";
    }
    if (error) { html += '<p class="error">' + esc(error) + "</p>"; }
    app.innerHTML = html;
  }

  function scan(text, done) {
    if (!tg || !tg.showScanQrPopup) { error = T.old_telegram; render(); return; }
    tg.showScanQrPopup({ text: text }, function (found) {
      if (typeof found === "string" && found) { done(found.slice(0, 200)); return true; }
      return false;
    });
  }

  // The phone's place: Telegram's location access (Bot API 8.0). An older Telegram has none,
  // so the scan is saved and marked for the Manager to check.
  function where(done) {
    var manager = tg && tg.LocationManager;
    if (!manager || !manager.init) { done({ status: "NOT_FOUND" }); return; }
    function ask() {
      if (!manager.isLocationAvailable) { locationOff(manager); return; }
      note = T.finding; render();
      manager.getLocation(function (place) {
        note = "";
        if (!place) { locationOff(manager); return; }
        done({ status: "OK", latitude: place.latitude, longitude: place.longitude });
      });
    }
    if (manager.isInited) { ask(); } else { manager.init(ask); }
  }
  function locationOff(manager) {
    error = T.location_off; render();
    var button = document.createElement("button");
    button.className = "small";
    button.textContent = T.open_settings;
    button.addEventListener("click", function () { manager.openSettings(); });
    app.appendChild(button);
  }

  function post(form, photos) {
    busy = true; error = ""; render();
    return fetch("/form/staff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ init_data: tg ? tg.initData : "", form: form, photos: photos || [] })
    }).then(function (answer) {
      busy = false;
      if (answer.ok) {
        app.innerHTML = '<p class="done">✅ ' + esc(T.sent) + "</p>";
        if (tg) { setTimeout(function () { tg.close(); }, 1500); }
        return;
      }
      error = answer.status === 403 ? T.not_linked : answer.status === 429 ? T.too_many : T.failed;
      render();
    }).catch(function () { busy = false; error = T.failed; render(); });
  }

  function check(mode) {
    error = "";
    where(function (place) {
      scan(T.scan_place, function (code) {
        post({ type: "CHECK", mode: mode, qr: code, location: place, phone_time: new Date().toISOString() });
      });
    });
  }

  function shrink(file) {
    return new Promise(function (resolve) {
      var url = URL.createObjectURL(file);
      var image = new Image();
      image.onload = function () {
        var scale = Math.min(1, PHOTO_SIDE / Math.max(image.width, image.height));
        var canvas = document.createElement("canvas");
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (blob) {
          resolve(blob ? { blob: blob, url: URL.createObjectURL(blob) } : null);
        }, "image/jpeg", 0.85);
      };
      image.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      image.src = url;
    });
  }
  function base64(blob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result).split(",")[1] || ""); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function voiceType() {
    var kinds = ["audio/ogg;codecs=opus", "audio/webm;codecs=opus", "audio/mp4", "audio/webm"];
    if (!window.MediaRecorder) { return null; }
    for (var i = 0; i < kinds.length; i += 1) {
      if (MediaRecorder.isTypeSupported(kinds[i])) { return kinds[i]; }
    }
    return "";
  }
  function startVoice() {
    var type = voiceType();
    if (type === null || !navigator.mediaDevices) { error = T.no_mic; render(); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
      var chunks = [];
      recorder = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
      recorder.ondataavailable = function (event) { if (event.data.size) { chunks.push(event.data); } };
      recorder.onstop = function () {
        stream.getTracks().forEach(function (track) { track.stop(); });
        clearInterval(recordTimer);
        var mime = (recorder.mimeType || type || "audio/webm").split(";")[0];
        var seconds = Math.min(MAX_VOICE_SECONDS, Math.max(1, Math.round((Date.now() - recordStart) / 1000)));
        rep.voice = { blob: new Blob(chunks, { type: mime }), type: mime, seconds: seconds };
        recorder = null;
        render();
      };
      recordStart = Date.now();
      recorder.start();
      recordTimer = setInterval(function () {
        var seconds = Math.round((Date.now() - recordStart) / 1000);
        var label = document.getElementById("recording");
        if (label) { label.textContent = T.recording + "0:" + String(seconds).padStart(2, "0"); }
        if (seconds >= MAX_VOICE_SECONDS) { stopVoice(); }
      }, 250);
      render();
    }).catch(function () { error = T.no_mic; render(); });
  }
  function stopVoice() { if (recorder && recorder.state !== "inactive") { recorder.stop(); } }

  function files(list) {
    return Promise.all(list.map(function (entry) {
      return base64(entry.blob).then(function (encoded) {
        var file = { content_type: entry.type || "image/jpeg", data: encoded };
        if (entry.seconds) { file.duration = entry.seconds; }
        return file;
      });
    }));
  }
  function sendReport() {
    if (!reportReady() || busy) { return; }
    var form = { type: "REPORT", kind: rep.kind, problem_type_id: rep.type,
      description: rep.text.trim().slice(0, MAX_TEXT) || null };
    if (rep.kind === "UNIT") { form.unit_id = rep.unit; } else {
      form.problem_place_id = rep.place;
      form.floor = rep.floor.trim().slice(0, 20) || null;
      if (rep.same) { form.same_as = rep.same; }
    }
    busy = true; render();
    files(rep.photos.concat(rep.voice ? [rep.voice] : [])).then(function (sent) {
      busy = false;
      return post(form, sent);
    }).catch(function () { busy = false; error = T.failed; render(); });
  }
  function sendJob() {
    if (!jobReady() || busy) { return; }
    var form = { type: "CLOSE", report_id: job.id, after_photos: job.after.length, cost: job.cost };
    if (job.cost === "PAID") {
      var money = jobCost();
      form.parts_usd_cents = money.parts;
      form.outside_usd_cents = money.outside;
    }
    busy = true; render();
    files(job.after.concat(job.cost === "PAID" ? job.receipts : [])).then(function (sent) {
      busy = false;
      return post(form, sent);
    }).catch(function () { busy = false; error = T.failed; render(); });
  }

  function sendReadings() {
    if (!meterReady() || busy) { return; }
    var rows = [];
    meters().forEach(function (row) {
      var value = typed(row.id), entry = { unit_id: row.id, electricity: null, water: null }, any = false;
      if (row.e && readingValue(value.e) !== "") { entry.electricity = readingValue(value.e); any = true; }
      if (row.w && readingValue(value.w) !== "") { entry.water = readingValue(value.w); any = true; }
      if (any) { rows.push(entry); }
    });
    post({ type: "METER", readings: rows }, []);
  }
  function sendMeterCheck() {
    if (!mcReady() || busy) { return; }
    var form = { type: "METER_CHECK", unit_id: meters()[mc.index].id, meter: mc.meter, problem: mc.problem,
      note: mc.note.trim().slice(0, MAX_NOTE) || null };
    busy = true; render();
    files(mc.photos).then(function (sent) {
      busy = false;
      return post(form, sent);
    }).catch(function () { busy = false; error = T.failed; render(); });
  }

  function saveCard() {
    if (!cardReady() || busy) { return; }
    base64(card.photo.blob).then(function (encoded) {
      var form = { type: "CARD", mode: card.mode, card: card.code, reason: card.reason };
      if (card.reason === "OTHER") { form.reason_text = card.text.trim().slice(0, MAX_REASON); }
      return post(form, [{ content_type: "image/jpeg", data: encoded }]);
    }).catch(function () { busy = false; error = T.failed; render(); });
  }

  app.addEventListener("click", function (event) {
    var target = event.target.closest("[data-act]");
    if (!target || busy) { return; }
    var act = target.getAttribute("data-act"), value = target.getAttribute("data-value");
    if (act === "check") { check(value); return; }
    if (act === "report") { view = "report"; rep = newReport(); }
    if (act === "close") { view = "close"; job = newJob(); }
    if (act === "meter") { view = "meter"; }
    if (act === "metercheck") {
      var row = meters()[Number(value)];
      mc = { index: Number(value), meter: row && row.e && !row.w ? "ELECTRICITY" : row && row.w && !row.e ? "WATER" : "",
        problem: "", photos: [], note: "" };
      view = "metercheck";
    }
    if (act === "meter-back") { view = "meter"; }
    if (act === "mc-meter") { mc.meter = value; }
    if (act === "mc-problem") { mc.problem = value; }
    if (act === "kind") { rep.kind = value; rep.unit = ""; rep.place = ""; rep.same = null; rep.decided = false; }
    if (act === "place") { rep.place = value; rep.same = null; rep.decided = false; }
    if (act === "type") { rep.type = value; }
    if (act === "same") { rep.same = value || null; rep.decided = true; }
    if (act === "voice-start") { startVoice(); return; }
    if (act === "voice-stop") { stopVoice(); return; }
    if (act === "voice-remove") { rep.voice = null; }
    if (act === "job") { job.id = value; }
    if (act === "cost") { job.cost = value; }
    if (act === "drop-photo") {
      var parts = value.split(":"), list = parts[0] === "report" ? rep.photos : parts[0] === "after" ? job.after :
        parts[0] === "mc" ? mc.photos : job.receipts;
      list.splice(Number(parts[1]), 1);
    }
    if (act === "send") {
      if (view === "report") { sendReport(); } else if (view === "meter") { sendReadings(); }
      else if (view === "metercheck") { sendMeterCheck(); } else { sendJob(); }
      return;
    }
    if (act === "card") { view = "card"; card = { mode: "IN", code: "", reason: "", text: "", photo: null }; }
    if (act === "home") { view = "home"; }
    if (act === "mode") { card.mode = value; }
    if (act === "reason") { card.reason = value; }
    if (act === "scan-card") { scan(T.scan_card, function (code) { card.code = code; render(); }); return; }
    if (act === "save") { saveCard(); return; }
    error = ""; render();
  });
  app.addEventListener("input", function (event) {
    var id = event.target.id, value = event.target.value;
    var cell = /^m-(e|w)-(\d+)$/.exec(id || "");
    if (cell) {
      typed(meters()[Number(cell[2])].id)[cell[1]] = value;
      refreshMeterRow(Number(cell[2]));
      var ready = app.querySelector('[data-act="send"]');
      if (ready) { ready.disabled = busy || !meterReady(); }
      return;
    }
    if (id === "mcnote") {
      mc.note = value;
      var sendCheck = app.querySelector('[data-act="send"]');
      if (sendCheck) { sendCheck.disabled = busy || !mcReady(); }
      return;
    }
    if (id === "text" || id === "floor" || id === "parts" || id === "outside") {
      if (id === "text") { rep.text = value; }
      if (id === "floor") { rep.floor = value; }
      if (id === "parts") { job.parts = value; }
      if (id === "outside") { job.outside = value; }
      var send = app.querySelector('[data-act="send"]');
      if (send) { send.disabled = busy || !(view === "report" ? reportReady() : jobReady()); }
      return;
    }
    if (event.target.id === "other") {
      card.text = event.target.value;
      var save = app.querySelector('[data-act="save"]');
      if (save) { save.disabled = !cardReady(); }
    }
  });
  app.addEventListener("change", function (event) {
    if (event.target.id === "unit") { rep.unit = event.target.value; render(); return; }
    if (event.target.id === "parts" || event.target.id === "outside") { render(); return; }
    var file = event.target.files && event.target.files[0];
    if (!file) { return; }
    var target = event.target.getAttribute("data-photo");
    shrink(file).then(function (photo) {
      if (photo) {
        photo.type = "image/jpeg";
        if (target === "report") { rep.photos.push(photo); }
        else if (target === "after") { job.after.push(photo); }
        else if (target === "receipt") { job.receipts.push(photo); }
        else if (target === "mc") { mc.photos.push(photo); }
        else { card.photo = photo; }
      }
      render();
    });
  });

  if (tg) { tg.ready(); tg.expand(); }
  fetch("/form/staff/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ init_data: tg ? tg.initData : "" })
  }).then(function (answer) {
    if (answer.status === 403) { throw new Error("not_linked"); }
    if (!answer.ok) { throw new Error("failed"); }
    return answer.json();
  }).then(function (body) {
    if (!body.mine) { throw new Error("not_linked"); }
    me = body.mine;
    choices = body.choices || {};
    render();
  }).catch(function (problem) {
    app.innerHTML = '<p class="error">' + esc(problem.message === "not_linked" ? T.not_linked : T.failed) + "</p>";
  });
})();
</script>
</body>
</html>
`;

export function staffAppPage(): string {
  return PAGE;
}
