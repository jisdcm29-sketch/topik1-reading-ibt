"use strict";

/*
  TOPIK I Reading - STEP R3-2 practice dashboard controls.

  Goals
  - Match the current TOPIK I Listening first-screen workflow.
  - Add teacher-only question-practice total-time presets.
  - Show the selected practice summary in a green status bar.
  - Add a real "selected questions student handout" link to practice-print.
  - Keep reading-test.js untouched.
*/
(function () {
  const VERSION = "step-r3-5-20260919";
  const TEACHER_PHONE = "12345678";
  const TIMER_STORAGE_KEY = "topik1-reading-question-practice-timer-mode";
  const VALID_TIMER_MODES = new Set(["auto", "60", "90", "unlimited"]);

  const TIME_CONTROL_ID = "readingPracticeTimeControl";
  const HANDOUT_BUTTON_ID = "readingPracticeHandoutButton";
  const HANDOUT_STYLE_CLASS = "reading-practice-handout-button";

  const TYPE_INFO = {
    "topic-31-33": { start: 31, end: 33, short: "31~33 중심 화제", countPerRound: 3 },
    "blank-34-39": { start: 34, end: 39, short: "34~39 빈칸 채우기", countPerRound: 6 },
    "practical-40-42": { start: 40, end: 42, short: "40~42 실용문 세부 정보", countPerRound: 3 },
    "detail-43-45": { start: 43, end: 45, short: "43~45 세부 내용 파악", countPerRound: 3 },
    "main-46-48": { start: 46, end: 48, short: "46~48 중심 내용", countPerRound: 3 },
    "short-set-49-56": { start: 49, end: 56, short: "49~56 단문 종합 독해", countPerRound: 8 },
    "order-57-58": { start: 57, end: 58, short: "57~58 문장 순서", countPerRound: 2 },
    "long-set-59-70": { start: 59, end: 70, short: "59~70 장문 종합 독해", countPerRound: 12 }
  };

  let originalGetActiveTimeLimitSeconds = null;
  let originalStartTimer = null;
  let originalStopTimer = null;
  let timerHooksInstalled = false;
  let scheduled = false;

  function $(selector) {
    return document.querySelector(selector);
  }

  function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function roleApi() {
    return window.TOPIK1ReadingRoleGate || null;
  }

  function currentPhone() {
    try {
      const gatePhone = normalizePhone(roleApi()?.getPhone?.() || "");
      if (gatePhone) return gatePhone;
    } catch (error) {
      // Fall through to the visible login field.
    }

    return normalizePhone($("#studentPhoneInput")?.value || "");
  }

  function isTeacher() {
    try {
      if (roleApi() && typeof roleApi().isTeacher === "function") {
        return Boolean(roleApi().isTeacher());
      }
    } catch (error) {
      // Fall through to the phone comparison.
    }

    return currentPhone() === TEACHER_PHONE;
  }

  function readTimerMode() {
    try {
      const saved = String(localStorage.getItem(TIMER_STORAGE_KEY) || "auto");
      return VALID_TIMER_MODES.has(saved) ? saved : "auto";
    } catch (error) {
      return "auto";
    }
  }

  function saveTimerMode(mode) {
    const normalized = VALID_TIMER_MODES.has(String(mode || "")) ? String(mode) : "auto";
    try {
      localStorage.setItem(TIMER_STORAGE_KEY, normalized);
    } catch (error) {
      // Keep working for the current page when storage is unavailable.
    }
    return normalized;
  }

  function withRoundSpacing(text) {
    return String(text || "").replace(/실전\s*([A-O])/g, "실전 $1").trim();
  }

  function selectedRoundButtons() {
    return Array.from(
      document.querySelectorAll('.question-practice-round-button[aria-pressed="true"]')
    );
  }

  function inferRoundFromValue(value) {
    const text = String(value || "");
    const match = text.match(/(?:round-|reading-|leveltest-)?(\d{2,4})/i);
    return match ? match[1] : "";
  }

  function getSelectedRounds() {
    return selectedRoundButtons().map(function (button) {
      const value = String(button.getAttribute("data-practice-round-value") || "").trim();
      return {
        value,
        round: inferRoundFromValue(value),
        label: withRoundSpacing(button.textContent)
      };
    }).filter(function (item) {
      return Boolean(item.value);
    });
  }

  function getSelectedType() {
    const button = document.querySelector('.question-practice-type-button[aria-pressed="true"]');
    if (!button) return null;

    const key = String(button.getAttribute("data-practice-type-key") || "").trim();
    const info = TYPE_INFO[key];
    if (!info) return null;

    return {
      key,
      start: info.start,
      end: info.end,
      short: info.short,
      countPerRound: info.countPerRound,
      label: String(button.querySelector("div:first-child")?.textContent || button.textContent || info.short).trim()
    };
  }

  function getPracticeSelection() {
    const rounds = getSelectedRounds();
    const type = getSelectedType();
    return {
      rounds,
      type,
      ready: Boolean(type && rounds.length > 0),
      totalQuestions: type ? type.countPerRound * rounds.length : 0
    };
  }

  function makeRoundSummary(rounds) {
    const labels = rounds.map(function (item) { return item.label; }).filter(Boolean);
    if (labels.length <= 5) return labels.join(", ");
    return labels.slice(0, 4).join(", ") + ` 외 ${labels.length - 4}개`;
  }

  function ensureTimeControl() {
    const body = $("#questionPracticeBody");
    const roundList = $("#questionPracticeRoundList");
    if (!body || !roundList) return null;

    let control = $("#" + TIME_CONTROL_ID);

    if (!isTeacher()) {
      if (control) control.remove();
      return null;
    }

    if (!control) {
      control = document.createElement("div");
      control.id = TIME_CONTROL_ID;
      control.className = "reading-practice-time-control";
      control.setAttribute("aria-label", "문항 연습 전체 시간 선택");
      control.innerHTML = `
        <strong class="reading-practice-time-title">전체 시간</strong>
        <div class="reading-practice-time-buttons">
          <button type="button" data-reading-practice-time="auto">자동</button>
          <button type="button" data-reading-practice-time="60">60분</button>
          <button type="button" data-reading-practice-time="90">90분</button>
          <button type="button" data-reading-practice-time="unlimited">제한 없음</button>
        </div>
        <span class="reading-practice-time-note">문항 연습에만 적용</span>
      `;

      roundList.insertAdjacentElement("afterend", control);

      control.querySelectorAll("[data-reading-practice-time]").forEach(function (button) {
        button.addEventListener("click", function () {
          if (!isTeacher()) return;
          saveTimerMode(button.getAttribute("data-reading-practice-time"));
          updateTimeControl();
        });
      });
    }

    return control;
  }

  function updateTimeControl() {
    const control = ensureTimeControl();
    if (!control) return;

    const mode = readTimerMode();
    control.dataset.mode = mode;

    control.querySelectorAll("[data-reading-practice-time]").forEach(function (button) {
      const active = button.getAttribute("data-reading-practice-time") === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function ensureHandoutButton() {
    const body = $("#questionPracticeBody");
    const status = $("#questionPracticeStatusText");
    if (!body || !status) return null;

    let button = $("#" + HANDOUT_BUTTON_ID);
    if (!button) {
      button = document.createElement("button");
      button.id = HANDOUT_BUTTON_ID;
      button.className = HANDOUT_STYLE_CLASS;
      button.type = "button";
      button.disabled = true;
      button.textContent = "선택한 문항 학생용 유인물 출력";
      button.addEventListener("click", openSelectedHandout);
      status.insertAdjacentElement("afterend", button);
    }

    return button;
  }

  function updateStatusAndHandout() {
    const selection = getPracticeSelection();
    const status = $("#questionPracticeStatusText");
    const button = ensureHandoutButton();

    if (status) {
      status.dataset.r3Ready = selection.ready ? "true" : "false";

      if (selection.ready) {
        const roundSummary = makeRoundSummary(selection.rounds);
        status.textContent = `${roundSummary} ${selection.type.short} 연습 적용됨 (${selection.totalQuestions}문항)`;
      } else if (selection.rounds.length > 0 && !selection.type) {
        const roundSummary = makeRoundSummary(selection.rounds);
        status.textContent = `${roundSummary} 선택됨 · 대표 유형을 선택하세요.`;
      } else if (selection.type && selection.rounds.length === 0) {
        status.textContent = `${selection.type.short} 선택됨 · 연습 회차를 선택하세요.`;
      } else {
        status.textContent = "연습 회차와 대표 유형을 선택하세요.";
      }
    }

    if (button) {
      const teacher = isTeacher();
      button.hidden = !teacher;
      button.disabled = !teacher || !selection.ready;
      button.setAttribute("aria-disabled", button.disabled ? "true" : "false");

      if (selection.ready) {
        button.textContent = `선택한 문항 학생용 유인물 출력 (${selection.rounds.length}개 회차)`;
        button.title = `${selection.type.short} · ${selection.rounds.length}개 회차 · ${selection.totalQuestions}문항`;
      } else {
        button.textContent = "선택한 문항 학생용 유인물 출력";
        button.title = "연습 회차와 대표 유형을 먼저 선택하세요.";
      }
    }
  }

  function syncDashboardSelectionColors() {
    const examSelect = $("#examModeSelect");
    const value = String(examSelect?.value || "");
    const method = /random/i.test(value) ? "random" : "round";

    document.querySelectorAll(".exam-method-button").forEach(function (button) {
      const selected = button.getAttribute("data-exam-method") === method;
      button.dataset.r3Selected = selected ? "true" : "false";
    });

    document.querySelectorAll(".exam-detail-button").forEach(function (button) {
      const selected = String(button.getAttribute("data-exam-value") || "") === value;
      button.dataset.r3Selected = selected ? "true" : "false";
    });
  }

  function openSelectedHandout() {
    if (!isTeacher()) return;

    const selection = getPracticeSelection();
    if (!selection.ready) {
      alert("학생용 유인물로 출력할 연습 회차와 대표 유형을 먼저 선택하세요.");
      updateStatusAndHandout();
      return;
    }

    const params = new URLSearchParams();
    params.set("from", "question-practice");
    params.set("start", String(selection.type.start));
    params.set("end", String(selection.type.end));
    params.set("rounds", selection.rounds.map(function (item) { return item.round; }).filter(Boolean).join(","));
    params.set("type_label", selection.type.short);
    params.set("student", "1");
    params.set("auto", "1");
    params.set("v", VERSION);

    const url = `../practice-print/index.html?${params.toString()}`;
    const child = window.open(url, "_blank");

    if (child) {
      try { child.opener = null; } catch (error) { /* ignore */ }
    } else {
      window.location.href = url;
    }
  }

  function practiceIsSelected() {
    return getPracticeSelection().ready;
  }

  function activeTeacherTimerMode() {
    if (!isTeacher() || !practiceIsSelected()) return "auto";
    return readTimerMode();
  }

  function isUnlimitedActive() {
    return activeTeacherTimerMode() === "unlimited";
  }

  function markUnlimitedTimerUi(active) {
    const card = $("#timerCard");
    const display = $("#timerDisplay");
    if (!card || !display) return;

    card.classList.toggle("reading-practice-unlimited", Boolean(active));
    card.dataset.readingUnlimited = active ? "true" : "false";

    if (active) {
      display.textContent = "제한 없음";
      const label = card.querySelector("span:first-child");
      if (label) label.textContent = "◷ 수업용";
    }
  }

  function installTimerHooks() {
    if (timerHooksInstalled) return;

    let getTimeFn = typeof window.getActiveTimeLimitSeconds === "function"
      ? window.getActiveTimeLimitSeconds
      : null;
    let startFn = typeof window.startTimer === "function"
      ? window.startTimer
      : null;
    let stopFn = typeof window.stopTimer === "function"
      ? window.stopTimer
      : null;

    try {
      if (!getTimeFn && typeof getActiveTimeLimitSeconds === "function") getTimeFn = getActiveTimeLimitSeconds;
      if (!startFn && typeof startTimer === "function") startFn = startTimer;
      if (!stopFn && typeof stopTimer === "function") stopFn = stopTimer;
    } catch (error) {
      // Keep the window-based functions when global lexical lookup is unavailable.
    }

    if (!getTimeFn || !startFn || !stopFn) return;

    originalGetActiveTimeLimitSeconds = getTimeFn;
    originalStartTimer = startFn;
    originalStopTimer = stopFn;

    const wrappedGetTime = function () {
      const mode = activeTeacherTimerMode();
      if (mode === "60") return 60 * 60;
      if (mode === "90") return 90 * 60;
      if (mode === "unlimited") return 60 * 60;
      return originalGetActiveTimeLimitSeconds();
    };

    const wrappedStartTimer = function () {
      if (isUnlimitedActive()) {
        try { originalStopTimer(); } catch (error) { /* ignore */ }
        markUnlimitedTimerUi(true);
        window.setTimeout(function () {
          try { window.TOPIK1ReadingRoleGate?.apply?.(); } catch (error) { /* ignore */ }
        }, 0);
        return;
      }

      markUnlimitedTimerUi(false);
      return originalStartTimer();
    };

    window.getActiveTimeLimitSeconds = wrappedGetTime;
    window.startTimer = wrappedStartTimer;

    try {
      getActiveTimeLimitSeconds = wrappedGetTime;
      startTimer = wrappedStartTimer;
    } catch (error) {
      // In normal browser scripts the global function binding is writable via window.
    }

    timerHooksInstalled = true;
  }

  function scheduleUpdate() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(function () {
      scheduled = false;
      installTimerHooks();
      ensureTimeControl();
      updateTimeControl();
      updateStatusAndHandout();
      syncDashboardSelectionColors();
    });
  }

  function installObservers() {
    const panel = $("#questionPracticePanel");
    if (panel && window.MutationObserver) {
      const observer = new MutationObserver(function () {
        scheduleUpdate();
      });
      observer.observe(panel, {
        childList: true,
        subtree: true
      });
    }

    const examBox = $("#examSelectBox");
    if (examBox && window.MutationObserver) {
      const examObserver = new MutationObserver(function () {
        scheduleUpdate();
      });
      examObserver.observe(examBox, {
        childList: true,
        subtree: true
      });
    }

    document.addEventListener("click", function (event) {
      const target = event.target?.closest?.(
        ".question-practice-round-button, .question-practice-type-button, #questionPracticeClearTypeButton, .exam-type-button, .exam-method-button, .exam-detail-button, #examDetailToggleButton"
      );
      if (!target) return;
      window.setTimeout(scheduleUpdate, 0);
      window.setTimeout(scheduleUpdate, 80);
    }, true);

    const phone = $("#studentPhoneInput");
    if (phone) {
      ["input", "change", "keyup", "blur"].forEach(function (eventName) {
        phone.addEventListener(eventName, scheduleUpdate);
      });
    }

    const startButton = $("#startButton");
    if (startButton) {
      startButton.addEventListener("click", function () {
        installTimerHooks();
        window.setTimeout(scheduleUpdate, 0);
        window.setTimeout(scheduleUpdate, 150);
      }, true);
    }

    window.addEventListener("pageshow", scheduleUpdate);
  }

  function init() {
    installTimerHooks();
    installObservers();
    scheduleUpdate();

    window.TOPIK1ReadingPracticeControl = {
      version: VERSION,
      getSelection: getPracticeSelection,
      getTimerMode: readTimerMode,
      setTimerMode: function (mode) {
        if (!isTeacher()) return readTimerMode();
        const saved = saveTimerMode(mode);
        scheduleUpdate();
        return saved;
      },
      isUnlimitedActive,
      isPracticeSelected: practiceIsSelected,
      isTeacher,
      refresh: scheduleUpdate
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
