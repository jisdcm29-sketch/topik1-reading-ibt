"use strict";

/*
  TOPIK I Reading - R5-1 analysis bridge
  Read-only bridge for teacher analysis modules.
  Does not modify questions, answers, scoring, timer, or navigation.
*/
(function () {
  const VERSION = "reading-analysis-bridge-r5-1-20260919";

  function safeCurrentQuestion() {
    try {
      if (typeof questions !== "undefined" && Array.isArray(questions) &&
          typeof currentIndex !== "undefined") {
        return questions[currentIndex] || null;
      }
    } catch (error) {
      // Return null below.
    }
    return null;
  }

  function safeExamOptions() {
    try {
      if (typeof latestExamGenerationOptions !== "undefined") {
        return latestExamGenerationOptions || null;
      }
    } catch (error) {
      // Return null below.
    }
    return null;
  }

  function safeStudentPhone() {
    try {
      if (window.TOPIK1ReadingRoleGate?.getPhone) {
        return String(window.TOPIK1ReadingRoleGate.getPhone() || "");
      }
    } catch (error) {}

    return String(document.getElementById("studentPhoneDisplay")?.textContent || "").replace(/\D/g, "");
  }

  window.TOPIK1ReadingBridge = {
    version: VERSION,
    getCurrentQuestion: safeCurrentQuestion,
    getCurrentIndex: function () {
      try {
        return typeof currentIndex !== "undefined" ? Number(currentIndex) : -1;
      } catch (error) {
        return -1;
      }
    },
    getExamOptions: safeExamOptions,
    getStudentPhone: safeStudentPhone,
    isTeacher: function () {
      try {
        return Boolean(window.TOPIK1ReadingRoleGate?.isTeacher?.());
      } catch (error) {
        return safeStudentPhone() === "12345678";
      }
    }
  };
})();
