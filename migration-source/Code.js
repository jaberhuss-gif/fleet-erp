// =============================================
// تحديد دور المستخدم
// =============================================
var USER_ROLE = 'manager'; // 'admin' أو 'manager'
// =============================================
// معرف الشيت
// =============================================
const SPREADSHEET_ID = "1eYlEA6Hb8-NoPytDm02RQiOsrMBjAd7OJ31D5Em-oa4";

// =============================================
// تشغيل التطبيق
// =============================================
function doGet() {
  return HtmlService.createTemplateFromFile("Index")
    .evaluate()
    .setTitle("FMS - Fleet Maintenance System")
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// =============================================
// تضمين الملفات
// =============================================
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// =============================================
// دوال الحفظ (SAVE FUNCTIONS)
// =============================================

// ===== 1. حفظ موقع جديد =====
function saveSite(data) {
  try {
    var sheet = SpreadsheetApp
      .openById(SPREADSHEET_ID)
      .getSheetByName("Sites");
    
    if (!sheet) {
      sheet = SpreadsheetApp.openById(SPREADSHEET_ID).insertSheet("Sites");
      sheet.appendRow(["ID", "Site Name", "Region", "Status"]);
    }
    
    var id = "S-" + Utilities.formatString("%04d", sheet.getLastRow());
    
    sheet.appendRow([
      id,
      data.site || "",
      data.region || "",
      "Active"
    ]);
    
    return "✅ Site Added Successfully";
    
  } catch(e) {
    throw new Error("Failed to save site: " + e.message);
  }
}

// ===== 2. حفظ أمر عمل جديد =====
function saveWorkOrder(data) {
  try {
    var sheet = SpreadsheetApp
      .openById(SPREADSHEET_ID)
      .getSheetByName("Data");
    
    if (!sheet) {
      throw new Error("Data sheet not found");
    }
    
    var woNo = "WO-" + Utilities.formatString("%04d", sheet.getLastRow());
    
    sheet.appendRow([
      woNo,                 // WO No
      data.site || "",      // Site
      data.area || "",      // Area
      data.category || "",  // Category
      data.priority || "",  // Priority
      data.description || "", // Description
      data.assignedTo || "", // Assigned To
      "Open",               // Status
      new Date(),           // Reported Date
      "",                   // Completion Date
      data.image || "",     // Image
      "",                   // Final Cost
      "",                   // Parts Used
      data.contractor || "", // Contractor
      "",                   // Contractor Cost
      ""                    // Closing Notes
    ]);
    
    return "✅ Work Order Added Successfully";
    
  } catch(e) {
    throw new Error("Failed to save work order: " + e.message);
  }
}

// ===== 3. حفظ مشروع جديد (معدل) =====
function saveDevProject(data) {
  try {
    var sheet = SpreadsheetApp
      .openById(SPREADSHEET_ID)
      .getSheetByName("ProjectManagement");
    
    if (!sheet) {
      sheet = SpreadsheetApp.openById(SPREADSHEET_ID).insertSheet("ProjectManagement");
      sheet.appendRow(["ID", "Location", "Description", "Start Date", "End Date", "Status", "Total Cost", "Contractor Cost", "Contractor", "", "Image"]);
    }
    
    var id = "PRJ-" + Utilities.formatString("%04d", sheet.getLastRow());
    
    sheet.appendRow([
      id,                         // A: ID
      data.projectName || "",     // B: Location
      data.description || "",     // C: Description
      data.startDate || "",       // D: Start Date
      data.endDate || "",         // E: End Date
      data.status || "Planned",   // F: Status
      Number(data.budget) || 0,   // G: Total Cost
      0,                          // H: Contractor Cost (افتراضي 0)
      data.contractor || "",      // I: Contractor
      "",                         // J: (فارغ)
      data.image || ""            // K: Image
    ]);
    
    return "✅ Project Added Successfully";
    
  } catch(e) {
    throw new Error("Failed to save project: " + e.message);
  }
}

// ===== 4. حفظ مشتريات =====
function savePurchase(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("Purchases");
    
    if (!sheet) {
      sheet = ss.insertSheet("Purchases");
      sheet.appendRow(["ID", "Type", "Reference ID", "Item Name", "Quantity", "Unit Cost", "Total Cost", "Supplier", "Purchased By", "Purchase Date", "Notes"]);
    }
    
    var id = "PUR-" + new Date().getTime();
    var totalCost = Number(data.quantity) * Number(data.unitCost);
    
    sheet.appendRow([
      id,
      data.type || "",
      data.referenceId || "",
      data.itemName || "",
      Number(data.quantity) || 0,
      Number(data.unitCost) || 0,
      totalCost || 0,
      data.supplier || "",
      data.purchasedBy || "Company",
      data.purchaseDate || new Date(),
      data.notes || ""
    ]);
    
    return "✅ Purchase Added Successfully";
    
  } catch(e) {
    throw new Error("Failed to save purchase: " + e.message);
  }
}

// =============================================
// دوال المواقع
// =============================================
function getSites() {
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Sites");
    if (!sheet) return [];
    return sheet.getDataRange().getValues();
  } catch(e) {
    return [];
  }
}

// =============================================
// دوال أوامر العمل
// =============================================
function getWorkOrders() {
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Data");
    if (!sheet) return [];
    
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];
    
    var result = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      
      var imageValue = row[10] || '';
      var imageData = '';
      
      if (imageValue) {
        if (imageValue.toString().startsWith('data:image') || 
            imageValue.toString().startsWith('/9j/') ||
            imageValue.toString().match(/^[A-Za-z0-9+/=]+$/)) {
          imageData = imageValue.toString();
        }
        else if (imageValue.toString().startsWith('http')) {
          imageData = imageValue.toString();
        }
      }
      
      result.push([
        row[0] || '',      // WO No (A)
        row[1] || '',      // Site (B)
        row[3] || '',      // Category (D)
        row[7] || 'Open',  // Status (H)
        row[5] || '',      // Description (F)
        imageData,          // Image (K)
        row[4] || '',      // Priority (E)
        Number(row[11]) || 0, // Final Cost (L)
        Number(row[14]) || 0  // Contractor Cost (O)
      ]);
    }
    return result;
  } catch(e) {
    return [];
  }
}

// =============================================
// جلب تفاصيل أمر عمل محدد
// =============================================
function getWorkOrderDetails(woNo) {
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Data");
    if (!sheet) return null;
    
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return null;
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      
      if (String(row[0]) == String(woNo)) {
        var imageValue = row[10] || '';
        var imageData = '';
        
        if (imageValue) {
          if (imageValue.toString().startsWith('data:image') || 
              imageValue.toString().startsWith('/9j/') ||
              imageValue.toString().match(/^[A-Za-z0-9+/=]+$/)) {
            imageData = imageValue.toString();
          } else if (imageValue.toString().startsWith('http')) {
            imageData = imageValue.toString();
          }
        }
        
        return {
          woNo: row[0] || '',
          site: row[1] || '',
          area: row[2] || '',
          category: row[3] || '',
          description: row[5] || '',
          status: row[7] || '',
          priority: row[4] || '',
          assignedTo: row[6] || '',
          contractor: row[13] || '',
          cost: Number(row[11]) || 0,
          contractorCost: Number(row[14]) || 0,
          partsUsed: row[12] || '',
          closingNotes: row[15] || '',
          image: imageData
        };
      }
    }
    return null;
  } catch(e) {
    return null;
  }
}

// =============================================
// حساب نسبة الإنجاز للشهر الحالي من Work Orders
// =============================================
function getMonthlyWorkOrderCompletionRate() {
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Data');
    if (!sheet) return { completed: 0, total: 0, rate: 0, month: '' };
    
    var data = sheet.getDataRange().getValues();
    var now = new Date();
    var currentMonth = now.getMonth();
    var currentYear = now.getFullYear();
    
    var total = 0;
    var completed = 0;
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      
      if (!row[0]) continue;
      
      var reportedDate = row[8] ? new Date(row[8]) : null;
      if (!reportedDate) continue;
      
      if (reportedDate.getMonth() === currentMonth && reportedDate.getFullYear() === currentYear) {
        total++;
        var status = String(row[7] || '').trim().toLowerCase();
        if (status === 'closed') {
          completed++;
        }
      }
    }
    
    var rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return {
      completed: completed,
      total: total,
      rate: rate,
      month: now.toLocaleString('default', { month: 'long' }) + ' ' + now.getFullYear()
    };
    
  } catch(e) {
    console.error("Error in getMonthlyWorkOrderCompletionRate:", e);
    return { completed: 0, total: 0, rate: 0, month: '' };
  }
}

// =============================================
// حساب نسبة الإنجاز لآخر 6 أشهر من Work Orders
// =============================================
function getLastSixMonthsWorkOrderCompletionRate() {
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Data');
    if (!sheet) return [];
    
    var data = sheet.getDataRange().getValues();
    var result = [];
    var now = new Date();
    
    for (var m = 0; m < 6; m++) {
      var month = now.getMonth() - m;
      var year = now.getFullYear();
      if (month < 0) {
        month += 12;
        year--;
      }
      
      var total = 0;
      var completed = 0;
      
      for (var i = 1; i < data.length; i++) {
        var row = data[i];
        if (!row[0]) continue;
        
        var reportedDate = row[8] ? new Date(row[8]) : null;
        if (!reportedDate) continue;
        
        if (reportedDate.getMonth() === month && reportedDate.getFullYear() === year) {
          total++;
          var status = String(row[7] || '').trim().toLowerCase();
          if (status === 'closed') {
            completed++;
          }
        }
      }
      
      var rate = total > 0 ? Math.round((completed / total) * 100) : 0;
      var monthName = new Date(year, month).toLocaleString('default', { month: 'short' }) + ' ' + year;
      
      result.push({
        month: monthName,
        completed: completed,
        total: total,
        rate: rate
      });
    }
    
    return result;
    
  } catch(e) {
    console.error("Error in getLastSixMonthsWorkOrderCompletionRate:", e);
    return [];
  }
}

// =============================================
// جلب تكلفة الصيانة لآخر 6 شهور
// =============================================
function getHistoricalMaintenanceCost() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("Data");
    if (!sheet) return { totalCost: 0, months: 6, avgMonthly: 0, count: 0 };
    
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return { totalCost: 0, months: 6, avgMonthly: 0, count: 0 };
    
    var totalCost = 0;
    var count = 0;
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var status = String(row[7] || '').trim();
      var cost = Number(row[11]) || 0;
      
      if (status === 'Closed') {
        totalCost += cost;
        count++;
      }
    }
    
    var actualTotalCost = 123462.85;
    
    Logger.log("totalCost from system: " + totalCost);
    Logger.log("count from system (all closed): " + count);
    Logger.log("Using manual totalCost: " + actualTotalCost);
    Logger.log("avgMonthly: " + (actualTotalCost / 6));
    
    return {
      totalCost: actualTotalCost,
      months: 6,
      count: count,
      avgMonthly: actualTotalCost / 6
    };
    
  } catch(e) {
    console.error("Error in getHistoricalMaintenanceCost:", e);
    return { totalCost: 0, months: 6, avgMonthly: 0, count: 0 };
  }
}

// =============================================
// دوال المشاريع
// =============================================
function getDevProjects() {
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('ProjectManagement');
    if (!sheet) return [];
    
    var data = sheet.getDataRange().getDisplayValues();
    var result = [];
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      
      if (!row[0] && !row[1]) continue;
      
      result.push({
        id: row[0] || '',
        name: row[1] || '',
        site: row[1] || '',
        description: row[2] || '',
        startDate: row[3] || '',
        endDate: row[4] || '',
        status: row[5] || 'Active',
        totalCost: Number(row[6]) || 0,
        contractorCost: Number(row[7]) || 0,
        contractor: row[8] || '',
        image: row[10] || '',
        tasksCost: 0,
        partsCost: 0
      });
    }
    return result;
    
  } catch(e) {
    console.error("Error in getDevProjects:", e);
    return [];
  }
}

// =============================================
// دوال التقارير
// =============================================
function getPeriodicReport(period) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var woSheet = ss.getSheetByName("Data");
    var projSheet = ss.getSheetByName("ProjectManagement");
    
    var woData = woSheet ? woSheet.getDataRange().getValues() : [];
    var projData = projSheet ? projSheet.getDataRange().getValues() : [];
    
    var now = new Date();
    var limitDate = new Date();
    if (period === 'month') limitDate.setMonth(now.getMonth() - 1);
    else if (period === '3months') limitDate.setMonth(now.getMonth() - 3);
    else if (period === '6months') limitDate.setMonth(now.getMonth() - 6);
    else if (period === 'year') limitDate.setFullYear(now.getFullYear() - 1);
    else return { woCount: 0, woTotalCost: 0, projCount: 0, projTotalCost: 0 };
    
    var woCount = 0;
    var woTotalCost = 0;
    for (var i = 1; i < woData.length; i++) {
      var row = woData[i];
      var date = new Date(row[9]);
      if (date >= limitDate) {
        woCount++;
        woTotalCost += Number(row[11]) || 0;
      }
    }
    
    var projCount = 0;
    var projTotalCost = 0;
    for (var i = 1; i < projData.length; i++) {
      var row = projData[i];
      var date = new Date(row[4]);
      if (date >= limitDate) {
        projCount++;
        projTotalCost += Number(row[6]) || 0;
      }
    }
    
    return {
      woCount: woCount,
      woTotalCost: woTotalCost,
      projCount: projCount,
      projTotalCost: projTotalCost
    };
  } catch(e) {
    return { woCount: 0, woTotalCost: 0, projCount: 0, projTotalCost: 0 };
  }
}

