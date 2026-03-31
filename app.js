/* =========================================================
   Design Studio — app.js
   Full frontend logic for all 6 screens
   ========================================================= */

// ── Constants ──────────────────────────────────────────────
// ── Auth State ─────────────────────────────────────────────
var authToken = localStorage.getItem('auth_token');
var currentUser = null;
try {
    const savedUser = localStorage.getItem('auth_user');
    if (savedUser) currentUser = JSON.parse(savedUser);
} catch (e) {
    console.error('Initial user parse error:', e);
}
var currentUserRole = (currentUser && currentUser.role) ? currentUser.role : 'designer';

console.log('--- Design Studio app.js loaded ---');
console.log('Current Auth State:', { hasToken: !!authToken, user: (currentUser ? currentUser.username : null), role: currentUserRole });

const SHEET1_DEFAULT = '1HG0XOG1vh8jrMsfDZLMabq3hHSLoAReLiVzpQQBQQr4';
const SHEET3_DEFAULT = '1KlcOk3eAf8fjS-jgyi4wB2CYcLVXwmTsPhsoysP04Lw';

const ROLE_LABELS = {
    designer: 'Designer',
    senior_designer: '👑 Senior Designer',
    video: '🎥 Video Editor',
    cd: '🎨 Creative Director',
};

// ── Default Team (fallback if no localStorage data) ───────
const DEFAULT_TEAM = [
    { key: 'anu', name: 'Anu', role: 'senior_designer', match: ['anu'], color: 'linear-gradient(135deg,#7c6af4,#4f3de8)', av: 'A' },
    { key: 'asif', name: 'Asif', role: 'designer', match: ['asif'], color: 'linear-gradient(135deg,#f97316,#ef4444)', av: 'A' },
    { key: 'aysha', name: 'Aysha', role: 'designer', match: ['aysha', 'aysh'], color: 'linear-gradient(135deg,#22c55e,#16a34a)', av: 'A' },
    { key: 'safnas', name: 'Safnas', role: 'designer', match: ['safnas'], color: 'linear-gradient(135deg,#eab308,#ca8a04)', av: 'S' },
];

const PROD_API_URL = 'https://design-studio-backend.onrender.com/api'; 
function getBaseUrl() {
    const saved = localStorage.getItem('cfg-apiUrl');
    if (saved && saved.trim()) return saved.trim();
    return PROD_API_URL;
}
var API_BASE_URL = getBaseUrl();

async function loadTeam() {
    try {
        const res = await apiFetch(`${API_BASE_URL}/designers`);
        if (res && res.ok) {
            const data = await res.json();
            if (data && data.length > 0) {
                DESIGNERS = data;
                // If restricted user (Designer/Senior Designer) logs in, default them to 'works'
                if (currentUserRole !== 'admin' && currentUser && currentUser.designerKey) {
                    currentView = 'works';
                }
                renderTeamGrid();
                rebuildDesignerTabs();
                return;
            }
        }
    } catch (e) { console.error('Load team error:', e); }
    DESIGNERS = DEFAULT_TEAM;
}

function getTeam() {
    if (currentUserRole !== 'admin' && currentUser && currentUser.designerKey) {
        return DESIGNERS.filter(d => d.key === currentUser.designerKey);
    }
    return DESIGNERS;
}

async function saveTeamMember(member) {
    try {
        await apiFetch(`${API_BASE_URL}/designers`, {
            method: 'POST',
            body: JSON.stringify(member)
        });
    } catch (e) {
        console.error('Save member error:', e);
    }
}

// Global team state
let DESIGNERS = DEFAULT_TEAM;


// ── State ──────────────────────────────────────────────────
let allTasks = [];
let filteredTasks = [];
let weeklyData = {};   // { designerKey: [ { day, date, task, h, done, present, miiro, bm } ] }
let kpiData = {};   // { designerKey: [ { taskId, quality, impact } ] }
let closedWeeks = [];   // [ { weekNum, closeDate, designers: { key: { assigned, completed, carryovers } } } ]
let currentDesigner = 'anu';
let currentWeekDesigner = 'anu';
let currentKPIDesigner = 'anu';
let currentView = 'grid';
var currentWeekNum = null;
var currentBoardWeek = null;
var currentKPIWeek = null;
var currentSprintWeek = null;

// Initialize them below
function initTheme() {
    const theme = localStorage.getItem('studio-theme') || 'dark';
    if (theme === 'light') {
        document.body.classList.add('light-mode');
        updateThemeIcon(true);
    }
}

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-mode');
    localStorage.setItem('studio-theme', isLight ? 'light' : 'dark');
    updateThemeIcon(isLight);
    toast(`${isLight ? 'Light' : 'Dark'} mode enabled`, 'info');
}

function updateThemeIcon(isLight) {
    const btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    if (isLight) {
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"></path></svg>`;
    } else {
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 5a7 7 0 100 14 7 7 0 000-14z"></path></svg>`;
    }
}
initTheme();
currentWeekNum = getWeekNum() || 1;      // for Weekly Tracker
currentBoardWeek = getWeekNum() || 1;    // for Designer Board
currentKPIWeek = getWeekNum() || 1;      // for KPI
currentSprintWeek = getWeekNum() || 1;   // for Sprint
let selectedAssignee = null;

// Auth State moved up

function checkAuth() {
    const loginScreen = document.getElementById('loginScreen');
    if (!authToken || !currentUser) {
        loginScreen.style.display = 'flex';
        return false;
    }
    loginScreen.style.display = 'none';
    return true;
}

async function doLogin() {
    console.log('Login logic started');
    const userEl = document.getElementById('loginUser');
    const passEl = document.getElementById('loginPass');
    const errorEl = document.getElementById('loginError');

    if (!userEl || !passEl) {
        console.error('Login inputs not found!');
        return;
    }

    const username = userEl.value.trim();
    const password = passEl.value;

    if (!username || !password) {
        errorEl.textContent = 'Please enter both username and password';
        toast('Missing credentials', 'error');
        return;
    }

    errorEl.textContent = '';
    toast('Checking credentials...', 'info');

    try {
        const loginUrl = `${API_BASE_URL}/auth/login`;
        console.log('Fetching:', loginUrl);

        const res = await fetch(loginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json().catch(e => ({ message: 'Invalid server response' }));
        console.log('Server response:', res.status, data);

        if (!res.ok) {
            throw new Error(data.message || 'Login failed');
        }

        // Success!
        console.log('Login successful, setting state...');
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('auth_user', JSON.stringify(data.user));

        authToken = data.token;
        currentUser = data.user;
        currentUserRole = data.user.role;

        toast(`Welcome, ${data.user.username}!`, 'success');
        
        // Update UI
        checkAuth();
        await initApp();
        
        console.log('App initialized after login');
    } catch (e) {
        console.error('DoLogin Exception:', e);
        errorEl.textContent = e.message;
        toast('Error: ' + e.message, 'error');
    }
}

function logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    location.reload();
}

async function apiFetch(url, options = {}) {
    if (!authToken) return null;
    
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        ...(options.headers || {})
    };

    const res = await fetch(url, { ...options, headers });
    
    if (res.status === 401) {
        logout();
        throw new Error('Session expired');
    }
    
    return res;
}

function canEditWeek(weekNum) {
    if (currentUserRole === 'admin') return true;
    return !closedWeeks.some(w => w.weekNum === weekNum);
}

function switchUserRole(role) {
    currentUserRole = role;
    localStorage.setItem('cfg-userRole', role);
    
    // If setting to designer while on a restricted screen, jump to 'works'
    const restricted = ['kpi', 'sprintclose', 'history', 'settings'];
    if (role !== 'admin' && restricted.includes(currentView)) {
        switchScreen('works');
    }
    
    renderAll();
    toast(`Switched to ${role === 'admin' ? 'Admin' : 'Designer'} mode`, 'success');
}

function updateUIPermissions() {
    const isRestricted = currentUserRole !== 'admin';
    
    // Sidebar / Nav items
    const restrictedItems = ['kpi', 'sprintclose', 'history', 'settings', 'clients'];
    document.querySelectorAll('.nav-item').forEach(el => {
        const screen = el.getAttribute('data-screen');
        if (restrictedItems.includes(screen)) {
            el.style.display = isRestricted ? 'none' : 'flex';
        }
    });

    // Sidebar Brand - Change title for designers
    const brandSub = document.querySelector('.brand-sub');
    if (brandSub) brandSub.textContent = isRestricted ? 'Designer Workspace' : 'Task Manager';
    
    // Bottom Nav (mobile)
    restrictedItems.forEach(id => {
        const el = document.getElementById(`bn-${id}`);
        if (el) el.style.display = isRestricted ? 'none' : 'flex';
    });

    // Action Buttons
    const newTaskBtn = document.getElementById('newTaskBtn');
    if (newTaskBtn) newTaskBtn.style.display = isRestricted ? 'none' : 'flex';

    // Toggle Sprint badge visibility
    const sprintBadge = document.getElementById('nb-sprint');
    if (sprintBadge) {
        sprintBadge.parentElement.style.display = isRestricted ? 'none' : 'flex';
    }

    // Hide assignee filter for designers in Works
    const filterAssignee = document.getElementById('filterAssignee');
    if (filterAssignee) {
        filterAssignee.style.display = isRestricted ? 'none' : 'block';
    }

    // Hide role selector for designers
    const roleSelect = document.getElementById('userRoleSelect');
    if (roleSelect) {
        roleSelect.style.display = isRestricted ? 'none' : 'block';
    }
}

function togglePass(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
    input.setAttribute('type', type);
    
    // Update icon
    const isVisible = type === 'text';
    btn.innerHTML = isVisible 
        ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
}

// ── Helpers ────────────────────────────────────────────────
function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showConfirm(title, msg, onConfirm) {
    const overlay = document.getElementById('confirmModalOverlay');
    if (!overlay) return;
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-msg').textContent = msg;
    const yesBtn = document.getElementById('confirm-yes-btn');
    yesBtn.onclick = () => {
        closeConfirmModal();
        onConfirm();
    };
    overlay.classList.add('open');
}

function closeConfirmModal() {
    const overlay = document.getElementById('confirmModalOverlay');
    if (overlay) overlay.classList.remove('open');
}

function formatDate(d) {
    if (!d) return '';
    try {
        const dt = new Date(d);
        if (isNaN(dt)) return d;
        return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    } catch { return d; }
}

function isOverdue(d) {
    if (!d) return false;
    try { return new Date(d) < new Date(); } catch { return false; }
}

// ── Week Calculation (Mon–Sat, 6-day working week) ───────────

