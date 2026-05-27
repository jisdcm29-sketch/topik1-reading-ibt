"use strict";

console.log("TOPIK I Reading loaded: v5-no-review-result");

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

const AUTO_DIAGNOSIS_STORAGE_KEY = "topik1_latest_reading_result";
const WRONG_REVIEW_QUESTION_NUMBERS_STORAGE_KEY = "topik1_wrong_review_question_numbers";
const WRONG_REVIEW_SOURCE_RESULT_STORAGE_KEY = "topik1_wrong_review_source_result";
const AUTO_DIAGNOSIS_URL = "../reading-diagnosis/index.html?auto=1";

let currentRunMode = "normal";

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
  label: "랜덤 출제"
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
  console.info("TOPIK I Reading loaded: v5-no-review-result");
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
function createExamModeSelector() {
  if (!elements || !elements.newExamButton) {
    return;
  }

  if (document.getElementById("examModeSelect")) {
    return;
  }

  const wrapper = document.createElement("div");
  wrapper.id = "examModeSelectWrapper";
  wrapper.style.margin = "14px 0";
  wrapper.style.padding = "12px";
  wrapper.style.border = "1px solid #cfe2ff";
  wrapper.style.borderRadius = "12px";
  wrapper.style.background = "#f8fbff";

  const label = document.createElement("label");
  label.setAttribute("for", "examModeSelect");
  label.textContent = "시험지 선택";
  label.style.display = "block";
  label.style.fontWeight = "700";
  label.style.marginBottom = "8px";
  label.style.color = "#003f8f";

  const select = document.createElement("select");
  select.id = "examModeSelect";
  select.style.width = "100%";
  select.style.height = "44px";
  select.style.border = "1px solid #b8c7d9";
  select.style.borderRadius = "10px";
  select.style.padding = "0 12px";
  select.style.fontSize = "16px";

  select.innerHTML = [
    '<option value="random">랜덤 출제: 102회 + 103회 + 100회 혼합</option>',
    '<option value="round-102">102회 고정 출제</option>',
    '<option value="round-103">103회 고정 출제</option>',
    '<option value="round-100">100회 고정 출제</option>'
  ].join("");

  const help = document.createElement("div");
  help.textContent = "검수할 때는 회차 고정, 실제 시험에는 랜덤 출제를 사용하세요. 시험 시작 시 현재 선택한 시험지가 자동 적용됩니다.";
  help.style.marginTop = "6px";
  help.style.fontSize = "13px";
  help.style.color = "#5f6b7a";

  wrapper.appendChild(label);
  wrapper.appendChild(select);
  wrapper.appendChild(help);

  elements.newExamButton.parentNode.insertBefore(wrapper, elements.newExamButton);
}

