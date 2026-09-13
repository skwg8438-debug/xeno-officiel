const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

const ADMIN_PASSWORD = 'admin123';

const USERS = [
  { id: 1, name: 'Alice', role: 'Modérateur' },
  { id: 2, name: 'Bob', role: 'Admin' },
  { id: 3, name: 'Charlie', role: 'Modérateur' },
  { id: 4, name: 'Diana', role: 'User' },
  { id: 5, name: 'Eve', role: 'User' }
];

const LOGS_FILE = path.join(__dirname, 'logs.json');

let logs = [];
if (fs.existsSync(LOGS_FILE)) {
  try { logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8')); } catch (e) { logs = []; }
}

function saveLogs() { fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2)); }

function addLog(adminName, action, target) {
  const entry = {
    id: logs.length + 1,
    admin: adminName,
    action: action,
    target: target,
    timestamp: new Date().toISOString()
  };
  logs.push(entry);
  saveLogs();
  return entry;
}

app.use(express.json());
app.use(express.static(__dirname));

app.post('/api/login', (req, res) => {
  const { password, adminName } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, admin: adminName || 'Admin' });
  } else {
    res.status(401).json({ success: false, message: 'Mot de passe incorrect' });
  }
});

app.get('/api/users', (req, res) => res.json(USERS));
app.get('/api/logs', (req, res) => res.json(logs.slice().reverse()));

app.post('/api/log', (req, res) => {
  const { admin, action, target } = req.body;
  if (!admin || !action || !target) return res.status(400).json({ success: false });
  const entry = addLog(admin, action, target);
  res.json({ success: true, entry });
});

app.delete('/api/logs', (req, res) => {
  logs = []; saveLogs();
  res.json({ success: true });
});

app.listen(PORT, () => console.log(` Panel admin démarré sur http://localhost:${PORT}`));
