/**
 * Design Studio — api.gs
 * Google Apps Script backend for the Design Studio Task Manager
 *
 * SETUP:
 * 1. Open Sheet 2 (KPI & Evaluation) → Extensions → Apps Script
 * 2. Paste this entire file → Save
 * 3. Run setup() once to create the History sheet
 * 4. Deploy → New Deployment → Web App
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the Web App URL → paste in Design Studio Settings
 */

// ── CONFIG ─────────────────────────────────────────────────
const SHEET1_ID = '1HG0XOG1vh8jrMsfDZLMabq3hHSLoAReLiVzpQQBQQr4';
const SHEET3_ID = '1KlcOk3eAf8fjS-jgyi4wB2CYcLVXwmTsPhsoysP04Lw';

// Exact Tab Names (matches your emojis)
const TAB = {
  CD: 'CD',
  ANU: '🔒 👧🏻 ANU',
  AYSH: '🔒 👧🏻 AYSH',
  ASIF: '🔒 👦🏻 ASIF',
  SAFNAS: '🔒 👧🏻 SAFNAS',
  KPI_PREFIX: '🔍 KPI - ',
};

// Sheet 1 column map (Updated for checkboxes)
const COL = {
  ENTRY_DATE: 1,  // A
  CLIENT:     2,  // B
  TASK:       3,  // C
  STATUS:     4,  // D
  DESIGN_DUE: 5,  // E
  FINAL_DUE:  7,  // G (Skipping checkbox F)
  CLOSE_DATE: 9,  // I (Skipping checkbox H)
  ASSIGNEE:   11, // K (Skipping checkbox J)
  WEEK_NUM:   13, // M
  CARRY_OVER: 14, // N
  H_TARGET:   15, // O
};

// Week History tab (will be auto-created)
const HISTORY_TAB = 'WEEK HISTORY';

// ── ROUTING ────────────────────────────────────────────────

function doGet(e) {
  const action = e.parameter.action || '';
  let result;
  try {
    switch(action) {
      case 'ping':       result = { ok: true, time: new Date().toISOString() }; break;
      case 'getTasks':   result = getTasks(); break;
      case 'getKPI':     result = getKPI(e.parameter.designer); break;
      case 'getHistory': result = getHistory(); break;
      case 'getWeekly':  result = getWeeklyData(e.parameter.designer, e.parameter.week); break;
      default:           result = { error: 'Unknown action: ' + action };
    }
  } catch(err) {
    result = { error: err.message };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let body, result;
  try {
    body = JSON.parse(e.postData.contents);
    switch(body.action) {
      case 'createTask':  result = createTask(body.task); break;
      case 'updateTask':  result = updateTask(body.task); break;
      case 'closeWeek':   result = closeWeek(body.weekNum, body.snapshot); break;
      case 'saveWeekly':  result = saveWeeklyRow(body.designer, body.weekNum, body.rows); break;
      case 'saveKPI':     result = saveKPIScore(body.designer, body.taskId, body.quality, body.impact); break;
      default:            result = { error: 'Unknown action: ' + body.action };
    }
  } catch(err) {
    result = { error: err.message };
  }
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── TASKS ──────────────────────────────────────────────────

function getTasks() {
  const ss  = SpreadsheetApp.openById(SHEET1_ID);
  const sh  = ss.getSheetByName(TAB.CD);
  if (!sh) return { error: 'CD tab not found in Sheet 1' };

  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const tasks = rows.slice(1).map((r, i) => ({
    rowIndex:  i + 2,
    entryDate: formatVal(r[COL.ENTRY_DATE - 1]),
    client:    r[COL.CLIENT - 1] || '',
    task:      r[COL.TASK - 1] || '',
    status:    r[COL.STATUS - 1] || 'Pending',
    designDue: formatVal(r[COL.DESIGN_DUE - 1]),
    finalDue:  formatVal(r[COL.FINAL_DUE - 1]),
    closeDate: formatVal(r[COL.CLOSE_DATE - 1]),
    assignee:  r[COL.ASSIGNEE - 1] || '',
    weekNum:   r[COL.WEEK_NUM - 1] || '',
    carryOver: r[COL.CARRY_OVER - 1] === true || r[COL.CARRY_OVER - 1] === 'TRUE',
    hTarget:   r[COL.H_TARGET - 1] || '',
  })).filter(t => t.task);

  return { tasks, count: tasks.length };
}

function createTask(task) {
  const ss = SpreadsheetApp.openById(SHEET1_ID);
  const sh = ss.getSheetByName(TAB.CD);
  if (!sh) return { error: 'CD tab not found' };

  const row = [
    task.entryDate || new Date().toLocaleDateString('en-IN'),
    task.client || '',
    task.task || '',
    task.status || 'Pending',
    task.designDue || '',
    task.finalDue || '',
    '',  // close date — empty
    task.assignee || '',
    task.weekNum || '',
    false,  // carry over
    task.hTarget || '',
  ];

  sh.appendRow(row);

  // Also mirror to designer's tab if it exists
  mirrorToDesignerTab(ss, task);

  return { ok: true, message: 'Task created in Sheet 1 CD tab' };
}

function updateTask(task) {
  const ss = SpreadsheetApp.openById(SHEET1_ID);
  const sh = ss.getSheetByName(TAB.CD);
  if (!sh) return { error: 'CD tab not found' };

  const rows = sh.getDataRange().getValues();
  // Find row by task name + assignee (best match we have without unique ID in sheet)
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][COL.TASK-1] === task.task && rows[i][COL.ASSIGNEE-1] === task.assignee) {
      sh.getRange(i+1, COL.STATUS).setValue(task.status);
      if (task.closeDate) sh.getRange(i+1, COL.CLOSE_DATE).setValue(task.closeDate);
      if (task.carryOver !== undefined) sh.getRange(i+1, COL.CARRY_OVER).setValue(task.carryOver);
      return { ok: true, rowUpdated: i+1 };
    }
  }
  return { ok: false, message: 'Task row not found in sheet' };
}

