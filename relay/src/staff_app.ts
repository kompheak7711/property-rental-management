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
// until all are given. The person's name comes back in the chat with the answer. The Khmer
// waits for the native-speaker check.

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
    sent: "បានផ្ញើហើយ។ លទ្ធផលនឹងមកក្នុងការជជែក ក្នុងរយៈពេលប្រហែលមួយនាទី។"
  };
  var REASONS = ["NO_PHONE", "PHONE_BROKEN", "PHONE_LOST", "PHONE_STOLEN", "OTHER"];
  var CARD_ROLES = { CARETAKER: true, AUTHORIZER: true };
  var ROLE_NAMES = { CLEANER: "អ្នកសម្អាត", TECHNICIAN: "អ្នកបច្ចេកទេស",
    CARETAKER: "អ្នកថែរក្សាអគារ", METER_READER: "អ្នកអានមីទ័រ", AUTHORIZER: "អ្នកអនុម័ត" };
  var PHOTO_SIDE = 1600, MAX_REASON = 300;

  var tg = window.Telegram && window.Telegram.WebApp;
  var app = document.getElementById("app");
  var me = null;
  var view = "home";
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

  function render() {
    var html = "";
    if (view === "home") {
      html += "<h1>" + esc(me.name_km || me.name_en || "") + "</h1>";
      html += '<p class="hint">' + esc(roles().map(function (role) { return ROLE_NAMES[role] || role; }).join(" · "));
      if (me.shift_km) { html += " · " + esc(T.shift) + " " + esc(me.shift_km); }
      html += "</p>";
      html += "<h2>" + esc(T.attendance) + '</h2><p class="hint">' + esc(T.attendance_hint) + "</p>";
      html += '<div class="row"><button class="big" data-act="check" data-value="IN">' + esc(T.check_in) +
        '</button><button class="big out" data-act="check" data-value="OUT">' + esc(T.check_out) + "</button></div>";
      if (note) { html += '<p class="hint">' + esc(note) + "</p>"; }
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
    if (act === "card") { view = "card"; card = { mode: "IN", code: "", reason: "", text: "", photo: null }; }
    if (act === "home") { view = "home"; }
    if (act === "mode") { card.mode = value; }
    if (act === "reason") { card.reason = value; }
    if (act === "scan-card") { scan(T.scan_card, function (code) { card.code = code; render(); }); return; }
    if (act === "save") { saveCard(); return; }
    error = ""; render();
  });
  app.addEventListener("input", function (event) {
    if (event.target.id === "other") {
      card.text = event.target.value;
      var save = app.querySelector('[data-act="save"]');
      if (save) { save.disabled = !cardReady(); }
    }
  });
  app.addEventListener("change", function (event) {
    var file = event.target.files && event.target.files[0];
    if (!file) { return; }
    shrink(file).then(function (photo) { if (photo) { card.photo = photo; } render(); });
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
