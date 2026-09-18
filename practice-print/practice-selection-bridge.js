"use strict";

/*
  TOPIK I Reading - STEP R3-2 selected-practice handout bridge.
  Applies question-practice selections passed from reading-test to the existing
  practice-print tool without changing practice-print.js.
*/
(function () {
  const params = new URLSearchParams(window.location.search);
  if (params.get("from") !== "question-practice") return;

  const start = Math.max(31, Math.min(70, Number(params.get("start")) || 31));
  const end = Math.max(31, Math.min(70, Number(params.get("end")) || start));
  const rounds = String(params.get("rounds") || "")
    .split(",")
    .map(function (value) { return value.trim(); })
    .filter(Boolean);
  const typeLabel = String(params.get("type_label") || `${start}~${end}`).trim();
  const studentMode = params.get("student") === "1";
  const auto = params.get("auto") === "1";

  let attempts = 0;
  let applied = false;

  function $(selector) {
    return document.querySelector(selector);
  }

  function ensureStudentModeStyle() {
    if (!studentMode || $("#readingPracticeSelectionBridgeStyle")) return;

    const style = document.createElement("style");
    style.id = "readingPracticeSelectionBridgeStyle";
    style.textContent = `
      body.reading-selected-handout .top-title::after {
        content: " · 선택 문항 학생용 유인물";
      }
      body.reading-selected-handout #printWithAnswerButton,
      body.reading-selected-handout #printAnswerOnlyButton {
        display: none !important;
      }
      body.reading-selected-handout #printStudentButton {
        border-color: #e4a11b !important;
        background: #fff7df !important;
        color: #8b5a00 !important;
      }
      body.reading-selected-handout #statusBox {
        border-color: #a9e2c2 !important;
        background: #eafaf1 !important;
        color: #08773d !important;
      }
    `;
    document.head.appendChild(style);
    document.body.classList.add("reading-selected-handout");
  }

  function readyToApply() {
    return Boolean(
      $("#startNumberInput") &&
      $("#endNumberInput") &&
      $("#generatePreviewButton") &&
      document.querySelectorAll(".round-checkbox").length > 0
    );
  }

  function setRoundSelection() {
    const checkboxes = Array.from(document.querySelectorAll(".round-checkbox"));
    if (!checkboxes.length) return false;

    const roundSet = new Set(rounds);
    checkboxes.forEach(function (checkbox) {
      checkbox.checked = roundSet.size ? roundSet.has(String(checkbox.value || "").trim()) : true;
    });

    return true;
  }

  function applySelection() {
    if (applied || !readyToApply()) return false;

    const startInput = $("#startNumberInput");
    const endInput = $("#endNumberInput");
    const countInput = $("#questionCountInput");
    const duplicateInput = $("#allowDuplicateInput");
    const sourceInfo = $("#showSourceInfoInput");
    const sourceOrder = document.querySelector('input[name="printOrder"][value="source"]');
    const generateButton = $("#generatePreviewButton");

    startInput.value = String(Math.min(start, end));
    endInput.value = String(Math.max(start, end));
    if (countInput) countInput.value = "0";
    if (duplicateInput) duplicateInput.checked = false;
    if (sourceInfo) sourceInfo.checked = !studentMode;
    if (sourceOrder) sourceOrder.checked = true;

    setRoundSelection();
    ensureStudentModeStyle();

    if (generateButton) {
      generateButton.click();
    }

    window.setTimeout(function () {
      const title = $("#printTitle");
      if (title && studentMode) {
        title.textContent = `TOPIK I 읽기 ${typeLabel} 연습`;
      }

      const status = $("#statusBox");
      if (status) {
        const roundText = rounds.length ? `${rounds.length}개 회차` : "선택 회차";
        status.textContent = `${typeLabel} · ${roundText} 선택이 자동 적용되었습니다.`;
      }
    }, 50);

    applied = true;
    return true;
  }

  function tick() {
    if (applySelection()) return;
    attempts += 1;
    if (attempts < 120) {
      window.setTimeout(tick, 100);
    }
  }

  function init() {
    ensureStudentModeStyle();
    if (auto) tick();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