function mirrorToDesignerTab(ss, task) {
  const tabName = TAB[task.assignee.toUpperCase()];
  if (!tabName) return;
  const sh = ss.getSheetByName(tabName);
  if (!sh) return;

  // Insert logic to find the correct Weekly Section
  const data = sh.getDataRange().getValues();
  const targetWeek = `Week ${task.weekNum || getWeekNum()}`;
  let weekRow = -1;

  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).includes(targetWeek)) { weekRow = i + 1; break; }
  }

  if (weekRow !== -1) {
    // Insert row under the week header to keep grouping
    sh.insertRowAfter(weekRow);
    sh.getRange(weekRow + 1, 1, 1, 8).setValues([[
      task.client || '',
      task.entryDate || '',
      task.task || '',
      task.finalDue || '',
      task.status || 'Pending',
      '', '', '' // Remarks columns
    ]]);
  } else {
    // Fallback: append at bottom if week not found
    sh.appendRow([task.client, task.entryDate, task.task, task.finalDue, task.status]);
  }
}

// Helper to get current week (fallback)
function getWeekNum() {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - start) / 86400000) + start.getDay() + 1) / 7);
}

// ── WEEK CLOSE ─────────────────────────────────────────────

function closeWeek(weekNum, snapshot) {
  const ss = SpreadsheetApp.openById(SHEET1_ID);
  const sh = ss.getSheetByName(SHEET1_CD_TAB);
  if (!sh) return { error: 'CD tab not found' };

  const rows = sh.getDataRange().getValues();
  const carryoverTasks = [];

  // 1. Mark incomplete tasks as Carry Over in Sheet 1
  for (let i = 1; i < rows.length; i++) {
    const rowWeek   = parseInt(rows[i][COL.WEEK_NUM - 1]) || 0;
    const rowStatus = (rows[i][COL.STATUS - 1] || '').toLowerCase();
    if (rowWeek === weekNum && !rowStatus.includes('done') && !rowStatus.includes('complet') && !rowStatus.includes('clos')) {
      sh.getRange(i+1, COL.CARRY_OVER).setValue(true);
      carryoverTasks.push({
        client:    rows[i][COL.CLIENT - 1],
        task:      rows[i][COL.TASK - 1],
        assignee:  rows[i][COL.ASSIGNEE - 1],
        designDue: rows[i][COL.DESIGN_DUE - 1],
        finalDue:  rows[i][COL.FINAL_DUE - 1],
        hTarget:   rows[i][COL.H_TARGET - 1],
      });
    }
  }

  // 2. Add carry-over tasks to next week in Sheet 1
  const nextWeek = weekNum + 1;
  carryoverTasks.forEach(t => {
    sh.appendRow([
      new Date().toLocaleDateString('en-IN'), // entry date = today
      t.client,
      t.task,
      'Pending',
      t.designDue || '',
      t.finalDue  || '',
      '',
      t.assignee,
      nextWeek,
      true,  // carry over = TRUE
      t.hTarget || '',
    ]);
  });

  // 3. Save to History tab
  saveWeekToHistory(ss, weekNum, snapshot, carryoverTasks.length);

  return { ok: true, weekNum, carryovers: carryoverTasks.length, nextWeek };
}