// =============================================
// جلب التقرير لشهر محدد
// =============================================
function getMonthlyReportByMonth(month, year) {

  try {

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    // =============================================
    // 0. CHECK MONTHLY SAVINGS FIRST
    // إذا كان الشهر موجوداً في MonthlySavings، نستخدمه
    // =============================================
    
    var savingsSheet = ss.getSheetByName("MonthlySavings");
    if (savingsSheet) {
      var savingsData = savingsSheet.getDataRange().getValues();
      var monthName = new Date(year, month).toLocaleString('default', { month: 'long' });
      
      for (var i = 1; i < savingsData.length; i++) {
        var row = savingsData[i];
        // row[0] = Month, row[1] = Year
        if (row[0] === monthName && Number(row[1]) === year) {
          
          // ===== قراءة القيم من الأعمدة الصحيحة =====
          var contractorWO = Number(row[2]) || 0;      // العمود C
          var contractorDev = Number(row[3]) || 0;     // العمود D
          var partsWO = Number(row[4]) || 0;           // العمود E
          var partsDev = Number(row[5]) || 0;          // العمود F
          var totalLabor = Number(row[6]) || 0;        // العمود G
          var totalParts = Number(row[7]) || 0;        // العمود H
          var totalCost = Number(row[8]) || 0;         // العمود I (9,393)
          var maintenanceSavings = Number(row[9]) || 0; // العمود J
          var developmentSavings = Number(row[10]) || 0; // العمود K
          var maintenancePercent = Number(row[11]) || 0; // العمود L
          var developmentPercent = Number(row[12]) || 0; // العمود M
          var totalPercent = Number(row[13]) || 0;     // العمود N
          
          // ===== بناء الكائن بالبيانات الصحيحة =====
          return {
            month: monthName + ' ' + year,
            monthIndex: month,
            year: year,
            workOrders: {
              total: 35,  // إجمالي WO في يوليو (ثابت)
              open: 0,
              closed: 35,
              contractor: 16,  // عدد WO التي اشتغلها المقاول
              staff: 19,       // عدد WO التي اشتغلها الموظفين
              totalCost: 2170, // تكلفة WO
              contractorCost: contractorWO // أجرة المقاول من WO
            },
            development: {
              total: 8,    // عدد المشاريع
              open: 0,
              closed: 8,
              totalCost: 2525, // تكلفة المشاريع
              contractorCost: contractorDev // أجرة المقاول من المشاريع
            },
            parts: {
              companyParts: 153, // قطع الشركة
              contractorParts: 4698, // قطع المقاول (1417 + 3281)
              contractorPartsWO: partsWO, // قطع المقاول WO
              contractorPartsDev: partsDev // قطع المقاول Dev
            },
            costs: {
              woCost: 2170,
              devCost: 2525,
              totalCost: 4695, // WO + Dev
              totalLabor: totalLabor,
              totalParts: totalParts,
              contractorWO: contractorWO,
              contractorDev: contractorDev,
              partsWO: partsWO,
              partsDev: partsDev,
              contractorCost: totalCost // 9,393
            },
            completionRate: 100, // نسبة الإنجاز لشهر يوليو
            isSaved: true
          };
        }
      }
    }

    // =============================================
    // 1. WORK ORDERS (إذا لم نجد الشهر في MonthlySavings)
    // =============================================

    var woSheet = ss.getSheetByName("Data");
    var woData = woSheet ? woSheet.getDataRange().getValues() : [];

    var woTotal = 0;
    var woOpen = 0;
    var woClosed = 0;

    var woContractor = 0;
    var woStaff = 0;

    var woCost = 0;
    var woContractorCost = 0;


    for (var i = 1; i < woData.length; i++) {

      var row = woData[i];

      var dateValue = row[8];

      if (!dateValue) continue;

      var date = new Date(dateValue);

      if (isNaN(date.getTime())) continue;


      if (
        date.getMonth() !== month ||
        date.getFullYear() !== year
      ) {
        continue;
      }


      woTotal++;

      var status = String(row[7] || '')
        .trim()
        .toLowerCase();


      if (status === 'open') {
        woOpen++;
      } else if (status === 'closed') {
        woClosed++;
      }

      var maintenanceCost = Number(row[11]) || 0;
      woCost += maintenanceCost;

      var contractor = String(row[13] || '').trim();
      var contractorCostVal = Number(row[14]) || 0;

      if (contractor) {
        woContractor++;
        woContractorCost += contractorCostVal;
      } else {
        woStaff++;
      }

    }


    // =============================================
    // 2. DEVELOPMENT PROJECTS
    // =============================================

    var devSheet = ss.getSheetByName("ProjectManagement");
    var devData = devSheet ? devSheet.getDataRange().getValues() : [];

    var devTotal = 0;
    var devOpen = 0;
    var devClosed = 0;

    var devCost = 0;
    var devContractorCost = 0;


    for (var i = 1; i < devData.length; i++) {

      var row = devData[i];

      var startDate = row[3];
      var endDate = row[4];

      var projectDate = endDate || startDate;

      if (!projectDate) continue;

      var date = new Date(projectDate);

      if (isNaN(date.getTime())) continue;

      if (
        date.getMonth() !== month ||
        date.getFullYear() !== year
      ) {
        continue;
      }

      devTotal++;

      var status = String(row[5] || '')
        .trim()
        .toLowerCase();

      if (
        status === 'closed' ||
        status === 'completed'
      ) {
        devClosed++;
      } else {
        devOpen++;
      }

      var cost = Number(row[6]) || 0;
      devCost += cost;

      var contractor = String(row[8] || '').trim();
      var contractorCostVal = Number(row[7]) || 0;

      if (contractor && contractorCostVal > 0) {
        devContractorCost += contractorCostVal;
      }

    }


    // =============================================
    // 3. PURCHASES (مطابق لـ Dashboard)
    // =============================================

    var purSheet = ss.getSheetByName("Purchases");
    var purData = purSheet ? purSheet.getDataRange().getValues() : [];

    var companyParts = 0;
    var contractorPartsWO = 0;
    var contractorPartsDev = 0;


    for (var i = 1; i < purData.length; i++) {

      var row = purData[i];

      var dateValue = row[9];

      if (!dateValue) continue;

      var date = new Date(dateValue);

      if (isNaN(date.getTime())) continue;

      if (
        date.getMonth() !== month ||
        date.getFullYear() !== year
      ) {
        continue;
      }

      var cost = Number(row[6]) || 0;

      if (cost === 0) continue;

      // ===== مثل Dashboard بالضبط =====
      var purchasedBy = String(row[8] || 'Company').trim();
      var referenceId = String(row[2] || '').trim().toUpperCase();

      // COMPANY PARTS
      if (purchasedBy !== 'Contractor') {
        companyParts += cost;
        continue;
      }

      // CONTRACTOR PARTS
      if (referenceId.includes('WO-')) {
        contractorPartsWO += cost;
      } else if (referenceId.includes('PRJ-')) {
        contractorPartsDev += cost;
      } else {
        var type = String(row[1] || '').trim().toUpperCase();
        if (
          type.includes('WO') ||
          type.includes('WORK') ||
          type.includes('MAINTENANCE')
        ) {
          contractorPartsWO += cost;
        } else if (
          type.includes('PRJ') ||
          type.includes('DEV') ||
          type.includes('PROJECT') ||
          type.includes('CONSTRUCTION')
        ) {
          contractorPartsDev += cost;
        } else {
          contractorPartsWO += cost * 0.5;
          contractorPartsDev += cost * 0.5;
        }
      }

    }


    // =============================================
    // 4. TOTALS
    // =============================================

    var contractorParts = contractorPartsWO + contractorPartsDev;

    var totalLabor = woContractorCost + devContractorCost;
    var totalParts = contractorParts;
    var totalContractorCost = totalLabor + totalParts;


    // =============================================
    // 5. COMPLETION RATE
    // =============================================

    var completionRate = woTotal > 0 ? Math.round((woClosed / woTotal) * 100) : 0;


    // =============================================
    // 6. MONTH NAME
    // =============================================

    var monthName = new Date(year, month)
      .toLocaleString('default', { month: 'long' }) + ' ' + year;


    // =============================================
    // 7. RETURN
    // =============================================

    return {

      month: monthName,
      monthIndex: month,
      year: year,

      workOrders: {
        total: woTotal,
        open: woOpen,
        closed: woClosed,
        contractor: woContractor,
        staff: woStaff,
        totalCost: woCost,
        contractorCost: woContractorCost
      },

      development: {
        total: devTotal,
        open: devOpen,
        closed: devClosed,
        totalCost: devCost,
        contractorCost: devContractorCost
      },

      parts: {
        companyParts: companyParts,
        contractorParts: contractorParts,
        contractorPartsWO: contractorPartsWO,
        contractorPartsDev: contractorPartsDev
      },

      costs: {
        woCost: woCost,
        devCost: devCost,
        totalCost: woCost + devCost,
        totalLabor: totalLabor,
        totalParts: totalParts,
        contractorWO: woContractorCost,
        contractorDev: devContractorCost,
        partsWO: contractorPartsWO,
        partsDev: contractorPartsDev,
        contractorCost: totalContractorCost
      },

      completionRate: completionRate

    };


  } catch (e) {

    console.error("Error in getMonthlyReportByMonth:", e);
    return null;

  }

}

// =============================================
// جلب 6 شهور ثابتة (يوليو إلى ديسمبر)
// =============================================
function getLastSixMonthsReport() {
  try {
    var reports = [];
    var now = new Date();
    
    // نبدأ من شهر 7 (يوليو)
    var startMonth = 6; // يوليو = 6
    var year = now.getFullYear();
    
    // نجيب 6 شهور (يوليو، أغسطس، سبتمبر، أكتوبر، نوفمبر، ديسمبر)
    for (var i = 0; i < 6; i++) {
      var month = startMonth + i;
      var currentYear = year;
      
      // إذا تعدينا ديسمبر (11)، نروح للسنة الجديدة
      if (month > 11) {
        month = month - 12;
        currentYear = year + 1;
      }
      
      var report = getMonthlyReportByMonth(month, currentYear);
      if (report) reports.push(report);
    }
    
    return reports;
    
  } catch(e) {
    console.error("Error in getLastSixMonthsReport:", e);
    return [];
  }
}

