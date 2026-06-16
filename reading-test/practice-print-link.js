"use strict";

/*
  TOPIK I Reading Practice Print Link
  version: step46-link-v1

  역할:
  - reading-test/index.html 인증 화면에 교사용 문제지 출력 버튼만 추가한다.
  - reading-test.js, reading-diagnosis.js와 함수명을 공유하지 않는다.
  - 시험 시작, 인증, 이름/전화번호 입력, 시험지 선택 로직을 변경하지 않는다.
*/

(function () {
  const LINK_BOX_ID = "topik1PracticePrintLinkBox";
  const PRACTICE_PRINT_URL = "../practice-print/index.html?v=from_reading_auth";

  function createLinkBox() {
    const box = document.createElement("div");
    box.id = LINK_BOX_ID;
    box.style.margin = "12px 0 0";
    box.style.padding = "12px";
    box.style.border = "1px solid #b9d8ff";
    box.style.borderRadius = "12px";
    box.style.background = "#f8fbff";
    box.style.textAlign = "center";

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "교사용 문제지 출력";
    button.style.width = "100%";
    button.style.minHeight = "42px";
    button.style.border = "2px solid #0877f2";
    button.style.borderRadius = "10px";
    button.style.background = "#ffffff";
    button.style.color = "#0877f2";
    button.style.fontWeight = "900";
    button.style.fontSize = "15px";
    button.style.cursor = "pointer";

    button.addEventListener("click", function () {
      window.location.href = PRACTICE_PRINT_URL;
    });

    const note = document.createElement("div");
    note.textContent = "교사용 유형별 문제지와 정답표를 PDF로 인쇄 / 저장합니다.";
    note.style.marginTop = "7px";
    note.style.color = "#5f6368";
    note.style.fontSize = "12px";
    note.style.lineHeight = "1.45";

    box.appendChild(button);
    box.appendChild(note);

    return box;
  }

  function installPracticePrintLink() {
    if (document.getElementById(LINK_BOX_ID)) {
      return;
    }

    const examSelectBox = document.getElementById("examSelectBox");
    const startButton = document.getElementById("startButton");
    const startScreen = document.getElementById("startScreen");

    if (!startScreen) {
      return;
    }

    const linkBox = createLinkBox();

    if (examSelectBox && examSelectBox.parentNode) {
      examSelectBox.insertAdjacentElement("afterend", linkBox);
      return;
    }

    if (startButton && startButton.parentNode) {
      startButton.insertAdjacentElement("beforebegin", linkBox);
      return;
    }

    startScreen.appendChild(linkBox);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installPracticePrintLink);
  } else {
    installPracticePrintLink();
  }
})();
