"use strict";

console.log("TOPIK I Reading Diagnosis loaded: prescription-v2");

const AUTO_DIAGNOSIS_STORAGE_KEY = "topik1_latest_reading_result";

const state = {
  sourceResult: null,
  report: null
};

const els = {
  fileInput: document.getElementById("resultFile"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  status: document.getElementById("status"),
  reportActions: document.getElementById("reportActions"),
  reportArea: document.getElementById("reportArea"),
  reportPaper: document.getElementById("reportPaper"),
  downloadJsonBtn: document.getElementById("downloadJsonBtn"),
  downloadTxtBtn: document.getElementById("downloadTxtBtn"),
  printBtn: document.getElementById("printBtn"),
  resetBtn: document.getElementById("resetBtn")
};

function setStatus(message, type = "") {
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

function numberOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function percent(correct, total) {
  if (!total) return 0;
  return Math.round((correct / total) * 100);
}

function getAnswerText(item, answer) {
  if (answer === null || answer === undefined || answer === "") return "미응답";

  if (Array.isArray(answer)) {
    return answer.join("-");
  }

  if (typeof answer === "number" && Array.isArray(item.options)) {
    return item.options[answer - 1] || String(answer);
  }

  return String(answer);
}

function getReadingLevel(score) {
  const numericScore = numberOrZero(score);

  if (numericScore < 40) {
    return {
      code: "BELOW_LEVEL_1",
      title: "TOPIK I 읽기 1급 미도달 가능성 높음",
      range: "0~39점",
      message: "기초 어휘와 짧은 문장 이해부터 다시 안정화해야 합니다.",
      nextTarget: 45
    };
  }

  if (numericScore < 70) {
    return {
      code: "LEVEL_1_RANGE",
      title: "TOPIK I 읽기 1급 예상권",
      range: "40~69점",
      message: "짧은 글은 이해하지만 공통 지문, 빈칸, 세부 정보 문항에서 점수 손실이 큽니다.",
      nextTarget: 70
    };
  }

  return {
    code: "LEVEL_2_RANGE",
    title: "TOPIK I 읽기 2급 예상권",
    range: "70~100점",
    message: "TOPIK I 읽기 영역 기준으로 2급 예상권입니다. 긴 지문과 추론 문항을 안정화하면 좋습니다.",
    nextTarget: Math.min(100, numericScore + 10)
  };
}

function validateReadingResult(data) {
  if (!data || typeof data !== "object") {
    throw new Error("JSON 형식이 올바르지 않습니다.");
  }

  if (!Array.isArray(data.items)) {
    throw new Error("items 배열이 없습니다. reading-result.json 파일인지 확인하세요.");
  }

  if (data.section && data.section !== "reading") {
    throw new Error("읽기 결과 파일이 아닙니다. section 값이 reading이어야 합니다.");
  }

  if (data.total_questions && Number(data.total_questions) !== data.items.length) {
    console.warn("total_questions와 items 개수가 다릅니다.");
  }

  return true;
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
  });

  return [...map.values()]
    .map((stat) => ({
      ...stat,
      accuracy: percent(stat.correct, stat.total),
      point_rate: stat.points_possible ? Math.round((stat.points_earned / stat.points_possible) * 100) : 0
    }))
    .sort((a, b) => b.wrong - a.wrong || a.accuracy - b.accuracy || a.name.localeCompare(b.name, "ko"));
}

function makeWeaknessList(categoryAnalysis, diagnosticAnalysis) {
  const categoryWeaknesses = categoryAnalysis
    .filter((stat) => stat.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || a.accuracy - b.accuracy)
    .slice(0, 5);

  const diagnosticWeaknesses = diagnosticAnalysis
    .filter((stat) => stat.wrong > 0)
    .sort((a, b) => b.wrong - a.wrong || a.accuracy - b.accuracy)
    .slice(0, 8);

  return { categoryWeaknesses, diagnosticWeaknesses };
}

function makeStrengthList(categoryAnalysis) {
  return categoryAnalysis
    .filter((stat) => stat.total >= 2 && stat.accuracy >= 60)
    .sort((a, b) => b.accuracy - a.accuracy || b.correct - a.correct)
    .slice(0, 5);
}

function makeQuestionListText(numbers) {
  if (!Array.isArray(numbers) || numbers.length === 0) {
    return "관련 문항 없음";
  }

  return numbers
    .filter((number) => number !== null && number !== undefined && number !== "")
    .map((number) => `${number}번`)
    .join(", ");
}

function getWrongItemsByCategory(reportBase, categoryName) {
  if (!Array.isArray(reportBase.wrong_items)) {
    return [];
  }

  return reportBase.wrong_items.filter((item) => item.category === categoryName);
}

