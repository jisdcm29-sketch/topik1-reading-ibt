"use strict";

/*
  TOPIK I Reading Question Generator
  version: starter-check-v1

  현재 역할:
  - question-bank.json 읽기
  - exam-template.json 읽기
  - 31~70번 유형 배치 구조 점검
  - 어떤 슬롯에 후보 문제가 부족한지 확인

  아직 하지 않는 일:
  - reading-test.js와 자동 연결하지 않음
  - 실제 시험 화면을 바꾸지 않음
  - generated-reading-questions.json 파일을 자동 저장하지 않음

  사용 방법:
  1) reading-test/index.html을 브라우저에서 연다.
  2) 개발자도구 Console에서 아래를 실행한다.
     TOPIKQuestionGenerator.checkOnly()
*/

(function () {
  const BANK_URL = "./question-bank.json";
  const TEMPLATE_URL = "./exam-template.json";

  function makeGeneratedExamId() {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `TOPIK1-READING-${timestamp}-${randomPart}`;
  }

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

  function sameNumberArray(a, b) {
    const left = normalizeArray(a).map(Number).sort(function (x, y) { return x - y; });
    const right = normalizeArray(b).map(Number).sort(function (x, y) { return x - y; });

    if (left.length !== right.length) {
      return false;
    }

    return left.every(function (value, index) {
      return value === right[index];
    });
  }

  function getAllTemplateSlots(template) {
    const singleSlots = normalizeArray(template.single_slots).map(function (slot) {
      return Number(slot.slot);
    });

    const groupSlots = [];

    normalizeArray(template.slot_groups).forEach(function (group) {
      normalizeArray(group.required_items).forEach(function (item) {
        groupSlots.push(Number(item.slot));
      });
    });

    return singleSlots.concat(groupSlots).filter(Number.isFinite).sort(function (a, b) {
      return a - b;
    });
  }

  function checkTemplateBasicStructure(template) {
    const errors = [];
    const slots = getAllTemplateSlots(template);

    if (template.level !== "TOPIK I") {
      errors.push("template.level은 TOPIK I이어야 합니다.");
    }

    if (template.section !== "reading") {
      errors.push("template.section은 reading이어야 합니다.");
    }

    if (Number(template.question_number_start) !== 31) {
      errors.push("question_number_start는 31이어야 합니다.");
    }

    if (Number(template.question_number_end) !== 70) {
      errors.push("question_number_end는 70이어야 합니다.");
    }

    if (slots.length !== 40) {
      errors.push(`템플릿 문항 수가 40개가 아닙니다. 현재 ${slots.length}개입니다.`);
    }

    for (let number = 31; number <= 70; number += 1) {
      if (!slots.includes(number)) {
        errors.push(`${number}번 슬롯이 템플릿에 없습니다.`);
      }
    }

    const duplicatedSlots = slots.filter(function (slot, index) {
      return slots.indexOf(slot) !== index;
    });

    if (duplicatedSlots.length > 0) {
      errors.push(`중복 슬롯이 있습니다: ${Array.from(new Set(duplicatedSlots)).join(", ")}`);
    }

    return errors;
  }

  function checkBankBasicStructure(bank) {
    const errors = [];

    if (bank.level !== "TOPIK I") {
      errors.push("bank.level은 TOPIK I이어야 합니다.");
    }

    if (bank.section !== "reading") {
      errors.push("bank.section은 reading이어야 합니다.");
    }

    if (!Array.isArray(bank.single_items)) {
      errors.push("question-bank.json에 single_items 배열이 필요합니다.");
    }

    if (!Array.isArray(bank.passage_sets)) {
      errors.push("question-bank.json에 passage_sets 배열이 필요합니다.");
    }

    return errors;
  }

  function findSingleCandidates(bank, slot) {
    return normalizeArray(bank.single_items).filter(function (item) {
      const targetSlots = normalizeArray(item.target_slots).map(Number);

      return (
        item.level === "TOPIK I" &&
        item.section === "reading" &&
        targetSlots.includes(Number(slot.slot)) &&
        item.type === slot.required_type
      );
    });
  }

  function setSatisfiesGroup(set, group) {
    if (!set || !group) {
      return false;
    }

    if (set.level !== "TOPIK I" || set.section !== "reading") {
      return false;
    }

    if (set.set_type !== group.required_set_type) {
      return false;
    }

    if (!sameNumberArray(set.target_slots, group.slot_group)) {
      return false;
    }

    const setItems = normalizeArray(set.items);
    const requiredItems = normalizeArray(group.required_items);

    if (setItems.length !== requiredItems.length) {
      return false;
    }

    return requiredItems.every(function (requiredItem) {
      return setItems.some(function (setItem) {
        return (
          Number(setItem.target_slot) === Number(requiredItem.slot) &&
          setItem.type === requiredItem.required_type
        );
      });
    });
  }

  function findSetCandidates(bank, group) {
    return normalizeArray(bank.passage_sets).filter(function (set) {
      return setSatisfiesGroup(set, group);
    });
  }

  function findFallbackSingleCandidatesForGroup(bank, group) {
    const result = {};

    normalizeArray(group.required_items).forEach(function (requiredItem) {
      result[requiredItem.slot] = findSingleCandidates(bank, {
        slot: requiredItem.slot,
        required_type: requiredItem.required_type
      });
    });

    return result;
  }
    function cloneForExamMode(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeExamRoundValue(value) {
    const text = String(value || "").trim();

    if (text === "100" || text.includes("100")) {
      return "100";
    }

    if (text === "103" || text.includes("103")) {
      return "103";
    }

    if (text === "102" || text.includes("102")) {
      return "102";
    }

    return "";
  }

  function inferSingleItemRound(item, index) {
    const directRound = normalizeExamRoundValue(item && item.exam_round);
    if (directRound) {
      return directRound;
    }

    const text = [
      item && item.id,
      item && item.source,
      item && item.source_exam,
      item && item.original_question_number
    ].map(function (value) {
      return String(value || "");
    }).join(" ");

    const textRound = normalizeExamRoundValue(text);
    if (textRound) {
      return textRound;
    }

    // 현재 병합 순서 기준:
    // single_items 0~17   = 102회
    // single_items 18~35  = 103회
    // single_items 36~53  = 100회
    if (index >= 0 && index < 18) {
      return "102";
    }

    if (index >= 18 && index < 36) {
      return "103";
    }

    return "100";
  }

  function inferPassageSetRound(set, index) {
    const directRound = normalizeExamRoundValue(set && set.exam_round);
    if (directRound) {
      return directRound;
    }

    const text = [
      set && set.set_id,
      set && set.source,
      set && set.source_exam,
      set && set.set_type
    ].map(function (value) {
      return String(value || "");
    }).join(" ");

    const textRound = normalizeExamRoundValue(text);
    if (textRound) {
      return textRound;
    }

    // 현재 병합 순서 기준:
    // passage_sets 0~10   = 102회
    // passage_sets 11~21  = 103회
    // passage_sets 22~32  = 100회
    if (index >= 0 && index < 11) {
      return "102";
    }

    if (index >= 11 && index < 22) {
      return "103";
    }

    return "100";
  }

  function applyExamGenerationOptionsToBank(bank, options) {
    const normalizedOptions = options || {};
    const mode = normalizedOptions.mode || "random";
    const round = normalizedOptions.round || "";

    if (mode !== "round" || !round) {
      return bank;
    }

    const filteredBank = cloneForExamMode(bank);

    filteredBank.single_items = normalizeArray(bank.single_items).filter(function (item, index) {
      return inferSingleItemRound(item, index) === round;
    });

    filteredBank.passage_sets = normalizeArray(bank.passage_sets).filter(function (set, index) {
      return inferPassageSetRound(set, index) === round;
    });

    filteredBank.selected_exam_mode = "round";
    filteredBank.selected_exam_round = round;

    console.info("TOPIK I Reading 회차 고정 문제은행 필터:", {
      selected_round: round,
      single_items: filteredBank.single_items.length,
      passage_sets: filteredBank.passage_sets.length,
      passage_set_items: filteredBank.passage_sets.reduce(function (sum, set) {
        return sum + normalizeArray(set.items).length;
      }, 0)
    });

    return filteredBank;
  }

  function buildStructureReport(bank, template) {
    const report = {
      generated_exam_id: makeGeneratedExamId(),
      checked_at: new Date().toISOString(),
      bank_name: bank.bank_name || "",
      bank_version: bank.bank_version || "",
      template_name: template.template_name || "",
      template_version: template.template_version || "",
      basic_errors: [],
      total_template_slots: 0,
      expected_total_questions: Number(template.expected_total_questions) || 40,
      single_slot_results: [],
      group_slot_results: [],
      missing_single_slots: [],
      missing_group_slots: [],
      can_generate_full_exam_now: false
    };

    report.basic_errors = report.basic_errors
      .concat(checkBankBasicStructure(bank))
      .concat(checkTemplateBasicStructure(template));

    const allSlots = getAllTemplateSlots(template);
    report.total_template_slots = allSlots.length;

    normalizeArray(template.single_slots).forEach(function (slot) {
      const candidates = findSingleCandidates(bank, slot);

      const result = {
        slot: Number(slot.slot),
        required_type: slot.required_type,
        category: slot.category || "",
        points: Number(slot.points) || 0,
        candidate_count: candidates.length,
        candidate_ids: candidates.map(function (item) { return item.id; }),
        status: candidates.length > 0 ? "OK" : "MISSING"
      };

      report.single_slot_results.push(result);

      if (candidates.length === 0) {
        report.missing_single_slots.push(result);
      }
    });

    normalizeArray(template.slot_groups).forEach(function (group) {
      const setCandidates = findSetCandidates(bank, group);
      const fallbackSingles = findFallbackSingleCandidatesForGroup(bank, group);

      const requiredItemResults = normalizeArray(group.required_items).map(function (requiredItem) {
        const fallbackCandidates = fallbackSingles[requiredItem.slot] || [];

        return {
          slot: Number(requiredItem.slot),
          required_type: requiredItem.required_type,
          category: requiredItem.category || "",
          points: Number(requiredItem.points) || 0,
          fallback_single_candidate_count: fallbackCandidates.length,
          fallback_single_candidate_ids: fallbackCandidates.map(function (item) { return item.id; })
        };
      });

      const hasCompleteSet = setCandidates.length > 0;
      const hasFallbackSinglesForAll = requiredItemResults.every(function (item) {
        return item.fallback_single_candidate_count > 0;
      });

      const result = {
        slot_group: normalizeArray(group.slot_group).map(Number),
        required_set_type: group.required_set_type,
        group_title: group.group_title || "",
        set_candidate_count: setCandidates.length,
        set_candidate_ids: setCandidates.map(function (set) { return set.set_id; }),
        required_item_results: requiredItemResults,
        status: hasCompleteSet || hasFallbackSinglesForAll ? "OK" : "MISSING"
      };

      report.group_slot_results.push(result);

      if (result.status === "MISSING") {
        report.missing_group_slots.push(result);
      }
    });

    report.can_generate_full_exam_now =
      report.basic_errors.length === 0 &&
      report.missing_single_slots.length === 0 &&
      report.missing_group_slots.length === 0;

    return report;
  }

  function pickRandom(list) {
    if (!Array.isArray(list) || list.length === 0) {
      return null;
    }

    const index = Math.floor(Math.random() * list.length);
    return list[index];
  }

  function convertSingleItemToQuestion(item, slot, generatedExamId) {
    const questionNumber = Number(slot.slot);

    return {
      id: `GEN-R${String(questionNumber).padStart(3, "0")}-${item.id}`,
      question_number: questionNumber,
      test_level: "TOPIK I",
      section: "reading",
      type: item.type,
      instruction: item.instruction || slot.instruction || "",
      passage: item.passage || "",
      question: item.question || "",
      options: normalizeArray(item.options),
      answer: item.correct_answer,
      points: Number(slot.points) || Number(item.points) || 0,
      category: item.category || slot.category || "미분류",
      diagnostic_area: item.diagnostic_area || slot.diagnostic_area || "미분류",
      description: item.description || "",
      image_url: item.image_url || "",
      source_bank_id: item.id,
      generated_exam_id: generatedExamId,
      template_slot: questionNumber,
      sentence_items: item.sentence_items,
      correct_order: item.correct_order,
      insert_sentence: item.insert_sentence || "",
      insert_positions: item.insert_positions,
      correct_position: item.correct_position || ""
    };
  }

  function convertPassageSetItemToQuestion(set, setItem, group, generatedExamId) {
    const questionNumber = Number(setItem.target_slot);
    const groupNumbers = normalizeArray(group.slot_group).map(Number);
    const sharedIndex = groupNumbers.indexOf(questionNumber) + 1;

    const question = {
      id: `GEN-R${String(questionNumber).padStart(3, "0")}-${setItem.item_id}`,
      question_number: questionNumber,
      test_level: "TOPIK I",
      section: "reading",
      type: setItem.type,
      instruction: set.instruction || group.group_title || "",
      passage: set.passage || "",
      question: setItem.question || "",
      options: normalizeArray(setItem.options),
      answer: setItem.correct_answer,
      points: Number(setItem.points) || 0,
      category: setItem.category || "미분류",
      diagnostic_area: setItem.diagnostic_area || "미분류",
      description: setItem.description || "",
      image_url: set.image_url || "",
      passage_group_id: set.set_id,
      passage_group_title: group.group_title || "",
      passage_group_numbers: groupNumbers,
      shared_passage_index: sharedIndex || null,
      shared_passage_total: groupNumbers.length,
      source_bank_id: setItem.item_id,
      source_set_id: set.set_id,
      generated_exam_id: generatedExamId,
      template_slot: questionNumber,
      insert_sentence: setItem.insert_sentence || "",
      insert_positions: setItem.insert_positions,
      correct_position: setItem.correct_position || ""
    };

    if (setItem.type === "sentence_order") {
      question.sentence_items = normalizeArray(setItem.sentence_items);
      question.correct_order = normalizeArray(setItem.correct_order);
    }

    if (setItem.type === "sentence_insert") {
      question.insert_sentence = setItem.insert_sentence || "";
      question.insert_positions = normalizeArray(setItem.insert_positions);
      question.correct_position = setItem.correct_position || "";
    }

    return question;
  }
  function toNumberArrayForRound(value) {
    if (Array.isArray(value)) {
      return value
        .map(Number)
        .filter(Number.isFinite);
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? [parsed] : [];
  }

  function getSingleItemTargetSlot(item) {
    const targetSlots = toNumberArrayForRound(item && item.target_slots);

    if (targetSlots.length > 0) {
      return targetSlots[0];
    }

    const targetSlot = Number(item && item.target_slot);
    if (Number.isFinite(targetSlot)) {
      return targetSlot;
    }

    const originalNumber = Number(item && item.original_question_number);
    if (Number.isFinite(originalNumber)) {
      return originalNumber;
    }

    return null;
  }

  function getPassageSetTargetSlots(set) {
    const targetSlots = toNumberArrayForRound(set && set.target_slots);

    if (targetSlots.length > 0) {
      return targetSlots;
    }

    return normalizeArray(set && set.items)
      .map(function (item) {
        return Number(item && item.target_slot);
      })
      .filter(Number.isFinite)
      .sort(function (a, b) {
        return a - b;
      });
  }

  function findTemplateSingleSlot(template, questionNumber, item) {
    const matchedSlot = normalizeArray(template.single_slots).find(function (slot) {
      return Number(slot.slot) === Number(questionNumber);
    });

    if (matchedSlot) {
      return matchedSlot;
    }

    return {
      slot: questionNumber,
      required_type: item.type,
      instruction: item.instruction || "",
      category: item.category || "",
      diagnostic_area: item.diagnostic_area || "",
      points: Number(item.points) || 0
    };
  }

  function findTemplateGroupSlot(template, targetSlots, set) {
    const matchedGroup = normalizeArray(template.slot_groups).find(function (group) {
      return sameNumberArray(group.slot_group, targetSlots);
    });

    if (matchedGroup) {
      return matchedGroup;
    }

    return {
      slot_group: targetSlots,
      required_set_type: set.set_type || "",
      group_title: set.instruction || set.set_id || "",
      required_items: normalizeArray(set.items).map(function (item) {
        return {
          slot: Number(item.target_slot),
          required_type: item.type,
          category: item.category || "",
          points: Number(item.points) || 0
        };
      })
    };
  }

  function generateFixedRoundQuestionArrayFromFilteredBank(workingBank, template, options) {
    const round = options && options.round ? String(options.round) : "";
    const generatedExamId = `${makeGeneratedExamId()}-round-${round}`;
    const generatedQuestions = [];

    normalizeArray(workingBank.single_items).forEach(function (item) {
      const questionNumber = getSingleItemTargetSlot(item);

      if (!Number.isFinite(questionNumber)) {
        return;
      }

      const slot = findTemplateSingleSlot(template, questionNumber, item);
      generatedQuestions.push(convertSingleItemToQuestion(item, slot, generatedExamId));
    });

    normalizeArray(workingBank.passage_sets).forEach(function (set) {
      const targetSlots = getPassageSetTargetSlots(set);

      if (!targetSlots.length) {
        return;
      }

      const group = findTemplateGroupSlot(template, targetSlots, set);

      normalizeArray(set.items)
        .slice()
        .sort(function (a, b) {
          return Number(a.target_slot) - Number(b.target_slot);
        })
        .forEach(function (setItem) {
          generatedQuestions.push(
            convertPassageSetItemToQuestion(set, setItem, group, generatedExamId)
          );
        });
    });

    generatedQuestions.sort(function (a, b) {
      return Number(a.question_number) - Number(b.question_number);
    });

    const numbers = generatedQuestions.map(function (question) {
      return Number(question.question_number);
    });

    const missingNumbers = [];

    for (let number = 31; number <= 70; number += 1) {
      if (!numbers.includes(number)) {
        missingNumbers.push(number);
      }
    }

    if (generatedQuestions.length !== 40 || missingNumbers.length > 0) {
      throw new Error(
        `${round}회 고정 시험지 생성 실패: 생성 문항 ${generatedQuestions.length}개, 누락 번호 ${missingNumbers.join(", ") || "없음"}`
      );
    }

    console.info("TOPIK I Reading 회차 고정 시험지 생성 완료:", {
      round: round,
      generated_exam_id: generatedExamId,
      total_questions: generatedQuestions.length,
      first_question: generatedQuestions[0],
      last_question: generatedQuestions[generatedQuestions.length - 1]
    });

    return generatedQuestions;
  }

  function generateQuestionArrayFromAvailableBank(bank, template, options) {
  const workingBank = applyExamGenerationOptionsToBank(bank, options);
  const normalizedOptions = options || {};

  if (normalizedOptions.mode === "round" && normalizedOptions.round) {
    return generateFixedRoundQuestionArrayFromFilteredBank(
      workingBank,
      template,
      normalizedOptions
    );
  }

  const report = buildStructureReport(workingBank, template);

    if (!report.can_generate_full_exam_now) {
      throw new Error(
        "아직 40문항 전체 시험지를 생성할 수 없습니다. TOPIKQuestionGenerator.checkOnly()로 부족한 슬롯을 확인하세요."
      );
    }

    const generatedExamId = report.generated_exam_id;
    const usedBankIds = new Set();
    const generatedQuestions = [];

    normalizeArray(template.single_slots).forEach(function (slot) {
      const candidates = findSingleCandidates(workingBank, slot).filter(function (item) {
        return !usedBankIds.has(item.id);
      });

      const selected = pickRandom(candidates);

      if (!selected) {
        throw new Error(`${slot.slot}번에 사용할 문제가 부족합니다.`);
      }

      usedBankIds.add(selected.id);
      generatedQuestions.push(convertSingleItemToQuestion(selected, slot, generatedExamId));
    });

    normalizeArray(template.slot_groups).forEach(function (group) {
      const setCandidates = findSetCandidates(workingBank, group).filter(function (set) {
        return !usedBankIds.has(set.set_id);
      });

      const selectedSet = pickRandom(setCandidates);

      if (!selectedSet) {
        throw new Error(`${group.slot_group.join("~")}번 공통 지문 세트 후보가 부족합니다.`);
      }

      usedBankIds.add(selectedSet.set_id);

      normalizeArray(selectedSet.items).forEach(function (setItem) {
        generatedQuestions.push(convertPassageSetItemToQuestion(selectedSet, setItem, group, generatedExamId));
      });
    });

    generatedQuestions.sort(function (a, b) {
      return Number(a.question_number) - Number(b.question_number);
    });

    return generatedQuestions;
  }

  async function checkOnly() {
    const bank = await loadJson(BANK_URL);
    const template = await loadJson(TEMPLATE_URL);

    const report = buildStructureReport(bank, template);

    console.group("TOPIK I Reading question-bank / exam-template 점검 결과");
    console.log("전체 생성 가능 여부:", report.can_generate_full_exam_now ? "가능" : "아직 불가능");
    console.log("템플릿 슬롯 수:", report.total_template_slots);
    console.log("기본 오류:", report.basic_errors);
    console.log("후보 부족 단일 슬롯:", report.missing_single_slots);
    console.log("후보 부족 그룹 슬롯:", report.missing_group_slots);
    console.log("전체 보고서:", report);
    console.groupEnd();

    return report;
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

  async function tryGeneratePreview(options) {
    const bank = await loadJson(BANK_URL);
    const template = await loadJson(TEMPLATE_URL);

    const generatedQuestions = generateQuestionArrayFromAvailableBank(bank, template, options);

    console.group("TOPIK I Reading generated question preview");
    console.log("생성 문항 수:", generatedQuestions.length);
    console.log(generatedQuestions);
    console.groupEnd();

    return generatedQuestions;
  }

 async function generateAndDownload(options) {
    const generatedQuestions = await tryGeneratePreview(options);

    if (!Array.isArray(generatedQuestions) || generatedQuestions.length !== 40) {
      throw new Error("생성된 문항 수가 40문항이 아닙니다.");
    }

    downloadJson(generatedQuestions, "generated-reading-questions.json");

    console.log("generated-reading-questions.json 다운로드가 시작되었습니다.");

    return generatedQuestions;
  }

  window.TOPIKQuestionGenerator = {
    checkOnly,
    tryGeneratePreview,
    generateAndDownload
  };
})();