"use strict";

console.log("TOPIK I Reading Diagnosis loaded: step42-topik1-reading-zone-label-fix-v1");

const AUTO_DIAGNOSIS_STORAGE_KEY = "topik1_latest_reading_result";
const LEVEL_TEST_DIAGNOSIS_STORAGE_KEY = "topik1_latest_leveltest_result";
const WRONG_REVIEW_STORAGE_KEY = "topik1_wrong_review_question_numbers";
const WRONG_REVIEW_SOURCE_RESULT_STORAGE_KEY = "topik1_wrong_review_source_result";
const WRONG_REVIEW_TEST_URL = "../reading-test/index.html?mode=wrong-review";

const state = {
  sourceResult: null,
  report: null
};

const els = {
  fileInput: document.getElementById("resultFile"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  status: document.getElementById("status"),
  manualLoadBox: document.getElementById("manualLoadBox"),
  reportActions: document.getElementById("reportActions"),
  reportArea: document.getElementById("reportArea"),
  reportPaper: document.getElementById("reportPaper"),
  printBtn: document.getElementById("printBtn")
};

document.addEventListener("DOMContentLoaded", initDiagnosis);

function initDiagnosis() {
  bindEvents();
  tryAutoLoad();
}

function bindEvents() {
  if (els.analyzeBtn) {
    els.analyzeBtn.addEventListener("click", analyzeUploadedFile);
  }

  if (els.printBtn) {
    els.printBtn.addEventListener("click", function () {
      window.print();
    });
  }
}

function tryAutoLoad() {
  const params = new URLSearchParams(window.location.search);
  const shouldAutoLoad = params.get("auto") === "1";
  const requestedMode = String(params.get("mode") || params.get("source") || "").toLowerCase();
  const isLevelTestMode = requestedMode === "leveltest" || requestedMode === "level-test";

  if (!shouldAutoLoad) {
    setStatus("자동 연결 없이 열렸습니다. 결과 JSON 파일을 직접 선택하세요.", "");
    showManualLoadBox();
    return;
  }

  const storageKey = isLevelTestMode
    ? LEVEL_TEST_DIAGNOSIS_STORAGE_KEY
    : AUTO_DIAGNOSIS_STORAGE_KEY;

  const resultLabel = isLevelTestMode
    ? "레벨테스트 결과"
    : "40문항 읽기 결과";

  try {
    const raw = localStorage.getItem(storageKey);

    if (!raw) {
      setStatus(`${resultLabel} 자동 연결 결과가 없습니다. 결과 JSON 파일을 직접 선택하세요.`, "error");
      showManualLoadBox();
      return;
    }

    const data = JSON.parse(raw);
    validateReadingResult(data);

    if (isLevelTestMode && !isLevelTestResultData(data)) {
      throw new Error("레벨테스트 결과 파일이 아닙니다. 40문항 결과와 구분해서 다시 확인하세요.");
    }

    state.sourceResult = data;
    state.report = buildDiagnosisReport(data);

    renderReportByMode(state.report);
    setStatus(`${resultLabel}를 자동으로 불러와 진단 보고서를 생성했습니다.`, "ok");
  } catch (error) {
    console.error(error);
    setStatus(`자동 분석 실패: ${error.message}`, "error");
    showManualLoadBox();
  }
}
function analyzeUploadedFile() {
  const file = els.fileInput.files && els.fileInput.files[0];

  if (!file) {
    setStatus("분석할 JSON 파일을 선택하세요.", "error");
    return;
  }

  const reader = new FileReader();

  reader.onload = function () {
    try {
      const data = JSON.parse(String(reader.result || ""));
      validateReadingResult(data);

      state.sourceResult = data;
      state.report = buildDiagnosisReport(data);

      renderReportByMode(state.report);
      setStatus("파일을 분석하여 진단 보고서를 생성했습니다.", "ok");
    } catch (error) {
      console.error(error);
      setStatus(`파일 분석 실패: ${error.message}`, "error");
    }
  };

  reader.onerror = function () {
    setStatus("파일을 읽는 중 오류가 발생했습니다.", "error");
  };

  reader.readAsText(file, "utf-8");
}

function showManualLoadBox() {
  if (els.manualLoadBox) {
    els.manualLoadBox.classList.add("show");
  }
}

function validateReadingResult(data) {
  if (!data || typeof data !== "object") {
    throw new Error("JSON 형식이 올바르지 않습니다.");
  }

  if (!Array.isArray(data.items)) {
    throw new Error("items 배열이 없습니다. topik1-reading-result.json 파일인지 확인하세요.");
  }

  if (data.section && data.section !== "reading") {
    throw new Error("읽기 결과 파일이 아닙니다. section 값이 reading이어야 합니다.");
  }

  if (data.test_level && data.test_level !== "TOPIK I") {
    throw new Error("TOPIK I 읽기 결과 파일이 아닙니다.");
  }

  return true;
}


function isLevelTestResultData(result) {
  return Boolean(
    result &&
      (result.generated_exam_type === "leveltest" ||
        result.exam_type === "leveltest" ||
        String(result.generated_exam_label || "").includes("레벨테스트") ||
        String(result.test_scope || "").toLowerCase().includes("level test") ||
        result.leveltest_connection)
  );
}

function buildDiagnosisReport(result) {
  const items = Array.isArray(result.items) ? result.items : [];
  const score = numberOrZero(result.section_score_100 ?? result.earned_points);
  const level = getTopik1ReadingLevel(score);

  const readingTypeAnalysis = makeReadingTypeChartAnalysis(items);
  const categoryAnalysis = readingTypeAnalysis;
  const diagnosticAnalysis = groupStats(items, "diagnostic_area");
  const zoneAnalysis = makeZoneAnalysis(items);

  const problemItems = items.filter((item) => !item.is_correct);
  const unansweredItems = items.filter((item) => isUnanswered(item.student_answer));
  const wrongItems = items.filter((item) => !item.is_correct && !isUnanswered(item.student_answer));

  const strengths = makeStrengthList(categoryAnalysis, diagnosticAnalysis);
  const weaknesses = makeWeaknessList(categoryAnalysis, diagnosticAnalysis, zoneAnalysis);

  const prescriptions = makePrescriptions({
    result,
    level,
    problemItems,
    wrongItems,
    unansweredItems,
    categoryAnalysis,
    diagnosticAnalysis,
    zoneAnalysis,
    readingTypeAnalysis,
    weaknesses
  });

  return {
    source: result,
    generated_at: new Date().toISOString(),
    score,
    level,
    isLevelTest: isLevelTestResultData(result),
    items,
    categoryAnalysis,
    diagnosticAnalysis,
    zoneAnalysis,
    readingTypeAnalysis,
    problemItems,
    wrongItems,
    unansweredItems,
    strengths,
    weaknesses,
    prescriptions
  };
}

function getTopik1ReadingLevel(score) {
  const numericScore = numberOrZero(score);

  if (numericScore < 40) {
    return {
      code: "BELOW_TOPIK1_LEVEL1",
      title: "TOPIK I 읽기 1급 미도달 가능성 높음",
      range: "0~39점",
      expected_level: "TOPIK I 읽기 기초 보완 단계",
      stable_level: "1급 진입 전 준비 단계",
      next_target_score: 40,
      next_target_label: "1급 가능권 진입",
      message: "기초 어휘와 짧은 문장 이해부터 다시 안정화해야 합니다.",
      study_focus: "31~42번 주제·소재 파악, 빈칸·어휘·문법, 자료형 문항부터 우선 보완하세요."
    };
  }

  if (numericScore < 70) {
    return {
      code: "TOPIK1_LEVEL1_RANGE",
      title: "TOPIK I 읽기 1급 예상권",
      range: "40~69점",
      expected_level: "1급 예상권",
      stable_level: "1급 가능권",
      next_target_score: 70,
      next_target_label: "2급 가능권 진입",
      message: "짧은 글은 이해하지만 공통 지문, 빈칸, 세부 정보 문항에서 점수 손실이 있을 수 있습니다.",
      study_focus: "공통 지문, 문장 순서, 문장 삽입, 긴 지문 내용 일치 문항을 집중적으로 보완하세요."
    };
  }

  return {
    code: "TOPIK1_LEVEL2_RANGE",
    title: "TOPIK I 읽기 2급 예상권",
    range: "70~100점",
    expected_level: "2급 예상권",
    stable_level: "TOPIK I 읽기 안정권",
    next_target_score: Math.min(100, numericScore + 10),
    next_target_label: "고득점 안정화",
    message: "TOPIK I 읽기 영역 기준으로 2급 예상권입니다. 긴 지문과 추론 문항을 안정화하면 좋습니다.",
    study_focus: "후반부 공통 지문과 긴 지문에서 근거 문장을 빠르게 찾는 연습을 하세요."
  };
}

function getAnalysisQuestionNumber(item) {
  const original = Number(item && (item.original_question_number || item.source_question_number));
  const current = Number(item && item.question_number);

  if (Number.isFinite(original) && original >= 31 && original <= 70) {
    return original;
  }

  if (Number.isFinite(current)) {
    return current;
  }

  return 0;
}

const TOPIK1_READING_TYPE_DEFINITIONS = [
  {
    id: "T01",
    label: "주제·소재 파악",
    focus: "짧은 글의 중심 소재와 주제 파악",
    start: 31,
    end: 33
  },
  {
    id: "T02",
    label: "빈칸·어휘·문법",
    focus: "문맥에 맞는 어휘, 조사, 동사, 형용사 선택",
    start: 34,
    end: 39
  },
  {
    id: "T03",
    label: "자료·그림 정보",
    focus: "그림, 표, 안내 자료의 핵심 정보 이해",
    start: 40,
    end: 42
  },
  {
    id: "T04",
    label: "짧은 글 내용 일치",
    focus: "짧은 글의 세부 내용 일치 파악",
    start: 43,
    end: 45
  },
  {
    id: "T05",
    label: "중심 내용 파악",
    focus: "글의 중심 생각과 핵심 내용 이해",
    start: 46,
    end: 48
  },
  {
    id: "T06",
    label: "공통 지문·생활문",
    focus: "공통 지문, 안내문, 생활문에서 필요한 정보 찾기",
    start: 49,
    end: 56
  },
  {
    id: "T07",
    label: "문장 순서·문장 삽입",
    focus: "글의 흐름, 삽입 위치, 문장 간 연결 단서 파악",
    start: 57,
    end: 60
  },
  {
    id: "T08",
    label: "긴 지문·공통 지문",
    focus: "긴 글의 세부 내용, 추론, 글쓴이 의도 파악",
    start: 61,
    end: 70
  }
];

function inferTopik1ReadingTypeId(item) {
  const n = getAnalysisQuestionNumber(item);
  const byNumber = TOPIK1_READING_TYPE_DEFINITIONS.find((definition) => {
    return n >= definition.start && n <= definition.end;
  });

  if (byNumber) {
    return byNumber.id;
  }

  const text = [
    item && item.type,
    item && item.category,
    item && item.diagnostic_area
  ].join(" ");

  if (/문장 삽입|삽입/.test(text)) return "T07";
  if (/문장 순서|문장 배열|순서/.test(text)) return "T07";
  if (/자료|그림|표|이미지|초대장|메시지/.test(text)) return "T03";
  if (/생활문|공지문|안내문/.test(text)) return "T06";
  if (/긴 지문|추론/.test(text)) return "T08";
  if (/공통 지문/.test(text)) return "T06";
  if (/중심/.test(text)) return "T05";
  if (/주제|소재/.test(text)) return "T01";
  if (/내용 일치|세부 내용|짧은 글/.test(text)) return "T04";
  if (/빈칸|어휘|문법|조사|연결|표현/.test(text)) return "T02";

  return "T04";
}

function getTopik1TypeDefinition(typeId) {
  return TOPIK1_READING_TYPE_DEFINITIONS.find((definition) => definition.id === typeId) || null;
}

function getReadingTypeDisplayName(item) {
  const typeId = inferTopik1ReadingTypeId(item);
  const definition = getTopik1TypeDefinition(typeId);

  return definition ? definition.label : (item && item.category ? item.category : "미분류");
}

function makeReadingTypeChartAnalysis(items) {
  const map = new Map();

  TOPIK1_READING_TYPE_DEFINITIONS.forEach((definition) => {
    map.set(definition.id, {
      type_id: definition.id,
      name: definition.label,
      focus: definition.focus,
      range: `${definition.start}~${definition.end}번`,
      total: 0,
      correct: 0,
      wrong: 0,
      unanswered: 0,
      points_possible: 0,
      points_earned: 0,
      wrong_questions: []
    });
  });

  items.forEach((item) => {
    const typeId = inferTopik1ReadingTypeId(item);
    const stat = map.get(typeId);

    if (!stat) {
      return;
    }

    const points = numberOrZero(item.points);
    const earned = numberOrZero(item.earned_points);
    const isCorrect = Boolean(item.is_correct);

    stat.total += 1;
    stat.points_possible += points;
    stat.points_earned += earned;

    if (isCorrect) {
      stat.correct += 1;
    } else {
      stat.wrong += 1;
      stat.wrong_questions.push(item.question_number);
    }

    if (isUnanswered(item.student_answer)) {
      stat.unanswered += 1;
    }
  });

  return TOPIK1_READING_TYPE_DEFINITIONS
    .map((definition) => {
      const stat = map.get(definition.id);

      return {
        ...stat,
        accuracy: percent(stat.correct, stat.total),
        point_rate: stat.points_possible
          ? Math.round((stat.points_earned / stat.points_possible) * 100)
          : 0
      };
    })
    .filter((stat) => stat.total > 0);
}

function makeZoneAnalysis(items) {
  return TOPIK1_READING_TYPE_DEFINITIONS.map((definition) => {
    const zoneItems = items.filter((item) => {
      const n = getAnalysisQuestionNumber(item);
      return n >= definition.start && n <= definition.end;
    });

    const total = zoneItems.length;
    const correct = zoneItems.filter((item) => item.is_correct).length;
    const wrongItems = zoneItems.filter((item) => !item.is_correct);

    const pointsPossible = zoneItems.reduce((sum, item) => {
      return sum + numberOrZero(item.points);
    }, 0);

    const pointsEarned = zoneItems.reduce((sum, item) => {
      return sum + numberOrZero(item.earned_points);
    }, 0);

    return {
      zone_id: definition.id,
      label: definition.label,
      range: `${definition.start}~${definition.end}번`,
      focus: definition.focus,
      total,
      correct,
      wrong: wrongItems.length,
      unanswered: zoneItems.filter((item) => isUnanswered(item.student_answer)).length,
      points_possible: pointsPossible,
      points_earned: pointsEarned,
      wrong_questions: wrongItems
        .map((item) => item.question_number)
        .filter((number) => number !== null && number !== undefined && number !== "")
        .sort((a, b) => Number(a) - Number(b)),
      accuracy: percent(correct, total),
      point_rate: pointsPossible
        ? Math.round((pointsEarned / pointsPossible) * 100)
        : 0
    };
  }).filter((stat) => stat.total > 0);
}

function groupStats(items, key) {
  const map = new Map();

  items.forEach((item) => {
    const groupName = item[key] || "미분류";

    if (!map.has(groupName)) {
      map.set(groupName, {
        name: groupName,
        total: 0,
        correct: 0,
        wrong: 0,
        unanswered: 0,
        points_possible: 0,
        points_earned: 0,
        wrong_questions: []
      });
    }

    const stat = map.get(groupName);
    const points = numberOrZero(item.points);
    const earned = numberOrZero(item.earned_points);
    const isCorrect = Boolean(item.is_correct);

    stat.total += 1;
    stat.points_possible += points;
    stat.points_earned += earned;

    if (isCorrect) {
      stat.correct += 1;
    } else {
      stat.wrong += 1;
      stat.wrong_questions.push(item.question_number);
    }

    if (isUnanswered(item.student_answer)) {
      stat.unanswered += 1;
    }
  });

  return [...map.values()]
    .map((stat) => ({
      ...stat,
      accuracy: percent(stat.correct, stat.total),
      point_rate: stat.points_possible
        ? Math.round((stat.points_earned / stat.points_possible) * 100)
        : 0
    }))
    .sort((a, b) => b.wrong - a.wrong || a.accuracy - b.accuracy || a.name.localeCompare(b.name, "ko"));
}

function makeStrengthList(categoryAnalysis, diagnosticAnalysis) {
  const categoryStrengths = categoryAnalysis
    .filter((stat) => stat.total >= 1 && stat.accuracy >= 70)
    .slice(0, 5);

  const diagnosticStrengths = diagnosticAnalysis
    .filter((stat) => stat.total >= 1 && stat.accuracy >= 70)
    .slice(0, 5);

  return {
    categoryStrengths,
    diagnosticStrengths
  };
}

function makeWeaknessList(categoryAnalysis, diagnosticAnalysis, zoneAnalysis) {
  const categoryWeaknesses = categoryAnalysis
    .filter((stat) => stat.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || a.accuracy - b.accuracy)
    .slice(0, 5);

  const diagnosticWeaknesses = diagnosticAnalysis
    .filter((stat) => stat.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || a.accuracy - b.accuracy)
    .slice(0, 8);

  const zoneWeaknesses = zoneAnalysis
    .filter((stat) => stat.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || a.accuracy - b.accuracy)
    .slice(0, 5);

  return {
    categoryWeaknesses,
    diagnosticWeaknesses,
    zoneWeaknesses
  };
}

function getPriorityWeakZones(zoneAnalysis, limit) {
  return (zoneAnalysis || [])
    .filter((stat) => numberOrZero(stat.wrong) > 0)
    .sort((a, b) => {
      const wrongDiff = numberOrZero(b.wrong) - numberOrZero(a.wrong);

      if (wrongDiff !== 0) {
        return wrongDiff;
      }

      const accuracyDiff = numberOrZero(a.accuracy) - numberOrZero(b.accuracy);

      if (accuracyDiff !== 0) {
        return accuracyDiff;
      }

      const pointLossA = numberOrZero(a.points_possible) - numberOrZero(a.points_earned);
      const pointLossB = numberOrZero(b.points_possible) - numberOrZero(b.points_earned);
      const pointLossDiff = pointLossB - pointLossA;

      if (pointLossDiff !== 0) {
        return pointLossDiff;
      }

      return String(a.range).localeCompare(String(b.range), "ko");
    })
    .slice(0, limit);
}

function makePrescriptions(context) {
  const result = context.result;
  const level = context.level;
  const problemItems = context.problemItems || [];
  const unansweredItems = context.unansweredItems || [];
  const categoryAnalysis = context.categoryAnalysis || [];
  const diagnosticAnalysis = context.diagnosticAnalysis || [];
  const zoneAnalysis = context.zoneAnalysis || [];

  const totalQuestions = Number(result.total_questions || 0);
  const isFullSet = Boolean(result.is_full_40_question_set) || totalQuestions >= 40;
  const prescriptions = [];

  prescriptions.push({
    title: "현재 읽기 수준에 따른 종합 처방",
    body: [
      `현재 읽기 기준 예상 수준은 '${level.title}'입니다.`,
      level.message,
      `다음 목표는 ${level.next_target_score}점 이상, 즉 '${level.next_target_label}'입니다.`,
      level.study_focus
    ].join(" ")
  });

  if (!isFullSet) {
    prescriptions.push({
      title: "샘플 문항 결과 해석 주의",
      body: [
        `현재 결과는 TOPIK I 읽기 31~70번 전체 40문항이 아니라 ${totalQuestions}문항 기준입니다.`,
        "따라서 이 결과는 화면 기능, 문제 유형, 진단 구조를 확인하는 용도로 해석해야 합니다.",
        "실제 예상 수준과 세부 처방은 31~70번 전체 문항을 입력한 뒤 더 정확하게 판단할 수 있습니다."
      ].join(" ")
    });
  }

  const weakCategories = categoryAnalysis
    .filter((stat) => stat.wrong > 0)
    .slice(0, isFullSet ? 3 : 1);

  weakCategories.forEach((stat) => {
    prescriptions.push(prescriptionForCategory(stat, problemItems));
  });

  const weakAreas = diagnosticAnalysis
    .filter((stat) => stat.wrong > 0)
    .slice(0, isFullSet ? 3 : 1);

  weakAreas.forEach((stat) => {
    prescriptions.push(prescriptionForDiagnosticArea(stat, problemItems));
  });

  const weakZones = getPriorityWeakZones(zoneAnalysis, isFullSet ? 3 : 1);

  weakZones.forEach((stat) => {
    prescriptions.push(prescriptionForZone(stat));
  });

  if (unansweredItems.length > 0) {
    prescriptions.push({
      title: "미응답 문항 관리 처방",
      body: [
        `미응답 문항은 ${makeQuestionListText(unansweredItems.map((item) => item.question_number))}입니다.`,
        "미응답이 생긴 이유가 시간 부족인지, 지문 이해 실패인지, 문제 유형 미숙인지 구분해야 합니다.",
        "실전에서는 어려운 문항에 오래 머물지 말고 다음 문항으로 넘어간 뒤 마지막 10분에 다시 확인하는 방식이 필요합니다."
      ].join(" ")
    });
  }

  prescriptions.push(makeTwoWeekPlan(level));

  return prescriptions;
}

function prescriptionForCategory(stat, problemItems) {
  const relatedProblemItems = problemItems.filter((item) => {
    if (getReadingTypeDisplayName(item) === stat.name) {
      return true;
    }

    if (item.category === stat.name) {
      return true;
    }

    return statHasQuestionNumber(stat, item.question_number);
  });

  const questionText = makeQuestionListText(relatedProblemItems.map((item) => item.question_number));

  if (/빈칸|어휘|문법|표현|조사|연결/.test(stat.name)) {
    return {
      title: `${stat.name} 보완 처방`,
      body: [
        `${questionText}을 다시 풀면서 빈칸 앞 문장과 뒤 문장을 먼저 확인하세요.`,
        "문법 형태만 보고 고르지 말고, 앞 문장과 뒤 문장의 의미 관계가 자연스러운지 확인해야 합니다.",
        "오답 복습 시 정답 표현으로 새 문장 2개를 직접 만들어 보세요."
      ].join(" ")
    };
  }

  if (/자료|그림|표|안내|생활문|공지문/.test(stat.name)) {
    return {
      title: `${stat.name} 보완 처방`,
      body: [
        `${questionText}에서는 날짜, 시간, 장소, 대상, 조건을 먼저 표시하세요.`,
        "보기 4개를 한 번에 읽지 말고, 보기 하나마다 자료에서 근거를 확인하세요.",
        "맞지 않는 것을 고르는 문제는 맞는 보기 3개를 먼저 지우고 남은 1개를 선택하는 방식으로 풀어야 합니다."
      ].join(" ")
    };
  }

  if (/문장 순서/.test(stat.name)) {
    return {
      title: "문장 순서 배열 보완 처방",
      body: [
        `${questionText}에서는 시간 표현, 지시어, 접속어, 반복되는 명사를 먼저 찾으세요.`,
        "순서는 '처음 상황 → 전개 → 결과' 흐름으로 잡습니다.",
        "복습할 때는 정답 순서를 외우지 말고, 왜 그 문장이 앞에 와야 하는지 이유를 한 문장으로 적으세요."
      ].join(" ")
    };
  }

  if (/문장 삽입/.test(stat.name)) {
    return {
      title: "문장 삽입 보완 처방",
      body: [
        `${questionText}에서는 주어진 문장의 지시어, 접속 표현, 핵심 명사를 먼저 표시하세요.`,
        "삽입 위치 앞 문장이 그 문장을 준비하고, 뒤 문장이 그 문장을 이어 받는지 확인해야 합니다.",
        "정답 위치 앞뒤 문장과 삽입 문장을 함께 읽어서 자연스러운지 확인하세요."
      ].join(" ")
    };
  }

  if (/공통 지문|긴 지문|중심|세부|내용/.test(stat.name)) {
    return {
      title: `${stat.name} 보완 처방`,
      body: [
        `${questionText}을 다시 풀 때 선택지의 핵심어를 먼저 표시하세요.`,
        "그 핵심어가 지문에 그대로 있는지, 다른 말로 바뀌었는지 찾아야 합니다.",
        "정답이라고 생각한 보기마다 지문 속 근거 문장을 반드시 하나씩 표시하세요."
      ].join(" ")
    };
  }

  return {
    title: `${stat.name} 보완 처방`,
    body: [
      `${questionText}을 다시 풀고, 정답의 근거 문장을 지문에서 찾아 표시하세요.`,
      "오답 선택지를 고른 이유와 정답이 되는 이유를 각각 한 문장으로 적어야 합니다."
    ].join(" ")
  };
}

function prescriptionForDiagnosticArea(stat, problemItems) {
  const relatedProblemItems = problemItems.filter((item) => item.diagnostic_area === stat.name);
  const questionText = makeQuestionListText(relatedProblemItems.map((item) => item.question_number));

  return {
    title: `진단 영역 처방: ${stat.name}`,
    body: [
      `${questionText}에서 문제가 발생했습니다.`,
      "먼저 질문의 요구를 확인하고, 선택지의 핵심어를 표시한 뒤, 지문에서 근거 문장을 찾는 방식으로 복습하세요.",
      "같은 진단 영역의 문제를 3문항 이상 연속으로 풀어 오답 패턴이 반복되는지 확인하세요."
    ].join(" ")
  };
}

function prescriptionForZone(stat) {
  const range = stat.range || "";

  if (range === "31~33번") {
    return {
      title: "31~33번 주제·소재 파악 구간 처방",
      body: "짧은 글에서 무엇에 대한 내용인지 빠르게 잡는 구간입니다. 사람, 장소, 물건, 날씨, 직업처럼 반복되는 핵심 명사를 먼저 찾고 선택지의 주제어와 비교하세요."
    };
  }

  if (range === "34~39번") {
    return {
      title: "34~39번 빈칸·어휘·문법 구간 처방",
      body: "빈칸 앞뒤 문장의 의미 관계를 먼저 확인하세요. 보기 4개를 하나씩 넣어 문장이 자연스러운지 읽어 보고, 조사·동사·형용사·연결 표현이 문맥에 맞는지 비교하는 훈련이 필요합니다."
    };
  }

  if (range === "40~42번") {
    return {
      title: "40~42번 자료·그림 정보 구간 처방",
      body: "자료형 문항은 글을 모두 해석하기보다 날짜, 시간, 장소, 대상, 조건을 빠르게 찾는 능력이 중요합니다. 보기 하나마다 자료에서 근거를 확인하는 방식으로 복습하세요."
    };
  }

  if (range === "43~45번") {
    return {
      title: "43~45번 짧은 글 내용 일치 구간 처방",
      body: "짧은 글의 세부 내용을 보기와 비교하는 구간입니다. 선택지의 핵심어가 지문에 그대로 있는지, 반대로 바뀌었는지, 없는 정보가 추가되었는지 확인하세요."
    };
  }

  if (range === "46~48번") {
    return {
      title: "46~48번 중심 내용 파악 구간 처방",
      body: "중심 내용 문항은 선택지보다 글의 핵심어를 먼저 찾아야 합니다. 반복되는 말과 글쓴이의 생각이 드러난 문장을 중심으로 복습하세요."
    };
  }

  if (range === "49~56번") {
    return {
      title: "49~56번 공통 지문·생활문 구간 처방",
      body: "공통 지문 세트는 한 지문에서 여러 문제를 풀어야 하므로, 첫 문제를 풀 때 인물, 장소, 시간, 핵심 사건을 간단히 정리해 두세요."
    };
  }

  if (range === "57~60번") {
    return {
      title: "57~60번 문장 순서·문장 삽입 구간 처방",
      body: "문장 순서와 삽입은 앞뒤 문맥의 응집성을 보는 문제입니다. 주어진 문장의 지시어, 연결어, 반복 명사가 앞뒤 문장과 어떻게 연결되는지 확인하세요."
    };
  }

  if (range === "61~70번") {
    return {
      title: "61~70번 긴 지문·공통 지문 구간 처방",
      body: "후반 긴 지문은 TOPIK I 읽기 점수 안정화의 핵심입니다. 글 전체를 처음부터 세부적으로 해석하기보다 질문과 보기의 핵심어를 먼저 잡고 근거 문장을 찾으세요."
    };
  }

  return {
    title: `${stat.label} 구간 처방`,
    body: "문제가 발생한 문항을 다시 풀고 정답 근거 문장을 표시하세요."
  };
}

function makeTwoWeekPlan(level) {
  return {
    title: "2주 학습 계획",
    body: [
      "1~3일차: 오답과 미응답 문항을 다시 풀고 정답 근거 문장을 표시합니다.",
      "4~6일차: 약한 유형을 같은 유형끼리 묶어 집중 풀이합니다.",
      "7일차: 31~70번 전체 흐름을 시간 제한 없이 다시 확인하고 지문 구조를 분석합니다.",
      "8~10일차: 목표 점수보다 한 단계 높은 난이도의 지문을 매일 2~3개씩 풉니다.",
      "11~13일차: 60분 시간 제한을 두고 실전처럼 풉니다.",
      `14일차: ${level.next_target_score}점 이상을 목표로 다시 시험을 봅니다.`
    ].join(" ")
  };
}

function renderReportByMode(report) {
  if (isWrongReviewReport(report)) {
    renderWrongReviewResultReport(report);
    return;
  }

  renderReport(report);
}

function sanitizeStudentFacingReportText() {
  if (!els.reportPaper) {
    return;
  }

  const internalStorageKeyPattern = /topik1_latest_leveltest_result/g;

  if (!internalStorageKeyPattern.test(els.reportPaper.innerHTML)) {
    return;
  }

  els.reportPaper.innerHTML = els.reportPaper.innerHTML
    .replace(
      /<strong>결과 저장 안내<\/strong><br\s*\/?>(\s|&nbsp;)*이 레벨테스트 진단 보고서는(\s|&nbsp;)*topik1_latest_leveltest_result에 저장된 결과를 사용합니다\.(\s|&nbsp;)*일반 40문항 진단 보고서 저장값은 덮어쓰지 않습니다\./g,
      '<strong>결과 보관 안내</strong><br />이 레벨테스트 결과는 별도로 보관되며, 40문항 정식 진단 보고서에는 영향을 주지 않습니다.'
    )
    .replace(
      /topik1_latest_leveltest_result/g,
      '별도 레벨테스트 결과'
    );
}

function isWrongReviewReport(report) {
  const result = report && report.source ? report.source : {};
  const mode = String(result.generated_exam_mode || "");
  const label = String(result.generated_exam_label || "");

  return mode === "wrong-review" || label.includes("오답 다시 풀기");
}

function renderWrongReviewInlineActionPlaceholder() {
  return `
    <div
      id="wrongReviewInlineAction"
      style="
        margin: 18px 0 8px;
        padding: 16px;
        border: 1px solid #d7e1ec;
        border-radius: 12px;
        background: #f8fbff;
      "
    ></div>
  `;
}

function renderWrongReviewResultReport(report) {
  const result = report.source;
  const remainingProblemCount = Array.isArray(report.problemItems) ? report.problemItems.length : 0;
  const totalQuestions = numberOrZero(result.total_questions);
  const correctCount = numberOrZero(result.correct_count);
  const unansweredCount = numberOrZero(result.unanswered_count);

  els.reportPaper.innerHTML = `
    <div class="report-title">
      <h2>오답 복습 결과</h2>
      <p>${escapeHtml(result.generated_exam_label || "오답 다시 풀기")} · ${totalQuestions}문항</p>
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <div class="label">응시자</div>
        <div class="value">${escapeHtml(result.student_name || "-")}</div>
      </div>
      <div class="summary-card">
        <div class="label">복습 문항</div>
        <div class="value">${totalQuestions}문항</div>
      </div>
      <div class="summary-card">
        <div class="label">맞힌 문항</div>
        <div class="value">${correctCount} / ${totalQuestions}</div>
      </div>
      <div class="summary-card">
        <div class="label">남은 오답</div>
        <div class="value">${remainingProblemCount}</div>
      </div>
    </div>

    <div class="level-box">
      <strong>${remainingProblemCount ? "아직 다시 풀 문제가 남아 있습니다." : "오답 복습 완료"}</strong><br />
      ${
        remainingProblemCount
          ? `이번 복습에서 ${remainingProblemCount}문항이 다시 오답 또는 미응답으로 남았습니다. 아래 문항만 다시 풀면 됩니다.`
          : "이번 복습에서 남은 오답이 없습니다. 모든 오답을 해결했습니다."
      }
      <br />
      미응답: ${unansweredCount}문항
    </div>

    <div class="notice">
      <strong>오답 복습 결과 안내</strong><br />
      이 화면은 전체 TOPIK I 읽기 40문항 진단 보고서가 아니라 오답 복습 결과입니다.
      따라서 이 화면에서는 예상 수준이나 전체 실력 판정을 하지 않습니다.
    </div>

    <h3 class="section-title">다시 틀린 문항</h3>
    ${renderWrongItems(report.wrongItems)}

    <h3 class="section-title">미응답 문항</h3>
    ${renderUnansweredItems(report.unansweredItems)}

    ${renderWrongReviewInlineActionPlaceholder()}
  `;

  sanitizeStudentFacingReportText();

  els.reportArea.classList.add("show");
  els.reportActions.classList.add("show");
  renderWrongReviewButton(report);

  const loadPanel = document.getElementById("loadPanel");
  if (loadPanel) {
    loadPanel.classList.add("hidden");
  }
}

function renderReport(report) {
  const result = report.source;
  const level = report.level;
  const totalQuestions = numberOrZero(result.total_questions);
  const isLevelTest = Boolean(report.isLevelTest || isLevelTestResultData(result));
  const isFullSet = Boolean(result.is_full_40_question_set) || totalQuestions >= 40;

  const reportTitle = isLevelTest
    ? "TOPIK I 읽기 레벨테스트 진단 보고서"
    : "TOPIK I 읽기 진단 보고서";
  const scoreLabel = isLevelTest ? "레벨테스트 점수" : "읽기 점수";
  const correctLabel = isLevelTest ? "정답 수" : "정답 수";
  const rangeText = isLevelTest
    ? "20문항 레벨테스트 결과입니다. 이 결과는 40문항 정식 진단 보고서를 덮어쓰지 않습니다."
    : `${escapeHtml(result.test_name || "TOPIK I Reading")} · ${escapeHtml(result.test_scope || "TOPIK I PBT Reading 31-70")}`;

  els.reportPaper.innerHTML = `
    <div class="report-title">
      <h2>${escapeHtml(reportTitle)}</h2>
      <p>${rangeText}</p>
    </div>

    <div class="summary-grid">
      <div class="summary-card">
        <div class="label">응시자</div>
        <div class="value">${escapeHtml(result.student_name || "-")}</div>
      </div>
      <div class="summary-card">
        <div class="label">${escapeHtml(scoreLabel)}</div>
        <div class="value">${numberOrZero(result.section_score_100 ?? result.earned_points)}점</div>
      </div>
      <div class="summary-card">
        <div class="label">${escapeHtml(correctLabel)}</div>
        <div class="value">${numberOrZero(result.correct_count)} / ${totalQuestions}</div>
      </div>
      <div class="summary-card">
        <div class="label">미응답</div>
        <div class="value">${numberOrZero(result.unanswered_count)}</div>
      </div>
    </div>

    <div class="level-box">
      <strong>${escapeHtml(level.title)}</strong><br />
      ${
        isLevelTest
          ? `레벨테스트 환산 점수: ${numberOrZero(result.section_score_100 ?? result.earned_points)}점<br />`
          : `읽기 점수 구간: ${escapeHtml(level.range)}<br />`
      }
      예상 수준: ${escapeHtml(level.expected_level)}<br />
      안정권 해석: ${escapeHtml(level.stable_level)}<br />
      다음 목표: ${level.next_target_score}점 이상, ${escapeHtml(level.next_target_label)}<br />
      ${escapeHtml(level.message)}
    </div>

    <div class="notice">
      <strong>${isLevelTest ? "레벨테스트 안내" : "공식 급수 안내"}</strong><br />
      ${
        isLevelTest
          ? "이 보고서는 TOPIK I 읽기 20문항 레벨테스트 결과를 100점으로 환산해 만든 참고 진단 보고서입니다. 40문항 정식 진단 보고서는 일반 실전시험 제출 후 별도로 생성됩니다."
          : "이 보고서는 TOPIK I 읽기 영역만 기준으로 한 예상 수준입니다. 공식 TOPIK I 급수는 듣기와 읽기 합산 200점 기준으로 결정되므로, 이 결과만으로 공식 급수를 확정할 수 없습니다."
      }
    </div>

    ${
      !isLevelTest && isFullSet
        ? ""
        : isLevelTest
          ? `<div class="notice">
              <strong>결과 보관 안내</strong><br />
              이 레벨테스트 결과는 별도로 보관되며, 40문항 정식 진단 보고서에는 영향을 주지 않습니다.
            </div>`
          : `<div class="notice">
              <strong>샘플 결과 주의</strong><br />
              현재 결과는 TOPIK I 읽기 31~70번 전체 40문항이 아니라 ${totalQuestions}문항 기준입니다.
              화면 기능과 진단 구조 확인용으로 사용하고, 실제 예상 수준은 31~70번 전체 문항 입력 후 판단하세요.
            </div>`
    }

    <h3 class="section-title">시험 정보</h3>
    ${renderExamInfoTable(result)}

    <h3 class="section-title print-page-break-before">유형별 득점 그래프</h3>
    ${renderTypeBarChart(report.readingTypeAnalysis)}

    <h3 class="section-title">문항 구간별 분석</h3>
    ${renderZoneTable(report.zoneAnalysis)}

    <h3 class="section-title print-page-break-before type-analysis-title">유형별 분석</h3>
    ${renderStatsTable(report.readingTypeAnalysis, "유형")}

    <h3 class="section-title diagnostic-analysis-title">진단 영역별 분석</h3>
    ${renderStatsTable(report.diagnosticAnalysis, "진단 영역")}

    <h3 class="section-title strength-section-title">강점 영역</h3>
    ${renderStrengths(report.strengths)}

    <h3 class="section-title weakness-section-title">약점 영역</h3>
    ${renderWeaknesses(report.weaknesses, result)}

    <h3 class="section-title">선택 오답 문항</h3>
    ${renderWrongItems(report.wrongItems)}

    <h3 class="section-title">미응답 문항</h3>
    ${renderUnansweredItems(report.unansweredItems)}

    <h3 class="section-title">학습 처방</h3>
    ${renderPrescriptions(report.prescriptions)}
  `;

  sanitizeStudentFacingReportText();

  els.reportArea.classList.add("show");
  els.reportActions.classList.add("show");

  renderWrongReviewButton(report);

  const loadPanel = document.getElementById("loadPanel");
  if (loadPanel) {
    loadPanel.classList.add("hidden");
  }
}

function clearWrongReviewActionUi() {
  const oldButton = document.getElementById("wrongReviewButton");
  if (oldButton) {
    oldButton.remove();
  }

  const oldNotice = document.getElementById("wrongReviewClearNotice");
  if (oldNotice) {
    oldNotice.remove();
  }

  const oldInline = document.getElementById("wrongReviewInlineAction");
  if (oldInline) {
    oldInline.remove();
  }
}

function getReportWrongQuestionNumbers(report) {
  const problemItems = Array.isArray(report && report.problemItems)
    ? report.problemItems
    : [];

  return problemItems
    .map((item) => Number(item.question_number))
    .filter((number) => Number.isFinite(number) && number >= 31 && number <= 70)
    .filter((number, index, array) => array.indexOf(number) === index)
    .sort((a, b) => a - b);
}

function getStoredWrongReviewState() {
  try {
    const raw = localStorage.getItem(WRONG_REVIEW_STORAGE_KEY);

    if (raw === null) {
      return {
        exists: false,
        numbers: []
      };
    }

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return {
        exists: false,
        numbers: []
      };
    }

    return {
      exists: true,
      numbers: parsed
        .map((number) => Number(number))
        .filter((number) => Number.isFinite(number) && number >= 31 && number <= 70)
        .filter((number, index, array) => array.indexOf(number) === index)
        .sort((a, b) => a - b)
    };
  } catch (error) {
    console.warn("남은 오답 문항 정보를 읽지 못했습니다:", error);

    return {
      exists: false,
      numbers: []
    };
  }
}