function getSelectedExamGenerationOptions() {
  const select = document.getElementById("examModeSelect");
  const selectedValue = select ? select.value : "random";

  if (selectedValue === "round-102") {
    return {
      mode: "round",
      round: "102",
      label: "102회 고정 출제"
    };
  }

  if (selectedValue === "round-103") {
    return {
      mode: "round",
      round: "103",
      label: "103회 고정 출제"
    };
  }

  if (selectedValue === "round-100") {
    return {
      mode: "round",
      round: "100",
      label: "100회 고정 출제"
    };
  }

  return {
    mode: "random",
    round: "",
    label: "랜덤 출제"
  };
}
function validateGeneratedQuestionSetForExam(groupedData) {
  if (groupedData.length !== TEST_CONFIG.expectedTotalQuestions) {
    throw new Error(
      `생성 문항 수가 ${TEST_CONFIG.expectedTotalQuestions}문항이 아닙니다.`
    );
  }

  const numbers = groupedData.map(function (question) {
    return Number(question.question_number);
  });

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
  validateGeneratedQuestionSetForExam(groupedData);

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

async function generateSelectedExamForCurrentSelection() {
  if (
    !window.TOPIKQuestionGenerator ||
    typeof window.TOPIKQuestionGenerator.tryGeneratePreview !== "function"
  ) {
    throw new Error(
      "question-generator.js를 불러오지 못했습니다. index.html의 script 연결을 확인하세요."
    );
  }

  const examGenerationOptions = getSelectedExamGenerationOptions();

  console.info("TOPIK I Reading 선택 시험지:", examGenerationOptions);

  const generatedData = await window.TOPIKQuestionGenerator.tryGeneratePreview(
    examGenerationOptions
  );

  const generatedExamId = applyGeneratedExamData(
    generatedData,
    examGenerationOptions
  );

  return {
    examGenerationOptions,
    generatedExamId,
    totalQuestions: questions.length
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
      `새 문제 세트가 준비되었습니다. (${generatedExamInfo.examGenerationOptions.label} / ${generatedExamInfo.generatedExamId})`,
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
      sentence_items: Array.isArray(question.sentence_items) ? question.sentence_items : undefined,
      correct_order: Array.isArray(question.correct_order) ? question.correct_order : undefined,
      insert_sentence:
        question.insert_sentence ||
        question.sentence_to_insert ||
        question.target_sentence ||
        "",
      insert_positions: Array.isArray(question.insert_positions) ? question.insert_positions : undefined,
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

  if (["inline_blank", "inline_blank_choice", "blank", "blank_select"].includes(value)) {
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

  const latestResult = parseJsonSafely(
    localStorage.getItem(AUTO_DIAGNOSIS_STORAGE_KEY),
    null
  );

  if (latestResult && Array.isArray(latestResult.items)) {
    return latestResult;
  }

  return null;
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
      AUTO_DIAGNOSIS_URL + "&v=return-normal-" + Date.now();
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
    AUTO_DIAGNOSIS_URL + "&v=return-wrong-review-" + Date.now();
}
function startWrongReviewMode() {
  const sourceResult = getWrongReviewSourceResult();

  if (!sourceResult) {
    if (elements.startMessage) {
      elements.startMessage.textContent =
        "오답풀이 원본 결과가 없습니다. 먼저 일반 40문항 시험을 제출하고 진단 보고서에서 오답 다시 풀기를 눌러 주세요.";
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
    label: "오답 다시 풀기"
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
  remainingSeconds = TEST_CONFIG.timeLimitSeconds;
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
  highlightInsertedAnswersInCurrentStage(question);

  window.setTimeout(function () {
    highlightNegativeQuestionWordsInRenderedDom();
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
  if (
    !question.passage_group_id ||
    !Array.isArray(question.passage_group_numbers) ||
    question.passage_group_numbers.length < 2
  ) {
    return "";
  }

  const sortedNumbers = question.passage_group_numbers
    .map(Number)
    .filter(Number.isFinite)
    .sort(function (a, b) { return a - b; });

  const buttonsHtml = sortedNumbers.map(function (number) {
    const isCurrent = Number(question.question_number) === number;
    return `
      <button
        type="button"
        class="group-question-button${isCurrent ? " current" : ""}"
        data-group-question-number="${number}"
        style="
          min-width:50px;
          height:32px;
          border-radius:8px;
          border:2px solid ${isCurrent ? "#0877f2" : "#b9d8ff"};
          background:${isCurrent ? "#0877f2" : "#ffffff"};
          color:${isCurrent ? "#ffffff" : "#0877f2"};
          font-weight:900;
          cursor:pointer;
          margin-right:6px;
        "
      >${number}번</button>
    `;
  }).join("");

  return `
    <div style="
      display:flex;
      align-items:center;
      gap:10px;
      flex-wrap:wrap;
      border:1px solid #d8e8ff;
      background:#f7fbff;
      border-radius:10px;
      padding:8px 10px;
      margin-bottom:12px;
      color:#003f8f;
      font-weight:900;
      line-height:1.45;
    ">
      <span style="font-size:14px;">문항 이동</span>
      <span>${buttonsHtml}</span>
    </div>
  `;
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
  const questionNumber = Number(question && question.question_number);

  if (!Number.isFinite(questionNumber)) {
    return "";
  }

  return `
    <div
      class="panel-question-number"
      style="
        color:#003f8f;
        font-weight:900;
        margin-bottom:10px;
      "
    >
      ${questionNumber}번 문제
    </div>
  `;
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
  if (question.type === "blank_choice") {
    renderInlineBlankChoiceQuestion(question);
    return;
  }

  if (isCommonPassageBlankChoice(question)) {
    renderCommonPassageBlankChoiceQuestion(question);
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

function buildBlankPassageHtml(passage, selectedText) {
  let html = escapeHtml(passage || "");

  const insertedHtml = selectedText
    ? getInsertedAnswerHtml(selectedText)
    : "";

  const genericBlankHtml = selectedText
    ? insertedHtml
    : `<span style="
        display:inline-block;
        min-width:96px;
        height:32px;
        margin:0 4px;
        border:2px solid #0877f2;
        border-radius:8px;
        background:#ffffff;
        color:#003f8f;
        text-align:center;
        font-weight:900;
      ">(　　　)</span>`;

  const circledBlankPatterns = [
    { regex: /\(\s*㉠\s*\)/, label: "㉠" },
    { regex: /\(\s*㉡\s*\)/, label: "㉡" },
    { regex: /\(\s*㉢\s*\)/, label: "㉢" },
    { regex: /\(\s*㉣\s*\)/, label: "㉣" },
    { regex: /㉠/, label: "㉠" },
    { regex: /㉡/, label: "㉡" },
    { regex: /㉢/, label: "㉢" },
    { regex: /㉣/, label: "㉣" }
  ];

  for (const item of circledBlankPatterns) {
    if (item.regex.test(html)) {
      const markerHtml = selectedText
        ? insertedHtml
        : `<span style="
            display:inline-block;
            min-width:48px;
            height:30px;
            margin:0 4px;
            border:2px solid #0877f2;
            border-radius:8px;
            background:#ffffff;
            color:#003f8f;
            text-align:center;
            font-weight:900;
          ">(${item.label})</span>`;

      return html.replace(item.regex, markerHtml).replace(/\n/g, "<br>");
    }
  }

  const genericBlankPatterns = [
    "(     )",
    "(    )",
    "(   )",
    "(  )",
    "( )",
    "()",
    "_____",
    "____",
    "[빈칸]",
    "[blank]"
  ];

  for (const pattern of genericBlankPatterns) {
    if (html.includes(pattern)) {
      return html.replace(pattern, genericBlankHtml).replace(/\n/g, "<br>");
    }
  }

  return html.replace(/\n/g, "<br>");
}

/* 문장 삽입 위치형: ㄱ/ㄴ/ㄷ/ㄹ을 누르면 보기 문장이 해당 위치에 삽입 */
function renderSentenceInsertQuestion(question) {
  const insertSentence = getInsertSentence(question);
  const positionLabels = getInsertPositionLabels(question);
  const selectedOptionNumber = Number(answers[question.id]) || null;
  const selectedLabel = selectedOptionNumber ? positionLabels[selectedOptionNumber - 1] : "";

  const passageHtml = buildSentenceInsertPassageHtml(
    question.passage,
    positionLabels,
    selectedLabel,
    insertSentence
  );

  const positionButtonsHtml = positionLabels.map(function (label, index) {
    const optionNumber = index + 1;
    const selectedClass = selectedOptionNumber === optionNumber ? " selected" : "";

    return `
      <button type="button" class="option-button${selectedClass}" data-position-number="${optionNumber}">
        ${optionNumber}. ${escapeHtml(label)}
      </button>
    `;
  }).join("");

  const groupHeaderHtml = buildPassageGroupHeader(question);
  const questionNumberLabelHtml = buildQuestionNumberLabelForPanel(question);

  elements.questionStage.innerHTML = `
    <div class="view-tab">보기</div>
    <div style="background:#ffffff; padding:18px; min-height:420px;">
      ${groupHeaderHtml}

      <div class="reading-layout" style="
        padding:0;
        grid-template-columns:minmax(0, 1.16fr) minmax(330px, 0.84fr);
        align-items:stretch;
      ">
        <article class="passage-panel">
          <div class="panel-label">공통 지문</div>
          <div class="passage-content" style="
            font-size:18px;
            line-height:2.05;
            max-height:none;
            min-height:360px;
          ">
            ${passageHtml}
          </div>
        </article>

        <article class="question-panel">
          <div class="panel-label">문제</div>
          <div class="question-content">
            ${questionNumberLabelHtml}

            <div style="
              border:1px solid #b9d8ff;
              border-radius:12px;
              background:#e9f3ff;
              padding:13px 14px;
              margin-bottom:16px;
            ">
              <div style="
                color:#111827;
                font-size:17px;
                line-height:1.65;
                font-weight:900;
              ">
                ${escapeHtml(insertSentence)}
              </div>
            </div>

             <p class="question-text" style="margin-bottom:14px;">
              ${escapeHtml(getQuestionTextForPanel(question, "다음 문장이 들어갈 위치로 알맞은 곳을 고르십시오."))}
            </p>

            <div style="color:#003f8f; font-weight:900; margin-bottom:10px;">
              들어갈 위치 선택
            </div>
            <div class="options-area">
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

  bindPassageGroupButtons();
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

function buildSentenceInsertPassageHtml(passage, positionLabels, selectedLabel, insertSentence) {
  let html = escapeHtml(passage || "");
  const insertedSentenceHtml = getInsertedAnswerHtml(insertSentence);

  let foundAnyMarker = false;

  positionLabels.forEach(function (label, index) {
    const optionNumber = index + 1;
    const markerVariants = getMarkerVariants(label);
    let replaced = false;

    for (const marker of markerVariants) {
      if (html.includes(marker)) {
        foundAnyMarker = true;
        const replacement = label === selectedLabel
          ? insertedSentenceHtml
          : `<button type="button" data-inline-position-number="${optionNumber}" style="
              display:inline-flex;
              align-items:center;
              justify-content:center;
              min-width:32px;
              height:28px;
              margin:0 4px;
              border:2px solid #0877f2;
              border-radius:7px;
              background:#ffffff;
              color:#0877f2;
              font-weight:900;
              cursor:pointer;
              vertical-align:middle;
            ">${escapeHtml(label)}</button>`;

        html = html.replace(marker, replacement);
        replaced = true;
        break;
      }
    }

    if (!replaced && selectedLabel === label) {
      html += `<br>${insertedSentenceHtml}`;
    }
  });

  html = html.replace(/\n/g, "<br>");

  if (!foundAnyMarker) {
    const positionsHtml = positionLabels.map(function (label, index) {
      const optionNumber = index + 1;
      return `<button type="button" data-inline-position-number="${optionNumber}" style="
        min-width:48px;
        height:34px;
        margin:4px;
        border:2px solid #0877f2;
        border-radius:7px;
        background:#fff;
        color:#0877f2;
        font-weight:900;
        cursor:pointer;
      ">${escapeHtml(label)}</button>`;
    }).join("");

    return `
      ${html}
      <div style="margin-top:16px; padding-top:12px; border-top:1px dashed #b9c5d6;">
        ${positionsHtml}
      </div>
      ${selectedLabel ? `<div style="margin-top:12px;">선택 위치: ${insertedSentenceHtml}</div>` : ""}
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

    if (selectedLabel) {
      return buildSentenceInsertPassageForDisplayHtml(
        sharedPassage || getSharedPassage(linkedInsertQuestion),
        positionLabels,
        selectedLabel,
        getInsertSentence(linkedInsertQuestion)
      );
    }
  }

  const linkedBlankQuestion = findLinkedCommonPassageBlankChoiceQuestion(question);
  if (linkedBlankQuestion) {
    const selectedOptionNumber = Number(answers[linkedBlankQuestion.id]) || null;
    const selectedText = selectedOptionNumber ? linkedBlankQuestion.options[selectedOptionNumber - 1] : "";

    if (selectedText) {
      const linkedBlankHtml = buildBlankPassageHtml(
        sharedPassage || getSharedPassage(linkedBlankQuestion),
        selectedText
      );

      return ensureInsertedAnswerHighlightedHtml(linkedBlankHtml, selectedText);
    }
  }

  return escapeHtml(sharedPassage).replace(/\n/g, "<br>");
}

function findLinkedCommonPassageBlankChoiceQuestion(question) {
  if (!question || !question.passage_group_id) {
    return null;
  }

  if (isCommonPassageBlankChoice(question)) {
    return question;
  }

  return questions.find(function (item) {
    return (
      item &&
      item.id !== question.id &&
      item.passage_group_id === question.passage_group_id &&
      isCommonPassageBlankChoice(item)
    );
  }) || null;
}

function findLinkedSentenceInsertQuestion(question) {
  if (!question || !question.passage_group_id) {
    return null;
  }

  return questions.find(function (item) {
    return (
      item &&
      item.id !== question.id &&
      item.passage_group_id === question.passage_group_id &&
      item.type === "sentence_insert"
    );
  }) || null;
}

function buildSentenceInsertPassageForDisplayHtml(passage, positionLabels, selectedLabel, insertSentence) {
  let html = escapeHtml(passage || "");

  const insertedSentenceHtml = getInsertedAnswerHtml(insertSentence);

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
              margin:0 4px;
              border:1px solid #9aa7b5;
              border-radius:6px;
              background:#ffffff;
              color:#4b5563;
              font-size:14px;
              font-weight:900;
              vertical-align:middle;
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
  const correctOrder = getCorrectOrder(question, sentenceItems);
  const candidateLabels = [];

  function addLabel(label) {
    const value = String(label || "").trim();

    if (!value) {
      return;
    }

    const existsInItems = sentenceItems.some(function (item) {
      return item.label === value;
    });

    if (existsInItems && !candidateLabels.includes(value)) {
      candidateLabels.push(value);
    }
  }

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

  return candidateLabels.slice(0, 2).map(function (label) {
    return sentenceItems.find(function (item) {
      return item.label === label;
    });
  }).filter(Boolean);
}

function getSentenceOrderVisibleItems(question, sentenceItems, order) {
  const usedLabels = order.filter(Boolean);

  if (!order[0]) {
    return getSentenceOrderStartCandidateItems(question, sentenceItems)
      .filter(function (item) {
        return !usedLabels.includes(item.label);
      });
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

  const rightPanelTitle = hasFirstSentence
    ? "남은 문장 목록"
    : "시작 문장 후보";

  const stepGuideText = hasFirstSentence
    ? "남은 문장을 순서대로 왼쪽 빈칸에 놓으세요. 문장을 더블클릭하면 다음 빈칸에 자동으로 들어갑니다."
    : "먼저 시작 문장 후보 두 개 중 하나를 선택하세요. 문장을 더블클릭하면 1번째 칸에 자동으로 들어갑니다.";

  elements.questionStage.innerHTML = `
    <div class="view-tab">보기</div>

    <div style="background:#ffffff; padding:18px 16px 22px; min-height:360px;">
      <p style="margin:0 0 14px; font-size:15px; line-height:1.55;">
        ${escapeHtml(stepGuideText)}
      </p>

      <div style="
        display:grid;
        grid-template-columns:minmax(0, 1.08fr) minmax(300px, 0.92fr);
        gap:12px;
      ">
        <section style="
          border:1px solid #e3e6ea;
          border-radius:14px;
          background:#ffffff;
          padding:12px;
          overflow:visible;
        ">
          <div style="color:#003f8f; font-weight:900; margin-bottom:10px;">순서 배열</div>
          <div id="orderDropArea" style="display:grid; gap:8px;">
            ${order.map(function (label, index) {
              const item = sentenceItems.find((sentenceItem) => sentenceItem.label === label);
              const emptyText =
                !order[0] && index === 0
                  ? "먼저 시작 문장을 여기에 놓으세요"
                  : !order[0]
                    ? "시작 문장을 먼저 선택하세요"
                    : `${index + 1}번째 문장을 여기에 놓으세요`;

              const content = item
                ? `<div style="
                    padding:10px 12px;
                    border:2px solid #0877f2;
                    border-radius:8px;
                    background:#e9f3ff;
                    font-weight:800;
                    overflow:visible;
                    ${getSentenceOrderPlacedTextStyle(item.text)}
                  ">
                    ${escapeHtml(item.label)} ${escapeHtml(item.text)}
                  </div>`
                : `<div style="
                    padding:10px 12px;
                    border:2px dashed #b5c6dd;
                    border-radius:8px;
                    background:#ffffff;
                    color:#667085;
                    font-weight:800;
                    font-size:15px;
                    letter-spacing:0;
                    line-height:1.45;
                    white-space:nowrap;
                    word-break:keep-all;
                    cursor:pointer;
                  ">
                    ${escapeHtml(emptyText)}
                  </div>`;

              return `
                <div
                  class="sentence-order-slot"
                  data-slot-index="${index}"
                  style="min-height:48px;"
                >
                  ${content}
                </div>
              `;
            }).join("")}
          </div>
        </section>

        <section style="
          border:1px solid #e3e6ea;
          border-radius:14px;
          background:#ffffff;
          padding:12px;
          overflow:visible;
        ">
          <div style="color:#003f8f; font-weight:900; margin-bottom:10px;">
            ${escapeHtml(rightPanelTitle)}
          </div>

          <div style="
            margin-bottom:10px;
            padding:10px 12px;
            border:1px solid ${hasFirstSentence ? "#e3e6ea" : "#b9d8ff"};
            border-radius:10px;
            background:${hasFirstSentence ? "#f8fafc" : "#e9f3ff"};
            color:#003f8f;
            font-size:14px;
            font-weight:900;
            line-height:1.5;
          ">
            ${hasFirstSentence
              ? "첫 문장이 선택되었습니다. 이제 남은 문장을 순서대로 배치하세요."
              : "원래 보기의 첫 문장 후보 중 하나를 먼저 선택하세요."}
          </div>

          <div
            id="sentenceItemList"
            style="
              display:grid;
              gap:8px;
              ${hasFirstSentence ? "" : "grid-template-columns:repeat(2, minmax(0, 1fr));"}
            "
          >
            ${
              visibleItems.length
                ? visibleItems.map(function (item) {
                    const selectedStyle =
                      selectedSentenceForOrder &&
                      selectedSentenceForOrder.questionId === question.id &&
                      selectedSentenceForOrder.label === item.label
                        ? "background:#e9f3ff;border-color:#0877f2;"
                        : "";

                    const candidateTitle = hasFirstSentence
                      ? ""
                      : `<div style="
                          color:#003f8f;
                          font-weight:900;
                          margin-bottom:6px;
                        ">${escapeHtml(item.label)}로 시작</div>`;

                    return `
                      <div
                        class="sentence-order-item"
                        draggable="true"
                        data-label="${escapeAttribute(item.label)}"
                        title="더블클릭하면 왼쪽 빈칸에 자동 배치됩니다."
                        style="
                          padding:10px 12px;
                          border:1px solid #bfc8d5;
                          border-radius:9px;
                          background:#ffffff;
                          cursor:grab;
                          font-weight:800;
                          overflow:visible;
                          min-height:${hasFirstSentence ? "auto" : "92px"};
                          ${getSentenceOrderCardTextStyle(item.text)}
                          ${selectedStyle}
                        "
                      >
                        ${candidateTitle}
                        ${escapeHtml(item.label)} ${escapeHtml(item.text)}
                      </div>
                    `;
                  }).join("")
                : `<div style="
                    padding:14px;
                    border:1px solid #e3e6ea;
                    border-radius:9px;
                    background:#f8fafc;
                    color:#555;
                    text-align:center;
                    font-weight:800;
                  ">모든 문장을 왼쪽에 배치했습니다.</div>`
            }
          </div>

          <button
            type="button"
            id="resetSentenceOrderButton"
            style="
              width:100%;
              margin-top:12px;
              padding:10px 12px;
              border:1px solid #d93025;
              border-radius:8px;
              background:#ffffff;
              color:#d93025;
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

function getCorrectOrder(question, sentenceItems) {
  if (Array.isArray(question.correct_order) && question.correct_order.length > 0) {
    return question.correct_order;
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
      selectedSentenceForOrder = {
        questionId: question.id,
        label: itemElement.dataset.label
      };

      markSelectedSentenceItem(itemElement);
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
function placeSentenceInSlot(question, sentenceItems, slotIndex, label) {
  if (!label) return;

  const order = getSentenceOrderState(question, sentenceItems);

  for (let index = 0; index < order.length; index += 1) {
    if (order[index] === label) {
      order[index] = null;
    }
  }

  order[slotIndex] = label;
  selectedSentenceForOrder = null;

  if (order.every(Boolean)) {
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

  const blankPatterns = [
    "(     )",
    "(    )",
    "(   )",
    "(  )",
    "( )",

    "( ㉠ )",
    "(㉠)",
    "㉠",

    "( ㉡ )",
    "(㉡)",
    "㉡",

    "( ㉢ )",
    "(㉢)",
    "㉢",

    "( ㉣ )",
    "(㉣)",
    "㉣",

    "_____",
    "____",
    "[빈칸]",
    "[blank]"
  ];

  return blankPatterns.some(function (pattern) {
    return value.includes(pattern);
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
      <div class="image-area">
        <img
          src="${escapeAttribute(sharedImageUrl)}"
          alt="${question.passage_group_title || question.question_number + "번"} 공통 이미지 자료"
          style="max-width:100%; border:1px solid #e3e6ea; border-radius:10px; display:block; margin:0 auto 12px;"
        />
      </div>
    `
    : "";

  const optionsHtml = question.options.map(function (optionText, index) {
    const optionNumber = index + 1;
    const selectedClass = selectedOptionNumber === optionNumber ? " selected" : "";

    return `
      <button type="button" class="option-button${selectedClass}" data-option="${optionNumber}">
        ${optionNumber}. ${escapeHtml(optionText)}
      </button>
    `;
  }).join("");

  elements.questionStage.innerHTML = `
    <div class="view-tab">보기</div>
    <div style="background:#ffffff; padding:18px; min-height:420px;">
      ${groupHeaderHtml}

      <div class="reading-layout" style="padding:0;">
        <article class="passage-panel">
          <div class="panel-label">공통 지문</div>
          ${imageHtml}
          <div class="passage-content">${passageHtml}</div>
        </article>

        <article class="question-panel">
          <div class="panel-label">문제</div>
          <div class="question-content">
            ${questionNumberLabelHtml}
            <p class="question-text">${escapeHtml(getQuestionTextForPanel(question, "(   )에 들어갈 말로 가장 알맞은 것을 고르십시오."))}</p>
            <div class="options-area">${optionsHtml}</div>
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
      <div class="image-area" style="padding:20px 22px 10px;">
        <img
          src="${escapeAttribute(sharedImageUrl)}"
          alt="${question.passage_group_title || question.question_number + "번"} 공통 이미지 자료"
          style="
            width:100%;
            max-width:100%;
            max-height:620px;
            height:auto;
            object-fit:contain;
            border:1px solid #e3e6ea;
            border-radius:10px;
            display:block;
            margin:0 auto 12px;
          "
        />
      </div>
    `
    : "";

  const passageContentHtml = sharedImageUrl
    ? ""
    : `<div class="passage-content">${sharedPassageHtml}</div>`;

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
    <div class="view-tab">보기</div>
    <div style="background:#ffffff; padding:18px; min-height:420px;">
      ${groupHeaderHtml}

      <div class="reading-layout" style="padding:0;">
        <article class="passage-panel">
          <div class="panel-label">공통 지문</div>
          ${imageHtml}
          ${passageContentHtml}
        </article>

        <article class="question-panel">
          <div class="panel-label">문제</div>
          <div class="question-content">
            ${questionNumberLabelHtml}
            <p class="question-text">${escapeHtml(getQuestionTextForPanel(question, "물음에 답하십시오."))}</p>
            <div class="options-area">${optionsHtml}</div>
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
  const questionNumberLabelHtml = buildQuestionNumberLabelForPanel(question);

  const imageHtml = question.image_url
    ? `
      <div style="
        display:flex;
        align-items:center;
        justify-content:center;
        padding:16px;
        min-height:380px;
      ">
        <img
          src="${escapeAttribute(question.image_url)}"
          alt="${question.question_number}번 이미지 자료"
          style="
            max-width:100%;
            max-height:440px;
            object-fit:contain;
            border:1px solid #e3e6ea;
            border-radius:10px;
            display:block;
          "
        />
      </div>
    `
    : `
      <div style="
        padding:18px;
        color:#6b7280;
        font-weight:800;
      ">이미지 자료가 없습니다.</div>
    `;

  const optionsHtml = question.options.map(function (optionText, index) {
    const optionNumber = index + 1;
    const selectedClass = answers[question.id] === optionNumber ? " selected" : "";

    return `
      <button type="button" class="option-button${selectedClass}" data-option="${optionNumber}">
        ${optionNumber}. ${escapeHtml(optionText)}
      </button>
    `;
  }).join("");

  const questionTextHtml = buildNegativeQuestionTextHtml(
    getQuestionTextForPanel(question, "다음을 읽고 맞지 않는 것을 고르십시오.")
  );

  elements.questionStage.innerHTML = `
    <div class="view-tab">보기</div>

    <div style="
      background:#ffffff;
      padding:20px;
      min-height:420px;
    ">
      <div style="
        display:grid;
        grid-template-columns:minmax(0, 1.05fr) minmax(390px, 0.95fr);
        gap:20px;
        align-items:stretch;
      ">
        <article style="
          border:1px solid #e3e6ea;
          border-radius:14px;
          background:#ffffff;
          overflow:hidden;
          min-height:420px;
        ">
          <div style="
            padding:13px 16px;
            border-bottom:1px solid #e3e6ea;
            font-weight:900;
            color:#003f8f;
            background:#fafcff;
            font-size:17px;
          ">그림 / 자료</div>

          ${imageHtml}
        </article>

        <article style="
          border:1px solid #e3e6ea;
          border-radius:14px;
          background:#fbfcfe;
          overflow:hidden;
          min-height:420px;
        ">
          <div style="
            padding:13px 16px;
            border-bottom:1px solid #e3e6ea;
            font-weight:900;
            color:#003f8f;
            background:#fafcff;
            font-size:17px;
          ">문제</div>

          <div style="padding:24px;">
            ${questionNumberLabelHtml}
            <p class="question-text">${questionTextHtml}</p>
            <div class="options-area">${optionsHtml}</div>
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

function renderOneColumnChoiceQuestion(question) {
  const groupHeaderHtml = buildPassageGroupHeader(question);
  const questionNumberLabelHtml = buildQuestionNumberLabelForPanel(question);
  const imageHtml = question.image_url
    ? `
      <div class="image-area">
        <img
          src="${escapeAttribute(question.image_url)}"
          alt="${question.question_number}번 이미지 자료"
          style="max-width:100%; border:1px solid #e3e6ea; border-radius:10px; display:block; margin:0 auto 12px;"
        />
      </div>
    `
    : "";

  const passageHtml = question.passage
    ? `
      <div style="
        border:1px solid #e3e6ea;
        border-radius:14px;
        background:#ffffff;
        padding:18px;
        margin-bottom:16px;
        font-size:18px;
        line-height:1.85;
        white-space:pre-line;
      ">${escapeHtml(question.passage)}</div>
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
    <div class="view-tab">보기</div>
    <div style="background:#ffffff; padding:20px 18px 24px; min-height:360px;">
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
        <p class="question-text">${buildNegativeQuestionTextHtml(getQuestionTextForPanel(question, "알맞은 것을 고르십시오."))}</p>
        <div class="options-area">${optionsHtml}</div>
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
        <div class="passage-content">${escapeHtml(getSharedPassage(question))}</div>
      </article>

      <article class="question-panel">
        <div class="panel-label">문제</div>
        <div class="question-content">
          ${questionNumberLabelHtml}
          <p class="question-text">${escapeHtml(getQuestionTextForPanel(question, "물음에 답하십시오."))}</p>
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
  const isReviewed = Boolean(reviewMarks[question.id]);

  elements.reviewButton.textContent = isReviewed ? "검토 해제" : "검토 표시";

  elements.reviewTextInline.innerHTML = isReviewed
    ? `<span class="review-badge">검토 표시됨</span>`
    : "";
}

function openQuestionList() {
  renderProgress();
  renderAnswerStatus();
  elements.questionListBackdrop.classList.remove("hidden");
}

function closeQuestionList() {
  elements.questionListBackdrop.classList.add("hidden");
}

function renderProgress() {
  elements.progressArea.innerHTML = "";

  questions.forEach(function (question, index) {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = "progress-dot";
    dot.textContent = String(question.question_number);

    if (index === currentIndex) {
      dot.classList.add("current");
    }

    if (isQuestionAnswered(question)) {
      dot.classList.add("answered");
    }

    if (reviewMarks[question.id]) {
      dot.classList.add("review");
    }

    dot.title = `${question.question_number}번 문항으로 이동`;

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
    test_scope: "TOPIK I PBT Reading 31-70",
    generated_exam_mode: latestExamGenerationOptions.mode || "random",
    generated_exam_round: latestExamGenerationOptions.round || "",
    generated_exam_label: latestExamGenerationOptions.label || "랜덤 출제",
    question_number_start: TEST_CONFIG.questionNumberStart,
    question_number_end: TEST_CONFIG.questionNumberEnd,
    expected_total_questions: TEST_CONFIG.expectedTotalQuestions,
    is_full_40_question_set: totalQuestions === TEST_CONFIG.expectedTotalQuestions,
    student_name: studentName,
    student_phone: studentPhone,
    started_at: startedAt,
    submitted_at: submittedAt,
    submit_reason: submitReason,
    time_limit_minutes: TEST_CONFIG.timeLimitMinutes,
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

function renderResult(result) {
  if (!elements.resultSummary) return;

  const submittedAtText = formatDateTimeForDisplay(result.submitted_at);

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
  `;

  if (elements.resultTable) {
    elements.resultTable.innerHTML = "";
  }

  if (elements.categoryAnalysis) {
    elements.categoryAnalysis.innerHTML = "";
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
      !isWrongReviewResult(result)
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
    return;
  }

  openDiagnosisButton.style.display = "inline-flex";
  openDiagnosisButton.removeAttribute("aria-hidden");
  openDiagnosisButton.removeAttribute("onclick");

  openDiagnosisButton.onclick = function () {
  window.location.href = AUTO_DIAGNOSIS_URL + "&v=diagnosis-" + Date.now();
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
