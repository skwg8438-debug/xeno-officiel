const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Mot de passe admin (à changer !)
const ADMIN_PASSWORD = 'admin123';

// Liste des utilisateurs du panel
const USERS = [
  { id: 1, name: 'Alice', role: 'Modérateur' },
  { id: 2, name: 'Bob', role: 'Admin' },
  { id: 3, name: 'Charlie', role: 'Modérateur' },
  { id: 4, name: 'Diana', role: 'User' }
];

// Fichier de logs
const LOGS_FILE = path.join(__dirname, 'logs.json');

// Charger les logs existants
let logs = [];
if (fs.existsSync(LOGS_FILE)) {
  try {
    logs = JSON.parse(fs.readFileSync(LOGS_FILE, 'utf8'));
  } catch (e) {
    logs = [];
  }
}

// Sauvegarder les logs
function saveLogs() {
  fs.writeFileSync(LOGS_FILE, JSON.stringify(logs, null, 2));
}

// Ajouter un log
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

// Login admin
app.post('/api/login', (req, res) => {
  const { password, adminName } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, admin: adminName || 'Admin' });
  } else {
    res.status(401).json({ success: false, message: 'Mot de passe incorrect' });
  }
});

// Récupérer les utilisateurs
app.get('/api/users', (req, res) => {
  res.json(USERS);
});

// Récupérer les logs
app.get('/api/logs', (req, res) => {
  res.json(logs.slice().reverse()); // Plus récents en premier
});

// Enregistrer une action
app.post('/api/log', (req, res) => {
  const { admin, action, target } = req.body;
  if (!admin || !action || !target) {
    return res.status(400).json({ success: false, message: 'Données manquantes' });
  }
  const entry = addLog(admin, action, target);
  res.json({ success: true, entry });
});

// Effacer les logs (admin seulement)
app.delete('/api/logs', (req, res) => {
  logs = [];
  saveLogs();
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`🚀 Panel admin démarré sur http://localhost:${PORT}`);
});
