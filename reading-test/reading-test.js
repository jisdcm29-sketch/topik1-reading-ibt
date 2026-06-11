"use strict";

console.log("TOPIK I Reading loaded: v38-leveltest-wrong-review-step35-v1");

/*
  TOPIK I Reading IBT Simulation
  - 읽기 단독 시험 프로그램
  - 이름 + 전화번호 입력
  - 시험 모드 결과 화면
  - 31~70번 40문항
  - 공통 지문 2문항 구조: 49~50, 51~52, 53~54, 55~56, 59~60, 61~62, 63~64, 65~66, 67~68, 69~70
  - 빈칸 선택형: 선택지를 누르면 지문 안 빈칸에 선택 문장이 직접 삽입되어 표시됨
  - 문장 삽입 위치형: ㄱ/ㄴ/ㄷ/ㄹ 위치를 선택하면 보기 문장이 해당 위치에 삽입되어 표시됨
  - 문장 순서 배열형: 오른쪽 문장을 왼쪽 순서 칸으로 drag/drop 또는 클릭 배치
*/

const TEST_CONFIG = {
  testName: "TOPIK I Reading",
  testDisplayName: "TOPIK I Reading IBT Simulation",
  testLevel: "TOPIK I",
  section: "reading",
  timeLimitMinutes: 60,
  timeLimitSeconds: 60 * 60,
  scoreFullMark: 100,
  questionNumberStart: 31,
  questionNumberEnd: 70,
  expectedTotalQuestions: 40
};

const LEVEL_TEST_CONFIG = {
  examType: "leveltest",
  displayName: "TOPIK I 읽기 레벨테스트",
  questionCount: 20,
  timeLimitMinutes: 30,
  timeLimitSeconds: 30 * 60,
  defaultSlots: [31, 33, 34, 37, 40, 43, 46, 48, 49, 50, 57, 58, 59, 60, 63, 64, 67, 68, 69, 70]
};

const AUTO_DIAGNOSIS_STORAGE_KEY = "topik1_latest_reading_result";
const LEVEL_TEST_RESULT_STORAGE_KEY = "topik1_latest_leveltest_result";
const WRONG_REVIEW_QUESTION_NUMBERS_STORAGE_KEY = "topik1_wrong_review_question_numbers";
const WRONG_REVIEW_SOURCE_RESULT_STORAGE_KEY = "topik1_wrong_review_source_result";
const AUTO_DIAGNOSIS_URL = "../reading-diagnosis/index.html?auto=1";
const LEVEL_TEST_DIAGNOSIS_URL = "../reading-diagnosis/index.html?auto=1&mode=leveltest";

const EXAM_MANIFEST_URLS = [
  "./data/exam-manifest.json",
  "./exam-list.json"
];

let examManifest = null;
let examEntries = [];
let examManifestLoadPromise = null;

let currentRunMode = "normal";
let selectedExamType = "full";


const DEFAULT_READING_POINTS = {  31: 2, 32: 2, 33: 2,
  34: 2, 35: 2, 36: 2, 37: 3, 38: 3, 39: 2,
  40: 3, 41: 3, 42: 3,
  43: 3, 44: 2, 45: 3,
  46: 3, 47: 3, 48: 2,
  49: 2, 50: 2,
  51: 3, 52: 2,
  53: 2, 54: 3,
  55: 2, 56: 3,
  57: 3, 58: 2,
  59: 2, 60: 3,
  61: 2, 62: 2,
  63: 2, 64: 3,
  65: 2, 66: 3,
  67: 3, 68: 3,
  69: 3, 70: 3
};

function getQuestionPoints(questionNumber, rawPoints) {
  const parsed = Number(rawPoints);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return DEFAULT_READING_POINTS[Number(questionNumber)] || 0;
}

let questions = [];
let currentIndex = 0;
let answers = {};
let reviewMarks = {};
let sentenceOrderAnswers = {};
let selectedSentenceForOrder = null;

let studentName = "";
let studentPhone = "";
let startedAt = "";
let submittedAt = "";
let remainingSeconds = TEST_CONFIG.timeLimitSeconds;
let timerId = null;
let latestResult = null;
let latestResultText = "";

let latestExamGenerationOptions = {
  mode: "random",
  round: "",
  label: "랜덤 40문항 실전시험",
  exam_type: "full",
  question_count: TEST_CONFIG.expectedTotalQuestions,
  time_limit_minutes: TEST_CONFIG.timeLimitMinutes
};

const elements = {};
const INSERTED_HIGHLIGHT_CLASS = "inserted-answer-highlight";

function getInsertedAnswerHtml(text) {
  return `<span class="${INSERTED_HIGHLIGHT_CLASS}" data-inserted-answer="true" style="
    color:#0047b3 !important;
    -webkit-text-fill-color:#0047b3 !important;
    font-weight:900 !important;
    background:transparent !important;
    border:0 !important;
    box-shadow:none !important;
    padding:0 !important;
    margin:0 !important;
    display:inline !important;
    line-height:inherit !important;
    vertical-align:baseline !important;
  ">${escapeHtml(text)}</span>`;
}

function ensureInsertedAnswerHighlightedHtml(html, selectedText) {
  if (!selectedText || !html || html.includes(INSERTED_HIGHLIGHT_CLASS)) {
    return html;
  }

  const safeText = escapeHtml(selectedText);
  if (!safeText || !html.includes(safeText)) {
    return html;
  }

  return html.replace(safeText, getInsertedAnswerHtml(selectedText));
}


function getInsertedTargetTextsForQuestion(question) {
  const targets = [];

  function addTarget(text) {
    const value = String(text || "").trim();
    if (value && !targets.includes(value)) {
      targets.push(value);
    }
  }

  if (!question) {
    return targets;
  }

  if (question.type === "blank_choice" || isCommonPassageBlankChoice(question)) {
    const selectedOptionNumber = Number(answers[question.id]) || null;
    if (selectedOptionNumber && Array.isArray(question.options)) {
      addTarget(question.options[selectedOptionNumber - 1]);
    }
  }

  if (question.type === "sentence_insert") {
    const positionLabels = getInsertPositionLabels(question);
    const selectedOptionNumber = Number(answers[question.id]) || null;
    const selectedLabel = selectedOptionNumber ? positionLabels[selectedOptionNumber - 1] : "";
    if (selectedLabel) {
      addTarget(getInsertSentence(question));
    }
  }

  const linkedBlankQuestion = findLinkedCommonPassageBlankChoiceQuestion(question);
  if (linkedBlankQuestion) {
    const selectedOptionNumber = Number(answers[linkedBlankQuestion.id]) || null;
    if (selectedOptionNumber && Array.isArray(linkedBlankQuestion.options)) {
      addTarget(linkedBlankQuestion.options[selectedOptionNumber - 1]);
    }
  }

  const linkedInsertQuestion = findLinkedSentenceInsertQuestion(question);
  if (linkedInsertQuestion) {
    const positionLabels = getInsertPositionLabels(linkedInsertQuestion);
    const selectedOptionNumber = Number(answers[linkedInsertQuestion.id]) || null;
    const selectedLabel = selectedOptionNumber ? positionLabels[selectedOptionNumber - 1] : "";
    if (selectedLabel) {
      addTarget(getInsertSentence(linkedInsertQuestion));
    }
  }

  return targets;
}

function highlightInsertedAnswersInCurrentStage(question) {
  if (!elements.questionStage) {
    return;
  }

  const targets = getInsertedTargetTextsForQuestion(question);
  if (!targets.length) {
    return;
  }

  const passageContentElements = elements.questionStage.querySelectorAll(".passage-content, [data-passage-content='true']");
  passageContentElements.forEach(function (passageElement) {
    targets.forEach(function (targetText) {
      highlightPlainTextInsideElement(passageElement, targetText);
    });
  });
}

function highlightPlainTextInsideElement(rootElement, targetText) {
  if (!rootElement || !targetText) {
    return;
  }

  const walker = document.createTreeWalker(
    rootElement,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function (node) {
        if (!node || !node.nodeValue || !node.nodeValue.includes(targetText)) {
          return NodeFilter.FILTER_REJECT;
        }

        const parentElement = node.parentElement;
        if (
          parentElement &&
          parentElement.closest &&
          parentElement.closest("." + INSERTED_HIGHLIGHT_CLASS + ", [data-inserted-answer='true'], button, .option-button")
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const matchingTextNodes = [];
  while (walker.nextNode()) {
    matchingTextNodes.push(walker.currentNode);
  }

  matchingTextNodes.forEach(function (textNode) {
    const sourceText = textNode.nodeValue;
    const pieces = sourceText.split(targetText);

    if (pieces.length <= 1) {
      return;
    }

    const fragment = document.createDocumentFragment();

    pieces.forEach(function (piece, index) {
      if (piece) {
        fragment.appendChild(document.createTextNode(piece));
      }

      if (index < pieces.length - 1) {
        const highlightSpan = document.createElement("span");
        highlightSpan.className = INSERTED_HIGHLIGHT_CLASS;
        highlightSpan.setAttribute("data-inserted-answer", "true");
        highlightSpan.textContent = targetText;
        highlightSpan.style.setProperty("color", "#0047b3", "important");
        highlightSpan.style.setProperty("-webkit-text-fill-color", "#0047b3", "important");
        highlightSpan.style.setProperty("font-weight", "900", "important");
        highlightSpan.style.setProperty("background", "transparent", "important");
        highlightSpan.style.setProperty("border", "0", "important");
        highlightSpan.style.setProperty("padding", "0", "important");
        highlightSpan.style.setProperty("margin", "0", "important");
        highlightSpan.style.setProperty("display", "inline", "important");
        highlightSpan.style.setProperty("line-height", "inherit", "important");
        highlightSpan.style.setProperty("vertical-align", "baseline", "important");
        fragment.appendChild(highlightSpan);
      }
    });

    textNode.parentNode.replaceChild(fragment, textNode);
  });
}


document.addEventListener("DOMContentLoaded", initReadingTest);

async function initReadingTest() {
  console.info("TOPIK I Reading loaded: v36-leveltest-result-step33-v1");
  cacheElements();
  bindEvents();

  try {
    await loadQuestions();

    if (isWrongReviewMode()) {
      startWrongReviewMode();
    }
  } catch (error) {
    console.error("TOPIK I Reading 초기화 실패:", error);

    if (elements.startMessage) {
      elements.startMessage.textContent =
        error.message || "시험 초기화 중 오류가 발생했습니다.";
    }
  }
}

function cacheElements() {
  elements.startScreen = document.getElementById("startScreen");
  elements.testScreen = document.getElementById("testScreen");
  elements.resultScreen = document.getElementById("resultScreen");

  elements.studentNameInput = document.getElementById("studentNameInput");
  elements.studentPhoneInput = document.getElementById("studentPhoneInput");
  elements.startButton = document.getElementById("startButton");
  elements.startMessage = document.getElementById("startMessage");
  elements.newExamButton = document.getElementById("newExamButton");
  elements.newExamMessage = document.getElementById("newExamMessage");

  elements.studentNameDisplay = document.getElementById("studentNameDisplay");
  elements.studentPhoneDisplay = document.getElementById("studentPhoneDisplay");
  elements.timerCard = document.getElementById("timerCard");
  elements.timerDisplay = document.getElementById("timerDisplay");
  elements.answerStatusText = document.getElementById("answerStatusText");
  elements.sidebarStatusText = document.getElementById("sidebarStatusText");
  elements.questionInstruction = document.getElementById("questionInstruction");
  elements.questionStage = document.getElementById("questionStage");
  elements.reviewTextInline = document.getElementById("reviewTextInline");

  elements.prevButton = document.getElementById("prevButton");
  elements.nextButton = document.getElementById("nextButton");
  elements.reviewButton = document.getElementById("reviewButton");
  elements.submitButton = document.getElementById("submitButton");

  elements.questionListButton = document.getElementById("questionListButton");
  elements.wrongReviewBackButton = document.getElementById("wrongReviewBackButton");
  elements.questionListBackdrop = document.getElementById("questionListBackdrop");
  elements.closeQuestionListButton = document.getElementById("closeQuestionListButton");
  elements.submitFromListButton = document.getElementById("submitFromListButton");
  elements.progressArea = document.getElementById("progressArea");

  elements.resultSummary = document.getElementById("resultSummary");
  elements.resultTable = document.getElementById("resultTable");
  elements.categoryAnalysis = document.getElementById("categoryAnalysis");

  elements.downloadJsonButton = document.getElementById("downloadJsonButton");
  elements.downloadTxtButton = document.getElementById("downloadTxtButton");
}

function bindEvents() {
  elements.startButton.addEventListener("click", startTest);

  hideReviewUiForStudent();

if (elements.newExamButton) {
  createExamModeSelector();
  elements.newExamButton.addEventListener("click", createNewRandomExam);
}
  elements.studentNameInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      elements.studentPhoneInput.focus();
    }
  });

  elements.studentPhoneInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      startTest();
    }
  });

  elements.prevButton.addEventListener("click", goToPreviousQuestion);
  elements.nextButton.addEventListener("click", goToNextQuestion);
  elements.reviewButton.addEventListener("click", toggleReviewMark);
  elements.submitButton.addEventListener("click", requestSubmit);

  elements.questionListButton.addEventListener("click", openQuestionList);

if (elements.wrongReviewBackButton) {
  elements.wrongReviewBackButton.addEventListener("click", returnToDiagnosisFromWrongReview);
}

elements.closeQuestionListButton.addEventListener("click", closeQuestionList);
  elements.submitFromListButton.addEventListener("click", requestSubmit);

  elements.questionListBackdrop.addEventListener("click", function (event) {
    if (event.target === elements.questionListBackdrop) {
      closeQuestionList();
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeQuestionList();
    }
  });

  elements.downloadJsonButton.addEventListener("click", function () {
    if (!latestResult) {
      alert("다운로드할 결과가 없습니다.");
      return;
    }

    downloadJson(latestResult, "reading-result.json");
  });

  elements.downloadTxtButton.addEventListener("click", function () {
    if (!latestResultText) {
      alert("다운로드할 결과가 없습니다.");
      return;
    }

    downloadText(latestResultText, "reading-result.txt");
  });
}


function hideReviewUiForStudent() {
  /*
    학생 화면 단순화:
    TOPIK I PBT형 IBT 시뮬레이션에서는 검토 표시 UI를 노출하지 않는다.
    기존 버튼/요소는 삭제하지 않고 숨김 처리하여 HTML 구조는 유지한다.
  */
  if (elements.reviewButton) {
    elements.reviewButton.style.display = "none";
    elements.reviewButton.setAttribute("aria-hidden", "true");
    elements.reviewButton.tabIndex = -1;
  }

  if (elements.reviewTextInline) {
    elements.reviewTextInline.style.display = "none";
    elements.reviewTextInline.setAttribute("aria-hidden", "true");
  }
}

async function fetchQuestionFile(url) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`${url} 파일을 불러오지 못했습니다. 상태 코드: ${response.status}`);
  }

  return response.json();
}

async function loadQuestions() {
  const questionFiles = [
    {
      url: "./generated-reading-questions.json",
      label: "generated-reading-questions.json"
    },
    {
      url: "./reading-questions.json",
      label: "reading-questions.json"
    }
  ];

  let lastError = null;

  for (const file of questionFiles) {
    try {
      const data = await fetchQuestionFile(file.url);
      const normalizedData = normalizeQuestions(data);
      const groupedData = enrichPassageGroups(normalizedData);

      validateQuestions(groupedData);

      questions = groupedData;
      sortQuestionsByNumber();

      console.info(`TOPIK I Reading questions loaded from ${file.label}: ${questions.length}`);

      return;
    } catch (error) {
      lastError = error;
      console.warn(`${file.label}을 불러오지 못했습니다. 다음 파일을 확인합니다.`, error);
    }
  }

  console.warn("문항 JSON을 불러오지 못해 31~70번 예비 데이터를 사용합니다.", lastError);

  questions = enrichPassageGroups(generateFallbackQuestions());
  sortQuestionsByNumber();
}
function getDefaultExamEntries() {
  return [
    {
      id: "random-full",
      value: "random",
      mode: "random",
      round: "mixed",
      label: "랜덤 40문항 실전시험",
      exam_type: "full",
      question_count: TEST_CONFIG.expectedTotalQuestions,
      time_limit_minutes: TEST_CONFIG.timeLimitMinutes,
      enabled: true,
      student_visible: true
    },
    {
      id: "reading-100",
      value: "round-100",
      mode: "round",
      round: "100",
      label: "100회 40문항 실전시험",
      exam_type: "full",
      question_count: TEST_CONFIG.expectedTotalQuestions,
      time_limit_minutes: TEST_CONFIG.timeLimitMinutes,
      enabled: true,
      student_visible: true
    },
    {
      id: "reading-102",
      value: "round-102",
      mode: "round",
      round: "102",
      label: "102회 40문항 실전시험",
      exam_type: "full",
      question_count: TEST_CONFIG.expectedTotalQuestions,
      time_limit_minutes: TEST_CONFIG.timeLimitMinutes,
      enabled: true,
      student_visible: true
    },
    {
      id: "reading-103",
      value: "round-103",
      mode: "round",
      round: "103",
      label: "103회 40문항 실전시험",
      exam_type: "full",
      question_count: TEST_CONFIG.expectedTotalQuestions,
      time_limit_minutes: TEST_CONFIG.timeLimitMinutes,
      enabled: true,
      student_visible: true
    },
    {
      id: "leveltest-random",
      value: "leveltest-random",
      mode: "random",
      round: "mixed",
      label: "랜덤 레벨테스트",
      exam_type: "leveltest",
      question_count: LEVEL_TEST_CONFIG.questionCount,
      time_limit_minutes: LEVEL_TEST_CONFIG.timeLimitMinutes,
      leveltest_slots: LEVEL_TEST_CONFIG.defaultSlots.slice(),
      enabled: true,
      student_visible: true
    },
    {
      id: "leveltest-100",
      value: "leveltest-100",
      mode: "round",
      round: "100",
      label: "100회 레벨테스트",
      exam_type: "leveltest",
      question_count: LEVEL_TEST_CONFIG.questionCount,
      time_limit_minutes: LEVEL_TEST_CONFIG.timeLimitMinutes,
      leveltest_slots: LEVEL_TEST_CONFIG.defaultSlots.slice(),
      enabled: true,
      student_visible: true
    },
    {
      id: "leveltest-102",
      value: "leveltest-102",
      mode: "round",
      round: "102",
      label: "102회 레벨테스트",
      exam_type: "leveltest",
      question_count: LEVEL_TEST_CONFIG.questionCount,
      time_limit_minutes: LEVEL_TEST_CONFIG.timeLimitMinutes,
      leveltest_slots: LEVEL_TEST_CONFIG.defaultSlots.slice(),
      enabled: true,
      student_visible: true
    },
    {
      id: "leveltest-103",
      value: "leveltest-103",
      mode: "round",
      round: "103",
      label: "103회 레벨테스트",
      exam_type: "leveltest",
      question_count: LEVEL_TEST_CONFIG.questionCount,
      time_limit_minutes: LEVEL_TEST_CONFIG.timeLimitMinutes,
      leveltest_slots: LEVEL_TEST_CONFIG.defaultSlots.slice(),
      enabled: true,
      student_visible: true
    }
  ];
}

function normalizeExamEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const examType = entry.exam_type === "leveltest" ? "leveltest" : "full";
  const selectionType = entry.selection_type || "";
  const mode =
    entry.mode ||
    (selectionType === "random" ? "random" : "round");

  const rawRound =
    entry.round ||
    entry.source_round ||
    "";

  const round =
    mode === "random" && !rawRound
      ? "mixed"
      : String(rawRound || "").trim();

  const value =
    entry.value ||
    entry.id ||
    (examType === "leveltest"
      ? (mode === "random" ? "leveltest-random" : `leveltest-${round}`)
      : (mode === "random" ? "random" : `round-${round}`));

  const label =
    entry.label ||
    (examType === "leveltest"
      ? (mode === "random" ? "랜덤 레벨테스트" : `${round}회 레벨테스트`)
      : (mode === "random" ? "랜덤 40문항 실전시험" : `${round}회 40문항 실전시험`));

  const defaultQuestionCount = examType === "leveltest"
    ? LEVEL_TEST_CONFIG.questionCount
    : TEST_CONFIG.expectedTotalQuestions;

  const defaultTimeLimitMinutes = examType === "leveltest"
    ? LEVEL_TEST_CONFIG.timeLimitMinutes
    : TEST_CONFIG.timeLimitMinutes;

  return {
    id: entry.id || value,
    value,
    mode,
    round,
    label,
    exam_type: examType,
    selection_type: selectionType || mode,
    question_count: Number(entry.question_count) || defaultQuestionCount,
    time_limit_minutes: Number(entry.time_limit_minutes) || defaultTimeLimitMinutes,
    leveltest_slots: Array.isArray(entry.leveltest_slots)
      ? entry.leveltest_slots.map(Number).filter(Number.isFinite)
      : LEVEL_TEST_CONFIG.defaultSlots.slice(),
    enabled: entry.enabled !== false,
    student_visible: entry.student_visible !== false,
    file: entry.file || "",
    raw: entry
  };
}

function buildLevelTestEntryFromFullEntry(fullEntry) {
  if (!fullEntry || (fullEntry.exam_type || "full") !== "full") {
    return null;
  }

  const mode = fullEntry.mode === "round" ? "round" : "random";
  const round = mode === "random" ? "mixed" : String(fullEntry.round || fullEntry.source_round || "").trim();

  if (mode === "round" && !round) {
    return null;
  }

  return {
    id: mode === "random" ? "leveltest-random" : `leveltest-${round}`,
    value: mode === "random" ? "leveltest-random" : `leveltest-${round}`,
    mode,
    round,
    label: mode === "random" ? "랜덤 레벨테스트" : `${round}회 레벨테스트`,
    exam_type: "leveltest",
    selection_type: mode,
    question_count: LEVEL_TEST_CONFIG.questionCount,
    time_limit_minutes: LEVEL_TEST_CONFIG.timeLimitMinutes,
    leveltest_slots: LEVEL_TEST_CONFIG.defaultSlots.slice(),
    enabled: true,
    student_visible: true,
    file: "",
    raw: {
      generated_from_full_entry: fullEntry.id || fullEntry.value || ""
    }
  };
}

function ensureLevelTestEntries(entries) {
  const safeEntries = Array.isArray(entries) ? entries.slice() : [];
  const hasLevelTest = safeEntries.some(function (entry) {
    return entry && entry.exam_type === "leveltest";
  });

  if (hasLevelTest) {
    return safeEntries;
  }

  const existingValues = new Set(safeEntries.map(function (entry) {
    return entry && entry.value;
  }));

  safeEntries
    .filter(function (entry) {
      return entry && (entry.exam_type || "full") === "full";
    })
    .map(buildLevelTestEntryFromFullEntry)
    .filter(Boolean)
    .forEach(function (entry) {
      if (!existingValues.has(entry.value)) {
        safeEntries.push(entry);
        existingValues.add(entry.value);
      }
    });

  return safeEntries;
}

function normalizeExamEntriesFromManifest(manifestData) {
  const rawEntries = Array.isArray(manifestData)
    ? manifestData
    : Array.isArray(manifestData && manifestData.exams)
      ? manifestData.exams
      : [];

  const normalizedEntries = rawEntries
    .map(normalizeExamEntry)
    .filter(function (entry) {
      return Boolean(entry) &&
        entry.enabled !== false &&
        entry.student_visible !== false;
    });

  return ensureLevelTestEntries(normalizedEntries);
}

async function loadExamManifest() {
  if (examEntries.length > 0) {
    return examEntries;
  }

  if (examManifestLoadPromise) {
    return examManifestLoadPromise;
  }

  examManifestLoadPromise = (async function () {
    let lastError = null;

    for (const url of EXAM_MANIFEST_URLS) {
      try {
        const manifestData = await fetchQuestionFile(url);
        const normalizedEntries = normalizeExamEntriesFromManifest(manifestData);

        if (normalizedEntries.length > 0) {
          examManifest = manifestData;
          examEntries = normalizedEntries;
          console.info(`TOPIK I Reading 시험지 manifest loaded from ${url}:`, examEntries);
          return examEntries;
        }
      } catch (error) {
        lastError = error;
        console.warn(`${url} 시험지 manifest를 불러오지 못했습니다.`, error);
      }
    }

    examEntries = getDefaultExamEntries();
    console.warn("시험지 manifest를 불러오지 못해 기본 시험지 목록을 사용합니다.", lastError);
    return examEntries;
  })();

  return examManifestLoadPromise;
}

function renderExamModeSelectOptions(select, entries) {
  if (!select) {
    return;
  }

  const safeEntries = Array.isArray(entries) && entries.length > 0
    ? entries
    : getDefaultExamEntries();

  select.innerHTML = safeEntries
    .map(function (entry) {
      return `<option value="${escapeAttribute(entry.value)}">${escapeHtml(entry.label)}</option>`;
    })
    .join("");

  const defaultEntry =
    safeEntries.find(function (entry) {
      return (entry.exam_type || "full") === getSelectedExamType() && entry.mode === "random";
    }) ||
    safeEntries.find(function (entry) {
      return (entry.exam_type || "full") === getSelectedExamType();
    }) ||
    safeEntries.find(function (entry) {
      return (entry.exam_type || "full") === "full" && entry.mode === "random";
    }) ||
    safeEntries[0];

  if (defaultEntry) {
    select.value = defaultEntry.value;
  }

  updateExamModeHelpText();
}

function getExamSelectionEntries() {
  const sourceEntries = examEntries.length > 0 ? examEntries : getDefaultExamEntries();
  return ensureLevelTestEntries(sourceEntries);
}

function getSelectedExamType() {
  return selectedExamType === "leveltest" ? "leveltest" : "full";
}

function getEntriesByExamType(examType) {
  const normalizedType = examType === "leveltest" ? "leveltest" : "full";
  return getExamSelectionEntries().filter(function (entry) {
    return (entry.exam_type || "full") === normalizedType;
  });
}

function getEntriesBySelectionMethod(method) {
  const normalizedMethod = method === "round" ? "round" : "random";
  const normalizedType = getSelectedExamType();

  return getExamSelectionEntries().filter(function (entry) {
    if ((entry.exam_type || "full") !== normalizedType) {
      return false;
    }

    if (normalizedMethod === "round") {
      return entry.mode === "round";
    }

    return entry.mode === "random";
  });
}