function saveWeekToHistory(ss, weekNum, snapshot, totalCarryovers) {
  let histSh = ss.getSheetByName(HISTORY_TAB);
  if (!histSh) {
    histSh = ss.insertSheet(HISTORY_TAB);
    histSh.appendRow(['Week #', 'Close Date', 'Designer', 'Assigned', 'Completed', 'Carry Overs', 'Rate %', 'Notes']);
    histSh.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#1a1b22').setFontColor('#e8eaf0');
  }

  const closeDate = new Date().toLocaleDateString('en-IN');
  if (snapshot && snapshot.designers) {
    Object.entries(snapshot.designers).forEach(([key, d]) => {
      histSh.appendRow([weekNum, closeDate, d.name, d.assigned, d.completed, d.carryovers, d.rate + '%', '']);
    });
  } else {
    histSh.appendRow([weekNum, closeDate, 'All', '—', '—', totalCarryovers, '—', '']);
  }
}

// ── WEEKLY DATA ────────────────────────────────────────────

function getWeeklyData(designer, weekNum) {
  const ss = SpreadsheetApp.openById(SHEET3_ID);
  const tabMap = { anu:'ANU', asif:'ASIF', aysha:'AYSHA', safnas:'SAFNAS' };
  const tabName = tabMap[(designer||'').toLowerCase()];
  if (!tabName) return { error: 'Unknown designer: ' + designer };
  const sh = ss.getSheetByName(tabName);
  if (!sh) return { error: `Tab ${tabName} not found in Sheet 3` };

  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const data = rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = r[i]);
    return obj;
  }).filter(r => r['DATE'] || r['Date']);

  return { rows: data };
}

function saveWeeklyRow(designer, weekNum, rows) {
  // Save weekly data back to Sheet 3 (Date-based appending)
  const ss = SpreadsheetApp.openById(SHEET3_ID);
  const tabName = (designer||'').toUpperCase();
  const sh = ss.getSheetByName(tabName);
  if (!sh) return { error: `Tab ${tabName} not found in Sheet 3` };

  const data = sh.getDataRange().getValues();
  
  rows.forEach(r => {
    if (!r.date) return;
    const targetDate = r.date; // Expecting DD/MM/YYYY
    
    // Find the row with this date
    for (let i = 0; i < data.length; i++) {
       const rowDate = formatVal(data[i][0]);
       if (rowDate === targetDate) {
         // Found it! Append task text to the existing cell in Column B
         const cell = sh.getRange(i + 1, 2);
         const currentContent = cell.getValue();
         const newContent = currentContent ? currentContent + "\n" + r.task : r.task;
         cell.setValue(newContent);
         
         // Update other daily flags if provided
         if (r.h) sh.getRange(i + 1, 3).setValue(r.h);
         if (r.completed) sh.getRange(i + 1, 4).setValue(r.completed);
         break;
       }
    }
  });

  return { ok: true };
}

// ── KPI ────────────────────────────────────────────────────

function getKPI(designer) {
  // Return task data with computed deadline scores and manual scores from Sheet 2
  const tasks = getTasks();
  if (tasks.error) return tasks;
  const d = tasks.tasks.filter(t =>
    (t.assignee || '').toLowerCase().includes((designer || '').toLowerCase())
  );
  return { tasks: d };
}