// Get the Monday of the week that contains a given date
function getMondayOf(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0=Sun, 1=Mon…
    const diff = day === 0 ? -6 : 1 - day; // roll back to Monday
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

// Calculate week number for a date, given a start date (first Monday)
function getWeekNumberForDate(date, startMonday) {
    const target = getMondayOf(date);
    const origin = getMondayOf(startMonday);
    const diffMs = target - origin;
    const diffWeeks = Math.floor(diffMs / (7 * 86400000));
    return Math.max(1, diffWeeks + 1);
}

// Get the Mon-Sat date range for a given week number
function getWeekDateRange(weekNum) {
    const start = localStorage.getItem('cfg-weekStart');
    if (!start) return null;
    const origin = getMondayOf(new Date(start));
    const mon = new Date(origin.getTime() + (weekNum - 1) * 7 * 86400000);
    const sat = new Date(mon.getTime() + 5 * 86400000);
    return { mon, sat };
}

// Format Mon DD – Sat DD display
function formatWeekRange(weekNum) {
    const r = getWeekDateRange(weekNum);
    if (!r) return `Week ${weekNum}`;
    const fmt = (d) => d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' });
    return `W${weekNum} — ${fmt(r.mon)} to ${fmt(r.sat)}`;
}

function getWeekNum() {
    const saved = localStorage.getItem('cfg-weekNum');
    let wn = 1;
    if (saved) {
        wn = parseInt(saved);
    } else {
        const start = localStorage.getItem('cfg-weekStart');
        if (start) wn = getWeekNumberForDate(new Date(), new Date(start));
        else wn = (typeof window.currentWeekNum !== 'undefined' ? window.currentWeekNum : 1);
    }
    return ((wn - 1) % 5) + 1;
}

function getWeekNumForDate(date) {
    const start = localStorage.getItem('cfg-weekStart');
    if (start) {
        let wn = getWeekNumberForDate(new Date(date), new Date(start));
        return ((wn - 1) % 5) + 1; // Wrap around every 5 weeks
    }
    return getWeekNum();
}

function changeBoardWeek(delta) {
    currentBoardWeek = Math.min(5, Math.max(1, currentBoardWeek + delta));
    renderDesignerBoard(currentDesigner);
    updateBoardCounts();
}

function renderAll() {
    updateUIPermissions();
    updateKPIBar();
    filterWorks();
    populateWeekFilter();
    updateSprintBadge();
    updateBoardCounts();
    renderTaskGrid();
    renderDesignerBoard(currentDesigner);
}

function changeKPIWeek(delta) {
    currentKPIWeek = Math.min(5, Math.max(1, currentKPIWeek + delta));
    renderKPI();
}

function changeSprintWeek(delta) {
    currentSprintWeek = Math.min(5, Math.max(1, currentSprintWeek + delta));
    renderSprintClose();
}

// Month ownership: a week belongs to the month of its Monday
function getMonthOfWeek(weekNum) {
    const r = getWeekDateRange(weekNum);
    if (!r) return null;
    return r.mon.getMonth(); // 0-11
}

function getDesigner(name) {
    if (!name || !DESIGNERS) return null;
    const n = name.toLowerCase().trim();
    return DESIGNERS.find(d => d && d.match && d.match.includes(n)) || null;
}

function designerColor(name) {
    const d = getDesigner(name);
    return d ? d.color : 'linear-gradient(135deg,#6b7280,#4b5563)';
}

function designerAv(name) {
    const d = getDesigner(name);
    return d ? d.av : (name || '?')[0].toUpperCase();
}

function statusNorm(s) {
    const v = (s || '').toLowerCase().replace(/[\s_-]/g, '');
    if (v.includes('progress') || v.includes('wip')) return 'inprogress';
    if (v.includes('wait') || v.includes('client')) return 'waiting';
    if (v.includes('clos') || v.includes('done') || v.includes('complet')) return 'done';
    if (v.includes('carry')) return 'carryover';
    return 'pending';
}

function statusLabel(s) {
    return { pending: 'Pending', inprogress: 'In Progress', waiting: 'Waiting', done: 'Done', carryover: 'Carry Over' }[s] || 'Pending';
}

function toast(msg, type = 'info') {
    const w = document.getElementById('toastWrap');
    const t = document.createElement('div');
    t.className = 'toast';
    const colors = { success: '#22c55e', error: '#ef4444', info: '#7c6af4' };
    t.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="${colors[type] || '#7c6af4'}"><circle cx="12" cy="12" r="10"/></svg> ${esc(msg)}`;
    w.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, 3000);
}

// ── CSV Parser ─────────────────────────────────────────────
function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = parseCSVRow(lines[0]);
    return lines.slice(1).map(line => {
        const vals = parseCSVRow(line);
        const row = {};
        headers.forEach((h, i) => row[h ? h.trim() : `col${i}`] = (vals[i] || '').trim());
        return row;
    }).filter(r => Object.values(r).some(v => v));
}

function parseCSVRow(line) {
    const result = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
        else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
        else cur += c;
    }
    result.push(cur);
    return result;
}

// ── Data Loading ───────────────────────────────────────────
async function loadData() {
    try {
        const res = await apiFetch(`${API_BASE_URL}/tasks`);
        if (!res) return;
        if (!res.ok) throw new Error('API not accessible');
        const tasks = await res.json();
        
        const apiTasks = (tasks || []).map(t => ({
            ...t,
            id: t._id || t.id,
            source: 'api'
        }));

        // Merge with local tasks that haven't been synced yet
        const localTasksRaw = getLocalTasks();
        const localTasks = (localTasksRaw || []).filter(lt => !apiTasks.some(at => at.id === lt.id || (at.task === lt.task && at.client === lt.client)));
        allTasks = [...apiTasks, ...localTasks];

        await loadClients();
        console.log(`[DATA] ${apiTasks.length} API + ${localTasks.length} local = ${allTasks.length} total.`);
        toast(`Loaded ${allTasks.length} tasks`, 'success');
    } catch (e) {
        console.error('API Error:', e);
        allTasks = getLocalTasks();
        toast('Using offline local data', 'info');
    }
    renderAll();
}

function mapTask(row, i) {
    // Flexible column mapping for Sheet 1
    const task = row['Tasks'] || row['Task'] || row['TASKS'] || row['task'] || '';
    const client = row['Client'] || row['CLIENT'] || row['client'] || '';
    const assignee = row['Assignee'] || row['ASSIGNEE'] || row['Assigned To'] || '';
    const status = row['Status'] || row['STATUS'] || row['status'] || 'Pending';
    const entryDate = row['Entry Date'] || row['Entry date'] || row['DATE'] || '';
    const designDue = row['Design Due'] || row['Design due'] || row['DESIGN DUE'] || '';
    const finalDue = row['Finalisation Due'] || row['Final Due'] || row['FINAL DUE'] || row['Finalization Due'] || '';
    const closeDate = row['Close Date'] || row['CLOSE DATE'] || '';
    const weekNum = row['Week #'] || row['Week'] || row['WEEK'] || '';
    const carryOver = row['Carry Over'] || row['Carryover'] || '';
    const hScore = row['H Score'] || row['HScore'] || row['H SCORE'] || '';
    const notes = row['Notes'] || row['NOTES'] || '';

    const sNorm = statusNorm(status);
    const wNum = weekNum ? parseInt(weekNum) : getWeekNum();

    return {
        id: `task-${i}-${Date.now()}`,
        task, client, assignee, status, statusNorm: sNorm,
        entryDate, designDue, finalDue, closeDate,
        weekNum: wNum,
        carryOver: carryOver === 'TRUE' || carryOver === 'true' || carryOver === '1',
        hTarget: hScore ? parseFloat(hScore) : null,
        notes,
        source: 'sheet',
        quality: null, impact: null,
    };
}

function getLocalTasks() {
    try { return JSON.parse(localStorage.getItem('localTasks') || '[]'); } catch { return []; }
}

function saveLocalTasks() {
    localStorage.setItem('localTasks', JSON.stringify(
        allTasks.filter(t => t.source === 'local')
    ));
}

async function refreshData() {
    toast('Refreshing…');
    await loadData();
}

// ── Screen Switching ───────────────────────────────────────
const SCREEN_META = {
    works: { title: 'Works', sub: 'Task Intake & Overview' },
    board: { title: 'Designer Board', sub: 'Per-designer task view' },
    weekly: { title: 'Weekly Tracker', sub: 'Daily H Score & status logs' },
    kpi: { title: 'KPI', sub: 'Evaluation & Leaderboard' },
    sprintclose: { title: 'Sprint Close', sub: 'Week snapshot & carry-over' },
    history: { title: 'History', sub: 'Closed week records' },
    settings: { title: 'Settings', sub: 'Configuration & Setup' },
};

function switchScreen(name) {
    if (currentUserRole !== 'admin') {
        const restricted = ['kpi', 'sprintclose', 'history', 'settings', 'clients'];
        if (restricted.includes(name)) {
            toast('Access Denied: Admin Only', 'error');
            return;
        }
    }
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`[data-screen="${name}"]`);
    if (navItem) navItem.classList.add('active');

    // Sync Bottom Nav safely
    document.querySelectorAll('.bn-item').forEach(n => n.classList.remove('active'));
    const bnItem = document.getElementById(`bn-${name}`);
    if (bnItem) bnItem.classList.add('active');

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const screenItem = document.getElementById(`screen-${name}`);
    if (screenItem) screenItem.classList.add('active');

    // Close sidebar on mobile after choosing
    if (window.innerWidth <= 850) {
        document.body.classList.remove('sidebar-open');
    }
    const META = {
        works: { title: 'Works', sub: 'Task Intake & Overview' },
        board: { title: 'Designer Board', sub: 'Per-designer task view' },
        weekly: { title: 'Weekly Tracker', sub: 'Daily H Score & status logs' },
        kpi: { title: 'KPI', sub: 'Evaluation & Leaderboard' },
        sprintclose: { title: 'Sprint Close', sub: 'Week snapshot & carry-over' },
        history: { title: 'History', sub: 'Closed week records' },
        clients: { title: 'Clients', sub: 'Client directory & status management' },
        settings: { title: 'Settings', sub: 'Configuration & Setup' },
    };
    const m = META[name] || {};
    document.getElementById('pageTitle').textContent = m.title || name;
    document.getElementById('pageSub').textContent = m.sub || '';

    if (name === 'board') renderDesignerBoard(currentDesigner);
    if (name === 'weekly') renderWeeklyTracker();
    if (name === 'kpi') renderKPI();
    if (name === 'sprintclose') renderSprintClose();
    if (name === 'history') renderHistory();
    if (name === 'clients') (async () => { await renderClientGrid(); })();
    if (name === 'settings') renderTeamGrid();

    const btn = document.getElementById('newTaskBtn');
    if (btn) {
        btn.style.display = (name === 'works' && currentUserRole === 'admin') ? 'flex' : 'none';
    }

    if (name === 'settings') loadSettings();
}

// ── WORKS SCREEN ───────────────────────────────────────────
// renderAll function moved up

function updateKPIBar() {
    if (!allTasks) return;
    const w = getWeekNum() || 1;
    const active = allTasks.filter(t => t && t.statusNorm !== 'done');
    const thisWk = allTasks.filter(t => t && t.weekNum === w);
    const done = allTasks.filter(t => t && t.statusNorm === 'done');
    const carry = allTasks.filter(t => t && t.carryOver);

    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setVal('st-total', allTasks.length);
    setVal('st-active', active.length);
    setVal('st-week', thisWk.length);
    setVal('st-done', done.length);
    setVal('st-carry', carry.length);
    setVal('nb-works', active.length);
}

function populateWeekFilter() {
    const sel = document.getElementById('filterWeek');
    const weeks = [...new Set(allTasks.map(t => t.weekNum).filter(Boolean))].sort((a, b) => a - b);
    const cur = sel.value;
    sel.innerHTML = '<option value="">All Weeks</option>' +
        weeks.map(w => `<option value="${w}" ${cur == w ? 'selected' : ''}>Week ${w}</option>`).join('');
}

function filterWorks() {
    const searchEl = document.getElementById('worksSearch');
    const q = (searchEl ? searchEl.value : '').toLowerCase();
    const wk = document.getElementById('filterWeek').value;
    const des = document.getElementById('filterAssignee').value.toLowerCase();
    const st = document.getElementById('filterStatus').value;
    const timeline = document.getElementById('filterTimeline').value;
    const dateField = document.getElementById('filterDateField').value || 'finalDue';
    const hScoreFilter = document.getElementById('filterHScore') ? document.getElementById('filterHScore').value : '';

    const now = new Date();
    const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    
    // 2 days from now
    const day2Date = new Date();
    day2Date.setDate(now.getDate() + 2);
    const day2Str = day2Date.getFullYear() + '-' + String(day2Date.getMonth() + 1).padStart(2, '0') + '-' + String(day2Date.getDate()).padStart(2, '0');

    // 3 days from now
    const day3Date = new Date();
    day3Date.setDate(now.getDate() + 3);
    const day3Str = day3Date.getFullYear() + '-' + String(day3Date.getMonth() + 1).padStart(2, '0') + '-' + String(day3Date.getDate()).padStart(2, '0');

    filteredTasks = allTasks.filter(t => {
        if (!t) return false;

        // Role-based visibility
        const isRestricted = currentUserRole !== 'admin';
        if (isRestricted && currentUser && currentUser.designerKey) {
            const desKey = currentUser.designerKey.toLowerCase();
            const taskAssignee = (t.assignee || '').toLowerCase();
            const d = getDesigner(taskAssignee);
            if (taskAssignee !== desKey && (!d || !d.match.includes(desKey))) return false;
        }

        const taskName = (t.task || '').toLowerCase();
        const clientName = (t.client || '').toLowerCase();
        if (q && !taskName.includes(q) && !clientName.includes(q)) return false;
        if (wk && String(t.weekNum) !== wk) return false;
        
        if (des) {
            if (des === 'unassigned') {
                const assigneeStr = (t.assignee || '').toLowerCase();
                if (assigneeStr && assigneeStr !== 'unassigned') return false;
            } else {
                const d = getDesigner(t.assignee);
                const matchesDesigner = d && d.match.includes(des);
                const directAssignee = (t.assignee || '').toLowerCase() === des;
                if (!matchesDesigner && !directAssignee) return false;
            }
        }
        
        if (st) {
            if (st === 'audit') {
                if (t.needsApproval !== true) return false;
            } else if (t.statusNorm !== st) {
                return false;
            }
        }
        
        if (hScoreFilter === 'unassigned') {
            if (t.hTarget !== null && t.hTarget !== undefined && t.hTarget !== '') return false;
        }

        if (timeline) {
            const taskDate = t[dateField];
            if (!taskDate) return false;
            if (timeline === 'overdue') {
                if (taskDate >= todayStr || t.statusNorm === 'done') return false;
            } else if (timeline === 'today') {
                if (taskDate !== todayStr) return false;
            } else if (timeline === 'soon') {
                if (taskDate < day2Str || taskDate > day3Str) return false;
            }
        }
        
        return true;
    });

    renderTaskGrid();
}

function renderTaskGrid() {
    const grid = document.getElementById('worksGrid');
    if (!grid) return;
    if (filteredTasks.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
      <p>No tasks found</p><p style="font-size:12px;color:var(--text3)">Add tasks or adjust your filters</p>
    </div>`;
        return;
    }
    grid.innerHTML = filteredTasks.map(t => {
        try {
            return renderTaskCard(t);
        } catch (e) {
            console.error('Error rendering task card:', e, t);
            return '<div class="task-card error">Error rendering task</div>';
        }
    }).join('');
}

function renderTaskCard(t) {
    const d = getDesigner(t.assignee);
    const overdue = isOverdue(t.finalDue) && t.statusNorm !== 'done';
    return `
    <div class="task-card${t.carryOver ? ' carry-over' : ''}" onclick="openTaskModal('${esc(t.id)}')">
      <div class="task-card-top">
        <span class="client-tag">${esc(t.client) || '—'}</span>
        <div style="display:flex;gap:4px;align-items:center">
          ${t.needsApproval ? '<span class="status-badge orange" style="font-size:8px; padding: 2px 5px; border-radius: 4px; margin-right: 4px;">Audit</span>' : ''}
          ${t.carryOver ? '<span class="carry-tag">↩ Carry</span>' : ''}
          <span class="week-tag">W${t.weekNum}</span>
        </div>
      </div>
      <div class="task-title">${esc(t.task)}</div>
      <div class="task-meta">
        <div class="task-assignee">
          <span class="av-dot" style="background:${designerColor(t.assignee)}">${designerAv(t.assignee)}</span>
          ${esc(d ? d.name : t.assignee || 'Unassigned')}
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="status-dot ${t.statusNorm}"></span>
          <span class="task-due ${overdue ? 'overdue' : ''}">${formatDate(t.finalDue) || '—'}</span>
        </div>
      </div>
    </div>`;
}

function setView(v) {
    currentView = v;
    document.getElementById('worksGrid').className = 'task-grid' + (v === 'list' ? ' list-view' : '');
    document.getElementById('vt-grid').classList.toggle('active', v === 'grid');
    document.getElementById('vt-list').classList.toggle('active', v === 'list');
}

// ── TASK MODAL ─────────────────────────────────────────────
function openTaskModal(id) {
    const t = allTasks.find(t => t.id === id);
    if (!t) return;
    
    const isClosed = !canEditWeek(t.weekNum);
    
    // Designer cannot edit in 'Works' screen at all, or in closed weeks
    const activeScreenNode = document.querySelector('.nav-item.active');
    const activeScreen = activeScreenNode ? activeScreenNode.getAttribute('data-screen') : 'works';
    const editable = currentUserRole === 'admin' || (activeScreen !== 'works' && !isClosed);
    const dis = !editable ? 'disabled' : '';

    if (!editable) {
        toast(isClosed ? 'Week is closed. View-only.' : 'View-only mode.', 'info');
    }

    document.getElementById('taskModalTitle').textContent = editable ? 'Edit Task' : 'View Task';

    const designerOpts = DESIGNERS.map(d => `<option value="${esc(d.name)}" ${t.assignee === d.name ? 'selected' : ''}>${esc(d.name)}</option>`).join('');

    document.getElementById('taskModalBody').innerHTML = `
    <div class="modal-row"><span class="modal-label">Client</span>
      <input type="text" id="edit-client" class="form-input sm" value="${esc(t.client)}" ${dis}>
    </div>
    <div class="modal-row"><span class="modal-label">Task</span>
      <input type="text" id="edit-task" class="form-input sm" value="${esc(t.task)}" ${dis}>
    </div>
    <div class="modal-row">
      <span class="modal-label">Assignee</span>
      <select id="edit-assignee" class="form-input sm" ${dis}>
        <option value="">Unassigned</option>
        ${designerOpts}
      </select>
    </div>
    <div class="modal-row"><span class="modal-label">Status</span>
      <select id="edit-status" class="form-input sm" ${dis}>
        <option value="pending"    ${t.statusNorm === 'pending' ? 'selected' : ''}>Pending</option>
        <option value="inprogress" ${t.statusNorm === 'inprogress' ? 'selected' : ''}>In Progress</option>
        <option value="waiting"    ${t.statusNorm === 'waiting' ? 'selected' : ''}>Waiting on Client</option>
        <option value="done"       ${t.statusNorm === 'done' ? 'selected' : ''}>Done ✓</option>
      </select>
    </div>
    <div class="modal-row"><span class="modal-label">Week #</span>
      <input type="number" id="edit-week" class="form-input sm" value="${t.weekNum || ''}" ${dis}>
    </div>
    <div class="modal-row"><span class="modal-label">Design Due</span>
      <input type="date" id="edit-designDue" class="form-input sm" value="${t.designDue || ''}" ${dis}>
    </div>
    <div class="modal-row"><span class="modal-label">Final Due</span>
      <input type="date" id="edit-finalDue" class="form-input sm" value="${t.finalDue || ''}" ${dis}>
    </div>
    <div class="modal-row"><span class="modal-label">H Score Target</span>
      <input type="number" id="edit-hTarget" class="form-input sm" step="0.5" value="${t.hTarget || ''}" ${dis}>
    </div>
    <div class="modal-row"><span class="modal-label">Notes</span>
      <textarea id="edit-notes" class="form-input sm" style="height:60px" ${dis}>${esc(t.notes || '')}</textarea>
    </div>
    <div style="margin-top:20px;display:flex;justify-content:flex-end;gap:10px">
        ${editable ? `<button class="btn-danger sm" onclick="deleteTask('${esc(t.id)}')" style="margin-right:auto">Delete Task</button>` : ''}
        <button class="btn-ghost" onclick="closeTaskModal()">Cancel</button>
        ${editable ? `
        <button class="btn-primary" onclick="saveTaskChanges('${esc(t.id)}')">Save Changes</button>
        ` : `
        <div style="font-size:10px; color:var(--text3); font-weight:700; text-transform:uppercase; display:flex; align-items:center; gap:6px">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
             Read Only (Restricted)
        </div>
        `}
    </div>
  `;
    document.getElementById('taskModalOverlay').classList.add('open');
    document.getElementById('edit-task-id').value = t.id;
}