function getSelectedExamEntryFromSelect() {
  const select = document.getElementById("examModeSelect");
  const selectedValue = select ? select.value : "";
  const entries = getExamSelectionEntries();
  const selectedType = getSelectedExamType();

  const selectedEntry = entries.find(function (entry) {
    return entry.value === selectedValue && (entry.exam_type || "full") === selectedType;
  });

  if (selectedEntry) {
    return selectedEntry;
  }

  return (
    entries.find(function (entry) {
      return (entry.exam_type || "full") === selectedType && entry.mode === "random";
    }) ||
    entries.find(function (entry) {
      return (entry.exam_type || "full") === selectedType;
    }) ||
    entries.find(function (entry) {
      return entry.mode === "random" && (entry.exam_type || "full") === "full";
    }) ||
    entries[0] ||
    null
  );
}

function setExamType(examType) {
  const select = document.getElementById("examModeSelect");
  if (!select) {
    return;
  }

  const previousEntry = getExamSelectionEntries().find(function (entry) {
    return entry.value === select.value;
  });
  const preferredMethod = previousEntry && previousEntry.mode === "round" ? "round" : "random";

  selectedExamType = examType === "leveltest" ? "leveltest" : "full";

  const candidate =
    getEntriesBySelectionMethod(preferredMethod)[0] ||
    getEntriesBySelectionMethod("random")[0] ||
    getEntriesBySelectionMethod("round")[0];

  if (candidate) {
    select.value = candidate.value;
  }

  updateExamModeHelpText();
}

function setExamMethod(method) {
  const select = document.getElementById("examModeSelect");
  if (!select) {
    return;
  }

  const normalizedMethod = method === "round" ? "round" : "random";
  const selectedEntry = getSelectedExamEntryFromSelect();

  if (
    !selectedEntry ||
    selectedEntry.mode !== normalizedMethod ||
    (selectedEntry.exam_type || "full") !== getSelectedExamType()
  ) {
    const candidate = getEntriesBySelectionMethod(normalizedMethod)[0];

    if (candidate) {
      select.value = candidate.value;
    }
  }

  updateExamModeHelpText();
}

function setSelectedExamValue(value) {
  const select = document.getElementById("examModeSelect");
  if (!select) {
    return;
  }

  select.value = value;

  const selectedEntry = getExamSelectionEntries().find(function (entry) {
    return entry.value === value;
  });

  if (selectedEntry) {
    selectedExamType = selectedEntry.exam_type || "full";
  }

  const detailList = document.getElementById("examDetailList");
  if (detailList) {
    detailList.hidden = true;
  }

  updateExamModeHelpText();
}

function getExamMethodButtonHtml(method, label, subLabel, disabled) {
  const disabledAttribute = disabled ? " disabled aria-disabled=\"true\"" : "";

  return `
    <button
      type="button"
      class="exam-method-button"
      data-exam-method="${escapeAttribute(method)}"
      ${disabledAttribute}
      style="
        min-height:43px;
        border:2px solid #b9d8ff;
        border-radius:10px;
        background:#ffffff;
        color:#003f8f;
        font-weight:900;
        font-size:15px;
        cursor:${disabled ? "not-allowed" : "pointer"};
        padding:5px 10px;
      "
    >
      ${escapeHtml(label)}
    </button>
  `;
}



function getCompactExamLabel(entry) {
  if (!entry) {
    return "시험지";
  }

  const round = String(entry.round || "").trim();
  const mode = String(entry.mode || "").trim();
  const examType = entry.exam_type === "leveltest" ? "leveltest" : "full";

  if (examType === "leveltest") {
    if (mode === "round" && round && round !== "mixed") {
      return `${round}회 레벨테스트`;
    }

    return "랜덤 레벨테스트";
  }

  if (mode === "round" && round && round !== "mixed") {
    return `${round}회`;
  }

  if (mode === "random") {
    return "랜덤";
  }

  return String(entry.label || "")
    .replace(/\s*40문항\s*실전시험/g, "")
    .replace(/\s*실전시험/g, "")
    .trim() || "시험지";
}

function getCompactExamSelectionMessage(entry) {
  const label = getCompactExamLabel(entry);
  return entry ? `${label}가 선택되었습니다.` : "시험지를 선택하세요.";
}

function getDetailExamButtonHtml(entry, selectedValue) {
  const isSelected = entry.value === selectedValue;

  return `
    <button
      type="button"
      class="exam-detail-button"
      data-exam-value="${escapeAttribute(entry.value)}"
      style="
        width:100%;
        min-height:31px;
        margin:2px 0;
        padding:5px 10px;
        border-radius:9px;
        border:2px solid ${isSelected ? "#0877f2" : "#d7e6f8"};
        background:${isSelected ? "#e9f3ff" : "#ffffff"};
        color:#003f8f;
        font-size:14px;
        font-weight:900;
        cursor:pointer;
        text-align:center;
      "
    >
      ${escapeHtml(getCompactExamLabel(entry))}
    </button>
  `;
}


function refreshExamSelectionUi() {
  const select = document.getElementById("examModeSelect");
  const shell = document.getElementById("examModeSelectWrapper");

  if (!select || !shell) {
    return;
  }

  const selectedEntry = getSelectedExamEntryFromSelect();

  if (selectedEntry && select.value !== selectedEntry.value) {
    select.value = selectedEntry.value;
  }

  const selectedMethod = selectedEntry && selectedEntry.mode === "round"
    ? "round"
    : "random";

  const roundEntries = getEntriesBySelectionMethod("round");
  const randomEntries = getEntriesBySelectionMethod("random");
  const visibleDetailEntries = selectedMethod === "round" ? roundEntries : randomEntries;

  const typeButtons = shell.querySelectorAll(".exam-type-button");
  typeButtons.forEach(function (button) {
    const type = button.getAttribute("data-exam-type");
    const active = type === getSelectedExamType();

    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.style.borderColor = active ? "#0877f2" : "#cfe2ff";
    button.style.background = active ? "#e9f3ff" : "#ffffff";
    button.style.boxShadow = active ? "inset 0 0 0 1px #0877f2" : "none";
  });

  const methodButtons = shell.querySelectorAll(".exam-method-button");
  methodButtons.forEach(function (button) {
    const method = button.getAttribute("data-exam-method");
    const active = method === selectedMethod;

    button.style.borderColor = active ? "#0877f2" : "#b9d8ff";
    button.style.background = active ? "#e9f3ff" : "#ffffff";
    button.style.boxShadow = active ? "inset 0 0 0 1px #0877f2" : "none";
  });

  const currentLabel = document.getElementById("currentExamLabel");
  if (currentLabel) {
    currentLabel.textContent = selectedEntry
      ? getCompactExamLabel(selectedEntry)
      : "시험지를 선택하세요.";
  }

  const detailList = document.getElementById("examDetailList");
  if (detailList) {
    detailList.innerHTML = visibleDetailEntries.length
      ? visibleDetailEntries
          .map(function (entry) {
            return getDetailExamButtonHtml(entry, select.value);
          })
          .join("")
      : `
          <div style="padding:8px; color:#d93025; font-size:13px; font-weight:800; text-align:center;">
            선택 가능한 시험지가 없습니다.
          </div>
        `;

    detailList.querySelectorAll(".exam-detail-button").forEach(function (button) {
      button.addEventListener("click", function () {
        setSelectedExamValue(button.getAttribute("data-exam-value"));
      });
    });
  }

  const toggleButton = document.getElementById("examDetailToggleButton");
  if (toggleButton) {
    toggleButton.textContent =
      detailList && detailList.hidden
        ? "▸ 세부 시험지 선택 펼치기"
        : "▾ 세부 시험지 선택 접기";
  }

  const help = document.getElementById("examModeHelpText");
  if (help) {
    help.textContent = getCompactExamSelectionMessage(selectedEntry);
    help.style.color = "#188038";
  }
}

function updateExamModeHelpText() {
  refreshExamSelectionUi();
}

function injectCompactStartPageStyle() {
  if (document.getElementById("topik1CompactStartPageStyle")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "topik1CompactStartPageStyle";
  style.textContent = `
    html,
    body {
      height: auto !important;
      min-height: 100% !important;
      overflow-x: hidden !important;
    }

    #startScreen .start-page,
    .start-page {
      min-height: 100vh !important;
      padding: 0 !important;
      align-items: flex-start !important;
      justify-content: flex-start !important;
      background: #ffffff !important;
    }

    #startScreen .start-card,
    .start-card {
      width: 100% !important;
      max-width: none !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 16px 10px !important;
      border: 0 !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      background: #ffffff !important;
    }

    #startScreen .start-title,
    .start-title {
      display: block !important;
      width: calc(100% + 32px) !important;
      max-width: none !important;
      margin: 0 0 8px -16px !important;
      padding: 11px 16px 12px !important;
      background: #0877f2 !important;
      color: #ffffff !important;
      font-size: 30px !important;
      line-height: 1.14 !important;
      font-weight: 900 !important;
      text-align: center !important;
      letter-spacing: -0.4px !important;
      border-radius: 0 !important;
    }

    #startScreen .start-card > h1:not(.start-title),
    #startScreen .start-card > h2,
    #startScreen .start-card > h3 {
      max-width: 520px !important;
      margin: 5px auto 2px !important;
      text-align: center !important;
      font-size: 25px !important;
      line-height: 1.2 !important;
      color: #003f8f !important;
      font-weight: 900 !important;
      letter-spacing: -0.2px !important;
    }

    #startScreen .start-subtitle,
    .start-subtitle,
    #startScreen .start-card > p {
      max-width: 520px !important;
      margin: 0 auto 8px !important;
      line-height: 1.25 !important;
      text-align: center !important;
      font-size: 13px !important;
      color: #5f6368 !important;
    }

    #startScreen .notice-box,
    .notice-box,
    .small-note {
      display: none !important;
    }

    #startScreen label[for="authPasswordInput"],
    #startScreen .auth-label {
      display: block !important;
      width: 100% !important;
      max-width: 520px !important;
      margin: 0 auto 4px !important;
      font-size: 14px !important;
      line-height: 1.2 !important;
      font-weight: 900 !important;
      color: #111827 !important;
    }

    #authPasswordInput {
      height: 39px !important;
      min-height: 39px !important;
      padding: 7px 12px !important;
      font-size: 14px !important;
      border-radius: 9px !important;
    }

    #authPasswordButton {
      height: 39px !important;
      min-height: 39px !important;
      padding: 0 22px !important;
      font-size: 15px !important;
      border-radius: 9px !important;
      font-weight: 900 !important;
    }

    #authMessage {
      min-height: 17px !important;
      margin: 4px auto 3px !important;
      font-size: 13px !important;
      line-height: 1.25 !important;
      text-align: center !important;
      font-weight: 900 !important;
    }

    #examModeSelectWrapper {
      width: 100% !important;
      max-width: 520px !important;
      margin: 5px auto 7px !important;
      padding: 11px 12px !important;
      border-radius: 10px !important;
    }

    #examModeSelectWrapper * {
      box-sizing: border-box !important;
    }

    #examModeSelectWrapper button {
      line-height: 1.2 !important;
    }

    #newExamButton,
    #newExamMessage {
      display: none !important;
    }

    #startScreen .form-grid,
    .form-grid {
      width: 100% !important;
      max-width: 520px !important;
      margin: 7px auto 5px !important;
      display: grid !important;
      grid-template-columns: 1fr !important;
      gap: 7px !important;
    }

    #startScreen .form-row,
    .form-row {
      margin: 0 !important;
    }

    #startScreen .form-row label,
    .form-row label {
      margin-bottom: 4px !important;
      font-size: 14px !important;
      line-height: 1.22 !important;
      font-weight: 900 !important;
    }

    #startScreen .form-row input,
    .form-row input {
      height: 39px !important;
      min-height: 39px !important;
      padding: 8px 12px !important;
      font-size: 14px !important;
      border-radius: 9px !important;
    }

    #startButton {
      display: block !important;
      width: 100% !important;
      max-width: 520px !important;
      height: 49px !important;
      min-height: 49px !important;
      margin: 10px auto 0 !important;
      padding: 0 16px !important;
      border-radius: 10px !important;
      font-size: 18px !important;
      font-weight: 900 !important;
    }

    #startMessage {
      width: 100% !important;
      max-width: 520px !important;
      min-height: 14px !important;
      margin: 3px auto 0 !important;
      font-size: 12px !important;
      line-height: 1.2 !important;
      text-align: center !important;
    }

    @media (max-height: 760px) {
      #startScreen .start-title,
      .start-title {
        padding-top: 10px !important;
        padding-bottom: 10px !important;
        font-size: 29px !important;
        margin-bottom: 6px !important;
      }

      #startScreen .start-card > h1:not(.start-title),
      #startScreen .start-card > h2,
      #startScreen .start-card > h3 {
        margin-top: 3px !important;
        font-size: 24px !important;
      }

      #startScreen .start-subtitle,
      .start-subtitle,
      #startScreen .start-card > p {
        margin-bottom: 6px !important;
        font-size: 13px !important;
      }

      #examModeSelectWrapper {
        margin-top: 4px !important;
        margin-bottom: 6px !important;
        padding: 9px 11px !important;
      }

      #startScreen .form-grid,
      .form-grid {
        gap: 6px !important;
        margin-top: 6px !important;
      }

      #startButton {
        margin-top: 8px !important;
        height: 48px !important;
        min-height: 48px !important;
      }
    }

  `;

  document.head.appendChild(style);
}


function compactLegacyExamSelectBox() {
  const host = document.getElementById("examSelectBox") ||
    (elements && elements.newExamButton ? elements.newExamButton.parentNode : null);

  if (!host) {
    return;
  }

  Array.from(host.childNodes).forEach(function (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      node.textContent = "";
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    if (
      node.id === "examModeSelectWrapper" ||
      node.id === "newExamButton" ||
      node.id === "newExamMessage" ||
      node === elements.newExamButton ||
      node === elements.newExamMessage
    ) {
      return;
    }

    const tagName = String(node.tagName || "").toLowerCase();

    if (["p", "small", "span"].includes(tagName)) {
      node.style.display = "none";
      node.setAttribute("aria-hidden", "true");
      return;
    }

    if (["h2", "h3", "h4", "label", "div"].includes(tagName)) {
      const text = String(node.textContent || "").trim();

      if (
        text.includes("검수") ||
        text.includes("실제 시험") ||
        text.includes("선택 후") ||
        text.includes("시험지 선택")
      ) {
        node.style.display = "none";
        node.setAttribute("aria-hidden", "true");
      }
    }
  });
}

function createExamModeSelector() {
  if (!elements || !elements.newExamButton) {
    return;
  }

  injectCompactStartPageStyle();
  compactLegacyExamSelectBox();

  if (document.getElementById("examModeSelectWrapper")) {
    return;
  }

  const host =
    document.getElementById("examSelectBox") ||
    elements.newExamButton.parentNode;

  const wrapper = document.createElement("div");
  wrapper.id = "examModeSelectWrapper";
  wrapper.style.margin = "5px auto 7px";
  wrapper.style.padding = "11px 12px";
  wrapper.style.border = "1px solid #cfe2ff";
  wrapper.style.borderRadius = "10px";
  wrapper.style.background = "#f8fbff";

  const select = document.createElement("select");
  select.id = "examModeSelect";
  select.setAttribute("aria-label", "세부 시험지 선택");
  select.style.position = "absolute";
  select.style.left = "-9999px";
  select.style.width = "1px";
  select.style.height = "1px";
  select.style.opacity = "0";
  select.tabIndex = -1;

  renderExamModeSelectOptions(select, getDefaultExamEntries());

  wrapper.innerHTML = `
    <div style="font-size:15px; font-weight:900; color:#111827; margin-bottom:5px;">
      시험 유형 선택
    </div>

    <div
      id="examTypeButtonArea"
      style="
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:8px;
        margin-bottom:6px;
      "
    >
      <button
        id="fullTestTypeButton"
        type="button"
        class="exam-type-button"
        data-exam-type="full"
        aria-pressed="true"
        style="
          min-height:43px;
          border:2px solid #0877f2;
          border-radius:10px;
          background:#e9f3ff;
          color:#003f8f;
          font-weight:900;
          font-size:15px;
          cursor:pointer;
          padding:5px 10px;
        "
      >
        40문항 실전시험
      </button>
      <button
        id="levelTestTypeButton"
        type="button"
        class="exam-type-button"
        data-exam-type="leveltest"
        aria-pressed="false"
        style="
          min-height:43px;
          border:2px solid #cfe2ff;
          border-radius:10px;
          background:#ffffff;
          color:#003f8f;
          font-weight:900;
          font-size:15px;
          cursor:pointer;
          padding:5px 10px;
        "
      >
        레벨테스트
      </button>
    </div>

    <div style="height:1px; background:#d8e7f8; margin:6px 0 7px;"></div>

    <div style="font-size:15px; font-weight:900; color:#111827; margin-bottom:5px;">
      출제 방식 선택
    </div>

    <div
      id="examMethodButtonArea"
      style="
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:8px;
        margin-bottom:6px;
      "
    >
      ${getExamMethodButtonHtml("round", "회차별 시험지", "", false)}
      ${getExamMethodButtonHtml("random", "랜덤 시험지", "", false)}
    </div>

    <div style="height:1px; background:#d8e7f8; margin:6px 0 7px;"></div>

    <div style="font-size:15px; font-weight:900; color:#111827; margin-bottom:5px;">
      세부 시험지 선택
    </div>

    <div
      id="currentExamSummaryBox"
      style="
        border:2px solid #0877f2;
        background:#e9f3ff;
        border-radius:10px;
        padding:8px 12px;
        text-align:center;
        color:#003f8f;
        font-weight:900;
        margin-bottom:6px;
      "
    >
      <div style="font-size:10px; color:#5f6368; margin-bottom:1px;">
        현재 선택 시험지
      </div>
      <div id="currentExamLabel" style="font-size:16px;">
        시험지를 확인하고 있습니다.
      </div>
    </div>

    <button
      id="examDetailToggleButton"
      type="button"
      style="
        width:100%;
        min-height:30px;
        border:1px solid #cfe2ff;
        border-radius:9px;
        background:#ffffff;
        color:#003f8f;
        font-size:13px;
        font-weight:900;
        cursor:pointer;
      "
    >
      ▸ 세부 시험지 선택 펼치기
    </button>

    <div
      id="examDetailList"
      hidden
      style="
        margin-top:5px;
        padding:5px;
        border:1px solid #d7e6f8;
        border-radius:9px;
        background:#ffffff;
      "
    ></div>

    <div
      id="examModeHelpText"
      style="
        margin-top:5px;
        min-height:15px;
        font-size:13px;
        line-height:1.25;
        color:#188038;
        text-align:center;
        font-weight:900;
      "
    >
      시험지를 선택하세요.
    </div>
  `;

  wrapper.insertBefore(select, wrapper.firstChild);

  const oldSelect = document.getElementById("examModeSelect");
  if (oldSelect && oldSelect !== select) {
    oldSelect.remove();
  }

  const existingOldWrapper = document.getElementById("examModeSelectWrapper");
  if (existingOldWrapper && existingOldWrapper !== wrapper) {
    existingOldWrapper.remove();
  }

  const insertionHost = elements.newExamButton.parentNode || host;
  insertionHost.insertBefore(wrapper, elements.newExamButton);

  if (elements.newExamButton) {
    elements.newExamButton.style.display = "none";
    elements.newExamButton.setAttribute("aria-hidden", "true");
  }

  if (elements.newExamMessage) {
    elements.newExamMessage.style.display = "none";
    elements.newExamMessage.setAttribute("aria-hidden", "true");
  }

  wrapper.querySelectorAll(".exam-type-button").forEach(function (button) {
    button.addEventListener("click", function () {
      setExamType(button.getAttribute("data-exam-type"));
    });
  });

  wrapper.querySelectorAll(".exam-method-button").forEach(function (button) {
    button.addEventListener("click", function () {
      if (button.disabled) {
        return;
      }

      setExamMethod(button.getAttribute("data-exam-method"));
    });
  });

  const toggleButton = document.getElementById("examDetailToggleButton");
  const detailList = document.getElementById("examDetailList");

  if (toggleButton && detailList) {
    toggleButton.addEventListener("click", function () {
      detailList.hidden = !detailList.hidden;
      refreshExamSelectionUi();
    });
  }

  select.addEventListener("change", updateExamModeHelpText);

  refreshExamSelectionUi();

  loadExamManifest()
    .then(function (entries) {
      renderExamModeSelectOptions(select, entries);
      refreshExamSelectionUi();
    })
    .catch(function (error) {
      console.warn("시험지 manifest 적용 실패, 기본 목록 사용:", error);
      renderExamModeSelectOptions(select, getDefaultExamEntries());
      refreshExamSelectionUi();
    });
}


function getSelectedExamGenerationOptions() {
  const select = document.getElementById("examModeSelect");
  const selectedValue = select ? select.value : "random";
  const entries = getExamSelectionEntries();
  const selectedType = getSelectedExamType();

  const selectedEntry =
    entries.find(function (entry) {
      return entry.value === selectedValue && (entry.exam_type || "full") === selectedType;
    }) ||
    entries.find(function (entry) {
      return (entry.exam_type || "full") === selectedType && entry.mode === "random";
    }) ||
    entries.find(function (entry) {
      return (entry.exam_type || "full") === selectedType;
    }) ||
    entries.find(function (entry) {
      return entry.mode === "random" && (entry.exam_type || "full") === "full";
    }) ||
    entries[0];

  if (selectedEntry && select && select.value !== selectedEntry.value) {
    select.value = selectedEntry.value;
  }

  if (!selectedEntry) {
    return {
      mode: "random",
      round: "mixed",
      label: "랜덤 40문항 실전시험",
      exam_type: "full",
      question_count: TEST_CONFIG.expectedTotalQuestions,
      time_limit_minutes: TEST_CONFIG.timeLimitMinutes
    };
  }

  const examType = selectedEntry.exam_type === "leveltest" ? "leveltest" : "full";

  return {
    mode: selectedEntry.mode || "random",
    round: selectedEntry.round || (selectedEntry.mode === "random" ? "mixed" : ""),
    label: selectedEntry.label || (examType === "leveltest" ? "랜덤 레벨테스트" : "랜덤 40문항 실전시험"),
    exam_type: examType,
    manifest_id: selectedEntry.id || selectedEntry.value || "",
    selection_type: selectedEntry.selection_type || selectedEntry.mode || "random",
    question_count: selectedEntry.question_count || (examType === "leveltest" ? LEVEL_TEST_CONFIG.questionCount : TEST_CONFIG.expectedTotalQuestions),
    time_limit_minutes: selectedEntry.time_limit_minutes || (examType === "leveltest" ? LEVEL_TEST_CONFIG.timeLimitMinutes : TEST_CONFIG.timeLimitMinutes),
    leveltest_slots: Array.isArray(selectedEntry.leveltest_slots)
      ? selectedEntry.leveltest_slots.slice()
      : LEVEL_TEST_CONFIG.defaultSlots.slice(),
    file: selectedEntry.file || ""
  };
}

function isLevelTestExamOptions(options) {
  return Boolean(options && options.exam_type === "leveltest");
}

function isLevelTestResult(result) {
  return Boolean(
    result &&
      (result.generated_exam_type === "leveltest" ||
        result.exam_type === "leveltest" ||
        String(result.generated_exam_label || "").includes("레벨테스트"))
  );
}

function getActiveExpectedTotalQuestions() {
  const value = Number(latestExamGenerationOptions && latestExamGenerationOptions.question_count);
  if (Number.isFinite(value) && value > 0) {
    return value;
  }

  return questions.length || TEST_CONFIG.expectedTotalQuestions;
}

function getActiveTimeLimitMinutes() {
  const value = Number(latestExamGenerationOptions && latestExamGenerationOptions.time_limit_minutes);
  if (Number.isFinite(value) && value > 0) {
    return value;
  }

  return TEST_CONFIG.timeLimitMinutes;
}

function getActiveTimeLimitSeconds() {
  return getActiveTimeLimitMinutes() * 60;
}

function getResultTestScope() {
  return isLevelTestExamOptions(latestExamGenerationOptions)
    ? "TOPIK I PBT Reading Level Test"
    : "TOPIK I PBT Reading 31-70";
}

function validateGeneratedQuestionSetForExam(groupedData, examGenerationOptions) {
  const expectedQuestionCount = Number(examGenerationOptions && examGenerationOptions.question_count) ||
    TEST_CONFIG.expectedTotalQuestions;

  if (groupedData.length !== expectedQuestionCount) {
    throw new Error(
      `생성 문항 수가 ${expectedQuestionCount}문항이 아닙니다.`
    );
  }

  const numbers = groupedData.map(function (question) {
    return Number(question.question_number);
  });

  const duplicatedNumbers = numbers.filter(function (number, index) {
    return numbers.indexOf(number) !== index;
  });

  if (duplicatedNumbers.length > 0) {
    throw new Error(`중복된 문항 번호가 있습니다: ${Array.from(new Set(duplicatedNumbers)).join(", ")}`);
  }

  if (isLevelTestExamOptions(examGenerationOptions)) {
    return;
  }

  const missingNumbers = [];

  for (
    let number = TEST_CONFIG.questionNumberStart;
    number <= TEST_CONFIG.questionNumberEnd;
    number += 1
  ) {
    if (!numbers.includes(number)) {
      missingNumbers.push(number);
    }
  }

  if (missingNumbers.length > 0) {
    throw new Error(`누락된 문항 번호가 있습니다: ${missingNumbers.join(", ")}`);
  }
}

function applyGeneratedExamData(generatedData, examGenerationOptions) {
  const normalizedData = normalizeQuestions(generatedData);
  const groupedData = enrichPassageGroups(normalizedData);

  validateQuestions(groupedData);
  validateGeneratedQuestionSetForExam(groupedData, examGenerationOptions);

  questions = groupedData;
  sortQuestionsByNumber();

  latestExamGenerationOptions = examGenerationOptions;

  answers = {};
  reviewMarks = {};
  sentenceOrderAnswers = {};
  selectedSentenceForOrder = null;
  currentIndex = getStartQuestionIndex();

  return questions[0] && questions[0].generated_exam_id
    ? questions[0].generated_exam_id
    : "새 시험지";
}

function normalizeManifestExamFileUrl(filePath) {
  const cleanPath = String(filePath || "")
    .trim()
    .replace(/\\/g, "/");

  if (!cleanPath) {
    return "";
  }

  if (/^(https?:)?\/\//i.test(cleanPath)) {
    return cleanPath;
  }

  if (cleanPath.startsWith("./") || cleanPath.startsWith("../")) {
    return cleanPath;
  }

  if (cleanPath.startsWith("/")) {
    return "." + cleanPath;
  }

  if (cleanPath.includes("/")) {
    return "./" + cleanPath.replace(/^\/+/, "");
  }

  return "./data/exams/" + cleanPath;
}

function extractDirectExamQuestionArray(data) {
  if (Array.isArray(data)) {
    return data;
  }

  if (!data || typeof data !== "object") {
    return [];
  }

  if (Array.isArray(data.questions)) {
    return data.questions;
  }

  if (Array.isArray(data.items)) {
    return data.items;
  }

  if (data.exam && Array.isArray(data.exam.questions)) {
    return data.exam.questions;
  }

  if (data.data && Array.isArray(data.data.questions)) {
    return data.data.questions;
  }

  return [];
}

function makeDirectExamGeneratedId(examGenerationOptions) {
  const examType = examGenerationOptions && examGenerationOptions.exam_type === "leveltest"
    ? "leveltest"
    : "full";
  const round = String(examGenerationOptions && examGenerationOptions.round || "mixed")
    .replace(/[^A-Za-z0-9_-]/g, "") || "mixed";
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);

  return `TOPIK1-READING-FILE-${examType}-${round}-${timestamp}`;
}

