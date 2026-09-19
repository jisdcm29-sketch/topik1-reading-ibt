// TOPIK I Reading Result Logger Client - R5-8
// Isolated client-side bridge for Google Sheet logging.
// This file does NOT change scoring, question rendering, diagnosis, role control,
// timer behavior, or question-practice behavior.
(() => {
  "use strict";

  const VERSION = "reading-r5-8-sheet-large-payload-20260919";
  const ENDPOINT = "https://script.google.com/macros/s/AKfycbyefpO9i9lbDfvLEdX9ORltZI2GmoYim3Jo90atlOvI0PMFnu6R8DaaDYwqIxtan4Pb/exec";
  const TEACHER_PHONE = "12345678";
  const QUEUE_KEY = "topik1-reading-result-logger-pending-v1";
  const FLUSH_DELAY_MS = 250;
  const RETRY_INTERVAL_MS = 30000;

  function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function safeText(value) {
    return String(value == null ? "" : value).trim();
  }

  function cloneResult(result) {
    try {
      return JSON.parse(JSON.stringify(result || {}));
    } catch (error) {
      console.warn("[ReadingResultLogger] result clone failed:", error);
      return result || {};
    }
  }

  function buildAttemptId(result) {
    const phone = normalizePhone(result?.student_phone);
    const submittedAt = safeText(result?.submitted_at) || new Date().toISOString();
    const mode = safeText(result?.generated_exam_mode || "unknown");
    const round = safeText(result?.generated_exam_round || "na");
    const label = safeText(result?.generated_exam_label || result?.test_name || "");

    const raw = [phone, submittedAt, mode, round, label].join("|");
    let hash = 2166136261;

    for (let i = 0; i < raw.length; i += 1) {
      hash ^= raw.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    return `READING-WEB-${phone || "NO_PHONE"}-${Math.abs(hash >>> 0).toString(36)}`;
  }

  function loadQueue() {
    try {
      const parsed = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      console.warn("[ReadingResultLogger] queue read failed:", error);
      return [];
    }
  }

  function saveQueue(queue) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue || []));
      return true;
    } catch (error) {
      console.warn("[ReadingResultLogger] queue save failed:", error);
      return false;
    }
  }

  function removeFromQueue(attemptId) {
    const queue = loadQueue().filter((entry) => entry?.attempt_id !== attemptId);
    saveQueue(queue);
  }

  function enqueue(result) {
    const cloned = cloneResult(result);
    const phone = normalizePhone(cloned?.student_phone);

    if (!phone) {
      console.warn("[ReadingResultLogger] skipped: missing student phone.");
      return { queued: false, reason: "missing_phone" };
    }

    if (phone === TEACHER_PHONE) {
      console.info("[ReadingResultLogger] skipped teacher phone.");
      return {
        queued: false,
        skipped: true,
        reason: "teacher_phone"
      };
    }

    const attemptId = buildAttemptId(cloned);
    const queue = loadQueue();

    if (!queue.some((entry) => entry?.attempt_id === attemptId)) {
      queue.push({
        action: "log_result",
        attempt_id: attemptId,
        client_version: VERSION,
        queued_at: new Date().toISOString(),
        result: cloned
      });
      saveQueue(queue);
    }

    window.setTimeout(flushQueue, FLUSH_DELAY_MS);

    console.info("[ReadingResultLogger] queued:", attemptId);

    return {
      queued: true,
      attempt_id: attemptId
    };
  }

  async function sendEntry(entry) {
    const body = new URLSearchParams();
    body.set("payload", JSON.stringify(entry));

    // no-cors is intentional.
    // Do NOT use keepalive here: complete 40-question reading results can exceed
    // the browser keepalive request-body limit and fail before reaching Apps Script.
    // The localStorage queue already protects against navigation/network failures,
    // and server-side attempt_id duplicate protection makes retries safe.
    await fetch(ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      cache: "no-store",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: body.toString()
    });
  }

  let flushing = false;

  async function flushQueue() {
    if (flushing) return;

    if (
      typeof navigator !== "undefined" &&
      navigator.onLine === false
    ) {
      return;
    }

    flushing = true;

    try {
      const queue = loadQueue();

      for (const entry of queue) {
        try {
          await sendEntry(entry);
          removeFromQueue(entry.attempt_id);
          console.info("[ReadingResultLogger] sent:", entry.attempt_id);
        } catch (error) {
          console.warn(
            "[ReadingResultLogger] send deferred:",
            entry?.attempt_id,
            error
          );
          break;
        }
      }
    } finally {
      flushing = false;
    }
  }

  function installDiagnosisSaveHook() {
    const current = window.saveReadingResultForDiagnosis;

    if (typeof current !== "function") {
      console.warn(
        "[ReadingResultLogger] saveReadingResultForDiagnosis is not ready."
      );
      return false;
    }

    if (current.__readingSheetLoggerHookInstalled) {
      return true;
    }

    const original = current;

    function wrappedSaveReadingResultForDiagnosis(result) {
      const output = original.apply(this, arguments);

      try {
        enqueue(result);
      } catch (error) {
        console.warn(
          "[ReadingResultLogger] isolated logging failure:",
          error
        );
      }

      return output;
    }

    Object.defineProperty(
      wrappedSaveReadingResultForDiagnosis,
      "__readingSheetLoggerHookInstalled",
      {
        value: true,
        configurable: false,
        enumerable: false,
        writable: false
      }
    );

    Object.defineProperty(
      wrappedSaveReadingResultForDiagnosis,
      "__readingSheetLoggerOriginal",
      {
        value: original,
        configurable: false,
        enumerable: false,
        writable: false
      }
    );

    window.saveReadingResultForDiagnosis =
      wrappedSaveReadingResultForDiagnosis;

    console.info(
      "[ReadingResultLogger] hook installed:",
      VERSION
    );

    return true;
  }

  function installWithRetry() {
    if (installDiagnosisSaveHook()) return;

    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;

      if (installDiagnosisSaveHook() || tries >= 20) {
        window.clearInterval(timer);
      }
    }, 250);
  }

  function init() {
    installWithRetry();

    window.addEventListener("online", flushQueue);
    window.setTimeout(flushQueue, 1200);
    window.setInterval(flushQueue, RETRY_INTERVAL_MS);
  }

  window.TOPIK1ReadingResultLogger = {
    version: VERSION,
    endpoint: ENDPOINT,
    flush: flushQueue,
    pendingCount: () => loadQueue().length,
    teacherPhone: TEACHER_PHONE,
    enqueueForDebug: enqueue
  };

  init();
})();