async function saveTaskChanges(id) {
    const t = allTasks.find(t => t.id === id);
    if (!t) return;

    const payload = {
        client: document.getElementById('edit-client').value.trim(),
        task: document.getElementById('edit-task').value.trim(),
        assignee: document.getElementById('edit-assignee').value,
        statusNorm: document.getElementById('edit-status').value,
        weekNum: parseInt(document.getElementById('edit-week').value),
        designDue: document.getElementById('edit-designDue').value,
        finalDue: document.getElementById('edit-finalDue').value,
        hTarget: parseFloat(document.getElementById('edit-hTarget').value) || null,
        notes: document.getElementById('edit-notes').value.trim()
    };

    try {
        const res = await apiFetch(`${API_BASE_URL}/tasks/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(payload)
        });
        if (!res || !res.ok) throw new Error();
        toast('Task updated', 'success');
        closeTaskModal();
        await loadData();
        renderAll();
    } catch (e) {
        toast('Failed to save changes', 'error');
    }
}

async function deleteTask(id) {
    const t = allTasks.find(x => x.id === id);
    showConfirm(
        'Delete Task',
        'Are you sure you want to permanently delete this task?',
        async () => {
            try {
                if (t && t.source === 'local') {
                    allTasks = allTasks.filter(x => x.id !== id);
                    saveLocalTasks();
                } else {
                    const res = await apiFetch(`${API_BASE_URL}/tasks/${id}`, {
                        method: 'DELETE'
                    });
                    if (!res || !res.ok) throw new Error();
                }
                
                toast('Task deleted', 'success');
                closeTaskModal();
                await loadData();
                renderAll();
            } catch (e) {
                toast('Failed to delete task', 'error');
            }
        }
    );
}
// Task Modal Logic
function closeTaskModal() {
    document.getElementById('taskModalOverlay').classList.remove('open');
}

async function updateTaskStatus(id, newStatus) {
    const t = allTasks.find(t => t.id === id);
    if (!t) return;
    if (!canEditWeek(t.weekNum)) {
        toast('This week is closed. Only Admin can edit.', 'error');
        renderAll();
        return;
    }

    const updates = { 
        statusNorm: newStatus,
        status: statusLabel(newStatus)
    };
    if (newStatus === 'done') updates.closeDate = new Date().toISOString().split('T')[0];

    try {
        if (t.source === 'local') {
            Object.assign(t, updates);
            saveLocalTasks();
        } else {
            const res = await apiFetch(`${API_BASE_URL}/tasks/${id}`, {
                method: 'PATCH',
                body: JSON.stringify(updates)
            });
            if (!res || !res.ok) throw new Error('Failed to update status');
        }
        
        toast(`Status: ${statusLabel(newStatus)}`, 'success');
        await loadData();
    } catch (e) {
        toast('Failed to sync status', 'error');
    }
}

// ── DRAG & DROP ─────────────────────────────────────────────
function handleDragStart(e, id) {
    e.dataTransfer.setData('text/plain', id);
    e.currentTarget.classList.add('dragging');
}

function handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
}

function allowDrop(e) {
    e.preventDefault();
}

function handleDrop(e, status) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    updateTaskStatus(id, status);
}

async function pushStatusToAPI(task) {
    try {
        await apiFetch(`${API_BASE_URL}/tasks/${task.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ statusNorm: task.statusNorm, closeDate: task.closeDate })
        });
    } catch (e) { console.error('API Status Sync Error:', e); }
}

// ── NEW TASK PANEL ─────────────────────────────────────────
function openNewTaskPanel() {
    document.getElementById('panelOverlay').classList.add('open');
    document.getElementById('newTaskPanel').classList.add('open');
    // Set default dates (today + 7 days)
    const today = new Date().toISOString().split('T')[0];
    const next = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
    document.getElementById('nt-designdue').value = next;
    document.getElementById('nt-finaldue').value = next;
    // Auto-calculate week number from today's date
    document.getElementById('nt-week').value = getWeekNum();
    selectedAssignee = null;
    document.querySelectorAll('.assign-btn').forEach(b => b.classList.remove('selected'));
}

