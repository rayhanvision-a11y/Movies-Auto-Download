const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const analyticsFile = path.join(dataDir, 'analytics.json');

function loadAnalytics() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (fs.existsSync(analyticsFile)) {
    try {
      return JSON.parse(fs.readFileSync(analyticsFile, 'utf8'));
    } catch (e) {
      // fallback
    }
  }
  return {
    total: 0,
    daily: {},
    weekly: {},
    monthly: {},
    ips: {}
  };
}

function saveAnalytics(data) {
  try {
    fs.writeFileSync(analyticsFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[Analytics Save Error]:', e.message);
  }
}

function getWeekKey(dateStr) {
  const d = new Date(dateStr);
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function recordVisit(ip) {
  const data = loadAnalytics();
  const now = new Date();
  const todayKey = now.toISOString().split('T')[0];
  const monthKey = todayKey.substring(0, 7);
  const weekKey = getWeekKey(todayKey);

  const cleanIp = (ip || '127.0.0.1').replace('::ffff:', '');
  const ipKey = `${todayKey}_${cleanIp}`;

  if (!data.ips[ipKey]) {
    data.ips[ipKey] = true;
    data.total = (data.total || 0) + 1;
    data.daily[todayKey] = (data.daily[todayKey] || 0) + 1;
    data.weekly[weekKey] = (data.weekly[weekKey] || 0) + 1;
    data.monthly[monthKey] = (data.monthly[monthKey] || 0) + 1;

    // Prune old IP keys to keep file lightweight
    const keys = Object.keys(data.ips);
    if (keys.length > 5000) {
      const oldKeys = keys.slice(0, keys.length - 2000);
      oldKeys.forEach(k => delete data.ips[k]);
    }

    saveAnalytics(data);
  }
}

function getStats() {
  const data = loadAnalytics();
  const now = new Date();
  const todayKey = now.toISOString().split('T')[0];
  const monthKey = todayKey.substring(0, 7);
  const weekKey = getWeekKey(todayKey);

  return {
    today: data.daily[todayKey] || 0,
    thisWeek: data.weekly[weekKey] || 0,
    thisMonth: data.monthly[monthKey] || 0,
    total: data.total || 0
  };
}

module.exports = { recordVisit, getStats };
