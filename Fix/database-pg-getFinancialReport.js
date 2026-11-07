/* ============================================================
   FINANCIAL REPORT — Corrected Version
   ============================================================
   
   المنطق:
   - Baseline = متوسط آخر 6 شهور (تكلفة المقاولين قبل التوظيف — بدون راتب)
   - Actual = التكلفة الحالية شاملة راتب الموظفين
   - Savings = Baseline - Actual
   
   الصيانة (Maintenance):
     maintActual = contractorWO + partsWO + salaryMaint
   
   التطوير (Development):
     devActual = contractorDev + salaryDev
     ❌ لا partsDev — project.spent شامل كل شي
   
   الإجمالي:
     totalCost = maintActual + devActual + otherPurchases
     ❌ لا إضافة salary مره ثانية
   ============================================================ */

export async function getFinancialReport() {
  const MAINT_BASELINE = 20577;   // متوسط آخر 6 شهور - صيانة
  const DEV_BASELINE = 132551;    // متوسط آخر 6 شهور - تطوير
  const SALARY_MAINT = 2200;      // راتب قسم الصيانة
  const SALARY_DEV = 2200;        // راتب قسم التطوير

  const workOrders = await listWorkOrders();
  const projects = await listProjects();
  const purchases = await listPurchases();

  const months = {};

  function bucket(month) {
    const key = month || "Unknown";
    if (!months[key]) {
      months[key] = {
        month: key,

        // ===== الصيانة (Maintenance) =====
        employeeWOCount: 0,         // عدد WO موظفينا
        contractorWOCount: 0,       // عدد WO المقاولين
        contractorWO: 0,            // تكلفة مقاولين WO (final_cost)
        partsWO: 0,                // قطع مشتراة للصيانة
        salaryMaint: SALARY_MAINT, // راتب قسم الصيانة
        maintActual: 0,            // = contractorWO + partsWO + salaryMaint
        maintSavings: 0,           // = MAINT_BASELINE - maintActual
        maintPct: 0,               // نسبة التوفير

        // ===== التطوير (Development) =====
        internalProjectCount: 0,    // عدد مشاريع داخلية
        contractorProjectCount: 0,  // عدد مشاريع المقاولين
        contractorDev: 0,          // تكلفة مقاولين مشاريع (project.spent)
        salaryDev: SALARY_DEV,     // راتب قسم التطوير
        devActual: 0,             // = contractorDev + salaryDev
        devSavings: 0,             // = DEV_BASELINE - devActual
        devPct: 0,                // نسبة التوفير

        // ===== مشتريات أخرى =====
        otherPurchases: 0,         // مشتريات ما هي صيانة ولا تطوير

        // ===== الإجمالي =====
        totalCost: 0,              // = maintActual + devActual + otherPurchases
        totalSavings: 0,           // = maintSavings + devSavings
        totalSavingsPct: 0,

        // ===== تفصيل المقاولين =====
        contractorBreakdown: {}    // { "Al Jodood": { woCount, woCost, projectCount, projectCost } }
      };
    }
    return months[key];
  }

  // ==========================
  // معالجة أوامر الشغل (Work Orders)
  // ==========================
  for (const w of workOrders) {
    const b = bucket(w.month);
    const cost = Number(w.final_cost || w.contractor_cost || 0);
    const contractorName = String(w.contractor || "").trim();

    // إذا فيه اسم مقاول (غير فاضي وغير company/internal) = شغل مقاول
    if (
      contractorName !== "" &&
      contractorName.toLowerCase() !== "company" &&
      contractorName.toLowerCase() !== "internal"
    ) {
      b.contractorWOCount++;
      b.contractorWO += cost;

      // تفصيل المقاولين
      if (!b.contractorBreakdown[contractorName]) {
        b.contractorBreakdown[contractorName] = {
          woCount: 0, woCost: 0, projectCount: 0, projectCost: 0
        };
      }
      b.contractorBreakdown[contractorName].woCount++;
      b.contractorBreakdown[contractorName].woCost += cost;
    } else {
      // موظفنا (الفاضي أو company)
      b.employeeWOCount++;
      // التكلفة = 0 لأنه مشمول بالراتب
    }
  }

  // ==========================
  // معالجة المشاريع (Projects)
  // ==========================
  for (const p of projects) {
    const b = bucket(p.month);
    const spent = Number(p.spent || 0);
    const contractorName = String(p.contractor || "").trim();

    if (
      contractorName !== "" &&
      contractorName.toLowerCase() !== "company" &&
      contractorName.toLowerCase() !== "internal"
    ) {
      b.contractorProjectCount++;
      b.contractorDev += spent;

      // تفصيل المقاولين
      if (!b.contractorBreakdown[contractorName]) {
        b.contractorBreakdown[contractorName] = {
          woCount: 0, woCost: 0, projectCount: 0, projectCost: 0
        };
      }
      b.contractorBreakdown[contractorName].projectCount++;
      b.contractorBreakdown[contractorName].projectCost += spent;
    } else {
      // مشروع داخلي
      b.internalProjectCount++;
      // التكلفة = 0 لأنه مشمول بالراتب
    }
  }

  // ==========================
  // معالجة المشتريات (Purchases)
  // ==========================
  for (const p of purchases) {
    const b = bucket(p.month);
    const amount = Number(p.total_cost || 0);
    const type = String(p.type || "").toLowerCase();

    // صيانة — قطع وأجزاء
    if (
      type.includes("work") ||
      type.includes("order") ||
      type.includes("maintenance")
    ) {
      b.partsWO += amount;
    }
    // ❌ تطوير — لا نضيفها هنا لأن project.spent شامل كل شي
    // أي مشتريات مشروع منفصلة حطها في otherPurchases
    else if (type.includes("dev") || type.includes("project")) {
      b.otherPurchases += amount; // تجنب ازدواجية الحساب
    }
    // مشتريات أخرى
    else {
      b.otherPurchases += amount;
    }
  }

  // ==========================
  // حساب الإجماليات لكل شهر
  // ==========================
  for (const b of Object.values(months)) {
    // الصيانة: مقاولين + قطع + راتب
    b.maintActual = b.contractorWO + b.partsWO + b.salaryMaint;

    // التطوير: مقاولين + راتب (بدون partsDev)
    b.devActual = b.contractorDev + b.salaryDev;

    // التوفير
    b.maintSavings = MAINT_BASELINE - b.maintActual;
    b.devSavings = DEV_BASELINE - b.devActual;

    // الإجمالي (بدون إضافة الراتب مرة ثانية)
    b.totalCost = b.maintActual + b.devActual + b.otherPurchases;
    b.totalSavings = b.maintSavings + b.devSavings;

    // النسب
    b.maintPct = MAINT_BASELINE
      ? (b.maintSavings / MAINT_BASELINE) * 100
      : 0;
    b.devPct = DEV_BASELINE
      ? (b.devSavings / DEV_BASELINE) * 100
      : 0;

    const baseline = MAINT_BASELINE + DEV_BASELINE;
    b.totalSavingsPct = baseline
      ? (b.totalSavings / baseline) * 100
      : 0;
  }

  // ==========================
  // ترتيب وتجميع النتائج
  // ==========================
  const rows = Object.values(months)
    .sort((a, b) => String(a.month).localeCompare(String(b.month)));

  const sum = field =>
    rows.reduce((s, r) => s + Number(r[field] || 0), 0);

  const maintenanceTotalBaseline = MAINT_BASELINE * rows.length;
  const developmentTotalBaseline = DEV_BASELINE * rows.length;
  const totalSavings = sum("totalSavings");
  const totalBaseline = maintenanceTotalBaseline + developmentTotalBaseline;

  // تجميع تفصيل المقاولين من كل الأشهر
  const mergedBreakdown = {};
  for (const r of rows) {
    for (const [name, info] of Object.entries(r.contractorBreakdown || {})) {
      if (!mergedBreakdown[name]) {
        mergedBreakdown[name] = {
          woCount: 0, woCost: 0, projectCount: 0, projectCost: 0
        };
      }
      mergedBreakdown[name].woCount += info.woCount || 0;
      mergedBreakdown[name].woCost += info.woCost || 0;
      mergedBreakdown[name].projectCount += info.projectCount || 0;
      mergedBreakdown[name].projectCost += info.projectCost || 0;
    }
  }

  return {
    rows,

    grand: {
      monthCount: rows.length,

      // Baseline
      baseline: totalBaseline,
      maintenanceBaseline: MAINT_BASELINE,
      developmentBaseline: DEV_BASELINE,
      maintenanceTotalBaseline,
      developmentTotalBaseline,

      // Actual costs
      contractorWO: sum("contractorWO"),
      partsWO: sum("partsWO"),
      salaryMaint: sum("salaryMaint"),
      maintActual: sum("maintActual"),

      contractorDev: sum("contractorDev"),
      salaryDev: sum("salaryDev"),
      devActual: sum("devActual"),

      otherPurchases: sum("otherPurchases"),
      totalCost: sum("totalCost"),

      // Savings
      maintSavings: sum("maintSavings"),
      devSavings: sum("devSavings"),
      totalSavings,

      maintTotalSavingsPct:
        maintenanceTotalBaseline
          ? (sum("maintSavings") / maintenanceTotalBaseline) * 100
          : 0,
      devTotalSavingsPct:
        developmentTotalBaseline
          ? (sum("devSavings") / developmentTotalBaseline) * 100
          : 0,
      totalSavingsPct:
        totalBaseline
          ? (totalSavings / totalBaseline) * 100
          : 0,

      // Counts
      employeeWOCount: sum("employeeWOCount"),
      contractorWOCount: sum("contractorWOCount"),
      totalWOCount: sum("employeeWOCount") + sum("contractorWOCount"),

      internalProjectCount: sum("internalProjectCount"),
      contractorProjectCount: sum("contractorProjectCount"),
      totalProjectCount:
        sum("internalProjectCount") + sum("contractorProjectCount"),

      // Contractor breakdown
      contractorBreakdown: mergedBreakdown
    }
  };
}