function normalizeDirectExamQuestionForRuntime(question, index, examGenerationOptions, generatedExamId) {
  const clonedQuestion = {
    ...(question || {})
  };

  const questionNumber = Number(
    clonedQuestion.question_number ||
      clonedQuestion.target_slot ||
      clonedQuestion.original_question_number
  );

  if (Number.isFinite(questionNumber)) {
    clonedQuestion.question_number = questionNumber;
  } else {
    clonedQuestion.question_number = TEST_CONFIG.questionNumberStart + index;
  }

  if (
    clonedQuestion.answer === undefined ||
    clonedQuestion.answer === null ||
    clonedQuestion.answer === ""
  ) {
    const directCorrectAnswer =
      clonedQuestion.correct_answer === undefined
        ? clonedQuestion.correctAnswer
        : clonedQuestion.correct_answer;

    if (
      directCorrectAnswer !== undefined &&
      directCorrectAnswer !== null &&
      directCorrectAnswer !== ""
    ) {
      clonedQuestion.answer = Number(directCorrectAnswer);
    }
  }

  if (!clonedQuestion.id) {
    clonedQuestion.id = `FILE-R${String(clonedQuestion.question_number).padStart(3, "0")}-${index + 1}`;
  }

  if (!clonedQuestion.test_level && clonedQuestion.level) {
    clonedQuestion.test_level = clonedQuestion.level;
  }

  if (!clonedQuestion.section) {
    clonedQuestion.section = TEST_CONFIG.section;
  }

  if (!clonedQuestion.generated_exam_id) {
    clonedQuestion.generated_exam_id = generatedExamId;
  }

  if (
    clonedQuestion.template_slot === undefined ||
    clonedQuestion.template_slot === null ||
    clonedQuestion.template_slot === ""
  ) {
    clonedQuestion.template_slot = clonedQuestion.question_number;
  }

  if (
    !clonedQuestion.source_round &&
    examGenerationOptions &&
    examGenerationOptions.round &&
    examGenerationOptions.round !== "mixed"
  ) {
    clonedQuestion.source_round = examGenerationOptions.round;
  }

  return clonedQuestion;
}

async function loadQuestionsFromManifestExamFile(examGenerationOptions) {
  const fileUrl = normalizeManifestExamFileUrl(examGenerationOptions && examGenerationOptions.file);

  if (!fileUrl) {
    return null;
  }

  const data = await fetchQuestionFile(fileUrl);
  const directQuestions = extractDirectExamQuestionArray(data);

  if (!Array.isArray(directQuestions) || directQuestions.length === 0) {
    throw new Error(`${fileUrl} 파일에 문항 배열이 없습니다.`);
  }

  const generatedExamId =
    (data && typeof data === "object" && data.generated_exam_id) ||
    makeDirectExamGeneratedId(examGenerationOptions);

  const runtimeQuestions = directQuestions.map(function (question, index) {
    return normalizeDirectExamQuestionForRuntime(
      question,
      index,
      examGenerationOptions,
      generatedExamId
    );
  });

  console.info("TOPIK I Reading manifest file 시험지 로딩 완료:", {
    file: fileUrl,
    total_questions: runtimeQuestions.length,
    generated_exam_id: generatedExamId
  });

  return runtimeQuestions;
}

async function generateSelectedExamForCurrentSelection() {
  const examGenerationOptions = getSelectedExamGenerationOptions();

  console.info("TOPIK I Reading 선택 시험지:", examGenerationOptions);

  let generatedData = null;
  let generationSource = "generator";

  if (examGenerationOptions.file) {
    try {
      generatedData = await loadQuestionsFromManifestExamFile(examGenerationOptions);
      generationSource = "manifest-file";
    } catch (error) {
      console.warn(
        "manifest file 시험지를 직접 불러오지 못해 기존 generator 방식으로 전환합니다.",
        error
      );
    }
  }

  if (!generatedData) {
    if (
      !window.TOPIKQuestionGenerator ||
      typeof window.TOPIKQuestionGenerator.tryGeneratePreview !== "function"
    ) {
      throw new Error(
        "question-generator.js를 불러오지 못했습니다. index.html의 script 연결을 확인하세요."
      );
    }

    generatedData = await window.TOPIKQuestionGenerator.tryGeneratePreview(
      examGenerationOptions
    );
  }

  const generatedExamId = applyGeneratedExamData(
    generatedData,
    examGenerationOptions
  );

  return {
    examGenerationOptions,
    generatedExamId,
    totalQuestions: questions.length,
    generationSource
  };
}

async function createNewRandomExam() {
  if (elements.newExamButton) {
    elements.newExamButton.disabled = true;
    elements.newExamButton.textContent = "새 문제 생성 중...";
  }

  setNewExamMessage("문제은행에서 새 문제 세트를 만드는 중입니다.", "#5f6368");

  try {
    const generatedExamInfo = await generateSelectedExamForCurrentSelection();

       setNewExamMessage(
      "새 문제 세트가 준비되었습니다.",
      "#188038"
    );

    console.info("TOPIK I Reading 새 문제 세트 적용 완료:", generatedExamInfo);
  } catch (error) {
    console.error("새 문제 세트 생성 실패:", error);
    setNewExamMessage(`새 문제 세트 생성 실패: ${error.message}`, "#d93025");
  } finally {
    if (elements.newExamButton) {
      elements.newExamButton.disabled = false;
      elements.newExamButton.textContent = "새 문제 만들기";
    }
  }
}
function setNewExamMessage(text, color) {
  if (!elements.newExamMessage) {
    return;
  }

  elements.newExamMessage.textContent = text;
  elements.newExamMessage.style.color = color || "#5f6368";
}

function sortQuestionsByNumber() {
  questions.sort(function (a, b) {
    return Number(a.question_number) - Number(b.question_number);
  });
}

function enrichPassageGroups(questionList) {
  if (!Array.isArray(questionList)) {
    return [];
  }

  const groupMap = {};

  questionList.forEach(function (question) {
    if (!hasPassageGroup(question)) {
      return;
    }

    const groupId = question.passage_group_id;

    if (!groupMap[groupId]) {
      groupMap[groupId] = {
        id: groupId,
        title: question.passage_group_title || "",
        numbers: [],
        passage: "",
        imageUrl: ""
      };
    }

    if (Array.isArray(question.passage_group_numbers) && question.passage_group_numbers.length > 0) {
      question.passage_group_numbers.forEach(function (number) {
        const parsedNumber = Number(number);
        if (Number.isFinite(parsedNumber) && !groupMap[groupId].numbers.includes(parsedNumber)) {
          groupMap[groupId].numbers.push(parsedNumber);
        }
      });
    } else {
      const parsedNumber = Number(question.question_number);
      if (Number.isFinite(parsedNumber) && !groupMap[groupId].numbers.includes(parsedNumber)) {
        groupMap[groupId].numbers.push(parsedNumber);
      }
    }

    if (!groupMap[groupId].title && question.passage_group_title) {
      groupMap[groupId].title = question.passage_group_title;
    }

    if (!groupMap[groupId].passage && question.passage) {
      groupMap[groupId].passage = question.passage;
    }

    if (!groupMap[groupId].imageUrl && question.image_url) {
      groupMap[groupId].imageUrl = question.image_url;
    }
  });

  Object.keys(groupMap).forEach(function (groupId) {
    const group = groupMap[groupId];

    group.numbers = group.numbers
      .map(Number)
      .filter(Number.isFinite)
      .sort(function (a, b) { return a - b; });

    if (!group.title && group.numbers.length > 1) {
      group.title = `[${group.numbers[0]}~${group.numbers[group.numbers.length - 1]}] 공통 지문`;
    }
  });

  return questionList.map(function (question) {
    if (!hasPassageGroup(question)) {
      return question;
    }

    const group = groupMap[question.passage_group_id];
    const groupNumbers = group && group.numbers.length
      ? group.numbers
      : question.passage_group_numbers;

    const currentNumber = Number(question.question_number);
    const indexInGroup = groupNumbers.indexOf(currentNumber);

    return {
      ...question,
      passage_group_title: question.passage_group_title || (group ? group.title : ""),
      passage_group_numbers: groupNumbers,
      shared_passage_index: question.shared_passage_index || (indexInGroup >= 0 ? indexInGroup + 1 : null),
      shared_passage_total: question.shared_passage_total || (groupNumbers ? groupNumbers.length : null),
      shared_passage: question.shared_passage || (group ? group.passage : question.passage),
      shared_image_url: question.shared_image_url || (group ? group.imageUrl : question.image_url)
    };
  });
}

function hasPassageGroup(question) {
  return Boolean(
    question &&
    question.passage_group_id &&
    !question.independent_under_same_instruction
  );
}

function getSharedPassage(question) {
  return question.shared_passage || question.passage || "";
}

function getSharedImageUrl(question) {
  return question.shared_image_url || question.image_url || "";
}

function generateFallbackQuestions() {
  const generated = [];

  for (
    let number = TEST_CONFIG.questionNumberStart;
    number <= TEST_CONFIG.questionNumberEnd;
    number += 1
  ) {
    const meta = getDefaultQuestionMeta(number);

    generated.push({
      id: `R${String(number).padStart(3, "0")}`,
      question_number: number,
      test_level: TEST_CONFIG.testLevel,
      section: TEST_CONFIG.section,
      type: meta.type,
      passage: getDefaultPassage(number, meta.type),
      question: getDefaultQuestionText(number, meta.type),
      options: getDefaultOptions(number, meta.type),
      answer: 1,
      category: meta.category,
      diagnostic_area: meta.diagnosticArea,
      description: `${number}번 실제 문제 해설 또는 진단 설명을 여기에 입력하세요.`,
      image_url: "",
      sentence_items: meta.type === "sentence_order" ? getDefaultSentenceItems(number) : undefined,
      correct_order: meta.type === "sentence_order" ? ["(가)", "(나)", "(다)", "(라)"] : undefined
    });
  }

  return generated;
}

function getDefaultQuestionMeta(questionNumber) {
  if (questionNumber >= 31 && questionNumber <= 34) {
    return {
      type: "blank_choice",
      category: "빈칸 채우기",
      diagnosticArea: "문맥에 맞는 어휘·문법 선택"
    };
  }

  if (questionNumber >= 35 && questionNumber <= 38) {
    return {
      type: "not_matching",
      category: "내용 불일치 파악",
      diagnosticArea: "글의 내용과 다른 정보 찾기"
    };
  }

  if (questionNumber >= 39 && questionNumber <= 42) {
    return {
      type: "main_idea",
      category: "중심 내용 파악",
      diagnosticArea: "글의 중심 생각 이해"
    };
  }

  if (questionNumber >= 43 && questionNumber <= 46) {
    return {
      type: "sentence_order",
      category: "문장 순서 배열",
      diagnosticArea: "문장의 논리적 순서 이해"
    };
  }

  if (questionNumber >= 47 && questionNumber <= 50) {
    return {
      type: "detail",
      category: "세부 정보 파악",
      diagnosticArea: "지문 속 구체적 정보 이해"
    };
  }

  if (questionNumber >= 51 && questionNumber <= 56) {
    return {
      type: "notice",
      category: "생활문 정보 파악",
      diagnosticArea: "안내문·광고문 핵심 정보 이해"
    };
  }

  if (questionNumber >= 57 && questionNumber <= 60) {
    return {
      type: "practical_text",
      category: "실용문 이해",
      diagnosticArea: "편지·메모·공지의 목적과 내용 이해"
    };
  }

  if (questionNumber >= 61 && questionNumber <= 64) {
    return {
      type: "long_passage_detail",
      category: "긴 지문 세부 이해",
      diagnosticArea: "긴 글에서 세부 정보 찾기"
    };
  }

  return {
    type: "long_passage_inference",
    category: "긴 지문 추론",
    diagnosticArea: "긴 글의 내용 관계와 추론 이해"
  };
}

function getDefaultPassage(questionNumber, type) {
  if (type === "blank_choice") {
    return `실제 TOPIK I 읽기 ${questionNumber}번 지문을 여기에 입력하세요. (   )`;
  }

  if (type === "sentence_order") {
    return "";
  }

  return `실제 TOPIK I 읽기 ${questionNumber}번 지문을 여기에 입력하세요.`;
}

function getDefaultQuestionText(questionNumber, type) {
  if (type === "blank_choice") {
    return "빈칸에 들어갈 말로 가장 알맞은 것을 고르십시오.";
  }

  if (type === "not_matching") {
    return "글의 내용과 다른 것을 고르십시오.";
  }

  if (type === "main_idea") {
    return "이 글의 중심 생각으로 알맞은 것을 고르십시오.";
  }

  if (type === "sentence_order") {
    return "오른쪽의 문장을 왼쪽으로 끌어 놓아 순서를 맞추십시오.";
  }

  return `${questionNumber}번 문제 질문을 여기에 입력하세요.`;
}

function getDefaultOptions(questionNumber, type) {
  if (type === "sentence_order") {
    return [];
  }

  return [
    `${questionNumber}번 보기 1`,
    `${questionNumber}번 보기 2`,
    `${questionNumber}번 보기 3`,
    `${questionNumber}번 보기 4`
  ];
}

function getDefaultSentenceItems(questionNumber) {
  return [
    { label: "(가)", text: `실제 TOPIK I 읽기 ${questionNumber}번 문장 배열 자료를 여기에 입력하세요.` },
    { label: "(나)", text: "두 번째 문장을 여기에 입력하세요." },
    { label: "(다)", text: "세 번째 문장을 여기에 입력하세요." },
    { label: "(라)", text: "네 번째 문장을 여기에 입력하세요." }
  ];
}

function normalizeOrderChoiceOrders(rawValue) {
  if (Array.isArray(rawValue)) {
    return rawValue;
  }

  if (rawValue && typeof rawValue === "object") {
    return Object.keys(rawValue)
      .sort(function (a, b) {
        return Number(a) - Number(b);
      })
      .map(function (key) {
        return rawValue[key];
      })
      .filter(Array.isArray);
  }

  return undefined;
}

function normalizeStringArrayAlias(primaryValue, fallbackValue1, fallbackValue2) {
  if (Array.isArray(primaryValue)) {
    return primaryValue;
  }

  if (Array.isArray(fallbackValue1)) {
    return fallbackValue1;
  }

  if (Array.isArray(fallbackValue2)) {
    return fallbackValue2;
  }

  return undefined;
}

function normalizeQuestions(data) {
  if (!Array.isArray(data)) {
    throw new Error("문항 데이터는 배열이어야 합니다.");
  }

  return data.map(function (question, index) {
    const questionNumber =
      Number(question.question_number) ||
      TEST_CONFIG.questionNumberStart + index;

    const id =
      question.id ||
      `R${String(questionNumber).padStart(3, "0")}`;

    const normalizedOrderChoiceOrders =
      normalizeOrderChoiceOrders(
        question.order_choice_orders ||
        question.choice_orders ||
        question.order_choices
      );

    return {
      id,
      question_number: questionNumber,
      test_level: question.test_level || TEST_CONFIG.testLevel,
      section: question.section || TEST_CONFIG.section,
      type: normalizeQuestionType(question.type || "multiple_choice"),
      passage: question.passage || "",
      question: question.question || "",
      instruction: question.instruction || "",
      options: Array.isArray(question.options) ? question.options : [],
      answer: question.answer === undefined ? null : Number(question.answer),
      points: getQuestionPoints(questionNumber, question.points || question.score),
      category: question.category || "미분류",
      diagnostic_area: question.diagnostic_area || "미분류",
      description: question.description || "",
      image_url: question.image_url || "",
      passage_group_id: question.passage_group_id || question.group_id || question.shared_passage_id || "",
      passage_group_title: question.passage_group_title || question.group_title || question.shared_passage_title || "",
      passage_group_numbers: Array.isArray(question.passage_group_numbers)
        ? question.passage_group_numbers.map(Number)
        : Array.isArray(question.group_question_numbers)
          ? question.group_question_numbers.map(Number)
          : [],
      shared_passage: question.shared_passage || question.common_passage || question.group_passage || "",
      shared_image_url: question.shared_image_url || question.common_image_url || question.group_image_url || "",
      shared_passage_role: question.shared_passage_role || "",
      shared_passage_index: question.shared_passage_index || null,
      shared_passage_total: question.shared_passage_total || null,
      independent_under_same_instruction: Boolean(question.independent_under_same_instruction),
      sentence_items: normalizeStringArrayAlias(
        question.sentence_items,
        question.sentences,
        question.order_sentences
      ),
      correct_order: normalizeStringArrayAlias(
        question.correct_order,
        question.correct_sequence,
        question.answer_order
      ),
      order_choice_orders: normalizedOrderChoiceOrders,
      start_candidate_labels: Array.isArray(question.start_candidate_labels)
        ? question.start_candidate_labels
        : undefined,
      insert_sentence:
        question.insert_sentence ||
        question.sentence_to_insert ||
        question.target_sentence ||
        "",
      insert_positions: normalizeStringArrayAlias(
        question.insert_positions,
        question.insert_markers,
        question.markers
      ),
      correct_position:
        question.correct_position ||
        question.answer_position ||
        "",
      source_bank_id: question.source_bank_id || "",
      source_set_id: question.source_set_id || "",
      generated_exam_id: question.generated_exam_id || "",
      template_slot:
        question.template_slot === undefined ||
        question.template_slot === null ||
        question.template_slot === ""
          ? questionNumber
          : Number(question.template_slot)
    };
  });
}

function normalizeQuestionType(type) {
  const value = String(type || "").trim();

  if (["sentence_insert", "insert_sentence", "sentence_position", "insertion_position", "position_insert"].includes(value)) {
    return "sentence_insert";
  }

  if ([
    "inline_blank",
    "inline_blank_choice",
    "blank",
    "blank_select",
    "grammar_blank",
    "vocabulary_blank",
    "grammar_choice",
    "vocabulary_choice",
    "vocabulary_grammar",
    "grammar_expression",
    "particle_blank",
    "blank_grammar",
    "blank_vocabulary"
  ].includes(value)) {
    return "blank_choice";
  }

  if (["visual_not_matching", "image_not_matching", "image_choice"].includes(value)) {
    return "visual_not_matching";
  }

  if (["topic", "subject_choice", "topic_choice", "topic_content"].includes(value)) {
    return "topic_content";
  }

  if (["same_content", "content_same"].includes(value)) {
    return "same_content";
  }

  if (["common_passage_blank_choice", "shared_passage_blank_choice", "paired_passage_blank_choice", "common_blank_choice"].includes(value)) {
    return "common_passage_blank_choice";
  }

  if (["common_passage_question", "common_passage", "shared_passage_question", "paired_passage", "two_question_passage", "paired_detail"].includes(value)) {
    return "common_passage_question";
  }

  return value;
}

function validateQuestions(data) {
  if (data.length === 0) {
    throw new Error("문항이 1개 이상 필요합니다.");
  }

  data.forEach(function (question, index) {
    const requiredFields = [
      "id",
      "question_number",
      "test_level",
      "section",
      "type",
      "passage",
      "question",
      "options",
      "category",
      "diagnostic_area",
      "description",
      "image_url"
    ];

    requiredFields.forEach(function (field) {
      if (!(field in question)) {
        throw new Error(`${index + 1}번째 문항에 ${field} 필드가 없습니다.`);
      }
    });

    if (question.test_level !== TEST_CONFIG.testLevel) {
      throw new Error(`${question.id} 문항의 test_level이 TOPIK I이 아닙니다.`);
    }

    if (question.section !== TEST_CONFIG.section) {
      throw new Error(`${question.id} 문항의 section이 reading이 아닙니다.`);
    }

    if (question.type === "sentence_order") {
      return;
    }

    if (!Array.isArray(question.options) || question.options.length !== 4) {
      throw new Error(`${question.id} 문항의 options는 4개 배열이어야 합니다.`);
    }

    if (![1, 2, 3, 4].includes(Number(question.answer))) {
      throw new Error(`${question.id} 문항의 answer는 1~4 사이 숫자여야 합니다.`);
    }
  });
}
function getQuestionTraceFields(question) {
  const templateSlot =
    question.template_slot === undefined ||
    question.template_slot === null ||
    question.template_slot === ""
      ? Number(question.question_number)
      : Number(question.template_slot);

  return {
    source_bank_id: question.source_bank_id || null,
    source_set_id: question.source_set_id || null,
    generated_exam_id: question.generated_exam_id || null,
    template_slot: Number.isFinite(templateSlot)
      ? templateSlot
      : Number(question.question_number)
  };
}
function isWrongReviewMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("mode") === "wrong-review";
}
function parseJsonSafely(raw, fallbackValue) {
  try {
    return raw ? JSON.parse(raw) : fallbackValue;
  } catch (error) {
    console.error("localStorage JSON 파싱 실패:", error);
    return fallbackValue;
  }
}

function getWrongReviewStoragePackage() {
  return parseJsonSafely(
    localStorage.getItem(WRONG_REVIEW_SOURCE_RESULT_STORAGE_KEY),
    null
  );
}

function getWrongReviewSourceResult() {
  const reviewPackage = getWrongReviewStoragePackage();

  if (
    reviewPackage &&
    reviewPackage.source_result &&
    Array.isArray(reviewPackage.source_result.items)
  ) {
    return reviewPackage.source_result;
  }

  if (reviewPackage && Array.isArray(reviewPackage.items)) {
    return reviewPackage;
  }

  const latestLevelTestResult = parseJsonSafely(
    localStorage.getItem(LEVEL_TEST_RESULT_STORAGE_KEY),
    null
  );

  if (latestLevelTestResult && Array.isArray(latestLevelTestResult.items)) {
    const storedNumbers = parseJsonSafely(
      localStorage.getItem(WRONG_REVIEW_QUESTION_NUMBERS_STORAGE_KEY),
      null
    );

    if (Array.isArray(storedNumbers) && storedNumbers.length > 0) {
      return latestLevelTestResult;
    }
  }

  const latestResult = parseJsonSafely(
    localStorage.getItem(AUTO_DIAGNOSIS_STORAGE_KEY),
    null
  );

  if (latestResult && Array.isArray(latestResult.items)) {
    return latestResult;
  }

  return null;
}

function getWrongReviewReturnDiagnosisUrl() {
  const sourceResult = getWrongReviewSourceResult();

  if (sourceResult && isLevelTestResult(sourceResult)) {
    return LEVEL_TEST_DIAGNOSIS_URL;
  }

  return AUTO_DIAGNOSIS_URL;
}

function getWrongReviewNumbers(sourceResult) {
  const storedRaw = localStorage.getItem(
    WRONG_REVIEW_QUESTION_NUMBERS_STORAGE_KEY
  );

  const storedNumbers = parseJsonSafely(storedRaw, null);

  if (Array.isArray(storedNumbers)) {
    return Array.from(
      new Set(
        storedNumbers
          .map(Number)
          .filter(Number.isFinite)
      )
    ).sort(function (a, b) {
      return a - b;
    });
  }

  const reviewPackage = getWrongReviewStoragePackage();

  if (
    reviewPackage &&
    Array.isArray(reviewPackage.remaining_wrong_review_question_numbers)
  ) {
    return Array.from(
      new Set(
        reviewPackage.remaining_wrong_review_question_numbers
          .map(Number)
          .filter(Number.isFinite)
      )
    ).sort(function (a, b) {
      return a - b;
    });
  }

  if (sourceResult && Array.isArray(sourceResult.items)) {
    return Array.from(
      new Set(
        sourceResult.items
          .filter(function (item) {
            return !item.is_correct;
          })
          .map(function (item) {
            return Number(item.question_number);
          })
          .filter(Number.isFinite)
      )
    ).sort(function (a, b) {
      return a - b;
    });
  }

  return [];
}

function convertResultItemToQuestion(item) {
  const questionNumber = Number(item.question_number);
  const sentenceOrderResult = item.sentence_order_result || {};
  const sentenceInsertResult = item.sentence_insert_result || {};
  const safeOptions = Array.isArray(item.options) ? item.options : [];

  const sentenceItems = Array.isArray(sentenceOrderResult.sentence_items)
    ? sentenceOrderResult.sentence_items
    : Array.isArray(item.sentence_items)
      ? item.sentence_items
      : undefined;

  const correctOrder = Array.isArray(item.correct_order)
    ? item.correct_order
    : Array.isArray(sentenceOrderResult.correct_order)
      ? sentenceOrderResult.correct_order
      : undefined;

  const insertPositionLabels = Array.isArray(sentenceInsertResult.position_labels)
    ? sentenceInsertResult.position_labels
    : safeOptions;

  const correctPosition =
    item.correct_position ||
    sentenceInsertResult.correct_position ||
    "";

  const correctAnswerNumber = Number(item.correct_answer);
  let answerValue = Number.isFinite(correctAnswerNumber)
    ? correctAnswerNumber
    : null;

  if (
    item.type === "sentence_insert" &&
    answerValue === null &&
    correctPosition &&
    Array.isArray(insertPositionLabels)
  ) {
    const positionIndex = insertPositionLabels.findIndex(function (label) {
      return String(label).trim() === String(correctPosition).trim();
    });

    if (positionIndex >= 0) {
      answerValue = positionIndex + 1;
    }
  }

  return {
    id: item.id || `WR-R${String(questionNumber).padStart(3, "0")}`,
    question_number: questionNumber,
    test_level: TEST_CONFIG.testLevel,
    section: TEST_CONFIG.section,
    type: item.type || "same_content",
    instruction: item.instruction || item.question || "",
    passage: item.passage || "",
    question: item.question || "",
    options: safeOptions,
    answer: answerValue,
    correct_answer: item.correct_answer,
    points: getQuestionPoints(questionNumber, item.points),
    category: item.category || "미분류",
    diagnostic_area: item.diagnostic_area || "미분류",
    description: item.description || "",
    image_url: item.image_url || "",
    passage_group_id: item.passage_group_id || "",
    passage_group_title: item.passage_group_title || "",
    passage_group_numbers: Array.isArray(item.passage_group_numbers)
      ? item.passage_group_numbers.map(Number)
      : [],
    shared_passage: item.passage || "",
    shared_image_url: item.image_url || "",
    shared_passage_index: item.shared_passage_index || null,
    shared_passage_total: item.shared_passage_total || null,
    sentence_items: sentenceItems,
    correct_order: correctOrder,
    insert_sentence:
      item.insert_sentence ||
      sentenceInsertResult.insert_sentence ||
      "",
    insert_positions:
      Array.isArray(item.insert_positions)
        ? item.insert_positions
        : insertPositionLabels,
    correct_position: correctPosition,
    source_bank_id: item.source_bank_id || "",
    source_set_id: item.source_set_id || "",
    generated_exam_id: item.generated_exam_id || "",
    template_slot:
      item.template_slot === undefined ||
      item.template_slot === null ||
      item.template_slot === ""
        ? questionNumber
        : Number(item.template_slot)
  };
}

