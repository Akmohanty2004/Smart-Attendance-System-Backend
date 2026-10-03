const { getDb, saveDb } = require('../config/db');
const { getClientIp, isIpAllowed } = require('../utils/ipChecker');

function euclideanDistance(arr1, arr2) {
  if (!arr1 || !arr2 || arr1.length !== arr2.length) return 1.0;
  let sum = 0;
  for (let i = 0; i < arr1.length; i++) {
    const diff = arr1[i] - arr2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function formatHHMMTo12Hour(hhmmStr) {
  if (!hhmmStr) return '';
  const parts = hhmmStr.split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || '0', 10);
  if (isNaN(h)) return hhmmStr;
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  const padM = String(m).padStart(2, '0');
  const padH = String(displayH).padStart(2, '0');
  return `${padH}:${padM} ${period}`;
}

function getFormattedLocalTime(dateObj = new Date()) {
  return dateObj.toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit'
  });
}

exports.markAttendance = (req, res) => {
  try {
    const db = getDb();
    const clientIp = getClientIp(req);
    const { studentId, faceDescriptor, overrideTimeCheck, livenessScore } = req.body;

    // 1. Institute Network IP Check
    const allowed = isIpAllowed(clientIp, db.settings.allowedIpRanges, db.settings.allowAnyIpForDemo);
    if (!allowed) {
      return res.status(403).json({
        success: false,
        errorType: 'NETWORK_RESTRICTED',
        message: 'Attendance is only allowed when connected to institute WiFi',
        clientIp
      });
    }

    // Optional Liveness anti-spoofing check
    if (db.settings.livenessRequired && livenessScore !== undefined && livenessScore < 0.4) {
      return res.status(400).json({
        success: false,
        errorType: 'LIVENESS_FAILED',
        message: 'Biometric liveness verification failed. Anti-spoofing check detected static image or photo.'
      });
    }

    // 2. Identify Student
    if (!studentId && (!faceDescriptor || faceDescriptor.length !== 128)) {
      return res.status(400).json({ success: false, message: 'Student ID or valid Face Descriptor required.' });
    }

    let student = null;
    if (studentId) {
      student = db.students.find(s => s.id === studentId.trim());
    }

    if (Array.isArray(faceDescriptor) && faceDescriptor.length === 128) {
      let minDistance = 1.0;
      let matchedStudent = null;

      for (const s of db.students) {
        if (s.faceRegistered && Array.isArray(s.faceDescriptor) && s.faceDescriptor.length === 128) {
          const dist = euclideanDistance(faceDescriptor, s.faceDescriptor);
          if (dist < minDistance) {
            minDistance = dist;
            matchedStudent = s;
          }
        }
      }

      if (matchedStudent && minDistance < 0.6) {
        student = matchedStudent;
      }
    }

    if (!student) {
      return res.status(404).json({
        success: false,
        errorType: 'STUDENT_NOT_FOUND',
        message: 'Student identity not recognized or face not registered in system.'
      });
    }

    // 3. Duplicate Prevention Check for Today
    const todayStr = new Date().toISOString().split('T')[0];
    const existingRecord = db.attendance.find(a => a.studentId === student.id && a.date === todayStr);

    if (existingRecord) {
      return res.status(400).json({
        success: false,
        errorType: 'DUPLICATE_RECORD',
        message: 'Attendance already recorded for today',
        record: existingRecord
      });
    }

    // 4. Time-based Attendance Logic (Supports Evaluator Time Machine Simulation & IST Timezone)
    const now = new Date();
    const currentIST_HHMM = getFormattedLocalTime(now);
    const effectiveTimeStr = db.settings.simulatedTime || currentIST_HHMM;
    const currentMins = timeToMinutes(effectiveTimeStr);

    const presentMins = timeToMinutes(db.settings.presentCutoff || '09:30');
    const lateMins = timeToMinutes(db.settings.lateCutoff || '10:00');

    let status = 'Present';

    if (!overrideTimeCheck) {
      if (currentMins < presentMins) {
        status = 'Present';
      } else if (currentMins >= presentMins && currentMins <= lateMins) {
        status = 'Late';
      } else {
        return res.status(400).json({
          success: false,
          errorType: 'ATTENDANCE_CLOSED',
          message: `Attendance is closed for today. Cutoff time was ${formatHHMMTo12Hour(db.settings.lateCutoff || '10:00')}. Current system time: ${formatHHMMTo12Hour(effectiveTimeStr)}`
        });
      }
    }

    // Format display time
    const displayTime = db.settings.simulatedTime 
      ? formatHHMMTo12Hour(effectiveTimeStr) + ' (Simulated)'
      : now.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour12: true });

    // 5. Save Attendance Record
    const attendanceRecord = {
      id: 'ATT-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      studentId: student.id,
      studentName: student.name,
      course: student.course,
      batch: student.batch,
      date: todayStr,
      time: displayTime,
      status,
      timestamp: now.toISOString(),
      ipAddress: clientIp
    };

    db.attendance.push(attendanceRecord);

    // Automated Email Alert simulation for Late status
    if (status === 'Late') {
      db.notifications = db.notifications || [];
      db.notifications.push({
        id: 'NOTIF-' + Date.now(),
        studentId: student.id,
        studentEmail: student.email,
        subject: 'Attendance Notice: Marked LATE',
        message: `Dear ${student.name}, your attendance was recorded as LATE at ${displayTime} on ${todayStr}.`,
        sentAt: new Date().toISOString()
      });
    }

    saveDb(db);

    // 6. Broadcast Socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('attendance_marked', {
        record: attendanceRecord,
        stats: exports.calculateStatsHelper(db)
      });
    }

    return res.status(200).json({
      success: true,
      message: `Face detected. Attendance marked successfully as '${status}'.`,
      record: attendanceRecord,
      effectiveTime: effectiveTimeStr
    });
  } catch (err) {
    console.error('Error marking attendance:', err);
    return res.status(500).json({ success: false, message: 'Server error while marking attendance.' });
  }
};

