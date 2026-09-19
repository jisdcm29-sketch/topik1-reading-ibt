"use strict";

/*
  TOPIK I Reading - R5-7 unified progress display
  Student and teacher both see:
  current question position / total questions.

  This module only updates the small top-right progress text.
  It does not modify answers, scoring, timer, navigation, Google Sheet logging,
  teacher analysis, or question data.
*/
(function () {
  const VERSION = "reading-progress-unified-r5-7-20260919";

  function bridge() {
    return window.TOPIK1ReadingBridge || null;
  }

  function updateProgress() {
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
      answerStatus.title = "현재 문항 위치 / 전체 문항";
    }
  }

  document.addEventListener("click", function () {
    window.setTimeout(updateProgress, 0);
    window.setTimeout(updateProgress, 40);
  }, true);

  window.addEventListener("pageshow", updateProgress);
  window.addEventListener("focus", updateProgress);

  window.setInterval(updateProgress, 250);

  window.TOPIK1ReadingTeacherProgress = {
    version: VERSION,
    refresh: updateProgress
  };

  window.TOPIK1ReadingProgress = window.TOPIK1ReadingTeacherProgress;
})();