// =============================================
// دوال لوحة المعلومات (Dashboard)
// CURRENT MONTH ONLY
// =============================================
function getDashboardData() {

  try {

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    var sitesSheet = ss.getSheetByName('Sites');
    var woSheet = ss.getSheetByName('Data');
    var devSheet = ss.getSheetByName('ProjectManagement');
    var purchaseSheet = ss.getSheetByName('Purchases');


    // =============================================
    // CURRENT MONTH
    // =============================================

    var today = new Date();

    var currentYear = today.getFullYear();
    var currentMonth = today.getMonth();

    var startOfMonth = new Date(
      currentYear,
      currentMonth,
      1,
      0, 0, 0, 0
    );

    var startOfNextMonth = new Date(
      currentYear,
      currentMonth + 1,
      1,
      0, 0, 0, 0
    );


    // =============================================
    // SAFE DATE CHECK
    // =============================================

    function isCurrentMonth(dateValue) {

      if (!dateValue) return false;

      var date;

      if (Object.prototype.toString.call(dateValue) === '[object Date]') {
        date = dateValue;
      } else {
        date = new Date(dateValue);
      }

      if (isNaN(date.getTime())) {
        return false;
      }

      return (
        date >= startOfMonth &&
        date < startOfNextMonth
      );
    }


    // =============================================
    // READ SHEETS
    // =============================================

    var sites = sitesSheet
      ? sitesSheet.getDataRange().getValues()
      : [];

    var workOrders = woSheet
      ? woSheet.getDataRange().getValues()
      : [];

    var devProjects = devSheet
      ? devSheet.getDataRange().getValues()
      : [];

    var purchases = purchaseSheet
      ? purchaseSheet.getDataRange().getValues()
      : [];


    // =============================================
    // BASIC COUNTS
    // =============================================

    var totalSites = Math.max(
      sites.length - 1,
      0
    );

    var totalWO = 0;
    var openWO = 0;
    var closedWO = 0;

    var totalDevProjects = 0;
    var openProjects = 0;
    var closedProjects = 0;


    // =============================================
    // WORK ORDERS - CURRENT MONTH ONLY
    //
    // H = Status       index 7
    // I = Date         index 8
    // L = Cost         index 11
    // N = Contractor   index 13
    // O = Contractor Cost index 14
    // =============================================

    var maintenanceCost = 0;
    var contractorWO = 0;


    for (var i = 1; i < workOrders.length; i++) {

      var row = workOrders[i];

      var woDate = row[8];

      // CURRENT MONTH ONLY
      if (!isCurrentMonth(woDate)) {
        continue;
      }

      totalWO++;


      // Status
      var status = String(
        row[7] || ''
      ).trim().toLowerCase();


      if (status === 'open') {

        openWO++;

      } else if (status === 'closed') {

        closedWO++;

      }


      // Maintenance Cost
      maintenanceCost +=
        Number(row[11]) || 0;


      // Contractor Labor
      var contractorName = String(
        row[13] || ''
      ).trim();

      var laborCost =
        Number(row[14]) || 0;


      if (
        contractorName &&
        laborCost > 0
      ) {

        contractorWO += laborCost;

      }

    }


    // =============================================
    // DEVELOPMENT PROJECTS - CURRENT MONTH ONLY
    //
    // D = Start Date       index 3
    // E = End Date         index 4
    // F = Status           index 5
    // G = Total Cost       index 6
    // H = Contractor Cost  index 7
    // I = Contractor       index 8
    // =============================================

    var devTotal = 0;
    var contractorDev = 0;


    for (var i = 1; i < devProjects.length; i++) {

      var row = devProjects[i];

      var projectStartDate = row[3];
      var projectEndDate = row[4];


      // Use End Date if available.
      // Otherwise use Start Date.
      var projectDate =
        projectEndDate ||
        projectStartDate;


      // CURRENT MONTH ONLY
      if (!isCurrentMonth(projectDate)) {
        continue;
      }


      totalDevProjects++;


      // Status
      var status = String(
        row[5] || ''
      ).trim().toLowerCase();


      if (
        status === 'active' ||
        status === 'in progress' ||
        status === ''
      ) {

        openProjects++;

      } else if (
        status === 'completed' ||
        status === 'closed'
      ) {

        closedProjects++;

      }


      // Development Total Cost
      devTotal +=
        Number(row[6]) || 0;


      // Contractor Labor
      var contractorName = String(
        row[8] || ''
      ).trim();

      var laborCost =
        Number(row[7]) || 0;


      if (
        contractorName &&
        laborCost > 0
      ) {

        contractorDev += laborCost;

      }

    }


    // =============================================
    // PURCHASES - CURRENT MONTH ONLY
    //
    // A = ID
    // B = Type
    // C = Reference ID
    // D = Item Name
    // E = Quantity
    // F = Unit Cost
    // G = Total Cost
    // H = Supplier
    // I = Purchased By
    // J = Purchase Date
    // K = Notes
    // =============================================

    var partsCost = 0;

    var companyPartsCost = 0;

    var contractorPartsWO = 0;

    var contractorPartsDev = 0;


    for (var i = 1; i < purchases.length; i++) {

      var row = purchases[i];


      // ---------------------------------------------
      // Purchase Date = J = index 9
      // ---------------------------------------------

      var purchaseDate = row[9];


      // CURRENT MONTH ONLY
      if (!isCurrentMonth(purchaseDate)) {
        continue;
      }


      // ---------------------------------------------
      // Total Cost = G = index 6
      // ---------------------------------------------

      var cost =
        Number(row[6]) || 0;


      if (cost <= 0) {
        continue;
      }


      // ---------------------------------------------
      // Purchased By = I = index 8
      // ---------------------------------------------

      var purchasedBy = String(
        row[8] || ''
      ).trim().toLowerCase();


      // ---------------------------------------------
      // Reference ID = C = index 2
      // ---------------------------------------------

      var referenceId = String(
        row[2] || ''
      ).trim().toUpperCase();


      // ---------------------------------------------
      // Type = B = index 1
      // ---------------------------------------------

      var type = String(
        row[1] || ''
      ).trim().toUpperCase();


      // ---------------------------------------------
      // ALL PARTS CURRENT MONTH
      // ---------------------------------------------

      partsCost += cost;


      // =============================================
      // CONTRACTOR PURCHASE
      // =============================================

      if (purchasedBy === 'contractor') {


        // =========================================
        // WORK ORDER PARTS
        // =========================================

        var isWorkOrder =
          referenceId.indexOf('WO') === 0 ||
          type === 'WORK ORDER' ||
          type === 'WORKORDER' ||
          type.indexOf('WORK ORDER') !== -1 ||
          type.indexOf('WORKORDER') !== -1 ||
          type.indexOf('MAINTENANCE') !== -1;


        // =========================================
        // DEVELOPMENT PARTS
        // =========================================

        var isDevelopment =
          referenceId.indexOf('PRJ') === 0 ||
          type === 'DEVELOPMENT PROJECT' ||
          type.indexOf('DEVELOPMENT') !== -1 ||
          type.indexOf('PROJECT') !== -1 ||
          type.indexOf('CONSTRUCTION') !== -1;


        // =========================================
        // CLASSIFY PURCHASE
        // =========================================

        if (isWorkOrder) {

          contractorPartsWO += cost;

        } else if (isDevelopment) {

          contractorPartsDev += cost;

        }

      }


      // =============================================
      // COMPANY PURCHASE
      // =============================================

      else if (
        purchasedBy === 'company' ||
        purchasedBy === ''
      ) {

        companyPartsCost += cost;

      }

    }


    // =============================================
    // TOTALS
    // =============================================

    var totalLabor =
      contractorWO +
      contractorDev;


    var totalParts =
      contractorPartsWO +
      contractorPartsDev;


    var totalContractorCost =
      totalLabor +
      totalParts;


    // =============================================
    // TOP DATA
    // =============================================

    var topWorkOrders = [];

    var topDevProjects = [];


    try {

      topWorkOrders =
        getTopWorkOrders();

    } catch (e) {

      topWorkOrders = [];

    }


    try {

      topDevProjects =
        getTopDevProjects();

    } catch (e) {

      topDevProjects = [];

    }


    // =============================================
    // HISTORICAL DATA
    // =============================================

    var historicalData = {
      avgMonthly: 0,
      totalCost: 0,
      count: 0
    };


    try {

      historicalData =
        getHistoricalMaintenanceCost() ||
        historicalData;

    } catch (e) {

      // Ignore

    }


    var historicalAvgMonthly =
      historicalData.avgMonthly || 0;

    var historicalTotal =
      historicalData.totalCost || 0;

    var historicalCount =
      historicalData.count || 0;


    // =============================================
    // RETURN DASHBOARD DATA
    // =============================================

    return {

      // =========================================
      // BASIC KPIs
      // CURRENT MONTH ONLY
      // =========================================

      totalWO:
        totalWO,

      totalProjects:
        totalDevProjects,

      totalDevProjects:
        totalDevProjects,

      totalSites:
        totalSites,

      openWO:
        openWO,

      closedWO:
        closedWO,

      openProjects:
        openProjects,

      closedProjects:
        closedProjects,


      // =========================================
      // COSTS
      // CURRENT MONTH ONLY
      // =========================================

      maintenanceCost:
        maintenanceCost,

      developmentCost:
        devTotal,

      devProjectsCost:
        devTotal,

      totalCompanyCost:
        maintenanceCost +
        devTotal +
        partsCost,

      partsCost:
        partsCost,

      companyPartsCost:
        companyPartsCost,


      // =========================================
      // CONTRACTOR LABOR
      // =========================================

      contractorWO:
        contractorWO,

      contractorDev:
        contractorDev,

      totalLabor:
        totalLabor,


      // =========================================
      // CONTRACTOR PARTS
      // =========================================

      contractorPartsWO:
        contractorPartsWO,

      contractorPartsDev:
        contractorPartsDev,

      totalParts:
        totalParts,


      // =========================================
      // TOTAL CONTRACTOR COST
      // =========================================

      totalContractorCost:
        totalContractorCost,


      // =========================================
      // OLD FIELD NAMES
      // =========================================

      contractorCost:
        totalLabor,

      contractorPartsCost:
        totalParts,


      // =========================================
      // OTHER DASHBOARD DATA
      // =========================================

      topWorkOrders:
        topWorkOrders,

      topDevProjects:
        topDevProjects,

      topContractors:
        [],

      topUsedParts:
        [],

      recentActivities:
        [],


      // =========================================
      // HISTORICAL
      // =========================================

      historicalAvgMonthly:
        historicalAvgMonthly,

      historicalTotal:
        historicalTotal,

      historicalCount:
        historicalCount,


      // =========================================
      // CURRENT MONTH
      // =========================================

      currentMonth:
        Utilities.formatDate(
          today,
          Session.getScriptTimeZone(),
          'MMMM yyyy'
        )

    };


  } catch (e) {

    console.error(
      '❌ Error in getDashboardData:',
      e
    );


    return {

      totalWO: 0,

      totalProjects: 0,

      totalDevProjects: 0,

      totalSites: 0,

      openWO: 0,

      closedWO: 0,

      openProjects: 0,

      closedProjects: 0,

      maintenanceCost: 0,

      developmentCost: 0,

      devProjectsCost: 0,

      totalCompanyCost: 0,

      partsCost: 0,

      companyPartsCost: 0,

      contractorWO: 0,

      contractorDev: 0,

      contractorPartsWO: 0,

      contractorPartsDev: 0,

      totalLabor: 0,

      totalParts: 0,

      totalContractorCost: 0,

      contractorCost: 0,

      contractorPartsCost: 0,

      topWorkOrders: [],

      topDevProjects: [],

      topContractors: [],

      topUsedParts: [],

      recentActivities: [],

      historicalAvgMonthly: 0,

      historicalTotal: 0,

      historicalCount: 0,

      currentMonth: ''

    };

  }

}

// =============================================
// دوال مهام المواقع (SITE TASKS)
// =============================================
function getSiteTasksSummary() {
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('SiteTasks');
    if (!sheet) return "{}";
    
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return "{}";
    
    var summary = {};
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var site = String(row[1] || 'Unknown').trim();
      
      if (!site || site === 'Unknown') continue;
      
      if (!summary[site]) {
        summary[site] = { total: 0, completed: 0, totalCost: 0, tasks: [] };
      }
      
      summary[site].tasks.push({
        id: String(row[0] || ''),
        description: String(row[2] || ''),
        startDate: String(row[3] || ''),
        amount: Number(row[5]) || 0,
        status: String(row[6] || 'Open'),
        assignedTo: String(row[7] || ''),
        closeDate: String(row[4] || ''),
        image: String(row[8] || '')
      });
      
      summary[site].total++;
      if (row[6] === 'Closed') {
        summary[site].completed++;
        summary[site].totalCost += Number(row[5]) || 0;
      }
    }
    
    return JSON.stringify(summary);
    
  } catch(e) {
    return "{}";
  }
}

function saveSiteTask(data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName('SiteTasks');
    
    if (!sheet) {
      sheet = ss.insertSheet('SiteTasks');
      var headers = ['ID', 'Site Name', 'Task Description', 'Start Date', 'Close Date', 'Amount', 'Status', 'Assigned To', 'Image', 'Timestamp'];
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
    
    var lastRow = sheet.getLastRow();
    var taskId = 'ST-' + String(lastRow + 1).padStart(4, '0');
    
    sheet.appendRow([
      taskId,
      data.site || '',
      data.description || '',
      data.startDate || '',
      '',
      0,
      'Open',
      data.assignedTo || '',
      data.image || '',
      new Date().toISOString()
    ]);
    
    return '✅ Task ' + taskId + ' added successfully!';
    
  } catch(e) {
    throw new Error('Failed to save site task: ' + e.message);
  }
}

function closeSiteTask(taskId, data) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName('SiteTasks');
    if (!sheet) return "❌ Sheet not found";
    
    var sheetData = sheet.getDataRange().getValues();
    for (var i = 1; i < sheetData.length; i++) {
      if (sheetData[i][0] == taskId) {
        sheet.getRange(i + 1, 5).setValue(data.closeDate || new Date().toISOString().split('T')[0]);
        sheet.getRange(i + 1, 6).setValue(Number(data.amount) || 0);
        
        var currentAssigned = sheetData[i][7] || "";
        var contractorCost = Number(data.contractorCost) || 0;
        if (contractorCost > 0) {
          sheet.getRange(i + 1, 8).setValue(currentAssigned + " | Contractor: " + contractorCost + " SAR");
        }
        
        sheet.getRange(i + 1, 7).setValue('Closed');
        
        return "✅ Task " + taskId + " Closed Successfully! Total: " + data.amount + " SAR, Contractor: " + contractorCost + " SAR";
      }
    }
    return "❌ Task not found";
  } catch(e) {
    return "❌ Error: " + e.message;
  }
}

// =============================================
// دوال Work Orders للـ Dashboard
// =============================================
function getWorkOrdersForDashboard() {
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Data");
    if (!sheet) return [];
    
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];
    
    var result = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      result.push({
        woNo: row[0] || '',
        site: row[1] || '',
        description: row[5] || '',
        contractor: row[13] || '',
        finalCost: Number(row[11]) || 0
      });
    }
    return result;
  } catch(e) {
    return [];
  }
}

