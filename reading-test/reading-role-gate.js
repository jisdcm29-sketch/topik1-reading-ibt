"use strict";

/*
  TOPIK I Reading - STEP R3-2 teacher/student role gate.
  Teacher phone: 12345678

  Safety
  - reading-test.js remains untouched.
  - Teacher-only actions are checked again in JavaScript, not only hidden by CSS.
  - The same role API will later gate teacher-only translation/analysis.
*/
(function () {
  const VERSION = "step-r3-4-20260919";
  const TEACHER_PHONE = "12345678";
  const ACTIVE_PHONE_KEY = "topik1-reading-active-phone";
  const CONTROL_ID = "topik1ReadingTeacherTimerControl";
  const BUTTON_ID = "topik1ReadingTeacherTimerPauseButton";
  const STYLE_ID = "topik1ReadingTeacherControlStyle";

  let timerPausedByTeacher = false;

  function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function getStartPhone() {
    return normalizePhone(document.getElementById("studentPhoneInput")?.value || "");
  }

  function rememberPhoneFromLogin() {
    const phone = getStartPhone();
    if (!phone) return "";
    try { sessionStorage.setItem(ACTIVE_PHONE_KEY, phone); } catch (error) { /* ignore */ }
    return phone;
  }

  function currentPhone() {
    const inputPhone = getStartPhone();
    if (inputPhone) return inputPhone;

    try {
      const saved = normalizePhone(sessionStorage.getItem(ACTIVE_PHONE_KEY) || "");
      if (saved) return saved;
    } catch (error) {
      // Fall through.
    }

    return normalizePhone(document.getElementById("studentPhoneDisplay")?.textContent || "");
  }

  function isTeacher() {
    return currentPhone() === TEACHER_PHONE;
  }

  function testVisible() {
    const screen = document.getElementById("testScreen");
    return Boolean(screen && !screen.classList.contains("hidden"));
  }

  function practiceApi() {
    return window.TOPIK1ReadingPracticeControl || null;
  }

  function isUnlimitedTimer() {
    try {
      return Boolean(practiceApi()?.isUnlimitedActive?.());
    } catch (error) {
      return false;
    }
  }

  function callStopTimer() {
    try {
      if (typeof window.stopTimer === "function") {
        window.stopTimer();
        return true;
      }
    } catch (error) { /* ignore */ }

    try {
      if (typeof stopTimer === "function") {
        stopTimer();
        return true;
      }
    } catch (error) { /* ignore */ }

    return false;
  }

  function callStartTimer() {
    try {
      if (typeof window.startTimer === "function") {
        window.startTimer();
        return true;
      }
    } catch (error) { /* ignore */ }

    try {
      if (typeof startTimer === "function") {
        startTimer();
        return true;
      }
    } catch (error) { /* ignore */ }

    return false;
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #timerCard.reading-teacher-timer-enabled {
        display: grid !important;
        grid-template-columns: minmax(0, 1fr) auto !important;
        grid-template-areas: "label time" "control control" !important;
        column-gap: 10px !important;
        row-gap: 5px !important;
        align-items: center !important;
        justify-content: stretch !important;
        min-width: 255px !important;
        padding: 7px 10px !important;
        background: #ffffff !important;
        color: #0877f2 !important;
      }
      #timerCard.reading-teacher-timer-enabled > span:first-child {
        grid-area: label !important;
        color: #0877f2 !important;
        white-space: nowrap !important;
      }
      #timerCard.reading-teacher-timer-enabled #timerDisplay {
        grid-area: time !important;
        color: #1f2937 !important;
        white-space: nowrap !important;
      }
      #${CONTROL_ID} {
        grid-area: control !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        width: 100% !important;
      }
      #${BUTTON_ID} {
        width: 100% !important;
        min-height: 29px !important;
        padding: 5px 12px !important;
        border: 1.5px solid #0877f2 !important;
        border-radius: 8px !important;
        background: #eef6ff !important;
        color: #0b5fc7 !important;
        font: inherit !important;
        font-size: 12px !important;
        line-height: 1 !important;
        font-weight: 900 !important;
        cursor: pointer !important;
        box-shadow: 0 2px 7px rgba(8,119,242,.10) !important;
      }
      #${BUTTON_ID}:hover {
        background: #dcecff !important;
      }
      #${BUTTON_ID}[aria-pressed="true"] {
        background: #fff3d9 !important;
        border-color: #e59b18 !important;
        color: #8b5a00 !important;
        box-shadow: 0 2px 7px rgba(229,155,24,.14) !important;
      }
      body.topik1-reading-student-mode #${CONTROL_ID} { display: none !important; }
      #timerCard.reading-practice-unlimited {
        min-width: 210px !important;
        background: #effcf6 !important;
        color: #087a4a !important;
        border: 1px solid #61b991 !important;
      }
      #timerCard.reading-practice-unlimited #timerDisplay { color: #087a4a !important; }
    `;
    document.head.appendChild(style);
  }

  function updateTimerLabel() {
    const timerCard = document.getElementById("timerCard");
    if (!timerCard || isUnlimitedTimer()) return;

    const label = timerCard.querySelector("span:first-child");
    if (!label) return;

    label.textContent = timerPausedByTeacher
      ? "◷ 남은 시험 시간 · 정지"
      : "◷ 남은 시험 시간";
  }

  function updateButton() {
    const button = document.getElementById(BUTTON_ID);
    if (!button) return;

    button.textContent = timerPausedByTeacher ? "시간 계속" : "시간 정지";
    button.setAttribute("aria-pressed", timerPausedByTeacher ? "true" : "false");
  }

  function removeTeacherControl(options) {
    const keepPauseState = Boolean(options && options.keepPauseState);
    document.getElementById(CONTROL_ID)?.remove();
    document.getElementById("timerCard")?.classList.remove("reading-teacher-timer-enabled");

    if (!keepPauseState) {
      timerPausedByTeacher = false;
      updateTimerLabel();
    }
  }

  function toggleTeacherTimer() {
    // Code-level role guard.
    if (!testVisible() || !isTeacher() || isUnlimitedTimer()) return;

    if (timerPausedByTeacher) {
      if (callStartTimer()) timerPausedByTeacher = false;
    } else {
      if (callStopTimer()) timerPausedByTeacher = true;
    }

    updateTimerLabel();
    updateButton();
  }

  function ensureTeacherControl() {
    if (!testVisible() || !isTeacher() || isUnlimitedTimer()) {
      removeTeacherControl({ keepPauseState: isUnlimitedTimer() });
      return;
    }

    installStyle();

    const timerCard = document.getElementById("timerCard");
    if (!timerCard) return;
    timerCard.classList.add("reading-teacher-timer-enabled");

    let control = document.getElementById(CONTROL_ID);
    if (!control) {
      control = document.createElement("div");
      control.id = CONTROL_ID;
      control.setAttribute("aria-label", "교사용 시험 시간 제어");

      const button = document.createElement("button");
      button.id = BUTTON_ID;
      button.type = "button";
      button.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        toggleTeacherTimer();
      });

      control.appendChild(button);
      timerCard.appendChild(control);
    }

    updateTimerLabel();
    updateButton();
  }

  function applyRole() {
    const body = document.body;
    if (!body) return;

    const teacher = isTeacher();
    body.classList.toggle("topik1-reading-login-teacher", teacher);
    body.classList.toggle("topik1-reading-login-student", Boolean(currentPhone()) && !teacher);

    if (!testVisible()) {
      body.classList.remove("topik1-reading-teacher-mode", "topik1-reading-student-mode");
      removeTeacherControl();
      try { practiceApi()?.refresh?.(); } catch (error) { /* ignore */ }
      return;
    }

    body.classList.toggle("topik1-reading-teacher-mode", teacher);
    body.classList.toggle("topik1-reading-student-mode", !teacher);

    if (teacher) ensureTeacherControl();
    else removeTeacherControl();
  }

  function init() {
    installStyle();

    const startButton = document.getElementById("startButton");
    if (startButton) {
      startButton.addEventListener("click", function () {
        rememberPhoneFromLogin();
        timerPausedByTeacher = false;
        window.setTimeout(applyRole, 0);
        window.setTimeout(applyRole, 60);
        window.setTimeout(applyRole, 150);
        window.setTimeout(applyRole, 350);
        window.setTimeout(applyRole, 800);
      }, true);
    }

    const phoneInput = document.getElementById("studentPhoneInput");
    if (phoneInput) {
      ["input", "change", "keyup", "blur"].forEach(function (eventName) {
        phoneInput.addEventListener(eventName, function () {
          applyRole();
        });
      });
    }

    const testScreen = document.getElementById("testScreen");
    if (testScreen && window.MutationObserver) {
      const observer = new MutationObserver(applyRole);
      observer.observe(testScreen, { attributes: true, attributeFilter: ["class"] });
    }

    window.addEventListener("pageshow", applyRole);
    window.addEventListener("focus", applyRole);

    // Existing reading scripts redraw navigation and timer UI dynamically.
    // Re-assert the teacher control while the test screen is visible so the
    // button cannot disappear after a render/update cycle.
    window.setInterval(function () {
      if (testVisible()) applyRole();
    }, 300);

    window.TOPIK1ReadingRoleGate = {
      version: VERSION,
      teacherPhone: TEACHER_PHONE,
      getPhone: currentPhone,
      isTeacher,
      apply: applyRole,
      pauseTimer: function () {
        if (!testVisible() || !isTeacher() || isUnlimitedTimer()) return false;
        if (!timerPausedByTeacher && callStopTimer()) {
          timerPausedByTeacher = true;
          updateTimerLabel();
          updateButton();
          return true;
        }
        return false;
      },
      resumeTimer: function () {
        if (!testVisible() || !isTeacher() || isUnlimitedTimer()) return false;
        if (timerPausedByTeacher && callStartTimer()) {
          timerPausedByTeacher = false;
          updateTimerLabel();
          updateButton();
          return true;
        }
        return false;
      },
      isTimerPausedByTeacher: function () { return Boolean(timerPausedByTeacher); }
    };

    applyRole();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
