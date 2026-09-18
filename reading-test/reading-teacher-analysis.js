"use strict";

/*
  TOPIK I Reading - R5-3 teacher-only analysis panel.
  Representative pilot: Round 36 / Q31, Q35, Q49-50, Q53, Q57, Q59.
  Teacher may reveal hint, answer, and answer reason separately.
*/
(function () {
  const VERSION = "reading-teacher-analysis-r5-3-20260919";
  const MANIFEST_URL = "./data/teacher-analysis/analysis-manifest.json";
  const TOOLBAR_ID = "topik1TeacherAnalysisToolbar";
  const DRAWER_ID = "topik1TeacherAnalysisDrawer";

  let manifest = null;
  const roundCache = new Map();
  let lastQuestionKey = "";
  let activeAnalysis = null;

  function bridge() {
    return window.TOPIK1ReadingBridge || null;
  }

  function roleApi() {
    return window.TOPIK1ReadingRoleGate || null;
  }

  function isTeacher() {
    try {
      if (bridge()?.isTeacher) return Boolean(bridge().isTeacher());
      if (roleApi()?.isTeacher) return Boolean(roleApi().isTeacher());
    } catch (error) {}
    return false;
  }

  function currentQuestion() {
    try {
      return bridge()?.getCurrentQuestion?.() || null;
    } catch (error) {
      return null;
    }
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  async function loadJson(url) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response.json();
  }

  async function ensureManifest() {
    if (manifest) return manifest;
    manifest = await loadJson(MANIFEST_URL);
    return manifest;
  }

  async function getRoundData(round) {
    const roundKey = String(round || "").trim();
    if (!roundKey) return null;
    if (roundCache.has(roundKey)) return roundCache.get(roundKey);

    const m = await ensureManifest();
    const url = m?.round_files?.[roundKey];
    if (!url) return null;

    const data = await loadJson(url);
    roundCache.set(roundKey, data);
    return data;
  }

  async function findAnalysis(question) {
    if (!question) return null;

    const sourceBankId = String(question.source_bank_id || "").trim();
    const sourceRound = String(question.source_round || "").trim();

    if (!sourceBankId || !sourceRound) return null;

    const data = await getRoundData(sourceRound);
    const rawAnalysis = data?.analyses?.[sourceBankId] || null;
    if (!rawAnalysis) return null;

    // Shared-passage hydration keeps long/common passages in one reviewed source.
    const passageRef = String(rawAnalysis.passage_ref || "").trim();
    const sharedPassage = passageRef ? data?.passages?.[passageRef] : null;
    if (!sharedPassage) return rawAnalysis;

    return {
      ...rawAnalysis,
      body: {
        ...(rawAnalysis.body || {}),
        passage: rawAnalysis?.body?.passage || sharedPassage
      }
    };
  }

  function ensureUi() {
    const instruction = document.getElementById("questionInstruction");
    const stage = document.getElementById("questionStage");
    if (!instruction || !stage) return false;

    let toolbar = document.getElementById(TOOLBAR_ID);
    if (!toolbar) {
      toolbar = document.createElement("div");
      toolbar.id = TOOLBAR_ID;
      toolbar.innerHTML = `
        <div>
          <div class="teacher-analysis-label">교사 전용 번역·분석</div>
          <div id="topik1TeacherAnalysisStatus">분석 자료 확인 중...</div>
        </div>
        <div class="teacher-analysis-actions">
          <div class="teacher-analysis-action-group teacher-analysis-action-group-main">
            <button id="topik1TeacherBodyAnalysisButton" class="teacher-analysis-button" type="button" disabled>본문 번역·분석</button>
            <button id="topik1TeacherChoiceAnalysisButton" class="teacher-analysis-button" type="button" disabled>선택지 번역·분석</button>
          </div>
          <div class="teacher-analysis-action-group teacher-analysis-action-group-guide">
            <button id="topik1TeacherHintButton" class="teacher-analysis-button teacher-analysis-button-hint" type="button" disabled>힌트</button>
            <button id="topik1TeacherAnswerButton" class="teacher-analysis-button teacher-analysis-button-answer" type="button" disabled>정답 보기</button>
            <button id="topik1TeacherReasonButton" class="teacher-analysis-button teacher-analysis-button-reason" type="button" disabled>정답 이유</button>
          </div>
        </div>`;
      stage.parentNode.insertBefore(toolbar, stage);

      toolbar.querySelector("#topik1TeacherBodyAnalysisButton")
        ?.addEventListener("click", () => openDrawer("body"));
      toolbar.querySelector("#topik1TeacherChoiceAnalysisButton")
        ?.addEventListener("click", () => openDrawer("choices"));
      toolbar.querySelector("#topik1TeacherHintButton")
        ?.addEventListener("click", () => openDrawer("hint"));
      toolbar.querySelector("#topik1TeacherAnswerButton")
        ?.addEventListener("click", () => openDrawer("answer"));
      toolbar.querySelector("#topik1TeacherReasonButton")
        ?.addEventListener("click", () => openDrawer("reason"));
    }

    let drawer = document.getElementById(DRAWER_ID);
    if (!drawer) {
      drawer = document.createElement("aside");
      drawer.id = DRAWER_ID;
      drawer.setAttribute("aria-label", "교사용 번역 분석 패널");
      drawer.innerHTML = `
        <div class="teacher-analysis-drawer-header">
          <div id="topik1TeacherAnalysisDrawerTitle" class="teacher-analysis-drawer-title">교사용 번역·분석</div>
          <button id="topik1TeacherAnalysisClose" class="teacher-analysis-close" type="button">닫기</button>
        </div>
        <div id="topik1TeacherAnalysisDrawerBody" class="teacher-analysis-drawer-body"></div>`;
      document.body.appendChild(drawer);
      drawer.querySelector("#topik1TeacherAnalysisClose")
        ?.addEventListener("click", closeDrawer);
    }

    return true;
  }

  function closeDrawer() {
    document.getElementById(DRAWER_ID)?.classList.remove("is-open");
  }

  function setToolbarState(available, message) {
    const ids = [
      "topik1TeacherBodyAnalysisButton",
      "topik1TeacherChoiceAnalysisButton",
      "topik1TeacherHintButton",
      "topik1TeacherAnswerButton",
      "topik1TeacherReasonButton"
    ];
    const status = document.getElementById("topik1TeacherAnalysisStatus");

    ids.forEach((id) => {
      const button = document.getElementById(id);
      if (button) button.disabled = !available;
    });
    if (status) status.textContent = message || "";
  }

  function renderChunks(chunks) {
    return (Array.isArray(chunks) ? chunks : []).map((chunk) => `
      <div class="teacher-analysis-chunk">
        <div><strong>${esc(chunk.ko)}</strong> <span class="teacher-analysis-arrow">→</span> ${esc(chunk.mn)}</div>
        ${chunk.note_ko ? `<div class="teacher-analysis-note">${esc(chunk.note_ko)}</div>` : ""}
      </div>`).join("");
  }

  function renderBody(analysis) {
    const body = analysis?.body || {};
    const passage = body.passage || {};
    const question = body.question || {};

    const sentenceBlocks = (Array.isArray(passage.sentences) ? passage.sentences : []).map((sentence, index) => `
      <div class="teacher-analysis-section">
        <h3>1️⃣ 문장 분석 ${index + 1}</h3>
        <div class="teacher-analysis-ko">${esc(sentence.ko)}</div>
        <div class="teacher-analysis-mn">${esc(sentence.mn_natural || sentence.mn_structural)}</div>
        <div style="margin-top:8px;">${renderChunks(sentence.chunks)}</div>
      </div>`).join("");

    const grammar = (Array.isArray(body.grammar) ? body.grammar : []).map((item) => `
      <div class="teacher-analysis-list-row">
        <div><strong>${esc(item.form)}</strong> <span class="teacher-analysis-arrow">→</span> ${esc(item.mn_meaning)}</div>
        <div class="teacher-analysis-note">${esc(item.explanation_ko)}</div>
        ${item.example_ko ? `<div class="teacher-analysis-note">예: ${esc(item.example_ko)} → ${esc(item.example_mn)}</div>` : ""}
      </div>`).join("");

    const vocabulary = (Array.isArray(body.vocabulary) ? body.vocabulary : []).map((item) => `
      <div class="teacher-analysis-list-row">
        <div><strong>${esc(item.ko)}</strong> (${esc(item.pos)}) <span class="teacher-analysis-arrow">→</span> ${esc(item.mn)}</div>
        ${item.note_ko ? `<div class="teacher-analysis-note">${esc(item.note_ko)}</div>` : ""}
      </div>`).join("");

    const collocations = (Array.isArray(body.collocations) ? body.collocations : []).map((item) => `
      <div class="teacher-analysis-list-row"><strong>${esc(item.ko)}</strong> <span class="teacher-analysis-arrow">→</span> ${esc(item.mn)}</div>`).join("");

    const expressions = (Array.isArray(body.important_expressions) ? body.important_expressions : []).map((item) => `
      <div class="teacher-analysis-list-row">
        <div><strong>${esc(item.ko)}</strong> <span class="teacher-analysis-arrow">→</span> ${esc(item.mn)}</div>
        ${item.note_ko ? `<div class="teacher-analysis-note">${esc(item.note_ko)}</div>` : ""}
      </div>`).join("");

    return `
      <div class="teacher-analysis-section">
        <h3>한국어 원문</h3>
        <div class="teacher-analysis-ko">${esc(passage.ko)}</div>
      </div>
      <div class="teacher-analysis-section teacher-analysis-structural">
        <h3>한국어 구조를 따른 몽골어 직역</h3>
        <div class="teacher-analysis-mn">${esc(passage.mn_structural)}</div>
      </div>
      <div class="teacher-analysis-section teacher-analysis-natural">
        <h3>자연스러운 몽골어 번역</h3>
        <div class="teacher-analysis-mn">${esc(passage.mn_natural)}</div>
      </div>
      ${sentenceBlocks}
      <div class="teacher-analysis-section">
        <h3>문제 문장</h3>
        <div class="teacher-analysis-ko">${esc(question.ko)}</div>
        <div class="teacher-analysis-mn">구조: ${esc(question.mn_structural)}</div>
        <div class="teacher-analysis-mn">자연 번역: ${esc(question.mn_natural)}</div>
        <div style="margin-top:8px;">${renderChunks(question.chunks)}</div>
      </div>
      <div class="teacher-analysis-section">
        <h3>2️⃣ 문법 설명</h3>
        ${grammar || '<div class="teacher-analysis-empty">문법 자료가 없습니다.</div>'}
      </div>
      <div class="teacher-analysis-section">
        <h3>3️⃣ 어휘</h3>
        ${vocabulary || '<div class="teacher-analysis-empty">어휘 자료가 없습니다.</div>'}
      </div>
      <div class="teacher-analysis-section">
        <h3>연어</h3>
        ${collocations || '<div class="teacher-analysis-empty">연어 자료가 없습니다.</div>'}
      </div>
      <div class="teacher-analysis-section">
        <h3>중요 표현</h3>
        ${expressions || '<div class="teacher-analysis-empty">중요 표현 자료가 없습니다.</div>'}
      </div>`;
  }

  function renderChoices(analysis) {
    const choices = Array.isArray(analysis?.choices) ? analysis.choices : [];
    if (!choices.length) {
      return '<div class="teacher-analysis-empty">선택지 분석 자료가 없습니다.</div>';
    }

    return `
      <div class="teacher-analysis-section">
        <h3>선택지 번역</h3>
        <div class="teacher-analysis-note" style="margin-bottom:8px;">정답 표시는 하지 않습니다. 수업 중 선택지 의미 확인용입니다.</div>
        ${choices.map((item) => `
          <div class="teacher-analysis-choice">
            <div class="teacher-analysis-choice-number">${esc(item.number)}.</div>
            <div><strong>${esc(item.ko)}</strong></div>
            <div>${esc(item.mn)}${item.type ? ` <span class="teacher-analysis-note">(${esc(item.type)})</span>` : ""}</div>
          </div>`).join("")}
      </div>`;
  }

  function renderHint(analysis) {
    const hint = analysis?.teacher_guidance?.hint || null;
    if (!hint) {
      return '<div class="teacher-analysis-empty">힌트 자료가 없습니다.</div>';
    }

    return `
      <div class="teacher-analysis-section teacher-analysis-guidance teacher-analysis-guidance-hint">
        <h3>💡 교사용 힌트</h3>
        <div class="teacher-analysis-ko">${esc(hint.ko)}</div>
        ${hint.mn ? `<div class="teacher-analysis-mn">${esc(hint.mn)}</div>` : ""}
        ${hint.focus ? `<div class="teacher-analysis-guidance-focus">핵심 단서: ${esc(hint.focus)}</div>` : ""}
      </div>`;
  }

  function renderAnswer(analysis) {
    const answer = analysis?.teacher_guidance?.answer || null;
    if (!answer) {
      return '<div class="teacher-analysis-empty">정답 자료가 없습니다.</div>';
    }

    return `
      <div class="teacher-analysis-section teacher-analysis-guidance teacher-analysis-guidance-answer">
        <h3>✅ 정답</h3>
        <div class="teacher-analysis-answer-main">${esc(answer.number)}번 · ${esc(answer.ko)}</div>
        ${answer.mn ? `<div class="teacher-analysis-mn">${esc(answer.mn)}</div>` : ""}
        <div class="teacher-analysis-note" style="margin-top:10px;">정답 이유는 별도의 ‘정답 이유’ 버튼에서 확인합니다.</div>
      </div>`;
  }

  function renderReason(analysis) {
    const reason = analysis?.teacher_guidance?.reason || null;
    if (!reason) {
      return '<div class="teacher-analysis-empty">정답 이유 자료가 없습니다.</div>';
    }

    const evidence = (Array.isArray(reason.evidence) ? reason.evidence : []).map((item) => `
      <div class="teacher-analysis-evidence">
        <div><strong>${esc(item.ko)}</strong></div>
        ${item.mn ? `<div class="teacher-analysis-mn">${esc(item.mn)}</div>` : ""}
      </div>`).join("");

    return `
      <div class="teacher-analysis-section teacher-analysis-guidance teacher-analysis-guidance-reason">
        <h3>🔎 정답인 이유</h3>
        <div class="teacher-analysis-ko">${esc(reason.ko)}</div>
        ${reason.mn ? `<div class="teacher-analysis-mn">${esc(reason.mn)}</div>` : ""}
        ${evidence ? `<div class="teacher-analysis-evidence-title">본문 근거</div>${evidence}` : ""}
      </div>`;
  }

  function openDrawer(mode) {
    // Function-level role guard: students cannot open the panel even by calling the function indirectly.
    if (!isTeacher() || !activeAnalysis) return;

    const drawer = document.getElementById(DRAWER_ID);
    const title = document.getElementById("topik1TeacherAnalysisDrawerTitle");
    const body = document.getElementById("topik1TeacherAnalysisDrawerBody");
    if (!drawer || !title || !body) return;

    const modeInfo = {
      body: { suffix: "본문", render: renderBody },
      choices: { suffix: "선택지", render: renderChoices },
      hint: { suffix: "힌트", render: renderHint },
      answer: { suffix: "정답", render: renderAnswer },
      reason: { suffix: "정답 이유", render: renderReason }
    };
    const selectedMode = modeInfo[mode] || modeInfo.body;

    title.textContent = `${activeAnalysis.analysis_title} · ${selectedMode.suffix}`;
    body.innerHTML = selectedMode.render(activeAnalysis);
    drawer.classList.add("is-open");
  }

  async function refresh() {
    if (!ensureUi()) return;

    if (!isTeacher()) {
      activeAnalysis = null;
      closeDrawer();
      setToolbarState(false, "");
      return;
    }

    const question = currentQuestion();
    if (!question) {
      activeAnalysis = null;
      setToolbarState(false, "현재 문항을 확인할 수 없습니다.");
      return;
    }

    const questionKey = [question.source_round, question.source_bank_id, question.id].join("|");
    if (questionKey === lastQuestionKey && activeAnalysis) return;
    lastQuestionKey = questionKey;

    setToolbarState(false, "분석 자료 확인 중...");

    try {
      activeAnalysis = await findAnalysis(question);
      if (activeAnalysis) {
        setToolbarState(true, `분석 자료 있음 · ${activeAnalysis.source_bank_id}`);
      } else {
        setToolbarState(false, "이 문항의 교사 분석은 아직 준비 중입니다.");
        closeDrawer();
      }
    } catch (error) {
      console.warn("[TeacherAnalysis] load failed:", error);
      activeAnalysis = null;
      setToolbarState(false, "분석 자료를 불러오지 못했습니다.");
      closeDrawer();
    }
  }

  function init() {
    ensureUi();

    const stage = document.getElementById("questionStage");
    if (stage && window.MutationObserver) {
      const observer = new MutationObserver(() => {
        window.setTimeout(refresh, 0);
      });
      observer.observe(stage, { childList: true, subtree: true, characterData: true });
    }

    document.addEventListener("click", function () {
      window.setTimeout(refresh, 20);
    }, true);

    window.addEventListener("pageshow", refresh);
    window.addEventListener("focus", refresh);

    window.setInterval(function () {
      const testScreen = document.getElementById("testScreen");
      if (testScreen && !testScreen.classList.contains("hidden")) refresh();
    }, 500);

    window.TOPIK1ReadingTeacherAnalysis = {
      version: VERSION,
      refresh,
      close: closeDrawer,
      openBody: function () { openDrawer("body"); },
      openChoices: function () { openDrawer("choices"); },
      openHint: function () { openDrawer("hint"); },
      openAnswer: function () { openDrawer("answer"); },
      openReason: function () { openDrawer("reason"); },
      getActiveSourceBankId: function () {
        return activeAnalysis?.source_bank_id || "";
      }
    };

    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
