const { getDb, saveDb } = require('../config/db');

exports.registerStudent = async (req, res) => {
  try {
    const { name, email, password, studentId, course, batch, faceDescriptor } = req.body;

    if (!name || !email || !password || !studentId || !course) {
      return res.status(400).json({ success: false, message: 'Please provide all required fields including password.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    const db = getDb();
    
    // Check existing index
    const existingIndex = db.students.findIndex(s => s.id === studentId || s.email.toLowerCase() === email.toLowerCase());

    const hasFace = Array.isArray(faceDescriptor) && faceDescriptor.length === 128;

    const studentRecord = {
      id: studentId.trim(),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: password.trim(),
      course: course.trim(),
      batch: (batch || '2024-2028').trim(),
      faceRegistered: hasFace,
      faceDescriptor: hasFace ? faceDescriptor : (existingIndex >= 0 ? db.students[existingIndex].faceDescriptor : null),
      registeredAt: existingIndex >= 0 ? db.students[existingIndex].registeredAt : new Date().toISOString()
    };

    if (existingIndex >= 0) {
      db.students[existingIndex] = studentRecord;
    } else {
      db.students.push(studentRecord);
    }

    await saveDb(db);

    return res.status(200).json({
      success: true,
      message: existingIndex >= 0 ? 'Student profile & password updated!' : 'Student registered with password successfully!',
      student: {
        id: studentRecord.id,
        name: studentRecord.name,
        email: studentRecord.email,
        course: studentRecord.course,
        batch: studentRecord.batch,
        faceRegistered: studentRecord.faceRegistered,
        registeredAt: studentRecord.registeredAt
      }
    });
  } catch (err) {
    console.error('Error registering student:', err);
    return res.status(500).json({ success: false, message: 'Internal server error during registration.' });
  }
};

exports.studentLogin = (req, res) => {
  try {
    const { identifier, password } = req.body;
    const db = getDb();

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Please enter your Student ID / Email and Password.' });
    }

    const cleanId = identifier.trim().toLowerCase();
    const student = db.students.find(
      s => s.id.toLowerCase() === cleanId || s.email.toLowerCase() === cleanId
    );

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student ID or Email not found in system.' });
    }

    if (student.password === password.trim()) {
      return res.status(200).json({
        success: true,
        message: 'Student Login Successful!',
        student: {
          id: student.id,
          name: student.name,
          email: student.email,
          course: student.course,
          batch: student.batch,
          faceRegistered: !!student.faceRegistered
        }
      });
    } else {
      return res.status(401).json({ success: false, message: 'Incorrect Password. Please try again.' });
    }
  } catch (err) {
    console.error('Student login error:', err);
    return res.status(500).json({ success: false, message: 'Server error during student login.' });
  }
};

exports.getAllStudents = (req, res) => {
  try {
    const db = getDb();
    const sanitizedStudents = db.students.map(s => ({
      id: s.id,
      name: s.name,
      email: s.email,
      course: s.course,
      batch: s.batch,
      faceRegistered: !!s.faceRegistered && Array.isArray(s.faceDescriptor) && s.faceDescriptor.length === 128,
      registeredAt: s.registeredAt
    }));

    return res.status(200).json({ success: true, count: sanitizedStudents.length, students: sanitizedStudents });
  } catch (err) {
    console.error('Error getting students:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch student list.' });
  }
};

exports.deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();
    const initialLen = db.students.length;
    db.students = db.students.filter(s => s.id !== id);

    if (db.students.length === initialLen) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    await saveDb(db);
    return res.status(200).json({ success: true, message: `Student ${id} removed successfully.` });
  } catch (err) {
    console.error('Error deleting student:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete student.' });
  }
};