function closeNewTaskPanel() {
    document.getElementById('panelOverlay').classList.remove('open');
    document.getElementById('newTaskPanel').classList.remove('open');
    // Reset form
    ['nt-client', 'nt-task', 'nt-notes'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
    const suggestionsEl = document.getElementById('nt-client-suggestions');
    if (suggestionsEl) {
        suggestionsEl.innerHTML = '';
        suggestionsEl.classList.remove('open');
    }
}

function showClientSuggestions(query) {
    const suggestionsEl = document.getElementById('nt-client-suggestions');
    if (!suggestionsEl) return;
    
    const q = query.toLowerCase().trim();
    const filtered = allClients.filter(c => 
        c.name.toLowerCase().includes(q) || 
        (c.category || '').toLowerCase().includes(q)
    ).slice(0, 8);

    if (filtered.length === 0) {
        suggestionsEl.classList.remove('open');
        return;
    }

    suggestionsEl.innerHTML = filtered.map(c => `
        <div class="suggestion-item" onclick="selectClientSuggestion('${esc(c.name)}')">
            <span class="name">${esc(c.name)}</span>
            <span class="category">${esc(c.category || 'No Category')}</span>
        </div>
    `).join('');
    
    suggestionsEl.classList.add('open');
}

function selectClientSuggestion(name) {
    const input = document.getElementById('nt-client');
    if (input) input.value = name;
    const suggestionsEl = document.getElementById('nt-client-suggestions');
    if (suggestionsEl) suggestionsEl.classList.remove('open');
}

// Global click listener for client suggestions cleanup
document.addEventListener('mousedown', (e) => {
    const sig = document.getElementById('nt-client-suggestions');
    const inp = document.getElementById('nt-client');
    if (sig && !sig.contains(e.target) && e.target !== inp) {
        sig.classList.remove('open');
    }
});

function selectDesigner(btn) {
    document.querySelectorAll('.assign-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedAssignee = btn.dataset.d;
}

async function submitNewTask() {
    const client = document.getElementById('nt-client').value.trim();
    const task = document.getElementById('nt-task').value.trim();
    const dDue = document.getElementById('nt-designdue').value;
    const fDue = document.getElementById('nt-finaldue').value;
    const weekNum = parseInt(document.getElementById('nt-week').value) || getWeekNum();
    const hScore = parseFloat(document.getElementById('nt-hscore').value) || null;
    const notes = document.getElementById('nt-notes').value.trim();

    if (!task) { toast('Task description is required', 'error'); return; }

    const newTask = {
        client: client || '—',
        task,
        assignee: selectedAssignee || 'Unassigned',
        statusNorm: 'pending',
        entryDate: new Date().toISOString().split('T')[0],
        designDue: dDue,
        finalDue: fDue,
        weekNum,
        hTarget: hScore,
        notes
    };

    try {
        const res = await apiFetch(`${API_BASE_URL}/tasks`, {
            method: 'POST',
            body: JSON.stringify(newTask)
        });
        if (!res || !res.ok) throw new Error('Failed to create task');

        // Auto-populate weekly tracker H Score row if needed
        if (hScore && selectedAssignee && selectedAssignee !== 'Unassigned') {
            autoAddWeeklyHRow(newTask, weekNum);
        }

        closeNewTaskPanel();
        await loadData();
        toast(`Task created successfully`, 'success');
    } catch (e) {
        toast('Database connection error', 'error');
    }
}


// ── DESIGNER BOARD ─────────────────────────────────────────
// Board week filter state
let boardShowAllWeeks = false;

function toggleBoardWeekFilter() {
    boardShowAllWeeks = !boardShowAllWeeks;
    const btn = document.getElementById('boardWeekToggle');
    if (btn) {
        btn.textContent = boardShowAllWeeks ? 'All Weeks' : `Week ${getWeekNum()} only`;
        btn.style.color = boardShowAllWeeks ? 'var(--orange)' : 'var(--text2)';
    }
    renderDesignerBoard(currentDesigner);
}

function switchDesigner(key) {
    document.querySelectorAll('.dtab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll(`.dtab[data-d="${key}"]`).forEach(t => t.classList.add('active'));

    // Sync mobile select if it exists (custom dropdown version)
    const activeMob = document.getElementById('mobileActiveDesigner');
    if (activeMob) {
        const team = getTeam();
        const m = team.find(x => x.key === key);
        if (m) {
            activeMob.innerHTML = `
                <span class="dtab-av" style="background:${m.color}">${m.av}</span>
                <span style="font-weight:600; font-size:14px; color:white">${esc(m.name)}</span>
                <span class="dtab-count" id="m-dcount-${m.key}">0</span>
            `;
        }
    }

    currentDesigner = key;
    renderDesignerBoard(key);
}

function toggleDesignerDropdown(e) {
    if (e) e.stopPropagation();
    const list = document.getElementById('designerDropdownList');
    if (list) list.classList.toggle('open');
}

// Close mobile dropdown when clicking outside
document.addEventListener('click', () => {
    const list = document.getElementById('designerDropdownList');
    if (list) list.classList.remove('open');
});

function updateBoardCounts() {
    const w = currentBoardWeek;
    DESIGNERS.forEach(d => {
        const count = allTasks.filter(t =>
            d.match.includes((t.assignee || '').toLowerCase().trim()) &&
            t.statusNorm !== 'done' &&
            t.statusNorm !== 'carryover' &&
            t.weekNum === w
        ).length;
        const el = document.getElementById(`dcount-${d.key}`);
        if (el) el.textContent = count;
        const el2 = document.getElementById(`md-dcount-${d.key}`);
        if (el2) el2.textContent = count;
        const el3 = document.getElementById(`m-dcount-${d.key}`);
        if (el3) el3.textContent = count;
    });
}

function renderDesignerBoard(key) {
    const designerKey = key || currentDesigner;
    const d = DESIGNERS.find(d => d.key === designerKey);
    if (!d) return;
    const w = currentBoardWeek;

    // Filter: only current selected week (unless toggled to show all)
    let tasks = allTasks.filter(t => d.match.includes((t.assignee || '').toLowerCase().trim()));
    if (!boardShowAllWeeks) {
        tasks = tasks.filter(t => t.weekNum === w || !t.weekNum);
    } else {
        // Show all weeks — keep everything
    }

    // Update toggle button label
    const btn = document.getElementById('boardWeekToggle');
    if (btn) {
        btn.textContent = boardShowAllWeeks ? 'Showing All Weeks' : `Week ${w} Only`;
    }
    document.getElementById('boardWeekLabel').textContent = `Week ${w}`;

    // Build columns from filtered tasks
    const cols = {
        pending: tasks.filter(t => t.statusNorm === 'pending'),
        inprogress: tasks.filter(t => t.statusNorm === 'inprogress'),
        waiting: tasks.filter(t => t.statusNorm === 'waiting'),
        done: tasks.filter(t => t.statusNorm === 'done'),
        carryover: tasks.filter(t => t.statusNorm === 'carryover'),
    };

    Object.entries(cols).forEach(([col, list]) => {
        document.getElementById(`bc-${col}`).textContent = list.length;
        const body = document.getElementById(`bb-${col}`);
        if (!body) return;
        body.innerHTML = list.length === 0
            ? `<div style="padding:12px;color:var(--text3);font-size:11px;text-align:center">Empty</div>`
            : list.map(t => renderBoardCard(t)).join('');
    });
}

function renderBoardCard(t) {
    const overdue = isOverdue(t.finalDue) && t.statusNorm !== 'done';
    const editable = canEditWeek(t.weekNum);
    return `
    <div class="board-card ${!editable ? 'locked' : ''}" 
         draggable="${editable}" 
         ondragstart="${editable ? "handleDragStart(event, '" + esc(t.id) + "')" : ""}"
         ondragend="handleDragEnd(event)"
         onclick="openTaskModal('${esc(t.id)}')">
      <div class="board-card-client">${esc(t.client)} ${t.carryOver ? '↩' : ''}</div>
      <div class="board-card-title">${esc(t.task)}</div>
      <div class="board-card-footer">
        <span class="board-card-due ${overdue ? 'orange' : ''}">${formatDate(t.finalDue) || '—'}</span>
        ${editable ? `
        <select class="status-sel" onclick="event.stopPropagation()" onchange="updateTaskStatus('${esc(t.id)}',this.value)">
          <option value="pending"    ${t.statusNorm === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="inprogress" ${t.statusNorm === 'inprogress' ? 'selected' : ''}>In Progress</option>
          <option value="waiting"    ${t.statusNorm === 'waiting' ? 'selected' : ''}>Waiting</option>
          <option value="done"       ${t.statusNorm === 'done' ? 'selected' : ''}>Done ✓</option>
        </select>` : `<span class="locked-status">${statusLabel(t.statusNorm)}</span>`}
      </div>
    </div>`;
}

// ── WEEKLY TRACKER ─────────────────────────────────────────
async function switchWeekDesigner(key) {
    document.querySelectorAll('#weekDesignerPills .pill').forEach(p => p.classList.remove('active'));
    const pill = document.querySelector(`#weekDesignerPills [data-d="${key}"]`);
    if (pill) pill.classList.add('active');
    currentWeekDesigner = key;
    await renderWeeklyTracker();
}

async function changeWeek(delta) {
    currentWeekNum = Math.min(5, Math.max(1, currentWeekNum + delta));
    document.getElementById('weekLabel').textContent = formatWeekRange(currentWeekNum);
    await renderWeeklyTracker();
}

async function renderWeeklyTracker() {
    document.getElementById('weekLabel').textContent = formatWeekRange(currentWeekNum);
    const key = currentWeekDesigner;
    // We no longer use 'rows' for stats as everything is now task-based.
    // The legacy getWeeklyRows is kept only for backwards compatibility if needed.
    renderWeeklyTable(null, key);
}

async function getWeeklyRows(key, week) {
    try {
        const res = await apiFetch(`${API_BASE_URL}/logs?designerKey=${key}&weekNum=${week}`);
        if (res && res.ok) {
            const data = await res.json();
            if (data && data.length > 0) return data[0].rows || [];
        }
    } catch (e) { console.error('Get logs error:', e); }
    
    // Fallback to local storage
    const storeKey = `weekly-${key}-w${week}`;
    return JSON.parse(localStorage.getItem(storeKey) || '[]');
}

async function saveWeeklyRows(key, week, rows) {
    // 1. Local storage fallback
    localStorage.setItem(`weekly-${key}-w${week}`, JSON.stringify(rows));

    // 2. Clear backend
    try {
        await apiFetch(`${API_BASE_URL}/logs`, {
            method: 'POST',
            body: JSON.stringify({ designerKey: key, weekNum: week, rows })
        });
    } catch (e) { console.error('Save logs error:', e); }
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

async function updateTaskField(id, field, val) {
    const t = allTasks.find(t => t.id === id);
    if (!t) return;
    if (!canEditWeek(t.weekNum)) {
        toast('Closed week. Edit restricted.', 'error');
        renderWeeklyTracker();
        return;
    }

    t[field] = val;
    
    // Sync to backend
    try {
        await apiFetch(`${API_BASE_URL}/tasks/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ [field]: val })
        });
        saveLocalTasks();
        renderWeeklyTracker();
        toast('Task sync successful', 'success');
    } catch (e) {
        toast('Sync failed. Saved locally.', 'warning');
        saveLocalTasks();
        renderWeeklyTracker();
    }
}

function renderWeeklyTable(rows, key) {
    const body = document.getElementById('weeklyBody');
    if (!body) return;

    const d = DESIGNERS.find(d => d.key === key);
    const designerTasks = d ? allTasks.filter(t => d.match.includes((t.assignee || '').toLowerCase().trim())) : [];
    const thisWeekTasks = designerTasks.filter(t => t.weekNum === currentWeekNum); // Filter by currentWeekNum
    const taskOptions = designerTasks.map(t => `<option value="${esc(t.task)}">${esc(t.client)} – ${esc(t.task.slice(0, 40))}</option>`).join('');

    // Unified task rendering: Everything is now a Task (Assigned or Extra).
    const editable = canEditWeek(currentWeekNum);
    const dis = !editable ? 'disabled' : '';

    // ── Auto-task rows (from assigned tasks for this week) ──
    const autoRows = thisWeekTasks.map(t => `
    <tr class="auto-row">
      <td data-label="Type" class="type-cell">AUTO</td>
      <td data-label="Entry Date">${formatDate(t.entryDate) || '—'}</td>
      <td data-label="Task" class="task-cell">
        <span class="client-tag">${esc(t.client)}</span>
        <span class="task-name">${esc(t.task)}</span>
        ${t.statusNorm === 'carryover' ? '<span class="incomplete-pill" style="margin-top:4px">❌ Incomplete</span>' : ''}
        ${t.carryOver ? '<span class="carry-over-pill" style="margin-top:4px">↩ Carry Over</span>' : ''}
      </td>
      <td data-label="H Target" class="mono">${t.hTarget || '—'}</td>
      <td data-label="Status">
        <select class="status-sel" onchange="updateTaskStatus('${esc(t.id)}',this.value)" ${dis}>
          <option value="pending"    ${t.statusNorm === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="inprogress" ${t.statusNorm === 'inprogress' ? 'selected' : ''}>In Progress</option>
          <option value="waiting"    ${t.statusNorm === 'waiting' ? 'selected' : ''}>Waiting</option>
          <option value="done"       ${t.statusNorm === 'done' ? 'selected' : ''}>Done ✓</option>
        </select>
      </td>
      <td data-label="Present">
        <div class="seg-picker">
          <button class="seg-btn no ${(t.present === 'No' || !t.present) ? 'active' : ''}" onclick="updateTaskField('${esc(t.id)}','present','No')" ${dis}>N</button>
          <button class="seg-btn half ${t.present === 'Half' ? 'active' : ''}" onclick="updateTaskField('${esc(t.id)}','present','Half')" ${dis}>½</button>
          <button class="seg-btn yes ${t.present === 'Yes' ? 'active' : ''}" onclick="updateTaskField('${esc(t.id)}','present','Yes')" ${dis}>Y</button>
        </div>
      </td>
      <td data-label="Miiro" class="desktop-only">
        <input type="checkbox" class="toggle-check" ${t.miiro === 'Yes' ? 'checked' : ''} 
               onchange="updateTaskField('${esc(t.id)}','miiro',this.checked?'Yes':'No')" ${dis}>
      </td>
      <td data-label="BM" class="desktop-only">
        <input type="checkbox" class="toggle-check" ${t.bm === 'Yes' ? 'checked' : ''} 
               onchange="updateTaskField('${esc(t.id)}','bm',this.checked?'Yes':'No')" ${dis}>
      </td>
      <td data-label="Due" class="desktop-only">
        <strong style="color:${isOverdue(t.finalDue) && t.statusNorm !== 'done' ? 'var(--red)' : 'inherit'}">${formatDate(t.finalDue) || '—'}</strong>
      </td>
    </tr>
`).join('');

    const autoHeader = autoRows
        ? `<tr><td colspan="9" style="padding:5px 0 3px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--blue);border-bottom:1px solid rgba(59,130,246,0.2)">→ Current Week Tasks (Week ${currentWeekNum})</td></tr>`
        : `<tr><td colspan="9" class="empty-state" style="padding:40px;text-align:center;color:var(--text3)">No tasks or extra work logged for this week.</td></tr>`;

    body.innerHTML = autoHeader + autoRows;
    updateWeeklyStats(thisWeekTasks);
}

// ── NEW TASK-BASED STATS ENGINE ────────────────────────────

function updateTotalH(tasks) {
    if (!tasks) tasks = [];
    // Only count officially assigned tasks or APPROVED extra work
    const approved = tasks.filter(t => t.evaluation !== 'pending' && t.statusNorm === 'done');
    const total = approved.reduce((s, t) => s + (parseFloat(t.hTarget) || 0), 0);
    const el = document.getElementById('totalH');
    if (el) el.textContent = total.toFixed(1);
}

function updateWeeklyStats(tasks) {
    if (!tasks || !Array.isArray(tasks)) {
        tasks = [];
    }

    console.log(`[STATS] Processing ${tasks.length} tasks for current view...`);

    // 1. Filter for valid work: Official assigned tasks + APPROVED extra work.
    const evaluatableTasks = tasks.filter(t => {
        const isEx = t.isExtra || (t.id && t.id.toString().includes('extra'));
        if (isEx) {
            // Extra work only counts once it's not pending approval anymore
            return !t.needsApproval;
        }
        return true; 
    });

    // 2. Total H Score: SUM of hTarget for ALL assigned/approved tasks for the week
    const totalH = evaluatableTasks.reduce((s, t) => s + (parseFloat(t.hTarget) || 0), 0);

    // 3. Tasks Done count (Only those marked Done ✓)
    const doneTasks = evaluatableTasks.filter(t => (t.statusNorm || '').toLowerCase() === 'done');
    const totalDone = doneTasks.length;

    // 4. Days Present: COUNT unique dates where designer explicitly clicked 'Yes' or 'Half'
    const presentDates = new Set();
    tasks.forEach(t => {
        if (t.present === 'Yes' || t.present === 'Half') {
            const rawDate = t.date || t.entryDate || '';
            if (rawDate) {
                // Normalize date to YYYY-MM-DD to ensure unique day counting
                const cleanDate = rawDate.split('T')[0];
                presentDates.add(cleanDate);
            }
        }
    });
    const presentCount = presentDates.size;

    // 5. Miiro/BM: Count 'Yes' checkboxes
    const miiro = evaluatableTasks.filter(t => t.miiro === 'Yes').length;
    const bm = evaluatableTasks.filter(t => t.bm === 'Yes').length;
    
    console.log(`[STATS] Results: H=${totalH}, Done=${totalDone}, Present=${presentCount}`);

    const set = (id, v) => { 
        const e = document.getElementById(id); 
        if (e) e.textContent = v; 
    };
    
    set('totalH', totalH.toFixed(1));
    set('wst-h', totalH.toFixed(1));
    set('wst-done', totalDone);
    set('wst-present', presentCount);
    set('wst-miiro', miiro);
    set('wst-bm', bm);
}

// ── KPI SCREEN ─────────────────────────────────────────────
function switchKPIDesigner(key) {
    document.querySelectorAll('.kpi-designer-sel .pill').forEach(p => p.classList.remove('active'));
    const kpiPill = document.querySelector(`.kpi-designer-sel [data-d="${key}"]`);
    if (kpiPill) kpiPill.classList.add('active');
    currentKPIDesigner = key;
    renderKPITable(key);
    const d = DESIGNERS.find(d => d.key === key);
    document.getElementById('kpiPanelTitle').textContent = `${d.name || key} — Task KPI`;
}

async function renderKPI() {
    document.getElementById('kpiWeekLabel').textContent = `Week ${currentKPIWeek}`;
    renderLeaderboard();
    renderKPITable(currentKPIDesigner);
    renderKPIApprovals(currentKPIDesigner, currentKPIWeek); // New: Render approvals
}

// ── KPI SCORE ENGINES ───────────────────────────────────────

// Designer: total per task = (hScore/10) * ((quality + attitude) / 2)
function calcDesignerTaskScore(hScore, quality, attitude) {
    if (quality == null || attitude == null || !hScore) return null;
    return (hScore / 10) * ((parseFloat(quality) + parseFloat(attitude)) / 2);
}

// Senior Designer: qty = hScore * complexity; qlty = (q*0.3)+(impact*0.4)+(deadline*0.3); total = qty * qlty
function calcSeniorTaskScore(hScore, complexity, quality, impact, deadlineScore) {
    if (quality == null || !hScore || !complexity) return null;
    const qty = hScore * parseFloat(complexity);
    const finalImpact = (impact === '' || impact == null) ? 9 : parseFloat(impact);
    const finalDeadline = (deadlineScore == null) ? 10 : parseFloat(deadlineScore) / 10;
    const qlty = (parseFloat(quality) * 0.3) + (finalImpact * 0.4) + (finalDeadline * 0.3);
    return qty * qlty;
}

// Deadline score on a 0-10 scale for senior designer
function calcDeadlineScore10(t) {
    if (!t.finalDue || t.statusNorm !== 'done' || !t.closeDate) return null;
    const daysLate = Math.floor((new Date(t.closeDate) - new Date(t.finalDue)) / 86400000);
    if (daysLate <= 0) return 10;
    if (daysLate === 1) return 8;
    if (daysLate <= 3) return 6;
    if (daysLate <= 5) return 4;
    return Math.max(0, 2 - (daysLate - 5));
}

async function renderLeaderboard() {
    let data = await Promise.all(DESIGNERS.map(async d => {
        const isSenior = d.role === 'senior_designer';
        // kpiRows is for old local storage KPI, not used with t.evaluation
        const weekTasks = allTasks.filter(t =>
            d.match.includes((t.assignee || '').toLowerCase().trim()) &&
            t.weekNum === currentKPIWeek &&
            t.evaluation !== 'pending'
        );

        let weekScore = null;
        let scoreLabel = 'Waiting';
        let hLabel = '—';
        let presentCount = 0;
        let miiroCount = 0;
        let bmCount = 0;

        if (isSenior) {
            // Senior: sum of (qty × qlty) per task this week
            let sum = 0; let hasData = false;
            let prSet = new Set();
            weekTasks.forEach(t => {
                const kpi = t.evaluation || {};
                const dl = calcDeadlineScore10(t);
                const s = calcSeniorTaskScore(t.hTarget, kpi.complexity, kpi.quality, kpi.impact, dl != null ? dl * 10 : null);
                if (s != null) { sum += s; hasData = true; }
                
                if (t.present === 'Yes' || t.present === 'Half') {
                    const rawDate = t.date || t.entryDate || '';
                    if (rawDate) prSet.add(rawDate.split('T')[0]);
                }
                if (t.miiro === 'Yes') miiroCount++;
                if (t.bm === 'Yes') bmCount++;
            });
            weekScore = hasData ? sum : null;
            scoreLabel = weekScore != null ? weekScore.toFixed(1) : '—';
            // Only Done tasks count toward H-Score in KPI
            const completedTasks = weekTasks.filter(t => t.statusNorm === 'done');
            const totalQty = completedTasks.reduce((s, t) => s + ((t.hTarget || 0) * (parseFloat((t.evaluation || {}).complexity || 1))), 0);
            hLabel = totalQty.toFixed(1);
            presentCount = prSet.size;
        } else {
            // Designer: avg of task scores this week
            const taskScores = [];
            let prSet = new Set();
            weekTasks.forEach(t => {
                const kpi = t.evaluation || {};
                const s = calcDesignerTaskScore(t.hTarget, kpi.quality, kpi.impact); // impact is attitude for designers
                if (s != null) taskScores.push(s);

                if (t.present === 'Yes' || t.present === 'Half') {
                    const rawDate = t.date || t.entryDate || '';
                    if (rawDate) prSet.add(rawDate.split('T')[0]);
                }
                if (t.miiro === 'Yes') miiroCount++;
                if (t.bm === 'Yes') bmCount++;
            });
            weekScore = taskScores.length ? avg(taskScores) : null;
            scoreLabel = weekScore != null ? weekScore.toFixed(2) : 'Waiting';
            const earnedH = weekTasks.filter(t => t.statusNorm === 'done').reduce((s, t) => s + (t.hTarget || 0), 0);
            hLabel = earnedH.toFixed(1);
            presentCount = prSet.size;
        }

        return { 
            key: d.key, 
            name: d.name, 
            role: d.role || (isSenior ? 'senior_designer' : 'designer'), 
            isSenior, 
            weekScore, 
            scoreLabel, 
            hLabel,
            presentCount,
            miiroCount,
            bmCount
        };
    }));
    data.sort((a, b) => (b.weekScore || 0) - (a.weekScore || 0));

    const lbHeader = document.querySelector('.lb-header');
    if (lbHeader) {
        lbHeader.classList.remove('month-mode');
        lbHeader.innerHTML = `
            <span>Designer</span>
            <span>Pr</span><span>Mi</span><span>BM</span>
            <span>H Score</span>
            <span>Total KPI</span>
        `;
    }

    const rankCls = ['gold', 'silver', 'bronze', ''];
    const lbRows = document.getElementById('lbRows');
    if (!lbRows) return;
    lbRows.innerHTML = data.map((d, i) => `
    <div class="lb-row">
      <div class="lb-name">
        <div class="lb-rank ${rankCls[i] || ''}">${i + 1}</div>
        <span>${esc(d.name)}</span>
        <span class="role-badge ${d.isSenior ? 'senior_designer' : (d.role || 'designer')}" style="margin-left:8px; transform: scale(0.9); transform-origin: left;">
            ${ROLE_LABELS[d.isSenior ? 'senior_designer' : (d.role || 'designer')] || 'Designer'}
        </span>
      </div>
      <div class="lb-val mono">${d.presentCount || '—'}</div> <!-- Presence -->
      <div class="lb-val mono">${d.miiroCount || '—'}</div> <!-- Miiro -->
      <div class="lb-val mono">${d.bmCount || '—'}</div> <!-- BM -->
      <div class="lb-val mono">${d.hLabel}</div>
      <div class="lb-val mono hi">${d.scoreLabel}</div>
    </div>`).join('');
}


function renderKPITable(key) {
    const d = DESIGNERS.find(d => d.key === key);
    if (!d) return;
    const isSenior = d.role === 'senior_designer';
    const tasks = allTasks.filter(t =>
        d.match.includes((t.assignee || '').toLowerCase().trim()) &&
        t.weekNum === currentKPIWeek
    );
    const thead = document.querySelector('.kpi-table thead tr');
    const body = document.getElementById('kpiTableBody');
    if (!body) return;
    const editable = canEditWeek(currentKPIWeek);
    const dis = !editable ? 'disabled' : '';

    // — Update column headers based on role —
    if (thead) {
        if (isSenior) {
            thead.innerHTML = `
                <th>Task</th><th>Client</th><th>H</th>
                <th>Complexity<br><small>1.0 / 1.3 / 1.6 / 2.0</small></th>
                <th>QTY<br><small>H×C</small></th>
                <th>Quality<br><small>1–10</small></th>
                <th>QLTY<br><small>Wgt</small></th>
                <th>Total<br><small>Q×Q</small></th>
                <th>Status</th>
            `;
        } else {
            thead.innerHTML = `
                <th>Task</th><th>Client</th><th>Week</th>
                <th>H Score</th>
                <th>Quality<br><small>1–10</small></th>
                <th>Attitude<br><small>1–10</small></th>
                <th>Task Score<br><small>(H/10)×avg</small></th>
                <th>Status</th>
            `;
        }
    }

    if (tasks.length === 0) {
        const cols = isSenior ? 10 : 8; 
        body.innerHTML = `<tr><td colspan="${cols}" style="text-align:center;padding:20px;color:var(--text3)">No tasks for ${d.name} in Week ${currentKPIWeek}</td></tr>`;
        return;
    }

    if (isSenior) {
        // ── SENIOR DESIGNER table rows ──
        body.innerHTML = tasks.map(t => {
            const kpi = t.evaluation || {};
            const hs = t.hTarget || 0;
            const complexity = kpi.complexity || '';
            const q = kpi.quality || '';
            const impactRaw = kpi.impact || '';
            const dlRaw = calcDeadlineScore10(t); // 0-10 or null

            const dlDisplay = dlRaw != null ? dlRaw.toFixed(1) : '—';
            const dlCls = dlRaw != null ? (dlRaw >= 8 ? 'green' : dlRaw >= 5 ? 'orange' : 'red') : '';

            const qtyVal = (complexity && hs) ? (hs * parseFloat(complexity)) : null;
            const qty = qtyVal != null ? qtyVal.toFixed(2) : '—';

            let qlty = '—'; let totalVal = '—';
            if (q !== '' && complexity) {
                const finalImpact = impactRaw === '' ? 9 : parseFloat(impactRaw);
                const finalDeadline = dlRaw == null ? 10 : dlRaw;
                qlty = ((parseFloat(q) * 0.3) + (finalImpact * 0.4) + (finalDeadline * 0.3)).toFixed(2);
                if (qtyVal != null) totalVal = (qtyVal * parseFloat(qlty)).toFixed(2);
            }

            return `<tr>
                <td data-label="Task" class="kpi-task-title">${esc(t.task)}</td>
                <td data-label="Client">${esc(t.client)}</td>
                <td data-label="H" class="mono accent">${hs.toFixed(1)}</td>
                <td data-label="Complexity">
                    <select class="kpi-input" onchange="saveKPIField('${esc(key)}','${esc(t.id)}','complexity',this.value); renderKPI();" ${dis}>
                        <option value="">—</option>
                        <option value="1.0" ${complexity == '1.0' ? 'selected' : ''}>1.0 Normal</option>
                        <option value="1.3" ${complexity == '1.3' ? 'selected' : ''}>1.3 Moderate</option>
                        <option value="1.6" ${complexity == '1.6' ? 'selected' : ''}>1.6 High</option>
                        <option value="2.0" ${complexity == '2.0' ? 'selected' : ''}>2.0 Very High</option>
                    </select>
                </td>
                <td data-label="QTY" class="mono" style="color:var(--blue)">${qty}</td>
                <td data-label="Quality"><input class="kpi-input" type="number" min="1" max="10" step="0.5" value="${esc(q)}" placeholder="—"
                    onchange="saveKPIField('${esc(key)}','${esc(t.id)}','quality',this.value); renderKPI();" ${dis} /></td>
                <td data-label="QLTY" class="mono desktop-only" style="color:var(--text2)">${qlty}</td>
                <td data-label="Total" class="mono desktop-only" style="font-weight:800;color:var(--accent)">${totalVal}</td>
                <td data-label="Status">
                   ${t.statusNorm === 'carryover' ? '<span class="incomplete-pill">❌ Incomplete</span>' : (t.carryOver ? '<span class="carry-over-pill">↩ Carry</span>' : '—')}
                </td>
            </tr>`;
        }).join('');

        // Show potential SUM at bottom for senior
        let sum = 0;
        tasks.forEach(t => {
            const kpi = t.evaluation || {};
            const dl = calcDeadlineScore10(t); // null if not done
            const s = calcSeniorTaskScore(t.hTarget, kpi.complexity, kpi.quality, kpi.impact, dl != null ? dl * 10 : null);
            if (s != null) sum += s;
        });
        body.innerHTML += `<tr style="border-top:2px solid var(--border)">
            <td colspan="8" style="text-align:right;padding:10px 8px;color:var(--text3);font-size:10px italic">Potential Weekly Sum</td>
            <td class="mono" style="font-weight:900;font-size:16px;color:var(--accent)">${sum.toFixed(2)}</td>
        </tr>`;

    } else {
        // ── DESIGNER table rows ──
        const taskScores = [];
        body.innerHTML = tasks.map(t => {
            const kpi = t.evaluation || {};
            const hs = t.hTarget || 0;
            const q = kpi.quality || '';
            const attitude = kpi.impact || ''; // stored as 'impact' field

            const score = calcDesignerTaskScore(hs, q || null, attitude || null);
            if (score != null) taskScores.push(score);
            const scoreDisplay = score != null ? score.toFixed(3) : '—';

            return `<tr>
                <td data-label="Task" style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.task)}</td>
                <td data-label="Client">${esc(t.client)}</td>
                <td data-label="Week" class="mono" style="color:var(--blue)">W${t.weekNum}</td>
                <td data-label="H Score" class="mono accent">${hs.toFixed(1)}</td>
                <td data-label="Quality"><input class="kpi-input" type="number" min="1" max="10" step="0.5" value="${esc(q)}" placeholder="—"
                    onchange="saveKPIField('${esc(key)}','${esc(t.id)}','quality',this.value); renderKPI();" ${dis} /></td>
                <td data-label="Attitude"><input class="kpi-input" type="number" min="1" max="10" step="0.5" value="${esc(attitude)}" placeholder="—"
                    onchange="saveKPIField('${esc(key)}','${esc(t.id)}','impact',this.value); renderKPI();" ${dis} /></td>
                <td data-label="Score" class="mono" style="font-weight:700;color:var(--accent)">${scoreDisplay}</td>
                <td data-label="Status">
                    ${t.statusNorm === 'carryover' ? '<span class="incomplete-pill">❌ Incomplete</span>' : (t.carryOver ? '<span class="carry-over-pill">↩ Carry</span>' : '—')}
                </td>
            </tr>`;
        }).join('');

        // Show weekly avg at bottom for designer
        const weekAvg = taskScores.length ? avg(taskScores) : null;
        body.innerHTML += `<tr style="border-top:2px solid var(--border)">
            <td colspan="7" style="text-align:right;padding:10px 8px;color:var(--text2);font-size:11px">Weekly Performance Score (avg of tasks)</td>
            <td class="mono" style="font-weight:900;font-size:16px;color:var(--accent)">${weekAvg != null ? weekAvg.toFixed(3) : '—'}</td>
        </tr>`;
    }
}

function calcDeadlineScore(t) {
    if (!t.finalDue || t.statusNorm !== 'done') return null;
    if (!t.closeDate) return null;
    const daysLate = Math.floor((new Date(t.closeDate) - new Date(t.finalDue)) / 86400000);
    if (daysLate <= 0) return 100;
    return Math.max(0, 100 - daysLate * 10);
}

function calcAvgDeadlineScore(key, weekNum) {
    const d = DESIGNERS.find(d => d.key === key);
    const filter = t => d.match.includes((t.assignee || '').toLowerCase()) && t.statusNorm === 'done';
    const tasks = weekNum ? allTasks.filter(t => filter(t) && t.weekNum === weekNum) : allTasks.filter(filter);
    const scores = tasks.map(t => calcDeadlineScore(t)).filter(s => s !== null);
    return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
}

function getWeekHScore(key) {
    let total = 0; let count = 0;
    for (let w = 1; w <= 52; w++) {
        const rows = getWeeklyRows(key, w);
        if (rows.length === 0) break;
        rows.forEach(r => { total += parseFloat(r.h) || 0; count++; });
    }
    return count > 0 ? total / count : null;
}

function getWeekHScoreForTask(key, weekNum) {
    const rows = getWeeklyRows(key, weekNum);
    const total = rows.reduce((s, r) => s + (parseFloat(r.h) || 0), 0);
    return total || null;
}

function loadKPIData(key) {
    try { return JSON.parse(localStorage.getItem(`kpi-${key}`) || '[]'); } catch { return []; }
}

async function saveKPIField(key, taskId, field, val) {
    if (!canEditWeek(currentKPIWeek)) {
        toast('Score locked. This week is closed.', 'error');
        await renderKPI();
        return;
    }

    const value = parseFloat(val) || 0;
    
    // 1. Update backend task
    try {
        const updateData = {};
        updateData[`evaluation.${field}`] = value;
        
        const res = await apiFetch(`${API_BASE_URL}/tasks/${taskId}`, {
            method: 'PATCH',
            body: JSON.stringify(updateData)
        });
        if (!res || !res.ok) throw new Error('API update failed');
        
        // 2. Refresh local data
        await loadData();
        await renderKPI();
        toast('Score saved', 'success');
    } catch (e) {
        toast('Failed to save score', 'error');
    }
}

function avg(arr) {
    const a = arr.filter(v => v != null);
    return a.length ? a.reduce((s, v) => s + parseFloat(v), 0) / a.length : null;
}

// ── SPRINT CLOSE ───────────────────────────────────────────
function updateSprintBadge() {
    const w = getWeekNum();
    const el = document.getElementById('nb-sprint');
    if (el) el.textContent = `W${w}`;
    const el2 = document.getElementById('sprintWeekLabel');
    if (el2) el2.textContent = `Week ${w} — Close`;
    // Force active W badge update in sidebar
    document.querySelector('.nav-badge.orange').textContent = `W${w}`;
}

function renderSprintClose() {
    const w = currentSprintWeek;
    document.getElementById('sprintWeekLabel').textContent = `Week ${w} — Close`;

    let totalAssigned = 0, totalDone = 0, totalCarry = 0;
    const grid = document.getElementById('sprintGrid');
    if (!grid) return;

    grid.innerHTML = DESIGNERS.map(d => {
        const tasks = allTasks.filter(t =>
            d.match.includes((t.assignee || '').toLowerCase().trim()) &&
            (t.weekNum === w || !t.weekNum)
        );
        const done = tasks.filter(t => t.statusNorm === 'done').length;
        const pending = tasks.filter(t => t.statusNorm !== 'done').length;
        totalAssigned += tasks.length;
        totalDone += done;
        totalCarry += pending;
        const rate = tasks.length ? Math.round(done / tasks.length * 100) : 0;
        const rateColor = rate >= 80 ? 'green' : rate >= 50 ? 'orange' : 'red';
        return `
      <div class="sprint-card">
        <div class="sprint-card-hdr">
          <span class="av-dot" style="background:${d.color}">${d.av}</span>
          <span class="sprint-card-name">${d.name}</span>
        </div>
        <div class="sc-row"><span class="sc-label">Assigned</span><span class="sc-val">${tasks.length}</span></div>
        <div class="sc-row"><span class="sc-label">Completed</span><span class="sc-val green">${done}</span></div>
        <div class="sc-row"><span class="sc-label">Carry Over</span><span class="sc-val orange">${pending}</span></div>
        <div class="sc-row"><span class="sc-label">Rate</span><span class="sc-val ${rateColor}">${rate}%</span></div>
      </div>`;
    }).join('');

    // Summary
    const rate = totalAssigned ? Math.round(totalDone / totalAssigned * 100) : 0;
    document.getElementById('ss-assigned').textContent = totalAssigned;
    document.getElementById('ss-completed').textContent = totalDone;
    document.getElementById('ss-carryover').textContent = totalCarry;
    document.getElementById('ss-rate').textContent = rate + '%';
}

function confirmWeekClose() {
    const w = getWeekNum();
    const modal = document.getElementById('closeConfirmOverlay');
    const totalAssigned = allTasks.filter(t => t.weekNum === w).length;
    const totalDone = allTasks.filter(t => t.weekNum === w && t.statusNorm === 'done').length;
    const carryovers = totalAssigned - totalDone;
    document.getElementById('confirmStats').innerHTML = `
            <div class="cs-item" ><span class="cs-val">${totalAssigned}</span><span class="cs-label">Assigned</span></div>
    <div class="cs-item"><span class="cs-val green">${totalDone}</span><span class="cs-label">Completed</span></div>
    <div class="cs-item"><span class="cs-val orange">${carryovers}</span><span class="cs-label">Carry Over</span></div>
        `;
    modal.classList.add('open');
}

function resetToWeekOne() {
    showConfirm(
        'Reset System',
        'Are you sure you want to reset the current week back to Week 1?',
        () => {
            localStorage.setItem('cfg-weekNum', 1);
            currentWeekNum = 1;
            currentBoardWeek = 1;
            currentSprintWeek = 1;
            currentKPIWeek = 1;

            const d = new Date();
            d.setDate(d.getDate() - d.getDay() + 1);
            localStorage.setItem('cfg-weekStart', d.toISOString().split('T')[0]);

            renderAll();
            toast('Week manually reset to 1.', 'success');
        }
    );
}

async function executeWeekClose() {
    document.getElementById('closeConfirmOverlay').classList.remove('open');
    const w = currentSprintWeek;
    const closeDate = new Date().toISOString().split('T')[0];
    const today = new Date();

    // 1. Build & Save Snapshot
    const snapshot = { weekNum: w, closeDate, designers: {} };
    DESIGNERS.forEach(d => {
        const tasks = allTasks.filter(t => d.match.includes((t.assignee || '').toLowerCase().trim()) && t.weekNum === w);
        const done = tasks.filter(t => t.statusNorm === 'done');
        const carry = tasks.filter(t => t.statusNorm !== 'done');
        snapshot.designers[d.key] = { 
            name: d.name, 
            assigned: tasks.length, 
            completed: done.length, 
            carryovers: carry.length, 
            rate: tasks.length ? Math.round(done.length / tasks.length * 100) : 0 
        };
    });

    try {
        await apiFetch(`${API_BASE_URL}/history`, {
            method: 'POST',
            body: JSON.stringify(snapshot)
        });
    } catch (e) { console.error('History save failed:', e); }

    // 2. Handle Carry-overs
    const carryTasks = allTasks.filter(t => t.weekNum === w && t.statusNorm !== 'done');
    for (const t of carryTasks) {
        // A. Mark old task as carryover in backend
        await apiFetch(`${API_BASE_URL}/tasks/${t.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ 
                statusNorm: 'carryover',
                carryOver: true
            })
        });

        // B. Logic for new deadlines / scores
        let newDue = t.finalDue;
        if (t.finalDue) {
            const origDue = new Date(t.finalDue);
            const daysLeft = Math.max(3, Math.ceil((origDue - today) / 86400000));
            const halfDays = Math.ceil(daysLeft / 2);
            const newDueDate = new Date(today.getTime() + halfDays * 86400000);
            newDue = newDueDate.toISOString().split('T')[0];
        }
        const newH = t.hTarget ? Math.max(1, Math.ceil(t.hTarget / 2)) : t.hTarget;

        // C. Create fresh task for next week in backend
        const nextTask = {
            client: t.client,
            task: t.task,
            assignee: t.assignee,
            statusNorm: 'pending',
            weekNum: w + 1,
            hTarget: newH,
            finalDue: newDue,
            entryDate: closeDate,
            carryOver: true,
            origCarryFrom: w,
            notes: (t.notes || '') + ` (Carried from Week ${w})`
        };

        await apiFetch(`${API_BASE_URL}/tasks`, {
            method: 'POST',
            body: JSON.stringify(nextTask)
        });
    }

    toast(`Week ${w} closed. Data synchronized.`, 'success');
    
    // Auto-advance block week or reset to 1
    const nextWk = w >= 5 ? 1 : w + 1;
    localStorage.setItem('cfg-weekNum', nextWk);
    currentWeekNum = nextWk;
    currentBoardWeek = nextWk;
    currentSprintWeek = nextWk;
    currentKPIWeek = nextWk;

    await loadData();
    await loadHistory();
    renderAll();
}

// ── HISTORY VIEW TOGGLE ────────────────────────────────────
function switchHistView(view) {
    document.getElementById('hist-week').classList.toggle('active', view === 'week');
    document.getElementById('hist-month').classList.toggle('active', view === 'month');

    if (view === 'month') {
        document.getElementById('historyTimeline').style.display = 'none';
        document.getElementById('historyMonthlyTimeline').style.display = 'block';
    } else {
        document.getElementById('historyTimeline').style.display = 'block';
        document.getElementById('historyMonthlyTimeline').style.display = 'none';
    }
}

// Auto-add a weekly tracker H-score row for a task
async function autoAddWeeklyHRow(task, weekNum) {
    const d = getDesigner(task.assignee);
    if (!d) return;
    const rows = await getWeeklyRows(d.key, weekNum);
    // Don't duplicate
    if (rows.find(r => r.task === task.task)) return;
    const day = new Date(task.entryDate || new Date()).toLocaleDateString('en-IN', { weekday: 'short' }).slice(0, 3);
    rows.push({ day, date: task.entryDate || '', task: task.task, h: task.hTarget || 0, completed: '', present: 'Yes', miiro: 'No', bm: 'No' });
    await saveWeeklyRows(d.key, weekNum, rows);
}


// ── HISTORY SCREEN ─────────────────────────────────────────
async function loadHistory() {
    try {
        const res = await apiFetch(`${API_BASE_URL}/history`);
        if (res && res.ok) {
            closedWeeks = await res.json();
            renderHistory();
        }
    } catch (e) {
        console.error('Load history error:', e);
    }
}

function renderHistory() {
    const timeline = document.getElementById('historyTimeline');
    if (!timeline) return;

    document.getElementById('hs-weeks').textContent = closedWeeks.length;
    if (closedWeeks.length === 0) {
        timeline.innerHTML = `<div class="empty-state">
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <p>No closed weeks yet.</p><p style="color:var(--text3);font-size:12px">Close your first sprint to start tracking.</p>
    </div>`;
        return;
    }

    // Global stats
    const allRates = closedWeeks.flatMap(w => Object.values(w.designers).map(d => d.rate));
    const allDone = closedWeeks.reduce((s, w) => s + Object.values(w.designers).reduce((a, d) => a + d.completed, 0), 0);
    const allCarry = closedWeeks.reduce((s, w) => s + Object.values(w.designers).reduce((a, d) => a + d.carryovers, 0), 0);
    document.getElementById('hs-avg').textContent = allRates.length ? Math.round(allRates.reduce((a, b) => a + b, 0) / allRates.length) + '' : '—';
    document.getElementById('hs-done').textContent = allDone;
    document.getElementById('hs-carry').textContent = allCarry;

    timeline.innerHTML = [...closedWeeks].sort((a,b) => b.weekNum - a.weekNum).map(wk => {
        const designers = Object.entries(wk.designers).map(([key, d]) => {
            const rateClass = d.rate >= 80 ? 'good' : d.rate >= 50 ? 'medium' : 'poor';
            return `<div class="hwc-d">
        <div class="hwc-d-name">${esc(d.name)}</div>
        <div class="hwc-d-rate ${rateClass}">${d.rate}%</div>
        <div class="hwc-d-sub">${d.completed}/${d.assigned} tasks
          ${d.carryovers > 0 ? `<span class="carry-over-pill">↩ ${d.carryovers}</span>` : ''}
        </div>
      </div>`;
        }).join('');
        return `
            <div class="history-week-card">
        <div class="hwc-header">
          <span class="hwc-title">Week ${wk.weekNum}</span>
          <span class="hwc-date">Closed ${formatDate(wk.closeDate)}</span>
        </div>
        <div class="hwc-designers">${designers}</div>
      </div>`;
    }).join('');
}

// ── SETTINGS ───────────────────────────────────────────────
function saveCfg(key) {
    console.log(`[SETTINGS] Attempting to save: ${key}`);
    const id = `cfg-${key}`;
    const el = document.getElementById(id);
    if (!el) {
        console.error(`[SETTINGS] Element #${id} not found!`);
        toast(`Error: Field ${key} not found`, 'error');
        return;
    }
    
    const val = el.value.trim();
    localStorage.setItem(id, val);
    console.log(`[SETTINGS] Saved ${id} = "${val}"`);
    
    toast('Saved ✓', 'success');

    // Special cases
    if (key === 'apiUrl' || key === 's1' || key === 's2' || key === 's3') {
        setTimeout(() => window.location.reload(), 800);
    }
    if (key === 'weekNum') { 
        currentWeekNum = parseInt(val) || 1; 
        renderAll(); 
    }
}

async function testAPI() {
    const url = getBaseUrl();
    if (!url) { toast('No API URL configured', 'error'); return; }
    try {
        const res = await fetch(`${url}/tasks`).catch(() => null);
        if (res && res.status !== 404) { 
            toast('API connected ✓', 'success'); 
            checkAPIStatus(); 
        } else {
            throw new Error();
        }
    } catch { 
        toast('API not reachable. Check URL in settings.', 'error'); 
    }
}

function checkAPIStatus() {
    const url = localStorage.getItem('cfg-apiUrl');
    const el = document.getElementById('apiStatus');
    if (!el) return;
    if (url || PROD_API_URL) { 
        el.textContent = 'Configured'; 
        el.className = 'conn-badge ok'; 
    } else { 
        el.textContent = 'Not configured'; 
        el.className = 'conn-badge'; 
    }
}

function loadSettings() {
    ['s1', 's2', 's3', 'apiUrl', 'weekNum', 'weekStart'].forEach(k => {
        const id = `cfg-${k}`;
        const v = localStorage.getItem(id);
        const e = document.getElementById(id);
        if (e) {
            if (v !== null) e.value = v;
            console.log(`[SETTINGS] Loaded ${id}:`, v);
        }
    });
    checkAPIStatus();
}

// ── CLOCK ──────────────────────────────────────────────────
function updateClock() {
    const now = new Date();
    const t = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    document.getElementById('sidebarTime').textContent = t;
}

// ── INIT ───────────────────────────────────────────────────
async function initApp() {
    if (!checkAuth()) return;
    
    await loadTeam();
    currentWeekNum = getWeekNum();
    document.getElementById('currentWeekChip').textContent = `Week ${currentWeekNum}`;
    document.getElementById('nb-sprint').textContent = `W${currentWeekNum}`;

    // 👤 Update Topbar User Info
    if (currentUser) {
        const nameEl = document.getElementById('topbar-name');
        const avEl = document.getElementById('topbar-av');
        let displayName = currentUser.username;
        let displayInitial = (currentUser.username || 'U')[0].toUpperCase();
        if (currentUser.role === 'designer' && currentUser.designerKey) {
            const des = DESIGNERS.find(d => d.key === currentUser.designerKey);
            if (des) {
                displayName = des.name;
                displayInitial = des.av || des.name[0].toUpperCase();
            }
        } else if (currentUser.username === 'admin') {
            displayName = 'Administrator';
            displayInitial = 'A';
        }
        if (nameEl) nameEl.textContent = displayName;
        if (avEl) avEl.textContent = displayInitial;
    }

    loadSettings();
    initMonthState();
    await loadData();
    await loadClients();
    await loadHistory();
    renderTeamGrid();
    renderClientGrid();
    rebuildDesignerTabs();

    // 🔐 Role Enforcement
    updateUIPermissions();
    // Initialize all weekly state variables
    currentBoardWeek = currentWeekNum;
    currentKPIWeek = currentWeekNum;
    currentSprintWeek = currentWeekNum;

    if (currentUserRole !== 'admin' && currentUser && currentUser.designerKey) {
        currentDesigner = currentUser.designerKey;
        currentWeekDesigner = currentUser.designerKey;
        currentKPIDesigner = currentUser.designerKey;
        switchScreen('board'); // Non-admins land on their board
    } else {
        switchScreen('works'); // Admins land on Works
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initApp();
    updateClock();
    setInterval(updateClock, 1000);
    document.getElementById('taskModalOverlay').addEventListener('click', closeTaskModal);
});

// ── TEAM MANAGEMENT ────────────────────────────────────────
async function addTeamMember() {
    const name = document.getElementById('tm-name').value.trim();
    const role = document.getElementById('tm-role').value || 'designer';
    const matchRaw = document.getElementById('tm-match').value.trim();
    const match = matchRaw ? matchRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [];
    const colorInput = document.getElementById('tm-color').value.trim() || '#7c6af4';
    const username = document.getElementById('tm-user').value.trim();
    const password = document.getElementById('tm-pass').value;

    if (!name) { toast('Name is required', 'error'); return; }
    if (!username || !password) { toast('Login credentials required', 'error'); return; }

    const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const color = colorInput.startsWith('#') ? `linear-gradient(135deg, ${colorInput}, ${darken(colorInput)})` : colorInput;
    const av = name[0].toUpperCase();

    const member = {
        key, name, role,
        match: match.length ? match : [key],
        color,
        av,
        hasAccount: false
    };

    // 1. Create Backend Account
    try {
        const res = await apiFetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            body: JSON.stringify({
                username,
                password,
                role: role || 'designer',
                designerKey: key
            })
        });
        if (!res || !res.ok) {
            const err = await res.json();
            throw new Error(err.message || 'Failed to create system account');
        }
        member.hasAccount = true;
    } catch (e) {
        toast(e.message, 'error');
        return;
    }

    // 2. Add to Team Data
    await saveTeamMember(member);
    await loadTeam();

    // Clear form
    ['tm-name', 'tm-match', 'tm-color', 'tm-user', 'tm-pass'].forEach(id => { 
        const e = document.getElementById(id); if (e) e.value = ''; 
    });
    toast(`${name} added and account created!`, 'success');
}

