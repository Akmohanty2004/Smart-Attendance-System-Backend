const cron = require('node-cron');
const { getDb, saveDb } = require('../config/db');

function triggerAutoAbsentProcess(io = null) {
  const db = getDb();
  const todayStr = new Date().toISOString().split('T')[0];
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour12: true });

  // Get all active registered students
  const registeredStudents = db.students || [];

  // Get student IDs who already have attendance recorded for today
  const recordedStudentIds = new Set(
    db.attendance.filter(a => a.date === todayStr).map(a => a.studentId)
  );

  let markedAbsentCount = 0;
  const newAbsentRecords = [];

  for (const student of registeredStudents) {
    if (!recordedStudentIds.has(student.id)) {
      const absentRecord = {
        id: 'ATT-ABS-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        studentId: student.id,
        studentName: student.name,
        course: student.course,
        batch: student.batch,
        date: todayStr,
        time: timeStr,
        status: 'Absent',
        timestamp: now.toISOString(),
        ipAddress: 'SYSTEM_CRON'
      };

      db.attendance.push(absentRecord);
      newAbsentRecords.push(absentRecord);
      markedAbsentCount++;
    }
  }

  if (markedAbsentCount > 0) {
    saveDb(db);
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
  // Cron expression: runs every minute to check if current time matches autoAbsentTime (e.g., 10:30 AM)
  cron.schedule('* * * * *', () => {
    try {
      const db = getDb();
      const autoAbsentTime = db.settings.autoAbsentTime || '10:30';
      const now = new Date();
      const currentHHMM = now.toTimeString().substring(0, 5);

      if (currentHHMM === autoAbsentTime) {
        console.log(`[Cron Job Triggered] Time matches auto-absent cutoff: ${currentHHMM}`);
        triggerAutoAbsentProcess(io);
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