function buildWrongReviewQuestions(sourceResult, reviewNumbers) {
  if (!sourceResult || !Array.isArray(sourceResult.items)) {
    return [];
  }

  const numberSet = new Set(
    reviewNumbers
      .map(Number)
      .filter(Number.isFinite)
  );

  const convertedQuestions = sourceResult.items
    .filter(function (item) {
      return numberSet.has(Number(item.question_number));
    })
    .map(convertResultItemToQuestion);

  const groupNumberMap = {};

  convertedQuestions.forEach(function (question) {
    if (!question.passage_group_id) {
      return;
    }

    if (!groupNumberMap[question.passage_group_id]) {
      groupNumberMap[question.passage_group_id] = [];
    }

    if (!groupNumberMap[question.passage_group_id].includes(question.question_number)) {
      groupNumberMap[question.passage_group_id].push(question.question_number);
    }
  });

  return convertedQuestions.map(function (question) {
    if (!question.passage_group_id || !groupNumberMap[question.passage_group_id]) {
      return question;
    }

    return {
      ...question,
      passage_group_numbers: groupNumberMap[question.passage_group_id].sort(function (a, b) {
        return a - b;
      })
    };
  });
}
function showWrongReviewBackButton() {
  if (!elements.wrongReviewBackButton) {
    return;
  }

  elements.wrongReviewBackButton.style.display = "inline-flex";
  elements.wrongReviewBackButton.removeAttribute("aria-hidden");
  elements.wrongReviewBackButton.tabIndex = 0;
}

function hideWrongReviewBackButton() {
  if (!elements.wrongReviewBackButton) {
    return;
  }

  elements.wrongReviewBackButton.style.display = "none";
  elements.wrongReviewBackButton.setAttribute("aria-hidden", "true");
  elements.wrongReviewBackButton.tabIndex = -1;
}
function gradeWrongReviewQuestionForProgress(question) {
  if (!question) {
    return null;
  }

  if (question.type === "sentence_order") {
    return gradeSentenceOrderQuestion(question);
  }

  if (question.type === "sentence_insert") {
    return gradeSentenceInsertQuestion(question);
  }

  const studentAnswer = answers[question.id] || null;
  const correctAnswer = Number(question.answer);
  const points = getQuestionPoints(question.question_number, question.points);
  const isCorrect = studentAnswer === correctAnswer;

  return {
    question_number: question.question_number,
    is_answered: isQuestionAnswered(question),
    is_correct: isCorrect,
    student_answer: studentAnswer,
    correct_answer: correctAnswer,
    points,
    earned_points: isCorrect ? points : 0
  };
}

function saveWrongReviewProgressBeforeReturn() {
  if (currentRunMode !== "wrong_review") {
    return [];
  }

  const progressItems = questions
    .map(gradeWrongReviewQuestionForProgress)
    .filter(Boolean);

  const remainingNumbers = progressItems
    .filter(function (item) {
      return !item.is_correct;
    })
    .map(function (item) {
      return Number(item.question_number);
    })
    .filter(Number.isFinite)
    .sort(function (a, b) {
      return a - b;
    });

  const existingPackage = getWrongReviewStoragePackage();
  const existingSourceResult =
    existingPackage && existingPackage.source_result
      ? existingPackage.source_result
      : getWrongReviewSourceResult();

  localStorage.setItem(
    WRONG_REVIEW_QUESTION_NUMBERS_STORAGE_KEY,
    JSON.stringify(remainingNumbers)
  );

  localStorage.setItem(
    WRONG_REVIEW_SOURCE_RESULT_STORAGE_KEY,
    JSON.stringify({
      saved_at: new Date().toISOString(),
      source: "reading-test-wrong-review-partial-return",
      source_result: existingSourceResult,
      latest_wrong_review_partial_progress: {
        saved_at: new Date().toISOString(),
        total_review_questions: questions.length,
        answered_count: progressItems.filter(function (item) {
          return item.is_answered;
        }).length,
        remaining_wrong_review_question_numbers: remainingNumbers,
        items: progressItems
      },
      remaining_wrong_review_question_numbers: remainingNumbers
    })
  );

  console.info("오답풀이 중간 진행 저장 완료:", {
    remainingNumbers,
    progressItems
  });

  return remainingNumbers;
}
function returnToDiagnosisFromWrongReview() {
  if (currentRunMode !== "wrong_review") {
    window.location.href =
      getWrongReviewReturnDiagnosisUrl() + "&v=return-normal-" + Date.now();
    return;
  }

  const ok = confirm(
    [
      "오답풀이를 중간 종료하고 진단 보고서로 돌아가시겠습니까?",
      "",
      "현재까지 푼 문항은 바로 채점됩니다.",
      "맞힌 문항은 남은 오답풀이 목록에서 제외됩니다.",
      "틀린 문항과 미응답 문항은 다음 오답풀이에 다시 나옵니다."
    ].join("\n")
  );

  if (!ok) {
    return;
  }

  stopTimer();

  const remainingNumbers = saveWrongReviewProgressBeforeReturn();

  console.info("오답풀이 중간 종료 후 진단 보고서 이동:", {
    remainingNumbers
  });

  window.location.href =
    getWrongReviewReturnDiagnosisUrl() + "&v=return-wrong-review-" + Date.now();
}
function startWrongReviewMode() {
  const sourceResult = getWrongReviewSourceResult();

  if (!sourceResult) {
    if (elements.startMessage) {
      elements.startMessage.textContent =
        "오답풀이 원본 결과가 없습니다. 먼저 읽기 진단 보고서에서 오답 다시 풀기를 눌러 주세요.";
    }

    console.warn("오답풀이 원본 결과가 없습니다.");
    return;
  }

  if (sourceResult.test_level && sourceResult.test_level !== TEST_CONFIG.testLevel) {
    if (elements.startMessage) {
      elements.startMessage.textContent =
        "TOPIK I 읽기 결과가 아닙니다. TOPIK I 결과로 다시 진단하세요.";
    }

    console.warn("TOPIK I 결과가 아닌 데이터입니다.", sourceResult.test_level);
    return;
  }

  if (sourceResult.section && sourceResult.section !== TEST_CONFIG.section) {
    if (elements.startMessage) {
      elements.startMessage.textContent =
        "읽기 결과가 아닙니다. reading-result.json을 확인하세요.";
    }

    console.warn("reading 결과가 아닌 데이터입니다.", sourceResult.section);
    return;
  }

  const reviewNumbers = getWrongReviewNumbers(sourceResult);
  const reviewQuestions = buildWrongReviewQuestions(sourceResult, reviewNumbers);

  if (reviewQuestions.length === 0) {
    localStorage.setItem(
      WRONG_REVIEW_QUESTION_NUMBERS_STORAGE_KEY,
      JSON.stringify([])
    );

    if (elements.startMessage) {
      elements.startMessage.textContent =
        "남은 오답풀이 문항이 없습니다. 진단 보고서로 돌아가 확인하세요.";
    }

    console.info("남은 오답풀이 문항이 없습니다.");
    return;
  }

  currentRunMode = "wrong_review";

  questions = enrichPassageGroups(normalizeQuestions(reviewQuestions));
  sortQuestionsByNumber();

  studentName = sourceResult.student_name || "오답풀이";
  studentPhone = sourceResult.student_phone || "";
  startedAt = new Date().toISOString();
  submittedAt = "";
  answers = {};
  reviewMarks = {};
  sentenceOrderAnswers = {};
  selectedSentenceForOrder = null;
  remainingSeconds = TEST_CONFIG.timeLimitSeconds;
  latestResult = null;
  latestResultText = "";

  latestExamGenerationOptions = {
    mode: "wrong_review",
    round: sourceResult.generated_exam_round || "",
    label: "오답 다시 풀기",
    exam_type: "wrong_review",
    question_count: questions.length,
    time_limit_minutes: TEST_CONFIG.timeLimitMinutes
  };

  currentIndex = 0;

  if (elements.studentNameDisplay) {
    elements.studentNameDisplay.textContent = studentName;
  }

  if (elements.studentPhoneDisplay) {
    elements.studentPhoneDisplay.textContent = studentPhone;
  }

  closeQuestionList();
  showWrongReviewBackButton();
  showScreen("test");
  renderTimer();
  renderQuestion();
  startTimer();

  console.info("TOPIK I 오답풀이 모드 시작:", {
    reviewNumbers,
    totalQuestions: questions.length
  });

  window.scrollTo({ top: 0, behavior: "auto" });
}

async function startTest() {
  currentRunMode = "normal";

  const name = elements.studentNameInput.value.trim();
  const phone = elements.studentPhoneInput.value.trim();

  if (!name) {
    elements.startMessage.textContent = "응시자 이름을 입력하세요.";
    elements.studentNameInput.focus();
    return;
  }

  if (!phone) {
    elements.startMessage.textContent = "전화번호를 입력하세요.";
    elements.studentPhoneInput.focus();
    return;
  }

  if (!questions.length) {
    elements.startMessage.textContent = "문항 데이터를 불러오는 중입니다. 잠시 후 다시 시작하세요.";
    return;
  }

  const originalStartButtonText = elements.startButton
    ? elements.startButton.textContent
    : "";

  try {
    if (elements.startButton) {
      elements.startButton.disabled = true;
      elements.startButton.textContent = "시험지 확인 중...";
    }

    elements.startMessage.textContent = "선택한 시험지를 확인하고 있습니다.";

    const generatedExamInfo = await generateSelectedExamForCurrentSelection();

    currentRunMode = isLevelTestExamOptions(latestExamGenerationOptions)
      ? "leveltest"
      : "normal";

    console.info("TOPIK I Reading 시험 시작 전 시험지 적용 완료:", generatedExamInfo);
  } catch (error) {
    console.error("시험 시작 전 시험지 적용 실패:", error);
    elements.startMessage.textContent =
      error.message || "선택한 시험지를 불러오지 못했습니다. 잠시 후 다시 시도하세요.";

    if (elements.startButton) {
      elements.startButton.disabled = false;
      elements.startButton.textContent = originalStartButtonText;
    }

    return;
  }

  if (elements.startButton) {
    elements.startButton.disabled = false;
    elements.startButton.textContent = originalStartButtonText;
  }

  hideWrongReviewBackButton();

  studentName = name;
  studentPhone = phone;
  startedAt = new Date().toISOString();
  submittedAt = "";
  answers = {};
  reviewMarks = {};
  sentenceOrderAnswers = {};
  selectedSentenceForOrder = null;
  remainingSeconds = getActiveTimeLimitSeconds();
  latestResult = null;
  latestResultText = "";
  elements.startMessage.textContent = "";

  sortQuestionsByNumber();
  currentIndex = getStartQuestionIndex();

  if (elements.studentNameDisplay) {
    elements.studentNameDisplay.textContent = studentName;
  }

  if (elements.studentPhoneDisplay) {
    elements.studentPhoneDisplay.textContent = studentPhone;
  }

  closeQuestionList();
  showScreen("test");
  renderTimer();
  renderQuestion();
  startTimer();

  window.scrollTo({ top: 0, behavior: "auto" });
}

function getStartQuestionIndex() {
  const startIndex = questions.findIndex(function (question) {
    return Number(question.question_number) === TEST_CONFIG.questionNumberStart;
  });

  return startIndex >= 0 ? startIndex : 0;
}

function startTimer() {
  stopTimer();

  timerId = window.setInterval(function () {
    remainingSeconds -= 1;
    renderTimer();

    if (remainingSeconds <= 0) {
      stopTimer();
      alert("시험 시간이 종료되어 자동 제출됩니다.");
      submitTest(currentRunMode === "wrong_review" ? "wrong_review" : "time_over");
    }
  }, 1000);
}

function stopTimer() {
  if (timerId !== null) {
    window.clearInterval(timerId);
    timerId = null;
  }
}

function renderTimer() {
  const safeSeconds = Math.max(0, remainingSeconds);
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  elements.timerDisplay.textContent =
    `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  elements.timerCard.classList.remove("warning", "danger");

  if (safeSeconds <= 60) {
    elements.timerCard.classList.add("danger");
  } else if (safeSeconds <= 5 * 60) {
    elements.timerCard.classList.add("warning");
  }
}

function renderQuestion() {
  if (currentIndex < 0 || currentIndex >= questions.length) {
    currentIndex = getStartQuestionIndex();
  }

  const question = questions[currentIndex];

  if (!question) {
    return;
  }

   renderQuestionInstruction(question);
  renderQuestionStage(question);

  highlightNegativeQuestionWordsInRenderedDom();
  highlightBlankParenthesesInRenderedDom();
  highlightInsertedAnswersInCurrentStage(question);

  window.setTimeout(function () {
    highlightNegativeQuestionWordsInRenderedDom();
    highlightBlankParenthesesInRenderedDom();
    highlightInsertedAnswersInCurrentStage(question);
  }, 0);

  renderNavigationButtons();
  renderReviewButton(question);
  renderProgress();
  renderAnswerStatus();
}


function getQuestionDisplayLabel(question) {
  if (
    Array.isArray(question.passage_group_numbers) &&
    question.passage_group_numbers.length > 1
  ) {
    const sortedNumbers = question.passage_group_numbers
      .map(Number)
      .filter(Number.isFinite)
      .sort(function (a, b) { return a - b; });

    if (sortedNumbers.length > 1) {
      return `[${sortedNumbers[0]}~${sortedNumbers[sortedNumbers.length - 1]}]`;
    }
  }

  return `[${question.question_number}]`;
}

function getQuestionLocalLabel(question) {
  if (
    Array.isArray(question.passage_group_numbers) &&
    question.passage_group_numbers.length > 1
  ) {
    return `${question.question_number}번`;
  }

  return "";
}

function buildPassageGroupHeader(question) {
  // 학생 화면 단순화:
  // 공통 지문 세트의 "문항 이동 49번 50번" 영역은 삭제한다.
  // 문항 이동은 기존 하단 이전/다음 버튼으로 처리한다.
  return "";
}

function bindPassageGroupButtons() {
  elements.questionStage.querySelectorAll("[data-group-question-number]").forEach(function (button) {
    button.addEventListener("click", function () {
      const targetNumber = Number(button.dataset.groupQuestionNumber);
      const targetIndex = questions.findIndex(function (item) {
        return Number(item.question_number) === targetNumber;
      });

      if (targetIndex >= 0) {
        currentIndex = targetIndex;
        renderQuestion();
        window.scrollTo({ top: 0, behavior: "auto" });
      }
    });
  });
}

function buildQuestionNumberLabelForPanel(question) {
  // 학생 화면 단순화:
  // TOPIK II식 화면과 맞추기 위해 문제 패널 안의 "31번 문제" 보조 라벨은 표시하지 않는다.
  // 상단 지시문에 이미 [31], [32]처럼 문항 번호가 나오므로 중복 표시를 제거한다.
  return "";
}

function getCommonSetQuestionPanelTitle(question) {
  const questionNumber = Number(question && question.question_number);

  if (Number.isFinite(questionNumber)) {
    return `${questionNumber}번 문제`;
  }

  return "문제";
}
function buildNegativeQuestionTextHtml(text) {
  const sourceText = String(text || "");
  const escapedText = escapeHtml(sourceText);

  const highlightStyle = `
    color:#d93025;
    -webkit-text-fill-color:#d93025;
    font-weight:900;
  `;

  return escapedText
    .replaceAll(
      "맞지 않는 것",
      `<span style="${highlightStyle}">맞지 않는 것</span>`
    )
    .replaceAll(
      "내용과 다른 것",
      `내용과 <span style="${highlightStyle}">다른 것</span>`
    )
    .replaceAll(
      "다른 것을",
      `<span style="${highlightStyle}">다른 것</span>을`
    );
}
function highlightNegativeQuestionWordsInRenderedDom() {
  const targetRoots = [
    elements.questionInstruction,
    elements.questionStage
  ].filter(Boolean);

  const targetPhrases = [
    "맞지 않는 것",
    "다른 것"
  ];

  targetRoots.forEach(function (rootElement) {
    targetPhrases.forEach(function (phrase) {
      highlightTextPhraseInsideElement(rootElement, phrase);
    });
  });
}

function highlightTextPhraseInsideElement(rootElement, targetText) {
  if (!rootElement || !targetText) {
    return;
  }

  const walker = document.createTreeWalker(
    rootElement,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function (node) {
        if (!node || !node.nodeValue || !node.nodeValue.includes(targetText)) {
          return NodeFilter.FILTER_REJECT;
        }

        const parentElement = node.parentElement;

        if (
          parentElement &&
          parentElement.closest &&
          parentElement.closest(
            ".negative-question-highlight, button, .option-button, input, select"
          )
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const matchingNodes = [];

  while (walker.nextNode()) {
    matchingNodes.push(walker.currentNode);
  }

  matchingNodes.forEach(function (textNode) {
    const sourceText = textNode.nodeValue;
    const pieces = sourceText.split(targetText);

    if (pieces.length <= 1) {
      return;
    }

    const fragment = document.createDocumentFragment();

    pieces.forEach(function (piece, index) {
      if (piece) {
        fragment.appendChild(document.createTextNode(piece));
      }

      if (index < pieces.length - 1) {
        const highlightSpan = document.createElement("span");
        highlightSpan.className = "negative-question-highlight";
        highlightSpan.textContent = targetText;
        highlightSpan.style.setProperty("color", "#d93025", "important");
        highlightSpan.style.setProperty("-webkit-text-fill-color", "#d93025", "important");
        highlightSpan.style.setProperty("font-weight", "900", "important");
        fragment.appendChild(highlightSpan);
      }
    });

    textNode.parentNode.replaceChild(fragment, textNode);
  });
}
function getQuestionTextForPanel(question, fallbackText) {
  const questionNumber = Number(question && question.question_number);
  const rawText = String(question && question.question ? question.question : "").trim();
  const safeFallback = fallbackText || "물음에 답하십시오.";

  if (!rawText) {
    return safeFallback;
  }

  if (Number.isFinite(questionNumber)) {
    const placeholderPattern = new RegExp(
      "^\\s*\\[?" +
        questionNumber +
        "\\]?\\s*번\\s*(문제\\s*)?질문\\s*(을\\s*여기에\\s*입력하세요\\.?|[:：.]?\\s*)$"
    );

    if (placeholderPattern.test(rawText)) {
      return safeFallback;
    }

    const cleanedText = rawText
      .replace(
        new RegExp(
          "^\\s*\\[?" +
            questionNumber +
            "\\]?\\s*번\\s*(문제\\s*)?질문\\s*[:：]?\\s*"
        ),
        ""
      )
      .trim();

    if (cleanedText && !cleanedText.includes("여기에 입력하세요")) {
      return cleanedText;
    }

    if (!cleanedText || cleanedText.includes("여기에 입력하세요")) {
      return safeFallback;
    }
  }

  if (rawText.includes("여기에 입력하세요")) {
    return safeFallback;
  }

  return rawText;
}

function getNumberedQuestionTextForPanel(question, fallbackText) {
  const questionNumber = Number(question && question.question_number);
  const text = getQuestionTextForPanel(question, fallbackText);
  const cleanText = String(text || "").trim();

  if (!Number.isFinite(questionNumber)) {
    return cleanText;
  }

  if (new RegExp("^\\s*\\[\\s*" + questionNumber + "\\s*\\]").test(cleanText)) {
    return cleanText;
  }

  return `[${questionNumber}] ${cleanText}`;
}

function getNumberedQuestionTextHtml(question, fallbackText) {
  return buildNegativeQuestionTextHtml(
    getNumberedQuestionTextForPanel(question, fallbackText)
  );
}
function renderQuestionInstruction(question) {
  const number = question.question_number;
  const displayLabel = getQuestionDisplayLabel(question);

  function setInstructionHtml(text) {
    elements.questionInstruction.innerHTML = buildNegativeQuestionTextHtml(text);
  }

  if (question.instruction) {
    const instructionText = String(question.instruction).trim();
    const alreadyHasRangeLabel = /^\[\d+\s*~\s*\d+\]/.test(instructionText);
    const alreadyHasNumberLabel =
      instructionText.startsWith(`[${number}]`) ||
      instructionText.startsWith(displayLabel);

    const finalText =
      alreadyHasRangeLabel || alreadyHasNumberLabel
        ? instructionText
        : `${displayLabel} ${instructionText}`;

    setInstructionHtml(finalText);
    return;
  }

  if (question.type === "common_passage_question" || hasPassageGroup(question)) {
    setInstructionHtml(`${displayLabel} 다음 글을 읽고 물음에 답하십시오.`);
    return;
  }

  if (question.type === "blank_choice") {
    setInstructionHtml(
      `[${number}] <보기>와 같이 빈칸에 들어갈 말로 가장 알맞은 것을 고르십시오.`
    );
    return;
  }

  if (question.type === "sentence_insert") {
    setInstructionHtml(
      `[${number}] 다음 문장이 들어갈 위치로 알맞은 곳을 고르십시오.`
    );
    return;
  }

  if (question.type === "not_matching") {
    setInstructionHtml(
      `[${number}] 다음 글을 읽고 내용과 다른 것을 고르십시오.`
    );
    return;
  }

  if (question.type === "topic_content") {
    setInstructionHtml(`[${number}] 무엇에 대한 내용입니까?`);
    return;
  }

  if (question.type === "main_idea") {
    setInstructionHtml(
      `[${number}] 다음 글을 읽고 중심 생각으로 알맞은 것을 고르십시오.`
    );
    return;
  }

  if (question.type === "sentence_order") {
    setInstructionHtml(`[${number}] 다음을 순서대로 맞게 배열하십시오.`);
    return;
  }

  if (question.type === "detail") {
    setInstructionHtml(
      `[${number}] 다음 글을 읽고 내용과 같은 것을 고르십시오.`
    );
    return;
  }

  if (question.type === "notice") {
    setInstructionHtml(
      `[${number}] 다음 안내문이나 광고문을 읽고 물음에 답하십시오.`
    );
    return;
  }

  if (question.type === "practical_text") {
    setInstructionHtml(`[${number}] 다음 글을 읽고 물음에 답하십시오.`);
    return;
  }

  if (question.type === "long_passage_detail") {
    setInstructionHtml(`[${number}] 다음 글을 읽고 물음에 답하십시오.`);
    return;
  }

  if (question.type === "long_passage_inference") {
    setInstructionHtml(`[${number}] 다음 글을 읽고 물음에 답하십시오.`);
    return;
  }

  setInstructionHtml(`[${number}] ${question.question}`);
}

function renderQuestionStage(question) {
  if (isCommonPassageBlankChoice(question) || isCommonBlankChoiceLikeQuestion(question)) {
    renderCommonPassageBlankChoiceQuestion(question);
    return;
  }

  if (question.type === "blank_choice" || isStandaloneBlankChoiceLikeQuestion(question)) {
    renderInlineBlankChoiceQuestion(question);
    return;
  }

  if (question.type === "sentence_insert") {
    renderSentenceInsertQuestion(question);
    return;
  }

  if (question.type === "sentence_order") {
    renderSentenceOrderQuestion(question);
    return;
  }

  if (question.type === "visual_not_matching") {
    renderVisualNotMatchingQuestion(question);
    return;
  }

  if (question.type === "common_passage_question" || hasPassageGroup(question)) {
    renderCommonPassageQuestion(question);
    return;
  }

  if (shouldRenderOneColumnChoice(question)) {
    renderOneColumnChoiceQuestion(question);
    return;
  }

  renderMultipleChoiceQuestion(question);
}

/* 31~34 빈칸 선택형: 선택지를 누르면 지문 빈칸에 직접 삽입 */
function renderInlineBlankChoiceQuestion(question) {
  const selectedOptionNumber = Number(answers[question.id]) || null;
  const selectedText = selectedOptionNumber ? question.options[selectedOptionNumber - 1] : "";

  const passageHtml = buildBlankPassageHtml(question.passage, selectedText);

  const optionsHtml = question.options.map(function (optionText, index) {
    const optionNumber = index + 1;
    const selectedClass = selectedOptionNumber === optionNumber ? " selected" : "";

    return `
      <button type="button" class="option-button${selectedClass}" data-option="${optionNumber}">
        ${optionNumber}. ${escapeHtml(optionText)}
      </button>
    `;
  }).join("");

  const groupHeaderHtml = buildPassageGroupHeader(question);
  const questionNumberLabelHtml = buildQuestionNumberLabelForPanel(question);

  elements.questionStage.innerHTML = `
    <div class="view-tab">보기</div>
    <div style="background:#ffffff; padding:22px 18px 26px; min-height:300px;">
      ${groupHeaderHtml}
      ${questionNumberLabelHtml}

      <div class="passage-content" data-passage-content="true" style="
        border:1px solid #e3e6ea;
        border-radius:14px;
        padding:20px;
        font-size:20px;
        line-height:2;
        min-height:92px;
        background:#ffffff;
      ">
        ${passageHtml}
      </div>

      <div style="
        margin-top:18px;
        border:1px solid #e3e6ea;
        border-radius:14px;
        background:#fbfcfe;
        padding:18px;
      ">
        <div class="options-area">
          ${optionsHtml}
        </div>
      </div>
    </div>
  `;

  elements.questionStage.querySelectorAll(".option-button").forEach(function (button) {
    button.addEventListener("click", function () {
      selectAnswer(question.id, Number(button.dataset.option));
    });
  });

  bindPassageGroupButtons();
}


function getBlankMarkerLabelForQuestion(question) {
  if (!question) {
    return "";
  }

  const searchText = [
    question.question,
    question.instruction,
    question.category,
    question.diagnostic_area
  ].map(function (value) {
    return String(value || "");
  }).join(" ");

  const circledLabels = ["㉠", "㉡", "㉢", "㉣", "㉤", "㉥"];

  for (const label of circledLabels) {
    if (searchText.includes(label)) {
      return label;
    }
  }

  const koreanCircleMap = {
    "기역": "㉠",
    "니은": "㉡",
    "디귿": "㉢",
    "리을": "㉣",
    "미음": "㉤",
    "비읍": "㉥"
  };

  for (const key of Object.keys(koreanCircleMap)) {
    if (searchText.includes(key)) {
      return koreanCircleMap[key];
    }
  }

  return "";
}

function getCurrentBlankMarkerLabelText() {
  const currentQuestion = Array.isArray(questions) ? questions[currentIndex] : null;
  const blankLabel = getBlankMarkerLabelForQuestion(currentQuestion);

  return blankLabel ? `(${blankLabel})` : "(　　　)";
}

function buildBlankPassageHtml(passage, selectedText) {
  let html = escapeHtml(passage || "");

  const insertedHtml = selectedText
    ? getInsertedAnswerHtml(selectedText)
    : "";

  const markerLabelText = getCurrentBlankMarkerLabelText();

  const blankMarkerHtml = selectedText
    ? insertedHtml
    : getTopikBlankMarkerHtml(markerLabelText, markerLabelText.includes("㉠") || markerLabelText.includes("㉡") || markerLabelText.includes("㉢") || markerLabelText.includes("㉣") || markerLabelText.includes("㉤") || markerLabelText.includes("㉥") ? 56 : 92);

  const circledBlankPatterns = [
    { regex: /\(\s*㉠\s*\)/g, label: "㉠" },
    { regex: /\(\s*㉡\s*\)/g, label: "㉡" },
    { regex: /\(\s*㉢\s*\)/g, label: "㉢" },
    { regex: /\(\s*㉣\s*\)/g, label: "㉣" },
    { regex: /㉠/g, label: "㉠" },
    { regex: /㉡/g, label: "㉡" },
    { regex: /㉢/g, label: "㉢" },
    { regex: /㉣/g, label: "㉣" }
  ];

  for (const item of circledBlankPatterns) {
    if (item.regex.test(html)) {
      item.regex.lastIndex = 0;

      const markerHtml = selectedText
        ? insertedHtml
        : getTopikBlankMarkerHtml(`(${item.label})`, 56);

      return html.replace(item.regex, markerHtml).replace(/\n/g, "<br>");
    }
  }

  /*
    TOPIK I 빈칸 표시 보강:
    - 데이터에 들어 있는 일반 공백, 특수 공백, &nbsp; 계열, 전각 괄호를 모두 빈칸으로 처리한다.
    - 학생이 빈칸 위치를 바로 찾을 수 있도록 괄호 전체를 빨간 계열 박스로 표시한다.
  */
  const genericBlankRegexes = getStrongBlankRegexes("g");

  let replaced = false;

  genericBlankRegexes.forEach(function (regex) {
    regex.lastIndex = 0;
    const beforeReplaceHtml = html;
    html = html.replace(regex, blankMarkerHtml);
    if (html !== beforeReplaceHtml) {
      replaced = true;
    }
    regex.lastIndex = 0;
  });

  if (replaced) {
    return html.replace(/\n/g, "<br>");
  }

  return html.replace(/\n/g, "<br>");
}

function getTopikBlankMarkerHtml(labelText, minWidth) {
  return `<span class="topik-blank-marker" style="
    display:inline-flex;
    align-items:center;
    justify-content:center;
    min-width:${Number(minWidth) || 92}px;
    height:34px;
    margin:0 5px;
    padding:0 10px;
    border:2px solid #ff8f80;
    border-radius:10px;
    background:#fff1ee;
    color:#d93025;
    -webkit-text-fill-color:#d93025;
    text-align:center;
    font-weight:900;
    letter-spacing:2px;
    line-height:1;
    vertical-align:middle;
  ">${escapeHtml(labelText)}</span>`;
}

