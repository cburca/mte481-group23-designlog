/**
 * Lightweight link-sharing gate for the Group 23 design log.
 *
 * WHAT THIS DOES: hides the page behind a passcode prompt so a casual visitor
 * who stumbles on the URL (or finds it via GitHub) can't read it without the
 * passcode your team shares with instructors and each other.
 *
 * WHAT THIS DOES NOT DO: provide real security. The page content is still
 * downloaded to the visitor's browser and the check happens in client-side
 * JavaScript, so anyone comfortable reading page source can bypass it. Do not
 * put anything here you wouldn't want a determined stranger to see.
 *
 * For genuine access control (only invited GitHub accounts can view it at
 * all), see the "Making the site actually private" section of README.md —
 * it takes about five minutes once you have GitHub Pro, which is free for
 * students via the GitHub Student Developer Pack.
 *
 * To change the passcode: pick a new one, generate its SHA-256 hex digest
 * (e.g. in a browser console: run
 *   crypto.subtle.digest('SHA-256', new TextEncoder().encode('your-new-code'))
 *     .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join('')))
 * ) and paste the result below as PASSCODE_HASH.
 */
(function () {
  // Default passcode is "mte481-group23" — change this before sharing the link.
  var PASSCODE_HASH = "dfe29f180309eac008ec3ec204f7a2f581e2de132a8f7e71204ebf1f76e43b7a";
  var STORAGE_KEY = "g23-log-unlocked";

  var gate = document.getElementById("access-gate");
  var body = document.body;
  if (!gate) return;

  function unlock() {
    body.classList.remove("gate-locked");
    gate.hidden = true;
  }

  function lock() {
    body.classList.add("gate-locked");
    gate.hidden = false;
    var input = document.getElementById("gate-input");
    if (input) input.focus();
  }

  async function sha256Hex(text) {
    var enc = new TextEncoder().encode(text);
    var digest = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(digest))
      .map(function (b) { return b.toString(16).padStart(2, "0"); })
      .join("");
  }

  if (sessionStorage.getItem(STORAGE_KEY) === "1") {
    unlock();
  } else {
    lock();
  }

  var form = document.getElementById("gate-form");
  var error = document.getElementById("gate-error");
  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      try {
        var value = (document.getElementById("gate-input").value || "").trim();
        var hash = await sha256Hex(value);
        if (hash === PASSCODE_HASH) {
          sessionStorage.setItem(STORAGE_KEY, "1");
          error.hidden = true;
          unlock();
        } else {
          error.hidden = false;
        }
      } catch (err) {
        console.error("Gate check failed:", err);
        error.textContent = "Something went wrong checking the passcode — see the browser console.";
        error.hidden = false;
      }
    });
  }
})();