function getWrongItemsByDiagnosticArea(reportBase, areaName) {
  if (!Array.isArray(reportBase.wrong_items)) {
    return [];
  }

  return reportBase.wrong_items.filter((item) => item.diagnostic_area === areaName);
}

function makeWrongItemReviewGuide(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "오답 문항이 없으면 맞힌 문항 중 시간이 오래 걸린 문항을 다시 풀어 보세요.";
  }

  const sampleItems = items.slice(0, 5);
  const questionNumbers = sampleItems.map((item) => item.question_number);

  return [
    `먼저 ${makeQuestionListText(questionNumbers)}을 다시 푸세요.`,
    "1회차에는 정답을 보지 말고 다시 풀고,",
    "2회차에는 지문에서 정답의 근거 문장을 찾아 밑줄을 긋고,",
    "3회차에는 왜 내 답이 틀렸는지 한 문장으로 적으세요."
  ].join(" ");
}

function prescriptionForCategory(name, wrongItems = []) {
  const questionText = makeQuestionListText(
    wrongItems.map((item) => item.question_number)
  );

  const rules = [
    {
      test: /주제|소재|중심/,
      title: "주제·중심 내용 보완",
      detail: [
        `${questionText}을 다시 풀면서 글의 첫 문장과 마지막 문장에 표시하세요.`,
        "선택지를 보기 전에 글이 ‘무엇에 대한 글인지’를 한국어 한 단어로 먼저 적으세요.",
        "그다음 보기 4개 중 그 단어와 가장 가까운 선택지를 고르세요.",
        "오답이 반복되면 선택지의 단어만 보고 고르지 말고, 지문에서 반복되는 말을 찾아야 합니다."
      ].join(" ")
    },
    {
      test: /빈칸|연결어|조사|표현|어휘|동사|명사구/,
      title: "빈칸·어휘·문법 보완",
      detail: [
        `${questionText}의 빈칸 앞 문장과 뒤 문장을 먼저 읽으세요.`,
        "빈칸 앞뒤가 이유, 결과, 대조, 시간 순서 중 무엇인지 표시하세요.",
        "보기 4개를 하나씩 넣어 읽으면서 가장 자연스러운 문장을 고르세요.",
        "복습할 때는 정답 표현으로 짧은 새 문장 2개를 직접 만들어 보세요."
      ].join(" ")
    },
    {
      test: /내용 일치|세부|공통 지문 이해|긴 지문 이해/,
      title: "내용 일치·세부 정보 보완",
      detail: [
        `${questionText}을 다시 풀 때 보기의 핵심어를 먼저 동그라미 치세요.`,
        "그 핵심어가 지문에 그대로 있는지, 비슷한 말로 바뀌었는지 찾아야 합니다.",
        "맞는 보기라고 생각되면 반드시 지문 속 근거 문장 번호 또는 문장을 적으세요.",
        "근거 문장을 찾지 못한 선택지는 답으로 고르지 않는 연습이 필요합니다."
      ].join(" ")
    },
    {
      test: /자료|그림|표|초대장|메시지/,
      title: "그림·표·자료형 문항 보완",
      detail: [
        `${questionText}에서는 자료를 읽을 때 날짜, 시간, 장소, 사람, 행동을 먼저 표시하세요.`,
        "보기 4개를 한 번에 읽지 말고, 보기 하나마다 자료에서 맞는지 확인하세요.",
        "틀린 것을 고르는 문제에서는 ‘맞는 보기 3개를 지우고 남은 1개’를 고르는 방식으로 푸세요."
      ].join(" ")
    },
    {
      test: /문장 순서/,
      title: "문장 순서 배열 보완",
      detail: [
        `${questionText}은 문장 첫머리의 시간 표현, 지시어, 접속어를 먼저 찾으세요.`,
        "‘처음 상황 → 이어지는 행동 → 결과’ 순서로 문장을 배열하세요.",
        "복습할 때는 정답 순서를 외우지 말고, 왜 그 문장이 앞에 와야 하는지 이유를 적으세요."
      ].join(" ")
    },
    {
      test: /문장 삽입/,
      title: "문장 삽입 보완",
      detail: [
        `${questionText}에서는 삽입할 문장의 대명사, 연결 표현, 앞뒤 내용 관계를 확인하세요.`,
        "삽입 문장 앞에는 그 문장을 준비하는 내용이 있어야 하고, 뒤에는 그 문장을 이어 받는 내용이 있어야 합니다.",
        "정답 위치 앞 문장과 뒤 문장을 함께 소리 내어 읽어 자연스러운지 확인하세요."
      ].join(" ")
    },
    {
      test: /생활문|공지문|광고|안내문/,
      title: "생활문·공지문 보완",
      detail: [
        `${questionText}은 글의 목적을 먼저 찾으세요.`,
        "공지문은 누가, 누구에게, 무엇을, 언제부터, 어디에서 하는지를 표처럼 정리하면 좋습니다.",
        "보기에서 날짜·장소·대상·행동이 하나라도 다르면 오답으로 지우세요."
      ].join(" ")
    },
    {
      test: /추론/,
      title: "추론 문항 보완",
      detail: [
        `${questionText}은 지문에 그대로 쓰인 말만 찾으면 부족합니다.`,
        "글쓴이의 마음, 이유, 결과를 지문 근거로 연결해야 합니다.",
        "복습할 때는 ‘이 문장 때문에 이렇게 알 수 있다’ 형식으로 근거를 적으세요."
      ].join(" ")
    }
  ];

  const matched = rules.find((rule) => rule.test.test(name));

  if (matched) {
    return matched;
  }

  return {
    title: `${name} 보완`,
    detail: [
      `${questionText}을 다시 풀고, 각 문항마다 정답의 근거 문장을 하나씩 찾으세요.`,
      "틀린 이유를 ‘단어를 몰라서’, ‘문장을 잘못 읽어서’, ‘보기를 착각해서’, ‘시간이 부족해서’ 중 하나로 분류하세요.",
      "같은 이유가 반복되면 그 부분이 우선 보완 영역입니다."
    ].join(" ")
  };
}