function getStrongBlankInsidePatternSource() {
  /*
    실제 PDF/JSON에서 빈칸은 일반 공백이 아니라 다음 문자로 들어오는 경우가 있다.
    - NBSP, narrow NBSP, word joiner, zero width space
    - Hangul filler / halfwidth Hangul filler
    - braille blank, BOM, Mongolian vowel separator
    이 함수는 괄호 안이 이런 빈 문자로만 구성된 경우를 모두 빈칸으로 인식한다.
  */
  const invisibleCharClass =
    "\\s\\u00A0\\u1680\\u180E\\u2000-\\u200F\\u2028\\u2029\\u202F\\u205F\\u2060\\u2800\\u3000\\u3164\\uFFA0\\uFEFF";

  const htmlSpaceEntities =
    "&nbsp;|&amp;nbsp;|&#160;|&#xA0;|&#xa0;|&#8239;|&#x202F;|&#x3000;|&#12288;";

  return `(?:(?:[${invisibleCharClass}])|(?:${htmlSpaceEntities})){0,120}`;
}

function getStrongBlankRegexes(flags) {
  const blankInsidePattern = getStrongBlankInsidePatternSource();
  const regexFlags = flags === undefined ? "g" : flags;
  const caseInsensitiveFlags = String(regexFlags || "").includes("i")
    ? regexFlags
    : `${regexFlags}i`;

  return [
    new RegExp("\\(" + blankInsidePattern + "\\)", regexFlags),
    new RegExp("（" + blankInsidePattern + "）", regexFlags),
    new RegExp("_{3,}", regexFlags),
    new RegExp("\\[빈칸\\]", regexFlags),
    new RegExp("\\[blank\\]", caseInsensitiveFlags)
  ];
}

function buildDisplayPassageHtml(passage, selectedText) {
  const source = String(passage || "");

  if (hasBlankMarker(source)) {
    return buildBlankPassageHtml(source, selectedText || "");
  }

  return escapeHtml(source).replace(/\n/g, "<br>");
}

function isStandaloneBlankChoiceLikeQuestion(question) {
  if (!question || hasPassageGroup(question)) {
    return false;
  }

  if (question.type === "sentence_order" || question.type === "sentence_insert") {
    return false;
  }

  if (!Array.isArray(question.options) || question.options.length !== 4) {
    return false;
  }

  const passageText = String(question.passage || "");
  if (!hasBlankMarker(passageText)) {
    return false;
  }

  const typeText = String(question.type || "");
  const instructionText = String(question.instruction || "");
  const questionText = String(question.question || "");
  const categoryText = String(question.category || "");

  return (
    question.type === "blank_choice" ||
    typeText.includes("blank") ||
    typeText.includes("grammar") ||
    typeText.includes("vocabulary") ||
    instructionText.includes("들어갈 말") ||
    questionText.includes("들어갈 말") ||
    categoryText.includes("빈칸") ||
    categoryText.includes("어휘") ||
    categoryText.includes("문법") ||
    categoryText.includes("조사")
  );
}

function isCommonBlankChoiceLikeQuestion(question) {
  if (!question || !hasPassageGroup(question)) {
    return false;
  }

  if (question.type === "common_passage_question") {
    return false;
  }

  if (question.type === "sentence_order" || question.type === "sentence_insert") {
    return false;
  }

  if (!Array.isArray(question.options) || question.options.length !== 4) {
    return false;
  }

  if (!hasBlankMarker(getSharedPassage(question))) {
    return false;
  }

  const typeText = String(question.type || "");
  const instructionText = String(question.instruction || "");
  const questionText = String(question.question || "");
  const categoryText = String(question.category || "");

  return (
    question.type === "common_passage_blank_choice" ||
    question.type === "blank_choice" ||
    typeText.includes("blank") ||
    typeText.includes("grammar") ||
    typeText.includes("vocabulary") ||
    instructionText.includes("들어갈 말") ||
    questionText.includes("들어갈 말") ||
    categoryText.includes("빈칸") ||
    categoryText.includes("연결어") ||
    categoryText.includes("어휘") ||
    categoryText.includes("문법") ||
    categoryText.includes("조사")
  );
}