async function removeTeamMember(key) {
    showConfirm(
        'Remove Member',
        'Are you sure you want to remove this team member? This will not delete their tasks.',
        async () => {
            try {
                await apiFetch(`${API_BASE_URL}/designers/${key}`, { method: 'DELETE' });
                await loadTeam();
                toast('Team member removed', 'success');
            } catch (e) {
                toast('Failed to remove member', 'error');
            }
        }
    );
}

function randomizeTeamColor(inputId) {
    const vibrantColors = [
        '#7c6af4', '#f97316', '#22c55e', '#eab308', 
        '#3b82f6', '#ef4444', '#ec4899', '#8b5cf6',
        '#06b6d4', '#10b981', '#f59e0b', '#6366f1',
        '#d946ef', '#14b8a6', '#f43f5e', '#0ea5e9'
    ];
    const randomColor = vibrantColors[Math.floor(Math.random() * vibrantColors.length)];
    const el = document.getElementById(inputId);
    if (el) el.value = randomColor;
}

function darken(hex) {
    // Darken a hex color ~20%
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const r = Math.max(0, parseInt(c.slice(0, 2), 16) - 40);
    const g = Math.max(0, parseInt(c.slice(2, 4), 16) - 40);
    const b = Math.max(0, parseInt(c.slice(4, 6), 16) - 40);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')} `;
}