function prescriptionForDiagnosticArea(name, wrongItems = []) {
  const questionText = makeQuestionListText(
    wrongItems.map((item) => item.question_number)
  );

  if (/짧은 글|중심 소재|중심 생각/.test(name)) {
    return {
      title: `세부 진단 보완: ${name}`,
      detail: `${questionText}을 다시 읽고 글의 핵심어를 하나만 고르세요. 핵심어를 고른 뒤 보기와 비교하면 주제·소재 문항의 실수가 줄어듭니다.`
    };
  }

  if (/문맥|어휘|표현|조사|동사|명사구/.test(name)) {
    return {
      title: `세부 진단 보완: ${name}`,
      detail: `${questionText}의 빈칸 앞뒤 문장을 연결해서 읽으세요. 특히 조사, 동사, 연결 표현은 앞뒤 문장의 의미 관계를 보고 골라야 합니다.`
    };
  }

  if (/세부 내용|정보|자료|공지문|메시지|초대장/.test(name)) {
    return {
      title: `세부 진단 보완: ${name}`,
      detail: `${questionText}의 보기마다 지문 속 근거를 찾아 표시하세요. 보기의 일부만 맞고 일부가 틀린 경우가 많으므로 끝까지 확인해야 합니다.`
    };
  }

  if (/순서|연결 관계|논리적/.test(name)) {
    return {
      title: `세부 진단 보완: ${name}`,
      detail: `${questionText}에서 시간 표현, 지시어, 접속 표현을 표시하세요. 배열 문제는 문장 뜻보다 문장 사이의 연결 단서를 먼저 보는 것이 중요합니다.`
    };
  }

  if (/삽입|위치|흐름/.test(name)) {
    return {
      title: `세부 진단 보완: ${name}`,
      detail: `${questionText}에서 삽입 문장 앞뒤가 자연스럽게 이어지는지 확인하세요. 특히 ‘그’, ‘이’, ‘그래서’, ‘하지만’ 같은 표현이 앞뒤 문장과 연결되는지 보세요.`
    };
  }

  if (/추론/.test(name)) {
    return {
      title: `세부 진단 보완: ${name}`,
      detail: `${questionText}에서 글에 직접 쓰인 사실과 그 사실로 알 수 있는 내용을 구분하세요. 추론 문항은 감으로 고르지 말고 반드시 근거 문장을 적어야 합니다.`
    };
  }

  return {
    title: `세부 진단 보완: ${name}`,
    detail: `${questionText}을 다시 풀면서 틀린 이유를 적으세요. 같은 진단 영역에서 반복되는 실수는 다음 시험 전 우선 복습해야 합니다.`
  };
}