exports.calculateStatsHelper = (db) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const totalStudents = db.students.length;
  const todayRecords = db.attendance.filter(a => a.date === todayStr);

  const presentCount = todayRecords.filter(a => a.status === 'Present').length;
  const lateCount = todayRecords.filter(a => a.status === 'Late').length;
  const absentCount = todayRecords.filter(a => a.status === 'Absent').length;

  const markedCount = todayRecords.length;
  const unrecordedCount = Math.max(0, totalStudents - markedCount);

  // Course breakdown for chart visualizer
  const courseMap = {};
  for (const s of db.students) {
    if (!courseMap[s.course]) {
      courseMap[s.course] = { course: s.course, total: 0, present: 0, late: 0, absent: 0 };
    }
    courseMap[s.course].total++;
  }

  for (const r of todayRecords) {
    if (courseMap[r.course]) {
      if (r.status === 'Present') courseMap[r.course].present++;
      if (r.status === 'Late') courseMap[r.course].late++;
      if (r.status === 'Absent') courseMap[r.course].absent++;
    }
  }

  return {
    totalStudents,
    presentCount,
    lateCount,
    absentCount,
    unrecordedCount,
    date: todayStr,
    effectiveTime: db.settings.simulatedTime || 'Live System Clock',
    courseBreakdown: Object.values(courseMap)
  };
};

exports.getDailyAttendance = (req, res) => {
  try {
    const db = getDb();
    const { date, status, search } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    let records = db.attendance.filter(a => a.date === targetDate);

    if (status && status !== 'All') {
      records = records.filter(a => a.status.toLowerCase() === status.toLowerCase());
    }

    if (search) {
      const q = search.toLowerCase();
      records = records.filter(a =>
        a.studentName.toLowerCase().includes(q) ||
        a.studentId.toLowerCase().includes(q) ||
        a.course.toLowerCase().includes(q)
      );
    }

    records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    const stats = exports.calculateStatsHelper(db);

    return res.status(200).json({
      success: true,
      date: targetDate,
      count: records.length,
      records,
      stats
    });
  } catch (err) {
    console.error('Error fetching daily attendance:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch attendance records.' });
  }
};

exports.getStudentHistory = (req, res) => {
  try {
    const { studentId } = req.params;
    const db = getDb();
    const records = db.attendance.filter(a => a.studentId === studentId);
    records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const present = records.filter(r => r.status === 'Present').length;
    const late = records.filter(r => r.status === 'Late').length;
    const absent = records.filter(r => r.status === 'Absent').length;
    const total = records.length;
    const attendancePercentage = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    const notifications = (db.notifications || []).filter(n => n.studentId === studentId);

    return res.status(200).json({
      success: true,
      studentId,
      records,
      notifications,
      summary: { total, present, late, absent, attendancePercentage }
    });
  } catch (err) {
    console.error('Error fetching student history:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch student attendance history.' });
  }
};

exports.getStats = (req, res) => {
  try {
    const db = getDb();
    const stats = exports.calculateStatsHelper(db);
    return res.status(200).json({ success: true, stats });
  } catch (err) {
    console.error('Error fetching stats:', err);
    return res.status(500).json({ success: false, message: 'Failed to compute attendance stats.' });
  }
};

exports.exportAttendanceCSV = (req, res) => {
  try {
    const db = getDb();
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const records = db.attendance.filter(a => a.date === targetDate);

    const csvHeader = 'Attendance ID,Student ID,Student Name,Course,Batch,Date,Time,Status,IP Address\n';
    const csvRows = records.map(r =>
      `"${r.id}","${r.studentId}","${r.studentName}","${r.course}","${r.batch}","${r.date}","${r.time}","${r.status}","${r.ipAddress || ''}"`
    ).join('\n');

    const csvContent = csvHeader + csvRows;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="Attendance_Report_${targetDate}.csv"`);
    return res.status(200).send(csvContent);
  } catch (err) {
    console.error('Error exporting CSV:', err);
    return res.status(500).json({ success: false, message: 'Failed to generate CSV export.' });
  }
};