let editingMemberKey = null;

function openEditMember(key) {
    const team = getTeam();
    const m = team.find(x => x.key === key);
    if (!m) return;
    editingMemberKey = key;

    document.getElementById('edit-tm-name').value = m.name;
    document.getElementById('edit-tm-role').value = m.role || 'designer';
    document.getElementById('edit-tm-match').value = (m.match || []).join(', ');
    
    // Convert gradient back to hex if possible for easier editing
    let displayColor = m.color || '#7c6af4';
    if (displayColor.includes('rgba')) {
        // Just use the first part if it's a complex gradient, or keep as is
    } else if (displayColor.includes('#')) {
        const hexMatch = displayColor.match(/#[a-fA-F0-9]{6}/);
        if (hexMatch) displayColor = hexMatch[0];
    }
    document.getElementById('edit-tm-color').value = displayColor;

    // Account status logic
    const hasMsg = document.getElementById('has-account-msg');
    const noForm = document.getElementById('no-account-form');
    if (m.hasAccount) {
        hasMsg.style.display = 'block';
        noForm.style.display = 'none';
    } else {
        hasMsg.style.display = 'none';
        noForm.style.display = 'block';
        document.getElementById('edit-tm-user').value = m.key;
        document.getElementById('edit-tm-pass').value = '';
    }

    document.getElementById('editMemberOverlay').classList.add('open');
}

async function createAccountForMember() {
    if (!editingMemberKey) return;
    const team = getTeam();
    const m = team.find(x => x.key === editingMemberKey);
    if (!m) return;

    const username = document.getElementById('edit-tm-user').value.trim();
    const password = document.getElementById('edit-tm-pass').value;

    if (!username || !password) {
        toast('Please enter both username and password', 'error');
        return;
    }

    try {
        const res = await apiFetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            body: JSON.stringify({
                username,
                password,
                role: m.role || 'designer',
                designerKey: m.key
            })
        });

        if (!res || !res.ok) {
            const err = await res.json();
            throw new Error(err.message || 'Account creation failed');
        }

        // Update local status
        const idx = team.findIndex(x => x.key === editingMemberKey);
        team[idx].hasAccount = true;
        await saveTeamMember(team[idx]);
        await loadTeam();
        
        toast(`Account created for ${m.name}!`, 'success');
        openEditMember(m.key); // Refresh view
    } catch (e) {
        toast(e.message, 'error');
    }
}

function closeEditMember() {
    document.getElementById('editMemberOverlay').classList.remove('open');
    editingMemberKey = null;
}

function saveEditMember() {
    if (!editingMemberKey) return;
    const team = getTeam();
    const idx = team.findIndex(m => m.key === editingMemberKey);
    if (idx === -1) return;

    const name = document.getElementById('edit-tm-name').value.trim();
    const role = document.getElementById('edit-tm-role').value;
    const matchRaw = document.getElementById('edit-tm-match').value.trim();
    const match = matchRaw ? matchRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [editingMemberKey];
    const colorInput = document.getElementById('edit-tm-color').value.trim() || '#7c6af4';
    const color = colorInput.startsWith('#') ? `linear-gradient(135deg, ${colorInput}, ${darken(colorInput)})` : colorInput;

    if (!name) { toast('Name is required', 'error'); return; }

    const updatedMember = {
        ...team[idx],
        name,
        role,
        match,
        color,
        av: name[0].toUpperCase(),
    };

    saveTeamMember(updatedMember).then(() => {
        loadTeam();
        closeEditMember();
        toast(`${name} updated`, 'success');
    });
}

function renderTeamGrid() {
    const grid = document.getElementById('teamGrid');
    if (!grid) return;
    const team = getTeam();
    if (team.length === 0) {
        grid.innerHTML = '<div style="padding:16px;color:var(--text3);font-size:12px">No team members. Add one below.</div>';
        return;
    }

    grid.innerHTML = team.map(m => `
            <div class="team-card" >
            <span class="av-dot" style="background:${m.color};width:32px;height:32px;flex-shrink:0;font-size:13px">${m.av}</span>
            <div class="team-card-info">
                <div class="team-card-name">
                    ${esc(m.name)}
                    ${m.hasAccount ? '<span title="System Account Linked" style="font-size:10px;margin-left:4px">🔐</span>' : '<span title="No Account" style="font-size:10px;margin-left:4px;opacity:0.4">🔓</span>'}
                </div>
                <div class="team-card-role">
                    <span class="role-badge ${m.role}">${ROLE_LABELS[m.role] || m.role}</span>
                </div>
                <div class="team-card-match">${(m.match || []).join(', ')}</div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0">
                <button class="btn-sm" onclick="openEditMember('${esc(m.key)}')">✏️ Edit</button>
                <button class="btn-sm" style="color:var(--red);border-color:transparent"
                    onclick="removeTeamMember('${esc(m.key)}')">✕</button>
            </div>
        </div> `).join('');
}

function rebuildDesignerTabs() {
    // Rebuild the Designer Board tabs dynamically
    const tabs = document.getElementById('designerTabs');
    const mobList = document.getElementById('designerDropdownList');
    const team = getTeam();

    if (tabs) {
        tabs.innerHTML = team.map((m, i) => `
            <button class="dtab${m.key === currentDesigner ? ' active' : ''}" data-d="${m.key}" onclick="switchDesigner('${m.key}')">
                <span class="dtab-av" style="background:${m.color}">${m.av}</span>
                <span style="display:flex; flex-direction:column; align-items:flex-start; line-height:1.1">
                    <span style="font-weight:600">${esc(m.name)}</span>
                    <span style="font-size:7px; opacity:0.6; text-transform:uppercase; letter-spacing:0.05em">${ROLE_LABELS[m.role] || m.role}</span>
                </span>
                <span class="dtab-count" id="dcount-${m.key}">0</span>
            </button>`).join('');
    }

    if (mobList) {
        mobList.innerHTML = team.map(m => `
            <button class="dtab${m.key === currentDesigner ? ' active' : ''}" data-d="${m.key}" onclick="switchDesigner('${m.key}')">
                <span class="dtab-av" style="background:${m.color}">${m.av}</span>
                <span style="display:flex; flex-direction:column; align-items:flex-start; line-height:1.1">
                    <span style="font-weight:600">${esc(m.name)}</span>
                    <span style="font-size:7px; opacity:0.6; text-transform:uppercase; letter-spacing:0.05em">${ROLE_LABELS[m.role] || m.role}</span>
                </span>
                <span class="dtab-count" id="md-dcount-${m.key}">0</span>
            </button>`).join('');

        // Ensure active pill is set
        switchDesigner(currentDesigner);
    }
    // Rebuild weekly designer pills
    ['weekDesignerPills'].forEach(pid => {
        const el = document.getElementById(pid);
        if (!el) return;
        el.innerHTML = team.map((m, i) =>
            `<button class="pill${m.key === currentWeekDesigner ? ' active' : ''}" data-d="${m.key}" onclick="switchWeekDesigner('${m.key}')">${m.role === 'senior_designer' ? '👑 ' : ''}${esc(m.name)}</button>`
        ).join('');
    });
    // Rebuild KPI designer pills
    const kpiSel = document.querySelector('.kpi-designer-sel');
    if (kpiSel) {
        kpiSel.innerHTML = team.map((m, i) =>
            `<button class="pill${m.key === currentKPIDesigner ? ' active' : ''}" data-d="${m.key}" onclick="switchKPIDesigner('${m.key}')">${m.role === 'senior_designer' ? '👑 ' : ''}${esc(m.name)}</button>`
        ).join('');
    }
    // Rebuild assign grid in new task panel
    const assignGrid = document.getElementById('assignGrid');
    if (assignGrid) {
        assignGrid.innerHTML = team.map(m =>
            `<button class="assign-btn" data-d="${esc(m.name)}" onclick="selectDesigner(this)">
                <span class="dtab-av sm" style="background:${m.color}">${m.av}</span>${esc(m.name)}
            </button>`).join('');
    }
    updateBoardCounts();
}

// ── CLIENTS ────────────────────────────────────────────────
let allClients = [];
let editingClientId = null;