function buildScoreBasedPlan(score, unansweredCount, wrongCount) {
  if (score < 40) {
    return {
      title: "점수 구간별 학습 계획: 1급 예상권 진입",
      detail: [
        "현재 단계에서는 어려운 긴 지문보다 짧은 글, 빈칸, 자료형 문항에서 먼저 점수를 확보해야 합니다.",
        "1일차에는 31~40번 유형을 다시 풀고, 정답 근거 문장을 표시하세요.",
        "2일차에는 41~50번 유형을 다시 풀고, 보기의 핵심어와 지문 근거를 연결하세요.",
        "3일차에는 틀린 문항만 다시 풀고, 같은 실수가 반복되는지 확인하세요.",
        "특히 틀린 문항은 정답만 외우지 말고, 왜 그 보기가 정답인지 지문에서 직접 찾아야 합니다."
      ].join(" ")
    };
  }

  if (score < 70) {
    return {
      title: "점수 구간별 학습 계획: 2급 예상권 진입",
      detail: [
        "기초 문항은 어느 정도 풀 수 있으므로 공통 지문과 긴 지문에서 점수를 올려야 합니다.",
        "하루에 공통 지문 2세트씩 풀고, 각 지문에서 정답 근거 문장을 표시하세요.",
        "빈칸 문제는 연결 표현과 앞뒤 문맥을 함께 정리하세요.",
        "내용 일치 문제는 보기의 핵심어를 먼저 표시한 뒤 지문에서 같은 뜻의 문장을 찾는 방식으로 복습하세요."
      ].join(" ")
    };
  }

  return {
    title: "점수 구간별 학습 계획: 2급 안정화",
    detail: [
      "현재는 2급 예상권입니다. 이제는 실수 줄이기와 시간 관리가 중요합니다.",
      "틀린 문항을 유형별로 묶고, 같은 유형에서 왜 틀렸는지 비교하세요.",
      "긴 지문은 처음부터 끝까지 번역하려고 하지 말고, 질문과 보기의 핵심어를 먼저 잡은 뒤 지문에서 근거를 찾으세요.",
      "문장 삽입, 문장 순서, 긴 지문 추론처럼 실수가 잦은 유형을 따로 모아 다시 풀어 보세요."
    ].join(" ")
  };
}

function buildTimeManagementPlan(summary) {
  const unansweredCount = numberOrZero(summary.unanswered_count);
  const totalQuestions = numberOrZero(summary.total_questions);

  if (unansweredCount === 0) {
    return {
      title: "시간 관리 처방",
      detail: "미응답 문항은 없습니다. 다음 단계에서는 빠르게 풀다가 틀린 문항이 있는지 확인하고, 어려운 문항에 시간을 너무 많이 쓰지 않는 연습을 하세요."
    };
  }

  const unansweredRate = totalQuestions
    ? Math.round((unansweredCount / totalQuestions) * 100)
    : 0;

  if (unansweredRate >= 30) {
    return {
      title: "시간 관리 처방",
      detail: [
        `미응답이 ${unansweredCount}문항으로 많습니다.`,
        "처음부터 모든 문항을 완벽하게 풀려고 하면 뒤쪽 문제를 놓칠 수 있습니다.",
        "1차 풀이에서는 쉬운 문제를 먼저 풀고, 어려운 문제는 오래 붙잡지 말고 다음 문항으로 넘어가세요.",
        "목표 시간은 31~40번 10분, 41~50번 15분, 51~60번 15분, 61~70번 20분입니다."
      ].join(" ")
    };
  }

  return {
    title: "시간 관리 처방",
    detail: [
      `미응답이 ${unansweredCount}문항 있습니다.`,
      "마지막 10분에는 새 문제를 오래 고민하기보다 미응답 문항을 먼저 채우는 전략이 필요합니다.",
      "어려운 문제는 오래 고민하지 말고 다음 문항으로 넘어간 뒤, 마지막에 전체 문제에서 미응답 문항을 확인하세요."
    ].join(" ")
  };
}

