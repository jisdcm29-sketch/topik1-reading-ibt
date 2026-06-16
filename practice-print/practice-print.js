"use strict";

/*
  TOPIK I Reading Practice Print Tool
  version: step46-8-topik1-practice-print-answer-sheet-and-order-v1

  역할:
  - 실제 업로드된 고정 시험지 exam-manifest.json/data/exams/reading-*.json을 우선 읽는다.
  - 고정 시험지 로드가 어려울 때만 question-bank.json을 예비 자료로 사용한다.
  - 읽기 31~70번 표시 번호 기준으로 유형별 문제지를 만든다.
  - 학생용 문제지, 문제지+정답표, 교사용 정답표만 인쇄한다.
  - 학생 답안 기록표와 57~58번 문장 순서 표시를 학생 배포용으로 정리한다.
  - 시험 실행, 채점, 진단 보고서 로직은 포함하지 않는다.
*/

(function () {
  const QUESTION_BANK_URL = "../reading-test/data/bank/question-bank.json";
  const EXAM_MANIFEST_URL = "../reading-test/data/exam-manifest.json";
  const CIRCLED = ["", "①", "②", "③", "④"];

  const state = {
    bank: null,
    manifest: null,
    records: [],
    selectedRecords: [],
    examLoadWarnings: []
  };

  const elements = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    [
      "startNumberInput",
      "endNumberInput",
      "questionCountInput",
      "allowDuplicateInput",
      "roundList",
      "showSourceInfoInput",
      "statusBox",
      "generatePreviewButton",
      "printStudentButton",
      "printWithAnswerButton",
      "printAnswerOnlyButton",
      "resetButton",
      "printTitle",
      "printMeta",
      "emptyPreview",
      "problemSection",
      "answerSection"
    ].forEach(function (id) {
      elements[id] = byId(id);
    });
  }

  function normalizeArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function getFirstNumber(value) {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        const parsed = Number(value[i]);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function convertToDisplayNumber(numberValue) {
    const n = Number(numberValue);

    if (!Number.isFinite(n)) {
      return null;
    }

    if (n >= 31 && n <= 70) {
      return n;
    }

    if (n >= 1 && n <= 40) {
      return n + 30;
    }

    return n;
  }

  function getDisplayNumber(item) {
    const rawCandidates = [
      item && item.display_question_number,
      item && item.original_question_number,
      item && item.question_number,
      item && item.target_slot,
      getFirstNumber(item && item.target_slots),
      item && item.slot
    ];

    for (let i = 0; i < rawCandidates.length; i += 1) {
      const converted = convertToDisplayNumber(rawCandidates[i]);
      if (Number.isFinite(converted)) {
        return converted;
      }
    }

    return null;
  }

  function normalizeRoundValue(value) {
    const text = String(value || "").trim();

    if (!text) {
      return "";
    }

    const exact = text.match(/^\d{2,4}$/);
    if (exact) {
      return exact[0];
    }

    const withUnit = text.match(/(\d{2,4})회/);
    if (withUnit) {
      return withUnit[1];
    }

    const rPattern = text.match(/R(?:OUND)?[-_ ]?(\d{2,4})/i);
    if (rPattern) {
      return rPattern[1];
    }

    const delimited = text.match(/(?:^|[^A-Za-z0-9])(\d{2,4})(?=[^A-Za-z0-9]|$)/g) || [];

    for (let i = 0; i < delimited.length; i += 1) {
      const digits = delimited[i].replace(/\D/g, "");
      const numberValue = Number(digits);
      if (Number.isFinite(numberValue) && numberValue >= 80) {
        return digits;
      }
    }

    return "";
  }

  function getSourceRoundFromObject(value) {
    const directCandidates = [
      value && value.source_round,
      value && value.round,
      value && value.exam_round,
      value && value.source_exam,
      value && value.source_pdf
    ];

    for (let i = 0; i < directCandidates.length; i += 1) {
      const round = normalizeRoundValue(directCandidates[i]);
      if (round) {
        return round;
      }
    }

    const textCandidates = [
      value && value.id,
      value && value.item_id,
      value && value.set_id,
      value && value.source_bank_id,
      value && value.source_set_id,
      value && value.source
    ].join(" ");

    return normalizeRoundValue(textCandidates);
  }


  function isPseudoQuestionNumberRound(roundValue) {
    const text = normalizeText(roundValue);
    const numeric = Number(text);

    return Boolean(
      /^\d{2,3}$/.test(text) &&
      Number.isFinite(numeric) &&
      numeric >= 31 &&
      numeric <= 70
    );
  }

  function isUsableRound(roundValue) {
    const text = normalizeText(roundValue);
    return Boolean(text && text !== "unknown" && !isPseudoQuestionNumberRound(text));
  }

  function normalizeImageUrl(url) {
    const raw = normalizeText(url).replace(/\\/g, "/");

    if (!raw) {
      return "";
    }

    if (/^(https?:|data:|blob:)/i.test(raw)) {
      return raw;
    }

    const clean = raw.replace(/^\.\//, "");

    if (clean.startsWith("../reading-test/")) {
      return clean;
    }

    if (clean.startsWith("reading-test/")) {
      return "../" + clean;
    }

    if (clean.startsWith("/reading-test/")) {
      return ".." + clean;
    }

    if (clean.startsWith("images/")) {
      return "../reading-test/" + clean;
    }

    if (clean.includes("/images/")) {
      const fileName = clean.split("/images/").pop();
      return "../reading-test/images/" + fileName;
    }

    return clean;
  }

  function getCorrectAnswer(item) {
    const candidates = [
      item && item.correct_answer,
      item && item.answer,
      item && item.correct_position,
      item && item.correct_order
    ];

    for (let i = 0; i < candidates.length; i += 1) {
      const value = candidates[i];

      if (Array.isArray(value) && value.length) {
        return value.join(" → ");
      }

      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return value;
      }
    }

    return "";
  }

  function formatAnswer(value) {
    if (Array.isArray(value)) {
      return value.join(" → ");
    }

    const text = normalizeText(value);

    if (!text) {
      return "";
    }

    const numberValue = Number(text);
    if (Number.isFinite(numberValue) && numberValue >= 1 && numberValue <= 4) {
      return CIRCLED[numberValue];
    }

    return text;
  }

  function getOptionText(option, index) {
    if (option && typeof option === "object") {
      return normalizeText(option.text || option.label || option.value || option.option || "");
    }

    return normalizeText(option);
  }

  function getChoiceLabel(index) {
    return CIRCLED[index + 1] || String(index + 1) + ".";
  }

  function normalizeSentenceLabel(labelValue) {
    return normalizeText(labelValue)
      .replace(/^[\s(（]+/, "")
      .replace(/[\s)）]+$/, "");
  }

  function formatSentenceOrderText(value) {
    if (Array.isArray(value)) {
      return value
        .map(function (part) {
          return normalizeSentenceLabel(part);
        })
        .filter(Boolean)
        .join(" → ");
    }

    return normalizeText(value)
      .replace(/\s*[-–—>]\s*/g, " → ")
      .replace(/\s*→\s*/g, " → ");
  }

  function buildSingleRecord(item, fallbackRound) {
    const displayNumber = getDisplayNumber(item);

    if (!Number.isFinite(displayNumber)) {
      return null;
    }

    const sourceRound = getSourceRoundFromObject(item) || fallbackRound || "unknown";

    return {
      record_id: item.id || item.item_id || `single-${sourceRound}-${displayNumber}`,
      group_id: "",
      kind: "single",
      source_round: sourceRound,
      display_number: displayNumber,
      instruction: item.instruction || "",
      passage: item.passage || "",
      question: item.question || "",
      options: normalizeArray(item.options),
      correct_answer: getCorrectAnswer(item),
      type: item.type || "",
      category: item.category || "",
      diagnostic_area: item.diagnostic_area || "",
      points: Number(item.points) || 0,
      image_url: normalizeImageUrl(item.image_url || item.image || ""),
      sentence_items: item.sentence_items,
      correct_order: item.correct_order,
      order_choice_orders: item.order_choice_orders,
      start_candidate_labels: item.start_candidate_labels,
      insert_sentence: item.insert_sentence || "",
      insert_positions: item.insert_positions,
      insert_markers: item.insert_markers,
      correct_position: item.correct_position || "",
      raw: item
    };
  }

  function buildSetRecords(set, setIndex) {
    const sourceRound = getSourceRoundFromObject(set) || `set${setIndex + 1}`;
    const groupId = set.set_id || set.passage_group_id || `set-${sourceRound}-${setIndex + 1}`;
    const setInstruction = set.instruction || set.group_title || set.passage_group_title || "";
    const setImageUrl = normalizeImageUrl(set.image_url || set.image || "");
    const setPassage = set.passage || set.shared_passage || "";

    return normalizeArray(set.items).map(function (item, itemIndex) {
      const displayNumber = getDisplayNumber(item);
      if (!Number.isFinite(displayNumber)) {
        return null;
      }

      const mergedItem = Object.assign({}, item);

      return {
        record_id: item.item_id || item.id || `${groupId}-item-${itemIndex + 1}`,
        group_id: groupId,
        kind: "set-item",
        source_round: getSourceRoundFromObject(item) || sourceRound,
        display_number: displayNumber,
        instruction: item.instruction || setInstruction,
        group_instruction: setInstruction,
        group_title: set.group_title || set.passage_group_title || setInstruction,
        passage: item.passage || "",
        group_passage: setPassage,
        question: item.question || "",
        options: normalizeArray(item.options),
        correct_answer: getCorrectAnswer(mergedItem),
        type: item.type || "",
        set_type: set.set_type || "",
        category: item.category || "",
        diagnostic_area: item.diagnostic_area || "",
        points: Number(item.points) || 0,
        image_url: normalizeImageUrl(item.image_url || item.image || setImageUrl),
        group_image_url: setImageUrl,
        sentence_items: item.sentence_items,
        correct_order: item.correct_order,
        order_choice_orders: item.order_choice_orders,
        start_candidate_labels: item.start_candidate_labels,
        insert_sentence: item.insert_sentence || "",
        insert_positions: item.insert_positions,
        insert_markers: item.insert_markers,
        correct_position: item.correct_position || "",
        source_set: set,
        raw: item
      };
    }).filter(Boolean);
  }

  function flattenBank(bank) {
    const records = [];

    normalizeArray(bank.single_items).forEach(function (item) {
      const fallbackRound = getSourceRoundFromObject(item) || "";
      const record = buildSingleRecord(item, fallbackRound);
      if (record) {
        records.push(record);
      }
    });

    normalizeArray(bank.passage_sets).forEach(function (set, index) {
      buildSetRecords(set, index).forEach(function (record) {
        records.push(record);
      });
    });

    return records
      .filter(function (record) {
        return record.display_number >= 31 && record.display_number <= 70;
      })
      .sort(compareBySourceThenNumber);
  }

  function compareBySourceThenNumber(a, b) {
    const roundA = Number(a.source_round);
    const roundB = Number(b.source_round);

    if (Number.isFinite(roundA) && Number.isFinite(roundB) && roundA !== roundB) {
      return roundA - roundB;
    }

    const textCompare = String(a.source_round).localeCompare(String(b.source_round), "ko");
    if (textCompare !== 0) {
      return textCompare;
    }

    if (a.display_number !== b.display_number) {
      return a.display_number - b.display_number;
    }

    return String(a.record_id).localeCompare(String(b.record_id), "ko");
  }

  function shuffle(list) {
    const copy = list.slice();

    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }

    return copy;
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`파일을 불러오지 못했습니다. 경로: ${url}, 상태 코드: ${response.status}`);
    }

    return response.json();
  }

  async function loadBank() {
    return fetchJson(QUESTION_BANK_URL);
  }

  async function loadManifest() {
    return fetchJson(EXAM_MANIFEST_URL);
  }

  function getManifestEntries(manifest) {
    if (Array.isArray(manifest)) {
      return manifest;
    }

    if (manifest && Array.isArray(manifest.exams)) {
      return manifest.exams;
    }

    if (manifest && Array.isArray(manifest.items)) {
      return manifest.items;
    }

    if (manifest && Array.isArray(manifest.exam_list)) {
      return manifest.exam_list;
    }

    return [];
  }

  function getRoundFromManifestEntry(entry) {
    return normalizeRoundValue(
      entry && (
        entry.round ||
        entry.source_round ||
        entry.generated_exam_round ||
        entry.value ||
        entry.id ||
        entry.label ||
        entry.file
      )
    );
  }

  function normalizeExamFileUrl(fileValue) {
    const raw = normalizeText(fileValue).replace(/\\/g, "/");

    if (!raw) {
      return "";
    }

    if (/^(https?:|data:|blob:)/i.test(raw)) {
      return raw;
    }

    const clean = raw.replace(/^\.\//, "");

    if (clean.startsWith("../reading-test/")) {
      return clean;
    }

    if (clean.startsWith("reading-test/")) {
      return "../" + clean;
    }

    if (clean.startsWith("/reading-test/")) {
      return ".." + clean;
    }

    if (clean.startsWith("data/")) {
      return "../reading-test/" + clean;
    }

    if (clean.startsWith("exams/")) {
      return "../reading-test/data/" + clean;
    }

    if (/^(reading|level-test)-\d+\.json$/i.test(clean)) {
      return "../reading-test/data/exams/" + clean;
    }

    return "../reading-test/data/exams/" + clean;
  }

  function isFullReadingExamEntry(entry) {
    if (!entry || entry.enabled === false || entry.student_visible === false) {
      return false;
    }

    const file = normalizeText(entry.file || entry.path || entry.url || "");
    const label = normalizeText(entry.label || entry.name || entry.title || "");
    const idText = normalizeText(entry.id || entry.value || "");

    if (/level[-_ ]?test/i.test(file + " " + label + " " + idText)) {
      return false;
    }

    if (/random|랜덤/i.test(label + " " + idText)) {
      return false;
    }

    if (file && !/reading-\d+\.json$/i.test(file)) {
      return false;
    }

    const round = getRoundFromManifestEntry(entry);
    if (!isUsableRound(round)) {
      return false;
    }

    const examType = normalizeText(entry.exam_type || entry.type || "");
    const mode = normalizeText(entry.mode || entry.selection_type || "");

    return Boolean(
      /reading-\d+\.json$/i.test(file) ||
      examType === "full" ||
      mode === "round" ||
      label.includes("40문항") ||
      label.includes("실전시험")
    );
  }

  function getQuestionArrayFromExamData(examData) {
    if (Array.isArray(examData)) {
      return examData;
    }

    if (examData && Array.isArray(examData.items)) {
      return examData.items;
    }

    if (examData && Array.isArray(examData.questions)) {
      return examData.questions;
    }

    if (examData && Array.isArray(examData.data)) {
      return examData.data;
    }

    return [];
  }

  function getPairRangeStart(displayNumber) {
    const n = Number(displayNumber);

    if (!Number.isFinite(n)) {
      return null;
    }

    const pairStarts = [49, 51, 53, 55, 57, 59, 61, 63, 65, 67, 69];

    for (let i = 0; i < pairStarts.length; i += 1) {
      const startNumber = pairStarts[i];
      if (n === startNumber || n === startNumber + 1) {
        return startNumber;
      }
    }

    return null;
  }

  function getSetInstructionFallback(startNumber) {
    if (startNumber === 57) {
      return "[57~58] 다음을 순서에 맞게 배열한 것을 고르십시오.";
    }

    return `[${startNumber}~${startNumber + 1}] 다음을 읽고 물음에 답하십시오.`;
  }

  function buildExamRecord(item, sourceRound, examMeta, index) {
    const displayNumber = getDisplayNumber(item);

    if (!Number.isFinite(displayNumber)) {
      return null;
    }

    const pairStart = getPairRangeStart(displayNumber);
    const explicitGroupId = normalizeText(
      item.passage_group_id ||
      item.group_id ||
      item.set_id ||
      item.source_set_id ||
      ""
    );
    const groupId = explicitGroupId || (pairStart ? `round-${sourceRound}-${pairStart}-${pairStart + 1}` : "");
    const groupInstruction = normalizeText(
      item.group_instruction ||
      item.set_instruction ||
      item.passage_group_title ||
      item.group_title ||
      ""
    ) || (pairStart ? getSetInstructionFallback(pairStart) : "");

    const sharedPassage = normalizeText(
      item.shared_passage ||
      item.group_passage ||
      item.common_passage ||
      ""
    );
    const itemPassage = normalizeText(item.passage || "");
    const groupPassage = groupId ? (sharedPassage || itemPassage) : "";
    const singlePassage = groupId ? "" : (itemPassage || sharedPassage);

    const imageUrl = normalizeImageUrl(
      item.image_url ||
      item.image ||
      item.image_path ||
      item.passage_image ||
      ""
    );
    const groupImageUrl = groupId ? imageUrl : "";

    return {
      record_id: item.id || item.item_id || `reading-${sourceRound}-${displayNumber}-${index + 1}`,
      group_id: groupId,
      kind: groupId ? "exam-set-item" : "exam-single",
      source_round: sourceRound,
      display_number: displayNumber,
      instruction: item.instruction || "",
      group_instruction: groupInstruction,
      group_title: item.group_title || item.passage_group_title || groupInstruction,
      passage: singlePassage,
      group_passage: groupPassage,
      question: item.question || "",
      options: normalizeArray(item.options),
      correct_answer: getCorrectAnswer(item),
      type: item.type || "",
      set_type: item.set_type || "",
      category: item.category || "",
      diagnostic_area: item.diagnostic_area || "",
      points: Number(item.points) || 0,
      image_url: imageUrl,
      group_image_url: groupImageUrl,
      sentence_items: item.sentence_items,
      correct_order: item.correct_order,
      order_choice_orders: item.order_choice_orders,
      start_candidate_labels: item.start_candidate_labels,
      insert_sentence: item.insert_sentence || "",
      insert_positions: item.insert_positions,
      insert_markers: item.insert_markers,
      correct_position: item.correct_position || "",
      source_exam_label: examMeta && examMeta.label,
      raw: item
    };
  }

  function propagateGroupFields(records) {
    const groups = new Map();

    records.forEach(function (record) {
      if (!record.group_id) {
        return;
      }

      if (!groups.has(record.group_id)) {
        groups.set(record.group_id, []);
      }

      groups.get(record.group_id).push(record);
    });

    groups.forEach(function (items) {
      const passageRecord = items.find(function (record) { return normalizeText(record.group_passage); });
      const imageRecord = items.find(function (record) { return normalizeImageUrl(record.group_image_url); });
      const instructionRecord = items.find(function (record) { return normalizeText(record.group_instruction); });
      const passage = passageRecord ? passageRecord.group_passage : "";
      const imageUrl = imageRecord ? imageRecord.group_image_url : "";
      const instruction = instructionRecord ? instructionRecord.group_instruction : "";

      items.forEach(function (record) {
        if (passage && !record.group_passage) {
          record.group_passage = passage;
        }

        if (imageUrl && !record.group_image_url) {
          record.group_image_url = imageUrl;
        }

        if (instruction && !record.group_instruction) {
          record.group_instruction = instruction;
        }
      });
    });

    return records;
  }

  function flattenExamData(examData, sourceRound, examMeta) {
    const questions = getQuestionArrayFromExamData(examData);

    return propagateGroupFields(questions.map(function (item, index) {
      return buildExamRecord(item, sourceRound, examMeta, index);
    }).filter(Boolean)).filter(function (record) {
      return record.display_number >= 31 && record.display_number <= 70;
    });
  }

  async function loadExamRecordsFromManifest() {
    const result = {
      manifest: null,
      records: [],
      warnings: []
    };

    try {
      result.manifest = await loadManifest();
    } catch (error) {
      result.warnings.push("exam-manifest.json을 불러오지 못해 question-bank.json 예비 자료를 사용합니다.");
      return result;
    }

    const entries = getManifestEntries(result.manifest).filter(isFullReadingExamEntry);

    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      const round = getRoundFromManifestEntry(entry);
      const file = entry.file || entry.path || entry.url || `reading-${round}.json`;
      const url = normalizeExamFileUrl(file);

      try {
        const examData = await fetchJson(url);
        const records = flattenExamData(examData, round, {
          label: entry.label || `${round}회 40문항 실전시험`,
          url
        });

        if (records.length) {
          result.records = result.records.concat(records);
        } else {
          result.warnings.push(`${round}회 시험지에서 출력 가능한 31~70번 문항을 찾지 못했습니다.`);
        }
      } catch (error) {
        console.warn(error);
        result.warnings.push(`${round}회 시험지 파일을 불러오지 못했습니다: ${url}`);
      }
    }

    result.records = result.records.sort(compareBySourceThenNumber);
    return result;
  }

  function setStatus(message, isError) {
    if (!elements.statusBox) {
      return;
    }

    elements.statusBox.textContent = message;
    elements.statusBox.style.color = isError ? "#d93025" : "#003f8f";
    elements.statusBox.style.borderColor = isError ? "#ffc4c4" : "#b9d8ff";
    elements.statusBox.style.background = isError ? "#fff1f1" : "#eaf4ff";
  }

  function getAvailableRounds() {
    const rounds = Array.from(new Set(
      state.records
        .map(function (record) { return record.source_round; })
        .filter(isUsableRound)
    ));

    return rounds.sort(function (a, b) {
      const na = Number(a);
      const nb = Number(b);

      if (Number.isFinite(na) && Number.isFinite(nb)) {
        return na - nb;
      }

      return String(a).localeCompare(String(b), "ko");
    });
  }

  function renderRoundList() {
    const rounds = getAvailableRounds();

    if (!elements.roundList) {
      return;
    }

    if (!rounds.length) {
      elements.roundList.innerHTML = "<div>실제 업로드된 시험지 회차 정보를 찾지 못했습니다. 전체 문항을 사용합니다.</div>";
      return;
    }

    const html = [
      '<label class="checkbox-line">',
      '<input id="roundAllCheckbox" type="checkbox" checked />',
      '<strong>전체 회차</strong>',
      '</label>'
    ].concat(rounds.map(function (round) {
      return [
        '<label class="checkbox-line">',
        `<input class="round-checkbox" type="checkbox" value="${escapeHtml(round)}" checked />`,
        `${escapeHtml(round)}회`,
        '</label>'
      ].join("");
    })).join("");

    elements.roundList.innerHTML = html;

    const allCheckbox = byId("roundAllCheckbox");
    const roundCheckboxes = Array.from(document.querySelectorAll(".round-checkbox"));

    if (allCheckbox) {
      allCheckbox.addEventListener("change", function () {
        roundCheckboxes.forEach(function (checkbox) {
          checkbox.checked = allCheckbox.checked;
        });
      });
    }

    roundCheckboxes.forEach(function (checkbox) {
      checkbox.addEventListener("change", function () {
        if (!allCheckbox) {
          return;
        }

        allCheckbox.checked = roundCheckboxes.every(function (item) {
          return item.checked;
        });
      });
    });
  }

  function getSelectedRounds() {
    const checkboxes = Array.from(document.querySelectorAll(".round-checkbox"));

    if (!checkboxes.length) {
      return [];
    }

    return checkboxes
      .filter(function (checkbox) { return checkbox.checked; })
      .map(function (checkbox) { return checkbox.value; });
  }

  function getSelectedPrintOrder() {
    const checked = document.querySelector('input[name="printOrder"]:checked');
    return checked ? checked.value : "source";
  }

  function getSelectionOptions() {
    let start = Number(elements.startNumberInput && elements.startNumberInput.value);
    let end = Number(elements.endNumberInput && elements.endNumberInput.value);
    const count = Math.max(0, Number(elements.questionCountInput && elements.questionCountInput.value) || 0);
    const allowDuplicate = Boolean(elements.allowDuplicateInput && elements.allowDuplicateInput.checked);
    const order = getSelectedPrintOrder();
    const selectedRounds = getSelectedRounds();

    if (!Number.isFinite(start)) {
      start = 31;
    }

    if (!Number.isFinite(end)) {
      end = 70;
    }

    start = Math.max(31, Math.min(70, start));
    end = Math.max(31, Math.min(70, end));

    if (start > end) {
      const temp = start;
      start = end;
      end = temp;
    }

    if (elements.startNumberInput) {
      elements.startNumberInput.value = String(start);
    }

    if (elements.endNumberInput) {
      elements.endNumberInput.value = String(end);
    }

    return {
      start,
      end,
      count,
      allowDuplicate,
      order,
      selectedRounds
    };
  }

  function filterRecords(options) {
    let records = state.records.filter(function (record) {
      const inRange = record.display_number >= options.start && record.display_number <= options.end;
      const inRound = options.selectedRounds.length === 0 || options.selectedRounds.includes(record.source_round);
      return inRange && inRound;
    });

    records = options.order === "random" ? shuffle(records) : records.sort(compareBySourceThenNumber);

    if (options.count > 0) {
      if (records.length >= options.count) {
        records = records.slice(0, options.count);
      } else if (records.length > 0 && options.allowDuplicate) {
        const extended = records.slice();
        let index = 0;

        while (extended.length < options.count) {
          const cloned = Object.assign({}, records[index % records.length]);
          cloned.record_id = `${cloned.record_id}-dup-${extended.length + 1}`;
          cloned.duplicated = true;
          extended.push(cloned);
          index += 1;
        }

        records = extended;
      }
    }

    return records;
  }

  function makeTitle(options, answerOnly) {
    const rangeText = options.start === options.end
      ? `${options.start}번`
      : `${options.start}~${options.end}번`;

    return answerOnly
      ? `TOPIK I 읽기 원본 ${rangeText} 유형별 정답표`
      : `TOPIK I 읽기 원본 ${rangeText} 유형별 문제지`;
  }

  function getPrintNumber(record, fallbackIndex) {
    const numberValue = Number(record && record.print_number);

    if (Number.isFinite(numberValue) && numberValue > 0) {
      return numberValue;
    }

    const fallback = Number(fallbackIndex);

    if (Number.isFinite(fallback) && fallback > 0) {
      return fallback;
    }

    return record && Number.isFinite(Number(record.display_number))
      ? Number(record.display_number)
      : "";
  }

  function formatPrintQuestionNumber(record, fallbackIndex) {
    const printNumber = getPrintNumber(record, fallbackIndex);
    return printNumber ? `${printNumber}번` : "";
  }

  function formatQuestionLineNumber(record, fallbackIndex) {
    const printNumberText = formatPrintQuestionNumber(record, fallbackIndex);
    return printNumberText ? `[${printNumberText}]` : "[]";
  }

  function formatNumberRange(numbers) {
    const cleanNumbers = normalizeArray(numbers)
      .map(function (numberValue) { return Number(numberValue); })
      .filter(function (numberValue) { return Number.isFinite(numberValue); });

    if (!cleanNumbers.length) {
      return "";
    }

    const min = Math.min.apply(null, cleanNumbers);
    const max = Math.max.apply(null, cleanNumbers);

    return min === max ? `${min}번` : `${min}~${max}번`;
  }

  function assignPrintNumbers(records) {
    /*
      문제지의 실제 표시 순서와 정답표의 '출력 순서'가 반드시 일치해야 한다.
      공통 지문 세트는 한 카드 안에서 함께 표시되므로, 먼저 최종 카드 표시 순서를 만든 뒤
      TOPIK II 출력 도구처럼 1번, 2번, 3번 ... 순서 번호를 부여한다.
    */
    const groups = groupSelectedRecords(records);
    const orderedRecords = [];

    groups.forEach(function (group) {
      group.records.forEach(function (record) {
        orderedRecords.push(record);
      });
    });

    return orderedRecords.map(function (record, index) {
      return Object.assign({}, record, {
        print_number: index + 1
      });
    });
  }

  function renderSourceInfo(record) {
    const sourceClass = elements.showSourceInfoInput && elements.showSourceInfoInput.checked
      ? "source-info"
      : "source-info hide-source";

    const roundText = isUsableRound(record.source_round)
      ? `${record.source_round}회`
      : "회차 미상";

    return `<span class="${sourceClass}">${escapeHtml(roundText)} 원본 ${record.display_number}번</span>`;
  }

  function renderImage(url) {
    const normalizedUrl = normalizeImageUrl(url);

    if (!normalizedUrl) {
      return "";
    }

    return `<img class="question-image" src="${escapeHtml(normalizedUrl)}" alt="문항 자료 이미지" />`;
  }

  function shouldRenderGroupPassageText(passage, imageUrl) {
    /*
      이미지형 공통 지문은 이미지 자체가 원본 지문 역할을 한다.
      같은 내용을 텍스트 박스로 한 번 더 출력하면 63~64번처럼 문항이 다음 페이지로 밀릴 수 있으므로
      이미지가 있는 공통 지문에서는 보조 텍스트 passage를 숨긴다.
    */
    return Boolean(normalizeText(passage) && !normalizeImageUrl(imageUrl));
  }

  function renderOptions(options) {
    const optionList = normalizeArray(options);

    if (!optionList.length) {
      return "";
    }

    return [
      '<div class="options">',
      optionList.map(function (option, index) {
        return `<div class="option-line">${getChoiceLabel(index)} ${escapeHtml(getOptionText(option, index))}</div>`;
      }).join(""),
      '</div>'
    ].join("");
  }

  function renderOrderChoices(record) {
    const orders = record.order_choice_orders;

    if (!orders || typeof orders !== "object") {
      return renderOptions(record.options);
    }

    const keys = Object.keys(orders).sort(function (a, b) {
      const na = Number(a);
      const nb = Number(b);

      if (Number.isFinite(na) && Number.isFinite(nb)) {
        return na - nb;
      }

      return String(a).localeCompare(String(b), "ko");
    });

    if (!keys.length) {
      return renderOptions(record.options);
    }

    return [
      '<div class="options">',
      keys.map(function (key, index) {
        const label = getChoiceLabel(index);
        const value = formatSentenceOrderText(orders[key]);

        return `<div class="option-line">${label} ${escapeHtml(value)}</div>`;
      }).join(""),
      '</div>'
    ].join("");
  }


  function getFallbackSentenceItemsFromText(text) {
    const raw = normalizeText(text);

    if (!raw) {
      return [];
    }

    return raw
      .split(/\r?\n+/)
      .map(function (line) { return normalizeText(line); })
      .filter(function (line) {
        return /^[(（]\s*[가-힣A-Za-z0-9]+\s*[)）]\s*/.test(line);
      });
  }

  function getSentenceOrderItems(record) {
    const explicitItems = normalizeArray(record && record.sentence_items).filter(function (item) {
      if (item && typeof item === "object") {
        return Boolean(normalizeText(item.text || item.sentence || item.value || ""));
      }

      return Boolean(normalizeText(item));
    });

    if (explicitItems.length) {
      return explicitItems;
    }

    /*
      일부 기존 회차는 sentence_items 배열 없이 passage 또는 group_passage에
      (가)~(라) 문장을 넣어 둔 상태다. 문장 순서 문항은 공통 지문 텍스트를 숨기므로,
      이 값을 배열할 문장으로 다시 해석해서 학생용 문제지에 표시한다.
    */
    return getFallbackSentenceItemsFromText(
      (record && record.group_passage) ||
      (record && record.passage) ||
      ""
    );
  }

  function renderSentenceItems(record) {
    const items = getSentenceOrderItems(record);

    if (!items.length) {
      return [
        '<div class="sentence-order-box sentence-order-box-empty">',
        '<strong>배열할 문장</strong><br />',
        '배열할 문장 데이터가 없습니다. 원본 시험지 JSON의 sentence_items 또는 passage 값을 확인하세요.',
        '</div>'
      ].join("");
    }

    const lines = items.map(function (item) {
      if (item && typeof item === "object") {
        const label = normalizeSentenceLabel(item.label || item.key || item.name || "");
        const text = normalizeText(item.text || item.sentence || item.value || "");
        return `${label ? "(" + label + ") " : ""}${text}`;
      }

      const rawText = normalizeText(item);
      const labeledMatch = rawText.match(/^[(（]\s*([^()（）]+?)\s*[)）]\s*(.+)$/);

      if (labeledMatch) {
        const label = normalizeSentenceLabel(labeledMatch[1]);
        const sentence = normalizeText(labeledMatch[2]);
        return `${label ? "(" + label + ") " : ""}${sentence}`;
      }

      return rawText;
    }).filter(Boolean);

    if (!lines.length) {
      return "";
    }

    return [
      '<div class="sentence-order-box">',
      '<strong>배열할 문장</strong><br />',
      lines.map(escapeHtml).join("<br />"),
      '</div>'
    ].join("");
  }

  function renderInsertOptions(record) {
    const positions = normalizeArray(record.insert_positions).length
      ? normalizeArray(record.insert_positions)
      : normalizeArray(record.insert_markers);

    if (!positions.length) {
      return renderOptions(record.options);
    }

    return [
      '<div class="options">',
      positions.map(function (position, index) {
        return `<div class="option-line">${getChoiceLabel(index)} ${escapeHtml(position)}</div>`;
      }).join(""),
      '</div>'
    ].join("");
  }

  function renderQuestionBlock(record, inSet) {
    const question = normalizeText(record.question);
    const passage = normalizeText(record.passage);
    const groupPassage = normalizeText(record.group_passage);
    const shouldShowPassage = !inSet && passage && passage !== question;
    const isSentenceOrder = record.type === "sentence_order";
    const isSentenceInsert = record.type === "sentence_insert";
    const questionText = question || (passage && !shouldShowPassage ? passage : "");

    const parts = [];
    const itemClass = isSentenceOrder ? "item-block sentence-order-item" : "item-block";

    parts.push(`<div class="${itemClass}">`);

    if (!inSet) {
      parts.push(`<div class="problem-header"><span>${escapeHtml(formatPrintQuestionNumber(record))}</span>${renderSourceInfo(record)}</div>`);
      parts.push('<div class="problem-body">');
    }

    if (record.instruction && !inSet) {
      parts.push(`<p class="instruction">${escapeHtml(record.instruction)}</p>`);
    }

    if (shouldShowPassage) {
      parts.push(`<div class="passage-box">${escapeHtml(passage)}</div>`);
    }

    parts.push(renderImage(!inSet ? record.image_url : ""));

    if (isSentenceOrder) {
      parts.push(renderSentenceItems(record));
      parts.push(`<div class="question-line"><span class="question-number">${escapeHtml(formatQuestionLineNumber(record))}</span> ${escapeHtml(questionText || "다음을 순서에 맞게 배열한 것을 고르십시오.")}</div>`);
      parts.push(renderOrderChoices(record));
    } else if (isSentenceInsert) {
      if (record.insert_sentence) {
        parts.push(`<div class="insert-box">${escapeHtml(record.insert_sentence)}</div>`);
      }
      parts.push(`<div class="question-line"><span class="question-number">${escapeHtml(formatQuestionLineNumber(record))}</span> ${escapeHtml(questionText || "다음 문장이 들어갈 곳으로 가장 알맞은 것을 고르십시오.")}</div>`);
      parts.push(renderInsertOptions(record));
    } else {
      parts.push(`<div class="question-line"><span class="question-number">${escapeHtml(formatQuestionLineNumber(record))}</span> ${escapeHtml(questionText)}</div>`);
      parts.push(renderOptions(record.options));
    }

    if (!inSet) {
      parts.push('</div>');
    }

    parts.push('</div>');

    return parts.join("");
  }

  function groupSelectedRecords(records) {
    const groups = [];
    const groupMap = new Map();

    records.forEach(function (record) {
      if (!record.group_id) {
        groups.push({
          type: "single",
          key: record.record_id,
          records: [record]
        });
        return;
      }

      if (!groupMap.has(record.group_id)) {
        const group = {
          type: "set",
          key: record.group_id,
          records: []
        };
        groupMap.set(record.group_id, group);
        groups.push(group);
      }

      groupMap.get(record.group_id).records.push(record);
    });

    groups.forEach(function (group) {
      group.records.sort(function (a, b) {
        return a.display_number - b.display_number;
      });
    });

    return groups;
  }

  function renderSetGroup(group) {
    const first = group.records[0];
    const printNumbers = group.records.map(function (record) { return getPrintNumber(record); });
    const originalNumbers = group.records.map(function (record) { return record.display_number; });
    const rangeText = formatNumberRange(printNumbers) || formatNumberRange(originalNumbers);
    const originalRangeText = formatNumberRange(originalNumbers) || rangeText;
    const isSentenceOrderSet = group.records.length > 0 && group.records.every(function (record) {
      return record.type === "sentence_order";
    });

    const instruction = first.group_instruction || first.instruction || `[${originalRangeText}] 다음을 읽고 물음에 답하십시오.`;
    const passage = normalizeText(first.group_passage);
    const imageUrl = first.group_image_url || first.image_url;
    const shouldShowPassageText = !isSentenceOrderSet && shouldRenderGroupPassageText(passage, imageUrl);
    const cardClass = isSentenceOrderSet ? "problem-card common-set sentence-order-set" : "problem-card common-set";

    return [
      `<article class="${cardClass}">`,
      `<div class="problem-header"><span>${escapeHtml(rangeText)} 공통 지문</span>${renderSourceInfo(first)}</div>`,
      '<div class="problem-body">',
      instruction ? `<p class="instruction">${escapeHtml(instruction)}</p>` : "",
      renderImage(imageUrl),
      shouldShowPassageText ? `<div class="passage-box">${escapeHtml(passage)}</div>` : "",
      group.records.map(function (record) {
        return renderQuestionBlock(record, true);
      }).join(""),
      '</div>',
      '</article>'
    ].join("");
  }


  function renderStudentAnswerChoiceHead() {
    return [1, 2, 3, 4].map(function (value) {
      return `<th scope="col">${escapeHtml(getChoiceLabel(value - 1))}</th>`;
    }).join("");
  }

  function renderStudentAnswerChoiceCells() {
    return [1, 2, 3, 4].map(function (value) {
      return [
        '<td class="student-answer-choice-cell">',
        `<span class="student-answer-bubble">${escapeHtml(getChoiceLabel(value - 1))}</span>`,
        '</td>'
      ].join("");
    }).join("");
  }

  function chunkList(list, size) {
    const chunks = [];

    for (let index = 0; index < list.length; index += size) {
      chunks.push(list.slice(index, index + size));
    }

    return chunks;
  }

  function makePrintRangeLabel(items) {
    const numbers = items.map(function (item) {
      return getPrintNumber(item.record, item.index + 1);
    }).map(function (value) {
      const numberValue = Number(value);
      return Number.isFinite(numberValue) ? numberValue : null;
    }).filter(function (value) {
      return value !== null;
    });

    if (!numbers.length) {
      return "답안 기록표";
    }

    const min = Math.min.apply(null, numbers);
    const max = Math.max.apply(null, numbers);

    return min === max ? `${min}번 답안 기록표` : `${min}~${max}번 답안 기록표`;
  }

  function renderStudentAnswerTable(items) {
    const rows = items.map(function (item) {
      const record = item.record;
      const printNumber = getPrintNumber(record, item.index + 1);

      return [
        "<tr>",
        `<th scope="row" class="student-answer-number-cell">${escapeHtml(printNumber)}번</th>`,
        renderStudentAnswerChoiceCells(),
        "</tr>"
      ].join("");
    }).join("");

    return [
      '<table class="student-answer-table">',
      '<thead>',
      '<tr>',
      '<th scope="col" class="student-answer-number-head">번호</th>',
      renderStudentAnswerChoiceHead(),
      '</tr>',
      '</thead>',
      `<tbody>${rows}</tbody>`,
      '</table>'
    ].join("");
  }

  function renderStudentAnswerGroup(items, groupIndex) {
    const midpoint = Math.ceil(items.length / 2);
    const leftItems = items.slice(0, midpoint);
    const rightItems = items.slice(midpoint);
    const title = makePrintRangeLabel(items);

    return [
      `<section class="student-answer-group" aria-label="${escapeHtml(title)}">`,
      `<h3 class="student-answer-group-title">${escapeHtml(title)}</h3>`,
      '<div class="student-answer-columns">',
      renderStudentAnswerTable(leftItems),
      rightItems.length ? renderStudentAnswerTable(rightItems) : '<div class="student-answer-table-spacer"></div>',
      '</div>',
      '</section>'
    ].join("");
  }

  function renderStudentAnswerSheet(records) {
    if (!records.length) {
      return "";
    }

    const indexedRecords = records.map(function (record, index) {
      return { record, index };
    });

    const groups = chunkList(indexedRecords, 40).map(function (items, groupIndex) {
      return renderStudentAnswerGroup(items, groupIndex);
    }).join("");

    return [
      '<section class="student-answer-sheet">',
      '<h2 class="answer-title">학생 답안 기록표</h2>',
      '<p class="student-answer-guide">문제를 풀면서 선택한 답에 표시하세요. 40문항 단위로 나누었으며, 교사용 정답표의 출력 순서 번호와 일치합니다.</p>',
      '<div class="student-answer-groups">',
      groups,
      '</div>',
      '</section>'
    ].join("");
  }



  function renderProblemSection(records) {
    const groups = groupSelectedRecords(records);
    const problemHtml = groups.map(function (group) {
      if (group.type === "set") {
        return renderSetGroup(group);
      }

      return `<article class="problem-card">${renderQuestionBlock(group.records[0], false)}</article>`;
    }).join("");

    return problemHtml + renderStudentAnswerSheet(records);
  }

  function renderAnswerSection(records, title) {
    const rows = records.map(function (record, index) {
      const roundText = isUsableRound(record.source_round)
        ? `${record.source_round}회`
        : "미상";

      return [
        "<tr>",
        `<td>${escapeHtml(getPrintNumber(record, index + 1))}</td>`,
        `<td>${escapeHtml(formatAnswer(record.correct_answer))}</td>`,
        `<td>${escapeHtml(roundText)}</td>`,
        `<td>${escapeHtml(record.display_number + "번")}</td>`,
        `<td>${escapeHtml(record.category || record.type || "미분류")}</td>`,
        `<td>${escapeHtml(record.diagnostic_area || "미분류")}</td>`,
        "</tr>"
      ].join("");
    }).join("");

    return [
      `<h2 class="answer-title">${escapeHtml(title)}</h2>`,
      '<table class="answer-table">',
      '<thead><tr><th>출력 순서</th><th>정답</th><th>원본 회차</th><th>원본 번호</th><th>유형</th><th>진단 영역</th></tr></thead>',
      `<tbody>${rows}</tbody>`,
      '</table>'
    ].join("");
  }

  function updatePrintButtons(enabled) {
    [
      elements.printStudentButton,
      elements.printWithAnswerButton,
      elements.printAnswerOnlyButton
    ].forEach(function (button) {
      if (button) {
        button.disabled = !enabled;
      }
    });
  }

  function generatePreview() {
    const options = getSelectionOptions();
    const records = assignPrintNumbers(filterRecords(options));
    state.selectedRecords = records;

    const title = makeTitle(options, false);
    const answerTitle = makeTitle(options, true);

    if (elements.printTitle) {
      elements.printTitle.textContent = title;
    }

    if (elements.printMeta) {
      elements.printMeta.textContent = "";
      elements.printMeta.classList.add("hidden");
      elements.printMeta.setAttribute("aria-hidden", "true");
    }

    if (!records.length) {
      if (elements.emptyPreview) {
        elements.emptyPreview.classList.remove("hidden");
        elements.emptyPreview.innerHTML = "조건에 맞는 문항이 없습니다.<br />범위 또는 회차 선택을 다시 확인하세요.";
      }

      if (elements.problemSection) {
        elements.problemSection.innerHTML = "";
      }

      if (elements.answerSection) {
        elements.answerSection.innerHTML = "";
        elements.answerSection.classList.add("hidden");
      }

      setStatus("조건에 맞는 문항이 없습니다.", true);
      updatePrintButtons(false);
      return;
    }

    if (elements.emptyPreview) {
      elements.emptyPreview.classList.add("hidden");
    }

    if (elements.problemSection) {
      elements.problemSection.innerHTML = renderProblemSection(records);
    }

    if (elements.answerSection) {
      elements.answerSection.innerHTML = renderAnswerSection(records, answerTitle);
      elements.answerSection.classList.remove("hidden");
    }

    setStatus(`${records.length}문항 미리보기를 생성했습니다. PDF 인쇄/저장 버튼을 사용할 수 있습니다.`, false);
    updatePrintButtons(true);
  }

  function printWithMode(mode) {
    if (!state.selectedRecords.length) {
      generatePreview();
    }

    if (!state.selectedRecords.length) {
      return;
    }

    document.body.classList.remove("print-student", "print-with-answers", "print-answer-only");
    document.body.classList.add(mode);

    window.setTimeout(function () {
      window.print();

      window.setTimeout(function () {
        document.body.classList.remove("print-student", "print-with-answers", "print-answer-only");
      }, 250);
    }, 50);
  }

  function resetForm() {
    if (elements.startNumberInput) elements.startNumberInput.value = "31";
    if (elements.endNumberInput) elements.endNumberInput.value = "70";
    if (elements.questionCountInput) elements.questionCountInput.value = "0";
    if (elements.allowDuplicateInput) elements.allowDuplicateInput.checked = false;
    if (elements.showSourceInfoInput) elements.showSourceInfoInput.checked = true;

    const sourceOrder = document.querySelector('input[name="printOrder"][value="source"]');
    if (sourceOrder) {
      sourceOrder.checked = true;
    }

    Array.from(document.querySelectorAll(".round-checkbox")).forEach(function (checkbox) {
      checkbox.checked = true;
    });

    const all = byId("roundAllCheckbox");
    if (all) {
      all.checked = true;
    }

    state.selectedRecords = [];

    if (elements.printTitle) {
      elements.printTitle.textContent = "TOPIK I 읽기 원본 31~70번 유형별 문제지";
    }

    if (elements.printMeta) {
      elements.printMeta.textContent = "";
      elements.printMeta.classList.add("hidden");
      elements.printMeta.setAttribute("aria-hidden", "true");
    }

    if (elements.emptyPreview) {
      elements.emptyPreview.classList.remove("hidden");
      elements.emptyPreview.innerHTML = '왼쪽에서 범위와 회차를 선택한 뒤 <strong>문제지 미리보기 생성</strong>을 누르세요.<br />예: 31~34번 유형만 모으려면 시작 31, 끝 34로 설정합니다.';
    }

    if (elements.problemSection) {
      elements.problemSection.innerHTML = "";
    }

    if (elements.answerSection) {
      elements.answerSection.innerHTML = "";
      elements.answerSection.classList.add("hidden");
    }

    setStatus(`문제은행 ${state.records.length}개 문항을 사용할 수 있습니다.`, false);
    updatePrintButtons(false);
  }

  function bindEvents() {
    if (elements.generatePreviewButton) {
      elements.generatePreviewButton.addEventListener("click", generatePreview);
    }

    if (elements.printStudentButton) {
      elements.printStudentButton.addEventListener("click", function () {
        printWithMode("print-student");
      });
    }

    if (elements.printWithAnswerButton) {
      elements.printWithAnswerButton.addEventListener("click", function () {
        printWithMode("print-with-answers");
      });
    }

    if (elements.printAnswerOnlyButton) {
      elements.printAnswerOnlyButton.addEventListener("click", function () {
        printWithMode("print-answer-only");
      });
    }

    if (elements.resetButton) {
      elements.resetButton.addEventListener("click", resetForm);
    }
  }

  async function init() {
    cacheElements();
    updatePrintButtons(false);
    bindEvents();

    try {
      state.bank = await loadBank();

      const examResult = await loadExamRecordsFromManifest();
      state.manifest = examResult.manifest;
      state.examLoadWarnings = examResult.warnings;

      if (examResult.records.length) {
        state.records = examResult.records;
      } else {
        state.records = flattenBank(state.bank).filter(function (record) {
          return !isPseudoQuestionNumberRound(record.source_round);
        });
      }

      renderRoundList();

      const rounds = getAvailableRounds();
      const sourceLabel = examResult.records.length
        ? "실제 업로드된 고정 시험지"
        : "문제은행 예비 자료";
      const warningText = state.examLoadWarnings.length
        ? ` 경고 ${state.examLoadWarnings.length}건이 있습니다.`
        : "";

      setStatus(`${sourceLabel}를 불러왔습니다. 사용 가능 문항 ${state.records.length}개, 회차 ${rounds.length}개입니다.${warningText}`, false);
    } catch (error) {
      console.error(error);
      setStatus(error.message || "문제지 출력 자료를 불러오는 중 오류가 발생했습니다.", true);

      if (elements.roundList) {
        elements.roundList.textContent = "문제지 출력 자료를 불러오지 못했습니다.";
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