function getWrongReviewStoragePackage() {
  try {
    const raw = localStorage.getItem(WRONG_REVIEW_SOURCE_RESULT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("오답풀이 원본 정보를 읽지 못했습니다:", error);
    return null;
  }
}

function normalizeQuestionNumberList(numbers) {
  if (!Array.isArray(numbers)) {
    return [];
  }

  return numbers
    .map((number) => Number(number))
    .filter((number) => Number.isFinite(number) && number >= 31 && number <= 70)
    .filter((number, index, array) => array.indexOf(number) === index)
    .sort((a, b) => a - b);
}

function isSameWrongReviewSource(sourceA, sourceB) {
  if (!sourceA || !sourceB) {
    return false;
  }

  if (sourceA.generated_exam_id && sourceB.generated_exam_id) {
    return sourceA.generated_exam_id === sourceB.generated_exam_id;
  }

  return (
    String(sourceA.submitted_at || "") === String(sourceB.submitted_at || "") &&
    String(sourceA.student_phone || "") === String(sourceB.student_phone || "") &&
    String(sourceA.generated_exam_label || "") === String(sourceB.generated_exam_label || "")
  );
}

function getActiveWrongReviewNumbers(report) {
  const reportNumbers = getReportWrongQuestionNumbers(report);
  const reviewPackage = getWrongReviewStoragePackage();

  if (
    reviewPackage &&
    reviewPackage.source_result &&
    isSameWrongReviewSource(reviewPackage.source_result, report && report.source) &&
    Array.isArray(reviewPackage.remaining_wrong_review_question_numbers)
  ) {
    return normalizeQuestionNumberList(reviewPackage.remaining_wrong_review_question_numbers);
  }

  if (report && report.isLevelTest) {
    return reportNumbers;
  }

  const storedState = getStoredWrongReviewState();

  if (storedState.exists) {
    return storedState.numbers;
  }

  return reportNumbers;
}

function renderWrongReviewButton(report) {
  const target = els.reportActions;

  if (!target) {
    return;
  }

  const oldButton = document.getElementById("wrongReviewButton");
  if (oldButton) {
    oldButton.remove();
  }

  const oldNotice = document.getElementById("wrongReviewClearNotice");
  if (oldNotice) {
    oldNotice.remove();
  }

  const oldInline = document.getElementById("wrongReviewInlineAction");
  const activeWrongNumbers = getActiveWrongReviewNumbers(report);

  if (!activeWrongNumbers.length) {
    const notice = document.createElement("span");
    notice.id = "wrongReviewClearNotice";
    notice.textContent = "남은 오답이 없습니다.";
    notice.style.cssText = [
      "display:inline-block",
      "margin-left:10px",
      "padding:10px 14px",
      "border-radius:8px",
      "background:#ecfdf5",
      "color:#047857",
      "font-weight:900"
    ].join(";");

    target.appendChild(notice);

    if (oldInline) {
      oldInline.innerHTML = `<strong style="color:#047857;">남은 오답이 없습니다.</strong>`;
    }

    return;
  }

  const buttonLabel = report && report.isLevelTest
    ? "레벨테스트 오답 다시 풀기"
    : "오답 다시 풀기";

  const button = document.createElement("button");
  button.type = "button";
  button.id = "wrongReviewButton";
  button.textContent = `${buttonLabel} (${activeWrongNumbers.length}문항)`;
  button.style.cssText = [
    "margin-left: 10px",
    "padding: 10px 16px",
    "border: 0",
    "border-radius: 8px",
    "background: #dc2626",
    "color: #ffffff",
    "font-weight: 900",
    "cursor: pointer"
  ].join(";");

  button.addEventListener("click", function () {
    startWrongReview(report);
  });

  target.appendChild(button);

  if (oldInline) {
    oldInline.innerHTML = `
      <button
        id="wrongReviewInlineButton"
        type="button"
        style="
          padding:10px 16px;
          border:0;
          border-radius:8px;
          background:#dc2626;
          color:#ffffff;
          font-weight:900;
          cursor:pointer;
        "
      >
        ${buttonLabel} (${activeWrongNumbers.length}문항)
      </button>
    `;

    const inlineButton = document.getElementById("wrongReviewInlineButton");
    if (inlineButton) {
      inlineButton.addEventListener("click", function () {
        startWrongReview(report);
      });
    }
  }
}

function startWrongReview(report) {
  const activeWrongNumbers = getActiveWrongReviewNumbers(report);

  if (!activeWrongNumbers.length) {
    alert("다시 풀 오답 문항이 없습니다.");
    return;
  }

  try {
    localStorage.setItem(
      WRONG_REVIEW_STORAGE_KEY,
      JSON.stringify(activeWrongNumbers)
    );

    localStorage.setItem(
      WRONG_REVIEW_SOURCE_RESULT_STORAGE_KEY,
      JSON.stringify({
        saved_at: new Date().toISOString(),
        source: report && report.isLevelTest
          ? "reading-diagnosis-leveltest"
          : "reading-diagnosis",
        source_result: report.source || {},
        report_mode: report && report.isLevelTest ? "leveltest" : "full",
        remaining_wrong_review_question_numbers: activeWrongNumbers
      })
    );
  } catch (error) {
    console.warn("오답 다시 풀기 정보 저장 실패:", error);
    alert("오답 문항 정보를 저장하지 못했습니다. 브라우저 저장소 설정을 확인하세요.");
    return;
  }

  window.location.href = WRONG_REVIEW_TEST_URL + "&v=wrong-review-" + Date.now();
}

function renderTypeBarChart(stats) {
  if (!Array.isArray(stats) || !stats.length) {
    return `<p>유형별 그래프 데이터가 없습니다.</p>`;
  }

  const rows = stats.map((stat) => {
    const rate = numberOrZero(stat.point_rate);
    const fillClass = rate >= 70
      ? "good"
      : rate >= 50
        ? "warn"
        : "bad";

    return `
      <div class="type-chart-row">
        <div class="type-chart-label">
          ${escapeHtml(stat.name)}
          <span class="type-chart-focus">${escapeHtml(stat.focus || "")}</span>
        </div>

        <div class="type-chart-track" aria-label="${escapeHtml(stat.name)} 득점률 ${rate}%">
          <div
            class="type-chart-fill ${fillClass}"
            style="width: ${Math.max(0, Math.min(100, rate))}%;"
          ></div>
        </div>

        <div class="type-chart-rate">${rate}%</div>

        <div class="type-chart-score">
          ${numberOrZero(stat.points_earned)} / ${numberOrZero(stat.points_possible)}점
          <br />
          ${numberOrZero(stat.correct)} / ${numberOrZero(stat.total)}문항
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="type-chart">
      <p class="type-chart-guide">
        아래 그래프는 TOPIK I 읽기 31~70번 문항을 8개 대표 구간으로 묶어 계산한 득점률입니다.
        막대가 짧은 구간일수록 우선 복습이 필요한 영역입니다.
      </p>

      ${rows}

      ${renderTypeChartWeaknessSummary(stats)}
    </div>
  `;
}

function renderTypeChartWeaknessSummary(stats) {
  const weakStats = stats
    .filter((stat) => stat.total > 0 && stat.wrong > 0)
    .sort((a, b) => a.point_rate - b.point_rate || b.wrong - a.wrong)
    .slice(0, 3);

  if (!weakStats.length) {
    return `
      <div class="type-chart-summary">
        <strong>유형별 약점 요약</strong><br />
        현재 결과에서는 뚜렷한 약점 유형이 확인되지 않았습니다.
        고득점 유지를 위해 후반 공통 지문과 긴 지문 근거 찾기 연습을 계속하세요.
      </div>
    `;
  }

  const summaryText = weakStats
    .map((stat) => `${stat.name} ${stat.point_rate}%`)
    .join(", ");

  const relatedText = weakStats
    .map((stat) => `${stat.name}: ${makeQuestionListText(stat.wrong_questions)}`)
    .join(" / ");

  return `
    <div class="type-chart-summary">
      <strong>유형별 약점 요약</strong><br />
      현재 가장 보완이 필요한 유형은 ${escapeHtml(summaryText)}입니다.<br />
      관련 오답·미응답 문항: ${escapeHtml(relatedText)}
    </div>
  `;
}

function renderExamInfoTable(result) {
  const generatedExamLabel = result.generated_exam_label || "랜덤 출제";
  const generatedExamRound = result.generated_exam_round || "전체 랜덤";
  const timeRange = `${formatDateTime(result.started_at)} ~ ${formatDateTime(result.submitted_at)}`;
  const isLevelTest = isLevelTestResultData(result);

  return `
    <table>
      <tbody>
        <tr>
          <th>시험명</th>
          <td>${escapeHtml(isLevelTest ? "TOPIK I 읽기 레벨테스트" : (result.test_name || "TOPIK I Reading"))}</td>
        </tr>
        <tr>
          <th>시험 범위</th>
          <td>${escapeHtml(isLevelTest ? "TOPIK I 읽기 레벨테스트 20문항" : (result.test_scope || "TOPIK I PBT Reading 31-70"))}</td>
        </tr>
        <tr>
          <th>출제 방식</th>
          <td>${escapeHtml(generatedExamLabel)}</td>
        </tr>
        <tr>
          <th>출제 회차</th>
          <td>${escapeHtml(generatedExamRound || (isLevelTest ? "레벨테스트" : "전체 랜덤"))}</td>
        </tr>
        <tr>
          <th>응시 시간</th>
          <td>${escapeHtml(timeRange)}</td>
        </tr>
        <tr>
          <th>응시자 정보</th>
          <td>${escapeHtml(result.student_name || "-")} / ${escapeHtml(result.student_phone || "-")}</td>
        </tr>
        <tr>
          <th>문항 수</th>
          <td>${numberOrZero(result.total_questions)}문항</td>
        </tr>
      </tbody>
    </table>
  `;
}
function renderZoneTable(stats) {
  if (!Array.isArray(stats) || !stats.length) {
    return `<p>문항 구간별 분석 자료가 없습니다.</p>`;
  }

  const rows = stats.map((stat) => `
    <tr>
      <td>${escapeHtml(stat.range)}</td>
      <td>
        <strong>${escapeHtml(stat.label)}</strong><br />
        <span class="small-report-note">${escapeHtml(stat.focus || "")}</span>
      </td>
      <td>${numberOrZero(stat.correct)} / ${numberOrZero(stat.total)}</td>
      <td>${numberOrZero(stat.points_earned)} / ${numberOrZero(stat.points_possible)}</td>
      <td>${numberOrZero(stat.point_rate)}%</td>
      <td>${escapeHtml(makeQuestionListText(stat.wrong_questions))}</td>
    </tr>
  `).join("");

  return `
    <table class="analysis-table zone-analysis-table">
      <thead>
        <tr>
          <th>구간</th>
          <th>진단 초점</th>
          <th>정답 수</th>
          <th>점수</th>
          <th>정답률</th>
          <th>문제 발생 문항</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderStatsTable(stats, firstColumnLabel) {
  if (!Array.isArray(stats) || !stats.length) {
    return `<p>${escapeHtml(firstColumnLabel)} 분석 자료가 없습니다.</p>`;
  }

  const rows = stats.map((stat) => `
    <tr>
      <td>${escapeHtml(stat.name)}</td>
      <td>${numberOrZero(stat.correct)} / ${numberOrZero(stat.total)}</td>
      <td>${numberOrZero(stat.points_earned)} / ${numberOrZero(stat.points_possible)}</td>
      <td>${numberOrZero(stat.point_rate)}%</td>
      <td>${escapeHtml(makeQuestionListText(stat.wrong_questions))}</td>
    </tr>
  `).join("");

  const tableClass =
    firstColumnLabel === "진단 영역"
      ? "analysis-table diagnostic-analysis-table"
      : firstColumnLabel === "유형"
        ? "analysis-table type-analysis-table"
        : "analysis-table";

  return `
    <table class="${tableClass}">
      <thead>
        <tr>
          <th>${escapeHtml(firstColumnLabel)}</th>
          <th>정답 수</th>
          <th>점수</th>
          <th>정답률</th>
          <th>문제 발생 문항</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderStrengths(strengths) {
  const tags = [];

  (strengths.categoryStrengths || []).forEach((stat) => {
    tags.push(`<span class="tag good">${escapeHtml(stat.name)} ${stat.accuracy}%</span>`);
  });

  (strengths.diagnosticStrengths || []).forEach((stat) => {
    tags.push(`<span class="tag good">${escapeHtml(stat.name)} ${stat.accuracy}%</span>`);
  });

  if (!tags.length) {
    return `<p>현재 결과 기준으로 뚜렷한 강점 영역이 아직 확인되지 않았습니다.</p>`;
  }

  return `<p>${dedupeHtmlTags(tags).join(" ")}</p>`;
}

function renderWeaknesses(weaknesses, result) {
  const tags = [];
  const totalQuestions = Number(result && result.total_questions ? result.total_questions : 0);
  const isFullSet = Boolean(result && result.is_full_40_question_set) || totalQuestions >= 40;

  const categoryLimit = isFullSet ? 5 : 3;
  const diagnosticLimit = isFullSet ? 8 : 2;
  const zoneLimit = isFullSet ? 5 : 2;

  const categoryWeaknesses = (weaknesses.categoryWeaknesses || []).slice(0, categoryLimit);
  const diagnosticWeaknesses = (weaknesses.diagnosticWeaknesses || []).slice(0, diagnosticLimit);
  const zoneWeaknesses = (weaknesses.zoneWeaknesses || []).slice(0, zoneLimit);

  categoryWeaknesses.forEach((stat) => {
    tags.push(`<span class="tag bad">${escapeHtml(stat.name)} 문제 ${stat.wrong}개</span>`);
  });

  diagnosticWeaknesses.forEach((stat) => {
    tags.push(`<span class="tag bad">${escapeHtml(stat.name)} 문제 ${stat.wrong}개</span>`);
  });

  zoneWeaknesses.forEach((stat) => {
    tags.push(`<span class="tag bad">${escapeHtml(stat.label)} 문제 ${stat.wrong}개</span>`);
  });

  if (!tags.length) {
    return `<p>오답 또는 미응답이 없거나 약점 영역이 확인되지 않았습니다.</p>`;
  }

  if (!isFullSet) {
    return `
      <p>${dedupeHtmlTags(tags).join(" ")}</p>
      <p class="small-report-note">
        현재 약점 영역은 샘플 ${totalQuestions}문항 기준으로 간략 표시한 것입니다.
        전체 40문항 결과에서는 더 많은 약점 영역을 세부적으로 표시합니다.
      </p>
    `;
  }

  return `<p>${dedupeHtmlTags(tags).join(" ")}</p>`;
}

function renderWrongItems(items) {
  if (!items.length) {
    return `
      <div class="wrong-empty-card">
        <span class="tag good">선택 오답 없음</span>
        <span class="wrong-empty-text">제출한 답 중 틀린 문항은 없습니다. 미응답 문항은 아래 미응답 문항 영역에서 확인하세요.</span>
      </div>
    `;
  }

  const html = items.map((item) => `
    <div class="wrong-item">
      <strong>${escapeHtml(item.question_number)}번</strong>
      <br />
      ${escapeHtml(getReadingTypeDisplayName(item) || "미분류")}
      <br />
      <span class="tag bad">${escapeHtml(item.diagnostic_area || "미분류")}</span>
      <br />
      내 답: ${escapeHtml(answerToTextWithOptions(item, item.student_answer))}
      <br />
      정답: ${escapeHtml(answerToTextWithOptions(item, item.correct_answer))}
      ${
        item.description
          ? `<br /><span class="small-report-note">${escapeHtml(item.description)}</span>`
          : ""
      }
    </div>
  `).join("");

  return `<div class="wrong-list">${html}</div>`;
}

function renderUnansweredItems(items) {
  if (!items.length) {
    return `<p><span class="tag good">미응답 없음</span> 모든 문항에 응답했습니다.</p>`;
  }

  return `
    <div class="unanswered-box">
      <p class="question-number-list">${makeQuestionListHtml(items.map((item) => item.question_number))}</p>
      <p class="small-report-note">
        미응답 문항도 오답 다시 풀기 대상에 포함됩니다.
      </p>
    </div>
  `;
}

function renderPrescriptions(prescriptions) {
  if (!Array.isArray(prescriptions) || !prescriptions.length) {
    return `<p>학습 처방 자료가 없습니다.</p>`;
  }

  return prescriptions.map((item) => `
    <div class="prescription-box">
      <h4>${escapeHtml(item.title)}</h4>
      <p>${escapeHtml(item.body)}</p>
    </div>
  `).join("");
}

function makeQuestionListText(numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return "관련 문항 없음";
  }

  const cleaned = numbers
    .filter((number) => number !== null && number !== undefined && number !== "")
    .map((number) => String(number).replace(/번$/, ""))
    .filter((number, index, array) => array.indexOf(number) === index)
    .sort((a, b) => Number(a) - Number(b));

  if (!cleaned.length) {
    return "관련 문항 없음";
  }

  return cleaned.map((number) => `${number}번`).join(", ");
}

function makeQuestionListHtml(numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return "관련 문항 없음";
  }

  const cleaned = numbers
    .filter((number) => number !== null && number !== undefined && number !== "")
    .map((number) => String(number).replace(/번$/, ""))
    .filter((number, index, array) => array.indexOf(number) === index)
    .sort((a, b) => Number(a) - Number(b));

  if (!cleaned.length) {
    return "관련 문항 없음";
  }

  return cleaned
    .map((number, index) => {
      const suffix = index < cleaned.length - 1 ? "," : "";
      return `<span class="qnum-token">${escapeHtml(number)}번${suffix}</span>`;
    })
    .join(" ");
}

function answerToText(answer) {
  if (answer === null || answer === undefined || answer === "") {
    return "미응답";
  }

  if (Array.isArray(answer)) {
    return answer.join("-");
  }

  if (typeof answer === "object") {
    try {
      return JSON.stringify(answer);
    } catch (error) {
      return String(answer);
    }
  }

  return String(answer);
}

function answerToTextWithOptions(item, answer) {
  if (answer === null || answer === undefined || answer === "") {
    return "미응답";
  }

  if (Array.isArray(answer)) {
    return answer.join("-");
  }

  const answerText = String(answer);

  if (Array.isArray(item.options)) {
    const matchedObject = item.options.find((option) => {
      if (!option || typeof option !== "object") {
        return false;
      }

      return String(option.label) === answerText || String(option.value) === answerText;
    });

    if (matchedObject) {
      return `${matchedObject.label || answerText}. ${matchedObject.text || matchedObject.value || ""}`.trim();
    }

    const numericAnswer = Number(answer);

    if (Number.isInteger(numericAnswer) && numericAnswer >= 1 && numericAnswer <= item.options.length) {
      const option = item.options[numericAnswer - 1];

      if (option && typeof option === "object") {
        return `${option.label || numericAnswer}. ${option.text || option.value || ""}`.trim();
      }

      return `${numericAnswer}. ${option}`;
    }
  }

  return answerToText(answer);
}

function isUnanswered(answer) {
  if (answer === null || answer === undefined || answer === "") {
    return true;
  }

  if (Array.isArray(answer)) {
    return answer.length === 0;
  }

  return false;
}

function statHasQuestionNumber(stat, questionNumber) {
  const target = Number(questionNumber);

  if (!Number.isFinite(target)) {
    return false;
  }

  return Array.isArray(stat && stat.wrong_questions)
    && stat.wrong_questions.map(Number).includes(target);
}

function dedupeHtmlTags(tags) {
  const seenText = new Set();

  return tags.filter((html) => {
    const key = String(html).replace(/<[^>]*>/g, "");

    if (seenText.has(key)) {
      return false;
    }

    seenText.add(key);
    return true;
  });
}

function percent(correct, total) {
  if (!total) {
    return 0;
  }

  return Math.round((correct / total) * 100);
}

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString("ko-KR");
}

function setStatus(message, type = "") {
  if (!els.status) {
    return;
  }

  els.status.textContent = message;
  els.status.className = `status ${type}`.trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
