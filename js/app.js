/* ================================================================
   ReportIQ – Azentio Digital Banking
   app.js
   ================================================================ */

'use strict';

// ── State ──────────────────────────────────────────────────────────
const state = {
  step: 0,
  intent: null,
  period: null,
  accountType: null,
  format: 'PDF',
  reportGenerated: false,
  currentReportId: null   // tracks whether current report is saved
};

// ── Favourites persistence (localStorage) ─────────────────────────
const FAV_KEY = 'reportiq_favourites';

function loadFavourites() {
  try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; }
  catch { return []; }
}

function saveFavourites(list) {
  localStorage.setItem(FAV_KEY, JSON.stringify(list));
}

function isFavourited(id) {
  return loadFavourites().some(f => f.id === id);
}

function addFavourite(entry) {
  const list = loadFavourites().filter(f => f.id !== entry.id);
  list.unshift(entry);           // newest first
  saveFavourites(list);
  updateFavCount();
}

function removeFavourite(id) {
  saveFavourites(loadFavourites().filter(f => f.id !== id));
  updateFavCount();
}

function updateFavCount() {
  const count = loadFavourites().length;
  const badge = document.getElementById('fav-topbar-count');
  if (!badge) return;
  badge.textContent = count;
  badge.classList.toggle('hidden', count === 0);
}

// ── Type metadata ──────────────────────────────────────────────────
const TYPE_META = {
  'account statement':  { icon: 'ti-file-text',  cls: 'statement',   label: 'Account Statement' },
  'transaction summary':{ icon: 'ti-list',        cls: 'transaction', label: 'Transaction Summary' },
  'balance report':     { icon: 'ti-wallet',      cls: 'balance',     label: 'Balance Report' },
  'spending analysis':  { icon: 'ti-chart-pie',   cls: 'spending',    label: 'Spending Analysis' },
};

// ── Conversation flows ─────────────────────────────────────────────
const FLOWS = {
  'account statement': [
    {
      text: 'I can generate an account statement for you. What time period would you like to cover?',
      chips: { label: 'Select period', options: ['Last month', 'Last 3 months', 'Last 6 months', 'Custom range'], key: 'period' }
    },
    {
      text: 'Which account should this statement cover?',
      chips: { label: 'Account type', options: ['Savings account', 'Current account', 'Credit card'], key: 'accountType' }
    },
    {
      text: 'Almost ready! What format would you like the report in?',
      chips: { label: 'Output format', options: ['PDF', 'Excel', 'Both'], key: 'format' },
      nextPrompts: ['Include only debits', 'Add balance chart', 'Filter by category']
    }
  ],
  'transaction summary': [
    {
      text: "I'll create a transaction summary for you. Which period should it cover?",
      chips: { label: 'Select period', options: ['This week', 'Last month', 'Last 3 months', 'Custom range'], key: 'period' }
    },
    {
      text: 'Which account would you like summarised?',
      chips: { label: 'Account type', options: ['All accounts', 'Savings account', 'Current account', 'Credit card'], key: 'accountType' }
    },
    {
      text: 'Great! Select your preferred output format.',
      chips: { label: 'Output format', options: ['PDF', 'Excel', 'Both'], key: 'format' },
      nextPrompts: ['Group by category', 'Show top 10 merchants', 'Add pie chart']
    }
  ],
  'balance report': [
    {
      text: "I'll prepare a balance report. Select the time period.",
      chips: { label: 'Select period', options: ['Current', 'End of last month', 'Last quarter', 'Year to date'], key: 'period' }
    },
    {
      text: 'Which accounts should be included?',
      chips: { label: 'Account scope', options: ['All accounts', 'Savings only', 'Current only', 'Investments'], key: 'accountType' }
    },
    {
      text: 'Choose the output format for your balance report.',
      chips: { label: 'Output format', options: ['PDF', 'Excel', 'Both'], key: 'format' },
      nextPrompts: ['Compare with last year', 'Add trend line', 'Include sub-accounts']
    }
  ],
  'spending analysis': [
    {
      text: 'Great choice! Spending analysis helps you understand your patterns. What period should this cover?',
      chips: { label: 'Select period', options: ['Last month', 'Last 3 months', 'Last 6 months', 'This year'], key: 'period' }
    },
    {
      text: 'Which account should we analyse?',
      chips: { label: 'Account type', options: ['All accounts', 'Savings account', 'Current account', 'Credit card'], key: 'accountType' }
    },
    {
      text: 'How would you like the analysis presented?',
      chips: { label: 'Output format', options: ['PDF', 'Excel', 'Both'], key: 'format' },
      nextPrompts: ['Compare with previous period', 'Show merchant breakdown', 'Highlight anomalies']
    }
  ]
};

const INTENT_MAP = {
  'statement': 'account statement',
  'account statement': 'account statement',
  'account': 'account statement',
  'transactions': 'transaction summary',
  'transaction': 'transaction summary',
  'transaction summary': 'transaction summary',
  'balance': 'balance report',
  'balance report': 'balance report',
  'spending': 'spending analysis',
  'spending analysis': 'spending analysis',
  'last month transactions': 'account statement',
  'last 3 months': 'account statement',
  'show me last 3 months account statement': 'account statement',
  'transaction summary for january 2026': 'transaction summary',
  'credit card spending analysis': 'spending analysis'
};

