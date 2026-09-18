"use strict";

/*
  TOPIK I Reading - STEP R2-3 start-screen polish only.
  - Does not change test generation, scoring, diagnosis, or result logic.
  - Keeps the visible start-screen wording aligned with TOPIK I Listening.
*/
(function () {
  const START_SCREEN_ID = "startScreen";

  function withRoundSpacing(text) {
    return String(text || "").replace(/실전\s*([A-O])/g, "실전 $1");
  }

  function setTextIfChanged(element, value) {
    if (element && element.textContent !== value) {
      element.textContent = value;
    }
  }

  function updateStartScreenText() {
    const startScreen = document.getElementById(START_SCREEN_ID);
    if (!startScreen) {
      return;
    }

    const authMessage = document.getElementById("authMessage");
    if (authMessage) {
      const current = String(authMessage.textContent || "").trim();
      if (!current || current.includes("?") || current.includes("�")) {
        authMessage.textContent = "";
      }
    }

    startScreen.querySelectorAll(
      ".question-practice-round-button, .exam-detail-button, #currentExamLabel"
    ).forEach(function (element) {
      const spaced = withRoundSpacing(element.textContent);
      if (spaced !== element.textContent) {
        element.textContent = spaced;
      }
    });

    const currentLabelElement = document.getElementById("currentExamLabel");
    const detailToggleButton = document.getElementById("examDetailToggleButton");
    const helpText = document.getElementById("examModeHelpText");
    const currentLabel = withRoundSpacing(
      currentLabelElement ? currentLabelElement.textContent.trim() : ""
    );

    if (detailToggleButton && currentLabel) {
      setTextIfChanged(detailToggleButton, `시험지 선택 (${currentLabel})`);
    }

    if (helpText && currentLabel) {
      const particle = currentLabel === "랜덤" ? "이" : "가";
      setTextIfChanged(helpText, `${currentLabel}${particle} 선택되었습니다.`);
    }

    const printButton = document.querySelector("#topik1PracticePrintLinkBox > button");
    if (printButton) {
      setTextIfChanged(printButton, "읽기 교사용 문제지 출력 열기");
    }
  }

  function install() {
    updateStartScreenText();

    const startScreen = document.getElementById(START_SCREEN_ID);
    if (!startScreen) {
      return;
    }

    let scheduled = false;
    const observer = new MutationObserver(function () {
      if (scheduled) {
        return;
      }
      scheduled = true;
      window.requestAnimationFrame(function () {
        scheduled = false;
        updateStartScreenText();
      });
    });

    observer.observe(startScreen, {
      childList: true,
      subtree: true,
      characterData: true
    });

    document.addEventListener("click", function () {
      window.setTimeout(updateStartScreenText, 0);
      window.setTimeout(updateStartScreenText, 80);
    }, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install);
  } else {
    install();
  }
})();
