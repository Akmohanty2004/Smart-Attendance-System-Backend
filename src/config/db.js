const dns = require('dns');
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  dns.setDefaultResultOrder('ipv4first');
} catch (e) {}

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Student = require('../models/Student');
const Attendance = require('../models/Attendance');
const Settings = require('../models/Settings');

const DB_PATH = path.join(__dirname, '../../data/db.json');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ashiskumarmohanty738_db_user:gt0cEdYWg1ea3hne@smartasys.e5pujmm.mongodb.net/smartasys?retryWrites=true&w=majority';

let isMongoConnected = false;

const defaultData = {
  admin: {
    email: 'ashiskumarmohanty738@gmail.com',
    password: 'Ashis@2004',
    name: 'Ashis Kumar Mohanty (System Administrator)'
  },
  students: [
    {
      id: 'STU-1001',
      name: 'Alex Johnson',
      email: 'alex.j@institute.edu',
      password: 'Student@1234',
      course: 'Computer Science',
      batch: '2024-2028',
      faceRegistered: true,
      faceDescriptor: Array.from({ length: 128 }, () => Math.random() * 0.1),
      registeredAt: new Date(Date.now() - 86400000 * 5).toISOString()
    },
    {
      id: 'STU-1002',
      name: 'Sophia Chen',
      email: 'sophia.c@institute.edu',
      password: 'Student@1234',
      course: 'Data Science',
      batch: '2024-2028',
      faceRegistered: true,
      faceDescriptor: Array.from({ length: 128 }, () => Math.random() * 0.1),
      registeredAt: new Date(Date.now() - 86400000 * 4).toISOString()
    },
    {
      id: 'STU-1003',
      name: 'Rahul Sharma',
      email: 'rahul.s@institute.edu',
      password: 'Student@1234',
      course: 'Artificial Intelligence',
      batch: '2023-2027',
      faceRegistered: true,
      faceDescriptor: Array.from({ length: 128 }, () => Math.random() * 0.1),
      registeredAt: new Date(Date.now() - 86400000 * 2).toISOString()
    }
  ],
  attendance: [
    {
      id: 'ATT-PREV-01',
      studentId: 'STU-1001',
      studentName: 'Alex Johnson',
      course: 'Computer Science',
      batch: '2024-2028',
      date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
      time: '09:12 AM',
      status: 'Present',
      timestamp: new Date(Date.now() - 86400000).toISOString(),
      ipAddress: '192.168.0.45'
    },
    {
      id: 'ATT-PREV-02',
      studentId: 'STU-1002',
      studentName: 'Sophia Chen',
      course: 'Data Science',
      batch: '2024-2028',
      date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
      time: '09:42 AM',
      status: 'Late',
      timestamp: new Date(Date.now() - 86400000).toISOString(),
      ipAddress: '192.168.0.88'
    }
  ],
  notifications: [
    {
      id: 'NOTIF-01',
      studentId: 'STU-1002',
      studentEmail: 'sophia.c@institute.edu',
      subject: 'Attendance Status Warning: Marked LATE',
      message: 'You were marked Late for session on ' + new Date().toISOString().split('T')[0] + ' at 09:42 AM.',
      sentAt: new Date().toISOString()
    }
  ],
  settings: {
    allowedIpRanges: ['192.168.0.0/24', '10.0.0.0/8', '127.0.0.1', '::1', '::ffff:127.0.0.1'],
    allowAnyIpForDemo: false,
    presentCutoff: '09:30',
    lateCutoff: '10:00',
    autoAbsentTime: '10:30',
    simulatedTime: '',
    livenessRequired: true
  }
};

let memoryStore = JSON.parse(JSON.stringify(defaultData));

function ensureLocalDbExists() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultData, null, 2), 'utf8');
  }
}

async function syncFromMongo() {
  try {
    const mongoStudents = await Student.find({});
    const mongoAttendance = await Attendance.find({});
    let mongoSettings = await Settings.findOne({});

    if (!mongoSettings) {
      mongoSettings = await Settings.create({});
    }

    if (mongoStudents.length === 0) {
      console.log('🌱 Seeding default students to MongoDB Atlas...');
      await Student.insertMany(defaultData.students);
    }

    if (mongoAttendance.length === 0) {
      console.log('🌱 Seeding default attendance records to MongoDB Atlas...');
      await Attendance.insertMany(defaultData.attendance);
    }

    const freshStudents = await Student.find({});
    const freshAttendance = await Attendance.find({});

    memoryStore.students = freshStudents.map(s => s.toObject());
    memoryStore.attendance = freshAttendance.map(a => a.toObject());
    memoryStore.settings = {
      allowedIpRanges: mongoSettings.allowedIpRanges,
      allowAnyIpForDemo: mongoSettings.allowAnyIpForDemo,
      presentCutoff: mongoSettings.presentCutoff,
      lateCutoff: mongoSettings.lateCutoff,
      autoAbsentTime: mongoSettings.autoAbsentTime,
      simulatedTime: mongoSettings.simulatedTime || '',
      livenessRequired: true
    };
    memoryStore.admin = {
      email: mongoSettings.adminEmail || defaultData.admin.email,
      password: mongoSettings.adminPassword || defaultData.admin.password,
      name: mongoSettings.adminName || defaultData.admin.name
    };

    saveLocalDb(memoryStore);
    console.log('✅ MongoDB Atlas synchronized successfully with memory store!');
  } catch (err) {
    console.error('Error syncing from MongoDB:', err);
  }
}

async function connectMongo() {
  try {
    console.log('⏳ Connecting to MongoDB Atlas cluster...');
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000
    });
    isMongoConnected = true;
    console.log('🚀 Connected to MongoDB Atlas Cluster (smartasys.e5pujmm.mongodb.net)!');
    await syncFromMongo();
  } catch (err) {
    console.warn('⚠️ MongoDB Atlas connection notice (using fallback store):', err.message);
    isMongoConnected = false;
    ensureLocalDbExists();
    try {
      memoryStore = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (e) {
      memoryStore = JSON.parse(JSON.stringify(defaultData));
    }
  }
}

function saveLocalDb(data) {
  ensureLocalDbExists();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function getDb() {
  return memoryStore;
}

function saveDb(data) {
  memoryStore = data;
  saveLocalDb(data);

  if (isMongoConnected) {
    (async () => {
      try {
        for (const s of data.students) {
          await Student.findOneAndUpdate({ id: s.id }, s, { upsert: true, new: true });
        }
        for (const a of data.attendance) {
          await Attendance.findOneAndUpdate({ id: a.id }, a, { upsert: true, new: true });
        }
        await Settings.findOneAndUpdate(
          {},
          {
            allowedIpRanges: data.settings.allowedIpRanges,
            allowAnyIpForDemo: data.settings.allowAnyIpForDemo,
            presentCutoff: data.settings.presentCutoff,
            lateCutoff: data.settings.lateCutoff,
            autoAbsentTime: data.settings.autoAbsentTime,
            simulatedTime: data.settings.simulatedTime,
            adminEmail: data.admin?.email,
            adminPassword: data.admin?.password,
            adminName: data.admin?.name
          },
          { upsert: true }
        );
      } catch (err) {
        console.error('Error persisting to MongoDB Atlas:', err);
      }
    })();
  }
}

module.exports = {
  connectMongo,
  getDb,
  saveDb,
  isMongoConnected: () => isMongoConnected
};
