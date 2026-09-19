"use strict";

/*
  TOPIK I Reading - R5-4 FIX
  Teacher-only current-position display.
  Student answer-count behavior is intentionally untouched.
*/
(function () {
  const VERSION = "reading-teacher-progress-r5-4-fix-20260919";

  function bridge() {
    return window.TOPIK1ReadingBridge || null;
  }

  function isTeacher() {
    try {
      return Boolean(bridge()?.isTeacher?.());
    } catch (error) {
      return false;
    }
  }

  function updateTeacherProgress() {
    if (!isTeacher()) return;

    const testScreen = document.getElementById("testScreen");
    if (!testScreen || testScreen.classList.contains("hidden")) return;

    const currentIndex = Number(bridge()?.getCurrentIndex?.());
    if (!Number.isFinite(currentIndex) || currentIndex < 0) return;

    let total = 0;
    try {
      if (typeof questions !== "undefined" && Array.isArray(questions)) {
        total = questions.length;
      }
    } catch (error) {}

    if (!total) return;

    const current = Math.min(total, currentIndex + 1);
    const answerStatus = document.getElementById("answerStatusText");
    if (answerStatus) {
      answerStatus.textContent = `${current} / ${total}`;
      answerStatus.title = "교사 화면: 현재 문항 위치 / 전체 문항";
    }
  }

  document.addEventListener("click", function () {
    window.setTimeout(updateTeacherProgress, 0);
    window.setTimeout(updateTeacherProgress, 40);
  }, true);

  window.addEventListener("pageshow", updateTeacherProgress);
  window.addEventListener("focus", updateTeacherProgress);

  window.setInterval(updateTeacherProgress, 250);

  window.TOPIK1ReadingTeacherProgress = {
    version: VERSION,
    refresh: updateTeacherProgress
  };
})();