function buildPrescriptions(reportBase) {
  const { categoryWeaknesses, diagnosticWeaknesses } = reportBase.weaknesses;
  const summary = reportBase.summary;
  const score = summary.reading_score_100;
  const prescriptions = [];

  prescriptions.push({
    title: "오늘 바로 할 일",
    detail: [
      "오답 문항을 다시 풀기 전에 정답을 먼저 보지 마세요.",
      "틀린 문항을 한 번 더 풀고, 그다음 정답과 내 답을 비교하세요.",
      "각 오답마다 ‘정답 근거 문장’과 ‘내가 틀린 이유’를 한 줄씩 적으세요.",
      makeWrongItemReviewGuide(reportBase.wrong_items)
    ].join(" ")
  });

  prescriptions.push(buildScoreBasedPlan(
    score,
    summary.unanswered_count,
    summary.wrong_count
  ));

  prescriptions.push(buildTimeManagementPlan(summary));

  categoryWeaknesses.forEach((weakness, index) => {
    const wrongItems = getWrongItemsByCategory(reportBase, weakness.name);
    const categoryPrescription = prescriptionForCategory(weakness.name, wrongItems);

    prescriptions.push({
      title: `${index + 1}. category 집중 처방: ${categoryPrescription.title}`,
      detail: [
        `오답 ${weakness.wrong}개, 정답률 ${weakness.accuracy}%입니다.`,
        categoryPrescription.detail
      ].join(" "),
      related_questions: weakness.wrong_questions
    });
  });

  diagnosticWeaknesses.slice(0, 5).forEach((weakness, index) => {
    const wrongItems = getWrongItemsByDiagnosticArea(reportBase, weakness.name);
    const diagnosticPrescription = prescriptionForDiagnosticArea(weakness.name, wrongItems);

    prescriptions.push({
      title: `${index + 1}. diagnostic_area 세부 처방: ${diagnosticPrescription.title}`,
      detail: [
        `이 영역에서는 ${weakness.total}문항 중 ${weakness.wrong}문항을 틀렸습니다.`,
        diagnosticPrescription.detail
      ].join(" "),
      related_questions: weakness.wrong_questions
    });
  });

  prescriptions.push({
    title: "3일 복습 루틴",
    detail: [
      "1일차: 오답 문항만 다시 풀고 정답 근거 문장을 표시합니다.",
      "2일차: 같은 category 문항을 다시 풀고, 틀린 이유를 유형별로 정리합니다.",
      "3일차: 시간을 정해 놓고 다시 풀어 봅니다. 한 문항에 오래 걸리면 다음 문항으로 넘어간 뒤 마지막에 다시 확인하는 연습을 합니다."
    ].join(" ")
  });

  prescriptions.push({
    title: "다음 시험 전 확인할 것",
    detail: [
      "시험 전에는 새 문제를 많이 푸는 것보다 이전 오답을 정확히 다시 푸는 것이 더 중요합니다.",
      "오답 문항에서 정답 근거를 찾을 수 있으면 같은 유형의 점수가 올라갑니다.",
      "다음 시험에서는 쉬운 문항을 먼저 맞히고, 어려운 문항은 오래 붙잡지 말고 넘어간 뒤 마지막에 다시 확인하는 전략을 사용하세요."
    ].join(" ")
  });

  return prescriptions;
}

function analyzeReadingResult(data) {
  validateReadingResult(data);

  const items = data.items;
  const totalQuestions = numberOrZero(data.total_questions || items.length);
  const answeredCount = numberOrZero(data.answered_count || items.filter((item) => item.student_answer !== null && item.student_answer !== undefined).length);
  const correctCount = numberOrZero(data.correct_count || items.filter((item) => item.is_correct).length);
  const wrongCount = numberOrZero(data.wrong_count || items.filter((item) => !item.is_correct).length);
  const totalPossiblePoints = numberOrZero(data.total_possible_points || items.reduce((sum, item) => sum + numberOrZero(item.points), 0));
  const earnedPoints = numberOrZero(data.earned_points ?? data.section_score_100 ?? items.reduce((sum, item) => sum + numberOrZero(item.earned_points), 0));
  const score100 = numberOrZero(data.section_score_100 ?? earnedPoints);
  const level = getReadingLevel(score100);

  const categoryAnalysis = groupStats(items, "category");
  const diagnosticAreaAnalysis = groupStats(items, "diagnostic_area");
  const weaknesses = makeWeaknessList(categoryAnalysis, diagnosticAreaAnalysis);
  const strengths = makeStrengthList(categoryAnalysis);

  const wrongItems = items
    .filter((item) => !item.is_correct)
    .map((item) => ({
      id: item.id,
      question_number: item.question_number,
      type: item.type,
      category: item.category || "미분류",
      diagnostic_area: item.diagnostic_area || "미분류",
      points: numberOrZero(item.points),
      correct_answer: item.correct_answer,
      correct_answer_text: getAnswerText(item, item.correct_answer),
      student_answer: item.student_answer,
      student_answer_text: getAnswerText(item, item.student_answer),
      description: item.description || "",
      passage_group_id: item.passage_group_id || null,
      sentence_order_result: item.sentence_order_result || null,
      sentence_insert_result: item.sentence_insert_result || null
    }));

  const report = {
    report_type: "TOPIK_I_READING_DIAGNOSIS",
    report_version: "reading-diagnosis-prescription-v2",
    generated_at: new Date().toISOString(),
    source: {
      test_level: data.test_level || "TOPIK I",
      section: data.section || "reading",
      test_name: data.test_name || "TOPIK I Reading",
      test_scope: data.test_scope || "",
      question_number_start: data.question_number_start || 31,
      question_number_end: data.question_number_end || 70,
      is_full_40_question_set: Boolean(data.is_full_40_question_set)
    },
    student: {
      name: data.student_name || "",
      phone: data.student_phone || "",
      started_at: data.started_at || "",
      submitted_at: data.submitted_at || ""
    },
    summary: {
      reading_score_100: score100,
      earned_points: earnedPoints,
      total_possible_points: totalPossiblePoints,
      total_questions: totalQuestions,
      answered_count: answeredCount,
      unanswered_count: numberOrZero(data.unanswered_count),
      correct_count: correctCount,
      wrong_count: wrongCount,
      accuracy: percent(correctCount, totalQuestions)
    },
    predicted_reading_level: level,
    strengths,
    weaknesses,
    category_analysis: categoryAnalysis,
    diagnostic_area_analysis: diagnosticAreaAnalysis,
    wrong_items: wrongItems,
    next_goal: {
      current_score: score100,
      target_score: level.nextTarget,
      target_message: `${score100}점에서 ${level.nextTarget}점까지 올리는 것을 다음 목표로 설정합니다.`
    },
    prescriptions: [],
    pdf_print: {
      method: "브라우저 인쇄 기능에서 PDF로 저장",
      paper_size: "A4",
      note: "PDF 자동 생성은 다음 단계에서 별도 기능으로 확장할 수 있습니다."
    }
  };

  report.prescriptions = buildPrescriptions(report);

  return report;
}

