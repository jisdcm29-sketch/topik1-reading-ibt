"use strict";

/*
  TOPIK I Reading Question Bank Builder
  version: builder-v1

  역할:
  - reading-questions.json의 현재 40문항을 읽음
  - exam-template.json의 31~70 구조를 참고함
  - 완전한 question-bank.json 구조로 변환함
  - 변환된 question-bank.json 파일을 다운로드함

  사용 방법:
  1) reading-test/index.html을 브라우저에서 연다.
  2) Console에서 question-bank-builder.js를 불러온다.
  3) TOPIKQuestionBankBuilder.buildAndDownload() 실행
*/

(function () {
  const QUESTIONS_URL = "./reading-questions.json";
  const TEMPLATE_URL = "./exam-template.json";

  async function loadJson(url) {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`${url} 파일을 불러오지 못했습니다. 상태 코드: ${response.status}`);
    }

    return response.json();
  }

  function normalizeArray(value) {
    return Array.isArray(value) ? value : [];
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

  function getCorrectAnswer(question) {
    if (question.type === "sentence_order" || normalizeQuestionType(question.type) === "sentence_order") {
      if (Array.isArray(question.correct_order)) {
        return question.correct_order.join("-");
      }

      return question.correct_answer || question.answer || "";
    }

    if (question.correct_answer !== undefined) {
      return question.correct_answer;
    }

    if (question.answer !== undefined) {
      return question.answer;
    }

    return null;
  }

  function getQuestionNumber(question, fallbackIndex) {
    return Number(question.question_number) || 31 + fallbackIndex;
  }

  function getQuestionId(question, questionNumber) {
    return question.id || `R${String(questionNumber).padStart(3, "0")}`;
  }

  function getGroupId(question) {
    return (
      question.passage_group_id ||
      question.group_id ||
      question.shared_passage_id ||
      ""
    );
  }

  function getGroupNumbers(question, fallbackNumber) {
    if (Array.isArray(question.passage_group_numbers) && question.passage_group_numbers.length > 0) {
      return question.passage_group_numbers.map(Number);
    }

    if (Array.isArray(question.group_question_numbers) && question.group_question_numbers.length > 0) {
      return question.group_question_numbers.map(Number);
    }

    return [Number(fallbackNumber)];
  }

  function createSingleBankItem(question, index) {
    const questionNumber = getQuestionNumber(question, index);
    const questionId = getQuestionId(question, questionNumber);
    const type = normalizeQuestionType(question.type);

    const bankItem = {
      id: `QB-${questionId}-001`,
      source: "current-reading-questions",
      original_question_number: questionNumber,
      target_slots: [questionNumber],
      level: question.test_level || "TOPIK I",
      section: question.section || "reading",
      type,
      category: question.category || "미분류",
      diagnostic_area: question.diagnostic_area || "미분류",
      instruction: question.instruction || "",
      question: question.question || "",
      passage: question.passage || "",
      options: normalizeArray(question.options),
      correct_answer: getCorrectAnswer({ ...question, type }),
      points: Number(question.points || question.score) || 0,
      description: question.description || "",
      image_url: question.image_url || ""
    };

    if (type === "sentence_order") {
      bankItem.sentence_items = normalizeArray(question.sentence_items);
      bankItem.correct_order = normalizeArray(question.correct_order);
    }

    if (type === "sentence_insert") {
      bankItem.insert_sentence =
        question.insert_sentence ||
        question.sentence_to_insert ||
        question.target_sentence ||
        "";

      bankItem.insert_positions = normalizeArray(question.insert_positions).length
        ? normalizeArray(question.insert_positions)
        : normalizeArray(question.options);

      bankItem.correct_position =
        question.correct_position ||
        question.answer_position ||
        "";
    }

    return bankItem;
  }

  function createPassageSetFromGroup(groupId, questionsInGroup, templateGroup) {
    const sortedQuestions = questionsInGroup.slice().sort(function (a, b) {
      return Number(a.question_number) - Number(b.question_number);
    });

    const firstQuestion = sortedQuestions[0];
    const targetSlots = sortedQuestions.map(function (question) {
      return Number(question.question_number);
    });

    const hasSentenceInsert = sortedQuestions.some(function (question) {
      return normalizeQuestionType(question.type) === "sentence_insert";
    });

    const setType = hasSentenceInsert
      ? "sentence_insert_common_passage_2_questions"
      : "common_passage_2_questions";

    const groupTitle =
      firstQuestion.passage_group_title ||
      firstQuestion.group_title ||
      firstQuestion.shared_passage_title ||
      (templateGroup ? templateGroup.group_title : `[${targetSlots[0]}~${targetSlots[targetSlots.length - 1]}] 공통 지문`);

    return {
      set_id: `QB-${groupId}-001`,
      source: "current-reading-questions",
      set_type: setType,
      target_slots: targetSlots,
      level: firstQuestion.test_level || "TOPIK I",
      section: firstQuestion.section || "reading",
      instruction: firstQuestion.instruction || groupTitle,
      passage:
        firstQuestion.shared_passage ||
        firstQuestion.common_passage ||
        firstQuestion.group_passage ||
        firstQuestion.passage ||
        "",
      image_url:
        firstQuestion.shared_image_url ||
        firstQuestion.common_image_url ||
        firstQuestion.group_image_url ||
        firstQuestion.image_url ||
        "",
      items: sortedQuestions.map(function (question) {
        const questionNumber = Number(question.question_number);
        const questionId = getQuestionId(question, questionNumber);
        const type = normalizeQuestionType(question.type);

        const item = {
          item_id: `QB-${questionId}-001`,
          target_slot: questionNumber,
          type,
          category: question.category || "미분류",
          diagnostic_area: question.diagnostic_area || "미분류",
          question: question.question || "",
          options: normalizeArray(question.options),
          correct_answer: getCorrectAnswer({ ...question, type }),
          points: Number(question.points || question.score) || 0,
          description: question.description || ""
        };

        if (type === "sentence_insert") {
          item.insert_sentence =
            question.insert_sentence ||
            question.sentence_to_insert ||
            question.target_sentence ||
            "";

          item.insert_positions = normalizeArray(question.insert_positions).length
            ? normalizeArray(question.insert_positions)
            : normalizeArray(question.options);

          item.correct_position =
            question.correct_position ||
            question.answer_position ||
            "";
        }

        if (type === "sentence_order") {
          item.sentence_items = normalizeArray(question.sentence_items);
          item.correct_order = normalizeArray(question.correct_order);
        }

        return item;
      })
    };
  }

  function createSentenceOrderSet(sentenceOrderQuestions, templateGroup) {
    const sortedQuestions = sentenceOrderQuestions.slice().sort(function (a, b) {
      return Number(a.question_number) - Number(b.question_number);
    });

    return {
      set_id: "QB-G057-058-001",
      source: "current-reading-questions",
      set_type: "sentence_order_set",
      target_slots: [57, 58],
      level: "TOPIK I",
      section: "reading",
      instruction: "[57~58] 다음을 순서에 맞게 배열하십시오.",
      passage: "",
      image_url: "",
      items: sortedQuestions.map(function (question) {
        const questionNumber = Number(question.question_number);
        const questionId = getQuestionId(question, questionNumber);

        return {
          item_id: `QB-${questionId}-001`,
          target_slot: questionNumber,
          type: "sentence_order",
          category: question.category || "문장 순서 배열",
          diagnostic_area: question.diagnostic_area || "미분류",
          question: question.question || "오른쪽의 문장을 왼쪽 순서 칸으로 끌어다 놓아 순서를 맞추십시오.",
          options: normalizeArray(question.options),
          correct_answer: Array.isArray(question.correct_order)
            ? question.correct_order.join("-")
            : getCorrectAnswer({ ...question, type: "sentence_order" }),
          points: Number(question.points || question.score) || 0,
          description: question.description || "",
          sentence_items: normalizeArray(question.sentence_items),
          correct_order: normalizeArray(question.correct_order)
        };
      })
    };
  }

  function findTemplateGroup(template, targetSlots) {
    const sortedTarget = targetSlots.slice().map(Number).sort(function (a, b) {
      return a - b;
    });

    return normalizeArray(template.slot_groups).find(function (group) {
      const groupSlots = normalizeArray(group.slot_group).map(Number).sort(function (a, b) {
        return a - b;
      });

      if (groupSlots.length !== sortedTarget.length) {
        return false;
      }

      return groupSlots.every(function (value, index) {
        return value === sortedTarget[index];
      });
    }) || null;
  }

  function buildQuestionBank(questions, template) {
    if (!Array.isArray(questions)) {
      throw new Error("reading-questions.json은 배열이어야 합니다.");
    }

    const singleItems = [];
    const passageSets = [];
    const groupMap = {};

    const normalizedQuestions = questions.map(function (question, index) {
      const questionNumber = getQuestionNumber(question, index);

      return {
        ...question,
        question_number: questionNumber,
        type: normalizeQuestionType(question.type)
      };
    });

    normalizedQuestions.forEach(function (question, index) {
      const questionNumber = Number(question.question_number);
      const groupId = getGroupId(question);

      if (groupId) {
        if (!groupMap[groupId]) {
          groupMap[groupId] = [];
        }

        groupMap[groupId].push(question);
        return;
      }

      if (question.type === "sentence_order" && (questionNumber === 57 || questionNumber === 58)) {
        return;
      }

      singleItems.push(createSingleBankItem(question, index));
    });

    Object.keys(groupMap).forEach(function (groupId) {
      const questionsInGroup = groupMap[groupId];
      const targetSlots = questionsInGroup.map(function (question) {
        return Number(question.question_number);
      });

      const templateGroup = findTemplateGroup(template, targetSlots);
      passageSets.push(createPassageSetFromGroup(groupId, questionsInGroup, templateGroup));
    });

    const sentenceOrderQuestions = normalizedQuestions.filter(function (question) {
      return question.type === "sentence_order" &&
        [57, 58].includes(Number(question.question_number));
    });

    if (sentenceOrderQuestions.length > 0) {
      const templateGroup = findTemplateGroup(template, [57, 58]);
      passageSets.push(createSentenceOrderSet(sentenceOrderQuestions, templateGroup));
    }

    singleItems.sort(function (a, b) {
      return Number(a.original_question_number) - Number(b.original_question_number);
    });

    passageSets.sort(function (a, b) {
      return Number(a.target_slots[0]) - Number(b.target_slots[0]);
    });

    const totalBankQuestions =
      singleItems.length +
      passageSets.reduce(function (sum, set) {
        return sum + normalizeArray(set.items).length;
      }, 0);

    return {
      bank_version: "1.0",
      bank_name: "TOPIK I Reading Question Bank",
      level: "TOPIK I",
      section: "reading",
      question_number_start: 31,
      question_number_end: 70,
      status: "converted_from_current_reading_questions",
      description: "reading-questions.json의 현재 40문항을 question-bank.json 구조로 변환한 문제은행입니다.",
      source_file: "reading-questions.json",
      converted_at: new Date().toISOString(),
      total_bank_questions: totalBankQuestions,
      single_items: singleItems,
      passage_sets: passageSets
    };
  }

  function downloadJson(data, fileName) {
    const jsonText = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();

    window.setTimeout(function () {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 0);
  }

  function summarizeBank(bank) {
    const singleCount = normalizeArray(bank.single_items).length;
    const setCount = normalizeArray(bank.passage_sets).length;
    const setItemCount = normalizeArray(bank.passage_sets).reduce(function (sum, set) {
      return sum + normalizeArray(set.items).length;
    }, 0);

    return {
      bank_version: bank.bank_version,
      status: bank.status,
      single_items: singleCount,
      passage_sets: setCount,
      passage_set_items: setItemCount,
      total_bank_questions: bank.total_bank_questions
    };
  }

  async function build() {
    const questions = await loadJson(QUESTIONS_URL);
    const template = await loadJson(TEMPLATE_URL);
    const bank = buildQuestionBank(questions, template);

    console.group("TOPIK I Reading question-bank build result");
    console.log("요약:", summarizeBank(bank));
    console.log("전체 question-bank:", bank);
    console.groupEnd();

    return bank;
  }

  async function buildAndDownload() {
    const bank = await build();
    downloadJson(bank, "question-bank.json");
    return bank;
  }

  window.TOPIKQuestionBankBuilder = {
    build,
    buildAndDownload
  };
})();