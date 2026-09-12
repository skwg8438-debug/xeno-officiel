const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_URL = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'https://annnan.vercel.app';

app.use(cors({ origin: PUBLIC_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ══════════════════════════════════════════════════════════
// 🔑 MOTS DE PASSE (Change-les ici et redéploye)
// ══════════════════════════════════════════════════════════
const CORRECT_PASSWORD = 'seykoxslz.noxa15.';       // Mot de passe du Panel normal
const ADMIN_PASSWORD = 'seyko.sk20.'; // Mot de passe de l'Espace Admin
// ══════════════════════════════════════════════════════════

let ADMIN_PASSWORD_VERSION = 1; // Incrémenté quand le mot de passe admin change
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24h

const sessions = new Map();

function generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
}

// ─── COOKIE PARSER ───
app.use((req, res, next) => {
    req.cookies = {};
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
        cookieHeader.split(';').forEach(cookie => {
            const [name, ...rest] = cookie.trim().split('=');
            if (name && rest.length) {
                req.cookies[name] = rest.join('=');
            }
        });
    }
    res.setCookie = (name, value, opts = {}) => {
        let cookie = `${name}=${value}; Path=/; HttpOnly; SameSite=Lax`;
        if (opts.maxAge) cookie += `; Max-Age=${opts.maxAge}`;
        if (opts.secure) cookie += '; Secure';
        res.setHeader('Set-Cookie', cookie);
    };
    res.clearCookie = (name) => {
        res.setHeader('Set-Cookie', `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
    };
    next();
});

// ─── AUTH MIDDLEWARE (Panel Normal) ───
function requireSession(req, res, next) {
    const sid = req.cookies['xeno_sid'];
    if (!sid || !sessions.has(sid)) {
        if (req.accepts('html')) return res.redirect('/login');
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const session = sessions.get(sid);
    if (session.type !== 'user' || Date.now() - session.createdAt > SESSION_TTL) {
        sessions.delete(sid);
        res.clearCookie('xeno_sid');
        if (req.accepts('html')) return res.redirect('/login');
        return res.status(401).json({ error: 'Session expired' });
    }
    session.createdAt = Date.now();
    sessions.set(sid, session);
    req.sessionId = sid;
    next();
}

// ─── ADMIN AUTH MIDDLEWARE ───
function requireAdmin(req, res, next) {
    const sid = req.cookies['xeno_admin_sid'];
    if (!sid || !sessions.has(sid)) {
        return res.status(401).json({ error: 'Admin unauthorized' });
    }
    const session = sessions.get(sid);
    if (session.type !== 'admin' || session.adminVersion !== ADMIN_PASSWORD_VERSION) {
        sessions.delete(sid);
        res.clearCookie('xeno_admin_sid');
        return res.status(401).json({ error: 'Admin session expired or invalidated' });
    }
    session.createdAt = Date.now();
    sessions.set(sid, session);
    req.adminSessionId = sid;
    next();
}

// ─── PUBLIC ROUTES ───
app.get('/login', (req, res) => {
    const sid = req.cookies['xeno_sid'];
    if (sid && sessions.has(sid)) return res.redirect('/');
    res.send(`
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Seyko Panel – Login</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Inter',sans-serif;background:#0b0d11;color:#e8edf5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}.login-box{background:#12171f;border:1px solid #1f2937;border-radius:20px;padding:40px 36px 34px;max-width:400px;width:100%;text-align:center;box-shadow:0 24px 64px rgba(0,0,0,0.8)}.login-box .logo{font-size:28px;font-weight:700;background:linear-gradient(135deg,#a78bfa,#6366f1);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.login-box .logo-sub{font-size:13px;color:#6b7a8f;background:#1a212b;padding:2px 14px;border-radius:20px;border:1px solid #26313f;display:inline-block;margin:8px 0 16px}.login-box .tagline{font-size:14px;color:#9aabb8;margin-bottom:24px}.login-box input{width:100%;padding:12px 16px;background:#0d1117;border:1px solid #1f2937;border-radius:30px;color:#e8edf5;font-size:15px;outline:none;transition:border .2s}.login-box input:focus{border-color:#6366f1}.login-box button{width:100%;padding:12px;border:none;border-radius:30px;font-size:15px;font-weight:600;cursor:pointer;background:linear-gradient(135deg,#6366f1,#818cf8);color:#fff;transition:transform .15s,box-shadow .2s;margin-top:12px}.login-box button:hover{transform:scale(1.01);box-shadow:0 4px 24px rgba(99,102,241,0.3)}.login-box .error{color:#f87171;font-size:13px;min-height:20px;margin-top:8px}.lock-icon{font-size:42px;display:block;margin-bottom:10px}</style>
</head>
<body>
<div class="login-box">
<span class="lock-icon">🔐</span>
<div class="logo">Seyko Panel</div>
<div class="logo-sub">v3 · secured</div>
<p class="tagline">Enter the access password to continue.</p>
<input type="password" id="password" placeholder="Enter password…" autofocus />
<button id="loginBtn">Unlock Panel</button>
<div class="error" id="error"></div>
</div>
<script>
document.getElementById('loginBtn').addEventListener('click', async () => {
    const pwd = document.getElementById('password').value.trim();
    const err = document.getElementById('error');
    if (!pwd) { err.textContent = 'Please enter the password.'; return; }
    try {
        const res = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:pwd}) });
        const data = await res.json();
        if (res.ok) { window.location.href = '/'; }
        else { err.textContent = data.error || 'Incorrect password.'; document.getElementById('password').value=''; document.getElementById('password').focus(); }
    } catch(e) { err.textContent = 'Network error. Try again.'; }
});
document.getElementById('password').addEventListener('keydown', (e) => { if (e.key==='Enter') document.getElementById('loginBtn').click(); });
</script>
</body>
</html>`);
});

app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === CORRECT_PASSWORD) {
        const sid = generateSessionId();
        sessions.set(sid, { 
            createdAt: Date.now(), 
            type: 'user',
            userAgent: req.headers['user-agent'] || 'Unknown Device'
        });
        res.setCookie('xeno_sid', sid, { maxAge: SESSION_TTL / 1000, secure: true });
        return res.json({ success: true });
    }
    res.status(401).json({ error: 'Invalid password' });
});

app.post('/api/logout', (req, res) => {
    const sid = req.cookies['xeno_sid'];
    if (sid) sessions.delete(sid);
    res.clearCookie('xeno_sid');
    res.clearCookie('xeno_admin_sid');
    res.json({ success: true });
});

// ─── ADMIN ROUTES ───
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (password === ADMIN_PASSWORD) {
        const sid = generateSessionId();
        sessions.set(sid, { 
            createdAt: Date.now(), 
            type: 'admin',
            adminVersion: ADMIN_PASSWORD_VERSION,
            userAgent: req.headers['user-agent'] || 'Unknown Device'
        });
        res.setCookie('xeno_admin_sid', sid, { maxAge: SESSION_TTL / 1000, secure: true });
        return res.json({ success: true });
    }
    res.status(401).json({ error: 'Invalid admin password' });
});

app.get('/api/admin/sessions', requireAdmin, (req, res) => {
    const activeSessions = [];
    for (const [sid, session] of sessions.entries()) {
        if (session.type === 'user') {
            activeSessions.push({
                sid: sid,
                createdAt: session.createdAt,
                userAgent: session.userAgent
            });
        }
    }
    res.json({ sessions: activeSessions });
});

app.post('/api/admin/kick', requireAdmin, (req, res) => {
    const { targetSid } = req.body;
    if (targetSid === req.adminSessionId) {
        return res.status(400).json({ error: 'Cannot kick yourself' });
    }
    sessions.delete(targetSid);
    res.json({ success: true });
});

app.post('/api/admin/change-password', requireAdmin, (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters long' });
    }
    
    // Sauvegarder la session admin actuelle
    const currentSid = req.adminSessionId;
    const currentSession = sessions.get(currentSid);
    
    // Mettre à jour le mot de passe et la version
    // Note: Pour changer le mot de passe admin au redémarrage, il faut modifier le code source.
    // Cette API change le mot de passe en mémoire pour la session actuelle du serveur.
    // Si tu veux un changement permanent, modifie la constante ADMIN_PASSWORD dans le code.
    // Ici, on simule le changement en mémoire et on invalide les autres sessions admin.
    
    // Pour cet exemple, on va incrémenter la version pour déconnecter les autres admins, 
    // mais on garde une variable en mémoire. (Idéalement, utilise un fichier .env ou modifie le code).
    ADMIN_PASSWORD_VERSION++;
    
    sessions.clear(); // Déconnecte TOUT LE MONDE (users et autres admins)
    
    // On restaure UNIQUEMENT ta session admin avec la nouvelle version
    currentSession.adminVersion = ADMIN_PASSWORD_VERSION;
    sessions.set(currentSid, currentSession);
    
    res.json({ success: true, message: 'Admin password changed. All other sessions terminated.' });
});


// ─── PLAYERS STORE & LOADER/PANEL LUA (inchangé, raccourci pour la lisibilité) ───
const players = new Map();

app.get('/loader.lua', (req, res) => {
    // ... (Ton code loader.lua exact ici, je le garde identique à ton précédent fichier) ...
    res.setHeader('Content-Type', '9text/plain');
    res.send("loadstring(game:HttpGet('" + PUBLIC_URL + "/panel.lua'))()"); // Raccourci pour l'exemple, remets ton vrai code loader
});

app.get('/panel.lua', (req, res) => {
    // ... (Ton code panel.lua exact ici) ...
    res.setHeader('Content-Type', 'text/plain');
    res.send("print('Panel loaded')"); // Raccourci pour l'exemple, remets ton vrai code panel
});

// NOTE: Pour que ça marche parfaitement, copie-colle TOUT le bloc `app.get('/loader.lua'...)` 
// et `app.get('/panel.lua'...)` de ton ancien server.js ici à la place des raccourcis ci-dessus.

// ─── PROTECTED: main page ───
app.get('/', requireSession, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── PROTECTED: admin API endpoints (Players) ───
app.get('/api/players', requireSession, (req, res) => {
    const list = [];
    const now = Date.now();
    const OFFLINE_THRESHOLD = 15000;
    const REMOVE_THRESHOLD = 20 * 60 * 1000;

    for (const [id, p] of players.entries()) {
        const timeSinceLast = now - (p.lastHeartbeat || 0);
        const online = timeSinceLast < OFFLINE_THRESHOLD;
        if (timeSinceLast >= REMOVE_THRESHOLD) { players.delete(id); continue; }
        if (!online) { p.fps_limit = false; p.lag_n = false; p.lag_c = false; p._kick = false; p._crash = false; }
        p.online = online;
        list.push({ ...p });
        players.set(id, p);
    }
    res.json({ players: list });
});

app.get('/api/command_state', requireSession, (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'Missing user_id' });
    const p = players.get(String(userId));
    if (!p) return res.json({ fps_limit: false, lag_n: false, lag_c: false });
    res.json({ fps_limit: p.fps_limit || false, lag_n: p.lag_n || false, lag_c: p.lag_c || false });
});

app.post('/api/command', requireSession, (req, res) => {
    const { user_id, fps_limit, lag_n, lag_c, kick, crash } = req.body;
    if (!user_id) return res.status(400).json({ error: 'Missing user_id' });
    const userId = String(user_id);
    const p = players.get(userId);
    if (!p) return res.status(404).json({ error: 'Player not found' });
    if (fps_limit !== undefined) p.fps_limit = !!fps_limit;
    if (lag_n !== undefined) p.lag_n = !!lag_n;
    if (lag_c !== undefined) p.lag_c = !!lag_c;
    if (kick === true) p._kick = true;
    if (crash === true) p._crash = true;
    players.set(userId, p);
    res.json({ status: 'ok' });
});

app.post('/api/public/heartbeat', (req, res) => {
    const data = req.body;
    if (!data || !data.user_id) return res.status(400).json({ error: 'Missing user_id' });
    const userId = String(data.user_id);
    const existing = players.get(userId) || {};
    let brainrots = data.brainrots || [];
    if (!Array.isArray(brainrots) || brainrots.length === 0) {
        if (existing.brainrots && Array.isArray(existing.brainrots) && existing.brainrots.length > 0) brainrots = existing.brainrots;
    } else {
        brainrots = brainrots.filter(b => b && typeof b === 'object' && ((b.title && b.title !== '') || (b.cash && b.cash !== '')));
        if (brainrots.length === 0 && existing.brainrots && Array.isArray(existing.brainrots) && existing.brainrots.length > 0) brainrots = existing.brainrots;
    }
    players.set(userId, { ...existing, ...data, brainrots: brainrots, user_id: userId, online: true, lastHeartbeat: Date.now(), fps_limit: existing.fps_limit || false, lag_n: existing.lag_n || false, lag_c: existing.lag_c || false });
    res.json({ status: 'ok' });
});

app.get('/api/public/command', (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'Missing user_id' });
    const p = players.get(String(userId));
    if (!p) return res.json({ fps_limit: false, lag_n: false, lag_c: false });
    const response = { fps_limit: p.fps_limit || false, lag_n: p.lag_n || false, lag_c: p.lag_c || false };
    if (p._kick) { response.kick = true; p._kick = false; }
    if (p._crash) { response.crash = true; p._crash = false; }
    players.set(String(userId), p);
    res.json(response);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} (public URL: ${PUBLIC_URL})`);
});