function highlightBlankParenthesesInRenderedDom() {
  if (!elements.questionStage) {
    return;
  }

  injectTopikBlankMarkerStyle();

  /*
    v17 보강:
    이전 버전은 .passage-content 같은 특정 컨테이너 안에서만 빈칸을 찾았다.
    실제 생성 문항 중 일부는 다른 렌더러를 타면서 passage div에 class가 없거나
    text node 구조가 달라질 수 있으므로, questionStage 전체를 대상으로 하되
    보기 버튼/선택지/이미 강조된 span은 제외한다.
  */
  const blankTextRegex = /[\(（](?:[\s\u00A0\u1680\u180E\u2000-\u200F\u2028\u2029\u202F\u205F\u2060\u2800\u3000\u3164\uFFA0\uFEFF]|&nbsp;|&amp;nbsp;|&#160;|&#xA0;|&#xa0;|&#8239;|&#x202F;|&#x3000;|&#12288;|[._·ㆍ\-–—]){0,120}[\)）]|_{3,}|\[빈칸\]|\[blank\]/gi;

  const walker = document.createTreeWalker(
    elements.questionStage,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: function (node) {
        if (!node || !node.nodeValue) {
          return NodeFilter.FILTER_REJECT;
        }

        const parentElement = node.parentElement;
        if (
          parentElement &&
          parentElement.closest &&
          parentElement.closest(
            ".topik-blank-marker, ." +
              INSERTED_HIGHLIGHT_CLASS +
              ", [data-inserted-answer='true'], button, .option-button, select, input, textarea"
          )
        ) {
          return NodeFilter.FILTER_REJECT;
        }

        blankTextRegex.lastIndex = 0;
        if (!blankTextRegex.test(node.nodeValue)) {
          blankTextRegex.lastIndex = 0;
          return NodeFilter.FILTER_REJECT;
        }

        blankTextRegex.lastIndex = 0;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const matchingTextNodes = [];
  while (walker.nextNode()) {
    matchingTextNodes.push(walker.currentNode);
  }

  matchingTextNodes.forEach(function (textNode) {
    replaceBlankMarkersInTextNode(textNode, blankTextRegex);
  });
}

function injectTopikBlankMarkerStyle() {
  if (document.getElementById("topikBlankMarkerStyle")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "topikBlankMarkerStyle";
  style.textContent = `
    .topik-blank-marker {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      min-width: 92px !important;
      height: 34px !important;
      margin: 0 5px !important;
      padding: 0 10px !important;
      border: 2px solid #ff8f80 !important;
      border-radius: 10px !important;
      background: #fff1ee !important;
      color: #d93025 !important;
      -webkit-text-fill-color: #d93025 !important;
      text-align: center !important;
      font-weight: 900 !important;
      letter-spacing: 2px !important;
      line-height: 1 !important;
      vertical-align: middle !important;
      white-space: nowrap !important;
    }
  `;
  document.head.appendChild(style);
}

function createTopikBlankMarkerElement(matchText) {
  const span = document.createElement("span");
  span.className = "topik-blank-marker";
  span.setAttribute("data-topik-blank-marker", "true");

  const rawText = String(matchText || "");
  const existingLabelMatch = rawText.match(/[㉠㉡㉢㉣㉤㉥]/);
  const currentMarkerLabel = getCurrentBlankMarkerLabelText();

  if (existingLabelMatch) {
    span.textContent = `(${existingLabelMatch[0]})`;
  } else if (currentMarkerLabel && currentMarkerLabel !== "(　　　)") {
    span.textContent = currentMarkerLabel;
  } else {
    span.textContent =
      rawText && !rawText.includes("_") && !rawText.includes("[")
        ? rawText
        : "(　　　)";
  }

  return span;
}

function replaceBlankMarkersInTextNode(textNode, blankTextRegex) {
  if (!textNode || !textNode.parentNode) {
    return;
  }

  const sourceText = textNode.nodeValue || "";
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;

  blankTextRegex.lastIndex = 0;

  sourceText.replace(blankTextRegex, function (match, offset) {
    if (offset > lastIndex) {
      fragment.appendChild(document.createTextNode(sourceText.slice(lastIndex, offset)));
    }

    fragment.appendChild(createTopikBlankMarkerElement(match));

    lastIndex = offset + match.length;
    return match;
  });

  if (lastIndex < sourceText.length) {
    fragment.appendChild(document.createTextNode(sourceText.slice(lastIndex)));
  }

  textNode.parentNode.replaceChild(fragment, textNode);
  blankTextRegex.lastIndex = 0;
}


/* 문장 삽입 위치형: ㄱ/ㄴ/ㄷ/ㄹ을 누르면 보기 문장이 해당 위치에 삽입 */
function renderSentenceInsertQuestion(question) {
  const insertSentence = getInsertSentence(question);
  const positionLabels = getInsertPositionLabels(question);
  const selectedOptionNumber = Number(answers[question.id]) || null;
  const selectedLabel = selectedOptionNumber ? positionLabels[selectedOptionNumber - 1] : "";
  const questionNumber = Number(question.question_number);
  const rawQuestionText = getQuestionTextForPanel(
    question,
    "다음 문장이 들어갈 곳으로 가장 알맞은 것을 고르십시오."
  );
  const numberedQuestionText = Number.isFinite(questionNumber)
    ? `[${questionNumber}] ${String(rawQuestionText).replace(/^\s*\[\d+\]\s*/, "")}`
    : rawQuestionText;

  const passageHtml = buildSentenceInsertPassageHtml(
    getSharedPassage(question),
    positionLabels,
    selectedLabel,
    insertSentence
  );

  const positionButtonsHtml = positionLabels.map(function (label, index) {
    const optionNumber = index + 1;
    const selectedClass = selectedOptionNumber === optionNumber ? " selected" : "";

    return `
      <button
        type="button"
        class="option-button${selectedClass}"
        data-position-number="${optionNumber}"
        style="
          min-height:52px;
          padding:10px 14px;
          font-size:20px;
          font-weight:900;
          display:flex;
          align-items:center;
          justify-content:center;
          text-align:center;
        "
      >
        ${escapeHtml(label)}
      </button>
    `;
  }).join("");

  elements.questionStage.innerHTML = `
    <div class="view-tab">보기</div>
    <div style="background:#ffffff; padding:14px 16px 16px; min-height:420px;">
      <div class="reading-layout" style="
        padding:0;
        grid-template-columns:minmax(0, 1.18fr) minmax(350px, 0.82fr);
        align-items:stretch;
        gap:16px;
      ">
        <article class="passage-panel">
          <div class="panel-label">공통 지문</div>
          <div
            class="passage-content"
            data-passage-content="true"
            style="
              font-size:20px;
              line-height:2.05;
              max-height:none;
              min-height:390px;
              padding:22px 24px;
            "
          >
            ${passageHtml}
          </div>
        </article>

        <article class="question-panel">
          <div class="panel-label">${Number.isFinite(questionNumber) ? questionNumber + "번 문제" : "문제"}</div>
          <div class="question-content" style="padding:20px 22px;">
            <div style="
              border:2px solid #b9d8ff;
              border-radius:12px;
              background:#f7fbff;
              min-height:88px;
              padding:14px 18px;
              margin-bottom:16px;
              display:flex;
              align-items:center;
              justify-content:center;
              text-align:center;
            ">
              <div style="
                color:#111827;
                font-size:20px;
                line-height:1.55;
                font-weight:900;
                width:100%;
              ">
                ${escapeHtml(insertSentence)}
              </div>
            </div>

            <p class="question-text" style="margin-bottom:14px;">
              ${escapeHtml(numberedQuestionText)}
            </p>

            <div class="options-area" style="
              grid-template-columns:repeat(2, minmax(0, 1fr));
              gap:10px;
            ">
              ${positionButtonsHtml}
            </div>
          </div>
        </article>
      </div>
    </div>
  `;

  elements.questionStage.querySelectorAll("[data-position-number]").forEach(function (button) {
    button.addEventListener("click", function () {
      selectAnswer(question.id, Number(button.dataset.positionNumber));
    });
  });

  elements.questionStage.querySelectorAll("[data-inline-position-number]").forEach(function (button) {
    button.addEventListener("click", function () {
      selectAnswer(question.id, Number(button.dataset.inlinePositionNumber));
    });
  });

  highlightInsertedAnswersInCurrentStage(question);
}


function getInsertSentence(question) {
  return (
    question.insert_sentence ||
    question.sentence_to_insert ||
    question.target_sentence ||
    question.sentence ||
    "삽입할 문장을 여기에 입력하세요."
  );
}

function getInsertPositionLabels(question) {
  if (Array.isArray(question.insert_positions) && question.insert_positions.length > 0) {
    return question.insert_positions.map(function (item) {
      if (typeof item === "string") return item;
      return item.label || item.position || "";
    }).filter(Boolean);
  }

  if (Array.isArray(question.options) && question.options.length === 4) {
    return question.options.map(function (option) {
      return String(option).replace(/^\d+\.\s*/, "").trim();
    });
  }

  return ["ㄱ", "ㄴ", "ㄷ", "ㄹ"];
}

function getNaturalInsertedSentenceHtml(text) {
  const safeText = escapeHtml(String(text || "").trim());

  if (!safeText) {
    return "";
  }

  return `<span class="${INSERTED_HIGHLIGHT_CLASS}" data-inserted-answer="true" style="
    color:#0047b3 !important;
    -webkit-text-fill-color:#0047b3 !important;
    font-weight:900 !important;
    background:transparent !important;
    border:0 !important;
    box-shadow:none !important;
    padding:0 !important;
    margin:0 !important;
    display:inline !important;
    line-height:inherit !important;
    vertical-align:baseline !important;
  ">${safeText}</span>`;
}

function buildSentenceInsertPassageHtml(passage, positionLabels, selectedLabel, insertSentence) {
  let html = escapeHtml(passage || "");
  const insertedSentenceHtml = getNaturalInsertedSentenceHtml(insertSentence);

  function getInlinePositionButtonHtml(label, optionNumber) {
    return `<button type="button" data-inline-position-number="${optionNumber}" style="
      display:inline-flex;
      align-items:center;
      justify-content:center;
      min-width:30px;
      height:26px;
      margin:0 3px;
      border:1px solid #9aa7b5;
      border-radius:6px;
      background:#ffffff;
      color:#4b5563;
      font-weight:900;
      font-size:15px;
      cursor:pointer;
      vertical-align:baseline;
      line-height:1;
    ">${escapeHtml(label)}</button>`;
  }

  function getSelectedInsertHtml() {
    return `${insertedSentenceHtml}`;
  }

  let foundAnyMarker = false;

  positionLabels.forEach(function (label, index) {
    const optionNumber = index + 1;
    const markerVariants = getMarkerVariants(label);
    let replaced = false;

    for (const marker of markerVariants) {
      if (html.includes(marker)) {
        foundAnyMarker = true;

        const replacement = label === selectedLabel
          ? getSelectedInsertHtml()
          : getInlinePositionButtonHtml(label, optionNumber);

        html = html.replace(marker, replacement);
        replaced = true;
        break;
      }
    }

    if (!replaced && selectedLabel === label) {
      html += ` ${getSelectedInsertHtml()}`;
    }
  });

  html = html.replace(/\n/g, "<br>");

  if (!foundAnyMarker) {
    const positionsHtml = positionLabels.map(function (label, index) {
      const optionNumber = index + 1;
      const isSelected = label === selectedLabel;

      return isSelected
        ? `<span style="
            display:inline;
            color:#0047b3;
            font-weight:900;
          ">${escapeHtml(insertSentence)}</span>`
        : getInlinePositionButtonHtml(label, optionNumber);
    }).join(" ");

    return `
      ${html}
      <div style="margin-top:16px; padding-top:12px; border-top:1px dashed #b9c5d6;">
        ${positionsHtml}
      </div>
    `;
  }

  return html;
}


function buildCommonPassageContentHtml(question) {
  const sharedPassage = getSharedPassage(question);

  const linkedInsertQuestion = findLinkedSentenceInsertQuestion(question);
  if (linkedInsertQuestion) {
    const positionLabels = getInsertPositionLabels(linkedInsertQuestion);
    const selectedOptionNumber = Number(answers[linkedInsertQuestion.id]) || null;
    const selectedLabel = selectedOptionNumber ? positionLabels[selectedOptionNumber - 1] : "";
    const linkedInsertPassage = getSharedPassage(linkedInsertQuestion);
    const displayPassage = linkedInsertPassage || sharedPassage;

    /*
      STEP41-1E:
      59~60번처럼 한 세트 안에서 앞 문항이 삽입 위치를 결정하는 경우,
      뒤 문항의 공통 지문도 앞 문항의 삽입 위치 선택 상태를 그대로 보여 준다.
      선택 전에는 원문 위치 표지(㉠~㉣)를 유지해서 같은 세트 지문임을 알 수 있게 한다.
    */
    return buildSentenceInsertPassageForDisplayHtml(
      displayPassage,
      positionLabels,
      selectedLabel,
      getInsertSentence(linkedInsertQuestion)
    );
  }

  const linkedBlankQuestion = findLinkedCommonPassageBlankChoiceQuestion(question);
  if (linkedBlankQuestion) {
    const selectedOptionNumber = Number(answers[linkedBlankQuestion.id]) || null;
    const selectedText = selectedOptionNumber ? linkedBlankQuestion.options[selectedOptionNumber - 1] : "";

    /*
      STEP41-1E:
      49~50, 51~52, 53~54, 55~56, 61~62, 65~66, 67~68, 69~70 같은 공통 세트에서는
      뒤 문항이 이미 정답이 들어간 완성 지문을 가지고 있더라도,
      학생 화면에서는 앞 문항의 빈칸 지문을 기준으로 선택한 답을 같은 위치에 반영한다.
    */
    const blankBasePassage = getSharedPassage(linkedBlankQuestion) || sharedPassage;
    const linkedBlankHtml = buildBlankPassageHtml(blankBasePassage, selectedText);

    return selectedText
      ? ensureInsertedAnswerHighlightedHtml(linkedBlankHtml, selectedText)
      : linkedBlankHtml;
  }

  return buildBlankPassageHtml(sharedPassage, "");
}

function getTopik1LinkedQuestionNumberPairs() {
  return [
    [49, 50],
    [51, 52],
    [53, 54],
    [55, 56],
    [59, 60],
    [61, 62],
    [63, 64],
    [65, 66],
    [67, 68],
    [69, 70]
  ];
}

function getQuestionNumberValue(question) {
  const value = Number(question && question.question_number);
  return Number.isFinite(value) ? value : null;
}

function getLinkedLeadQuestionNumberForCommonSet(question) {
  const currentNumber = getQuestionNumberValue(question);

  if (!currentNumber) {
    return null;
  }

  for (const pair of getTopik1LinkedQuestionNumberPairs()) {
    if (Number(pair[1]) === currentNumber) {
      return Number(pair[0]);
    }
  }

  return null;
}

function findQuestionByNumber(questionNumber) {
  const targetNumber = Number(questionNumber);

  if (!Number.isFinite(targetNumber)) {
    return null;
  }

  return questions.find(function (item) {
    return Number(item && item.question_number) === targetNumber;
  }) || null;
}

function findLinkedCommonPassageBlankChoiceQuestion(question) {
  if (!question) {
    return null;
  }

  if (isCommonPassageBlankChoice(question)) {
    return question;
  }

  if (question.passage_group_id) {
    const groupedBlankQuestion = questions.find(function (item) {
      return (
        item &&
        item.id !== question.id &&
        item.passage_group_id === question.passage_group_id &&
        isCommonPassageBlankChoice(item)
      );
    });

    if (groupedBlankQuestion) {
      return groupedBlankQuestion;
    }
  }

  const linkedLeadQuestionNumber = getLinkedLeadQuestionNumberForCommonSet(question);
  const linkedLeadQuestion = findQuestionByNumber(linkedLeadQuestionNumber);

  return isCommonPassageBlankChoice(linkedLeadQuestion)
    ? linkedLeadQuestion
    : null;
}

function findLinkedSentenceInsertQuestion(question) {
  if (!question) {
    return null;
  }

  if (question.passage_group_id) {
    const groupedInsertQuestion = questions.find(function (item) {
      return (
        item &&
        item.id !== question.id &&
        item.passage_group_id === question.passage_group_id &&
        item.type === "sentence_insert"
      );
    });

    if (groupedInsertQuestion) {
      return groupedInsertQuestion;
    }
  }

  const linkedLeadQuestionNumber = getLinkedLeadQuestionNumberForCommonSet(question);
  const linkedLeadQuestion = findQuestionByNumber(linkedLeadQuestionNumber);

  return linkedLeadQuestion && linkedLeadQuestion.type === "sentence_insert"
    ? linkedLeadQuestion
    : null;
}

function buildSentenceInsertPassageForDisplayHtml(passage, positionLabels, selectedLabel, insertSentence) {
  let html = escapeHtml(passage || "");
  const insertedSentenceHtml = getNaturalInsertedSentenceHtml(insertSentence);

  positionLabels.forEach(function (label) {
    const markerVariants = getMarkerVariants(label);

    for (const marker of markerVariants) {
      if (html.includes(marker)) {
        const replacement = label === selectedLabel
          ? insertedSentenceHtml
          : `<span style="
              display:inline-flex;
              align-items:center;
              justify-content:center;
              min-width:24px;
              height:24px;
              margin:0 3px;
              border:1px solid #9aa7b5;
              border-radius:6px;
              background:#ffffff;
              color:#4b5563;
              font-size:14px;
              font-weight:900;
              vertical-align:baseline;
              line-height:1;
            ">${escapeHtml(label)}</span>`;

        html = html.replace(marker, replacement);
        break;
      }
    }
  });

  return html.replace(/\n/g, "<br>");
}


function getMarkerVariants(label) {
  const raw = String(label).trim();
  const parenthesized = raw.startsWith("(") ? raw : `(${raw})`;
  const square = raw.startsWith("[") ? raw : `[${raw}]`;
  const doubleSquare = `[[${raw.replace(/[()[\]]/g, "")}]]`;
  const circledMap = {
    "ㄱ": "㉠",
    "ㄴ": "㉡",
    "ㄷ": "㉢",
    "ㄹ": "㉣",
    "(ㄱ)": "㉠",
    "(ㄴ)": "㉡",
    "(ㄷ)": "㉢",
    "(ㄹ)": "㉣"
  };

  const circled = circledMap[raw] ? [circledMap[raw]] : [];

  return [
    escapeHtml(doubleSquare),
    escapeHtml(parenthesized),
    escapeHtml(square),
    ...circled.map(escapeHtml),
    escapeHtml(raw)
  ];
}


function getSentenceOrderCardTextStyle(text) {
  const compactLength = String(text || "").replace(/\s+/g, "").length;

  if (compactLength >= 34) {
    return "font-size:16px; letter-spacing:-0.25px; line-height:1.5; white-space:normal; word-break:keep-all; overflow-wrap:normal;";
  }

  if (compactLength >= 28) {
    return "font-size:16px; letter-spacing:-0.15px; line-height:1.5; white-space:normal; word-break:keep-all; overflow-wrap:normal;";
  }

  return "font-size:16px; letter-spacing:0; line-height:1.5; white-space:normal; word-break:keep-all; overflow-wrap:normal;";
}

function getSentenceOrderPlacedTextStyle(text) {
  const compactLength = String(text || "").replace(/\s+/g, "").length;

  if (compactLength >= 34) {
    return "font-size:16px; letter-spacing:-0.25px; line-height:1.5; white-space:normal; word-break:keep-all; overflow-wrap:normal;";
  }

  if (compactLength >= 28) {
    return "font-size:16px; letter-spacing:-0.15px; line-height:1.5; white-space:normal; word-break:keep-all; overflow-wrap:normal;";
  }

  return "font-size:16px; letter-spacing:0; line-height:1.5; white-space:normal; word-break:keep-all; overflow-wrap:normal;";
}
function getSentenceOrderStartCandidateItems(question, sentenceItems) {
  const optionOrders = getSentenceOrderOptionOrders(question, sentenceItems);
  const candidateLabels = [];

  function addLabel(label) {
    const value = normalizeSentenceOrderOptionLabel(label);

    if (!value || candidateLabels.includes(value)) {
      return;
    }

    const existsInItems = sentenceItems.some(function (item) {
      return item.label === value;
    });

    if (existsInItems) {
      candidateLabels.push(value);
    }
  }

  if (optionOrders.length > 0) {
    optionOrders.forEach(function (candidateOrder) {
      addLabel(candidateOrder[0]);
    });

    return findSentenceOrderItemsByLabels(sentenceItems, candidateLabels.slice(0, 2));
  }

  const correctOrder = getCorrectOrder(question, sentenceItems);

  if (Array.isArray(question.start_candidate_labels)) {
    question.start_candidate_labels.forEach(addLabel);
  }

  addLabel(correctOrder[0]);

  if (sentenceItems.length > 0) {
    addLabel(sentenceItems[sentenceItems.length - 1].label);
  }

  sentenceItems.forEach(function (item) {
    if (candidateLabels.length < 2) {
      addLabel(item.label);
    }
  });

  return findSentenceOrderItemsByLabels(sentenceItems, candidateLabels.slice(0, 2));
}

function getSentenceOrderSecondCandidateItems(question, sentenceItems, order) {
  const usedLabels = order.filter(Boolean);
  const optionOrders = getSentenceOrderOptionOrders(question, sentenceItems);
  const candidateLabels = [];

  function addLabel(label) {
    const value = normalizeSentenceOrderOptionLabel(label);

    if (!value || usedLabels.includes(value) || candidateLabels.includes(value)) {
      return;
    }

    const existsInItems = sentenceItems.some(function (item) {
      return item.label === value;
    });

    if (existsInItems) {
      candidateLabels.push(value);
    }
  }

  if (optionOrders.length > 0 && order[0]) {
    optionOrders.forEach(function (candidateOrder) {
      if (candidateOrder[0] === order[0]) {
        addLabel(candidateOrder[1]);
      }
    });

    if (candidateLabels.length > 0) {
      return findSentenceOrderItemsByLabels(sentenceItems, candidateLabels.slice(0, 2));
    }
  }

  const correctOrder = getCorrectOrder(question, sentenceItems);
  addLabel(correctOrder[1]);

  sentenceItems.forEach(function (item) {
    if (candidateLabels.length < 2) {
      addLabel(item.label);
    }
  });

  return findSentenceOrderItemsByLabels(sentenceItems, candidateLabels.slice(0, 2));
}

function getSentenceOrderVisibleItems(question, sentenceItems, order) {
  const usedLabels = order.filter(Boolean);

  if (!order[0]) {
    return getSentenceOrderStartCandidateItems(question, sentenceItems)
      .filter(function (item) {
        return !usedLabels.includes(item.label);
      });
  }

  if (!order[1]) {
    return getSentenceOrderSecondCandidateItems(question, sentenceItems, order);
  }

  return sentenceItems.filter(function (item) {
    return !usedLabels.includes(item.label);
  });
}

function getFirstEmptySentenceOrderSlotIndex(order) {
  for (let index = 0; index < order.length; index += 1) {
    if (!order[index]) {
      return index;
    }
  }

  return -1;
}

function placeSentenceInNextAvailableSlot(question, sentenceItems, label) {
  if (!label) {
    return;
  }

  const order = getSentenceOrderState(question, sentenceItems);
  const targetIndex = order[0]
    ? getFirstEmptySentenceOrderSlotIndex(order)
    : 0;

  if (targetIndex < 0) {
    return;
  }

  placeSentenceInSlot(question, sentenceItems, targetIndex, label);
}
/* 43~46 문장 순서 배열 drag/drop */
function renderSentenceOrderQuestion(question) {
  const sentenceItems = getSentenceItems(question);
  const order = getSentenceOrderState(question, sentenceItems);
  const visibleItems = getSentenceOrderVisibleItems(question, sentenceItems, order);
  const hasFirstSentence = Boolean(order[0]);
  const hasSecondSentence = Boolean(order[1]);

  const rightPanelTitle = "";

  const stepGuideText = !hasFirstSentence
    ? "먼저 시작 문장 후보 두 개 중 하나를 선택하세요."
    : !hasSecondSentence
      ? "두 번째 문장 후보 두 개 중 하나를 선택하세요."
      : "문장 순서가 자동으로 완성되었습니다.";

  const numberedStepGuideText = getNumberedQuestionTextForPanel(question, stepGuideText);
  const slotCount = Math.max(order.length, 4);
  const panelMinHeight = hasSecondSentence
    ? "min(560px, calc(100vh - 305px))"
    : "min(530px, calc(100vh - 305px))";

  elements.questionStage.innerHTML = `
    <div class="view-tab">보기</div>

    <div
      class="sentence-order-stage"
      style="
        background:#ffffff;
        padding:20px 20px 22px;
        min-height:${panelMinHeight};
        display:flex;
        flex-direction:column;
      "
    >
      <div style="
        display:grid;
        grid-template-columns:minmax(0, 1.08fr) minmax(360px, 0.92fr);
        gap:16px;
        flex:1 1 auto;
        min-height:0;
      ">
        <section style="
          border:1px solid #e3e6ea;
          border-radius:16px;
          background:#ffffff;
          padding:16px;
          overflow:visible;
          min-height:100%;
          display:flex;
          flex-direction:column;
        ">
          <div style="
            color:#003f8f;
            font-weight:900;
            margin-bottom:14px;
            font-size:19px;
            line-height:1.3;
          ">순서 배열</div>

          <div
            id="orderDropArea"
            style="
              display:grid;
              gap:12px;
              grid-template-rows:repeat(${slotCount}, minmax(64px, 1fr));
              flex:1 1 auto;
              min-height:0;
            "
          >
            ${order.map(function (label, index) {
              const item = sentenceItems.find((sentenceItem) => sentenceItem.label === label);
              const emptyText =
                !order[0] && index === 0
                  ? "먼저 시작 문장을 여기에 놓으세요"
                  : !order[1] && index === 1
                    ? "두 번째 문장을 선택하세요"
                    : !order[0]
                      ? "시작 문장을 먼저 선택하세요"
                      : !order[1]
                        ? "두 번째 문장을 먼저 선택하세요"
                        : `${index + 1}번째 문장을 여기에 놓으세요`;

              const content = item
                ? `<div style="
                    min-height:64px;
                    height:100%;
                    padding:14px 16px;
                    border:2px solid #0877f2;
                    border-radius:10px;
                    background:#e9f3ff;
                    font-weight:900;
                    overflow:visible;
                    font-size:18px;
                    line-height:1.55;
                    display:flex;
                    align-items:center;
                    ${getSentenceOrderPlacedTextStyle(item.text)}
                  ">
                    ${escapeHtml(item.label)} ${escapeHtml(item.text)}
                  </div>`
                : `<div style="
                    min-height:64px;
                    height:100%;
                    padding:14px 16px;
                    border:2px dashed #9dbce5;
                    border-radius:10px;
                    background:#ffffff;
                    color:#4b5563;
                    font-weight:900;
                    font-size:17px;
                    letter-spacing:0;
                    line-height:1.5;
                    white-space:normal;
                    word-break:keep-all;
                    cursor:pointer;
                    display:flex;
                    align-items:center;
                  ">
                    ${escapeHtml(emptyText)}
                  </div>`;

              return `
                <div
                  class="sentence-order-slot"
                  data-slot-index="${index}"
                  style="min-height:64px;"
                >
                  ${content}
                </div>
              `;
            }).join("")}
          </div>
        </section>

        <section style="
          border:1px solid #e3e6ea;
          border-radius:16px;
          background:#ffffff;
          padding:16px;
          overflow:visible;
          min-height:100%;
          display:flex;
          flex-direction:column;
        ">
          ${rightPanelTitle ? `
          <div style="
            color:#003f8f;
            font-weight:900;
            margin-bottom:12px;
            font-size:19px;
            line-height:1.3;
          ">
            ${escapeHtml(rightPanelTitle)}
          </div>
          ` : ""}

          <p class="question-text" style="
            margin:0 0 14px;
            padding:0;
            color:#202124;
            font-size:19px;
            font-weight:900;
            line-height:1.55;
          ">
            ${escapeHtml(numberedStepGuideText)}
          </p>

          <div
            id="sentenceItemList"
            style="
              display:grid;
              gap:12px;
              ${hasSecondSentence ? "grid-template-columns:1fr;" : "grid-template-columns:repeat(2, minmax(0, 1fr));"}
              flex:1 1 auto;
              align-content:start;
            "
          >
            ${
              visibleItems.length
                ? visibleItems.map(function (item) {
                    const selectedStyle =
                      selectedSentenceForOrder &&
                      selectedSentenceForOrder.questionId === question.id &&
                      selectedSentenceForOrder.label === item.label
                        ? "background:#e9f3ff;border-color:#0877f2;box-shadow:inset 0 0 0 1px #0877f2;"
                        : "";

                    const candidateTitle = hasSecondSentence
                      ? ""
                      : `<div style="
                          color:#003f8f;
                          font-weight:900;
                          margin-bottom:8px;
                          font-size:16px;
                          line-height:1.3;
                        ">${escapeHtml(item.label)}${hasFirstSentence ? " 선택" : "로 시작"}</div>`;

                    return `
                      <div
                        class="sentence-order-item"
                        draggable="true"
                        data-label="${escapeAttribute(item.label)}"
                        title="클릭하면 왼쪽 순서 칸에 자동 배치됩니다."
                        style="
                          padding:15px 16px;
                          border:1px solid #bfc8d5;
                          border-radius:11px;
                          background:#ffffff;
                          cursor:pointer;
                          font-weight:900;
                          overflow:visible;
                          min-height:${hasSecondSentence ? "74px" : "118px"};
                          font-size:18px;
                          line-height:1.58;
                          display:flex;
                          flex-direction:column;
                          justify-content:center;
                          ${getSentenceOrderCardTextStyle(item.text)}
                          ${selectedStyle}
                        "
                      >
                        ${candidateTitle}
                        <div>${escapeHtml(item.label)} ${escapeHtml(item.text)}</div>
                      </div>
                    `;
                  }).join("")
                : `<div style="
                    padding:18px;
                    border:1px solid #e3e6ea;
                    border-radius:11px;
                    background:#f8fafc;
                    color:#555;
                    text-align:center;
                    font-weight:900;
                    font-size:17px;
                    line-height:1.55;
                  ">문장 순서가 자동으로 완성되었습니다.</div>`
            }
          </div>

          <button
            type="button"
            id="resetSentenceOrderButton"
            style="
              width:100%;
              margin-top:14px;
              padding:13px 12px;
              border:1px solid #d93025;
              border-radius:10px;
              background:#ffffff;
              color:#d93025;
              font-size:16px;
              font-weight:900;
              cursor:pointer;
            "
          >
            다시 배치
          </button>
        </section>
      </div>
    </div>
  `;

  bindSentenceOrderEvents(question, sentenceItems);
}

function getSentenceItems(question) {
  if (Array.isArray(question.sentence_items) && question.sentence_items.length > 0) {
    return question.sentence_items.map(function (item, index) {
      if (typeof item === "string") {
        return {
          label: ["(가)", "(나)", "(다)", "(라)"][index] || `(${index + 1})`,
          text: item
        };
      }

      return {
        label: item.label || ["(가)", "(나)", "(다)", "(라)"][index] || `(${index + 1})`,
        text: item.text || ""
      };
    });
  }

  const lines = String(question.passage || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length >= 4) {
    return lines.slice(0, 4).map(function (line, index) {
      const match = line.match(/^(\([가-라]\)|[가-라]\.|\[[가-라]\]|㉠|㉡|㉢|㉣)\s*(.*)$/);
      return {
        label: match ? normalizeSentenceLabel(match[1]) : ["(가)", "(나)", "(다)", "(라)"][index],
        text: match ? match[2] : line
      };
    });
  }

  return getDefaultSentenceItems(question.question_number);
}

function normalizeSentenceLabel(label) {
  const map = {
    "가.": "(가)",
    "나.": "(나)",
    "다.": "(다)",
    "라.": "(라)",
    "[가]": "(가)",
    "[나]": "(나)",
    "[다]": "(다)",
    "[라]": "(라)",
    "㉠": "(가)",
    "㉡": "(나)",
    "㉢": "(다)",
    "㉣": "(라)"
  };

  return map[label] || label;
}

function normalizeSentenceOrderOptionLabel(label) {
  const value = String(label || "").trim();
  const koreanMatch = value.match(/[가-라]/);

  if (koreanMatch) {
    return `(${koreanMatch[0]})`;
  }

  return normalizeSentenceLabel(value);
}

function parseSentenceOrderChoiceOrder(optionText) {
  const labels = String(optionText || "").match(/[가-라]/g) || [];

  return labels.map(function (label) {
    return `(${label})`;
  });
}

function getSentenceOrderOptionOrders(question, sentenceItems) {
  const validLabels = new Set(sentenceItems.map(function (item) {
    return item.label;
  }));
  const expectedLength = sentenceItems.length;
  const orders = [];
  const seen = new Set();

  function addOrder(rawOrder) {
    if (!Array.isArray(rawOrder)) {
      return;
    }

    const normalizedOrder = rawOrder
      .map(normalizeSentenceOrderOptionLabel)
      .filter(function (label) {
        return validLabels.has(label);
      });

    if (normalizedOrder.length !== expectedLength) {
      return;
    }

    const key = normalizedOrder.join("-");
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    orders.push(normalizedOrder);
  }

  if (Array.isArray(question.order_choice_orders)) {
    question.order_choice_orders.forEach(addOrder);
  }

  if (Array.isArray(question.options)) {
    question.options.forEach(function (optionText) {
      addOrder(parseSentenceOrderChoiceOrder(optionText));
    });
  }

  return orders;
}

function findSentenceOrderItemsByLabels(sentenceItems, labels) {
  return labels.map(function (label) {
    return sentenceItems.find(function (item) {
      return item.label === label;
    });
  }).filter(Boolean);
}

function getCorrectOrder(question, sentenceItems) {
  if (Array.isArray(question.correct_order) && question.correct_order.length > 0) {
    return question.correct_order.map(normalizeSentenceOrderOptionLabel);
  }

  const optionOrders = getSentenceOrderOptionOrders(question, sentenceItems);
  const correctAnswerNumber = Number(
    question.answer === undefined ? question.correct_answer : question.answer
  );

  if (
    optionOrders.length > 0 &&
    Number.isFinite(correctAnswerNumber) &&
    correctAnswerNumber >= 1 &&
    correctAnswerNumber <= optionOrders.length
  ) {
    return optionOrders[correctAnswerNumber - 1];
  }

  return sentenceItems.map((item) => item.label);
}

function getSentenceOrderState(question, sentenceItems) {
  if (!Array.isArray(sentenceOrderAnswers[question.id])) {
    sentenceOrderAnswers[question.id] = Array(sentenceItems.length).fill(null);
  }

  return sentenceOrderAnswers[question.id];
}

function bindSentenceOrderEvents(question, sentenceItems) {
  let draggedLabel = null;

  function markSelectedSentenceItem(itemElement) {
    elements.questionStage.querySelectorAll(".sentence-order-item").forEach(function (element) {
      element.style.background = "#ffffff";
      element.style.borderColor = "#bfc8d5";
    });

    itemElement.style.background = "#e9f3ff";
    itemElement.style.borderColor = "#0877f2";
  }

  elements.questionStage.querySelectorAll(".sentence-order-item").forEach(function (itemElement) {
    itemElement.addEventListener("dragstart", function (event) {
      draggedLabel = itemElement.dataset.label;
      event.dataTransfer.setData("text/plain", draggedLabel);
    });

    itemElement.addEventListener("click", function () {
      selectedSentenceForOrder = null;
      placeSentenceInNextAvailableSlot(
        question,
        sentenceItems,
        itemElement.dataset.label
      );
    });

    itemElement.addEventListener("dblclick", function (event) {
      event.preventDefault();

      selectedSentenceForOrder = null;
      placeSentenceInNextAvailableSlot(
        question,
        sentenceItems,
        itemElement.dataset.label
      );
    });
  });

  elements.questionStage.querySelectorAll(".sentence-order-slot").forEach(function (slotElement) {
    slotElement.addEventListener("dragover", function (event) {
      event.preventDefault();
    });

    slotElement.addEventListener("drop", function (event) {
      event.preventDefault();

      const label = event.dataTransfer.getData("text/plain") || draggedLabel;
      const order = getSentenceOrderState(question, sentenceItems);
      const targetSlotIndex = order[0]
        ? Number(slotElement.dataset.slotIndex)
        : 0;

      placeSentenceInSlot(question, sentenceItems, targetSlotIndex, label);
    });

    slotElement.addEventListener("click", function () {
      if (
        selectedSentenceForOrder &&
        selectedSentenceForOrder.questionId === question.id &&
        selectedSentenceForOrder.label
      ) {
        const order = getSentenceOrderState(question, sentenceItems);
        const targetSlotIndex = order[0]
          ? Number(slotElement.dataset.slotIndex)
          : 0;

        placeSentenceInSlot(
          question,
          sentenceItems,
          targetSlotIndex,
          selectedSentenceForOrder.label
        );
      }
    });
  });

  const resetButton = document.getElementById("resetSentenceOrderButton");

  if (resetButton) {
    resetButton.addEventListener("click", function () {
      sentenceOrderAnswers[question.id] = Array(sentenceItems.length).fill(null);
      delete answers[question.id];
      selectedSentenceForOrder = null;
      renderQuestion();
    });
  }
}
function completeSentenceOrderAfterTwoChoices(question, sentenceItems) {
  const order = getSentenceOrderState(question, sentenceItems);

  if (!order[0] || !order[1]) {
    return;
  }

  const optionOrders = getSentenceOrderOptionOrders(question, sentenceItems);
  const matchedOptionOrder = optionOrders.find(function (candidateOrder) {
    return candidateOrder[0] === order[0] && candidateOrder[1] === order[1];
  });

  if (matchedOptionOrder) {
    sentenceOrderAnswers[question.id] = matchedOptionOrder.slice(0, sentenceItems.length);
    answers[question.id] = sentenceOrderAnswers[question.id].join("-");
    return;
  }

  const correctOrder = getCorrectOrder(question, sentenceItems);
  const completedOrder = [order[0], order[1]];
  const usedLabels = new Set(completedOrder);

  correctOrder.forEach(function (label) {
    if (!usedLabels.has(label)) {
      completedOrder.push(label);
      usedLabels.add(label);
    }
  });

  sentenceItems.forEach(function (item) {
    if (!usedLabels.has(item.label)) {
      completedOrder.push(item.label);
      usedLabels.add(item.label);
    }
  });

  sentenceOrderAnswers[question.id] = completedOrder.slice(0, sentenceItems.length);
  answers[question.id] = sentenceOrderAnswers[question.id].join("-");
}

function placeSentenceInSlot(question, sentenceItems, slotIndex, label) {
  if (!label) return;

  const order = getSentenceOrderState(question, sentenceItems);
  const normalizedSlotIndex = order[0]
    ? Number(slotIndex)
    : 0;

  for (let index = 0; index < order.length; index += 1) {
    if (order[index] === label) {
      order[index] = null;
    }
  }

  order[normalizedSlotIndex] = label;
  selectedSentenceForOrder = null;

  if (order[0] && order[1]) {
    completeSentenceOrderAfterTwoChoices(question, sentenceItems);
  } else if (order.every(Boolean)) {
    answers[question.id] = order.join("-");
  } else {
    delete answers[question.id];
  }

  renderQuestion();
}

function isCommonPassageBlankChoice(question) {
  if (!question) return false;

  if (question.type === "common_passage_blank_choice") {
    return true;
  }

  if (!hasPassageGroup(question)) {
    return false;
  }

  const questionText = String(question.question || "");
  const categoryText = String(question.category || "");

  return (
    questionText.includes("들어갈 말") ||
    categoryText.includes("빈칸") ||
    categoryText.includes("연결어")
  ) && hasBlankMarker(getSharedPassage(question));
}

function hasBlankMarker(text) {
  const value = String(text || "");

  const regexPatterns = [
    ...getStrongBlankRegexes(""),
    /\(\s*㉠\s*\)|\(\s*㉡\s*\)|\(\s*㉢\s*\)|\(\s*㉣\s*\)/,
    /㉠|㉡|㉢|㉣/
  ];

  return regexPatterns.some(function (pattern) {
    return pattern.test(value);
  });
}
function renderCommonPassageBlankChoiceQuestion(question) {
  const groupHeaderHtml = buildPassageGroupHeader(question);
  const questionNumberLabelHtml = buildQuestionNumberLabelForPanel(question);
  const sharedPassage = getSharedPassage(question);
  const selectedOptionNumber = Number(answers[question.id]) || null;
  const selectedText = selectedOptionNumber ? question.options[selectedOptionNumber - 1] : "";
  const passageHtml = buildBlankPassageHtml(sharedPassage, selectedText);
  const sharedImageUrl = getSharedImageUrl(question);
  const imageHtml = sharedImageUrl
    ? `
      <div class="image-area" style="
        flex:1 1 auto;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:18px 20px 22px;
        min-height:430px;
        background:#ffffff;
      ">
        <img
          src="${escapeAttribute(sharedImageUrl)}"
          alt="${question.passage_group_title || question.question_number + "번"} 공통 이미지 자료"
          style="
            width:100%;
            max-width:740px;
            max-height:min(540px, calc(100vh - 315px));
            height:auto;
            object-fit:contain;
            border:1px solid #e3e6ea;
            border-radius:12px;
            display:block;
            margin:0 auto;
            background:#ffffff;
          "
        />
      </div>
    `
    : "";

  const passageContentHtml = sharedImageUrl
    ? imageHtml
    : `<div
        class="passage-content"
        data-passage-content="true"
        style="
          font-size:20px;
          line-height:2.05;
          min-height:360px;
          padding:24px 28px;
          word-break:keep-all;
          overflow-wrap:normal;
        "
      >${passageHtml}</div>`;

  const optionsHtml = question.options.map(function (optionText, index) {
    const optionNumber = index + 1;
    const selectedClass = selectedOptionNumber === optionNumber ? " selected" : "";

    return `
      <button
        type="button"
        class="option-button${selectedClass}"
        data-option="${optionNumber}"
        style="
          min-height:52px;
          font-size:18px;
          line-height:1.45;
          padding:12px 16px;
        "
      >
        ${optionNumber}. ${escapeHtml(optionText)}
      </button>
    `;
  }).join("");

  const questionTextHtml = getNumberedQuestionTextHtml(
    question,
    "(   )에 들어갈 말로 가장 알맞은 것을 고르십시오."
  );

  elements.questionStage.innerHTML = `
    <div class="view-tab">보기</div>
    <div style="background:#ffffff; padding:16px 18px 18px; min-height:440px;">
      ${groupHeaderHtml}

      <div class="reading-layout" style="
        padding:0;
        display:grid;
        grid-template-columns:minmax(0, 1.12fr) minmax(390px, 0.88fr);
        gap:18px;
        align-items:stretch;
      ">
        <article class="passage-panel" style="
          border:1px solid #e3e6ea;
          border-radius:14px;
          background:#ffffff;
          overflow:hidden;
          min-height:440px;
          display:flex;
          flex-direction:column;
        ">
          <div class="panel-label" style="
            padding:12px 16px;
            border-bottom:1px solid #e3e6ea;
            font-weight:900;
            color:#003f8f;
            background:#fafcff;
            font-size:17px;
          ">공통 지문</div>
          ${passageContentHtml}
        </article>

        <article class="question-panel" style="
          border:1px solid #e3e6ea;
          border-radius:14px;
          background:#fbfcfe;
          overflow:hidden;
          min-height:440px;
          display:flex;
          flex-direction:column;
        ">
          <div class="panel-label" style="
            padding:12px 16px;
            border-bottom:1px solid #e3e6ea;
            font-weight:900;
            color:#003f8f;
            background:#fafcff;
            font-size:17px;
          ">${escapeHtml(getCommonSetQuestionPanelTitle(question))}</div>

          <div class="question-content" style="
            padding:22px 22px 24px;
            display:flex;
            flex-direction:column;
            flex:1 1 auto;
          ">
            ${questionNumberLabelHtml}
            <p class="question-text" style="
              margin:0 0 18px;
              font-size:20px;
              line-height:1.55;
              font-weight:900;
              word-break:keep-all;
            ">${questionTextHtml}</p>
            <div class="options-area" style="
              display:grid;
              grid-template-columns:1fr;
              gap:10px;
            ">${optionsHtml}</div>
          </div>
        </article>
      </div>
    </div>
  `;

  elements.questionStage.querySelectorAll(".option-button").forEach(function (button) {
    button.addEventListener("click", function () {
      selectAnswer(question.id, Number(button.dataset.option));
    });
  });

  bindPassageGroupButtons();
}

function renderCommonPassageQuestion(question) {
  const groupHeaderHtml = buildPassageGroupHeader(question);
  const questionNumberLabelHtml = buildQuestionNumberLabelForPanel(question);
  const sharedPassageHtml = buildCommonPassageContentHtml(question);
  const sharedImageUrl = getSharedImageUrl(question);

  const imageHtml = sharedImageUrl
    ? `
      <div class="image-area" style="
        flex:1 1 auto;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:18px 20px 22px;
        min-height:430px;
        background:#ffffff;
      ">
        <img
          src="${escapeAttribute(sharedImageUrl)}"
          alt="${question.passage_group_title || question.question_number + "번"} 공통 이미지 자료"
          style="
            width:100%;
            max-width:740px;
            max-height:min(540px, calc(100vh - 315px));
            height:auto;
            object-fit:contain;
            border:1px solid #e3e6ea;
            border-radius:12px;
            display:block;
            margin:0 auto;
            background:#ffffff;
          "
        />
      </div>
    `
    : "";

  const passageContentHtml = sharedImageUrl
    ? imageHtml
    : `<div
        class="passage-content"
        data-passage-content="true"
        style="
          font-size:20px;
          line-height:2.05;
          min-height:360px;
          padding:24px 28px;
          word-break:keep-all;
          overflow-wrap:normal;
        "
      >${sharedPassageHtml}</div>`;

  const optionsHtml = question.options.map(function (optionText, index) {
    const optionNumber = index + 1;
    const selectedClass = answers[question.id] === optionNumber ? " selected" : "";

    return `
      <button
        type="button"
        class="option-button${selectedClass}"
        data-option="${optionNumber}"
        style="
          min-height:52px;
          font-size:18px;
          line-height:1.45;
          padding:12px 16px;
        "
      >
        ${optionNumber}. ${escapeHtml(optionText)}
      </button>
    `;
  }).join("");

  const questionTextHtml = getNumberedQuestionTextHtml(question, "물음에 답하십시오.");

  elements.questionStage.innerHTML = `
    <div class="view-tab">보기</div>
    <div style="background:#ffffff; padding:16px 18px 18px; min-height:440px;">
      ${groupHeaderHtml}

      <div class="reading-layout" style="
        padding:0;
        display:grid;
        grid-template-columns:minmax(0, 1.12fr) minmax(390px, 0.88fr);
        gap:18px;
        align-items:stretch;
      ">
        <article class="passage-panel" style="
          border:1px solid #e3e6ea;
          border-radius:14px;
          background:#ffffff;
          overflow:hidden;
          min-height:440px;
          display:flex;
          flex-direction:column;
        ">
          <div class="panel-label" style="
            padding:12px 16px;
            border-bottom:1px solid #e3e6ea;
            font-weight:900;
            color:#003f8f;
            background:#fafcff;
            font-size:17px;
          ">공통 지문</div>
          ${passageContentHtml}
        </article>

        <article class="question-panel" style="
          border:1px solid #e3e6ea;
          border-radius:14px;
          background:#fbfcfe;
          overflow:hidden;
          min-height:440px;
          display:flex;
          flex-direction:column;
        ">
          <div class="panel-label" style="
            padding:12px 16px;
            border-bottom:1px solid #e3e6ea;
            font-weight:900;
            color:#003f8f;
            background:#fafcff;
            font-size:17px;
          ">${escapeHtml(getCommonSetQuestionPanelTitle(question))}</div>

          <div class="question-content" style="
            padding:22px 22px 24px;
            display:flex;
            flex-direction:column;
            flex:1 1 auto;
          ">
            ${questionNumberLabelHtml}
            <p class="question-text" style="
              margin:0 0 18px;
              font-size:20px;
              line-height:1.55;
              font-weight:900;
              word-break:keep-all;
            ">${questionTextHtml}</p>
            <div class="options-area" style="
              display:grid;
              grid-template-columns:1fr;
              gap:10px;
            ">${optionsHtml}</div>
          </div>
        </article>
      </div>
    </div>
  `;

  elements.questionStage.querySelectorAll(".option-button").forEach(function (button) {
    button.addEventListener("click", function () {
      selectAnswer(question.id, Number(button.dataset.option));
    });
  });

  bindPassageGroupButtons();
}

function shouldRenderOneColumnChoice(question) {
  const oneColumnTypes = [
    "topic_content",
    "topic_choice",
    "same_content",
    "visual_not_matching",
    "not_matching",
    "main_idea",
    "detail",
    "notice",
    "practical_text",
    "long_passage_detail",
    "long_passage_inference",
    "paired_passage",
    "purpose_choice",
    "content_detail",
    "activity_choice"
  ];

  return oneColumnTypes.includes(question.type);
}

function renderVisualNotMatchingQuestion(question) {
  const imageHtml = question.image_url
    ? `
      <div style="
        flex:1 1 auto;
        display:flex;
        align-items:center;
        justify-content:center;
        padding:18px 20px 22px;
        min-height:410px;
        background:#ffffff;
      ">
        <img
          src="${escapeAttribute(question.image_url)}"
          alt="${question.question_number}번 이미지 자료"
          style="
            width:100%;
            max-width:720px;
            max-height:min(520px, calc(100vh - 310px));
            height:auto;
            object-fit:contain;
            border:1px solid #e3e6ea;
            border-radius:12px;
            display:block;
            background:#ffffff;
          "
        />
      </div>
    `
    : `
      <div style="
        padding:24px;
        color:#6b7280;
        font-weight:900;
        text-align:center;
      ">이미지 자료가 없습니다.</div>
    `;

  const optionsHtml = question.options.map(function (optionText, index) {
    const optionNumber = index + 1;
    const selectedClass = answers[question.id] === optionNumber ? " selected" : "";

    return `
      <button
        type="button"
        class="option-button${selectedClass}"
        data-option="${optionNumber}"
        style="
          min-height:54px;
          font-size:18px;
          line-height:1.45;
          padding:12px 16px;
        "
      >
        ${optionNumber}. ${escapeHtml(optionText)}
      </button>
    `;
  }).join("");

  const questionTextHtml = buildNegativeQuestionTextHtml(
    getNumberedQuestionTextForPanel(question, "다음을 읽고 맞지 않는 것을 고르십시오.")
  );

  elements.questionStage.innerHTML = `
    <div class="view-tab">보기</div>

    <div style="
      background:#ffffff;
      padding:18px;
      min-height:440px;
    ">
      <div style="
        display:grid;
        grid-template-columns:minmax(0, 1.08fr) minmax(390px, 0.92fr);
        gap:18px;
        align-items:stretch;
      ">
        <article style="
          border:1px solid #e3e6ea;
          border-radius:14px;
          background:#ffffff;
          overflow:hidden;
          min-height:460px;
          display:flex;
          flex-direction:column;
        ">
          <div style="
            padding:12px 16px;
            border-bottom:1px solid #e3e6ea;
            font-weight:900;
            color:#003f8f;
            background:#fafcff;
            font-size:17px;
          ">자료</div>

          ${imageHtml}
        </article>

        <article style="
          border:1px solid #e3e6ea;
          border-radius:14px;
          background:#fbfcfe;
          overflow:hidden;
          min-height:460px;
          display:flex;
          flex-direction:column;
        ">
          <div style="
            padding:12px 16px;
            border-bottom:1px solid #e3e6ea;
            font-weight:900;
            color:#003f8f;
            background:#fafcff;
            font-size:17px;
          ">문제</div>

          <div style="
            padding:22px 22px 24px;
            display:flex;
            flex-direction:column;
            flex:1 1 auto;
          ">
            <p class="question-text" style="
              margin:0 0 18px;
              font-size:20px;
              line-height:1.55;
              font-weight:900;
            ">${questionTextHtml}</p>

            <div class="options-area" style="
              display:grid;
              grid-template-columns:1fr;
              gap:10px;
            ">${optionsHtml}</div>
          </div>
        </article>
      </div>
    </div>
  `;

  elements.questionStage.querySelectorAll(".option-button").forEach(function (button) {
    button.addEventListener("click", function () {
      selectAnswer(question.id, Number(button.dataset.option));
    });
  });
}


function normalizeKoreanQuestionTextForCompare(text) {
  return String(text || "")
    .replace(/\[[0-9]+\]/g, "")
    .replace(/[0-9]+번\s*문제/g, "")
    .replace(/\s+/g, "")
    .replace(/[.?!。！？]/g, "")
    .trim();
}

function shouldShowStandaloneQuestionTextInPanel(question) {
  if (!question) {
    return false;
  }

  const questionNumber = Number(question.question_number);
  const questionText = getQuestionTextForPanel(question, "");
  const instructionText = String(question.instruction || "").trim();

  if (!questionText) {
    return false;
  }

  /*
    31~33번 "무엇에 대한 내용입니까?"처럼 상단 지시문과 문제 문장이 같은 경우에는
    같은 문장을 보기 아래에 다시 표시하지 않는다.
  */
  const normalizedQuestion = normalizeKoreanQuestionTextForCompare(questionText);
  const normalizedInstruction = normalizeKoreanQuestionTextForCompare(instructionText);

  if (normalizedQuestion && normalizedInstruction && normalizedQuestion === normalizedInstruction) {
    return false;
  }

  if (
    question.type === "topic_content" &&
    normalizedQuestion.includes("무엇에대한내용입니까")
  ) {
    return false;
  }

  return true;
}

function renderOneColumnChoiceQuestion(question) {
  const groupHeaderHtml = buildPassageGroupHeader(question);
  const questionNumberLabelHtml = buildQuestionNumberLabelForPanel(question);
  const imageHtml = question.image_url
    ? `
      <div class="image-area" style="margin-bottom:14px;">
        <img
          src="${escapeAttribute(question.image_url)}"
          alt="${question.question_number}번 이미지 자료"
          style="
            max-width:100%;
            max-height:min(520px, calc(100vh - 330px));
            object-fit:contain;
            border:1px solid #e3e6ea;
            border-radius:12px;
            display:block;
            margin:0 auto 12px;
            background:#ffffff;
          "
        />
      </div>
    `
    : "";

  const passageHtml = question.passage
    ? `
      <div class="passage-content" data-passage-content="true" style="
        border:1px solid #e3e6ea;
        border-radius:14px;
        background:#ffffff;
        padding:20px 22px;
        margin-bottom:16px;
        font-size:20px;
        line-height:1.9;
        white-space:normal;
        color:#111827;
      ">${buildDisplayPassageHtml(question.passage, "")}</div>
    `
    : "";

  const optionsHtml = question.options.map(function (optionText, index) {
    const optionNumber = index + 1;
    const selectedClass = answers[question.id] === optionNumber ? " selected" : "";

    return `
      <button
        type="button"
        class="option-button${selectedClass}"
        data-option="${optionNumber}"
        style="
          min-height:48px;
          font-size:17px;
          line-height:1.45;
          padding:10px 14px;
        "
      >
        ${optionNumber}. ${escapeHtml(optionText)}
      </button>
    `;
  }).join("");

  const showQuestionText = shouldShowStandaloneQuestionTextInPanel(question);
  const questionTextHtml = showQuestionText
    ? `
      <p class="question-text" style="
        margin:0 0 14px;
        font-size:20px;
        line-height:1.55;
        font-weight:900;
      ">${getNumberedQuestionTextHtml(question, "알맞은 것을 고르십시오.")}</p>
    `
    : "";

  elements.questionStage.innerHTML = `
    <div class="view-tab">보기</div>
    <div style="background:#ffffff; padding:18px 18px 22px; min-height:360px;">
      ${groupHeaderHtml}
      ${imageHtml}
      ${passageHtml}

      <div style="
        border:1px solid #e3e6ea;
        border-radius:14px;
        background:#fbfcfe;
        padding:18px;
      ">
        ${questionNumberLabelHtml}
        ${questionTextHtml}
        <div class="options-area" style="
          display:grid;
          grid-template-columns:1fr;
          gap:9px;
        ">${optionsHtml}</div>
      </div>
    </div>
  `;

  elements.questionStage.querySelectorAll(".option-button").forEach(function (button) {
    button.addEventListener("click", function () {
      selectAnswer(question.id, Number(button.dataset.option));
    });
  });

  bindPassageGroupButtons();
}

function renderMultipleChoiceQuestion(question) {
  const groupHeaderHtml = buildPassageGroupHeader(question);
  const questionNumberLabelHtml = buildQuestionNumberLabelForPanel(question);
  const imageSource = getSharedImageUrl(question);
  const imageHtml = imageSource
    ? `
      <div class="image-area">
        <img
          src="${escapeAttribute(imageSource)}"
          alt="${question.question_number}번 이미지 자료"
          style="max-width:100%; border:1px solid #e3e6ea; border-radius:10px;"
        />
      </div>
    `
    : "";

  const optionsHtml = question.options.map(function (optionText, index) {
    const optionNumber = index + 1;
    const selectedClass = answers[question.id] === optionNumber ? " selected" : "";

    return `
      <button type="button" class="option-button${selectedClass}" data-option="${optionNumber}">
        ${optionNumber}. ${escapeHtml(optionText)}
      </button>
    `;
  }).join("");

  elements.questionStage.innerHTML = `
    ${groupHeaderHtml}
    <div class="reading-layout">
      <article class="passage-panel">
        <div class="panel-label">지문 / 자료</div>
        ${imageHtml}
        <div class="passage-content" data-passage-content="true">${buildDisplayPassageHtml(getSharedPassage(question), "")}</div>
      </article>

      <article class="question-panel">
        <div class="panel-label">문제</div>
        <div class="question-content">
          ${questionNumberLabelHtml}
          <p class="question-text">${escapeHtml(getNumberedQuestionTextForPanel(question, "물음에 답하십시오."))}</p>
          <div class="options-area">${optionsHtml}</div>
        </div>
      </article>
    </div>
  `;

  elements.questionStage.querySelectorAll(".option-button").forEach(function (button) {
    button.addEventListener("click", function () {
      selectAnswer(question.id, Number(button.dataset.option));
    });
  });

  bindPassageGroupButtons();
}

function selectAnswer(questionId, optionNumber) {
  answers[questionId] = optionNumber;
  renderQuestion();
}

function renderNavigationButtons() {
  elements.prevButton.disabled = currentIndex === 0;
  elements.nextButton.disabled = currentIndex === questions.length - 1;
}

function goToPreviousQuestion() {
  if (currentIndex > 0) {
    currentIndex -= 1;
    renderQuestion();
    window.scrollTo({ top: 0, behavior: "auto" });
  }
}

function goToNextQuestion() {
  if (currentIndex < questions.length - 1) {
    currentIndex += 1;
    renderQuestion();
    window.scrollTo({ top: 0, behavior: "auto" });
  }
}

function toggleReviewMark() {
  const question = questions[currentIndex];

  if (!question) {
    return;
  }

  reviewMarks[question.id] = !reviewMarks[question.id];

  if (!reviewMarks[question.id]) {
    delete reviewMarks[question.id];
  }

  renderQuestion();
}

function renderReviewButton(question) {
  // 학생 화면에서는 검토 표시 관련 문구를 노출하지 않는다.
  if (elements.reviewButton) {
    elements.reviewButton.style.display = "none";
    elements.reviewButton.setAttribute("aria-hidden", "true");
    elements.reviewButton.tabIndex = -1;
  }

  if (elements.reviewTextInline) {
    elements.reviewTextInline.innerHTML = "";
    elements.reviewTextInline.style.display = "none";
    elements.reviewTextInline.setAttribute("aria-hidden", "true");
  }
}

function openQuestionList() {
  injectQuestionListPolishStyle();
  renderProgress();
  renderAnswerStatus();
  elements.questionListBackdrop.classList.remove("hidden");
}

function closeQuestionList() {
  elements.questionListBackdrop.classList.add("hidden");
}

function injectQuestionListPolishStyle() {
  if (document.getElementById("topikQuestionListPolishStyle")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "topikQuestionListPolishStyle";
  style.textContent = `
    #questionListBackdrop {
      backdrop-filter: blur(2px);
    }

    #progressArea {
      display: grid !important;
      grid-template-columns: repeat(8, minmax(0, 1fr)) !important;
      gap: 8px !important;
      align-items: stretch !important;
      padding: 4px 0 !important;
    }

    .progress-dot.progress-card {
      width: 100% !important;
      min-width: 0 !important;
      height: 46px !important;
      min-height: 46px !important;
      border-radius: 10px !important;
      border: 2px solid #d7e6f8 !important;
      background: #ffffff !important;
      color: #003f8f !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      font-size: 17px !important;
      line-height: 1 !important;
      font-weight: 900 !important;
      box-shadow: none !important;
      padding: 0 !important;
      cursor: pointer !important;
    }

    .progress-dot.progress-card.current {
      border-color: #0877f2 !important;
      background: #e9f3ff !important;
      box-shadow: inset 0 0 0 1px #0877f2 !important;
    }

    .progress-dot.progress-card.answered {
      border-color: #34a853 !important;
      background: #e6f4ea !important;
      color: #137333 !important;
    }

    .progress-dot.progress-card.unanswered {
      border-color: #d7e6f8 !important;
      background: #ffffff !important;
      color: #003f8f !important;
    }

    .progress-dot.progress-card.answered.current {
      border-color: #0877f2 !important;
      background: #dff3e5 !important;
      color: #137333 !important;
    }

    .progress-dot.progress-card .progress-number {
      font-size: 17px !important;
      line-height: 1 !important;
      font-weight: 900 !important;
    }

    .progress-dot.progress-card .progress-state {
      display: none !important;
    }

    @media (max-width: 720px) {
      #progressArea {
        grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
      }
    }
  `;

  document.head.appendChild(style);
}


function getQuestionListGroupTitle(questionNumber) {
  return "";
}

function renderProgress() {
  elements.progressArea.innerHTML = "";

  questions.forEach(function (question, index) {
    const isAnswered = isQuestionAnswered(question);

    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "progress-dot progress-card";
    dot.dataset.questionNumber = String(question.question_number);

    if (index === currentIndex) {
      dot.classList.add("current");
    }

    if (isAnswered) {
      dot.classList.add("answered");
    } else {
      dot.classList.add("unanswered");
    }

    dot.innerHTML = `
      <span class="progress-number">${escapeHtml(String(question.question_number))}</span>
      <span class="progress-state">${isAnswered ? "답함" : "미응답"}</span>
    `;

    dot.title = `${question.question_number}번 문항으로 이동 · ${isAnswered ? "답함" : "미응답"}`;

    dot.addEventListener("click", function () {
      currentIndex = index;
      renderQuestion();
      closeQuestionList();
      window.scrollTo({ top: 0, behavior: "auto" });
    });

    elements.progressArea.appendChild(dot);
  });
}

function isQuestionAnswered(question) {
  if (question.type === "sentence_order") {
    const sentenceItems = getSentenceItems(question);
    const order = sentenceOrderAnswers[question.id];
    return Array.isArray(order) && order.length === sentenceItems.length && order.every(Boolean);
  }

  return answers[question.id] !== undefined && answers[question.id] !== null && answers[question.id] !== "";
}

function renderAnswerStatus() {
  const answeredCount = countAnsweredQuestions();
  const totalCount = questions.length;

  elements.answerStatusText.textContent = `${answeredCount} / ${totalCount}`;
  elements.sidebarStatusText.textContent = `총 ${totalCount}문항 중 ${answeredCount}문항 답안 선택`;
}

function countAnsweredQuestions() {
  return questions.filter(isQuestionAnswered).length;
}

function requestSubmit() {
  const unansweredNumbers = getUnansweredQuestionNumbers();

  let message = "";

  if (unansweredNumbers.length > 0) {
    message = [
      "아직 답을 선택하지 않은 문항이 있습니다.",
      "",
      `미응답 문항: ${unansweredNumbers.join(", ")}번`,
      "",
      "미응답 문항은 오답 처리됩니다.",
      "정말 제출하시겠습니까?"
    ].join("\n");
  } else {
    message = "모든 문항에 답했습니다. 정말 제출하시겠습니까?";
  }

  const ok = confirm(message);

  if (ok) {
    submitTest(currentRunMode === "wrong_review" ? "wrong_review" : "manual");
  }
}

function getUnansweredQuestionNumbers() {
  return questions
    .filter(function (question) {
      return !isQuestionAnswered(question);
    })
    .map(function (question) {
      return question.question_number;
    });
}

function getReviewMarkedQuestionNumbers() {
  return questions
    .filter(function (question) {
      return reviewMarks[question.id];
    })
    .map(function (question) {
      return question.question_number;
    });
}

function submitTest(submitReason) {
  stopTimer();
  closeQuestionList();

  submittedAt = new Date().toISOString();

  const result = gradeTest(submitReason);
  validateResultStructureForDiagnosis(result);
  const resultText = buildResultText(result);

  latestResult = result;
  latestResultText = resultText;

  saveReadingResultForDiagnosis(result);

  renderResult(result);
  renderDiagnosisLinkButton();
  showScreen("result");
  window.scrollTo({ top: 0, behavior: "auto" });
}

function gradeTest(submitReason) {
  const items = questions.map(function (question) {
    if (question.type === "sentence_order") {
      return gradeSentenceOrderQuestion(question);
    }

    if (question.type === "sentence_insert") {
      return gradeSentenceInsertQuestion(question);
    }

    const studentAnswer = answers[question.id] || null;
    const correctAnswer = Number(question.answer);
    const isCorrect = studentAnswer === correctAnswer;
    const points = getQuestionPoints(question.question_number, question.points);

    return {
      id: question.id,
      question_number: question.question_number,
      type: question.type,
      category: question.category,
      diagnostic_area: question.diagnostic_area,
      instruction: question.instruction || "",
      question: question.question,
      passage: getSharedPassage(question),
      options: question.options || [],
      image_url: getSharedImageUrl(question),
      passage_group_id: question.passage_group_id || null,
      passage_group_title: question.passage_group_title || null,
      passage_group_numbers: question.passage_group_numbers || [],
      shared_passage_index: question.shared_passage_index || null,
      shared_passage_total: question.shared_passage_total || null,
      points,
      earned_points: isCorrect ? points : 0,
      correct_answer: correctAnswer,
      student_answer: studentAnswer,
      student_order: null,
      correct_order: null,
      sentence_order_result: null,
      sentence_insert_result: null,
      is_correct: isCorrect,
      description: question.description,
      ...getQuestionTraceFields(question)
    };
  });

  const totalQuestions = items.length;
  const answeredCount = countAnsweredQuestions();
  const unansweredCount = totalQuestions - answeredCount;
  const correctCount = items.filter(function (item) {
    return item.is_correct;
  }).length;
  const wrongCount = totalQuestions - correctCount;
  const totalPossiblePoints = items.reduce(function (sum, item) {
    return sum + (Number(item.points) || 0);
  }, 0);
  const earnedPoints = items.reduce(function (sum, item) {
    return sum + (Number(item.earned_points) || 0);
  }, 0);
  const sectionScore100 = totalPossiblePoints > 0
    ? Math.round((earnedPoints / totalPossiblePoints) * TEST_CONFIG.scoreFullMark)
    : 0;

  return {
    test_level: TEST_CONFIG.testLevel,
    section: TEST_CONFIG.section,
    test_name: TEST_CONFIG.testDisplayName,
    test_scope: getResultTestScope(),
    generated_exam_mode: latestExamGenerationOptions.mode || "random",
    generated_exam_round: latestExamGenerationOptions.round || "",
    generated_exam_label: latestExamGenerationOptions.label || "랜덤 40문항 실전시험",
    generated_exam_type: latestExamGenerationOptions.exam_type || "full",
    question_number_start: TEST_CONFIG.questionNumberStart,
    question_number_end: TEST_CONFIG.questionNumberEnd,
    expected_total_questions: getActiveExpectedTotalQuestions(),
    is_full_40_question_set: totalQuestions === TEST_CONFIG.expectedTotalQuestions && !isLevelTestExamOptions(latestExamGenerationOptions),
    student_name: studentName,
    student_phone: studentPhone,
    started_at: startedAt,
    submitted_at: submittedAt,
    submit_reason: submitReason,
    time_limit_minutes: getActiveTimeLimitMinutes(),
    total_questions: totalQuestions,
    answered_count: answeredCount,
    unanswered_count: unansweredCount,
    correct_count: correctCount,
    wrong_count: wrongCount,
    total_possible_points: totalPossiblePoints,
    earned_points: earnedPoints,
    section_score_100: sectionScore100,
    unanswered_questions: getUnansweredQuestionNumbers(),
    items
  };
}

function gradeSentenceOrderQuestion(question) {
  const sentenceItems = getSentenceItems(question);
  const correctOrder = getCorrectOrder(question, sentenceItems);
  const studentOrder = sentenceOrderAnswers[question.id] || Array(sentenceItems.length).fill(null);
  const isComplete = studentOrder.length === correctOrder.length && studentOrder.every(Boolean);
  const isCorrect = isComplete && arraysEqual(studentOrder, correctOrder);
  const studentAnswerText = isComplete ? studentOrder.join("-") : null;
  const correctAnswerText = correctOrder.join("-");

  const missingPositions = studentOrder
    .map(function (label, index) {
      return label ? null : index + 1;
    })
    .filter(function (value) {
      return value !== null;
    });
  const points = getQuestionPoints(question.question_number, question.points);

  return {
    id: question.id,
    question_number: question.question_number,
    type: question.type,
    category: question.category,
    diagnostic_area: question.diagnostic_area,
    instruction: question.instruction || "",
    question: question.question || "오른쪽의 문장을 왼쪽으로 끌어 놓아 순서를 맞추십시오.",
    passage: getSharedPassage(question),
    options: question.options || [],
    image_url: getSharedImageUrl(question),
    passage_group_id: question.passage_group_id || null,
    passage_group_title: question.passage_group_title || null,
    passage_group_numbers: question.passage_group_numbers || [],
    shared_passage_index: question.shared_passage_index || null,
    shared_passage_total: question.shared_passage_total || null,
    points,
    earned_points: isCorrect ? points : 0,
    correct_answer: correctAnswerText,
    student_answer: studentAnswerText,
    student_order: isComplete ? studentOrder : null,
    correct_order: correctOrder,
    sentence_order_result: {
      is_complete: isComplete,
      student_order: isComplete ? studentOrder : null,
      correct_order: correctOrder,
      student_answer_text: studentAnswerText,
      correct_answer_text: correctAnswerText,
      missing_positions: missingPositions,
      sentence_items: sentenceItems
    },
    sentence_insert_result: null,
    is_correct: isCorrect,
    description: question.description,
    ...getQuestionTraceFields(question)
  };
}

function gradeSentenceInsertQuestion(question) {
  const labels = getInsertPositionLabels(question);
  const studentAnswerNumber = answers[question.id] || null;
  const studentPosition = studentAnswerNumber ? labels[studentAnswerNumber - 1] : null;
  const correctPosition = getCorrectInsertPosition(question, labels);
  const insertSentence = getInsertSentence(question);
  const isCorrect = Boolean(studentPosition) && studentPosition === correctPosition;
  const points = getQuestionPoints(question.question_number, question.points);

  return {
    id: question.id,
    question_number: question.question_number,
    type: question.type,
    category: question.category,
    diagnostic_area: question.diagnostic_area,
    instruction: question.instruction || "",
    question: question.question || "다음 문장이 들어갈 위치로 알맞은 곳을 고르십시오.",
    passage: getSharedPassage(question),
    options: question.options || [],
    image_url: getSharedImageUrl(question),
    passage_group_id: question.passage_group_id || null,
    passage_group_title: question.passage_group_title || null,
    passage_group_numbers: question.passage_group_numbers || [],
    shared_passage_index: question.shared_passage_index || null,
    shared_passage_total: question.shared_passage_total || null,
    points,
    earned_points: isCorrect ? points : 0,
    correct_answer: correctPosition,
    student_answer: studentPosition,
    student_order: null,
    correct_order: null,
    sentence_order_result: null,
    sentence_insert_result: {
      is_inserted: Boolean(studentPosition),
      student_position: studentPosition,
      correct_position: correctPosition,
      insert_sentence: insertSentence,
      position_labels: labels
    },
    is_correct: isCorrect,
    description: question.description,
    ...getQuestionTraceFields(question)
  };
}

function getCorrectInsertPosition(question, labels) {
  if (question.correct_position) {
    return question.correct_position;
  }

  const answerNumber = Number(question.answer);

  if ([1, 2, 3, 4].includes(answerNumber)) {
    return labels[answerNumber - 1];
  }

  return labels[0];
}

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return false;
  }

  return a.every(function (value, index) {
    return value === b[index];
  });
}


function getDiagnosisConnectionStatusText(result) {
  if (isWrongReviewResult(result)) {
    return "오답풀이 결과 저장";
  }

  if (isLevelTestResult(result)) {
    return "레벨테스트 전용 저장";
  }

  if (isGeneralFullReadingResult(result)) {
    return "진단 보고서 준비 완료";
  }

  return "진단 저장 제외";
}

function validateResultStructureForDiagnosis(result) {
  const requiredTopLevelFields = [
    "test_level",
    "section",
    "test_name",
    "test_scope",
    "question_number_start",
    "question_number_end",
    "expected_total_questions",
    "is_full_40_question_set",
    "student_name",
    "student_phone",
    "started_at",
    "submitted_at",
    "time_limit_minutes",
    "total_questions",
    "answered_count",
    "unanswered_count",
    "correct_count",
    "wrong_count",
    "total_possible_points",
    "earned_points",
    "section_score_100",
    "generated_exam_mode",
    "generated_exam_round",
    "generated_exam_label",
    "unanswered_questions",
    "items"
  ];

  const requiredItemFields = [
    "id",
    "question_number",
    "type",
    "category",
    "diagnostic_area",
    "instruction",
    "question",
    "passage",
    "options",
    "points",
    "earned_points",
    "correct_answer",
    "student_answer",
    "is_correct",
    "description"
  ];

  const missingTopLevelFields = requiredTopLevelFields.filter(function (field) {
    return !(field in result);
  });

  const missingItemFieldMap = [];

  if (Array.isArray(result.items)) {
    result.items.forEach(function (item) {
      const missingFields = requiredItemFields.filter(function (field) {
        return !(field in item);
      });

      if (missingFields.length > 0) {
        missingItemFieldMap.push({
          question_number: item && item.question_number,
          missing_fields: missingFields
        });
      }
    });
  } else {
    missingTopLevelFields.push("items");
  }

  const validationResult = {
    ok: missingTopLevelFields.length === 0 && missingItemFieldMap.length === 0,
    missing_top_level_fields: missingTopLevelFields,
    missing_item_fields: missingItemFieldMap
  };

  if (!validationResult.ok) {
    console.warn("TOPIK I 진단 연결 result 구조 점검 필요:", validationResult);
  } else {
    console.info("TOPIK I 진단 연결 result 구조 점검 완료:", {
      total_questions: result.total_questions,
      answered_count: result.answered_count,
      unanswered_count: result.unanswered_count,
      storage_key: AUTO_DIAGNOSIS_STORAGE_KEY
    });
  }

  return validationResult;
}

function renderResult(result) {
  if (!elements.resultSummary) return;

  const submittedAtText = formatDateTimeForDisplay(result.submitted_at);
  const resultTitle = document.querySelector("#resultScreen h1");

  if (isLevelTestResult(result)) {
    renderLevelTestResult(result, submittedAtText);
    return;
  }

  if (resultTitle) {
    resultTitle.textContent = "시험 제출 완료";
  }

  const resultSubtitle = document.querySelector("#resultScreen .start-subtitle");

  if (resultSubtitle) {
    resultSubtitle.textContent = "읽기 시험이 제출되었습니다. 진단 보고서 화면에서 결과를 확인하세요.";
  }

  elements.resultSummary.innerHTML = `
    <div class="summary-card">
      <strong>응시자</strong>
      ${escapeHtml(result.student_name)}
    </div>
    <div class="summary-card">
      <strong>전화번호</strong>
      ${escapeHtml(result.student_phone)}
    </div>
    <div class="summary-card">
      <strong>제출 시간</strong>
      ${escapeHtml(submittedAtText)}
    </div>
    <div class="summary-card">
      <strong>시험 영역</strong>
      TOPIK I 읽기
    </div>
    <div class="summary-card">
      <strong>응답 문항</strong>
      ${result.answered_count} / ${result.total_questions}
    </div>
    <div class="summary-card">
      <strong>미응답</strong>
      ${result.unanswered_count}문항
    </div>
    <div class="summary-card">
      <strong>읽기 점수</strong>
      ${result.section_score_100} / 100
    </div>
    <div class="summary-card">
      <strong>진단 연결</strong>
      ${escapeHtml(getDiagnosisConnectionStatusText(result))}
    </div>
  `;

  if (elements.resultTable) {
    elements.resultTable.innerHTML = "";
  }

  if (elements.categoryAnalysis) {
    elements.categoryAnalysis.innerHTML = "";
  }
}

function renderLevelTestResult(result, submittedAtText) {
  const resultTitle = document.querySelector("#resultScreen h1");
  const resultSubtitle = document.querySelector("#resultScreen .start-subtitle");
  const levelSummary = getLevelTestEstimate(result);
  const selectedLabel = result.generated_exam_label || "레벨테스트";
  const correctRate = result.total_questions > 0
    ? Math.round((result.correct_count / result.total_questions) * 100)
    : 0;

  if (resultTitle) {
    resultTitle.textContent = "레벨테스트 결과";
  }

  if (resultSubtitle) {
    resultSubtitle.textContent =
      "20문항 레벨테스트 결과입니다. 이 결과는 40문항 정식 진단 보고서를 덮어쓰지 않습니다.";
  }

  elements.resultSummary.innerHTML = `
    <div
      class="summary-card"
      style="
        grid-column:1 / -1;
        border-color:#b9d8ff;
        background:#f8fbff;
      "
    >
      <strong>읽기 기준 예상 수준</strong>
      <div style="font-size:24px; font-weight:900; color:#111827; margin:4px 0;">
        ${escapeHtml(levelSummary.title)}
      </div>
      <div style="color:#374151; font-weight:700; line-height:1.65;">
        ${escapeHtml(levelSummary.description)}
      </div>
      <div style="margin-top:8px; color:#5f6368; font-size:14px; line-height:1.55;">
        ※ 레벨테스트용 참고 결과입니다. 공식 TOPIK 급수는 듣기·읽기 총점 기준과 시행 기준에 따라 결정됩니다.
      </div>
    </div>

    <div class="summary-card">
      <strong>응시자</strong>
      ${escapeHtml(result.student_name)}
    </div>
    <div class="summary-card">
      <strong>선택 시험지</strong>
      ${escapeHtml(selectedLabel)}
    </div>
    <div class="summary-card">
      <strong>제출 시간</strong>
      ${escapeHtml(submittedAtText)}
    </div>

    <div class="summary-card">
      <strong>레벨테스트 점수</strong>
      ${result.section_score_100} / 100
    </div>
    <div class="summary-card">
      <strong>정답 수</strong>
      ${result.correct_count} / ${result.total_questions}
    </div>
    <div class="summary-card">
      <strong>정답률</strong>
      ${correctRate}%
    </div>

    <div class="summary-card">
      <strong>응답 문항</strong>
      ${result.answered_count} / ${result.total_questions}
    </div>
    <div class="summary-card">
      <strong>미응답</strong>
      ${result.unanswered_count}문항
    </div>
    <div class="summary-card">
      <strong>결과 보관</strong>
      레벨테스트 전용 저장
    </div>

    <div
      class="summary-card"
      style="
        grid-column:1 / -1;
        display:flex;
        gap:10px;
        flex-wrap:wrap;
        align-items:center;
      "
    >
      <button type="button" class="button" id="levelTestDiagnosisButton">레벨테스트 진단 보고서 보기</button>
      <button type="button" class="button secondary" id="levelTestRetryButton">레벨테스트 다시 보기</button>
      <button type="button" class="button secondary" id="goFullTestButton">40문항 실전시험 선택</button>
      <button type="button" class="button gray" id="goStartButton">처음 화면으로</button>
      <span style="color:#5f6368; font-size:14px; line-height:1.5;">
        레벨테스트 진단 보고서는 별도 저장 결과를 사용합니다. 40문항 정식 진단 보고서는 일반 실전시험 제출 후 확인할 수 있습니다.
      </span>
    </div>
  `;

  if (elements.resultTable) {
    elements.resultTable.innerHTML = buildLevelTestQuestionOverview(result);
  }

  if (elements.categoryAnalysis) {
    elements.categoryAnalysis.innerHTML = "";
  }

  bindLevelTestResultButtons();
}

function getLevelTestEstimate(result) {
  const score = Number(result && result.section_score_100) || 0;
  const unanswered = Number(result && result.unanswered_count) || 0;

  if (score >= 80) {
    return {
      title: "TOPIK I 읽기 안정권",
      description: "기초 어휘·문법과 공통 지문 이해가 안정적입니다. 40문항 실전시험으로 전체 시간을 점검해 보세요."
    };
  }

  if (score >= 60) {
    return {
      title: "TOPIK I 읽기 보통권",
      description: "기본 유형은 이해하고 있습니다. 빈칸, 공통 지문, 문장 삽입 유형을 중심으로 보완하면 좋습니다."
    };
  }

  if (score >= 40) {
    return {
      title: "TOPIK I 읽기 보강 필요",
      description: "기초 문항은 풀 수 있지만 중·후반부 지문에서 흔들릴 수 있습니다. 짧은 글 이해와 빈칸 유형부터 다시 연습하세요."
    };
  }

  if (unanswered >= Math.ceil((Number(result && result.total_questions) || 20) / 2)) {
    return {
      title: "시간 관리 우선 보강",
      description: "미응답 문항이 많습니다. 쉬운 문항부터 빠르게 풀고, 긴 지문은 나중에 다시 보는 연습이 필요합니다."
    };
  }

  return {
    title: "기초 읽기 보강 필요",
    description: "TOPIK I 읽기 기본 어휘, 조사, 짧은 글의 중심 내용 파악부터 차근차근 복습하는 것이 좋습니다."
  };
}

function buildLevelTestQuestionOverview(result) {
  const items = Array.isArray(result && result.items) ? result.items : [];

  if (!items.length) {
    return "";
  }

  const rows = items.map(function (item) {
    const noAnswer = item.student_answer === null || item.student_answer === undefined;
    const status = noAnswer
      ? "미응답"
      : item.is_correct
        ? "정답"
        : "오답";
    const statusColor = item.is_correct ? "#188038" : noAnswer ? "#e88900" : "#d93025";

    return `
      <tr>
        <td style="white-space:nowrap; font-weight:900; border:1px solid #e3e6ea; padding:8px;">${item.question_number}번</td>
        <td style="border:1px solid #e3e6ea; padding:8px;">${escapeHtml(item.category || "-")}</td>
        <td style="white-space:nowrap; color:${statusColor}; font-weight:900; border:1px solid #e3e6ea; padding:8px;">${status}</td>
        <td style="white-space:nowrap; border:1px solid #e3e6ea; padding:8px;">${Number(item.earned_points) || 0} / ${Number(item.points) || 0}</td>
      </tr>
    `;
  }).join("");

  return `
    <details style="margin-top:16px;">
      <summary
        style="
          cursor:pointer;
          font-size:18px;
          font-weight:900;
          color:#003f8f;
          padding:12px 14px;
          border:1px solid #cfe3ff;
          border-radius:12px;
          background:#f8fbff;
        "
      >
        문항별 간단 결과 펼치기
      </summary>
      <div style="overflow-x:auto; margin-top:10px;">
        <table style="width:100%; border-collapse:collapse; font-size:14px; background:#ffffff;">
          <thead>
            <tr style="background:#f8fbff;">
              <th style="border:1px solid #e3e6ea; padding:8px; text-align:left;">문항</th>
              <th style="border:1px solid #e3e6ea; padding:8px; text-align:left;">유형</th>
              <th style="border:1px solid #e3e6ea; padding:8px; text-align:left;">결과</th>
              <th style="border:1px solid #e3e6ea; padding:8px; text-align:left;">점수</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </details>
  `;
}

function bindLevelTestResultButtons() {
  const diagnosisButton = document.getElementById("levelTestDiagnosisButton");
  const retryButton = document.getElementById("levelTestRetryButton");
  const fullTestButton = document.getElementById("goFullTestButton");
  const startButton = document.getElementById("goStartButton");

  if (diagnosisButton) {
    diagnosisButton.addEventListener("click", function () {
      window.location.href = LEVEL_TEST_DIAGNOSIS_URL + "&v=leveltest-diagnosis-" + Date.now();
    });
  }

  if (retryButton) {
    retryButton.addEventListener("click", function () {
      prepareStartScreenFromResult("leveltest");
    });
  }

  if (fullTestButton) {
    fullTestButton.addEventListener("click", function () {
      prepareStartScreenFromResult("full");
    });
  }

  if (startButton) {
    startButton.addEventListener("click", function () {
      prepareStartScreenFromResult(null);
    });
  }
}

function prepareStartScreenFromResult(targetExamType) {
  showScreen("start");

  if (targetExamType === "leveltest") {
    setExamType("leveltest");
  } else if (targetExamType === "full") {
    setExamType("full");
  }

  if (typeof refreshExamSelectionUi === "function") {
    refreshExamSelectionUi();
  }

  if (elements.startMessage) {
    elements.startMessage.textContent = "";
  }

  window.scrollTo({ top: 0, behavior: "auto" });
}

function saveLevelTestResult(result) {
  try {
    const savedAt = new Date().toISOString();

    const dataForLevelTest = {
      ...result,
      leveltest_connection: {
        saved_at: savedAt,
        storage_key: LEVEL_TEST_RESULT_STORAGE_KEY,
        source: "reading-test-leveltest"
      }
    };

    localStorage.setItem(
      LEVEL_TEST_RESULT_STORAGE_KEY,
      JSON.stringify(dataForLevelTest)
    );

    console.info(
      "레벨테스트 결과 전용 저장 완료:",
      LEVEL_TEST_RESULT_STORAGE_KEY
    );
  } catch (error) {
    console.error("레벨테스트 결과 전용 저장 실패:", error);
  }
}


function isWrongReviewResult(result) {
  return Boolean(
    result &&
      String(result.submit_reason || "") === "wrong_review"
  );
}

function isGeneralFullReadingResult(result) {
  return Boolean(
    result &&
      result.section === TEST_CONFIG.section &&
      Number(result.total_questions) === TEST_CONFIG.expectedTotalQuestions &&
      result.is_full_40_question_set === true &&
      !isWrongReviewResult(result) &&
      !isLevelTestResult(result)
  );
}

function getWrongReviewQuestionNumbersFromResult(result) {
  if (!result || !Array.isArray(result.items)) {
    return [];
  }

  return Array.from(
    new Set(
      result.items
        .filter(function (item) {
          return !item.is_correct;
        })
        .map(function (item) {
          return Number(item.question_number);
        })
        .filter(Number.isFinite)
    )
  ).sort(function (a, b) {
    return a - b;
  });
}

function saveWrongReviewRemainingNumbers(result) {
  const remainingNumbers = getWrongReviewQuestionNumbersFromResult(result);
  const existingPackage = getWrongReviewStoragePackage();
  const existingSourceResult =
    existingPackage && existingPackage.source_result
      ? existingPackage.source_result
      : getWrongReviewSourceResult();

  localStorage.setItem(
    WRONG_REVIEW_QUESTION_NUMBERS_STORAGE_KEY,
    JSON.stringify(remainingNumbers)
  );

  localStorage.setItem(
    WRONG_REVIEW_SOURCE_RESULT_STORAGE_KEY,
    JSON.stringify({
      saved_at: new Date().toISOString(),
      source: "reading-test-wrong-review",
      source_result: existingSourceResult,
      latest_wrong_review_result: result,
      remaining_wrong_review_question_numbers: remainingNumbers
    })
  );

  console.log(
    "오답풀이 남은 문항 저장 완료:",
    WRONG_REVIEW_QUESTION_NUMBERS_STORAGE_KEY,
    remainingNumbers
  );
}

function saveReadingResultForDiagnosis(result) {
  try {
    if (isWrongReviewResult(result)) {
      saveWrongReviewRemainingNumbers(result);
      console.info(
        "오답풀이 결과이므로 topik1_latest_reading_result를 덮어쓰지 않습니다."
      );
      return;
    }

    if (isLevelTestResult(result)) {
      saveLevelTestResult(result);
      console.info(
        "레벨테스트 결과이므로 topik1_latest_reading_result를 덮어쓰지 않습니다."
      );
      return;
    }

    if (!isGeneralFullReadingResult(result)) {
      console.info(
        "일반 40문항 읽기 결과가 아니므로 자동 진단 기준 결과를 저장하지 않습니다."
      );
      return;
    }

    const savedAt = new Date().toISOString();
    const wrongReviewQuestionNumbers =
      getWrongReviewQuestionNumbersFromResult(result);

    const dataForDiagnosis = {
      ...result,
      auto_connection: {
        saved_at: savedAt,
        storage_key: AUTO_DIAGNOSIS_STORAGE_KEY,
        source: "reading-test"
      }
    };

    localStorage.setItem(
      AUTO_DIAGNOSIS_STORAGE_KEY,
      JSON.stringify(dataForDiagnosis)
    );

    localStorage.setItem(
      WRONG_REVIEW_QUESTION_NUMBERS_STORAGE_KEY,
      JSON.stringify(wrongReviewQuestionNumbers)
    );

    localStorage.setItem(
      WRONG_REVIEW_SOURCE_RESULT_STORAGE_KEY,
      JSON.stringify({
        saved_at: savedAt,
        storage_key: WRONG_REVIEW_SOURCE_RESULT_STORAGE_KEY,
        source: "reading-test",
        source_result: dataForDiagnosis,
        remaining_wrong_review_question_numbers: wrongReviewQuestionNumbers
      })
    );

    console.log(
      "reading-result 자동 진단 연결 저장 완료:",
      AUTO_DIAGNOSIS_STORAGE_KEY
    );

    console.log(
      "오답 다시 풀기 대상 저장 완료:",
      WRONG_REVIEW_QUESTION_NUMBERS_STORAGE_KEY,
      wrongReviewQuestionNumbers
    );
  } catch (error) {
    console.error("reading-result 자동 진단 연결 저장 실패:", error);
  }
}

function renderDiagnosisLinkButton() {
  const duplicatedButton = document.getElementById("diagnosisLinkButton");

  if (duplicatedButton) {
    duplicatedButton.remove();
  }

  const openDiagnosisButton = document.getElementById("openDiagnosisButton");

  if (!openDiagnosisButton) {
    console.warn("진단 보고서 버튼(openDiagnosisButton)을 찾지 못했습니다. index.html을 확인하세요.");
    return;
  }

  if (latestResult && isLevelTestResult(latestResult)) {
    openDiagnosisButton.style.display = "none";
    openDiagnosisButton.setAttribute("aria-hidden", "true");
    openDiagnosisButton.onclick = null;
    return;
  }

  const diagnosisUrl = isWrongReviewResult(latestResult) && isLevelTestResult(getWrongReviewSourceResult())
    ? LEVEL_TEST_DIAGNOSIS_URL
    : AUTO_DIAGNOSIS_URL;

  openDiagnosisButton.style.display = "inline-flex";
  openDiagnosisButton.removeAttribute("aria-hidden");
  openDiagnosisButton.removeAttribute("onclick");

  openDiagnosisButton.onclick = function () {
    window.location.href = diagnosisUrl + "&v=diagnosis-" + Date.now();
  };
}

function formatDateTimeForDisplay(isoText) {
  const date = new Date(isoText);

  if (Number.isNaN(date.getTime())) {
    return isoText;
  }

  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit"
  });
}

function buildResultText(result) {
  const wrongItems = result.items.filter(function (item) {
    return !item.is_correct;
  });

  const wrongCategoryMap = analyzeWrongCategories(result.items);

  const itemLines = result.items.map(function (item) {
    const studentAnswer = item.student_answer === null ? "미응답" : item.student_answer;
    const resultMark = item.is_correct ? "O" : "X";

    const baseLines = [
      `${item.question_number}번 (${item.id})`,
      `   유형: ${item.type}`,
      `   배점: ${item.points || 0}점`,
      `   획득 점수: ${item.earned_points || 0}점`,
      `   문제: ${item.question}`,
      ...(item.passage ? [
        `   지문: ${item.passage}`
      ] : []),
      ...(item.passage_group_id ? [
        `   공통 지문 그룹: ${item.passage_group_title || item.passage_group_id}`,
        `   공통 지문 문항: ${(item.passage_group_numbers || []).join(", ")}`,
        `   공통 지문 순서: ${item.shared_passage_index || "-"} / ${item.shared_passage_total || "-"}`
      ] : []),
      `   정답: ${formatAnswerForText(item.correct_answer)}`,
      `   내 답: ${formatAnswerForText(studentAnswer)}`,
      `   결과: ${resultMark}`,
      `   category: ${item.category}`,
      `   diagnostic_area: ${item.diagnostic_area}`,
      `   description: ${item.description}`
    ];

    if (item.sentence_order_result) {
      baseLines.push(
        `   sentence_order_result.is_complete: ${item.sentence_order_result.is_complete ? "예" : "아니오"}`,
        `   sentence_order_result.student_order: ${item.sentence_order_result.student_answer_text || "미완성"}`,
        `   sentence_order_result.correct_order: ${item.sentence_order_result.correct_answer_text}`,
        `   sentence_order_result.missing_positions: ${
          item.sentence_order_result.missing_positions.length
            ? item.sentence_order_result.missing_positions.join(", ")
            : "없음"
        }`
      );
    }

    if (item.sentence_insert_result) {
      baseLines.push(
        `   sentence_insert_result.is_inserted: ${item.sentence_insert_result.is_inserted ? "예" : "아니오"}`,
        `   sentence_insert_result.student_position: ${item.sentence_insert_result.student_position || "미응답"}`,
        `   sentence_insert_result.correct_position: ${item.sentence_insert_result.correct_position}`,
        `   sentence_insert_result.insert_sentence: ${item.sentence_insert_result.insert_sentence}`
      );
    }

    return baseLines.join("\n");
  }).join("\n\n");

  const wrongLines = wrongItems.length
    ? wrongItems.map(function (item) {
        const studentAnswer = item.student_answer === null ? "미응답" : item.student_answer;
        return `- ${item.question_number}번 ${item.id}: 정답 ${formatAnswerForText(item.correct_answer)}, 내 답 ${formatAnswerForText(studentAnswer)}, ${item.category}`;
      }).join("\n")
    : "- 오답 없음";

  const categoryLines = Object.keys(wrongCategoryMap).length
    ? Object.entries(wrongCategoryMap).map(function ([category, count]) {
        return `- ${category}: ${count}개`;
      }).join("\n")
    : "- category별 오답 없음";

  const unansweredText = result.unanswered_questions.length
    ? result.unanswered_questions.join(", ") + "번"
    : "없음";

  return [
    "TOPIK I Reading IBT Simulation 결과",
    "================================",
    `시험명: ${result.test_name}`,
    `시험 범위: ${result.test_scope}`,
    `문항 범위: ${result.question_number_start}번~${result.question_number_end}번`,
    `응시자 이름: ${result.student_name}`,
    `전화번호: ${result.student_phone}`,
    `시작 시간: ${result.started_at}`,
    `제출 시간: ${result.submitted_at}`,
    `제출 사유: ${result.submit_reason}`,
    `제한 시간: ${result.time_limit_minutes}분`,
    `응답 문항 수: ${result.answered_count} / ${result.total_questions}`,
    `미응답 문항 수: ${result.unanswered_count}`,
    `읽기 점수: ${result.section_score_100} / 100`,
    `정답 수: ${result.correct_count} / ${result.total_questions}`,
    `오답 수: ${result.wrong_count}`,
    `획득 점수: ${result.earned_points || 0} / ${result.total_possible_points || 100}`,
    `미응답 문항: ${unansweredText}`,
    `40문항 전체 세트 여부: ${result.is_full_40_question_set ? "예" : "아니오"}`,
    "",
    "문항별 결과",
    "--------------------------------",
    itemLines,
    "",
    "오답 문항 목록",
    "--------------------------------",
    wrongLines,
    "",
    "category별 오답 개수",
    "--------------------------------",
    categoryLines
  ].join("\n");
}

function formatAnswerForText(value) {
  if (Array.isArray(value)) {
    return value.join("-");
  }

  if (value === null || value === undefined || value === "") {
    return "미응답";
  }

  return String(value);
}

function analyzeWrongCategories(items) {
  return items.reduce(function (map, item) {
    if (!item.is_correct) {
      map[item.category] = (map[item.category] || 0) + 1;
    }

    return map;
  }, {});
}

function downloadJson(data, fileName) {
  const jsonText = JSON.stringify(data, null, 2);
  downloadBlob(jsonText, fileName, "application/json;charset=utf-8");
}

function downloadText(text, fileName) {
  downloadBlob(text, fileName, "text/plain;charset=utf-8");
}

function downloadBlob(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function showScreen(screenName) {
  elements.startScreen.classList.add("hidden");
  elements.testScreen.classList.add("hidden");
  elements.resultScreen.classList.add("hidden");

  if (screenName === "start") {
    elements.startScreen.classList.remove("hidden");
  }

  if (screenName === "test") {
    elements.testScreen.classList.remove("hidden");
  }

  if (screenName === "result") {
    elements.resultScreen.classList.remove("hidden");
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