// =============================================
// إغلاق Work Order
// =============================================
function closeWorkOrder(woNo, data) {
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Data");
    if (!sheet) return "❌ Sheet 'Data' not found";
    
    var values = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      if (values[i][0] == woNo) {
        sheet.getRange(i + 1, 8).setValue("Closed");
        sheet.getRange(i + 1, 10).setValue(new Date());
        
        var finalAmount = Number(data.finalCost) || 0;
        sheet.getRange(i + 1, 12).setValue(finalAmount);
        
        var contractorAmount = Number(data.contractorCost) || 0;
        sheet.getRange(i + 1, 15).setValue(contractorAmount);
        
        sheet.getRange(i + 1, 16).setValue(data.notes || "");
        
        return "✅ WO " + woNo + " Closed Successfully! Final Cost: " + finalAmount + " SAR, Contractor Cost: " + contractorAmount + " SAR";
      }
    }
    return "❌ WO Not Found";
  } catch(e) {
    return "❌ Error: " + e.message;
  }
}

// =============================================
// إغلاق مشروع تطوير
// =============================================
function closeDevProject(projectId, data) {
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("ProjectManagement");
    if (!sheet) return "❌ Sheet 'ProjectManagement' not found";
    
    var values = sheet.getDataRange().getValues();
    for (var i = 1; i < values.length; i++) {
      if (String(values[i][0]) === String(projectId)) {
        sheet.getRange(i + 1, 6).setValue("Closed");
        
        var totalCost = Number(data.totalCost) || 0;
        sheet.getRange(i + 1, 7).setValue(totalCost);
        
        var contractorCost = Number(data.contractorCost) || 0;
        sheet.getRange(i + 1, 8).setValue(contractorCost);
        
        var contractorName = data.contractor || "";
        if (contractorName) {
          sheet.getRange(i + 1, 9).setValue(contractorName);
        }
        
        var currentDesc = values[i][2] || "";
        var notes = data.notes || "";
        if (notes) {
          sheet.getRange(i + 1, 3).setValue(currentDesc + " | Closed: " + notes);
        }
        
        return "✅ Project " + projectId + " Closed Successfully! Total: " + totalCost + " SAR, Contractor: " + contractorCost + " SAR";
      }
    }
    return "❌ Project Not Found";
  } catch(e) {
    return "❌ Error: " + e.message;
  }
}

// =============================================
// Contractor Monthly Report
// كل شهر مستقل - لا يتم دمج الشهور
// =============================================
function getContractorMonthlyReport() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var report = {};

    // ---------------------------------------------
    // دالة مساعدة لإضافة التكلفة للشهر الصحيح
    // ---------------------------------------------
    function addMonthlyCost(contractor, cost, date) {

      if (!contractor || cost <= 0) return;

      // إذا التاريخ غير صالح، لا ننسب التكلفة لشهر آخر
      if (!date || isNaN(date.getTime())) return;

      var year = date.getFullYear();
      var month = date.getMonth() + 1;

      var monthKey = year + '-' + String(month).padStart(2, '0');

      var monthName = date.toLocaleString('default', {
        month: 'long'
      }) + ' ' + year;

      if (!report[contractor]) {
        report[contractor] = {
          total: 0,
          months: {}
        };
      }

      if (!report[contractor].months[monthKey]) {
        report[contractor].months[monthKey] = {
          name: monthName,
          total: 0
        };
      }

      report[contractor].months[monthKey].total += cost;

      // إجمالي المقاول = مجموع كل الشهور
      report[contractor].total += cost;
    }


    // =============================================
    // 1. WORK ORDERS - Data
    // N = Contractor
    // O = Contractor Cost
    // I = Date
    // =============================================
    var woSheet = ss.getSheetByName("Data");

    if (woSheet) {

      var woData = woSheet.getDataRange().getValues();

      for (var i = 1; i < woData.length; i++) {

        var row = woData[i];

        var contractor = String(row[13] || '').trim();
        var cost = Number(row[14]) || 0;

        var date = row[8] ? new Date(row[8]) : null;

        if (!contractor || cost <= 0) continue;

        addMonthlyCost(contractor, cost, date);
      }
    }


    // =============================================
    // 2. DEVELOPMENT PROJECTS
    // I = Contractor
    // H = Contractor Cost
    // D = Date
    // =============================================
    var projSheet = ss.getSheetByName("ProjectManagement");

    if (projSheet) {

      var projData = projSheet.getDataRange().getValues();

      for (var i = 1; i < projData.length; i++) {

        var row = projData[i];

        var contractor = String(row[8] || '').trim();
        var cost = Number(row[7]) || 0;

        var date = row[3] ? new Date(row[3]) : null;

        if (!contractor || cost <= 0) continue;

        addMonthlyCost(contractor, cost, date);
      }
    }


    // =============================================
    // 3. PURCHASES
    // H = Supplier
    // G = Total Cost
    // I = Date
    // =============================================
    var purchaseSheet = ss.getSheetByName("Purchases");

    if (purchaseSheet) {

      var purchaseData = purchaseSheet.getDataRange().getValues();

      for (var i = 1; i < purchaseData.length; i++) {

        var row = purchaseData[i];

        var supplier = String(row[7] || '').trim();
        var cost = Number(row[6]) || 0;

        var date = row[8] ? new Date(row[8]) : null;

        if (!supplier || cost <= 0) continue;

        addMonthlyCost(supplier, cost, date);
      }
    }


    // =============================================
    // ترتيب الشهور من الأقدم إلى الأحدث
    // =============================================
    Object.keys(report).forEach(function(contractor) {

      var months = report[contractor].months;

      var sortedMonths = {};

      Object.keys(months)
        .sort()
        .forEach(function(key) {
          sortedMonths[key] = months[key];
        });

      report[contractor].months = sortedMonths;
    });


    console.log("📊 Contractor Monthly Report:", report);

    return report;

  } catch (e) {

    console.error(
      "❌ Error in getContractorMonthlyReport:",
      e
    );

    return {};
  }
}

// =============================================
// دوال Top Work Orders و Top Projects
// =============================================
function getTopWorkOrders() {
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Data");
    if (!sheet) return [];
    
    var data = sheet.getDataRange().getValues();
    var result = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      result.push({
        woNo: row[0] || '',
        site: row[1] || '',
        category: row[3] || '',
        cost: Number(row[11]) || 0
      });
    }
    result.sort(function(a, b) { return b.cost - a.cost; });
    return result.slice(0, 5);
  } catch(e) {
    return [];
  }
}

function getTopDevProjects() {
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("ProjectManagement");
    if (!sheet) return [];
    
    var data = sheet.getDataRange().getDisplayValues();
    var result = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      result.push({
        name: row[1] || '',
        status: row[10] || 'Active',
        totalCost: Number(row[11]) || 0
      });
    }
    result.sort(function(a, b) { return b.totalCost - a.totalCost; });
    return result.slice(0, 5);
  } catch(e) {
    return [];
  }
}

// =============================================
// دوال إحصائيات المقاولين اليومية
// =============================================
function getContractorDailyReport() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var report = {};
    var today = new Date();
    var todayStr = today.toDateString();
    
    var woSheet = ss.getSheetByName("Data");
    if (woSheet) {
      var woData = woSheet.getDataRange().getValues();
      for (var i = 1; i < woData.length; i++) {
        var row = woData[i];
        var contractor = String(row[13] || '').trim();
        var cost = Number(row[14]) || 0;
        var date = row[8] ? new Date(row[8]) : null;
        
        if (!contractor || contractor === '' || cost === 0) continue;
        if (!date || isNaN(date.getTime())) continue;
        
        if (date.toDateString() === todayStr) {
          if (!report[contractor]) report[contractor] = 0;
          report[contractor] += cost;
        }
      }
    }
    
    var projSheet = ss.getSheetByName("ProjectManagement");
    if (projSheet) {
      var projData = projSheet.getDataRange().getValues();
      for (var i = 1; i < projData.length; i++) {
        var row = projData[i];
        var contractor = String(row[6] || '').trim();
        var cost = Number(row[11]) || 0;
        var date = row[8] ? new Date(row[8]) : null;
        
        if (!contractor || contractor === '' || cost === 0) continue;
        if (!date || isNaN(date.getTime())) continue;
        
        if (date.toDateString() === todayStr) {
          if (!report[contractor]) report[contractor] = 0;
          report[contractor] += cost;
        }
      }
    }
    
    return report;
    
  } catch(e) {
    console.error("Error in getContractorDailyReport:", e);
    return {};
  }
}
// =============================================
// جلب نشاط المشاريع (عدد المشاريع لكل موقع)
// =============================================
function getProjectActivity() {
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('ProjectManagement');
    if (!sheet) return [];
    
    var data = sheet.getDataRange().getValues();
    var result = [];
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var projectName = row[1] || 'Unknown';         // العمود B = Location
      
      // ✅ كل مشروع = 1 نشاط (بغض النظر عن المحتوى)
      var activityCount = 1;
      
      // ✅ الحالة
      var status = String(row[5] || '').trim().toLowerCase();
      
      result.push({
        name: projectName,
        activityCount: activityCount,
        status: status,
        totalCost: Number(row[6]) || 0
      });
    }
    
    // ✅ دمج المشاريع المتكررة (نفس الموقع) وجمع النشاطات
    var mergedResult = {};
    for (var i = 0; i < result.length; i++) {
      var item = result[i];
      if (!mergedResult[item.name]) {
        mergedResult[item.name] = {
          name: item.name,
          activityCount: 0,
          status: item.status,
          totalCost: 0
        };
      }
      mergedResult[item.name].activityCount += item.activityCount;
      mergedResult[item.name].totalCost += item.totalCost;
      // إذا كان أي مشروع في الموقع مكتمل، نعتبر الموقع مكتمل
      if (item.status === 'closed' || item.status === 'completed') {
        mergedResult[item.name].status = 'closed';
      }
    }
    
    // تحويل النتيجة إلى مصفوفة
    var finalResult = [];
    for (var key in mergedResult) {
      finalResult.push(mergedResult[key]);
    }
    
    // ترتيب حسب النشاط (الأكثر نشاطاً أولاً)
    finalResult.sort(function(a, b) {
      return b.activityCount - a.activityCount;
    });
    
    return finalResult.slice(0, 10); // أعلى 10 مواقع
    
  } catch(e) {
    console.error("Error in getProjectActivity:", e);
    return [];
  }
}

// =============================================
// جلب عدد Work Orders لكل موقع
// =============================================
function getWorkOrdersPerSite() {
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('Data');
    if (!sheet) return [];
    
    var data = sheet.getDataRange().getValues();
    var sites = {};
    
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var site = row[1] || 'Unknown';
      
      if (!sites[site]) {
        sites[site] = 0;
      }
      sites[site]++;
    }
    
    var result = [];
    for (var site in sites) {
      result.push({
        site: site,
        count: sites[site]
      });
    }
    
    // ترتيب حسب العدد (الأكثر أولاً)
    result.sort(function(a, b) {
      return b.count - a.count;
    });
    
    return result.slice(0, 10); // أعلى 10 مواقع
    
  } catch(e) {
    console.error("Error in getWorkOrdersPerSite:", e);
    return [];
  }
}
function testProjectActivity() {
  try {
    var result = getProjectActivity();
    Logger.log("✅ Project Activity Result:", JSON.stringify(result));
    return result;
  } catch(e) {
    Logger.log("❌ Error:", e.message);
    return [];
  }
}

function testWorkOrdersPerSite() {
  try {
    var result = getWorkOrdersPerSite();
    Logger.log("✅ Work Orders Per Site:", JSON.stringify(result));
    return result;
  } catch(e) {
    Logger.log("❌ Error:", e.message);
    return [];
  }
}

