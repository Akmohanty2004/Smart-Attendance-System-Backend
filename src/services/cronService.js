const cron = require('node-cron');
const { getDb, saveDb } = require('../config/db');

function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

async function triggerAutoAbsentProcess(io = null, targetDate = null) {
  const db = getDb();
  const todayStr = targetDate || new Date().toISOString().split('T')[0];
  const now = new Date();
  const timeStr = db.settings.simulatedTime 
    ? db.settings.simulatedTime + ' AM (Simulated)'
    : now.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: true });

  // Get all active registered students
  const registeredStudents = db.students || [];

  // Get student IDs who already have attendance recorded for today/targetDate
  const recordedStudentIds = new Set(
    db.attendance.filter(a => a.date === todayStr).map(a => a.studentId)
  );

  let markedAbsentCount = 0;
  const newAbsentRecords = [];

  for (const student of registeredStudents) {
    if (!recordedStudentIds.has(student.id)) {
      const absentRecord = {
        id: 'ATT-ABS-' + student.id + '-' + todayStr,
        studentId: student.id,
        studentName: student.name,
        course: student.course,
        batch: student.batch || '2024-2028',
        date: todayStr,
        time: db.settings.autoAbsentTime ? db.settings.autoAbsentTime + ' AM' : timeStr,
        status: 'Absent',
        timestamp: now.toISOString(),
        ipAddress: 'SYSTEM_AUTO_CRON'
      };

      db.attendance.push(absentRecord);
      newAbsentRecords.push(absentRecord);
      markedAbsentCount++;
    }
  }

  if (markedAbsentCount > 0) {
    await saveDb(db);
    console.log(`[Cron Job] Marked ${markedAbsentCount} students as Absent for ${todayStr}.`);

    if (io) {
      io.emit('auto_absent_executed', {
        todayStr,
        markedAbsentCount,
        records: newAbsentRecords
      });
    }
  }

  return { markedAbsentCount, todayStr, records: newAbsentRecords };
}

function initCronScheduler(io) {
  // Cron expression: runs every minute to check if current time >= autoAbsentTime (e.g., 10:30 AM)
  cron.schedule('* * * * *', async () => {
    try {
      const db = getDb();
      const autoAbsentTime = db.settings.autoAbsentTime || '10:30';
      const now = new Date();
      const currentHHMM = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit', minute: '2-digit' });
      const effectiveHHMM = db.settings.simulatedTime || currentHHMM;

      const currentMins = timeToMinutes(effectiveHHMM);
      const absentMins = timeToMinutes(autoAbsentTime);

      if (currentMins >= absentMins) {
        await triggerAutoAbsentProcess(io);
      }
    } catch (err) {
      console.error('[Cron Job Error]:', err);
    }
  });

  console.log('[Cron Service] Scheduler initialized successfully.');
}

module.exports = {
  initCronScheduler,
  triggerAutoAbsentProcess
};