function renderStatRows(stats) {
  return stats
    .map((stat) => `
      <tr>
        <td>${escapeHtml(stat.name)}</td>
        <td>${stat.correct} / ${stat.total}</td>
        <td>${stat.wrong}</td>
        <td>${stat.accuracy}%</td>
        <td>${stat.points_earned} / ${stat.points_possible}</td>
        <td>${escapeHtml(stat.wrong_questions.join(", ") || "-")}</td>
      </tr>
    `)
    .join("");
}

function renderWrongItems(wrongItems) {
  if (!wrongItems.length) {
    return `<p><span class="tag good">오답 없음</span> 모든 문항을 맞혔습니다.</p>`;
  }

  return `
    <div class="wrong-list">
      ${wrongItems.map((item) => `
        <div class="wrong-item">
          <strong>${item.question_number}번</strong>
          <span class="tag bad">${escapeHtml(item.category)}</span><br />
          정답: ${escapeHtml(item.correct_answer_text)} /
          내 답: ${escapeHtml(item.student_answer_text)}<br />
          <span class="note">${escapeHtml(item.description)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function formatPrescriptionTitle(title) {
  return String(title ?? "")
    .replace(/^\d+\.\s*/, "")
    .replace(/^category 집중 처방:/, "category 처방:")
    .replace(/^diagnostic_area 세부 처방:\s*세부 진단 보완:/, "세부 처방:")
    .replace(/^diagnostic_area 세부 처방:/, "세부 처방:")
    .replace(/^세부 진단 보완:/, "세부 처방:")
    .trim();
}

function renderPrescriptions(prescriptions) {
  if (!Array.isArray(prescriptions) || prescriptions.length === 0) {
    return `<p class="note">학습 처방이 없습니다.</p>`;
  }

  return `
    <div class="prescription-list">
      ${prescriptions
        .map((item, index) => {
          const cleanTitle = formatPrescriptionTitle(item.title);

          return `
            <div class="prescription-item">
              <p>
                <strong>${index + 1}. ${escapeHtml(cleanTitle)}</strong>
              </p>
              <p>${escapeHtml(item.detail)}</p>
              ${
                Array.isArray(item.related_questions) &&
                item.related_questions.length
                  ? `<div class="note">관련 문항: ${escapeHtml(
                      item.related_questions.join(", ")
                    )}</div>`
                  : ""
              }
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderReport(report) {
  const summary = report.summary;
  const student = report.student;
  const level = report.predicted_reading_level;

  const strengthsHtml = report.strengths.length
    ? report.strengths.map((item) => `<span class="tag good">${escapeHtml(item.name)} ${item.accuracy}%</span>`).join(" ")
    : `<span class="tag">아직 뚜렷한 강점 없음</span>`;

  const weaknessTags = report.weaknesses.categoryWeaknesses.length
    ? report.weaknesses.categoryWeaknesses.map((item) => `<span class="tag bad">${escapeHtml(item.name)} 오답 ${item.wrong}개</span>`).join(" ")
    : `<span class="tag good">큰 취약 영역 없음</span>`;

  els.reportPaper.innerHTML = `
    <div class="report-title">
      <h2>TOPIK I Reading Level Test 진단·처방 보고서</h2>
      <p>이 보고서는 reading-result.json을 기반으로 생성되었습니다.</p>
    </div>

    <h3>1. 응시자 정보</h3>
    <table>
      <tbody>
        <tr><th>응시자 이름</th><td>${escapeHtml(student.name)}</td><th>전화번호</th><td>${escapeHtml(student.phone)}</td></tr>
        <tr><th>시험명</th><td>${escapeHtml(report.source.test_name)}</td><th>시험 범위</th><td>${escapeHtml(report.source.test_scope)}</td></tr>
        <tr><th>시작 시간</th><td>${escapeHtml(student.started_at)}</td><th>제출 시간</th><td>${escapeHtml(student.submitted_at)}</td></tr>
      </tbody>
    </table>

    <h3>2. 점수 요약</h3>
    <div class="summary-grid">
      <div class="summary-card"><div class="label">읽기 점수</div><div class="value">${summary.reading_score_100} / 100</div></div>
      <div class="summary-card"><div class="label">정답 수</div><div class="value">${summary.correct_count} / ${summary.total_questions}</div></div>
      <div class="summary-card"><div class="label">오답 수</div><div class="value">${summary.wrong_count}</div></div>
      <div class="summary-card"><div class="label">정답률</div><div class="value">${summary.accuracy}%</div></div>
    </div>

    <div class="level-box">
      <strong>${escapeHtml(level.title)}</strong><br />
      기준 범위: ${escapeHtml(level.range)}<br />
      ${escapeHtml(level.message)}
      <div class="note">주의: 이 판정은 읽기 100점 기준의 예상 레벨입니다. TOPIK I 공식 등급은 듣기+읽기 200점 기준으로 계산합니다.</div>
    </div>

    <h3>3. 강점과 약점</h3>
    <p><strong>강점:</strong> ${strengthsHtml}</p>
    <p><strong>우선 보완 영역:</strong> ${weaknessTags}</p>

    <h3>4. category별 분석</h3>
    <table>
      <thead>
        <tr>
          <th>category</th>
          <th>정답/문항</th>
          <th>오답</th>
          <th>정답률</th>
          <th>점수</th>
          <th>오답 문항</th>
        </tr>
      </thead>
      <tbody>${renderStatRows(report.category_analysis)}</tbody>
    </table>

    <h3>5. 세부 진단 영역 분석</h3>
    <table>
      <thead>
        <tr>
          <th>diagnostic_area</th>
          <th>정답/문항</th>
          <th>오답</th>
          <th>정답률</th>
          <th>점수</th>
          <th>오답 문항</th>
        </tr>
      </thead>
      <tbody>${renderStatRows(report.diagnostic_area_analysis)}</tbody>
    </table>

    <div class="page-break"></div>

    <h3>6. 오답 문항 목록</h3>
    ${renderWrongItems(report.wrong_items)}

    <h3>7. 학습 처방</h3>
    ${renderPrescriptions(report.prescriptions)}

    <h3>8. 다음 목표</h3>
    <div class="level-box">
      현재 ${report.next_goal.current_score}점 → 다음 목표 ${report.next_goal.target_score}점<br />
      ${escapeHtml(report.next_goal.target_message)}
    </div>

    <p class="note">
      PDF 저장 방법: 상단의 “PDF로 인쇄 / 저장” 버튼을 누른 뒤, 프린터를 “PDF로 저장”으로 선택하고 A4 크기로 저장하세요.
    </p>
  `;

  els.reportArea.classList.add("show");
  els.reportActions.classList.add("show");
}

function buildTxtReport(report) {
  const lines = [];

  lines.push("TOPIK I Reading Level Test 진단·처방 보고서");
  lines.push("========================================");
  lines.push(`생성 시간: ${report.generated_at}`);
  lines.push("");
  lines.push("[응시자 정보]");
  lines.push(`응시자 이름: ${report.student.name}`);
  lines.push(`전화번호: ${report.student.phone}`);
  lines.push(`시험명: ${report.source.test_name}`);
  lines.push(`시험 범위: ${report.source.test_scope}`);
  lines.push(`시작 시간: ${report.student.started_at}`);
  lines.push(`제출 시간: ${report.student.submitted_at}`);
  lines.push("");

  lines.push("[점수 요약]");
  lines.push(`읽기 점수: ${report.summary.reading_score_100} / 100`);
  lines.push(`정답 수: ${report.summary.correct_count} / ${report.summary.total_questions}`);
  lines.push(`오답 수: ${report.summary.wrong_count}`);
  lines.push(`미응답 수: ${report.summary.unanswered_count}`);
  lines.push(`정답률: ${report.summary.accuracy}%`);
  lines.push(`예상 읽기 레벨: ${report.predicted_reading_level.title}`);
  lines.push(`설명: ${report.predicted_reading_level.message}`);
  lines.push("");

  lines.push("[category별 분석]");
  report.category_analysis.forEach((stat) => {
    lines.push(`- ${stat.name}: 정답 ${stat.correct}/${stat.total}, 오답 ${stat.wrong}, 정답률 ${stat.accuracy}%, 오답 문항 ${stat.wrong_questions.join(", ") || "없음"}`);
  });
  lines.push("");

  lines.push("[세부 진단 영역 분석]");
  report.diagnostic_area_analysis.forEach((stat) => {
    lines.push(`- ${stat.name}: 정답 ${stat.correct}/${stat.total}, 오답 ${stat.wrong}, 정답률 ${stat.accuracy}%, 오답 문항 ${stat.wrong_questions.join(", ") || "없음"}`);
  });
  lines.push("");

  lines.push("[오답 문항]");
  if (!report.wrong_items.length) {
    lines.push("오답 없음");
  } else {
    report.wrong_items.forEach((item) => {
      lines.push(`- ${item.question_number}번 ${item.id}: ${item.category}`);
      lines.push(`  정답: ${item.correct_answer_text}`);
      lines.push(`  내 답: ${item.student_answer_text}`);
      lines.push(`  설명: ${item.description}`);
    });
  }
  lines.push("");

  lines.push("[학습 처방]");
  report.prescriptions.forEach((item, index) => {
    lines.push(`${index + 1}. ${formatPrescriptionTitle(item.title)}`);
    lines.push(`   ${item.detail}`);
    if (Array.isArray(item.related_questions) && item.related_questions.length) {
      lines.push(`   관련 문항: ${item.related_questions.join(", ")}`);
    }
  });
  lines.push("");

  lines.push("[다음 목표]");
  lines.push(`현재 ${report.next_goal.current_score}점 → 다음 목표 ${report.next_goal.target_score}점`);
  lines.push(report.next_goal.target_message);

  return lines.join("\n");
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

async function readSelectedFile() {
  const file = els.fileInput.files && els.fileInput.files[0];
  if (!file) {
    throw new Error("reading-result.json 파일을 먼저 선택하세요.");
  }

  const text = await file.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("JSON 파일을 읽을 수 없습니다. 파일 형식을 확인하세요.");
  }
}

async function handleAnalyze() {
  try {
    setStatus("파일을 읽고 진단 보고서를 생성하는 중입니다...");
    const data = await readSelectedFile();
    const report = analyzeReadingResult(data);

    state.sourceResult = data;
    state.report = report;

    renderReport(report);
    setStatus("진단 보고서가 생성되었습니다.", "ok");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "진단 보고서 생성 중 오류가 발생했습니다.", "error");
  }
}

function isAutoDiagnosisMode() {
  const params = new URLSearchParams(window.location.search);
  return params.get("auto") === "1";
}

function handleAutoAnalyze() {
  if (!isAutoDiagnosisMode()) {
    return;
  }

  try {
    setStatus("자동 연결된 reading-result를 확인하는 중입니다...");

    const raw = localStorage.getItem(AUTO_DIAGNOSIS_STORAGE_KEY);

    if (!raw) {
      throw new Error(
        "자동 연결된 reading-result가 없습니다. 읽기 시험을 먼저 제출하거나 reading-result.json 파일을 직접 선택하세요."
      );
    }

    const data = JSON.parse(raw);

    validateReadingResult(data);

    const report = analyzeReadingResult(data);

    state.sourceResult = data;
    state.report = report;

    renderReport(report);

    setStatus("자동 연결된 reading-result로 진단 보고서가 생성되었습니다.", "ok");

    if (els.reportArea && els.reportArea.scrollIntoView) {
      els.reportArea.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (error) {
    console.error(error);
    setStatus(
      error.message || "자동 진단 보고서 생성 중 오류가 발생했습니다.",
      "error"
    );
  }
}

function handleDownloadJson() {
  if (!state.report) {
    setStatus("먼저 진단 보고서를 생성하세요.", "error");
    return;
  }

  downloadTextFile(
    "diagnosis-report.json",
    JSON.stringify(state.report, null, 2),
    "application/json;charset=utf-8"
  );
}

function handleDownloadTxt() {
  if (!state.report) {
    setStatus("먼저 진단 보고서를 생성하세요.", "error");
    return;
  }

  downloadTextFile(
    "diagnosis-report.txt",
    buildTxtReport(state.report),
    "text/plain;charset=utf-8"
  );
}

function handlePrint() {
  if (!state.report) {
    setStatus("먼저 진단 보고서를 생성하세요.", "error");
    return;
  }

  window.print();
}

function handleReset() {
  state.sourceResult = null;
  state.report = null;
  els.fileInput.value = "";
  els.reportPaper.innerHTML = "";
  els.reportArea.classList.remove("show");
  els.reportActions.classList.remove("show");
  setStatus("reading-result.json 파일을 선택하세요.");
}

els.analyzeBtn.addEventListener("click", handleAnalyze);
els.downloadJsonBtn.addEventListener("click", handleDownloadJson);
els.downloadTxtBtn.addEventListener("click", handleDownloadTxt);
els.printBtn.addEventListener("click", handlePrint);
els.resetBtn.addEventListener("click", handleReset);

handleAutoAnalyze();