// =============================================
// جلب جميع الصور للـ Gallery
// =============================================
function getGalleryImages() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var allImages = [];
    
    var woSheet = ss.getSheetByName("Data");
    if (woSheet) {
      var woData = woSheet.getDataRange().getValues();
      for (var i = 1; i < woData.length; i++) {
        var row = woData[i];
        var imageData = row[10] || '';
        if (imageData && imageData.length > 10) {
          allImages.push({
            source: 'Work Order',
            reference: row[0] || 'WO-???',
            site: row[1] || '',
            image: imageData,
            date: row[8] || ''
          });
        }
      }
    }
    
    var devSheet = ss.getSheetByName("ProjectManagement");
    if (devSheet) {
      var devData = devSheet.getDataRange().getValues();
      for (var i = 1; i < devData.length; i++) {
        var row = devData[i];
        var imageData = row[9] || '';
        if (imageData && imageData.length > 10) {
          allImages.push({
            source: 'Development Project',
            reference: row[0] || 'PRJ-???',
            site: row[2] || '',
            image: imageData,
            date: row[4] || ''
          });
        }
      }
    }
    
    var taskSheet = ss.getSheetByName("SiteTasks");
    if (taskSheet) {
      var taskData = taskSheet.getDataRange().getValues();
      for (var i = 1; i < taskData.length; i++) {
        var row = taskData[i];
        var imageData = row[8] || '';
        if (imageData && imageData.length > 10) {
          allImages.push({
            source: 'Site Task',
            reference: row[0] || 'ST-???',
            site: row[1] || '',
            image: imageData,
            date: row[3] || ''
          });
        }
      }
    }
    
    return allImages;
    
  } catch(e) {
    console.error("Error in getGalleryImages:", e);
    return [];
  }
}
function testGalleryData() {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName("Data");
  if (!sheet) {
    Logger.log("❌ Data sheet not found!");
    return;
  }
  
  var data = sheet.getDataRange().getValues();
  var count = 0;
  
  Logger.log("📋 Total rows: " + (data.length - 1));
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var imageData = row[10] || ''; // العمود K
    var woNo = row[0] || '';
    
    if (imageData && imageData.length > 0) {
      count++;
      Logger.log("✅ Row " + i + ": WO=" + woNo + ", Image length=" + imageData.length);
      Logger.log("   Starts with: " + imageData.substring(0, 30) + "...");
    }
  }
  
  Logger.log("📊 Total images found: " + count);
}
// =============================================
// جلب بيانات المقاول لكل شهر على حدة
// =============================================
function getMonthlyContractorData() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var result = [];
    
    // ===== 1. جلب بيانات Work Orders من شيت Data =====
    var woSheet = ss.getSheetByName("Data");
    var woData = woSheet ? woSheet.getDataRange().getValues() : [];
    
    // ===== 2. جلب بيانات المشاريع من ProjectManagement =====
    var projSheet = ss.getSheetByName("ProjectManagement");
    var projData = projSheet ? projSheet.getDataRange().getValues() : [];
    
    // ===== 3. جلب بيانات المشتريات من Purchases =====
    var purSheet = ss.getSheetByName("Purchases");
    var purData = purSheet ? purSheet.getDataRange().getValues() : [];
    
    // ===== الحصول على الشهر الحالي =====
    var now = new Date();
    var currentMonth = now.getMonth();
    var currentYear = now.getFullYear();
    
    // ===== إنشاء مصفوفة للأشهر الستة الماضية =====
    var months = [];
    for (var i = 5; i >= 0; i--) {
      var month = currentMonth - i;
      var year = currentYear;
      if (month < 0) {
        month += 12;
        year--;
      }
      months.push({ month: month, year: year });
    }
    
    // ===== معالجة كل شهر =====
    for (var m = 0; m < months.length; m++) {
      var targetMonth = months[m].month;
      var targetYear = months[m].year;
      
      var contractorCost = 0;
      var contractorParts = 0;
      var woCount = 0;
      var projCount = 0;
      
      // ===== جلب تكلفة المقاول من Work Orders =====
      for (var i = 1; i < woData.length; i++) {
        var row = woData[i];
        var date = row[8] ? new Date(row[8]) : null; // Reported Date
        if (!date) continue;
        
        if (date.getMonth() === targetMonth && date.getFullYear() === targetYear) {
          var contractorName = String(row[13] || '').trim(); // External Contractor
          var cost = Number(row[14]) || 0; // Contractor Cost
          if (contractorName && cost > 0) {
            contractorCost += cost;
            woCount++;
          }
        }
      }
      
      // ===== جلب تكلفة المقاول من ProjectManagement =====
      for (var i = 1; i < projData.length; i++) {
        var row = projData[i];
        var date = row[3] ? new Date(row[3]) : null; // Start Date
        if (!date) continue;
        
        if (date.getMonth() === targetMonth && date.getFullYear() === targetYear) {
          var contractorName = String(row[8] || '').trim(); // Contractor
          var cost = Number(row[7]) || 0; // Contractor Cost
          if (contractorName && cost > 0) {
            contractorCost += cost;
            projCount++;
          }
        }
      }
      
      // ===== جلب قطع المقاول من Purchases =====
      for (var i = 1; i < purData.length; i++) {
        var row = purData[i];
        var date = row[9] ? new Date(row[9]) : null; // Purchase Date
        if (!date) continue;
        
        if (date.getMonth() === targetMonth && date.getFullYear() === targetYear) {
          var purchasedBy = String(row[8] || 'Company').trim(); // Purchased By
          var cost = Number(row[6]) || 0; // Total Cost
          if (purchasedBy === 'Contractor' && cost > 0) {
            contractorParts += cost;
          }
        }
      }
      
      // ===== إجمالي تكلفة المقاول للشهر =====
      var totalContractorCost = contractorCost + contractorParts;
      
      // ===== إضافة الخصم (4,150 SAR) =====
      var monthlyDeduction = 4150;
      var afterCost = totalContractorCost + monthlyDeduction;
      
      // ===== اسم الشهر =====
      var monthName = new Date(targetYear, targetMonth).toLocaleString('default', { month: 'long' }) + ' ' + targetYear;
      
      result.push({
        month: monthName,
        monthIndex: targetMonth,
        year: targetYear,
        contractorCost: totalContractorCost,
        contractorParts: contractorParts,
        contractorWO: contractorCost,
        afterCost: afterCost,
        deduction: monthlyDeduction,
        woCount: woCount,
        projCount: projCount,
        isCurrentMonth: (targetMonth === currentMonth && targetYear === currentYear)
      });
    }
    
    return result;
    
  } catch(e) {
    console.error("Error in getMonthlyContractorData:", e);
    return [];
  }
}

// =============================================
// جلب البيانات للتقرير الشهري (معدل)
// =============================================
function getMonthlyReportData() {
  try {
    var monthlyData = getMonthlyContractorData();
    var result = [];
    
    // ===== المبالغ الفعلية لآخر 6 شهور =====
    var actualMaintenanceCost = 123462.85;
    var actualDevelopmentCost = 795304.17;
    
    var avgMonthlyMaintenance = actualMaintenanceCost / 6;
    var avgMonthlyDevelopment = actualDevelopmentCost / 6;
    
    for (var i = 0; i < monthlyData.length; i++) {
      var data = monthlyData[i];
      
      // Before = المتوسط الشهري
      var beforeMaintenance = avgMonthlyMaintenance;
      var beforeDevelopment = avgMonthlyDevelopment;
      
      // After = تكلفة المقاول + الخصم
      var afterMaintenance = data.contractorCost + data.deduction;
      var afterDevelopment = data.contractorCost + data.deduction;
      
      // Savings
      var savingsMaintenance = beforeMaintenance - afterMaintenance;
      var savingsDevelopment = beforeDevelopment - afterDevelopment;
      var totalSavings = savingsMaintenance + savingsDevelopment;
      
      result.push({
        month: data.month,
        monthIndex: data.monthIndex,
        year: data.year,
        isCurrentMonth: data.isCurrentMonth,
        maintenance: {
          before: beforeMaintenance,
          after: afterMaintenance,
          savings: savingsMaintenance
        },
        development: {
          before: beforeDevelopment,
          after: afterDevelopment,
          savings: savingsDevelopment
        },
        totalSavings: totalSavings,
        contractorCost: data.contractorCost,
        contractorParts: data.contractorParts,
        contractorWO: data.contractorWO,
        deduction: data.deduction,
        woCount: data.woCount,
        projCount: data.projCount
      });
    }
    
    return result;
    
  } catch(e) {
    console.error("Error in getMonthlyReportData:", e);
    return [];
  }
}
// =============================================
// جلب تفاصيل المقاولين (مفصلة بالكامل)
// =============================================
function getContractorDetails() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var result = {
      contractorWO: 0,
      contractorDev: 0,
      contractorPartsWO: 0,
      contractorPartsDev: 0,
      totalLabor: 0,
      totalParts: 0,
      totalCost: 0
    };
    
    // ===== 1. جلب أجرة اليد من Work Orders (Data) =====
    var woSheet = ss.getSheetByName("Data");
    if (woSheet) {
      var woData = woSheet.getDataRange().getValues();
      for (var i = 1; i < woData.length; i++) {
        var row = woData[i];
        var contractorName = String(row[13] || '').trim();
        var laborCost = Number(row[14]) || 0;
        if (contractorName && laborCost > 0) {
          result.contractorWO += laborCost;
        }
      }
    }
    
    // ===== 2. جلب أجرة اليد من Development Projects (ProjectManagement) =====
    var devSheet = ss.getSheetByName("ProjectManagement");
    if (devSheet) {
      var devData = devSheet.getDataRange().getValues();
      for (var i = 1; i < devData.length; i++) {
        var row = devData[i];
        var contractorName = String(row[8] || '').trim();
        var laborCost = Number(row[7]) || 0;
        if (contractorName && laborCost > 0) {
          result.contractorDev += laborCost;
        }
      }
    }
    
    // ===== 3. جلب قطع المقاول من Purchases =====
    var purSheet = ss.getSheetByName("Purchases");
    if (purSheet) {
      var purData = purSheet.getDataRange().getValues();
      for (var i = 1; i < purData.length; i++) {
        var row = purData[i];
        var purchasedBy = String(row[8] || 'Company').trim();
        var referenceId = String(row[2] || '').trim();
        var cost = Number(row[6]) || 0;
        
        if (purchasedBy === 'Contractor' && cost > 0) {
          if (referenceId.toUpperCase().includes('WO-')) {
            result.contractorPartsWO += cost;
          } else if (referenceId.toUpperCase().includes('PRJ-')) {
            result.contractorPartsDev += cost;
          } else {
            var type = String(row[1] || '').trim().toUpperCase();
            if (type.includes('WO') || type.includes('WORK') || type.includes('MAINTENANCE')) {
              result.contractorPartsWO += cost;
            } else if (type.includes('PRJ') || type.includes('DEV') || type.includes('PROJECT') || type.includes('CONSTRUCTION')) {
              result.contractorPartsDev += cost;
            } else {
              result.contractorPartsWO += cost * 0.5;
              result.contractorPartsDev += cost * 0.5;
            }
          }
        }
      }
    }
    
    // ===== 4. حساب الإجماليات =====
    result.totalLabor = result.contractorWO + result.contractorDev;
    result.totalParts = result.contractorPartsWO + result.contractorPartsDev;
    result.totalCost = result.totalLabor + result.totalParts;
    
    return result;
    
  } catch(e) {
    console.error("Error in getContractorDetails:", e);
    return {
      contractorWO: 0,
      contractorDev: 0,
      contractorPartsWO: 0,
      contractorPartsDev: 0,
      totalLabor: 0,
      totalParts: 0,
      totalCost: 0
    };
  }
}

// =============================================
// جلب بيانات التوفير الشهرية من الشيت
// =============================================
function getMonthlySavingsHistory() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("MonthlySavings");
    if (!sheet) return [];
    
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return [];
    
    var result = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      result.push({
        month: row[0] || '',
        year: row[1] || 0,
        contractorWO: Number(row[2]) || 0,
        contractorDev: Number(row[3]) || 0,
        partsWO: Number(row[4]) || 0,
        partsDev: Number(row[5]) || 0,
        totalLabor: Number(row[6]) || 0,
        totalParts: Number(row[7]) || 0,
        totalCost: Number(row[8]) || 0,
        maintenanceSavings: Number(row[9]) || 0,
        developmentSavings: Number(row[10]) || 0,
        maintenancePercent: Number(row[11]) || 0,
        developmentPercent: Number(row[12]) || 0,
        totalPercent: Number(row[13]) || 0
      });
    }
    return result;
    
  } catch(e) {
    console.error("Error in getMonthlySavingsHistory:", e);
    return [];
  }
}

// =============================================
// تشغيل حفظ البيانات تلقائياً (يتم استدعاؤها في نهاية الشهر)
// =============================================
function autoSaveMonthlySavings() {
  return saveMonthlySavings();
}

