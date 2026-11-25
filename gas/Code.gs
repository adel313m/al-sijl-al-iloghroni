/**
 * ============================================================
 *  وسيط Google Apps Script — السجل الإلكتروني (النسخة الثانية)
 * ============================================================
 *  الأغراض:
 *    push  → استلام تحديث مشفّر وتخزينه مؤقتاً.
 *    pull  → إعادة كل التحديثات المعلّقة للجهاز.
 *    ack   → حذف التحديث فور تأكيد الجهاز لاستلامه (حذف تلقائي).
 *    weeklyPdfReport → دالة مجدولة أسبوعياً تُنشئ PDF وترسله للبريد الإداري.
 *    sendVerificationCode → إرسال رمز تأكيد Gmail عبر MailApp.
 *    sheetPush / sheetPull → دفع وقراءة ورقتَي الكادر والوجبات كدفتر مرجعي.
 *
 *  الأنواع الجديدة التي يمررها الوسيط دون قراءة حمولتها المشفّرة:
 *    task      → مهمة مسندة لوجبة (تنبيه فوري للكادر بعد المزامنة).
 *    broadcast → تعميم إداري عاجل يظهر أعلى كل الشاشات.
 *    approval  → ختم اعتماد المسؤول على سجل يوم.
 *    schedule  → جدول مناوبة اليوم.
 *  النوع weeklyDigest وحده يُرفق ببيانات مقروءة (لقطة الأسبوع) ليُستخدم
 *  في توليد ملف PDF البريدي؛ بقية بيانات التطبيق تبقى مشفّرة محلياً.
 *
 *  خطوات النشر:
 *    1) أنشئ مشروع Apps Script جديد (Extensions → Apps Script).
 *    2) الصق هذا الكود في Code.gs واحفظه.
 *    3) إن أردت حماية الوسيط، ضع قيمة في SECRET_TOKEN (ويُفضّل استخدام
 *       PropertiesService بدلاً من نصّ ثابت في الإنتاج).
 *    4) Deploy → New deployment → Web app:
 *         Execute as: Me
 *         Who has access: Anyone
 *    5) انسخ رابط /exec وألصقه في صفحة «الوسيط والإعدادات» في الموقع.
 *       بريد التقارير يُؤخذ من البريد الإداري المؤكَّد في التطبيق تلقائياً.
 *    6) من محرر السكربت شغّل دالة installWeeklyTrigger مرة واحدة فقط
 *       لإنشاء المؤقت الأسبوعي (يوم الأحد 8 صباحاً). راجع README للتفاصيل.
 *
 *  ملاحظات مهمة:
 *    - العميل يرسل JSON كنصّ (Content-Type: text/plain) لتجنّب طلب
 *      preflight الذي لا يدعمه GAS. لا تغيّر نوع المحتوى إلى application/json.
 *    - التخزين هنا في Script Properties وهو مناسب للنموذج الأولي فقط
 *      (حد الحجم تقريباً 9KB للقيمة). للإنتاج استخدم Google Sheet أو
 *      Firestore واجعل عملية ack تحذف الصف/المستند نفسه.
 *    - الحمولة (payload) مشفّرة من طرف التطبيق؛ السكربت لا يقرأ محتواها.
 */

var PROP_KEY = 'SIJL_RELAY_QUEUE_V2';
var DIGEST_KEY = 'SIJL_WEEKLY_DIGEST_V1';
var TTL_MS = 24 * 60 * 60 * 1000; // حذف احتياطي بعد يوم كامل حتى بدون ACK
var SECRET_TOKEN = ''; // اتركه فارغاً للنسخة التجريبية، أو ضع سراً مشتركاً

/** نقطة الدخول لطلبات GET — تُستخدم لفحص الاتصال. */
function doGet(e) {
  return respond({
    ok: true,
    service: 'al-sijl-relay',
    version: 2,
    pending: readQueue().length,
    hasWeeklyDigest: Boolean(readDigest()),
  });
}