async function loadClients() {
    try {
        const res = await apiFetch(`${API_BASE_URL}/clients`);
        if (!res || !res.ok) throw new Error();
        const clients = await res.json();
        allClients = clients.map(c => ({ ...c, id: c._id || c.id }));
        saveClients(); // Keep local cache in sync
    } catch {
        allClients = JSON.parse(localStorage.getItem('clients') || '[]').map(c => ({
            ...c,
            id: c._id || c.id
        }));
    }
}

function saveClients() {
    localStorage.setItem('clients', JSON.stringify(allClients));
}

async function renderClientGrid() {
    await loadClients();
    filterClients();
    const nb = document.getElementById('nb-clients');
    if (nb) nb.textContent = allClients.length;
}

function filterClients() {
    const q = (document.getElementById('clientSearch').value || '').toLowerCase();
    const st = document.getElementById('clientStatusFilter').value;
    const list = allClients.filter(c => {
        if (q && !c.name.toLowerCase().includes(q) && !(c.contact || '').toLowerCase().includes(q)) return false;
        if (st && c.status !== st) return false;
        return true;
    });
    const grid = document.getElementById('clientGrid');
    if (!grid) return;
    if (list.length === 0) {
        grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" stroke-width="1.2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <p>No clients yet</p>
            <p style="font-size:12px;color:var(--text3)">Click "Add Client" to create your first client</p>
        </div>`;
        return;
    }
    grid.innerHTML = list.map(c => renderClientCard(c)).join('');
}

const STATUS_BADGE_MAP = {
    active: 'Active', new: 'New Lead', hold: 'On Hold', completed: 'Completed'
};

function renderClientCard(c) {
    const taskCount = allTasks.filter(t => (t.client || '').toLowerCase() === c.name.toLowerCase()).length;
    return `
            <div class="client-card" >
                <div class="client-card-top">
                    <span class="client-name">${esc(c.name)}</span>
                    <span class="status-badge ${c.status}">${STATUS_BADGE_MAP[c.status] || c.status}</span>
                </div>
        ${c.contact ? `<div class="client-contact">📞 ${esc(c.contact)}</div>` : ''}
        ${c.category ? `<div class="client-contact">🏷 ${esc(c.category)}</div>` : ''}
        ${c.notes ? `<div class="client-notes">${esc(c.notes)}</div>` : ''}
        <div class="client-actions">
            <span style="font-size:10px;color:var(--text3);margin-right:auto">${taskCount} task${taskCount !== 1 ? 's' : ''}</span>
            ${currentUserRole === 'admin' ? `
                <button class="btn-sm" onclick="editClient('${esc(c.id)}')">Edit</button>
                <select class="status-sel" onchange="updateClientStatus('${esc(c.id)}',this.value)" style="font-size:10px;padding:4px 6px">
                    <option value="active" ${c.status === 'active' ? 'selected' : ''}>Active</option>
                    <option value="new" ${c.status === 'new' ? 'selected' : ''}>New Lead</option>
                    <option value="hold" ${c.status === 'hold' ? 'selected' : ''}>On Hold</option>
                    <option value="completed" ${c.status === 'completed' ? 'selected' : ''}>Completed</option>
                </select>
                <button class="btn-icon-del" title="Remove Client" onclick="deleteClient('${esc(c.id)}')">✕</button>
            ` : `<span class="locked-status">${STATUS_BADGE_MAP[c.status] || c.status}</span>`}
        </div>
    </div> `;
}

function openAddClientPanel(id) {
    editingClientId = id || null;
    document.getElementById('clientPanelTitle').textContent = id ? 'Edit Client' : 'Add Client';
    const c = id ? allClients.find(c => c.id === id) : null;
    document.getElementById('cl-name').value = c ? c.name : '';
    document.getElementById('cl-status').value = c ? c.status : 'active';
    document.getElementById('cl-contact').value = c ? (c.contact || '') : '';
    document.getElementById('cl-category').value = c ? (c.category || '') : '';
    document.getElementById('cl-notes').value = c ? (c.notes || '') : '';
    document.getElementById('clientPanelOverlay').classList.add('open');
    document.getElementById('addClientPanel').classList.add('open');
}

function closeAddClientPanel() {
    document.getElementById('clientPanelOverlay').classList.remove('open');
    document.getElementById('addClientPanel').classList.remove('open');
    editingClientId = null;
}

async function submitClient() {
    const name = document.getElementById('cl-name').value.trim();
    if (!name) { toast('Client name required', 'error'); return; }

    const clientData = {
        name,
        status: document.getElementById('cl-status').value,
        contact: document.getElementById('cl-contact').value.trim(),
        category: document.getElementById('cl-category').value.trim(),
        notes: document.getElementById('cl-notes').value.trim()
    };

    try {
        let res;
        if (editingClientId) {
            res = await apiFetch(`${API_BASE_URL}/clients/${editingClientId}`, {
                method: 'PATCH',
                body: JSON.stringify(clientData)
            });
        } else {
            res = await apiFetch(`${API_BASE_URL}/clients`, {
                method: 'POST',
                body: JSON.stringify(clientData)
            });
        }
        if (!res) throw new Error('No response from server');
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.message || 'Server error');
        }
        toast(editingClientId ? 'Client updated' : 'Client added', 'success');
        closeAddClientPanel();
        await loadClients();
        renderClientGrid();
    } catch (e) {
        toast(e.message || 'Failed to sync client', 'error');
    }
}

function editClient(id) { openAddClientPanel(id); }

async function deleteClient(id) {
    if (!id) {
        toast('Error: Client ID missing. Refresh the page.', 'error');
        return;
    }

    showConfirm(
        'Remove Client',
        'Are you sure you want to permanently remove this client? This action cannot be undone.',
        async () => {
            try {
                const res = await apiFetch(`${API_BASE_URL}/clients/${id}`, {
                    method: 'DELETE'
                });
                if (!res) throw new Error('No response from backend server');
                if (!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.message || 'Server rejected the deletion');
                }
                toast('Client removed successfully', 'success');
                await loadClients();
                renderClientGrid();
            } catch (e) {
                console.error('[DELETE CLIENT ERROR]', e);
                toast(e.message || 'Failed to remove client', 'error');
            }
        }
    );
}

async function updateClientStatus(id, status) {
    try {
        const res = await apiFetch(`${API_BASE_URL}/clients/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status })
        });
        if (!res || !res.ok) throw new Error();
        renderClientGrid();
    } catch {
        toast('Failed to update status', 'error');
    }
}

// ── KPI VIEW TOGGLE (Week / Month) ─────────────────────────
let kpiView = 'week';
let currentMonth = new Date().getMonth();  // 0-11
let currentYear = new Date().getFullYear();

function initMonthState() {
    const now = new Date();
    currentMonth = now.getMonth();
    currentYear = now.getFullYear();
    updateMonthLabel();
}

function updateMonthLabel() {
    const d = new Date(currentYear, currentMonth, 1);
    const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const el = document.getElementById('monthLabel');
    if (el) el.textContent = label;
    const pt = document.getElementById('monthKPIPanelTitle');
    if (pt) pt.textContent = `Monthly KPI — ${label} `;
}

function switchKPIView(view) {
    kpiView = view;
    document.getElementById('kv-week').classList.toggle('active', view === 'week');
    document.getElementById('kv-month').classList.toggle('active', view === 'month');

    const monthSel = document.getElementById('monthSelector');
    const closeBtn = document.getElementById('closeMonthBtn');
    const weekSec = document.getElementById('weekKPISection');
    const monthSec = document.getElementById('monthKPISection');
    const lbTitle = document.getElementById('lbTitle');
    const lbTag = document.getElementById('lbTag');

    if (view === 'month') {
        if (monthSel) monthSel.style.display = 'flex';
        if (document.getElementById('weekKPISelector')) document.getElementById('weekKPISelector').style.display = 'none';
        if (closeBtn) closeBtn.style.display = 'flex';
        if (weekSec) weekSec.style.display = 'none';
        if (monthSec) monthSec.style.display = 'block';
        if (lbTitle) lbTitle.textContent = 'Monthly Leaderboard';
        if (lbTag) lbTag.textContent = 'Aggregated this month';
        renderMonthLeaderboard();
        renderMonthKPITable();
        renderMonthHistory();
    } else {
        if (monthSel) monthSel.style.display = 'none';
        if (document.getElementById('weekKPISelector')) document.getElementById('weekKPISelector').style.display = 'flex';
        if (closeBtn) closeBtn.style.display = 'none';
        if (weekSec) weekSec.style.display = 'block';
        if (monthSec) monthSec.style.display = 'none';
        if (lbTitle) lbTitle.textContent = 'Weekly Leaderboard';
        if (lbTag) lbTag.textContent = 'Based on performance indices';
        renderKPI();
    }
}

function changeMonth(delta) {
    currentMonth += delta;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    updateMonthLabel();
    if (kpiView === 'month') {
        renderMonthLeaderboard();
        renderMonthKPITable();
    }
}

// Get all tasks that fall within a given month/year based on their entry or close date
function getTasksInMonth(month, year) {
    return allTasks.filter(t => {
        const d = t.entryDate || t.closeDate;
        if (!d) return false;
        try {
            const dt = new Date(d);
            return dt.getMonth() === month && dt.getFullYear() === year;
        } catch { return false; }
    });
}

// Compute aggregate monthly KPI for a designer (role-aware)
function computeMonthlyKPI(designerKey, month, year) {
    const d = DESIGNERS.find(d => d.key === designerKey);
    if (!d) return null;
    const isSenior = d.role === 'senior_designer';

    const monthTasks = allTasks.filter(t => {
        if (!d.match.includes((t.assignee || '').toLowerCase().trim())) return false;
        
        const taskDate = t.entryDate || t.closeDate || t.date;
        if (!taskDate) {
            return getMonthOfWeek(t.weekNum) === month; // Fallback
        }
        const dt = new Date(taskDate);
        return dt.getMonth() === month && dt.getFullYear() === year;
    });

    const weeksInMonth = [1, 2, 3, 4, 5];

    const weeklyBreakdown = weeksInMonth.map(w => {
        const wt = monthTasks.filter(t => t.weekNum === w);
        const weekTasks = wt.filter(t => t.evaluation !== 'pending');
        
        let prSet = new Set();
        let miiro = 0, bm = 0;
        wt.forEach(t => {
            if (t.present === 'Yes' || t.present === 'Half') {
                 const d = t.date || t.entryDate || '';
                 if (d) prSet.add(d.split('T')[0]);
            }
            if (t.miiro === 'Yes') miiro++;
            if (t.bm === 'Yes') bm++;
        });

        let weekScore = null;
        if (isSenior) {
            let sum = 0; let hasData = false;
            weekTasks.forEach(t => {
                const kpi = t.evaluation || {};
                const dl = calcDeadlineScore10(t);
                const s = calcSeniorTaskScore(t.hTarget, kpi.complexity, kpi.quality, kpi.impact, dl != null ? dl*10 : null);
                if (s != null) { sum += s; hasData = true; }
            });
            weekScore = hasData ? sum : null;
        } else {
            const tScores = [];
            weekTasks.forEach(t => {
                const kpi = t.evaluation || {};
                const s = calcDesignerTaskScore(t.hTarget, kpi.quality, kpi.impact);
                if (s != null) tScores.push(s);
            });
            weekScore = tScores.length ? avg(tScores) : null;
        }
        
        // Only show score if the week is completed/closed, or it has actually generated a score
        return { weekNum: w, pr: prSet.size, mi: miiro, bm: bm, score: weekScore };
    });

    // Month-level Stats
    let prSetMonth = new Set();
    let miiroCountMonth = 0;
    let bmCountMonth = 0;
    monthTasks.forEach(t => {
        if (t.present === 'Yes' || t.present === 'Half') {
            const rawDate = t.date || t.entryDate || '';
            if (rawDate) prSetMonth.add(rawDate.split('T')[0]);
        }
        if (t.miiro === 'Yes') miiroCountMonth++;
        if (t.bm === 'Yes') bmCountMonth++;
    });

    const doneTasksMonth = monthTasks.filter(t => t.evaluation !== 'pending');

    const weeklyScores = weeklyBreakdown.map(wb => wb.score).filter(s => s != null);

    if (isSenior) {
        let earnedH = 0;
        doneTasksMonth.forEach(t => {
            const kpi = t.evaluation || {};
            earnedH += (t.hTarget || 0) * (parseFloat(kpi.complexity) || 1);
        });
        const monthScore = weeklyScores.length ? weeklyScores.reduce((a, b) => a + b, 0) : null;

        return {
            designerKey, name: d.name, color: d.color, av: d.av, role: d.role, isSenior: true,
            taskCount: monthTasks.length, doneCount: doneTasksMonth.filter(t => t.statusNorm === 'done').length,
            carryOvers: monthTasks.filter(t => t.carryOver).length,
            completionRate: monthTasks.length ? Math.round(doneTasksMonth.filter(t => t.statusNorm === 'done').length / monthTasks.length * 100) : 0,
            presentCount: prSetMonth.size, miiroCount: miiroCountMonth, bmCount: bmCountMonth,
            hLabel: earnedH.toFixed(1),
            weeklyBreakdown,
            total: monthScore,
            totalLabel: monthScore != null ? `${monthScore.toFixed(1)} <span style="font-size:8px; color:var(--text3); font-weight:normal">/sum</span>` : '—',
        };
    } else {
        const monthScore = weeklyScores.length ? avg(weeklyScores) : null;
        const earnedH = doneTasksMonth.filter(t => t.statusNorm === 'done').reduce((s, t) => s + (t.hTarget || 0), 0);
        
        // Compute month-wide Quality / Attitude averages
        const qualities = doneTasksMonth.map(t => (t.evaluation || {}).quality).filter(v => v != null && v !== 0);
        const attitudes = doneTasksMonth.map(t => (t.evaluation || {}).impact).filter(v => v != null && v !== 0);

        return {
            designerKey, name: d.name, color: d.color, av: d.av, role: d.role, isSenior: false,
            taskCount: monthTasks.length, doneCount: doneTasksMonth.filter(t => t.statusNorm === 'done').length,
            carryOvers: monthTasks.filter(t => t.carryOver).length,
            completionRate: monthTasks.length ? Math.round(doneTasksMonth.filter(t => t.statusNorm === 'done').length / monthTasks.length * 100) : 0,
            presentCount: prSetMonth.size, miiroCount: miiroCountMonth, bmCount: bmCountMonth,
            hLabel: earnedH.toFixed(1),
            qIdx: qualities.length ? avg(qualities) : null,
            aIdx: attitudes.length ? avg(attitudes) : null,
            weeklyBreakdown,
            total: monthScore,
            totalLabel: monthScore != null ? `${monthScore.toFixed(2)} <span style="font-size:8px; color:var(--text3); font-weight:normal">/avg</span>` : '—',
        };
    }
}



function renderMonthLeaderboard() {
    const data = DESIGNERS
        .map(d => computeMonthlyKPI(d.key, currentMonth, currentYear))
        .filter(Boolean)
        .sort((a, b) => (b.total || 0) - (a.total || 0));

    const lbHeader = document.querySelector('.lb-header');
    if (lbHeader) {
        lbHeader.classList.add('month-mode');
        lbHeader.innerHTML = `
            <span>Designer</span>
            <span>W1</span><span>W2</span><span>W3</span><span>W4</span><span>W5</span>
            <span>Total H</span>
            <span>Total KPI</span>
        `;
    }

    const rankCls = ['gold', 'silver', 'bronze', ''];
    document.getElementById('lbRows').innerHTML = data.map((d, i) => {
        const weeklyCells = [0, 1, 2, 3, 4].map(idx => {
            const w = d.weeklyBreakdown[idx];
            if (!w) return `<div class="lb-val mono"></div>`;
            return `
                <div class="lb-val" style="display:flex; justify-content:center;">
                    <div class="lb-week-score mono">${w.score != null ? w.score.toFixed(1) : '—'}</div>
                </div>
            `;
        }).join('');

        return `
            <div class="lb-row month-mode">
              <div class="lb-name">
                <div class="lb-rank ${rankCls[i] || ''}">${i + 1}</div>
                <span>${esc(d.name)}</span>
              </div>
              ${weeklyCells}
              <div class="lb-val mono" style="font-size:11px">${d.hLabel || '0.0'}</div>
              <div class="lb-val mono accent" style="font-weight:800; font-size:14px">${d.totalLabel}</div>
            </div>`;
    }).join('');
}