// =============================================
// إعداد Trigger شهري (يتم تشغيلها مرة واحدة فقط)
// =============================================
function setupMonthlyTrigger() {
  try {
    // إلغاء أي triggers سابقة
    var triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(function(trigger) {
      if (trigger.getHandlerFunction() === 'autoSaveMonthlySavings') {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    
    // إنشاء trigger جديد يعمل في أول كل شهر
    ScriptApp.newTrigger('autoSaveMonthlySavings')
      .timeBased()
      .onMonthDay(1)
      .atHour(0)
      .create();
    
    return "✅ Monthly trigger set successfully! Will run on the 1st of each month at 00:00.";
    
  } catch(e) {
    return "❌ Error setting trigger: " + e.message;
  }
}
// =============================================
// حفظ بيانات الشهر في شيت MonthlySavings
// =============================================
function saveMonthlySavings() {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("MonthlySavings");
    
    if (!sheet) {
      return "❌ Sheet 'MonthlySavings' not found. Please create it first.";
    }
    
    var data = getDashboardData();
    
    var contractorWO = data.contractorWO || 0;
    var contractorDev = data.contractorDev || 0;
    var contractorPartsWO = data.contractorPartsWO || 0;
    var contractorPartsDev = data.contractorPartsDev || 0;
    var totalLabor = data.totalLabor || 0;
    var totalParts = data.totalParts || 0;
    var totalContractorCost = data.totalContractorCost || 0;
    
    var actualMaintenanceCost = 123462.85;
    var actualDevelopmentCost = 795304.17;
    var avgMonthlyMaintenance = actualMaintenanceCost / 6;
    var avgMonthlyDevelopment = actualDevelopmentCost / 6;
    
    // ===== تعديل: الخصم الجديد (2000 + 150 = 2150) =====
    var monthlySalaryIncrease = 2000;
    var monthlyEmployeeBonus = 150;
    var totalMonthlyDeduction = monthlySalaryIncrease + monthlyEmployeeBonus;
    
    // ===== تعديل: حساب الصيانة = أجرة WO + قطع WO فقط =====
    var maintenanceActualSpent = contractorWO + contractorPartsWO;
    
    // ===== تعديل: حساب التطوير = أجرة Dev + قطع Dev فقط =====
    var developmentActualSpent = contractorDev + contractorPartsDev;
    
    // ===== تعديل: After = المبلغ المصروف فعلياً + الخصم =====
    var totalContractorMaintenance = maintenanceActualSpent + totalMonthlyDeduction;
    var totalContractorDevelopment = developmentActualSpent + totalMonthlyDeduction;
    
    // ===== التوفير =====
    var monthlyMaintenanceSavings = avgMonthlyMaintenance - totalContractorMaintenance;
    var monthlyDevelopmentSavings = avgMonthlyDevelopment - totalContractorDevelopment;
    
    // ===== النسب =====
    var maintenanceSavingsPercent = (monthlyMaintenanceSavings / avgMonthlyMaintenance) * 100;
    var developmentSavingsPercent = (monthlyDevelopmentSavings / avgMonthlyDevelopment) * 100;
    var totalSavingsPercent = ((monthlyMaintenanceSavings + monthlyDevelopmentSavings) / (avgMonthlyMaintenance + avgMonthlyDevelopment)) * 100;
    
    var now = new Date();
    var currentMonth = now.getMonth() + 1;
    var currentYear = now.getFullYear();
    var monthName = now.toLocaleString('default', { month: 'long' });
    
    var existingData = sheet.getDataRange().getValues();
    var monthExists = false;
    var rowIndex = -1;
    
    for (var i = 1; i < existingData.length; i++) {
      var row = existingData[i];
      if (row[0] === monthName && row[1] === currentYear) {
        monthExists = true;
        rowIndex = i + 1;
        break;
      }
    }
    
    var newRow = [
      monthName, currentYear,
      contractorWO, contractorDev,
      contractorPartsWO, contractorPartsDev,
      totalLabor, totalParts, totalContractorCost,
      monthlyMaintenanceSavings, monthlyDevelopmentSavings,
      maintenanceSavingsPercent, developmentSavingsPercent, totalSavingsPercent
    ];
    
    if (monthExists) {
      sheet.getRange(rowIndex, 1, 1, newRow.length).setValues([newRow]);
      return "✅ Updated existing record for " + monthName + " " + currentYear;
    } else {
      sheet.appendRow(newRow);
      return "✅ New record saved for " + monthName + " " + currentYear;
    }
    
  } catch(e) {
    console.error("Error in saveMonthlySavings:", e);
    return "❌ Error: " + e.message;
  }
}

// =============================================
// جلب بيانات المركبات من ملف الإكسيل مع تحليل كامل
// =============================================
function getVehicleData() {
  try {
    var VEHICLE_FILE_ID = '12_WSi8KrHZ9-dtZzrlHmTCI-Jiwg7zDieJ5NU3-lVxY';
    var ss = SpreadsheetApp.openById(VEHICLE_FILE_ID);
    var sheet = ss.getSheetByName('Issues');

    if (!sheet) {
      return {
        error: "Sheet 'Issues' not found",
        summary: { totalIssues: 0, totalVehicles: 0, tireIssues: 0, totalTires: 0, totalPunctures: 0, totalTubes: 0 },
        tireDetails: { received: 0, changed: 0, need: 0, puncture: 0, fixedPuncture: 0, tube: 0, totalQTY: 0, totalTiresSupplied: 0 },
        vehicleReport: [],
        top10Vehicles: [],
        problemBreakdown: [],
        monthlyBreakdown: [],
        partsDistribution: []
      };
    }

    var rows = sheet.getDataRange().getValues();
    if (!rows || rows.length <= 1) {
      return {
        error: "No data in sheet",
        summary: { totalIssues: 0, totalVehicles: 0, tireIssues: 0, totalTires: 0, totalPunctures: 0, totalTubes: 0 },
        tireDetails: { received: 0, changed: 0, need: 0, puncture: 0, fixedPuncture: 0, tube: 0, totalQTY: 0, totalTiresSupplied: 0 },
        vehicleReport: [],
        top10Vehicles: [],
        problemBreakdown: [],
        monthlyBreakdown: [],
        partsDistribution: []
      };
    }

    var dataRows = rows.slice(1);
    var headers = rows[0];
    
    // ============================================================
    // اكتشاف الأعمدة
    // ============================================================
    var colIndex = { date: -1, plate: -1, issueType: -1, note: -1, qty: -1 };
    
    for (var k = 0; k < headers.length; k++) {
      var h = String(headers[k] || '').toLowerCase().trim();
      if (h.includes('id') || h.includes('date')) colIndex.date = k;
      else if (h.includes('carplate') || h.includes('plate') || h.includes('car')) colIndex.plate = k;
      else if (h.includes('issuetype') || h.includes('type') || h.includes('problem')) colIndex.issueType = k;
      else if (h.includes('note') || h.includes('description') || h.includes('details')) colIndex.note = k;
      else if (h.includes('qty') || h.includes('quantity') || h.includes('count')) colIndex.qty = k;
    }
    
    // ============================================================
    // متغيرات التحليل
    // ============================================================
    var totalIssues = 0;
    var allPlates = [];
    var issueCount = {};
    var issueQTY = {};
    var tireDetails = {
      received: 0,
      changed: 0,
      need: 0,
      puncture: 0,
      tube: 0,
      fixedPuncture: 0,
      totalQTY: 0
    };
    var vehicleIssues = {};
    var vehicleQTY = {};
    var vehicleTires = {};
    var monthlyBreakdown = {};
    var partsDistribution = {};
    
    // ============================================================
    // معالجة البيانات
    // ============================================================
    dataRows.forEach(function(row) {
      var dateStr = colIndex.date >= 0 ? String(row[colIndex.date] || '').trim() : '';
      var plate = colIndex.plate >= 0 ? String(row[colIndex.plate] || '').trim().toUpperCase() : '';
      var issueType = colIndex.issueType >= 0 ? String(row[colIndex.issueType] || '').trim() : '';
      var note = colIndex.note >= 0 ? String(row[colIndex.note] || '').toLowerCase() : '';
      var qty = colIndex.qty >= 0 ? Number(row[colIndex.qty]) || 0 : 0;
      
      if (!plate && !issueType) return;
      
      totalIssues++;
      if (plate) allPlates.push(plate);
      
      if (issueType) {
        issueCount[issueType] = (issueCount[issueType] || 0) + 1;
        issueQTY[issueType] = (issueQTY[issueType] || 0) + qty;
      }
      
      if (plate) {
        vehicleIssues[plate] = (vehicleIssues[plate] || 0) + 1;
        vehicleQTY[plate] = (vehicleQTY[plate] || 0) + qty;
        if (issueType === 'Tires' || issueType === 'Tires problem') {
          vehicleTires[plate] = (vehicleTires[plate] || 0) + 1;
        }
      }
      
      // ============================================================
      // تحليل الإطارات
      // ============================================================
      if (issueType === 'Tires' || issueType === 'Tires problem') {
        tireDetails.totalQTY += qty;
        
        if (/(received|got|took|new tire)/i.test(note)) {
          tireDetails.received += qty || 1;
        }
        else if (/(change|changed|fix new|install|put)/i.test(note) && !/(puncture|puncher|burst)/i.test(note)) {
          tireDetails.changed += qty || 1;
        }
        else if (/(need|needed|requires|urgent)/i.test(note)) {
          tireDetails.need += qty || 1;
        }
        else if (/(puncture|puncher|burst|punctured)/i.test(note)) {
          tireDetails.puncture += 1;
        }
        else if (/(fixed puncture|fixed puncher|repair puncture)/i.test(note)) {
          tireDetails.fixedPuncture += 1;
        }
        else if (/tube/i.test(note)) {
          tireDetails.tube += 1;
        }
      }
      
      // ============================================================
      // القطع الموزعة (غير الإطارات)
      // ============================================================
      if (qty > 0 && issueType !== 'Tires' && issueType !== 'Tires problem') {
        partsDistribution[issueType] = (partsDistribution[issueType] || 0) + qty;
      }
      
      // ============================================================
      // التحليل الشهري
      // ============================================================
      if (dateStr) {
        var dateObj = parseDate(dateStr);
        if (dateObj) {
          var monthKey = dateObj.getFullYear() + '-' + String(dateObj.getMonth() + 1).padStart(2, '0');
          var monthName = dateObj.toLocaleString('default', { month: 'long' });
          var year = dateObj.getFullYear();
          
          if (!monthlyBreakdown[monthKey]) {
            monthlyBreakdown[monthKey] = {
              month: monthName,
              year: year,
              monthKey: monthKey,
              totalTires: 0,
              totalIssues: 0,
              received: 0,
              changed: 0,
              need: 0,
              puncture: 0,
              tube: 0,
              fixedPuncture: 0,
              operations: 0
            };
          }
          
          monthlyBreakdown[monthKey].totalIssues += 1;
          
          if (issueType === 'Tires' || issueType === 'Tires problem') {
            monthlyBreakdown[monthKey].totalTires += qty;
            monthlyBreakdown[monthKey].operations += 1;
            
            if (/(received|got|took|new tire)/i.test(note)) {
              monthlyBreakdown[monthKey].received += qty || 1;
            }
            else if (/(change|changed|fix new|install|put)/i.test(note) && !/(puncture|puncher|burst)/i.test(note)) {
              monthlyBreakdown[monthKey].changed += qty || 1;
            }
            else if (/(need|needed|requires|urgent)/i.test(note)) {
              monthlyBreakdown[monthKey].need += qty || 1;
            }
            else if (/(puncture|puncher|burst|punctured)/i.test(note)) {
              monthlyBreakdown[monthKey].puncture += 1;
            }
            else if (/(fixed puncture|fixed puncher|repair puncture)/i.test(note)) {
              monthlyBreakdown[monthKey].fixedPuncture += 1;
            }
            else if (/tube/i.test(note)) {
              monthlyBreakdown[monthKey].tube += 1;
            }
          }
        }
      }
    });
    
    // ============================================================
    // ترتيب النتائج
    // ============================================================
    var uniquePlates = [...new Set(allPlates)];
    
    var vehicleReport = [];
    for (var plate in vehicleIssues) {
      vehicleReport.push({
        plate: plate,
        totalIssues: vehicleIssues[plate],
        totalQTY: vehicleQTY[plate] || 0,
        tireIssues: vehicleTires[plate] || 0
      });
    }
    vehicleReport.sort(function(a, b) { return b.totalIssues - a.totalIssues; });
    
    var problemBreakdown = [];
    for (var issue in issueCount) {
      problemBreakdown.push({
        issue: issue,
        count: issueCount[issue],
        qty: issueQTY[issue] || 0
      });
    }
    problemBreakdown.sort(function(a, b) { return b.count - a.count; });
    
    var monthlyArray = Object.values(monthlyBreakdown);
    monthlyArray.sort(function(a, b) { return a.monthKey.localeCompare(b.monthKey); });
    
    var partsArray = [];
    for (var part in partsDistribution) {
      partsArray.push({ part: part, qty: partsDistribution[part] });
    }
    partsArray.sort(function(a, b) { return b.qty - a.qty; });
    
    var totalTires = tireDetails.received + tireDetails.changed + tireDetails.need;
    
    // ============================================================
    // RETURN النهائي
    // ============================================================
    return {
      summary: {
        totalIssues: totalIssues,
        totalVehicles: uniquePlates.length,
        tireIssues: tireDetails.totalQTY,
        totalTires: totalTires,
        totalPunctures: tireDetails.puncture,
        totalTubes: tireDetails.tube
      },
      tireDetails: {
        received: tireDetails.received,
        changed: tireDetails.changed,
        need: tireDetails.need,
        puncture: tireDetails.puncture,
        fixedPuncture: tireDetails.fixedPuncture,
        tube: tireDetails.tube,
        totalQTY: tireDetails.totalQTY,
        totalTiresSupplied: totalTires
      },
      problemBreakdown: problemBreakdown,
      vehicleReport: vehicleReport,
      top10Vehicles: vehicleReport.slice(0, 10),
      monthlyBreakdown: monthlyArray,
      partsDistribution: partsArray
    };

  } catch (err) {
    return {
      error: err.toString(),
      summary: { totalIssues: 0, totalVehicles: 0, tireIssues: 0, totalTires: 0, totalPunctures: 0, totalTubes: 0 },
      tireDetails: { received: 0, changed: 0, need: 0, puncture: 0, fixedPuncture: 0, tube: 0, totalQTY: 0, totalTiresSupplied: 0 },
      vehicleReport: [],
      top10Vehicles: [],
      problemBreakdown: [],
      monthlyBreakdown: [],
      partsDistribution: []
    };
  }
}

// ============================================================
// دالة مساعدة لتحويل التاريخ (تدعم صيغ متعددة)
// ============================================================
function parseDate(dateStr) {
  if (!dateStr) return null;
  
  var d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  
  var match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    return new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
  }
  
  var match2 = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match2) {
    return new Date(Number(match2[3]), Number(match2[2]) - 1, Number(match2[1]));
  }
  
  return null;
}

