import {
  addMonths,
  addDays,
  isBefore,
  parseISO,
  format,
  differenceInDays,
  startOfMonth,
  endOfMonth,
  getMonth,
  getYear,
  isValid,
} from 'date-fns';

// HELPER: Safety Check for Dates
const safeDate = (d) => {
  if (!d) return null;
  const date = typeof d === 'string' ? parseISO(d) : d;
  return isValid(date) ? date : null;
};

export const logic = {
  // CONFIGURATION
  EXAM_INTERVAL_MONTHS: 6,
  DUE_WARNING_DAYS: 15,
  RETEST_INTERVAL_DAYS_DEFAULT: 7,

  // GENERAL DATE HELPERS
  formatDate(date) {
    const d = safeDate(date);
    return d ? format(d, 'yyyy-MM-dd') : '';
  },

  formatDateDisplay(dateInput) {
    if (!dateInput) return '-';
    try {
      const d = new Date(dateInput);
      // Check if date is strictly valid
      if (isNaN(d.getTime())) return '-';
      return format(d, 'dd/MM/yyyy');
    } catch (e) {
      return '-'; // Return dash instead of "Err" to keep UI clean
    }
  },

  getCurrentMonthRange() {
    const today = new Date();
    return {
      start: startOfMonth(today),
      end: endOfMonth(today),
      month: getMonth(today),
      year: getYear(today),
    };
  },

  // WORKER LOGIC
  calculateNextExamDue(lastExamDateStr) {
    const lastDate = safeDate(lastExamDateStr);
    if (!lastDate) return this.formatDate(new Date());
    return this.formatDate(addMonths(lastDate, this.EXAM_INTERVAL_MONTHS));
  },

  isDueSoon(nextExamDateStr) {
    const nextDate = safeDate(nextExamDateStr);
    if (!nextDate) return true;
    const diff = differenceInDays(nextDate, new Date());
    return diff <= this.DUE_WARNING_DAYS && diff >= 0;
  },

  isOverdue(nextExamDateStr) {
    const nextDate = safeDate(nextExamDateStr);
    if (!nextDate) return true;
    const today = new Date();
    return isBefore(nextDate, today) && differenceInDays(today, nextDate) > 0;
  },

  calculateRetestDate(treatmentStartDateStr, days = 7) {
    const startDate = safeDate(treatmentStartDateStr) || new Date();
    return this.formatDate(addDays(startDate, days));
  },

  recalculateWorkerStatus(exams) {
    // 1. Check if history is empty (e.g. after Batch Delete)
    if (!exams || exams.length === 0) {
      return {
        last_exam_date: null,
        next_exam_due: this.formatDate(new Date()),
        latest_status: null, // [CRITICAL FIX] You MUST set this to null explicitly!
      };
    } // Safe Sort
    const sortedExams = [...exams].sort((a, b) => {
      const dateA = safeDate(a.exam_date) || new Date(0);
      const dateB = safeDate(b.exam_date) || new Date(0);
      return dateB - dateA;
    });

    const lastExam = sortedExams[0];
    const lastValidExam = sortedExams.find(
      (e) => e.decision && ['apte', 'apte_partielle', 'inapte'].includes(e.decision.status)
    );

    let nextDue;
    if (lastValidExam) {
      const status = lastValidExam.decision.status;
      const referenceDate = lastValidExam.decision.date || lastValidExam.exam_date;

      if (status === 'apte') {
        nextDue = this.calculateNextExamDue(referenceDate);
      } else if (['inapte', 'apte_partielle'].includes(status)) {
        nextDue = lastValidExam.treatment?.retest_date
          ? lastValidExam.treatment.retest_date
          : this.calculateRetestDate(referenceDate, 7);
      } else {
        nextDue = this.calculateNextExamDue(referenceDate);
      }
    } else {
      nextDue = this.formatDate(new Date());
    }

    return {
      last_exam_date: lastExam.exam_date,
      next_exam_due: nextDue || this.formatDate(new Date()),
      // [FIX] Save the status string directly to the worker so we don't need to fetch exams later
      latest_status: lastValidExam?.decision?.status || null,
    };
  },

  // --- RESTORED DASHBOARD STATS (CRITICAL FIX) ---
  getDashboardStats(workers, exams) {
    const dueSoon = workers.filter(
      (w) => !w.archived && this.isDueSoon(w.next_exam_due) && !this.isOverdue(w.next_exam_due)
    );
    const overdue = workers.filter((w) => !w.archived && this.isOverdue(w.next_exam_due));
    const activePositive = [];
    const retests = [];

    workers.forEach((w) => {
      if (w.archived) return;
      const workerExams = exams.filter((e) => e.worker_id === w.id);
      // Safe Sort
      workerExams.sort((a, b) => (safeDate(b.exam_date) || 0) - (safeDate(a.exam_date) || 0));

      if (workerExams.length > 0) {
        const lastExam = workerExams[0];
        if (lastExam.lab_result?.result === 'positive') {
          activePositive.push({ worker: w, exam: lastExam });
          if (lastExam.treatment?.retest_date) {
            retests.push({ worker: w, exam: lastExam, date: lastExam.treatment.retest_date });
          }
        }
      }
    });
    // Safe Sort Retests
    retests.sort((a, b) => (safeDate(a.date) || 0) - (safeDate(b.date) || 0));
    return { dueSoon, overdue, activePositive, retests };
  },

  // --- WEAPON LOGIC ---
  isWeaponDueSoon(nextReviewDateStr) {
    const nextDate = safeDate(nextReviewDateStr);
    if (!nextDate) return false;
    const diff = differenceInDays(nextDate, new Date());
    // Updated: 20 days for weapon aptitude
    return diff <= 20 && diff >= 0;
  },

  getWeaponDashboardStats(holders, exams) {
    // "Active" = Status APTE (Valid)
    const active = holders.filter((h) => !h.archived && h.status === 'apte');

    // "Inapte" = Status INAPTE (Any kind)
    const inapte = holders.filter((h) => !h.archived && h.status?.startsWith('inapte'));

    // "A Revoir" (Due Soon)
    // 1. New Agents (Pending)
    // 2. Inaptes Temporaires coming due
    const dueSoon = holders.filter((h) => {
      if (h.archived) return false;
      if (h.status === 'pending') return true; // New agents
      if (
        h.status === 'inapte_temporaire' &&
        (this.isWeaponDueSoon(h.next_review_date) || this.isOverdue(h.next_review_date))
      )
        return true;
      return false;
    });

    // Latest activity (last 10 exams) - SORTED CHRONOLOGICALLY (Newest first)
    const latestExams = [...exams]
      .sort((a, b) => {
        const dateA = safeDate(a.commission_date || a.exam_date) || 0;
        const dateB = safeDate(b.commission_date || b.exam_date) || 0;
        return dateB - dateA;
      })
      .slice(0, 10)
      .map((e) => {
        const holder = holders.find((h) => h.id === e.holder_id);
        return { ...e, holder };
      });

    return { active, inapte, dueSoon, latestExams };
  },

  // WATER ANALYSIS LOGIC
  getDepartmentWaterHistory(departmentId, allAnalyses) {
    return allAnalyses
      .filter((a) => (a.department_id || a.structure_id) === departmentId)
      .sort((a, b) => {
        const dateA = safeDate(a.request_date || a.sample_date) || 0;
        const dateB = safeDate(b.request_date || b.sample_date) || 0;
        return dateB - dateA; // Descending
      });
  },

  getServiceWaterStatus(departmentId, allAnalyses) {
    // [FIX] Use String comparison (YYYY-MM) to match Panel logic exactly
    const currentMonthStr = new Date().toISOString().substring(0, 7); // "2023-10"

    const deptAnalyses = this.getDepartmentWaterHistory(departmentId, allAnalyses);
    const lastActivity = deptAnalyses[0];
    // [ROBUST] Handle missing dates safely: prefer request_date, fallback to sample_date
    const lastDate = lastActivity
      ? lastActivity.request_date || lastActivity.sample_date || null
      : null;

    const currentMonthAnalysis = deptAnalyses.find((analysis) => {
      // [ROBUST] Handle missing dates safely: prefer request_date, fallback to sample_date
      const dateToCheck = analysis.request_date || analysis.sample_date || '';
      if (!dateToCheck) return false;
      return dateToCheck.startsWith(currentMonthStr);
    });

    if (!currentMonthAnalysis) return { status: 'todo', analysis: null, lastDate };

    let status = 'todo';

    // 1. STEP 1: Request made, no sample yet
    if (currentMonthAnalysis.request_date && !currentMonthAnalysis.sample_date) {
      status = 'requested';
    }
    // 2. STEP 2: Sample taken, no result yet
    else if (currentMonthAnalysis.sample_date && !currentMonthAnalysis.result_date) {
      status = 'pending';
    }
    // 3. STEP 3: Result is in
    else if (currentMonthAnalysis.result === 'potable') {
      status = 'ok';
    } else if (currentMonthAnalysis.result === 'non_potable') {
      status = 'alert';
    } else {
      status = 'pending';
    }

    return { status, analysis: currentMonthAnalysis, lastDate };
  },

  getDepartmentsWaterStatus(departments, waterAnalyses) {
    return departments.map((d) => {
      const statusInfo = this.getServiceWaterStatus(d.id, waterAnalyses);
      return {
        ...d,
        waterStatus: statusInfo.status,
        waterAnalysis: statusInfo.analysis,
        lastDate: statusInfo.lastDate,
      };
    });
  },

  getServiceWaterStatusLabel(status) {
    const map = {
      todo: 'À PLANIFIER', // We need to decide a date
      requested: 'DEMANDE ENVOYÉE', // We called the lab, waiting for them to come
      pending: 'EN COURS', // They took the sample, analyzing it now
      ok: 'EAU POTABLE', // Safe
      alert: 'EAU NON POTABLE', // Danger,
    };
    return map[status] || '-';
  },

  getServiceWaterStatusColor(status) {
    const map = {
      todo: '#94a3b8',
      requested: '#3b82f6',
      pending: '#f59e0b',
      ok: '#22c55e',
      alert: '#ef4444',
    };
    return map[status] || '#94a3b8';
  },

  getServiceWaterAnalysisStats(departments, waterAnalyses) {
    const stats = this.getDepartmentsWaterStatus(departments, waterAnalyses);
    const counts = { todo: 0, requested: 0, pending: 0, ok: 0, alert: 0 };
    stats.forEach((s) => {
      if (counts[s.waterStatus] !== undefined) counts[s.waterStatus]++;
    });

    return {
      todo: stats.filter((d) => d.waterStatus === 'todo'),
      requested: stats.filter((d) => d.waterStatus === 'requested'),
      pending: stats.filter((d) => d.waterStatus === 'pending'),
      ok: stats.filter((d) => d.waterStatus === 'ok'),
      alerts: stats.filter((d) => d.waterStatus === 'alert'),
      summary: { total: departments.length, ...counts },
    };
  },
};