function renderMonthKPITable() {
    const body = document.getElementById('monthKPIBody');
    if (!body) return;
    const data = DESIGNERS
        .map(d => computeMonthlyKPI(d.key, currentMonth, currentYear))
        .filter(Boolean);

    body.innerHTML = data.map(d => {
        const rateClass = d.completionRate >= 80 ? 'green' : d.completionRate >= 50 ? 'orange' : 'red';
        if (d.isSenior) {
            return `<tr>
                <td data-label="Designer" style="display:flex;align-items:center;gap:7px">
                    <span class="av-dot" style="background:${d.color}">${d.av}</span>${esc(d.name)}
                    <span style="font-size:9px;color:var(--text3)">Senior</span>
                </td>
                <td data-label="Tasks Done" class="mono green">${d.doneCount}</td>
                <td data-label="Carry Overs" class="mono orange">${d.carryOvers}</td>
                <td data-label="Calculation" colspan="4" class="mono" style="text-align:center;color:var(--text3);font-size:11px">SUM of (QTY × QLTY) per task</td>
                <td data-label="Monthly Total" class="mono hi" style="font-weight:800;color:var(--accent)">${d.total != null ? d.total.toFixed(1) : '—'}</td>
                <td data-label="Completion" class="mono ${rateClass}">${d.completionRate}%</td>
            </tr>`;
        } else {
            return `<tr>
                <td data-label="Designer" style="display:flex;align-items:center;gap:7px">
                    <span class="av-dot" style="background:${d.color}">${d.av}</span>${esc(d.name)}
                </td>
                <td data-label="Tasks Done" class="mono green">${d.doneCount}</td>
                <td data-label="Carry Overs" class="mono orange">${d.carryOvers}</td>
                <td data-label="Deadline Index" class="mono">—</td>
                <td data-label="H Score Index" class="mono green">${d.hLabel}</td>
                <td data-label="Quality Index" class="mono">${d.qIdx != null ? d.qIdx.toFixed(1) : '—'}</td>
                <td data-label="Attitude Index" class="mono">${d.aIdx != null ? d.aIdx.toFixed(1) : '—'}</td>
                <td data-label="Monthly Score" class="mono hi" style="font-weight:800;color:var(--accent)">${d.total != null ? d.total.toFixed(3) : '—'}</td>
                <td data-label="Completion" class="mono ${rateClass}">${d.completionRate}%</td>
            </tr>`;
        }
    }).join('');
}

// ── MONTH CLOSE ────────────────────────────────────────────
function confirmMonthClose() {
    const d = new Date(currentYear, currentMonth, 1);
    const monthLabel = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    document.getElementById('monthCloseLabel').textContent = monthLabel;

    const stats = DESIGNERS.map(des => {
        const m = computeMonthlyKPI(des.key, currentMonth, currentYear);
        if (!m) return null;
        const totalDisp = m.total != null ? m.total.toFixed(2) : '—';
        return `<div class="cs-item"><span class="cs-val" style="font-size:12px">${esc(des.name)}</span><span class="cs-label ${m.total ? 'accent' : ''}">${totalDisp}</span></div>`;
    }).filter(Boolean).join('');
    document.getElementById('monthCloseStats').innerHTML = stats;
    document.getElementById('monthCloseOverlay').classList.add('open');
}

function executeMonthClose() {
    document.getElementById('monthCloseOverlay').classList.remove('open');
    const d = new Date(currentYear, currentMonth, 1);
    const monthKey = `${currentYear} -${String(currentMonth + 1).padStart(2, '0')} `;
    const monthLabel = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

    const snapshot = {
        monthKey,
        label: monthLabel,
        savedAt: new Date().toISOString().split('T')[0],
        designers: {},
    };

    DESIGNERS.forEach(des => {
        const m = computeMonthlyKPI(des.key, currentMonth, currentYear);
        if (!m) return;
        snapshot.designers[des.key] = m;

        // Save individual monthly record per designer
        const indKey = `monthly - kpi - ${des.key} `;
        let records = [];
        try { records = JSON.parse(localStorage.getItem(indKey) || '[]'); } catch { }
        // Prevent duplicate close for same month
        if (!records.find(r => r.monthKey === monthKey)) {
            records.unshift({ ...m, monthKey, label: monthLabel, savedAt: snapshot.savedAt });
            localStorage.setItem(indKey, JSON.stringify(records));
        }
    });

    // Save global monthly records
    let monthRecords = [];
    try { monthRecords = JSON.parse(localStorage.getItem('monthlyKPI') || '[]'); } catch { }
    if (!monthRecords.find(r => r.monthKey === monthKey)) {
        monthRecords.unshift(snapshot);
        localStorage.setItem('monthlyKPI', JSON.stringify(monthRecords));
    }

    renderMonthHistory();
    renderMonthLeaderboard();

    // Reset Weeks to 1 for the new month
    localStorage.setItem('cfg-weekNum', 1);
    currentWeekNum = 1;
    currentBoardWeek = 1;
    currentKPIWeek = 1;
    currentSprintWeek = 1;

    // Attempt to set cfg-weekStart to next Monday
    const nextMon = new Date();
    const day = nextMon.getDay();
    const diff = day === 0 ? 1 : 8 - day;
    nextMon.setDate(nextMon.getDate() + diff);
    localStorage.setItem('cfg-weekStart', nextMon.toISOString().split('T')[0]);

    renderAll();
    toast(`Monthly KPI saved for ${monthLabel}.Week reset to 1.`, 'success');
}

// ── MONTHLY HISTORY RENDER ──────────────────────────────────
function renderMonthHistory() {
    let records = [];
    try { records = JSON.parse(localStorage.getItem('monthlyKPI') || '[]'); } catch { }

    let html = '';
    if (records.length === 0) {
        html = '<div style="padding:20px;text-align:center;color:var(--text3);font-size:12px">No monthly records yet. Close a month to start tracking.</div>';
    } else {
        html = records.map(rec => {
        const designersArr = Object.values(rec.designers || {});
        
        const renderGroup = (groupTitle, filteredDesigners) => {
            if (filteredDesigners.length === 0) return '';
            const cards = filteredDesigners.map(d => {
                const scoreClass = d.total >= 7 ? 'good' : d.total >= 4 ? 'medium' : 'poor';
                return `
                <div class="mds-card">
                    <div class="mds-name">
                        <span class="av-dot" style="background:${d.color || 'var(--accent)'};width:18px;height:18px;font-size:8px">${d.av || '?'}</span>
                        ${esc(d.name)}
                    </div>
                    <div class="mds-score ${d.total != null ? scoreClass : ''}">${d.total != null ? d.total.toFixed(2) : '—'}</div>
                    <div class="mds-details">
                        ${d.doneCount}/${d.taskCount} done &nbsp;·&nbsp; ${d.completionRate}%<br>
                        ${d.isSenior ? '' : `Q: ${d.qIdx != null ? d.qIdx.toFixed(1) : '—'} &nbsp; I: ${d.aIdx != null ? d.aIdx.toFixed(1) : '—'}`}
                    </div>
                </div>`;
            }).join('');
            
            return `
                <div class="history-group">
                    <div class="history-group-title">${groupTitle}</div>
                    <div class="monthly-designer-grid">${cards}</div>
                </div>`;
        };

        const seniors = designersArr.filter(d => d.role === 'senior_designer');
        const designers = designersArr.filter(d => d.role !== 'senior_designer');

        return `
            <div class="monthly-record">
                <div class="monthly-record-hdr">
                    <span class="monthly-record-title">${esc(rec.label)}</span>
                    <span class="monthly-record-date">Saved ${esc(rec.savedAt)}</span>
                </div>
                ${renderGroup('Seniors', seniors)}
                ${renderGroup('Designers', designers)}
            </div>`;
    }).join('');
    }

    const el1 = document.getElementById('monthHistoryRows');
    const el2 = document.getElementById('historyMonthlyTimeline');
    if (el1) el1.innerHTML = html;
    if (el2) el2.innerHTML = html;
}

// ── CLEAR HISTORY ────────────────────────────────────────────
function confirmClearHistory() {
    const el = document.getElementById('clearConfirmInput');
    if (el) el.value = '';
    document.getElementById('clearHistoryOverlay').classList.add('open');
}

async function executeClearHistory() {
    const input = document.getElementById('clearConfirmInput').value.trim();
    if (input !== 'CLEAR') {
        toast('Type CLEAR exactly to confirm', 'error');
        return;
    }
    
    try {
        // Clear history in backend
        await apiFetch(`${API_BASE_URL}/history`, { method: 'DELETE' });
        // Also clear logs which are tied to history
        await apiFetch(`${API_BASE_URL}/logs`, { method: 'DELETE' });

        closedWeeks = [];
        localStorage.removeItem('closedWeeks');
        localStorage.removeItem('monthlyKPI');
        DESIGNERS.forEach(d => localStorage.removeItem(`monthly-kpi-${d.key}`));
        
        document.getElementById('clearHistoryOverlay').classList.remove('open');
        renderHistory();
        toast('All history and logs permanently cleared.', 'success');
    } catch (e) {
        toast('Failed to clear backend history: ' + e.message, 'error');
    }
}

function confirmClearTasks() {
    const el = document.getElementById('clearTasksConfirmInput');
    if (el) el.value = '';
    document.getElementById('clearTasksOverlay').classList.add('open');
}

async function executeClearTasks() {
    const input = document.getElementById('clearTasksConfirmInput').value.trim();
    if (input !== 'CLEAR') {
        toast('Type CLEAR exactly to confirm', 'error');
        return;
    }

    try {
        // Clear all tasks in backend
        await apiFetch(`${API_BASE_URL}/tasks`, { method: 'DELETE' });

        allTasks = [];
        localStorage.removeItem('localTasks');
        document.getElementById('clearTasksOverlay').classList.remove('open');
        renderAll();
        toast('All tasks permanently cleared from database.', 'success');
    } catch (e) {
        toast('Failed to clear backend tasks: ' + e.message, 'error');
    }
}

function openResetModal() {
    document.getElementById('resetModalOverlay').classList.add('open');
}

function closeResetModal() {
    document.getElementById('resetModalOverlay').classList.remove('open');
}

function executeResetToWeek1() {
    const mon = getMondayOf(new Date());
    localStorage.setItem('cfg-weekStart', mon.toISOString().split('T')[0]);
    localStorage.setItem('cfg-weekNum', '1');

    // Clear all manual week overrides
    Object.keys(localStorage).forEach(k => {
        if (k.startsWith('cfg-week-')) localStorage.removeItem(k);
    });

    currentWeekNum = 1;
    currentBoardWeek = 1;
    currentKPIWeek = 1;
    currentSprintWeek = 1;

    renderAll();
    switchScreen('works');
    closeResetModal();
    toast('System reset to Week 1 starting ' + formatDate(mon), 'success');
}

function openSprintReview() {
    currentSprintWeek = currentWeekNum;
    renderSprintClose();
}

// ── EXTRA WORK & APPROVALS ────────────────────────────────────

function openExtraLogModal() {
    document.getElementById('extraLogOverlay').classList.add('open');
    document.getElementById('ex-client').value = '';
    document.getElementById('ex-task').value = '';
    document.getElementById('ex-h').value = '';
    
    // Ensure H-score is visible only for admins
    const hGroup = document.getElementById('ex-h-group');
    if (hGroup) {
        hGroup.style.display = (currentUserRole === 'admin') ? 'block' : 'none'; 
    }
}

function closeExtraLogModal() {
    document.getElementById('extraLogOverlay').classList.remove('open');
}

async function submitExtraLog() {
    const client = document.getElementById('ex-client').value.trim();
    const taskContent = document.getElementById('ex-task').value.trim();
    const h = parseFloat(document.getElementById('ex-h').value) || 0;

    if (!taskContent) { toast('Description required', 'error'); return; }

    const dObj = getDesigner(currentWeekDesigner);
    const assigneeName = dObj ? dObj.name : currentWeekDesigner;

    const newTask = {
        client: client || '—',
        task: taskContent,
        assignee: assigneeName, // use full name for database consistency
        status: 'Done',
        statusNorm: 'done',
        weekNum: currentWeekNum,
        needsApproval: true,
        isExtra: true,
        entryDate: new Date().toISOString().split('T')[0],
        closeDate: new Date().toISOString().split('T')[0],
        hTarget: h,
        source: 'api'
    };

    try {
        const res = await apiFetch(`${API_BASE_URL}/tasks`, {
            method: 'POST',
            body: JSON.stringify(newTask)
        });
        if (!res || !res.ok) throw new Error('API capture failed');
        
        toast('Extra work logged. Admin verification pending.', 'success');
        closeExtraLogModal();
        await loadData();
        renderAll();
    } catch (e) {
        console.error('API submission failed, falling back to local:', e);
        // Fallback to local with unique ID and source flag
        newTask.id = `extra-${Date.now()}`;
        newTask.source = 'local';
        allTasks.push(newTask);
        saveLocalTasks();
        closeExtraLogModal();
        renderAll();
        toast('Logged locally (offline)', 'info');
    }
}

function renderKPIApprovals(dKey, week) {
    const sec = document.getElementById('kpiApprovalsSection');
    const list = document.getElementById('approvalList');
    if (!sec || !list) return;

    const pending = allTasks.filter(t =>
        dKey && getDesigner(t.assignee).key === dKey &&
        t.weekNum === week &&
        (t.needsApproval === true || t.evaluation === 'pending')
    );

    if (pending.length === 0) {
        sec.style.display = 'none';
        return;
    }

    sec.style.display = 'block';
    list.innerHTML = pending.map(t => `
            <div class="approval-card" style="background:var(--bg3);border:1px solid var(--orange);padding:12px;border-radius:8px;min-width:240px;flex:1">
            <div style="font-size:10px;color:var(--text3);text-transform:uppercase">${esc(t.client)}</div>
            <div style="font-weight:600;margin:4px 0">${esc(t.task)}</div>
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                <span style="font-size:11px;color:var(--orange)">H Score: </span>
                <input type="number" step="0.5" id="h-approve-${t.id}" value="${t.hTarget || 0}" 
                       style="width:60px; background:var(--bg4); border:1px solid var(--border2); color:white; border-radius:4px; padding:2px 6px; font-size:12px;">
            </div>
            <div style="margin-top:10px;display:flex;gap:6px">
                <button class="btn-sm" style="background:var(--orange);color:white;border:none" onclick="approveTask('${t.id}')">Add to KPI</button>
                <button class="btn-sm" onclick="openTaskModal('${t.id}')">Edit</button>
                <button class="btn-sm" style="color:var(--red);border-color:transparent" onclick="dismissTask('${t.id}')">Dismiss</button>
            </div>
        </div>
            `).join('');
}

async function approveTask(tid) {
    const t = allTasks.find(x => x.id === tid);
    if (!t) return;

    const hInp = document.getElementById(`h-approve-${tid}`);
    const finalH = hInp ? parseFloat(hInp.value) : (t.hTarget || 0);

    try {
        if (t.source === 'local') {
            t.needsApproval = false;
            t.hTarget = finalH;
            saveLocalTasks();
        } else {
            const res = await apiFetch(`${API_BASE_URL}/tasks/${tid}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    needsApproval: false,
                    hTarget: finalH
                })
            });
            if (!res || !res.ok) throw new Error();
        }
        
        toast('Task approved and added to KPI', 'success');
        await loadData();
        renderKPI();
    } catch (e) {
        toast('Approval sync failed', 'error');
    }
}

async function dismissTask(tid) {
    if (!confirm('Are you sure you want to dismiss this log? It will be permanently removed.')) return;
    
    const t = allTasks.find(x => x.id === tid);
    try {
        if (t && t.source === 'local') {
            allTasks = allTasks.filter(x => x.id !== tid);
            saveLocalTasks();
        } else {
            const res = await apiFetch(`${API_BASE_URL}/tasks/${tid}`, {
                method: 'DELETE'
            });
            if (!res || !res.ok) throw new Error();
        }
        
        toast('Task dismissed', 'success');
        await loadData();
        renderKPI();
    } catch (e) {
        toast('Dismiss sync failed', 'error');
    }
}

function toggleSidebar() {
    document.body.classList.toggle('sidebar-open');
}