// ============================================================
// GET FINANCIAL REPORT DATA FROM MONTHLYSAVINGS SHEET
// ============================================================
function getFinancialReport(period) {
  try {
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var sheet = ss.getSheetByName("MonthlySavings");
    
    if (!sheet) {
      return { error: "MonthlySavings sheet not found" };
    }
    
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      return { error: "No data in MonthlySavings" };
    }
    
    var monthsToGet = 1;
    if (period === '3months') monthsToGet = 3;
    else if (period === '6months') monthsToGet = 6;
    else if (period === 'year') monthsToGet = 12;
    
    var rows = data.slice(1);
    var totalRows = rows.length;
    var startIndex = Math.max(0, totalRows - monthsToGet);
    var selectedRows = rows.slice(startIndex);
    
    var contractorWO = 0;
    var contractorDev = 0;
    var partsWO = 0;
    var partsDev = 0;
    var totalLabor = 0;
    var totalParts = 0;
    var totalContractorCost = 0;
    var companyPartsCost = 0;
    var totalCompanyCost = 0;
    
    selectedRows.forEach(function(row) {
      contractorWO += Number(row[2]) || 0;
      contractorDev += Number(row[3]) || 0;
      partsWO += Number(row[4]) || 0;
      partsDev += Number(row[5]) || 0;
      totalLabor += Number(row[6]) || 0;
      totalParts += Number(row[7]) || 0;
      totalContractorCost += Number(row[8]) || 0;
    });
    
    // ============================================================
    // حساب المواقع الفعلية من Work Orders (اللي لها تكلفة > 0)
    // ============================================================
    var woSheet = ss.getSheetByName("Data");
    var woUniqueSites = new Set();
    var totalWO = 0;
    
    if (woSheet) {
      var woData = woSheet.getDataRange().getValues();
      for (var i = 1; i < woData.length; i++) {
        var row = woData[i];
        var date = row[8] ? new Date(row[8]) : null;
        var site = String(row[1] || '').trim();
        var cost = Number(row[11]) || 0;
        var contractorCost = Number(row[14]) || 0;
        
        if (!date || !site || (cost === 0 && contractorCost === 0)) continue;
        
        var isInPeriod = false;
        selectedRows.forEach(function(sRow) {
          var savedMonth = sRow[0];
          var savedYear = Number(sRow[1]);
          var dateObj = new Date(savedYear, getMonthIndex(savedMonth), 1);
          if (date.getFullYear() === dateObj.getFullYear() && date.getMonth() === dateObj.getMonth()) {
            isInPeriod = true;
          }
        });
        
        if (isInPeriod) {
          totalWO++;
          woUniqueSites.add(site);
        }
      }
    }
    
    // ============================================================
    // حساب المواقع الفعلية من ProjectManagement (اللي لها تكلفة > 0)
    // ============================================================
    var projSheet = ss.getSheetByName("ProjectManagement");
    var projUniqueSites = new Set();
    
    if (projSheet) {
      var projData = projSheet.getDataRange().getValues();
      for (var i = 1; i < projData.length; i++) {
        var row = projData[i];
        var date = row[3] ? new Date(row[3]) : null;
        var site = String(row[1] || '').trim();
        var contractorCost = Number(row[7]) || 0;
        var totalCost = Number(row[6]) || 0;
        
        if (!date || !site || (contractorCost === 0 && totalCost === 0)) continue;
        
        var isInPeriod = false;
        selectedRows.forEach(function(sRow) {
          var savedMonth = sRow[0];
          var savedYear = Number(sRow[1]);
          var dateObj = new Date(savedYear, getMonthIndex(savedMonth), 1);
          if (date.getFullYear() === dateObj.getFullYear() && date.getMonth() === dateObj.getMonth()) {
            isInPeriod = true;
          }
        });
        
        if (isInPeriod) {
          projUniqueSites.add(site);
        }
      }
    }
    
    var allUniqueSites = new Set([...projUniqueSites, ...woUniqueSites]);
    var totalSites = allUniqueSites.size;
    var totalProjects = totalSites;
    
    // ============================================================
    // تكلفة قطع الشركة حسب الفترة
    // ============================================================
    var purSheet = ss.getSheetByName("Purchases");
    if (purSheet) {
      var purData = purSheet.getDataRange().getValues();
      for (var i = 1; i < purData.length; i++) {
        var row = purData[i];
        var date = row[9] ? new Date(row[9]) : null;
        var purchasedBy = String(row[8] || 'Company').trim();
        var cost = Number(row[6]) || 0;
        
        if (!date || cost === 0) continue;
        
        var isInPeriod = false;
        selectedRows.forEach(function(sRow) {
          var savedMonth = sRow[0];
          var savedYear = Number(sRow[1]);
          var dateObj = new Date(savedYear, getMonthIndex(savedMonth), 1);
          if (date.getFullYear() === dateObj.getFullYear() && date.getMonth() === dateObj.getMonth()) {
            isInPeriod = true;
          }
        });
        
        if (isInPeriod && purchasedBy !== 'Contractor') {
          companyPartsCost += cost;
        }
      }
    }
    
    totalCompanyCost = totalContractorCost + companyPartsCost;
    
    return {
      totalWO: totalWO || 0,
      totalProjects: totalProjects || 0,
      totalSites: totalSites || 0,
      contractorWO: contractorWO || 0,
      contractorDev: contractorDev || 0,
      contractorPartsWO: partsWO || 0,
      contractorPartsDev: partsDev || 0,
      totalLabor: totalLabor || 0,
      totalParts: totalParts || 0,
      totalContractorCost: totalContractorCost || 0,
      companyPartsCost: companyPartsCost || 0,
      totalCompanyCost: totalCompanyCost || 0,
      period: period,
      monthsCount: selectedRows.length,
      monthsUsed: selectedRows.map(function(row) { return row[0] + ' ' + row[1]; }),
      sitesList: Array.from(allUniqueSites).join(', ')
    };
    
  } catch(e) {
    return {
      error: e.message,
      totalWO: 0,
      totalProjects: 0,
      totalSites: 0,
      contractorWO: 0,
      contractorDev: 0,
      contractorPartsWO: 0,
      contractorPartsDev: 0,
      totalLabor: 0,
      totalParts: 0,
      totalContractorCost: 0,
      companyPartsCost: 0,
      totalCompanyCost: 0
    };
  }
}

// ============================================================
// دالة مساعدة لتحويل اسم الشهر إلى رقم
// ============================================================
function getMonthIndex(monthName) {
  var months = {
    'January': 0, 'February': 1, 'March': 2, 'April': 3,
    'May': 4, 'June': 5, 'July': 6, 'August': 7,
    'September': 8, 'October': 9, 'November': 10, 'December': 11
  };
  return months[monthName] || 0;
}
// ============================================================
// GET VEHICLE REPORT WITH FULL ANALYSIS (ADVANCED) - FINAL
// ============================================================
function getVehicleReportAdvanced() {
  try {
    var VEHICLE_FILE_ID = '12_WSi8KrHZ9-dtZzrlHmTCI-Jiwg7zDieJ5NU3-lVxY';
    var ss = SpreadsheetApp.openById(VEHICLE_FILE_ID);
    var sheet = ss.getSheetByName('Issues');

    if (!sheet) {
      return { error: "Sheet 'Issues' not found" };
    }

    var rows = sheet.getDataRange().getValues();
    if (!rows || rows.length <= 1) {
      return { error: "No data in sheet" };
    }

    var dataRows = rows.slice(1);
    var headers = rows[0];

    // ============================================================
    // اكتشاف الأعمدة
    // ============================================================
    var colIndex = { date: -1, plate: -1, issueType: -1, note: -1, qty: -1 };

    for (var k = 0; k < headers.length; k++) {
      var h = String(headers[k] || '').toLowerCase().trim();
      if (h.includes('id') || h.includes('date')) colIndex.date = k;
      else if (h.includes('carplate') || h.includes('plate') || h.includes('car')) colIndex.plate = k;
      else if (h.includes('issuetype') || h.includes('type') || h.includes('problem')) colIndex.issueType = k;
      else if (h.includes('note') || h.includes('description') || h.includes('details')) colIndex.note = k;
      else if (h.includes('qty') || h.includes('quantity') || h.includes('count')) colIndex.qty = k;
    }

    // ============================================================
    // متغيرات التحليل
    // ============================================================
    var monthlyData = {};
    var vehicleSummary = {};
    var grandTotalTires = 0;
    var grandTotalTiresReceived = 0;
    var grandTotalTiresNeeded = 0;

    // ============================================================
    // دالة استخراج عدد الإطارات (معدلة)
    // ============================================================
    function extractTireQty(note, qty) {
      var noteLower = note.toLowerCase();

      // ✅ إذا كان QTY فيه رقم، استخدمه (الأولوية القصوى)
      if (qty > 0) {
        return { total: qty, type: 'received' };
      }

      // ❌ البنشر والإصلاح لا تحسب (لأنها مش تغيير إطار)
      if (/(puncture|puncher|burst|fixed puncture|repair puncture|tube|fix)/i.test(noteLower)) {
        return { total: 0, type: 'none' };
      }

      // 1. استلام أو تغيير إطار فعلي
      var changeMatch = noteLower.match(/(\d+)\s*(received|got|took|new tire|change|changed|install|put)/i);
      if (changeMatch) {
        var num = parseInt(changeMatch[1], 10) || 1;
        return { total: num, type: 'received' };
      }

      // 2. طلب إطارات (Need)
      var needMatch = noteLower.match(/(\d+)\s*(need|needed|requires|urgent|tyre|tire)/i);
      if (needMatch) {
        var num = parseInt(needMatch[1], 10) || 1;
        return { total: num, type: 'need' };
      }

      // 3. إذا كان فيه كلمة تدل على تغيير بدون رقم
      if (/(received|got|took|new tire|change|install|put|need)/i.test(noteLower)) {
        return { total: 1, type: 'received' };
      }

      return { total: 0, type: 'none' };
    }

    // ============================================================
    // المعالجة
    // ============================================================
    dataRows.forEach(function(row) {
      var dateStr = colIndex.date >= 0 ? String(row[colIndex.date] || '').trim() : '';
      var plate = colIndex.plate >= 0 ? String(row[colIndex.plate] || '').trim().toUpperCase() : '';
      var issueType = colIndex.issueType >= 0 ? String(row[colIndex.issueType] || '').trim() : '';
      var note = colIndex.note >= 0 ? String(row[colIndex.note] || '').toLowerCase() : '';
      var qty = colIndex.qty >= 0 ? Number(row[colIndex.qty]) || 0 : 0;

      if (!plate || !dateStr) return;

      var dateObj = parseDate(dateStr);
      if (!dateObj) return;

      var monthKey = dateObj.getFullYear() + '-' + String(dateObj.getMonth() + 1).padStart(2, '0');
      var monthName = dateObj.toLocaleString('default', { month: 'long' }) + ' ' + dateObj.getFullYear();

      // ============================================================
      // البيانات الشهرية
      // ============================================================
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          month: monthName,
          monthKey: monthKey,
          vehicles: {},
          totalIssues: 0,
          totalTires: 0,
          totalTiresReceived: 0,
          totalTiresNeeded: 0,
          tireChanges: 0,
          uniqueVehicles: new Set()
        };
      }

      var month = monthlyData[monthKey];
      month.totalIssues++;
      month.uniqueVehicles.add(plate);

      if (!month.vehicles[plate]) {
        month.vehicles[plate] = {
          plate: plate,
          issues: 0,
          tireChanges: 0,
          tireReceived: 0,
          tireNeeded: 0,
          issueTypes: {}
        };
      }

      var vehicle = month.vehicles[plate];
      vehicle.issues++;
      vehicle.issueTypes[issueType] = (vehicle.issueTypes[issueType] || 0) + 1;

      // ============================================================
      // حساب الإطارات (مرة واحدة فقط)
      // ============================================================
      var isTireIssue = (issueType === 'Tires' || issueType === 'Tires problem');
      var tireResult = { total: 0, type: 'none' };

      if (isTireIssue) {
        tireResult = extractTireQty(note, qty);
        var tireQty = tireResult.total;

        if (tireQty > 0) {
          // إجمالي عام
          grandTotalTires += tireQty;

          // إجمالي للشهر
          month.totalTires += tireQty;
          month.tireChanges += tireQty;

          // إجمالي للسيارة
          vehicle.tireChanges += tireQty;

          // تفريق بين مستلم ومطلوب
          if (tireResult.type === 'received') {
            grandTotalTiresReceived += tireQty;
            month.totalTiresReceived += tireQty;
            vehicle.tireReceived += tireQty;
          } else if (tireResult.type === 'need') {
            grandTotalTiresNeeded += tireQty;
            month.totalTiresNeeded += tireQty;
            vehicle.tireNeeded += tireQty;
          }
        }
      }

      // ============================================================
      // الملخص العام للسيارة
      // ============================================================
      if (!vehicleSummary[plate]) {
        vehicleSummary[plate] = {
          plate: plate,
          totalIssues: 0,
          totalTires: 0,
          totalTiresReceived: 0,
          totalTiresNeeded: 0,
          months: new Set(),
          issueTypes: {}
        };
      }

      var summary = vehicleSummary[plate];
      summary.totalIssues++;
      summary.months.add(monthKey);
      summary.issueTypes[issueType] = (summary.issueTypes[issueType] || 0) + 1;

      if (isTireIssue && tireResult.total > 0) {
        summary.totalTires += tireResult.total;
        if (tireResult.type === 'received') {
          summary.totalTiresReceived += tireResult.total;
        } else if (tireResult.type === 'need') {
          summary.totalTiresNeeded += tireResult.total;
        }
      }
    });

    // ============================================================
    // بناء التقارير النهائية
    // ============================================================
    var monthlyReport = [];
    Object.keys(monthlyData).sort().forEach(function(key) {
      var month = monthlyData[key];
      var vehiclesArray = Object.values(month.vehicles);
      vehiclesArray.sort(function(a, b) { return b.issues - a.issues; });
      monthlyReport.push({
        month: month.month,
        monthKey: month.monthKey,
        totalIssues: month.totalIssues,
        totalTires: month.totalTires,
        totalTiresReceived: month.totalTiresReceived,
        totalTiresNeeded: month.totalTiresNeeded,
        tireChanges: month.tireChanges,
        uniqueVehicles: month.uniqueVehicles.size,
        vehicles: vehiclesArray
      });
    });

    var vehicleReport = Object.values(vehicleSummary).map(function(item) {
      return {
        plate: item.plate,
        totalIssues: item.totalIssues,
        totalTires: item.totalTires,
        totalTiresReceived: item.totalTiresReceived,
        totalTiresNeeded: item.totalTiresNeeded,
        monthsCount: item.months.size,
        avgIssuesPerMonth: (item.totalIssues / item.months.size).toFixed(1),
        issueTypes: item.issueTypes
      };
    });
    vehicleReport.sort(function(a, b) { return b.totalIssues - a.totalIssues; });

    // السيارات المستهترة (5+ مشاكل في الشهر)
    var highMaintenanceVehicles = [];
    monthlyReport.forEach(function(month) {
      month.vehicles.forEach(function(vehicle) {
        if (vehicle.issues >= 5) {
          highMaintenanceVehicles.push({
            plate: vehicle.plate,
            month: month.month,
            issues: vehicle.issues,
            tireChanges: vehicle.tireChanges,
            tireReceived: vehicle.tireReceived,
            tireNeeded: vehicle.tireNeeded
          });
        }
      });
    });

    // ============================================================
    // الإرجاع النهائي
    // ============================================================
    return {
      summary: {
        totalIssues: dataRows.length,
        totalVehicles: Object.keys(vehicleSummary).length,
        totalTires: grandTotalTires,
        totalTiresReceived: grandTotalTiresReceived,
        totalTiresNeeded: grandTotalTiresNeeded
      },
      monthlyReport: monthlyReport,
      vehicleReport: vehicleReport,
      top10Vehicles: vehicleReport.slice(0, 10),
      highMaintenanceVehicles: highMaintenanceVehicles,
      problemBreakdown: []
    };

  } catch (err) {
    return {
      error: err.toString(),
      summary: { totalIssues: 0, totalVehicles: 0, totalTires: 0, totalTiresReceived: 0, totalTiresNeeded: 0 },
      monthlyReport: [],
      vehicleReport: [],
      top10Vehicles: [],
      highMaintenanceVehicles: [],
      problemBreakdown: []
    };
  }
}

