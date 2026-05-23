"use strict";

/*
  TOPIK I Reading Question Bank Merge Tool for 103회
  version: merge-103-v1

  역할:
  - 기존 question-bank.json을 읽음
  - bank-import-draft-103-complete.json을 읽음
  - 두 파일을 병합한 question-bank-merged-103.json을 다운로드함

  주의:
  - 기존 question-bank.json을 자동으로 덮어쓰지 않음
  - reading-test.js와 자동 연결하지 않음
  - 103회 문제는 공식 정답표 없이 추론 정답이므로 needs_review 표시를 유지함

  사용 방법:
  1) reading-test/index.html을 브라우저에서 연다.
  2) Console에서 이 파일을 불러온다.
  3) TOPIKQuestionBankMerge103.mergeAndDownload() 실행
*/

(function () {
  const CURRENT_BANK_URL = "./question-bank.json";
  const IMPORT_DRAFT_URL = "./bank-import-draft-103-complete.json";
  const OUTPUT_FILE_NAME = "question-bank-merged-103.json";

  function normalizeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  async function loadJson(url) {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`${url} 파일을 불러오지 못했습니다. 상태 코드: ${response.status}`);
    }

    return response.json();
  }

  function cloneJson(data) {
    return JSON.parse(JSON.stringify(data));
  }

  function normalizeId(id, fallback) {
    const value = String(id || fallback || "").trim();

    if (!value) {
      return fallback;
    }

    return value
      .replace(/^DRAFT-103-G/, "QB103-G")
      .replace(/^DRAFT-103-R/, "QB103-R")
      .replace(/^DRAFT-103-/, "QB103-");
  }

  function normalizeSingleItem(item) {
    const copied = cloneJson(item);
    const questionNumber = Number(copied.original_question_number || normalizeArray(copied.target_slots)[0]);

    copied.id = normalizeId(copied.id, `QB103-R${String(questionNumber).padStart(3, "0")}-001`);
    copied.source = copied.source || "TOPIK1_Reading_103회.pdf";
    copied.source_exam = copied.source_exam || "103회";
    copied.source_import_batch = "TOPIK1-READING-103";
    copied.level = copied.level || "TOPIK I";
    copied.section = copied.section || "reading";
    copied.target_slots = normalizeArray(copied.target_slots).map(Number);
    copied.original_question_number = questionNumber;
    copied.needs_review = copied.needs_review !== false;
    copied.needs_answer_review = copied.needs_answer_review !== false;
    copied.answer_source = copied.answer_source || "assistant_provisional";

    return copied;
  }

  function normalizePassageSet(set) {
    const copied = cloneJson(set);
    const firstSlot = Number(normalizeArray(copied.target_slots)[0]);

    copied.set_id = normalizeId(copied.set_id, `QB103-G${String(firstSlot).padStart(3, "0")}-001`);
    copied.source = copied.source || "TOPIK1_Reading_103회.pdf";
    copied.source_exam = copied.source_exam || "103회";
    copied.source_import_batch = "TOPIK1-READING-103";
    copied.level = copied.level || "TOPIK I";
    copied.section = copied.section || "reading";
    copied.target_slots = normalizeArray(copied.target_slots).map(Number);
    copied.needs_review = copied.needs_review !== false;
    copied.needs_answer_review = copied.needs_answer_review !== false;

    copied.items = normalizeArray(copied.items).map(function (item) {
      const itemCopy = cloneJson(item);
      const slot = Number(itemCopy.target_slot);

      itemCopy.item_id = normalizeId(itemCopy.item_id, `QB103-R${String(slot).padStart(3, "0")}-001`);
      itemCopy.target_slot = slot;
      itemCopy.needs_review = itemCopy.needs_review !== false;
      itemCopy.needs_answer_review = itemCopy.needs_answer_review !== false;
      itemCopy.answer_source = itemCopy.answer_source || "assistant_provisional";

      return itemCopy;
    });

    return copied;
  }

  function countBankQuestions(bank) {
    const singleCount = normalizeArray(bank.single_items).length;
    const passageSetItemCount = normalizeArray(bank.passage_sets).reduce(function (sum, set) {
      return sum + normalizeArray(set.items).length;
    }, 0);

    return singleCount + passageSetItemCount;
  }

  function countTotalPoints(bank) {
    const singlePoints = normalizeArray(bank.single_items).reduce(function (sum, item) {
      return sum + (Number(item.points) || 0);
    }, 0);

    const setPoints = normalizeArray(bank.passage_sets).reduce(function (sum, set) {
      return sum + normalizeArray(set.items).reduce(function (itemSum, item) {
        return itemSum + (Number(item.points) || 0);
      }, 0);
    }, 0);

    return singlePoints + setPoints;
  }

  function collectQuestionNumbers(bank) {
    const numbers = [];

    normalizeArray(bank.single_items).forEach(function (item) {
      normalizeArray(item.target_slots).forEach(function (slot) {
        numbers.push(Number(slot));
      });
    });

    normalizeArray(bank.passage_sets).forEach(function (set) {
      normalizeArray(set.items).forEach(function (item) {
        numbers.push(Number(item.target_slot));
      });
    });

    return numbers.filter(Number.isFinite);
  }

  function collectIds(bank) {
    const ids = [];

    normalizeArray(bank.single_items).forEach(function (item) {
      ids.push(item.id);
    });

    normalizeArray(bank.passage_sets).forEach(function (set) {
      ids.push(set.set_id);
      normalizeArray(set.items).forEach(function (item) {
        ids.push(item.item_id);
      });
    });

    return ids.filter(Boolean);
  }

  function findDuplicates(values) {
    const seen = new Set();
    const duplicated = new Set();

    normalizeArray(values).forEach(function (value) {
      if (seen.has(value)) {
        duplicated.add(value);
      } else {
        seen.add(value);
      }
    });

    return Array.from(duplicated);
  }

  function summarizeBank(bank) {
    const singleItems = normalizeArray(bank.single_items);
    const passageSets = normalizeArray(bank.passage_sets);
    const passageSetItems = passageSets.reduce(function (sum, set) {
      return sum + normalizeArray(set.items).length;
    }, 0);

    return {
      bank_version: bank.bank_version || "",
      status: bank.status || "",
      single_items: singleItems.length,
      passage_sets: passageSets.length,
      passage_set_items: passageSetItems,
      total_questions: countBankQuestions(bank),
      total_points: countTotalPoints(bank)
    };
  }

  function buildSlotCandidateSummary(bank) {
    const summary = {};

    for (let number = 31; number <= 70; number += 1) {
      summary[number] = {
        slot: number,
        single_candidate_count: 0,
        passage_set_item_candidate_count: 0,
        total_candidate_count: 0
      };
    }

    normalizeArray(bank.single_items).forEach(function (item) {
      normalizeArray(item.target_slots).forEach(function (slot) {
        const number = Number(slot);
        if (summary[number]) {
          summary[number].single_candidate_count += 1;
          summary[number].total_candidate_count += 1;
        }
      });
    });

    normalizeArray(bank.passage_sets).forEach(function (set) {
      normalizeArray(set.items).forEach(function (item) {
        const number = Number(item.target_slot);
        if (summary[number]) {
          summary[number].passage_set_item_candidate_count += 1;
          summary[number].total_candidate_count += 1;
        }
      });
    });

    return Object.keys(summary).map(function (key) {
      return summary[key];
    });
  }

  function validateImportDraft(draft) {
    const errors = [];

    if (draft.level !== "TOPIK I") {
      errors.push("draft.level은 TOPIK I이어야 합니다.");
    }

    if (draft.section !== "reading") {
      errors.push("draft.section은 reading이어야 합니다.");
    }

    if (!Array.isArray(draft.single_items)) {
      errors.push("draft.single_items 배열이 필요합니다.");
    }

    if (!Array.isArray(draft.passage_sets)) {
      errors.push("draft.passage_sets 배열이 필요합니다.");
    }

    const draftQuestionCount =
      normalizeArray(draft.single_items).length +
      normalizeArray(draft.passage_sets).reduce(function (sum, set) {
        return sum + normalizeArray(set.items).length;
      }, 0);

    if (draftQuestionCount !== 40) {
      errors.push(`103회 draft 문항 수는 40이어야 합니다. 현재 ${draftQuestionCount}개입니다.`);
    }

    const numbers = collectQuestionNumbers({
      single_items: draft.single_items,
      passage_sets: draft.passage_sets
    });

    for (let number = 31; number <= 70; number += 1) {
      if (!numbers.includes(number)) {
        errors.push(`103회 draft에 ${number}번 문항이 없습니다.`);
      }
    }

    const duplicatedNumbers = findDuplicates(numbers);

    if (duplicatedNumbers.length > 0) {
      errors.push(`103회 draft에 중복 문항 번호가 있습니다: ${duplicatedNumbers.join(", ")}`);
    }

    const totalPoints = countTotalPoints({
      single_items: draft.single_items,
      passage_sets: draft.passage_sets
    });

    if (totalPoints !== 100) {
      errors.push(`103회 draft 총 배점은 100이어야 합니다. 현재 ${totalPoints}점입니다.`);
    }

    return errors;
  }

  function mergeQuestionBank(currentBank, importDraft) {
    const importErrors = validateImportDraft(importDraft);

    if (importErrors.length > 0) {
      throw new Error("103회 draft 검증 실패: " + importErrors.join(" / "));
    }

    const current = cloneJson(currentBank);

    const importedSingleItems = normalizeArray(importDraft.single_items).map(normalizeSingleItem);
    const importedPassageSets = normalizeArray(importDraft.passage_sets).map(normalizePassageSet);

    const mergedBank = {
      ...current,
      bank_version: "1.1",
      status: "merged_with_103_draft_needs_review",
      description: "기존 문제은행에 제103회 TOPIK I 읽기 31~70번 draft를 병합한 문제은행입니다. 103회 정답은 공식 정답표 없이 추론한 값이므로 검토가 필요합니다.",
      updated_at: new Date().toISOString(),
      merge_history: normalizeArray(current.merge_history).concat([
        {
          merged_at: new Date().toISOString(),
          source_draft: "bank-import-draft-103-complete.json",
          source_exam: "103회",
          imported_questions: 40,
          answer_key_status: importDraft.answer_key_status || "assistant_provisional_no_official_answer_key",
          needs_review: true
        }
      ]),
      single_items: normalizeArray(current.single_items).concat(importedSingleItems),
      passage_sets: normalizeArray(current.passage_sets).concat(importedPassageSets)
    };

    mergedBank.total_bank_questions = countBankQuestions(mergedBank);

    const allIds = collectIds(mergedBank);
    const duplicateIds = findDuplicates(allIds);

    if (duplicateIds.length > 0) {
      throw new Error("병합 후 중복 ID가 있습니다: " + duplicateIds.join(", "));
    }

    mergedBank.validation_summary = {
      generated_by: "question-bank-merge-103.js",
      checked_at: new Date().toISOString(),
      total_bank_questions: countBankQuestions(mergedBank),
      total_points_across_all_bank_items: countTotalPoints(mergedBank),
      single_items: normalizeArray(mergedBank.single_items).length,
      passage_sets: normalizeArray(mergedBank.passage_sets).length,
      passage_set_items: normalizeArray(mergedBank.passage_sets).reduce(function (sum, set) {
        return sum + normalizeArray(set.items).length;
      }, 0),
      duplicate_ids: duplicateIds,
      slot_candidate_summary: buildSlotCandidateSummary(mergedBank),
      note: "후보 수가 31~70번 각 슬롯별 2개가 되면 2회분 문제은행으로 병합된 상태입니다."
    };

    return mergedBank;
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

  async function checkOnly() {
    const currentBank = await loadJson(CURRENT_BANK_URL);
    const importDraft = await loadJson(IMPORT_DRAFT_URL);

    const importErrors = validateImportDraft(importDraft);
    const previewMergedBank = mergeQuestionBank(currentBank, importDraft);

    const report = {
      current_bank: summarizeBank(currentBank),
      import_draft: summarizeBank(importDraft),
      import_errors: importErrors,
      merged_preview: summarizeBank(previewMergedBank),
      slot_candidate_summary: previewMergedBank.validation_summary.slot_candidate_summary,
      can_merge: importErrors.length === 0
    };

    console.group("TOPIK I Reading 103회 문제은행 병합 점검");
    console.log("병합 가능 여부:", report.can_merge ? "가능" : "불가능");
    console.log("기존 문제은행:", report.current_bank);
    console.log("103회 draft:", report.import_draft);
    console.log("병합 후 예상:", report.merged_preview);
    console.log("슬롯별 후보 수:", report.slot_candidate_summary);
    console.log("전체 보고서:", report);
    console.groupEnd();

    return report;
  }

  async function merge() {
    const currentBank = await loadJson(CURRENT_BANK_URL);
    const importDraft = await loadJson(IMPORT_DRAFT_URL);

    const mergedBank = mergeQuestionBank(currentBank, importDraft);

    console.group("TOPIK I Reading 103회 문제은행 병합 결과");
    console.log("기존 문제은행:", summarizeBank(currentBank));
    console.log("103회 draft:", summarizeBank(importDraft));
    console.log("병합 결과:", summarizeBank(mergedBank));
    console.log("전체 병합 파일:", mergedBank);
    console.groupEnd();

    return mergedBank;
  }

  async function mergeAndDownload() {
    const mergedBank = await merge();

    downloadJson(mergedBank, OUTPUT_FILE_NAME);

    console.log(`${OUTPUT_FILE_NAME} 다운로드가 시작되었습니다.`);

    return mergedBank;
  }

  window.TOPIKQuestionBankMerge103 = {
    checkOnly,
    merge,
    mergeAndDownload
  };
})();