// ── DOM helpers ────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const show = id => $(id).classList.remove('hidden');
const hide = id => $(id).classList.add('hidden');

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 80) + 'px';
}

function scrollChat() {
  const el = $('chat-messages');
  setTimeout(() => { el.scrollTop = el.scrollHeight; }, 50);
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function capitalise(s) {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

// ── Bubble rendering ───────────────────────────────────────────────
function appendBubble(role, html, extra = '') {
  hide('chat-empty');
  show('chat-messages');
  show('chat-badge');

  const wrap = document.createElement('div');
  wrap.className = `chat-bubble bubble-${role}`;
  wrap.innerHTML = `
    <span class="bubble-label">${role === 'ai' ? 'ReportIQ' : 'You'}</span>
    <div class="bubble-content">${html}</div>
    ${extra}
  `;
  $('chat-messages').appendChild(wrap);
  scrollChat();
  return wrap;
}

function appendThinking() {
  const wrap = document.createElement('div');
  wrap.className = 'chat-bubble bubble-ai';
  wrap.id = 'thinking';
  wrap.innerHTML = `
    <span class="bubble-label">ReportIQ</span>
    <div class="bubble-content">
      <div class="thinking-dots">
        <div class="dot"></div><div class="dot"></div><div class="dot"></div>
      </div>
    </div>`;
  $('chat-messages').appendChild(wrap);
  scrollChat();
}

function removeThinking() {
  const el = $('thinking');
  if (el) el.remove();
}

// ── Chip selection ─────────────────────────────────────────────────
function selectChip(el, key, value, bubbleId) {
  document.querySelectorAll(`[data-group="${bubbleId}"]`).forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  state[key] = value;

  setTimeout(() => {
    document.querySelectorAll(`[data-group="${bubbleId}"]`).forEach(c => {
      c.onclick = null;
      c.style.cursor = 'default';
      c.style.opacity = '0.65';
    });
    advanceFlow();
  }, 180);
}

// ── Input handlers ─────────────────────────────────────────────────
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

function sendMessage() {
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  input.style.height = 'auto';
  processInput(text);
}

function quickStart(text) {
  hide('chat-empty');
  show('chat-messages');
  processInput(text);
}

function processInput(text) {
  appendBubble('user', escHtml(text));
  const norm = text.toLowerCase().trim();
  const intent = INTENT_MAP[norm] || detectIntent(norm);

  if (!state.intent && intent) {
    state.intent = intent;
    state.step = 0;
    setTimeout(runStep, 500);
  } else if (state.reportGenerated) {
    handleRefinement(text);
  } else if (state.intent && state.step <= (FLOWS[state.intent]?.length || 0)) {
    setTimeout(runStep, 400);
  } else {
    setTimeout(() => {
      appendBubble('ai', 'Could you clarify — are you looking for an <strong>account statement</strong>, <strong>transaction summary</strong>, <strong>balance report</strong>, or <strong>spending analysis</strong>?');
    }, 400);
  }
}

function detectIntent(t) {
  if (t.includes('statement') || t.includes('account')) return 'account statement';
  if (t.includes('transaction'))                         return 'transaction summary';
  if (t.includes('balance'))                             return 'balance report';
  if (t.includes('spend') || t.includes('analysis'))    return 'spending analysis';
  return null;
}

// ── Flow steps ─────────────────────────────────────────────────────
function runStep() {
  const flow = FLOWS[state.intent];
  if (!flow || state.step >= flow.length) return;

  const stepData = flow[state.step];
  appendThinking();

  setTimeout(() => {
    removeThinking();
    const bid = 'chips-' + Date.now();
    let extra = '';

    if (stepData.chips) {
      const chipHtml = stepData.chips.options.map(opt =>
        `<span class="chip" data-group="${bid}" onclick="selectChip(this,'${stepData.chips.key}','${opt}','${bid}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter')selectChip(this,'${stepData.chips.key}','${opt}','${bid}')">${opt}</span>`
      ).join('');
      extra += `<div class="suggestion-chips">
        <div class="chip-group-label">${stepData.chips.label}</div>
        <div class="chips">${chipHtml}</div>
      </div>`;
    }

    if (stepData.nextPrompts) {
      const btns = stepData.nextPrompts.map(p =>
        `<button class="next-prompt-btn" onclick="appendBubble('user','${p}');handleRefinement('${p}')">
          <i class="ti ti-corner-down-right" aria-hidden="true" style="font-size:11px"></i>${p}
        </button>`
      ).join('');
      extra += `<div class="next-prompt-suggestions" style="margin-top:8px">
        <div class="chip-group-label">Suggestions</div>${btns}
      </div>`;
    }

    appendBubble('ai', stepData.text, extra);
    state.step++;

    if (state.step >= flow.length) {
      setTimeout(triggerGeneration, 600);
    }
  }, 700);
}

function advanceFlow() {
  const flow = FLOWS[state.intent];
  if (flow && state.step < flow.length) runStep();
}

function triggerGeneration() {
  appendThinking();

  setTimeout(() => {
    removeThinking();
    const period  = state.period      || 'Last 3 months';
    const account = state.accountType || 'Savings account';
    const pLabel  = periodLabel(period);

    appendBubble('ai',
      `✓ Your <strong>${state.intent}</strong> is ready — <strong>${account}</strong>, <strong>${pLabel}</strong>. Download, share, or schedule it from the actions panel.`
    );
    state.reportGenerated = true;
    renderReport(pLabel, account);
    renderActions(pLabel, account);
  }, 1400);
}

function handleRefinement(text) {
  appendThinking();
  setTimeout(() => {
    removeThinking();
    appendBubble('ai', `Got it — I've updated the report to reflect <em>${escHtml(text.toLowerCase())}</em>. The canvas has been refreshed.`);
  }, 900);
}

function periodLabel(p) {
  const map = {
    'Last month':      'Jan 2026',
    'Last 3 months':   'Jan – Mar 2026',
    'Last 6 months':   'Oct 2025 – Mar 2026',
    'This year':       'Jan – Mar 2026',
    'This week':       'Week of 26 May 2026',
    'Current':         'As of May 2026',
    'End of last month':'Apr 2026',
    'Last quarter':    'Jan – Mar 2026',
    'Year to date':    'Jan – May 2026'
  };
  return map[p] || p;
}

// ── Report rendering ───────────────────────────────────────────────
function renderReport(pLabel, account) {
  show('report-badge');
  hide('canvas-empty');
  show('report-output');

  // Assign a stable ID for this report instance
  state.currentReportId = `${state.intent}|${account}|${pLabel}`;
  const alreadySaved = isFavourited(state.currentReportId);

  const tx      = generateTransactions();
  const credits = tx.filter(t => t.type === 'CR').reduce((s, t) => s + t.amount, 0);
  const debits  = tx.filter(t => t.type === 'DR').reduce((s, t) => s + t.amount, 0);
  const open    = 48250.00;
  const close   = open + credits - debits;
  const fmt     = n => n.toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const rows = tx.map(t => `
    <tr>
      <td class="tx-date">${t.date}</td>
      <td><div class="tx-desc">${t.desc}</div><div class="tx-ref">${t.ref}</div></td>
      <td><span class="tx-category ${t.catClass}">${t.category}</span></td>
      <td class="${t.type === 'CR' ? 'tx-amount-credit' : 'tx-amount-debit'}">
        ${t.type === 'CR' ? '+' : '−'} ₹${fmt(t.amount)}
      </td>
    </tr>`).join('');

  $('report-output').innerHTML = `
    <div class="report-header">
      <div class="report-header-top">
        <div>
          <div class="report-title">${capitalise(state.intent || 'Account Statement')}</div>
          <div class="report-subtitle">${account} · ${pLabel} · Account No. XXXX-4521</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <button class="fav-heart-btn${alreadySaved ? ' saved' : ''}" id="report-fav-btn"
            onclick="toggleFavourite()"
            aria-label="${alreadySaved ? 'Remove from favourites' : 'Add to favourites'}"
            aria-pressed="${alreadySaved}">
            <i class="ti ti-heart" aria-hidden="true"></i>
            <i class="ti ti-heart-filled" aria-hidden="true"></i>
            <span>${alreadySaved ? 'Saved' : 'Save'}</span>
          </button>
          <div class="report-status-badge"><div class="status-dot"></div>Verified</div>
        </div>
      </div>
      <div class="summary-grid">
        <div class="summary-card accent">
          <div class="summary-label">Opening balance</div>
          <div class="summary-value">₹${fmt(open)}</div>
        </div>
        <div class="summary-card positive">
          <div class="summary-label">Total credits</div>
          <div class="summary-value positive">+₹${fmt(credits)}</div>
        </div>
        <div class="summary-card negative">
          <div class="summary-label">Total debits</div>
          <div class="summary-value negative">−₹${fmt(debits)}</div>
        </div>
        <div class="summary-card accent">
          <div class="summary-label">Closing balance</div>
          <div class="summary-value">₹${fmt(close)}</div>
        </div>
      </div>
    </div>

    <div>
      <div class="section-label">Transactions (${tx.length})</div>
      <div class="transactions-table-wrap">
        <table class="tx-table" aria-label="Transaction details">
          <thead>
            <tr>
              <th scope="col" style="width:90px">Date</th>
              <th scope="col">Description</th>
              <th scope="col" style="width:110px">Category</th>
              <th scope="col" style="width:120px">Amount</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>

    <div class="insight-bar" role="note" aria-label="AI insight">
      <i class="ti ti-bulb insight-icon" aria-hidden="true"></i>
      <div class="insight-text">
        Your top spending category this period was <strong>Shopping</strong>
        (₹${Math.round(debits * 0.28).toLocaleString('en-IN')}), followed by
        <strong>Utilities</strong> and <strong>Food &amp; Dining</strong>.
        Credits were primarily from salary and transfers.
      </div>
    </div>`;

  $('canvas-scroll').scrollTop = 0;
}

function generateTransactions() {
  return [
    { date:'03 Mar 2026', desc:'Salary Credit – March',       ref:'NEFT/2026030301',   category:'Salary',       catClass:'cat-salary',    type:'CR', amount:85000 },
    { date:'05 Mar 2026', desc:'Electricity Bill – MSEB',     ref:'BBPS/20260305',     category:'Utilities',    catClass:'cat-utilities', type:'DR', amount:3420  },
    { date:'07 Mar 2026', desc:'Zomato Order',                ref:'UPI/ZOM20260307',   category:'Food & Dining',catClass:'cat-food',      type:'DR', amount:840   },
    { date:'10 Mar 2026', desc:'Amazon Purchase',             ref:'UPI/AMZ20260310',   category:'Shopping',     catClass:'cat-shopping',  type:'DR', amount:4299  },
    { date:'12 Mar 2026', desc:'Transfer from Rahul Shah',    ref:'IMPS/20260312AB',   category:'Transfer',     catClass:'cat-transfer',  type:'CR', amount:12000 },
    { date:'15 Mar 2026', desc:'IndiGo Airlines – BOM-DEL',   ref:'UPI/IND20260315',   category:'Travel',       catClass:'cat-travel',    type:'DR', amount:5640  },
    { date:'17 Mar 2026', desc:'Reliance Digital',            ref:'UPI/RD20260317',    category:'Shopping',     catClass:'cat-shopping',  type:'DR', amount:18500 },
    { date:'19 Mar 2026', desc:'Apollo Pharmacy',             ref:'UPI/APL20260319',   category:'Health',       catClass:'cat-health',    type:'DR', amount:1220  },
    { date:'21 Mar 2026', desc:'Broadband – Jio Fiber',       ref:'NACH/JIO20260321',  category:'Utilities',    catClass:'cat-utilities', type:'DR', amount:1499  },
    { date:'25 Mar 2026', desc:'Dividend Credit – HDFC MF',   ref:'NEFT/DIV20260325',  category:'Transfer',     catClass:'cat-transfer',  type:'CR', amount:3840  },
    { date:'27 Mar 2026', desc:'Swiggy Order',                ref:'UPI/SWG20260327',   category:'Food & Dining',catClass:'cat-food',      type:'DR', amount:620   },
    { date:'30 Mar 2026', desc:'ATM Withdrawal',              ref:'ATM/20260330XX',    category:'Others',       catClass:'cat-others',    type:'DR', amount:5000  },
  ];
}

// ── Actions panel rendering ────────────────────────────────────────
function renderActions(pLabel, account) {
  hide('right-empty');
  show('actions-panel');

  const now = new Date();
  const gen = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
            + ', ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  $('actions-panel').innerHTML = `
    <div>
      <div class="action-section-label">Download</div>
      <div class="action-btn-wrap">
        <button class="action-btn" onclick="toggleDownloadDropdown(event)" aria-haspopup="true" aria-expanded="false" id="btn-download">
          <div class="action-btn-icon dark"><i class="ti ti-download" aria-hidden="true"></i></div>
          <div class="action-btn-text">
            <div class="action-btn-title">Download report</div>
            <div class="action-btn-sub">${pLabel} · choose format →</div>
          </div>
          <i class="ti ti-chevron-right action-chevron" aria-hidden="true"></i>
        </button>
        <div class="download-dropdown hidden" id="download-dropdown" role="menu" aria-label="Choose download format">
          <div class="dropdown-label">Choose format</div>
          <button class="dropdown-item" role="menuitem" onclick="downloadAs('PDF')">
            <div class="dropdown-item-icon pdf"><i class="ti ti-file-type-pdf" aria-hidden="true"></i></div>
            <div>
              <div>PDF document</div>
              <div class="dropdown-item-sub">Best for sharing & printing</div>
            </div>
          </button>
          <button class="dropdown-item" role="menuitem" onclick="downloadAs('Excel')">
            <div class="dropdown-item-icon xlsx"><i class="ti ti-file-type-xls" aria-hidden="true"></i></div>
            <div>
              <div>Excel spreadsheet</div>
              <div class="dropdown-item-sub">Best for analysis & editing</div>
            </div>
          </button>
        </div>
      </div>
    </div>

    <div>
      <div class="action-section-label">Share</div>
      <button class="action-btn" onclick="triggerAction('Email')">
        <div class="action-btn-icon green"><i class="ti ti-mail" aria-hidden="true"></i></div>
        <div class="action-btn-text">
          <div class="action-btn-title">Send via email</div>
          <div class="action-btn-sub">Deliver to registered email</div>
        </div>
        <i class="ti ti-chevron-right action-chevron" aria-hidden="true"></i>
      </button>
      <button class="action-btn" onclick="triggerAction('Secure link')">
        <div class="action-btn-icon blue"><i class="ti ti-link" aria-hidden="true"></i></div>
        <div class="action-btn-text">
          <div class="action-btn-title">Copy secure link</div>
          <div class="action-btn-sub">Expires in 7 days</div>
        </div>
        <i class="ti ti-chevron-right action-chevron" aria-hidden="true"></i>
      </button>
    </div>

    <div>
      <div class="action-section-label">Automate</div>
      <button class="action-btn" onclick="triggerAction('Schedule')">
        <div class="action-btn-icon amber"><i class="ti ti-calendar-repeat" aria-hidden="true"></i></div>
        <div class="action-btn-text">
          <div class="action-btn-title">Schedule monthly</div>
          <div class="action-btn-sub">Auto-generate on 1st of month</div>
        </div>
        <i class="ti ti-chevron-right action-chevron" aria-hidden="true"></i>
      </button>
      <button class="action-btn" id="panel-fav-btn" onclick="toggleFavourite()">
        <div class="action-btn-icon red" id="panel-fav-icon"><i class="ti ti-heart" aria-hidden="true"></i></div>
        <div class="action-btn-text">
          <div class="action-btn-title" id="panel-fav-title">Add to favourites</div>
          <div class="action-btn-sub" id="panel-fav-sub">Quick access from home</div>
        </div>
        <i class="ti ti-chevron-right action-chevron" aria-hidden="true"></i>
      </button>
    </div>

    <div>
      <div class="action-section-label">Audit info</div>
      <div class="meta-card" role="region" aria-label="Report audit information">
        <div class="meta-row"><span class="meta-key">Generated on</span><span class="meta-val">${gen}</span></div>
        <div class="meta-row"><span class="meta-key">Data source</span><span class="meta-val">Core Banking · CBS</span></div>
        <div class="meta-row"><span class="meta-key">Account</span><span class="meta-val">${account}</span></div>
        <div class="meta-row"><span class="meta-key">Period</span><span class="meta-val">${pLabel}</span></div>
        <div class="meta-row"><span class="meta-key">Integrity</span><span class="meta-badge">Verified</span></div>
      </div>
    </div>

    <div>
      <div class="action-section-label">Refine report</div>
      <button class="action-btn" onclick="refinePrompt('Filter only debit transactions')">
        <div class="action-btn-icon green"><i class="ti ti-filter" aria-hidden="true"></i></div>
        <div class="action-btn-text">
          <div class="action-btn-title">Filter transactions</div>
          <div class="action-btn-sub">Debits, credits, or by category</div>
        </div>
        <i class="ti ti-chevron-right action-chevron" aria-hidden="true"></i>
      </button>
      <button class="action-btn" onclick="refinePrompt('Add a spending summary chart')">
        <div class="action-btn-icon blue"><i class="ti ti-chart-bar" aria-hidden="true"></i></div>
        <div class="action-btn-text">
          <div class="action-btn-title">Add visual chart</div>
          <div class="action-btn-sub">Bar, pie, or line chart</div>
        </div>
        <i class="ti ti-chevron-right action-chevron" aria-hidden="true"></i>
      </button>
    </div>`;
}

// ── Action callbacks ───────────────────────────────────────────────
function toggleDownloadDropdown(e) {
  e.stopPropagation();
  const dd  = document.getElementById('download-dropdown');
  const btn = document.getElementById('btn-download');
  const open = !dd.classList.contains('hidden');
  dd.classList.toggle('hidden', open);
  btn.setAttribute('aria-expanded', String(!open));
}

function downloadAs(fmt) {
  state.format = fmt;
  const dd  = document.getElementById('download-dropdown');
  const btn = document.getElementById('btn-download');
  if (dd)  dd.classList.add('hidden');
  if (btn) btn.setAttribute('aria-expanded', 'false');
  showToast(`⬇ Downloading ${fmt} report…`);
}

// Close dropdown when clicking outside
document.addEventListener('click', () => {
  const dd  = document.getElementById('download-dropdown');
  const btn = document.getElementById('btn-download');
  if (dd && !dd.classList.contains('hidden')) {
    dd.classList.add('hidden');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
});

function triggerAction(action) {
  const messages = {
    Email:         '✉ Report sent to your registered email.',
    'Secure link': '🔗 Secure link copied to clipboard.',
    Schedule:      '📅 Monthly schedule set for the 1st of each month.'
  };
  if (messages[action]) showToast(messages[action]);
}

// Initialise count badge on load
document.addEventListener('DOMContentLoaded', updateFavCount);

function refinePrompt(text) {
  const input = $('chat-input');
  input.value = text;
  autoResize(input);
  input.focus();
}

function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, 2500);
}

// ── System templates ───────────────────────────────────────────────
const TEMPLATES = [
  {
    id: 'tmpl-monthly-stmt',
    name: 'Monthly Account Statement',
    desc: 'Full transaction listing for the previous calendar month — ideal for reconciliation and record keeping.',
    intent: 'account statement',
    period: 'Last month',
    accountType: 'Savings account',
    format: 'PDF',
    category: 'statement',
    badge: 'popular',
    badgeLabel: 'Popular'
  },
  {
    id: 'tmpl-quarterly-stmt',
    name: 'Quarterly Statement',
    desc: 'Three-month account activity overview — used for quarterly reviews and audit submissions.',
    intent: 'account statement',
    period: 'Last 3 months',
    accountType: 'Savings account',
    format: 'PDF',
    category: 'statement',
    badge: null
  },
  {
    id: 'tmpl-cc-stmt',
    name: 'Credit Card Statement',
    desc: 'Complete credit card transaction history for the last month with outstanding balance summary.',
    intent: 'account statement',
    period: 'Last month',
    accountType: 'Credit card',
    format: 'PDF',
    category: 'statement',
    badge: null
  },
  {
    id: 'tmpl-weekly-tx',
    name: 'Weekly Transaction Review',
    desc: 'Quick snapshot of all transactions in the past 7 days across your current account.',
    intent: 'transaction summary',
    period: 'This week',
    accountType: 'Current account',
    format: 'Excel',
    category: 'transaction',
    badge: 'new',
    badgeLabel: 'New'
  },
  {
    id: 'tmpl-monthly-tx',
    name: 'Monthly Transaction Summary',
    desc: 'Itemised breakdown of all credits and debits last month, grouped by category.',
    intent: 'transaction summary',
    period: 'Last month',
    accountType: 'All accounts',
    format: 'Excel',
    category: 'transaction',
    badge: 'popular',
    badgeLabel: 'Popular'
  },
  {
    id: 'tmpl-balance-current',
    name: 'Current Balance Snapshot',
    desc: 'Instant view of live balances across all your accounts as of today.',
    intent: 'balance report',
    period: 'Current',
    accountType: 'All accounts',
    format: 'PDF',
    category: 'balance',
    badge: null
  },
  {
    id: 'tmpl-balance-ytd',
    name: 'Year-to-Date Balance Report',
    desc: 'Balance trajectory from January through the current month — useful for annual planning.',
    intent: 'balance report',
    period: 'Year to date',
    accountType: 'All accounts',
    format: 'Excel',
    category: 'balance',
    badge: null
  },
  {
    id: 'tmpl-spending-monthly',
    name: 'Monthly Spending Analysis',
    desc: 'Category-wise breakdown of where your money went last month with trend indicators.',
    intent: 'spending analysis',
    period: 'Last month',
    accountType: 'All accounts',
    format: 'PDF',
    category: 'spending',
    badge: 'popular',
    badgeLabel: 'Popular'
  },
  {
    id: 'tmpl-spending-cc',
    name: 'Credit Card Spend Analysis',
    desc: 'Deep dive into credit card spending patterns — merchant categories, top spends, and cashback-eligible transactions.',
    intent: 'spending analysis',
    period: 'Last 3 months',
    accountType: 'Credit card',
    format: 'PDF',
    category: 'spending',
    badge: null
  },
  {
    id: 'tmpl-tax-6m',
    name: 'Tax Preparation Summary',
    desc: 'Six-month income and deduction summary formatted for filing with your CA or tax advisor.',
    intent: 'transaction summary',
    period: 'Last 6 months',
    accountType: 'All accounts',
    format: 'Excel',
    category: 'tax',
    badge: 'tax',
    badgeLabel: 'Tax & Audit'
  },
  {
    id: 'tmpl-tax-interest',
    name: 'Interest & Dividend Report',
    desc: 'Consolidated view of all interest credits and dividends — required for Schedule OS in ITR filing.',
    intent: 'account statement',
    period: 'Last 6 months',
    accountType: 'Savings account',
    format: 'PDF',
    category: 'tax',
    badge: 'tax',
    badgeLabel: 'Tax & Audit'
  },
  {
    id: 'tmpl-salary-proof',
    name: 'Salary Credit Verification',
    desc: 'Statement filtered to salary credits — commonly required for loan applications and visa processing.',
    intent: 'account statement',
    period: 'Last 3 months',
    accountType: 'Savings account',
    format: 'PDF',
    category: 'statement',
    badge: null
  }
];

// ── Templates overlay ──────────────────────────────────────────────
let tmplFilterActive = 'all';

function openTemplates() {
  tmplFilterActive = 'all';
  document.querySelectorAll('#tmpl-overlay .fav-filter-chip').forEach((c, i) => {
    c.classList.toggle('active', i === 0);
  });
  document.getElementById('tmpl-search').value = '';
  renderTmplGrid(TEMPLATES);
  show('tmpl-overlay');
  document.getElementById('tmpl-search').focus();
  document.addEventListener('keydown', onTmplKeydown);
}

function closeTemplates() {
  hide('tmpl-overlay');
  document.removeEventListener('keydown', onTmplKeydown);
}

function onTmplKeydown(e) {
  if (e.key === 'Escape') closeTemplates();
}

document.getElementById('tmpl-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeTemplates();
});

function setTmplFilter(cat, btn) {
  tmplFilterActive = cat;
  document.querySelectorAll('#tmpl-overlay .fav-filter-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  filterTemplates(document.getElementById('tmpl-search').value);
}

function filterTemplates(query) {
  let list = TEMPLATES;
  if (tmplFilterActive !== 'all') list = list.filter(t => t.category === tmplFilterActive);
  if (query.trim()) {
    const q = query.toLowerCase();
    list = list.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.desc.toLowerCase().includes(q) ||
      t.accountType.toLowerCase().includes(q)
    );
  }
  renderTmplGrid(list);
}

function renderTmplGrid(list) {
  const grid  = document.getElementById('tmpl-grid');
  const empty = document.getElementById('tmpl-empty');

  if (!list.length) {
    grid.innerHTML = '';
    grid.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  grid.classList.remove('hidden');
  empty.classList.add('hidden');

  const meta = TYPE_META;
  grid.innerHTML = list.map(t => {
    const m = meta[t.intent] || meta['account statement'];
    const badgeHtml = t.badge
      ? `<span class="tmpl-badge ${t.badge}">${t.badgeLabel}</span>` : '';
    const formatIcon = t.format === 'Excel'
      ? '<i class="ti ti-file-type-xls" aria-hidden="true"></i>'
      : '<i class="ti ti-file-type-pdf" aria-hidden="true"></i>';

    return `
      <article class="fav-card" aria-label="${t.name}">
        <div class="fav-card-top">
          <div class="fav-card-type-icon ${m.cls}">
            <i class="ti ${m.icon}" aria-hidden="true"></i>
          </div>
          <div class="fav-card-info">
            <div class="fav-card-name">${t.name}</div>
            <div class="fav-card-meta">${t.accountType}</div>
          </div>
          ${badgeHtml}
        </div>
        <p class="tmpl-card-desc">${t.desc}</p>
        <div class="tmpl-tags">
          <span class="fav-card-tag period">${t.period}</span>
          <span class="fav-card-tag" style="display:flex;align-items:center;gap:4px">${formatIcon} ${t.format}</span>
        </div>
        <div class="fav-card-footer" style="border-top:1px solid var(--color-border);padding-top:10px">
          <button class="tmpl-use-btn" onclick="applyTemplate('${t.id}')">
            <i class="ti ti-player-play" aria-hidden="true"></i> Use this template
          </button>
        </div>
      </article>`;
  }).join('');
}

function applyTemplate(id) {
  const tmpl = TEMPLATES.find(t => t.id === id);
  if (!tmpl) return;

  closeTemplates();

  // Reset and pre-fill state
  Object.assign(state, {
    step: 0,
    intent: tmpl.intent,
    period: tmpl.period,
    accountType: tmpl.accountType,
    format: tmpl.format,
    reportGenerated: false,
    currentReportId: null
  });

  // Reset UI
  document.getElementById('chat-messages').innerHTML = '';
  hide('report-output'); show('canvas-empty'); hide('report-badge');
  document.getElementById('actions-panel').innerHTML = '';
  hide('actions-panel'); show('right-empty');

  // Start conversation with template confirmation
  hide('chat-empty');
  show('chat-messages');
  show('chat-badge');

  const meta   = TYPE_META[tmpl.intent] || TYPE_META['account statement'];
  const pLabel = periodLabel(tmpl.period);

  appendBubble('user', `Use template: <strong>${tmpl.name}</strong>`);

  setTimeout(() => {
    appendThinking();
    setTimeout(() => {
      removeThinking();
      appendBubble('ai',
        `Got it — applying <strong>${tmpl.name}</strong>.<br>
         <span style="font-size:11.5px;color:var(--color-text-secondary)">
           ${tmpl.accountType} · ${pLabel} · ${tmpl.format}
         </span>`
      );
      setTimeout(() => {
        state.reportGenerated = true;
        const account = tmpl.accountType;
        renderReport(pLabel, account);
        renderActions(pLabel, account);
        appendBubble('ai',
          `✓ Your <strong>${meta.label}</strong> is ready. You can refine it, download, or save it to favourites.`
        );
      }, 600);
    }, 900);
  }, 300);
}

// ── Favourite toggle ───────────────────────────────────────────────
function toggleFavourite() {
  if (!state.currentReportId) return;

  const id      = state.currentReportId;
  const saving  = !isFavourited(id);
  const meta    = TYPE_META[state.intent] || TYPE_META['account statement'];
  const pLabel  = periodLabel(state.period || 'Last 3 months');
  const account = state.accountType || 'Savings account';

  if (saving) {
    addFavourite({
      id,
      intent:  state.intent,
      account,
      period:  pLabel,
      savedOn: new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }),
      savedTs: Date.now()
    });
    showToast('❤ Saved to favourites');
  } else {
    removeFavourite(id);
    showToast('Removed from favourites');
  }

  // Update report-header heart button
  const heartBtn = document.getElementById('report-fav-btn');
  if (heartBtn) {
    heartBtn.classList.toggle('saved', saving);
    heartBtn.setAttribute('aria-pressed', String(saving));
    heartBtn.setAttribute('aria-label', saving ? 'Remove from favourites' : 'Add to favourites');
    heartBtn.querySelector('span').textContent = saving ? 'Saved' : 'Save';
  }

  // Update right-panel button
  const panelIcon  = document.getElementById('panel-fav-icon');
  const panelTitle = document.getElementById('panel-fav-title');
  const panelSub   = document.getElementById('panel-fav-sub');
  if (panelIcon) {
    panelIcon.innerHTML = saving
      ? '<i class="ti ti-heart-filled" aria-hidden="true" style="color:#E11D48"></i>'
      : '<i class="ti ti-heart" aria-hidden="true"></i>';
  }
  if (panelTitle) panelTitle.textContent = saving ? 'Saved to favourites' : 'Add to favourites';
  if (panelSub)   panelSub.textContent   = saving ? 'View in Favourites page' : 'Quick access from home';
}

// ── Favourites overlay ─────────────────────────────────────────────
let favFilterActive = 'all';

function openFavourites() {
  favFilterActive = 'all';
  // reset filter chips
  document.querySelectorAll('.fav-filter-chip').forEach((c, i) => {
    c.classList.toggle('active', i === 0);
  });
  document.getElementById('fav-search').value = '';
  renderFavGrid(loadFavourites());
  show('fav-overlay');
  document.getElementById('fav-search').focus();
  document.addEventListener('keydown', onFavKeydown);
}

function closeFavourites() {
  hide('fav-overlay');
  document.removeEventListener('keydown', onFavKeydown);
}

function onFavKeydown(e) {
  if (e.key === 'Escape') closeFavourites();
}

// Click outside fav-page closes overlay
document.getElementById('fav-overlay').addEventListener('click', function(e) {
  if (e.target === this) closeFavourites();
});

function setFavFilter(type, btn) {
  favFilterActive = type;
  document.querySelectorAll('.fav-filter-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  const query = document.getElementById('fav-search').value;
  filterFavourites(query);
}

function filterFavourites(query) {
  let list = loadFavourites();
  if (favFilterActive !== 'all') list = list.filter(f => f.intent === favFilterActive);
  if (query.trim()) {
    const q = query.toLowerCase();
    list = list.filter(f =>
      f.intent.includes(q) || f.account.toLowerCase().includes(q) || f.period.toLowerCase().includes(q)
    );
  }
  renderFavGrid(list);
}

function renderFavGrid(list) {
  const grid  = document.getElementById('fav-grid');
  const empty = document.getElementById('fav-empty');

  if (!list.length) {
    grid.innerHTML = '';
    grid.classList.add('hidden');
    empty.classList.remove('hidden');
    return;
  }
  grid.classList.remove('hidden');
  empty.classList.add('hidden');

  grid.innerHTML = list.map(f => {
    const meta = TYPE_META[f.intent] || TYPE_META['account statement'];
    return `
      <article class="fav-card" aria-label="${meta.label} – ${f.account}">
        <div class="fav-card-top">
          <div class="fav-card-type-icon ${meta.cls}">
            <i class="ti ${meta.icon}" aria-hidden="true"></i>
          </div>
          <div class="fav-card-info">
            <div class="fav-card-name">${meta.label}</div>
            <div class="fav-card-meta">${f.account} · XXXX-4521</div>
          </div>
          <button class="fav-card-remove" onclick="removeFavCard('${f.id}')" aria-label="Remove ${meta.label} from favourites">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
        <div class="fav-card-tags">
          <span class="fav-card-tag period">${f.period}</span>
          <span class="fav-card-tag">${meta.label}</span>
        </div>
        <div class="fav-card-saved-on">
          <i class="ti ti-clock" aria-hidden="true" style="font-size:11px"></i>
          Saved ${f.savedOn}
        </div>
        <div class="fav-card-footer">
          <button class="fav-card-btn primary" onclick="openFavReport('${f.id}')">
            <i class="ti ti-eye" aria-hidden="true"></i> Open
          </button>
          <button class="fav-card-btn" onclick="downloadFavReport('${f.id}')">
            <i class="ti ti-download" aria-hidden="true"></i> Download
          </button>
          <button class="fav-card-btn" onclick="shareFavReport('${f.id}')">
            <i class="ti ti-share" aria-hidden="true"></i> Share
          </button>
        </div>
      </article>`;
  }).join('');
}

function removeFavCard(id) {
  removeFavourite(id);
  // update heart on current report if it matches
  if (state.currentReportId === id) {
    const heartBtn = document.getElementById('report-fav-btn');
    if (heartBtn) {
      heartBtn.classList.remove('saved');
      heartBtn.setAttribute('aria-pressed', 'false');
      heartBtn.setAttribute('aria-label', 'Add to favourites');
      heartBtn.querySelector('span').textContent = 'Save';
    }
    const panelIcon  = document.getElementById('panel-fav-icon');
    const panelTitle = document.getElementById('panel-fav-title');
    const panelSub   = document.getElementById('panel-fav-sub');
    if (panelIcon)  panelIcon.innerHTML = '<i class="ti ti-heart" aria-hidden="true"></i>';
    if (panelTitle) panelTitle.textContent = 'Add to favourites';
    if (panelSub)   panelSub.textContent   = 'Quick access from home';
  }
  const query = document.getElementById('fav-search').value;
  filterFavourites(query);
}

function openFavReport(id) {
  closeFavourites();
  showToast('⚡ Loading saved report…');
}

function downloadFavReport(id) {
  showToast('⬇ Downloading saved report…');
}

function shareFavReport(id) {
  showToast('🔗 Secure link copied to clipboard.');
}

// ── Reset ──────────────────────────────────────────────────────────
function resetWorkspace() {
  Object.assign(state, { step: 0, intent: null, period: null, accountType: null, format: 'PDF', reportGenerated: false });
  $('chat-messages').innerHTML = '';
  hide('chat-messages'); show('chat-empty'); hide('chat-badge');
  hide('report-output'); show('canvas-empty'); hide('report-badge');
  $('actions-panel').innerHTML = ''; hide('actions-panel'); show('right-empty');
}