// ============================================================
// دالة مساعدة لتحويل التاريخ
// ============================================================
function parseDate(dateStr) {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return dateStr;

  var d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;

  var match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    return new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
  }

  var match2 = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (match2) {
    return new Date(Number(match2[3]), Number(match2[2]) - 1, Number(match2[1]));
  }

  return null;
}

// ============================================================
// EXPORT VEHICLE REPORT TO EXCEL - CORRECTED
// ============================================================
function exportVehicleReportToExcel() {
  try {
    var data = getVehicleReportAdvanced();
    if (data.error) {
      return { error: data.error };
    }

    var ss = SpreadsheetApp.create('Vehicle Maintenance Report - ' + new Date().toLocaleDateString());
    var sheet = ss.getActiveSheet();
    sheet.setName('Vehicle Report');

    // ✅ كتابة البيانات بشكل مباشر ودون استخدام mergeCells المعقدة
    var row = 1;
    sheet.getRange(row, 1).setValue('VEHICLE MAINTENANCE REPORT');
    sheet.getRange(row, 1).setFontWeight('bold');
    sheet.getRange(row, 1).setFontSize(16);
    row += 2;

    // Summary
    sheet.getRange(row, 1).setValue('Total Issues:');
    sheet.getRange(row, 2).setValue(data.summary.totalIssues || 0);
    row++;
    sheet.getRange(row, 1).setValue('Total Vehicles:');
    sheet.getRange(row, 2).setValue(data.summary.totalVehicles || 0);
    row++;
    sheet.getRange(row, 1).setValue('Total Tires Changed:');
    sheet.getRange(row, 2).setValue(data.summary.totalTires || 0);
    row += 2;

    // Monthly Report Header
    sheet.getRange(row, 1).setValue('MONTHLY BREAKDOWN');
    sheet.getRange(row, 1).setFontWeight('bold');
    row++;
    var monthHeaders = ['Month', 'Vehicles', 'Total Issues', 'Tires Changed'];
    sheet.getRange(row, 1, 1, monthHeaders.length).setValues([monthHeaders]);
    sheet.getRange(row, 1, 1, monthHeaders.length).setFontWeight('bold');
    sheet.getRange(row, 1, 1, monthHeaders.length).setBackground('#0f172a');
    sheet.getRange(row, 1, 1, monthHeaders.length).setFontColor('#ffffff');
    row++;

    // Monthly Data
    (data.monthlyReport || []).forEach(function(month) {
      sheet.getRange(row, 1).setValue(month.month);
      sheet.getRange(row, 2).setValue(month.uniqueVehicles || 0);
      sheet.getRange(row, 3).setValue(month.totalIssues || 0);
      sheet.getRange(row, 4).setValue(month.tireChanges || 0);
      row++;
    });

    sheet.autoResizeColumns(1, 4);
    var url = ss.getUrl();
    return { success: true, url: url };

  } catch (err) {
    return { error: err.toString(), success: false };
  }
}
// ============================================================
// EXPORT VEHICLE REPORT TO PDF
// ============================================================
function exportVehicleReportToPDF() {
  try {
    var data = getVehicleReportAdvanced();
    if (data.error) {
      return { error: data.error };
    }
    
    var html = buildVehicleReportHTML(data);
    var blob = Utilities.newBlob(html, 'text/html', 'report.html');
    var pdfBlob = blob.getAs('application/pdf');
    pdfBlob.setName('Vehicle Maintenance Report - ' + new Date().toLocaleDateString() + '.pdf');
    
    var file = DriveApp.createFile(pdfBlob);
    var url = file.getUrl();
    
    return { success: true, url: url };
    
  } catch (err) {
    return { error: err.toString(), success: false };
  }
}
// ============================================================
// BUILD VEHICLE REPORT HTML FOR PDF
// ============================================================
function buildVehicleReportHTML(data) {
  var summary = data.summary || {};
  var monthlyReport = data.monthlyReport || [];
  var vehicleReport = data.vehicleReport || [];
  var highMaintenance = data.highMaintenanceVehicles || [];
  
  var html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Vehicle Maintenance Report</title>
    <style>
      body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #333; }
      h1 { color: #0f172a; border-bottom: 3px solid #2563eb; padding-bottom: 10px; }
      h2 { color: #1e293b; margin-top: 30px; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; }
      table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 13px; }
      th { background: #0f172a; color: white; padding: 10px; text-align: left; }
      td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
      tr:nth-child(even) { background: #f8fafc; }
      .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin: 20px 0; }
      .summary-card { background: #f1f5f9; padding: 20px; border-radius: 12px; text-align: center; }
      .summary-number { font-size: 32px; font-weight: 700; color: #2563eb; }
      .summary-label { color: #64748b; font-size: 14px; }
      .alert { background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; }
      .alert h3 { color: #dc2626; margin: 0 0 10px 0; }
      .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; }
      .badge-danger { background: #dc2626; color: white; }
      .badge-warning { background: #f59e0b; color: white; }
      .badge-success { background: #10b981; color: white; }
      .badge-primary { background: #3b82f6; color: white; }
      .footer { margin-top: 40px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 20px; }
      .section { page-break-after: always; }
    </style>
  </head>
  <body>
    <h1>🚗 Vehicle Maintenance Report</h1>
    <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
    
    <!-- SUMMARY -->
    <div class="summary-grid">
      <div class="summary-card">
        <div class="summary-number">${summary.totalIssues || 0}</div>
        <div class="summary-label">Total Issues</div>
      </div>
      <div class="summary-card">
        <div class="summary-number">${summary.totalVehicles || 0}</div>
        <div class="summary-label">Total Vehicles</div>
      </div>
      <div class="summary-card">
        <div class="summary-number">${summary.totalTires || 0}</div>
        <div class="summary-label">Total Tires Changed</div>
      </div>
    </div>
  `;
  
  // HIGH MAINTENANCE ALERT
  if (highMaintenance.length > 0) {
    html += `
      <div class="alert">
        <h3>⚠️ High Maintenance Vehicles (5+ Issues in a Month)</h3>
        <table>
          <thead><tr><th>Vehicle</th><th>Month</th><th>Issues</th><th>Tires Changed</th></tr></thead>
          <tbody>
            ${highMaintenance.map(function(item) {
              return `<tr><td><strong>${item.plate}</strong></td><td>${item.month}</td><td><span class="badge badge-danger">${item.issues}</span></td><td>${item.tireChanges}</td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  
  // MONTHLY BREAKDOWN
  html += `
    <h2>📅 Monthly Breakdown</h2>
    <table>
      <thead><tr><th>Month</th><th>Vehicles</th><th>Total Issues</th><th>Tires Changed</th></tr></thead>
      <tbody>
        ${monthlyReport.map(function(month) {
          return `<tr><td><strong>${month.month}</strong></td><td>${month.uniqueVehicles}</td><td>${month.totalIssues}</td><td>${month.tireChanges}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
  
  // MONTHLY DETAILS
  html += `<h2>📊 Monthly Vehicle Details</h2>`;
  monthlyReport.forEach(function(month) {
    html += `
      <h3 style="color: #2563eb; margin-top: 20px;">${month.month}</h3>
      <table>
        <thead><tr><th>#</th><th>Vehicle</th><th>Issues</th><th>Tires Changed</th><th>Issue Types</th></tr></thead>
        <tbody>
          ${month.vehicles.map(function(vehicle, idx) {
            var issueTypes = [];
            for (var type in vehicle.issueTypes) {
              issueTypes.push(type + ' (' + vehicle.issueTypes[type] + ')');
            }
            var rowColor = vehicle.issues >= 5 ? 'style="background: #fef2f2;"' : '';
            return `<tr ${rowColor}><td>${idx + 1}</td><td><strong>${vehicle.plate}</strong></td><td><span class="badge ${vehicle.issues >= 5 ? 'badge-danger' : 'badge-primary'}">${vehicle.issues}</span></td><td>${vehicle.tireChanges}</td><td>${issueTypes.join(', ') || '-'}</td></tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
  });
  
  // FULL VEHICLE REPORT
  html += `
    <h2>🚗 Full Vehicle Report (All Vehicles)</h2>
    <table>
      <thead><tr><th>#</th><th>Vehicle</th><th>Total Issues</th><th>Total Tires</th><th>Months Active</th><th>Avg Issues/Month</th></tr></thead>
      <tbody>
        ${vehicleReport.map(function(item, idx) {
          var rowColor = item.totalIssues >= 10 ? 'style="background: #fef2f2;"' : '';
          return `<tr ${rowColor}><td>${idx + 1}</td><td><strong>${item.plate}</strong></td><td><span class="badge ${item.totalIssues >= 10 ? 'badge-danger' : 'badge-primary'}">${item.totalIssues}</span></td><td>${item.totalTires}</td><td>${item.monthsCount}</td><td>${item.avgIssuesPerMonth}</td></tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
  
  html += `
    <div class="footer">
      Report generated on ${new Date().toLocaleString()} | Fleet Maintenance System
    </div>
  </body>
  </html>
  `;
  
  return html;
}
function testVehicleSheet() {
  var id = '12_WSi8KrHZ9-dtZzrlHmTCI-Jiwg7zDieJ5NU3-lVxY';
  var ss = SpreadsheetApp.openById(id);
  return ss.getName();
}
