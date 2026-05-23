"use strict";

/*
  TOPIK I Reading Question Bank Merge Tool for 103회

  역할:
  - question-bank.json 읽기
  - bank-import-draft-103-complete.json 읽기
  - 두 파일을 합쳐 question-bank-merged-103.json 다운로드

  주의:
  - 기존 question-bank.json을 자동으로 덮어쓰지 않습니다.
  - 병합 결과 파일만 다운로드합니다.
*/

(function () {
  const BANK_URL = "./question-bank.json";
  const DRAFT_URL = "./bank-import-draft-103-complete.json";

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

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
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

    setTimeout(function () {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 0);
  }

  function countQuestions(bank) {
    const singleCount = normalizeArray(bank.single_items).length;
    const setItemCount = normalizeArray(bank.passage_sets).reduce(function (sum, set) {
      return sum + normalizeArray(set.items).length;
    }, 0);

    return singleCount + setItemCount;
  }

  function countPoints(bank) {
    const singlePoints = normalizeArray(bank.single_items).reduce(function (sum, item) {
      return sum + (Number(item.points) || 0);
    }, 0);

    const setPoints = normalizeArray(bank.passage_sets).reduce(function (sum, set) {
      return sum + normalizeArray(set.items).reduce(function (innerSum, item) {
        return innerSum + (Number(item.points) || 0);
      }, 0);
    }, 0);

    return singlePoints + setPoints;
  }

  function collectQuestionNumbers(bank) {
    const numbers = [];

    normalizeArray(bank.single_items).forEach(function (item) {
      const number =
        Number(item.original_question_number) ||
        Number(normalizeArray(item.target_slots)[0]) ||
        Number(item.question_number);

      if (Number.isFinite(number)) {
        numbers.push(number);
      }
    });

    normalizeArray(bank.passage_sets).forEach(function (set) {
      normalizeArray(set.items).forEach(function (item) {
        const number = Number(item.target_slot) || Number(item.question_number);

        if (Number.isFinite(number)) {
          numbers.push(number);
        }
      });
    });

    return numbers.sort(function (a, b) {
      return a - b;
    });
  }

  function summarizeNumbers(numbers) {
    const missing = [];
    const duplicated = [];

    for (let number = 31; number <= 70; number += 1) {
      if (!numbers.includes(number)) {
        missing.push(number);
      }
    }

    numbers.forEach(function (number, index) {
      if (numbers.indexOf(number) !== index && !duplicated.includes(number)) {
        duplicated.push(number);
      }
    });

    return {
      count: numbers.length,
      missing_question_numbers: missing,
      duplicated_question_numbers: duplicated
    };
  }

  function buildUsedIdSet(bank) {
    const usedIds = new Set();

    normalizeArray(bank.single_items).forEach(function (item) {
      if (item.id) usedIds.add(item.id);
    });

    normalizeArray(bank.passage_sets).forEach(function (set) {
      if (set.set_id) usedIds.add(set.set_id);

      normalizeArray(set.items).forEach(function (item) {
        if (item.item_id) usedIds.add(item.item_id);
      });
    });

    return usedIds;
  }

  function makeUniqueId(id, usedIds, prefix) {
    let base = String(id || "").trim();

    if (!base) {
      base = `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    }

    let candidate = base;
    let count = 2;

    while (usedIds.has(candidate)) {
      candidate = `${base}-${count}`;
      count += 1;
    }

    usedIds.add(candidate);
    return candidate;
  }

  function normalizeDraftSingleItem(item, usedIds) {
    const next = deepClone(item);

    const questionNumber =
      Number(next.original_question_number) ||
      Number(normalizeArray(next.target_slots)[0]) ||
      Number(next.question_number);

    next.id = makeUniqueId(
      next.id || `QB103-R${String(questionNumber).padStart(3, "0")}-001`,
      usedIds,
      "QB103"
    );

    next.source = next.source || "TOPIK1_Reading_103회";
    next.source_exam = next.source_exam || "TOPIK I 103회";
    next.source_pdf = next.source_pdf || "TOPIK1_Reading_103회.pdf";
    next.level = next.level || "TOPIK I";
    next.section = next.section || "reading";

    if (!Array.isArray(next.target_slots) && Number.isFinite(questionNumber)) {
      next.target_slots = [questionNumber];
    }

    if (!next.original_question_number && Number.isFinite(questionNumber)) {
      next.original_question_number = questionNumber;
    }

    next.needs_review = next.needs_review !== false;
    next.answer_source = next.answer_source || "assistant_provisional";

    return next;
  }

  function normalizeDraftPassageSet(set, usedIds) {
    const next = deepClone(set);

    const firstSlot = Number(normalizeArray(next.target_slots)[0]) || 0;

    next.set_id = makeUniqueId(
      next.set_id || `QB103-G${String(firstSlot).padStart(3, "0")}-001`,
      usedIds,
      "QB103"
    );

    next.source = next.source || "TOPIK1_Reading_103회";
    next.source_exam = next.source_exam || "TOPIK I 103회";
    next.source_pdf = next.source_pdf || "TOPIK1_Reading_103회.pdf";
    next.level = next.level || "TOPIK I";
    next.section = next.section || "reading";
    next.needs_review = next.needs_review !== false;

    next.items = normalizeArray(next.items).map(function (item) {
      const itemClone = deepClone(item);
      const questionNumber = Number(itemClone.target_slot) || Number(itemClone.question_number);

      itemClone.item_id = makeUniqueId(
        itemClone.item_id || `QB103-R${String(questionNumber).padStart(3, "0")}-001`,
        usedIds,
        "QB103"
      );

      itemClone.needs_review = itemClone.needs_review !== false;
      itemClone.answer_source = itemClone.answer_source || "assistant_provisional";

      return itemClone;
    });

    return next;
  }

  function validateDraft(draft) {
    const errors = [];

    if (!draft || typeof draft !== "object") {
      errors.push("draft 파일이 객체 형식이 아닙니다.");
      return errors;
    }

    if (!Array.isArray(draft.single_items)) {
      errors.push("draft.single_items 배열이 없습니다.");
    }

    if (!Array.isArray(draft.passage_sets)) {
      errors.push("draft.passage_sets 배열이 없습니다.");
    }

    const numbers = collectQuestionNumbers({
      single_items: normalizeArray(draft.single_items),
      passage_sets: normalizeArray(draft.passage_sets)
    });

    const numberSummary = summarizeNumbers(numbers);

    if (numberSummary.count !== 40) {
      errors.push(`draft 문항 수가 40개가 아닙니다. 현재 ${numberSummary.count}개입니다.`);
    }

    if (numberSummary.missing_question_numbers.length > 0) {
      errors.push(`draft 누락 문항: ${numberSummary.missing_question_numbers.join(", ")}`);
    }

    if (numberSummary.duplicated_question_numbers.length > 0) {
      errors.push(`draft 중복 문항: ${numberSummary.duplicated_question_numbers.join(", ")}`);
    }

    const totalPoints = countPoints({
      single_items: normalizeArray(draft.single_items),
      passage_sets: normalizeArray(draft.passage_sets)
    });

    if (totalPoints !== 100) {
      errors.push(`draft 총 배점이 100점이 아닙니다. 현재 ${totalPoints}점입니다.`);
    }

    return errors;
  }

  function countSlotCandidates(bank) {
    const result = {};

    for (let number = 31; number <= 70; number += 1) {
      result[number] = 0;
    }

    normalizeArray(bank.single_items).forEach(function (item) {
      normalizeArray(item.target_slots).forEach(function (slot) {
        const number = Number(slot);
        if (result[number] !== undefined) {
          result[number] += 1;
        }
      });
    });

    normalizeArray(bank.passage_sets).forEach(function (set) {
      normalizeArray(set.items).forEach(function (item) {
        const number = Number(item.target_slot);
        if (result[number] !== undefined) {
          result[number] += 1;
        }
      });
    });

    return result;
  }

  function summarizeBank(bank) {
    return {
      bank_version: bank.bank_version || "",
      status: bank.status || "",
      single_items: normalizeArray(bank.single_items).length,
      passage_sets: normalizeArray(bank.passage_sets).length,
      passage_set_items: normalizeArray(bank.passage_sets).reduce(function (sum, set) {
        return sum + normalizeArray(set.items).length;
      }, 0),
      total_questions: countQuestions(bank),
      total_points_all_bank_items: countPoints(bank),
      question_number_summary: summarizeNumbers(collectQuestionNumbers(bank)),
      slot_candidate_counts: countSlotCandidates(bank)
    };
  }

  function mergeBanks(baseBank, draft) {
    const merged = deepClone(baseBank);
    const usedIds = buildUsedIdSet(merged);

    merged.single_items = normalizeArray(merged.single_items);
    merged.passage_sets = normalizeArray(merged.passage_sets);

    const draftSingles = normalizeArray(draft.single_items).map(function (item) {
      return normalizeDraftSingleItem(item, usedIds);
    });

    const draftSets = normalizeArray(draft.passage_sets).map(function (set) {
      return normalizeDraftPassageSet(set, usedIds);
    });

    merged.single_items = merged.single_items.concat(draftSingles);
    merged.passage_sets = merged.passage_sets.concat(draftSets);

    merged.bank_version = "1.1";
    merged.status = "merged_with_103_draft_needs_review";
    merged.last_merged_source = "TOPIK1_Reading_103회";
    merged.last_merged_at = new Date().toISOString();
    merged.total_bank_questions = countQuestions(merged);
    merged.slot_candidate_counts = countSlotCandidates(merged);

    merged.merge_history = normalizeArray(merged.merge_history);
    merged.merge_history.push({
      merged_at: merged.last_merged_at,
      source_exam: "TOPIK I 103회",
      source_file: "bank-import-draft-103-complete.json",
      added_single_items: draftSingles.length,
      added_passage_sets: draftSets.length,
      added_passage_set_items: draftSets.reduce(function (sum, set) {
        return sum + normalizeArray(set.items).length;
      }, 0),
      answer_key_status: draft.answer_key_status || "assistant_provisional_no_official_answer_key",
      needs_review: true
    });

    return merged;
  }

  async function checkOnly() {
    const baseBank = await loadJson(BANK_URL);
    const draft = await loadJson(DRAFT_URL);

    const draftErrors = validateDraft(draft);
    const mergedPreview = draftErrors.length === 0 ? mergeBanks(baseBank, draft) : null;

    const result = {
      checked_at: new Date().toISOString(),
      can_merge: draftErrors.length === 0,
      draft_errors: draftErrors,
      base_bank_summary: summarizeBank(baseBank),
      draft_summary: summarizeBank({
        bank_version: draft.draft_version || draft.bank_version || "draft",
        status: draft.draft_status || draft.status || "",
        single_items: normalizeArray(draft.single_items),
        passage_sets: normalizeArray(draft.passage_sets)
      }),
      merged_summary: mergedPreview ? summarizeBank(mergedPreview) : null
    };

    console.group("TOPIK I Reading question-bank 103회 병합 점검");
    console.log("병합 가능 여부:", result.can_merge ? "가능" : "불가능");
    console.log("draft 오류:", result.draft_errors);
    console.log("기존 문제은행 요약:", result.base_bank_summary);
    console.log("103회 draft 요약:", result.draft_summary);
    console.log("병합 후 예상 요약:", result.merged_summary);
    console.groupEnd();

    return result;
  }

  async function mergeAndDownload() {
    const baseBank = await loadJson(BANK_URL);
    const draft = await loadJson(DRAFT_URL);

    const draftErrors = validateDraft(draft);

    if (draftErrors.length > 0) {
      throw new Error(`병합할 수 없습니다: ${draftErrors.join(" / ")}`);
    }

    const merged = mergeBanks(baseBank, draft);

    console.group("TOPIK I Reading question-bank 103회 병합 완료");
    console.log("question-bank-merged-103.json 다운로드가 시작되었습니다.");
    console.log("병합 결과 요약:", summarizeBank(merged));
    console.groupEnd();

    downloadJson(merged, "question-bank-merged-103.json");

    return merged;
  }

  window.TOPIKQuestionBankMerge103 = {
    checkOnly,
    mergeAndDownload
  };
})();