function saveKPIScore(designer, taskDescription, quality, impact) {
  // Store in Sheet 2 — find the row by designer + task
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = `${TAB.KPI_PREFIX}${designer.toUpperCase()}`;
  let sh = ss.getSheetByName(sheetName);

  if (!sh) {
    sh = ss.insertSheet(sheetName);
    sh.appendRow(['Task', 'Client', 'Week', 'Entry Date', 'Final Due', 'Close Date', 'Deadline Score', 'H Score', 'Quality Score', 'Impact Score', 'Total Score', 'Month']);
    sh.getRange(1, 1, 1, 11).setFontWeight('bold');
  }

  // Find precisely which column is Quality/Impact based on headers
  const headers = sh.getRange(1, 1, 1, 15).getValues()[0];
  const colQ = headers.indexOf('Quality Score') + 1 || 9;
  const colI = headers.indexOf('Impact Score') + 1 || 10;
  const colT = headers.indexOf('Total Score') + 1 || 11;

  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === taskDescription) {
      sh.getRange(i+1, colQ).setValue(quality);
      sh.getRange(i+1, colI).setValue(impact);
      
      // We don't touch Total Score if it's a formula, 
      // but if user wants script to calculate:
      const dl = parseFloat(rows[i][6]) || 0;
      const total = parseFloat(quality)*0.4 + parseFloat(impact)*0.3 + dl*0.3/10;
      sh.getRange(i+1, colT).setValue(total.toFixed(2));
      return { ok: true, total: total.toFixed(2) };
    }
  }

  sh.appendRow([taskDescription, '', '', '', '', '', '', '', quality, impact, '']);
  return { ok: true };
}

// ── HISTORY ────────────────────────────────────────────────

function getHistory() {
  const ss = SpreadsheetApp.openById(SHEET1_ID);
  const sh = ss.getSheetByName(HISTORY_TAB);
  if (!sh) return { weeks: [] };

  const rows = sh.getDataRange().getValues();
  const headers = rows[0];
  const data = rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = r[i]);
    return obj;
  });

  return { weeks: data };
}

// ── HELPERS ────────────────────────────────────────────────

function formatVal(val) {
  if (!val) return '';
  if (val instanceof Date) return val.toLocaleDateString('en-IN');
  return String(val);
}

// ── ONE-TIME SETUP ─────────────────────────────────────────

function setup() {
  // Run this once to ensure history tab exists and Sheet 1 has the new columns
  const ss1 = SpreadsheetApp.openById(SHEET1_ID);
  const sh1  = ss1.getSheetByName(SHEET1_CD_TAB);

  if (sh1) {
    const lastCol = sh1.getLastColumn();
    if (lastCol < 9)  sh1.getRange(1, 9).setValue('Week #');
    if (lastCol < 10) sh1.getRange(1, 10).setValue('Carry Over');
    if (lastCol < 11) sh1.getRange(1, 11).setValue('H Score Target');
    Logger.log('Sheet 1 columns ensured');
  }

  // Create history tab
  let histSh = ss1.getSheetByName(HISTORY_TAB);
  if (!histSh) {
    histSh = ss1.insertSheet(HISTORY_TAB);
    histSh.appendRow(['Week #', 'Close Date', 'Designer', 'Assigned', 'Completed', 'Carry Overs', 'Rate %', 'Notes']);
    histSh.getRange(1, 1, 1, 8).setFontWeight('bold');
    Logger.log('History tab created');
  }

  Logger.log('Setup complete!');
}

// ── AUTO-SYNC TRIGGER (optional) ──────────────────────────

function setupTrigger() {
  // Run this once to set up hourly sync
  ScriptApp.newTrigger('syncKPIAll')
    .timeBased()
    .everyHours(1)
    .create();
  Logger.log('Hourly trigger created');
}

function syncKPIAll() {
  // Auto-populate KPI sheets from Sheet 1 task data
  const tasks = getTasks();
  if (tasks.error) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const designers = ['anu','asif','aysha','safnas'];
  const nameMap = { anu:['anu'], asif:['asif'], aysha:['aysh','aysha'], safnas:['safnas'] };
  const tabMap  = { anu:'KPI - ANU', asif:'KPI - ASIF', aysha:'KPI - AYSH', safnas:'KPI - SAF' };

  designers.forEach(d => {
    const designerTasks = tasks.tasks.filter(t =>
      nameMap[d].some(n => (t.assignee||'').toLowerCase().includes(n))
    );
    let sh = ss.getSheetByName(tabMap[d]);
    if (!sh) { sh = ss.insertSheet(tabMap[d]); sh.appendRow(['Task','Client','Week','Entry Date','Final Due','Close Date','Deadline Score','H Target','Quality Score','Impact Score','Total Score']); }

    const rows = sh.getDataRange().getValues();
    designerTasks.forEach(task => {
      // Check if already exists
      const exists = rows.slice(1).find(r => r[0] === task.task);
      if (!exists) {
        sh.appendRow([ task.task, task.client, task.weekNum, task.entryDate, task.finalDue, task.closeDate, '', task.hTarget, '', '', '' ]);
      }
    });
  });
  Logger.log('KPI sync complete: ' + new Date().toLocaleString());
}