/** نقطة الدخول لطلبات POST من الموقع. */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return respond({ ok: false, error: 'طلب فارغ' });
    }

    var request = JSON.parse(e.postData.contents);

    if (SECRET_TOKEN && request.token !== SECRET_TOKEN) {
      return respond({ ok: false, error: 'رمز الوصول غير صالح' });
    }

    if (request.action === 'push') {
      return handlePush(request.message);
    }
    if (request.action === 'ping') {
      return respond({ ok: true, service: 'al-sijl-relay', pending: readQueue().length });
    }
    if (request.action === 'sendVerificationCode') {
      return handleVerificationEmail(request.email, request.code);
    }
    if (request.action === 'sheetPush') {
      return handleSheetPush(request.payload);
    }
    if (request.action === 'sheetPull') {
      return handleSheetPull(request.sheetConfig);
    }
    if (request.action === 'pull') {
      return respond({ ok: true, data: readQueue().map(function (item) { return item.message; }) });
    }
    if (request.action === 'ack') {
      return handleAck(request.id);
    }
    return respond({ ok: false, error: 'إجراء غير معروف' });
  } catch (error) {
    return respond({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

/**
 * حفظ رسالة مشفّرة في الطابور المؤقت مع تاريخ انتهاء صلاحية.
 * لو كانت الرسالة لقطة أسبوعية نحتفظ بنسخة منفصلة قبل حذفها بـ ACK،
 * لأن الطابور نفسه يُفرَّغ فور استلام الجهاز له.
 */
function handlePush(message) {
  if (!message || !message.id || !message.payload) {
    return respond({ ok: false, error: 'الرسالة غير مكتملة' });
  }

  if (message.type === 'weeklyDigest' && message.digest) {
    PropertiesService.getScriptProperties().setProperty(DIGEST_KEY, JSON.stringify(message.digest));
  }

  var queue = readQueue();
  var exists = queue.some(function (item) { return item.message.id === message.id; });
  if (!exists) {
    queue.push({
      message: message,
      expiresAt: Date.now() + TTL_MS,
    });
    writeQueue(queue);
  }
  return respond({ ok: true, queued: queue.length });
}

/** حذف الرسالة بعد تأكيد الاستلام — هذه هي آلية الحذف التلقائي. */
function handleAck(id) {
  var queue = readQueue();
  var next = queue.filter(function (item) { return item.message.id !== id; });
  writeQueue(next);
  return respond({ ok: true, remaining: next.length });
}

/** قراءة الطابور مع تجاهل العناصر المنتهية الصلاحية. */
function readQueue() {
  var raw = PropertiesService.getScriptProperties().getProperty(PROP_KEY);
  if (!raw) return [];
  try {
    var items = JSON.parse(raw);
    var now = Date.now();
    var fresh = items.filter(function (item) { return item.expiresAt > now; });
    if (fresh.length !== items.length) writeQueue(fresh);
    return fresh;
  } catch (error) {
    return [];
  }
}

function writeQueue(items) {
  PropertiesService.getScriptProperties().setProperty(PROP_KEY, JSON.stringify(items));
}

function readDigest() {
  var raw = PropertiesService.getScriptProperties().getProperty(DIGEST_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

/** إرجاع JSON عبر ContentService (يتوافق مع CORS بعد إعادة توجيه GAS). */
function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ============================================================
 *  تأكيد بريد المسؤول + مزامنة Google Sheets
 * ============================================================ */

/** إرسال رمز تأكيد Gmail من السكربت (يُستخدم في وضع GAS فقط). */
function handleVerificationEmail(to, code) {
  if (!to || !/@gmail\.com$/i.test(String(to))) {
    return respond({ ok: false, error: 'البريد يجب أن يكون Gmail رسمياً' });
  }
  MailApp.sendEmail({
    to: String(to),
    subject: 'رمز تأكيد البريد الإداري — السجل الإلكتروني',
    body: 'رمز التأكيد الخاص بك: ' + code + '\n\nصالح لمدة 10 دقائق فقط. إن لم تكن أنت من طلبه تجاهل هذه الرسالة.',
  });
  return respond({ ok: true });
}

/** فتح الملف بالمعرّف أو بالاسم (لدعم كلا الخيارين في واجهة الموقع). */
function openSpreadsheet_(reference) {
  var ref = String(reference || '').trim();
  if (!ref) throw new Error('لم يُحدد معرّف أو اسم ملف Google Sheets');
  try {
    return SpreadsheetApp.openById(ref);
  } catch (error) {
    var files = DriveApp.getFilesByName(ref);
    while (files.hasNext()) {
      var file = files.next();
      if (file.getMimeType() === MimeType.SPREADSHEET) return SpreadsheetApp.open(file);
    }
    throw new Error('تعذّر فتح ملف Sheets: تحقق من المعرّف/الاسم ومشاركة الملف مع حساب السكربت');
  }
}

function getOrCreateSheet_(spreadsheet, name) {
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  sheet.clear();
  return sheet;
}

function writeTextRows_(sheet, rows) {
  if (!rows.length) return;
  var range = sheet.getRange(1, 1, rows.length, rows[0].length);
  range.setNumberFormat('@'); // منع تحويل الرموز/التجزئات إلى صيغ أو أرقام
  range.setValues(rows);
  sheet.setFrozenRows(1);
}

/** دفع الكادر والوجبات إلى الأوراق: الرموز تصل كتجزئة وقيمة مشفّرة فقط. */
function handleSheetPush(payload) {
  if (!payload || !payload.staffSheet || !payload.shiftsSheet) {
    return respond({ ok: false, error: 'بيانات المزامنة غير مكتملة' });
  }
  var spreadsheet = openSpreadsheet_(payload.spreadsheetId);

  var shifts = getOrCreateSheet_(spreadsheet, payload.shiftsSheet);
  var shiftRows = [['Order', 'Meal ID', 'Name', 'Label']];
  (payload.meals || []).slice().sort(function (a, b) { return (a.order || 0) - (b.order || 0); })
    .forEach(function (meal, index) {
      shiftRows.push([String(meal.order == null ? index : meal.order), meal.id || '', meal.name || '', meal.label || '']);
    });
  writeTextRows_(shifts, shiftRows);

  var staff = getOrCreateSheet_(spreadsheet, payload.staffSheet);
  var staffRows = [['Staff ID', 'Name', 'PIN Hash', 'PIN Encrypted', 'Meal IDs', 'Active', 'Created At']];
  (payload.staff || []).forEach(function (member) {
    staffRows.push([
      member.id || '', member.name || '', member.pinHash || '', member.pinEncrypted || '',
      (member.mealIds || []).join(','), member.active ? 'TRUE' : 'FALSE', member.createdAt || '',
    ]);
  });
  writeTextRows_(staff, staffRows);

  return respond({ ok: true, meals: shiftRows.length - 1, staff: staffRows.length - 1 });
}

function headerMap_(headers) {
  var map = {};
  headers.forEach(function (value, index) { map[String(value).trim().toLowerCase()] = index; });
  return map;
}

function columnIndex_(map, key, fallback) {
  return map[key] == null ? fallback : map[key];
}

function readCell_(row, index) {
  return index == null ? '' : String(row[index] == null ? '' : row[index]).trim();
}

/** سحب الأوراق إلى الجهاز؛ المعرّفات المحلية تُحتفظ في الجهاز عند الدمج. */
function handleSheetPull(sheetConfig) {
  if (!sheetConfig || !sheetConfig.spreadsheetId) {
    return respond({ ok: false, error: 'لم يُحدد ملف Google Sheets' });
  }
  var spreadsheet = openSpreadsheet_(sheetConfig.spreadsheetId);
  var pulledAt = new Date().toISOString();

  var meals = [];
  var shiftsSheet = spreadsheet.getSheetByName(sheetConfig.shiftsSheet || 'Shifts_Order');
  if (shiftsSheet) {
    var shiftValues = shiftsSheet.getDataRange().getDisplayValues();
    var shiftMap = headerMap_(shiftValues.shift() || []);
    shiftValues.forEach(function (row, index) {
      var name = readCell_(row, columnIndex_(shiftMap, 'name', 2));
      if (!name) return;
      meals.push({
        id: readCell_(row, columnIndex_(shiftMap, 'meal id', 1)),
        name: name,
        label: readCell_(row, columnIndex_(shiftMap, 'label', 3)),
        order: Number(readCell_(row, columnIndex_(shiftMap, 'order', 0))) || index,
      });
    });
  }

  var staff = [];
  var staffSheet = spreadsheet.getSheetByName(sheetConfig.staffSheet || 'Staff_Directory');
  if (staffSheet) {
    var staffValues = staffSheet.getDataRange().getDisplayValues();
    var staffMap = headerMap_(staffValues.shift() || []);
    staffValues.forEach(function (row) {
      var name = readCell_(row, columnIndex_(staffMap, 'name', 1));
      if (!name) return;
      var activeText = readCell_(row, columnIndex_(staffMap, 'active', 5)).toLowerCase();
      staff.push({
        id: readCell_(row, columnIndex_(staffMap, 'staff id', 0)),
        name: name,
        pinHash: readCell_(row, columnIndex_(staffMap, 'pin hash', 2)),
        pinEncrypted: readCell_(row, columnIndex_(staffMap, 'pin encrypted', 3)),
        mealIds: readCell_(row, columnIndex_(staffMap, 'meal ids', 4)).split(/[,;|]/).map(function (item) {
          return item.trim();
        }).filter(Boolean),
        active: activeText !== 'false' && activeText !== '0',
        createdAt: readCell_(row, columnIndex_(staffMap, 'created at', 6)),
      });
    });
  }

  return respond({ ok: true, data: { meals: meals, staff: staff, pulledAt: pulledAt } });
}

/* ============================================================
 *  الإرسال الأسبوعي للـ PDF
 * ============================================================ */

/** أنشئ المؤقت الأسبوعي من محرر السكربت (Run → installWeeklyTrigger). */
function installWeeklyTrigger() {
  var handlers = ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === 'weeklyPdfReport';
  });
  handlers.forEach(function (trigger) {
    ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('weeklyPdfReport')
    .timeBased()
    .onWeekDay(ScriptApp.Weekday.SUNDAY)
    .atHour(8)
    .create();
  Logger.log('تم إنشاء مؤقت أسبوعي: كل أحد الساعة 08:00');
}

/** لتجربة الإرسال يدوياً من محرر السكربت دون انتظار المؤقت. */
function testWeeklyPdf() {
  return weeklyPdfReport();
}

/** يجمع لقطة الأسبوع ويولّد PDF عربي RTL ويرسله لبريد المسؤول. */
function weeklyPdfReport() {
  var digest = readDigest();
  if (!digest) {
    Logger.log('لا توجد لقطة أسبوعية بعد؛ تأكد من مزامنة الموقع مرة واحدة على الأقل.');
    return false;
  }
  var to = digest.adminEmail || '';
  if (!to) {
    Logger.log('لم يُحدد بريد المسؤول في إعدادات الوسيط.');
    return false;
  }

  var html = buildWeeklyHtml_(digest);
  // تحويل HTML إلى PDF عبر Blob مدعوم داخل Apps Script ويحافظ على RTL والعربية.
  var pdf = Utilities.newBlob(html, MimeType.HTML, 'al-sijl-weekly.html')
    .getAs(MimeType.PDF)
    .setName('al-sijl-weekly-' + digest.weekStart + '_' + digest.weekEnd + '.pdf');

  MailApp.sendEmail({
    to: to,
    subject: 'السجل الإلكتروني — التقرير الأسبوعي ' + digest.weekStart + ' → ' + digest.weekEnd,
    body: 'مرفق التقرير الأسبوعي للسجل الإلكتروني بصيغة PDF.\nعدد التقارير: ' +
      (digest.reports || []).length + '\nعدد المهام: ' + (digest.tasks || []).length,
    attachments: [pdf],
  });
  Logger.log('تم إرسال التقرير الأسبوعي إلى ' + to);
  return true;
}

function buildWeeklyHtml_(digest) {
  var reports = digest.reports || [];
  var tasks = digest.tasks || [];
  var days = digest.days || [];
  var dates = [];
  reports.concat(tasks, days).forEach(function (item) {
    if (item.date && dates.indexOf(item.date) < 0) dates.push(item.date);
  });
  dates.sort();

  var sections = dates.map(function (date, index) {
    var day = days.filter(function (item) { return item.date === date; })[0] || {};
    var dayReports = reports.filter(function (item) { return item.date === date; })
      .sort(function (a, b) { return String(a.sequence || 0) - String(b.sequence || 0); })
      .filter(function (item) { return !item.systemKind || !item.taskId; });
    var dayTasks = tasks.filter(function (item) { return item.date === date; });
    var work = dayReports.map(function (report) {
      return '<li><strong>' + esc_(report.mealName) + '</strong> — ' + esc_(report.content) +
        '<span class="by"> (' + esc_(report.authorName) + ')</span></li>';
    });
    dayTasks.filter(function (task) { return task.status !== 'postponed'; }).forEach(function (task) {
      var stamp = task.status === 'done'
        ? '<span class="stamp">تم الإنجاز + ' + esc_(task.completedBy || '—') + '</span> '
        : '<span class="stamp pending">مطلوب</span> ';
      work.push('<li>' + stamp + '<strong>' + esc_(task.title) + '</strong>' +
        (task.details ? ' — ' + esc_(task.details) : '') +
        '<span class="by"> (' + esc_(task.mealName) + ')</span></li>');
    });
    var postponed = dayTasks.filter(function (task) { return task.status === 'postponed'; });
    var deferred = postponed.length
      ? postponed.map(function (task) {
          return '<li>' + esc_(task.title) + ' — السبب: ' + esc_(task.postponedReason || '—') + '</li>';
        }).join('')
      : '<li>لا توجد أعمال مؤجلة.</li>';

    return (index > 0 ? '<div class="separator"></div>' : '') +
      '<section class="day">' +
        '<div class="date">التاريخ: ' + esc_(String(date).replace(/-/g, ' / ')) + '</div>' +
        '<table class="head"><tr>' +
          '<td class="right"><strong>الحضور:</strong> ' + esc_((day.attendanceNames || []).join('، ') || '—') + '</td>' +
          '<td class="left"><strong>المجازين:</strong> ' + esc_((day.leaveNames || []).join('، ') || '—') + '</td>' +
        '</tr></table>' +
        '<div class="shift">الوجبة المناوبة: ' + esc_(day.mealName || '—') + '</div>' +
        '<h3>١ · الأعمال اليومية والمهام المطلوبة</h3>' +
        (work.length ? '<ol class="work">' + work.join('') + '</ol>' : '<p class="none">لا توجد أعمال مسجلة.</p>') +
        '<h3>٢ · الأعمال المؤجلة - إن وجد</h3><ul class="work deferred">' + deferred + '</ul>' +
      '</section>';
  }).join('');

  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">' +
    '<style>' +
    '@page { size: A4; margin: 14mm; }' +
    'body { font-family: Tahoma, Arial, sans-serif; color: #15262c; direction: rtl; font-size: 12px; }' +
    '.page-head { text-align:center; border-bottom:2px solid #0f766e; padding-bottom:10px; margin-bottom:16px; }' +
    'h1 { font-size: 20px; margin: 0 0 5px; color: #0f766e; }' +
    '.sub { color: #64757c; font-size: 11px; }' +
    '.date { display:table; margin:0 auto 12px; padding:7px 26px; border:2px solid #0f766e; background:#f1f8f7; font-weight:bold; font-size:14px; }' +
    'table.head { width:100%; border-collapse:separate; border-spacing:8px 0; }' +
    'table.head td { border:1px solid #b9c9cc; background:#f8fafb; padding:7px 10px; width:50%; line-height:1.8; }' +
    '.right { text-align:right; } .left { text-align:left; }' +
    '.shift { font-size:10px; color:#64757c; margin:4px 0 14px; }' +
    'h3 { font-size:13px; color:#0f766e; border-inline-start:4px solid #0f766e; padding-inline-start:7px; margin:14px 0 7px; }' +
    'ol.work, ul.work { margin:0; padding-inline-start:22px; line-height:1.9; }' +
    'ul.work { list-style:none; padding-inline-start:16px; }' +
    'ul.work li::before { content:"•"; color:#0f766e; font-weight:bold; margin-inline-end:7px; }' +
    '.by { color:#64757c; font-size:10px; }' +
    '.stamp { background:#e8f5ee; color:#16794f; border-radius:7px; padding:0 5px; font-size:10px; }' +
    '.stamp.pending { background:#fdf4e3; color:#9a6700; }' +
    '.none { color:#64757c; margin:0; }' +
    '.separator { border-top:3px double #0f766e; margin:24px 0; }' +
    '.foot { margin-top:18px; font-size:10px; color:#64757c; text-align:center; }' +
    '</style></head><body>' +
    '<div class="page-head"><h1>السجل الإلكتروني — التقرير الأسبوعي</h1>' +
    '<div class="sub">من ' + esc_(digest.weekStart) + ' إلى ' + esc_(digest.weekEnd) +
      ' · أُنشئ ' + esc_(digest.generatedAt) + '</div></div>' +
    (sections || '<p>لا توجد بيانات في هذا الأسبوع.</p>') +
    '<div class="foot">مستند مُولَّد تلقائياً من لقطة السجل — التعليقات الجانبية غير مضمّنة.</div>' +
    '</body></html>';
}

function esc_(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char;
  });
}
