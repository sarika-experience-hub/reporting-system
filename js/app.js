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
  'tax report':         { icon: 'ti-receipt',      cls: 'tax',         label: 'Tax Report' },
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

// ── App mode ───────────────────────────────────────────────────────
// 'welcome' | 'report' | 'template-use' | 'template-create' | 'custom'
let appMode = 'welcome';

// ── Report wizard state ────────────────────────────────────────────
let reportWizard = { reportType: null, period: null, account: null };

// ── DOM helpers ────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const show = id => $(id)?.classList.remove('hidden');
const hide = id => $(id)?.classList.add('hidden');

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
  const chatEmpty = $('chat-empty');
  if (chatEmpty) chatEmpty.classList.add('hidden');
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

// ── Foolproof input — rotating placeholder ─────────────────────────
const PLACEHOLDER_EXAMPLES = [
  'Show me last month\'s account statement',
  'Transaction summary for last 3 months',
  'What did I spend on shopping this year?',
  'Credit card transactions for March 2026',
  'Balance report for my savings account',
  'Show spending analysis for last 6 months',
];
let _phIdx = 0;
let _phTimer = null;

function startRotatingPlaceholder() {
  const el = $('chat-input');
  if (!el) return;
  clearInterval(_phTimer);
  _phTimer = setInterval(() => {
    if (document.activeElement !== el && !el.value) {
      _phIdx = (_phIdx + 1) % PLACEHOLDER_EXAMPLES.length;
      el.setAttribute('placeholder', PLACEHOLDER_EXAMPLES[_phIdx]);
    }
  }, 3000);
}

// ── Foolproof input — typeahead ────────────────────────────────────
const SUGGESTION_QUERIES = [
  { icon: 'ti-file-analytics', text: 'Show me last month\'s account statement' },
  { icon: 'ti-receipt',        text: 'Transaction summary for last 3 months' },
  { icon: 'ti-chart-pie',      text: 'Spending analysis for this year' },
  { icon: 'ti-wallet',         text: 'Balance report for my savings account' },
  { icon: 'ti-credit-card',    text: 'Credit card transactions for March 2026' },
  { icon: 'ti-trending-up',    text: 'How much did I spend on food last month?' },
  { icon: 'ti-file-analytics', text: 'Account statement for last 6 months' },
  { icon: 'ti-receipt',        text: 'Show all debit transactions this year' },
  { icon: 'ti-chart-bar',      text: 'Monthly spending breakdown' },
  { icon: 'ti-transfer',       text: 'Show transfers and salary credits' },
];

function handleInputChange(el) {
  autoResize(el);
  const q = el.value.trim().toLowerCase();
  if (q.length < 2) { closeTypeahead(); return; }

  const matches = SUGGESTION_QUERIES
    .filter(s => s.text.toLowerCase().includes(q))
    .slice(0, 5);

  if (!matches.length) { closeTypeahead(); return; }

  const dd = $('typeahead-dropdown');
  if (!dd) return;
  dd.innerHTML = matches.map((s, i) =>
    `<button class="typeahead-item" role="option" tabindex="-1" data-idx="${i}"
       onclick="selectTypeahead('${escHtml(s.text)}')"
       onmouseenter="this.parentElement.querySelectorAll('.typeahead-item').forEach((x,j)=>x.classList.toggle('active',j===parseInt(this.dataset.idx)))">
      <i class="ti ${s.icon}" aria-hidden="true"></i>
      <span>${highlightMatch(s.text, q)}</span>
    </button>`
  ).join('');
  dd.classList.remove('hidden');
}

function highlightMatch(text, q) {
  const idx = text.toLowerCase().indexOf(q);
  if (idx < 0) return escHtml(text);
  return escHtml(text.slice(0, idx))
    + `<span class="typeahead-match">${escHtml(text.slice(idx, idx + q.length))}</span>`
    + escHtml(text.slice(idx + q.length));
}

function selectTypeahead(text) {
  const el = $('chat-input');
  el.value = text;
  autoResize(el);
  closeTypeahead();
  el.focus();
}

function closeTypeahead() {
  $('typeahead-dropdown')?.classList.add('hidden');
}

// ── Foolproof input — voice ────────────────────────────────────────
let _voiceRecognition = null;
let _voiceActive = false;

function toggleVoiceInput() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast('🎙 Voice input is not supported in this browser. Try Chrome.');
    return;
  }
  if (_voiceActive) {
    _voiceRecognition?.stop();
    return;
  }
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  _voiceRecognition = new SpeechRec();
  _voiceRecognition.lang = 'en-IN';
  _voiceRecognition.interimResults = false;
  _voiceRecognition.maxAlternatives = 1;

  _voiceRecognition.onstart = () => {
    _voiceActive = true;
    const btn = $('voice-btn');
    if (btn) btn.classList.add('recording');
    showToast('🎙 Listening… speak your request');
  };
  _voiceRecognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    const input = $('chat-input');
    input.value = transcript;
    autoResize(input);
    closeTypeahead();
    showToast('✓ Got it — press Send or hit Enter');
  };
  _voiceRecognition.onend = () => {
    _voiceActive = false;
    const btn = $('voice-btn');
    if (btn) btn.classList.remove('recording');
  };
  _voiceRecognition.onerror = () => {
    _voiceActive = false;
    const btn = $('voice-btn');
    if (btn) btn.classList.remove('recording');
    showToast('🎙 Could not hear anything — please try again');
  };
  _voiceRecognition.start();
}

// ── Foolproof input — escape hatch ────────────────────────────────
function showPopularReports() {
  appendBubble('ai',
    'Here are the most popular reports — just click one to get started:',
    `<div class="suggestion-chips" style="margin-top:10px">
      <div class="chips">
        <span class="chip" role="button" tabindex="0" onclick="processInput('Show me last month account statement')">
          <i class="ti ti-file-analytics"></i> Last month's statement
        </span>
        <span class="chip" role="button" tabindex="0" onclick="processInput('Transaction summary for last 3 months')">
          <i class="ti ti-receipt"></i> 3-month transactions
        </span>
        <span class="chip" role="button" tabindex="0" onclick="processInput('Spending analysis for this year')">
          <i class="ti ti-chart-pie"></i> Spending analysis
        </span>
        <span class="chip" role="button" tabindex="0" onclick="processInput('Balance report for my savings account')">
          <i class="ti ti-wallet"></i> Balance report
        </span>
        <span class="chip" role="button" tabindex="0" onclick="processInput('Credit card transactions for March 2026')">
          <i class="ti ti-credit-card"></i> Credit card transactions
        </span>
      </div>
    </div>`
  );
}

// ── Input handlers ─────────────────────────────────────────────────
function handleKey(e) {
  if (e.key === 'Escape') { closeTypeahead(); return; }
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
  processInput(text);
}

function processInput(text) {
  appendBubble('user', escHtml(text));
  const norm = text.toLowerCase().trim();

  // ── Welcome mode: route based on choice ──────────────────────────
  if (appMode === 'welcome') {
    if (norm.includes('report') || norm.includes('generate') || norm.includes('create report')) {
      appMode = 'report';
      setTimeout(startReportFlow, 400);
    } else if (norm.includes('template') && (norm.includes('use') || norm.includes('existing') || norm.includes('browse'))) {
      appMode = 'template-use';
      setTimeout(startTemplateUseFlow, 400);
    } else if (norm.includes('create') || norm.includes('build') || norm.includes('new template') || norm.includes('template')) {
      appMode = 'template-create';
      setTimeout(startTemplateCreateFlow, 400);
    } else {
      setTimeout(() => {
        appendBubble('ai', 'I didn\'t quite get that. Please choose one of the options above.');
        showWelcomeChips();
      }, 400);
    }
    return;
  }

  // ── Report wizard flow ────────────────────────────────────────────
  if (appMode === 'report') {
    if (state.reportGenerated) { handleRefinement(text); return; }

    // Fallback text detection for each wizard step
    if (!reportWizard.reportType) {
      const intent = INTENT_MAP[norm] || detectIntent(norm);
      if (intent) { selectReportType(capitalise(intent)); }
      else { setTimeout(() => appendBubble('ai', 'Please select a report type from the options above.'), 400); }

    } else if (!reportWizard.period) {
      const period = detectReportPeriod(norm);
      if (period) { selectReportPeriod(period); }
      else { setTimeout(() => appendBubble('ai', 'Please select a period from the options above.'), 400); }

    } else if (!reportWizard.account) {
      const account = detectReportAccount(norm);
      if (account) { selectReportAccount(account); }
      else { setTimeout(() => appendBubble('ai', 'Please select an account from the options above.'), 400); }
    }
    return;
  }

  // ── Template create flow ──────────────────────────────────────────
  if (appMode === 'template-create') {
    handleTemplateCreateInput(text);
    return;
  }

  // ── Custom / Build-my-own flow ────────────────────────────────────
  if (appMode === 'custom') {
    handleCustomInput(text);
    return;
  }
}

// ── Welcome flow ───────────────────────────────────────────────────

// ── Journey bar ────────────────────────────────────────────────────
const JOURNEY_LABELS = {
  'report':          'Generate a report',
  'template-use':    'Use a template',
  'template-create': 'Create a template',
  'custom':          'Build my own',
};

function showJourneyBar(mode) {
  const bar  = $('journey-bar');
  const name = $('journey-bar-name');
  if (!bar || !name) return;
  name.textContent = JOURNEY_LABELS[mode] || mode;
  bar.classList.remove('hidden');
}

function hideJourneyBar() {
  $('journey-bar')?.classList.add('hidden');
}

function showWelcome() {
  const bid = 'welcome-' + Date.now();
  const extra = `
    <div class="suggestion-chips" style="margin-top:10px">
      <div class="chip-group-label">What would you like to do?</div>
      <div class="chips">
        <span class="chip welcome-chip" data-group="${bid}" role="button" tabindex="0"
          onclick="chooseWelcomeOption(this,'report')"
          onkeydown="if(event.key==='Enter')chooseWelcomeOption(this,'report')">
          <i class="ti ti-file-analytics"></i> Generate a report
        </span>
        <span class="chip welcome-chip" data-group="${bid}" role="button" tabindex="0"
          onclick="chooseWelcomeOption(this,'template-create')"
          onkeydown="if(event.key==='Enter')chooseWelcomeOption(this,'template-create')">
          <i class="ti ti-template"></i> Create a template
        </span>
      </div>
    </div>`;
  appendBubble('ai', 'Hi Sarika 👋 Welcome to <strong>ReportIQ</strong>. How would you like to get started?', extra);
}

function showWelcomeChips() {
  const bid = 'welcome-retry-' + Date.now();
  const extra = `
    <div class="suggestion-chips" style="margin-top:8px">
      <div class="chips">
        <span class="chip welcome-chip" data-group="${bid}" role="button" tabindex="0" onclick="chooseWelcomeOption(this,'report')"><i class="ti ti-file-analytics"></i> Generate a report</span>
        <span class="chip welcome-chip" data-group="${bid}" role="button" tabindex="0" onclick="chooseWelcomeOption(this,'template-create')"><i class="ti ti-template"></i> Create a template</span>
      </div>
    </div>`;
  const last = $('chat-messages').lastElementChild;
  if (last) last.querySelector('.bubble-content').insertAdjacentHTML('beforeend', extra);
}

function chooseWelcomeOption(el, mode) {
  // Lock all welcome chips
  document.querySelectorAll('.welcome-chip[data-group="' + el.dataset.group + '"]').forEach(c => {
    c.onclick = null; c.style.cursor = 'default'; c.style.opacity = '0.6';
  });
  el.style.opacity = '1';
  el.classList.add('selected');

  appMode = mode;
  const labels = {
    'report':          'Generate a report',
    'template-use':    'Use a template',
    'template-create': 'Create a template',
    'custom':          'Build my own',
  };
  appendBubble('user', labels[mode]);

  showJourneyBar(mode);
  if (mode === 'report')           setTimeout(startReportFlow, 400);
  if (mode === 'template-use')     setTimeout(startTemplateUseFlow, 400);
  if (mode === 'template-create')  setTimeout(startTemplateCreateFlow, 400);
  if (mode === 'custom')           setTimeout(startCustomFlow, 400);
}

function startReportFlow() {
  reportWizard = { reportType: null, period: null, account: null };
  appendThinking();
  setTimeout(() => {
    removeThinking();
    appendBubble('ai', 'What type of report would you like to generate?', `
      <div class="suggestion-chips" style="margin-top:10px">
        <div class="chip-group-label">Step 1 of 3 — Report type</div>
        <div class="chips rw-chips">
          <span class="chip rw-chip" role="button" tabindex="0" onclick="selectReportType('Account statement')">
            <i class="ti ti-file-text"></i> Account statement
          </span>
          <span class="chip rw-chip" role="button" tabindex="0" onclick="selectReportType('Transaction summary')">
            <i class="ti ti-list"></i> Transaction summary
          </span>
          <span class="chip rw-chip" role="button" tabindex="0" onclick="selectReportType('Balance report')">
            <i class="ti ti-wallet"></i> Balance report
          </span>
          <span class="chip rw-chip" role="button" tabindex="0" onclick="selectReportType('Spending analysis')">
            <i class="ti ti-chart-pie"></i> Spending analysis
          </span>
        </div>
      </div>`);
  }, 600);
}

function selectReportType(type) {
  reportWizard.reportType = type;
  appendBubble('user', type);
  appendThinking();
  setTimeout(() => {
    removeThinking();
    appendBubble('ai', `<strong>${type}</strong> — got it. What period should this report cover?`, `
      <div class="suggestion-chips" style="margin-top:10px">
        <div class="chip-group-label">Step 2 of 3 — Period</div>
        <div class="chips rw-chips">
          <span class="chip rw-chip" role="button" tabindex="0" onclick="selectReportPeriod('Last month')">
            <i class="ti ti-calendar-month"></i> Last month
          </span>
          <span class="chip rw-chip" role="button" tabindex="0" onclick="selectReportPeriod('Last 3 months')">
            <i class="ti ti-calendar"></i> Last 3 months
          </span>
          <span class="chip rw-chip" role="button" tabindex="0" onclick="selectReportPeriod('Last 6 months')">
            <i class="ti ti-calendar"></i> Last 6 months
          </span>
          <span class="chip rw-chip" role="button" tabindex="0" onclick="selectReportPeriod('This year')">
            <i class="ti ti-calendar-stats"></i> This year
          </span>
          <span class="chip rw-chip" role="button" tabindex="0" onclick="selectReportPeriod('Last financial year')">
            <i class="ti ti-calendar-event"></i> Last financial year
          </span>
          <span class="chip rw-chip" role="button" tabindex="0" onclick="showReportDatePicker()">
            <i class="ti ti-calendar-search"></i> Custom range
          </span>
        </div>
      </div>`);
  }, 500);
}

function selectReportPeriod(period) {
  reportWizard.period = period;
  appendBubble('user', period);
  askReportAccount();
}

function showReportDatePicker() {
  const today = new Date().toISOString().split('T')[0];
  appendBubble('ai', 'Pick your custom date range:', `
    <div class="tmpl-date-range-card" id="rw-date-range-card">
      <div class="tmpl-date-row">
        <div class="tmpl-date-col">
          <label class="tmpl-field-label"><i class="ti ti-calendar-event"></i> From</label>
          <input type="date" id="rw-date-from" class="tmpl-field-input" max="${today}">
        </div>
        <div class="tmpl-date-col">
          <label class="tmpl-field-label"><i class="ti ti-calendar-event"></i> To</label>
          <input type="date" id="rw-date-to" class="tmpl-field-input" max="${today}">
        </div>
      </div>
      <div class="tmpl-date-footer">
        <button class="tmpl-fields-skip" onclick="selectReportPeriod('This year')">Use this year instead</button>
        <button class="tmpl-fields-save" onclick="confirmReportDateRange()">
          <i class="ti ti-check"></i> Confirm range
        </button>
      </div>
    </div>`);
}

function confirmReportDateRange() {
  const from = document.getElementById('rw-date-from')?.value;
  const to   = document.getElementById('rw-date-to')?.value;
  if (!from || !to)  { showToast('Please select both start and end dates.'); return; }
  if (from > to)     { showToast('Start date must be before end date.'); return; }
  const card = document.getElementById('rw-date-range-card');
  if (card) card.querySelectorAll('input, button').forEach(e => e.disabled = true);
  const fmt = d => new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const label = `${fmt(from)} – ${fmt(to)}`;
  reportWizard.period = label;
  appendBubble('user', label);
  askReportAccount();
}

function askReportAccount() {
  appendThinking();
  setTimeout(() => {
    removeThinking();
    appendBubble('ai', 'Which account should this report cover?', `
      <div class="suggestion-chips" style="margin-top:10px">
        <div class="chip-group-label">Step 3 of 3 — Account</div>
        <div class="chips rw-chips">
          <span class="chip rw-chip" role="button" tabindex="0" onclick="selectReportAccount('All accounts')">
            <i class="ti ti-building-bank"></i> All accounts
          </span>
          <span class="chip rw-chip" role="button" tabindex="0" onclick="selectReportAccount('Savings account ••••4821')">
            <i class="ti ti-piggy-bank"></i> Savings ••••4821
          </span>
          <span class="chip rw-chip" role="button" tabindex="0" onclick="selectReportAccount('Current account ••••7732')">
            <i class="ti ti-building-community"></i> Current ••••7732
          </span>
          <span class="chip rw-chip" role="button" tabindex="0" onclick="selectReportAccount('Credit card ••••9021')">
            <i class="ti ti-credit-card"></i> Credit card ••••9021
          </span>
        </div>
      </div>`);
  }, 500);
}

function selectReportAccount(account) {
  reportWizard.account = account;
  appendBubble('user', account);
  appendThinking();
  setTimeout(() => {
    removeThinking();
    appendBubble('ai',
      `Generating your <strong>${reportWizard.reportType}</strong> — <strong>${account}</strong>, <strong>${reportWizard.period}</strong>…`
    );
    setTimeout(() => {
      const pLabel = periodLabel(reportWizard.period);
      state.intent          = reportWizard.reportType.toLowerCase();
      state.period          = reportWizard.period;
      state.accountType     = account;
      state.reportGenerated = true;
      renderReport(pLabel, account);
      renderActions(pLabel, account);
      show('report-badge');
      setTimeout(showPostReportActions, 600);
    }, 1200);
  }, 600);
}

function showPostReportActions() {
  appendBubble('ai',
    `✓ Your <strong>${reportWizard.reportType}</strong> is ready — <strong>${reportWizard.account}</strong>, <strong>${reportWizard.period}</strong>. What would you like to do next?`,
    `<div class="suggestion-chips" style="margin-top:10px">
      <div class="chip-group-label">Next step</div>
      <div class="chips rw-chips">
        <span class="chip rw-chip" onclick="guidedDownload()">
          <i class="ti ti-download"></i> Download
        </span>
        <span class="chip rw-chip" onclick="guidedEmail()">
          <i class="ti ti-mail"></i> Email it
        </span>
        <span class="chip rw-chip" onclick="startScheduleFlow()">
          <i class="ti ti-calendar-repeat"></i> Schedule
        </span>
        <span class="chip rw-chip" onclick="guidedFavourite()">
          <i class="ti ti-heart"></i> Save to favourites
        </span>
        <span class="chip rw-chip" onclick="guidedRegenerate()">
          <i class="ti ti-refresh"></i> Change parameters
        </span>
      </div>
    </div>`);
}

function guidedDownload() {
  appendBubble('user', 'Download');
  appendBubble('ai', 'Which format would you like?', `
    <div class="suggestion-chips" style="margin-top:8px">
      <div class="chips rw-chips">
        <span class="chip rw-chip" onclick="confirmGuidedDownload('PDF')">
          <i class="ti ti-file-type-pdf"></i> PDF — best for sharing &amp; printing
        </span>
        <span class="chip rw-chip" onclick="confirmGuidedDownload('Excel')">
          <i class="ti ti-file-type-xls"></i> Excel — best for analysis
        </span>
        <span class="chip rw-chip" onclick="confirmGuidedDownload('Both')">
          <i class="ti ti-files"></i> Both
        </span>
      </div>
    </div>`);
}

function confirmGuidedDownload(fmt) {
  appendBubble('user', fmt);
  appendThinking();
  setTimeout(() => {
    removeThinking();
    appendBubble('ai', `Your <strong>${reportWizard.reportType}</strong> is downloading as <strong>${fmt}</strong>.`);
    showToast(`Downloading as ${fmt}…`);
    showMoreActions();
  }, 600);
}

function guidedEmail() {
  appendBubble('user', 'Email it');
  appendBubble('ai', 'Who should receive this report?', `
    <div class="suggestion-chips" style="margin-top:8px">
      <div class="chips rw-chips">
        <span class="chip rw-chip" onclick="confirmGuidedEmail('self')">
          <i class="ti ti-user"></i> Me (sarika.bagwe@azentio.com)
        </span>
        <span class="chip rw-chip" onclick="confirmGuidedEmail('other')">
          <i class="ti ti-user-plus"></i> Someone else
        </span>
      </div>
    </div>`);
}

function confirmGuidedEmail(who) {
  if (who === 'other') {
    appendBubble('user', 'Someone else');
    appendBubble('ai', 'Enter the recipient\'s email address:', `
      <div class="sched-email-card" style="margin-top:8px">
        <div class="sched-email-row">
          <input type="email" id="guided-email-input" class="sched-email-input"
            placeholder="e.g. manager@company.com" autocomplete="email">
          <button class="chip" onclick="sendGuidedEmail()">
            <i class="ti ti-send"></i> Send
          </button>
        </div>
      </div>`);
    setTimeout(() => document.getElementById('guided-email-input')?.focus(), 100);
  } else {
    appendBubble('user', 'Me');
    appendThinking();
    setTimeout(() => {
      removeThinking();
      appendBubble('ai', 'Report sent to <strong>sarika.bagwe@azentio.com</strong>.');
      showMoreActions();
    }, 700);
  }
}

function sendGuidedEmail() {
  const input = document.getElementById('guided-email-input');
  const email = input?.value?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast('Please enter a valid email address.');
    return;
  }
  appendBubble('user', email);
  appendThinking();
  setTimeout(() => {
    removeThinking();
    appendBubble('ai', `Report sent to <strong>${email}</strong>.`);
    showMoreActions();
  }, 700);
}

function guidedFavourite() {
  appendBubble('user', 'Save to favourites');
  toggleFavourite();
  setTimeout(() => {
    appendBubble('ai', 'Saved to your favourites. You can access it anytime from the <strong>Favourites</strong> menu.');
    showMoreActions();
  }, 400);
}

function guidedRegenerate() {
  appendBubble('user', 'Change parameters');
  appendBubble('ai', 'What would you like to change?', `
    <div class="suggestion-chips" style="margin-top:8px">
      <div class="chips rw-chips">
        <span class="chip rw-chip" onclick="regenStep('type')">
          <i class="ti ti-file-text"></i> Report type
        </span>
        <span class="chip rw-chip" onclick="regenStep('period')">
          <i class="ti ti-calendar"></i> Period
        </span>
        <span class="chip rw-chip" onclick="regenStep('account')">
          <i class="ti ti-building-bank"></i> Account
        </span>
      </div>
    </div>`);
}

function regenStep(step) {
  state.reportGenerated = false;
  if (step === 'type') {
    reportWizard.reportType = null;
    reportWizard.period     = null;
    reportWizard.account    = null;
    appendBubble('user', 'Change report type');
    setTimeout(startReportFlow, 400);
  } else if (step === 'period') {
    reportWizard.period  = null;
    reportWizard.account = null;
    appendBubble('user', 'Change period');
    setTimeout(() => selectReportType(reportWizard.reportType), 400);
  } else {
    reportWizard.account = null;
    appendBubble('user', 'Change account');
    setTimeout(askReportAccount, 400);
  }
}

function showMoreActions() {
  setTimeout(() => {
    appendBubble('ai', 'Anything else you\'d like to do with this report?', `
      <div class="suggestion-chips" style="margin-top:8px">
        <div class="chips rw-chips">
          <span class="chip rw-chip" onclick="guidedDownload()">
            <i class="ti ti-download"></i> Download
          </span>
          <span class="chip rw-chip" onclick="guidedEmail()">
            <i class="ti ti-mail"></i> Email
          </span>
          <span class="chip rw-chip" onclick="startScheduleFlow()">
            <i class="ti ti-calendar-repeat"></i> Schedule
          </span>
          <span class="chip rw-chip" onclick="guidedFavourite()">
            <i class="ti ti-heart"></i> Favourites
          </span>
          <span class="chip rw-chip" onclick="guidedRegenerate()">
            <i class="ti ti-refresh"></i> Change parameters
          </span>

          <span class="chip rw-chip rw-chip--exit" onclick="finishReportJourney()">
            <i class="ti ti-check"></i> I'm done
          </span>
        </div>
      </div>`);
  }, 400);
}

function finishReportJourney() {
  appendBubble('user', 'I\'m done');
  appendThinking();
  setTimeout(() => {
    removeThinking();
    appendBubble('ai',
      `All done! Your <strong>${reportWizard.reportType}</strong> is saved on the canvas. You can come back to it anytime.`,
      `<div class="suggestion-chips" style="margin-top:10px">
        <div class="chip-group-label">What would you like to do next?</div>
        <div class="chips rw-chips">
          <span class="chip rw-chip" onclick="startNewJourney('report')">
            <i class="ti ti-file-plus"></i> Generate another report
          </span>
          <span class="chip rw-chip rw-chip--exit" onclick="resetWorkspace()">
            <i class="ti ti-home"></i> Go to home
          </span>
        </div>
      </div>`);
  }, 500);
}

function startNewJourney(mode) {
  // Reset canvas and state, keep chat visible, start chosen journey
  Object.assign(state, { step: 0, intent: null, period: null, accountType: null, format: 'PDF', reportGenerated: false, currentReportId: null });
  reportWizard = { reportType: null, period: null, account: null };
  appMode = mode;
  showJourneyBar(mode);
  if (mode === 'report')       setTimeout(startReportFlow, 400);
  if (mode === 'template-use') setTimeout(startTemplateUseFlow, 400);
}

// ── Report wizard text-input fallback helpers ──────────────────────
function detectReportPeriod(norm) {
  const map = {
    'last month': 'Last month', 'last 3 months': 'Last 3 months',
    '3 months': 'Last 3 months', 'last 6 months': 'Last 6 months',
    '6 months': 'Last 6 months', 'this year': 'This year',
    'financial year': 'Last financial year', 'fy': 'Last financial year',
    'year': 'This year',
  };
  for (const [k, v] of Object.entries(map)) if (norm.includes(k)) return v;
  return null;
}

function detectReportAccount(norm) {
  if (norm.includes('all'))     return 'All accounts';
  if (norm.includes('saving'))  return 'Savings account ••••4821';
  if (norm.includes('current')) return 'Current account ••••7732';
  if (norm.includes('credit'))  return 'Credit card ••••9021';
  return null;
}

function startTemplateUseFlow() {
  appendThinking();
  setTimeout(() => {
    removeThinking();
    appendBubble('ai', 'Sure! Opening the template library for you — browse, filter by category, and apply in one click.');
    show('browse-tmpl-bar');
    setTimeout(openTemplates, 600);
  }, 600);
}

// ── Template Create Flow ───────────────────────────────────────────

const TMPL_BUILD_STEPS = [
  { key: 'tmplReport',
    ask: 'Which report type should this template generate?',
    chips: [
      { label: 'Account statement',    icon: 'ti-file-analytics', desc: 'Full list of transactions for a period' },
      { label: 'Transaction summary',  icon: 'ti-receipt',        desc: 'Grouped view of debits and credits' },
      { label: 'Balance report',       icon: 'ti-wallet',         desc: 'Opening, closing and net balance' },
      { label: 'Spending analysis',    icon: 'ti-chart-pie',      desc: 'Category-wise spend breakdown' },
    ]
  },
  { key: 'tmplPeriod',
    ask: 'What period should this template cover by default?',
    chips: [
      { label: 'Last month',              icon: 'ti-calendar-month',  desc: 'Most recent full month' },
      { label: 'Last 3 months',           icon: 'ti-calendar',        desc: 'Previous 3 months' },
      { label: 'Last 6 months',           icon: 'ti-calendar',        desc: 'Previous 6 months' },
      { label: 'This year',               icon: 'ti-calendar-stats',  desc: 'January to today' },
      { label: 'Last financial year',     icon: 'ti-calendar-event',  desc: 'Apr 2025 – Mar 2026' },
      { label: 'Custom range',            icon: 'ti-calendar-search', desc: 'Pick your own start and end dates' },
    ]
  },
  { key: 'tmplAccount',
    ask: 'Which account should this template apply to?',
    chips: [
      { label: 'All accounts',             icon: 'ti-building-bank',      desc: 'Savings + Current + Credit card' },
      { label: 'Savings account ••••4821', icon: 'ti-piggy-bank',         desc: 'Primary savings account' },
      { label: 'Current account ••••7732', icon: 'ti-building-community', desc: 'Business current account' },
      { label: 'Credit card ••••9021',     icon: 'ti-credit-card',        desc: 'Azentio Platinum card' },
    ]
  },
  { key: 'tmplFields',
    ask: 'Finally, configure the fields and output format for this template.',
    type: 'fields'
  },
];

let tmplBuildStep  = 0;
let tmplBuildState = {};
const CUSTOM_TMPL_KEY = 'reportiq_custom_templates';

function startTemplateCreateFlow() {
  tmplBuildStep  = 0;
  tmplBuildState = {};
  appendThinking();
  setTimeout(() => {
    removeThinking();
    runTmplBuildStep();
  }, 600);
}

// ── Custom / Build-my-own Flow ─────────────────────────────────────

const CUSTOM_PARAMS_KEY = 'reportiq_custom_params';

let customState = { reportType: null, period: null, accountType: null, reportGenerated: false };

const CUSTOM_REPORT_TYPES = {
  'account statement': 'account-statement', 'statement': 'account-statement',
  'transaction': 'transaction-summary', 'transaction summary': 'transaction-summary',
  'balance': 'balance-report', 'balance report': 'balance-report',
  'spending': 'spending-analysis', 'spending analysis': 'spending-analysis',
};
const CUSTOM_PERIODS = {
  'last month': 'Last month', 'last 3 months': 'Last 3 months',
  'last 6 months': 'Last 6 months', 'this year': 'This year',
  '3 months': 'Last 3 months', '6 months': 'Last 6 months',
  'q1': 'Q1 2025', 'q2': 'Q2 2025', 'q3': 'Q3 2025', 'q4': 'Q4 2025',
};
const CUSTOM_ACCOUNTS = {
  'savings': 'Savings account ••••4821',
  'current': 'Current account ••••7732',
  'credit': 'Credit card ••••9021',
  'all': 'All accounts',
};

const STANDARD_PARAMS = [
  { icon: 'ti-calendar',         label: 'Date range',       desc: 'Start and end date for the report period' },
  { icon: 'ti-building-bank',    label: 'Account type',     desc: 'Savings, current, credit card or all accounts' },
  { icon: 'ti-arrows-exchange',  label: 'Transaction type', desc: 'Debit, credit, or both' },
  { icon: 'ti-currency-rupee',   label: 'Currency',         desc: 'INR (default) or multi-currency' },
  { icon: 'ti-filter',           label: 'Amount range',     desc: 'Minimum and maximum transaction amount' },
  { icon: 'ti-tag',              label: 'Category',         desc: 'Spend category filter (food, travel, utilities…)' },
  { icon: 'ti-file-export',      label: 'Output format',    desc: 'PDF or Excel' },
];

function startCustomFlow() {
  customState = { reportType: null, period: null, accountType: null, reportGenerated: false };
  localStorage.removeItem(CUSTOM_PARAMS_KEY);
  appendThinking();
  setTimeout(() => {
    removeThinking();
    appendBubble('ai',
      'You\'re in <strong>Build my own</strong> mode — you\'re in control. Tell me what you need, ask questions, explore parameters, or just describe the report you want.',
      `<div class="suggestion-chips" style="margin-top:10px">
        <div class="chips">
          <span class="chip" role="button" tabindex="0" onclick="processInput('What parameters are available?')">
            <i class="ti ti-list-search"></i> What parameters are available?
          </span>
          <span class="chip" role="button" tabindex="0" onclick="processInput('Account statement')">
            <i class="ti ti-file-analytics"></i> Account statement
          </span>
          <span class="chip" role="button" tabindex="0" onclick="processInput('Transaction summary')">
            <i class="ti ti-receipt"></i> Transaction summary
          </span>
          <span class="chip" role="button" tabindex="0" onclick="processInput('Spending analysis')">
            <i class="ti ti-chart-pie"></i> Spending analysis
          </span>
        </div>
      </div>`
    );
  }, 600);
}

function handleCustomInput(text) {
  const norm = text.toLowerCase().trim();

  // ── Parameter query ───────────────────────────────────────────────
  if (norm.includes('parameter') || norm.includes('param') || (norm.includes('what') && (norm.includes('available') || norm.includes('fields') || norm.includes('options')))) {
    appendThinking();
    setTimeout(() => {
      removeThinking();
      const typeLabel = customState.reportType
        ? `<strong>${capitalise(customState.reportType.replace(/-/g, ' '))}</strong>`
        : 'this report type';
      const rows = STANDARD_PARAMS.map(p =>
        `<div class="cparam-row"><i class="ti ${p.icon} cparam-icon"></i><div class="cparam-info"><span class="cparam-label">${p.label}</span><span class="cparam-desc">${p.desc}</span></div></div>`
      ).join('');
      appendBubble('ai',
        `Here are the standard parameters for ${typeLabel}:`,
        `<div class="cparam-list">${rows}</div>
        <div style="margin-top:10px">
          <p style="margin:0 0 8px;font-size:12px;color:var(--color-text-secondary);">
            Need a parameter that isn't listed? Generate the report first, then add your own.
          </p>
          ${customState.reportGenerated
            ? `<div class="suggestion-chips"><div class="chips">
                <span class="chip" role="button" tabindex="0" onclick="openCustomBuilder()">
                  <i class="ti ti-puzzle"></i> Add custom parameter
                </span>
               </div></div>`
            : `<div class="suggestion-chips"><div class="chips">
                <span class="chip" role="button" tabindex="0" onclick="generateCustomReport()">
                  <i class="ti ti-bolt"></i> Generate report first
                </span>
               </div></div>`
          }
        </div>`
      );
    }, 500);
    return;
  }

  // ── Detect report type ────────────────────────────────────────────
  if (!customState.reportType) {
    for (const [key, val] of Object.entries(CUSTOM_REPORT_TYPES)) {
      if (norm.includes(key)) { customState.reportType = val; break; }
    }
  }

  // ── Detect period ─────────────────────────────────────────────────
  if (!customState.period) {
    for (const [key, val] of Object.entries(CUSTOM_PERIODS)) {
      if (norm.includes(key)) { customState.period = val; break; }
    }
  }

  // ── Detect account ────────────────────────────────────────────────
  if (!customState.accountType) {
    for (const [key, val] of Object.entries(CUSTOM_ACCOUNTS)) {
      if (norm.includes(key)) { customState.accountType = val; break; }
    }
  }

  // ── Generate command ──────────────────────────────────────────────
  if (norm.includes('generate') || norm.includes('show report') || norm.includes('yes') || norm.includes('go ahead') || norm.includes('create report')) {
    if (customState.reportType) { generateCustomReport(); return; }
  }

  // ── Progressive guidance ──────────────────────────────────────────
  if (!customState.reportType) {
    appendThinking();
    setTimeout(() => {
      removeThinking();
      appendBubble('ai', 'What type of report would you like?', `
        <div class="suggestion-chips" style="margin-top:8px">
          <div class="chips">
            <span class="chip" role="button" tabindex="0" onclick="processInput('Account statement')"><i class="ti ti-file-analytics"></i> Account statement</span>
            <span class="chip" role="button" tabindex="0" onclick="processInput('Transaction summary')"><i class="ti ti-receipt"></i> Transaction summary</span>
            <span class="chip" role="button" tabindex="0" onclick="processInput('Balance report')"><i class="ti ti-chart-line"></i> Balance report</span>
            <span class="chip" role="button" tabindex="0" onclick="processInput('Spending analysis')"><i class="ti ti-chart-pie"></i> Spending analysis</span>
          </div>
        </div>`);
    }, 400);
    return;
  }

  if (!customState.period) {
    appendThinking();
    setTimeout(() => {
      removeThinking();
      appendBubble('ai', `Got it — <strong>${capitalise(customState.reportType.replace(/-/g, ' '))}</strong>. Which period should the report cover?`, `
        <div class="suggestion-chips" style="margin-top:8px">
          <div class="chips">
            <span class="chip" role="button" tabindex="0" onclick="processInput('Last month')">Last month</span>
            <span class="chip" role="button" tabindex="0" onclick="processInput('Last 3 months')">Last 3 months</span>
            <span class="chip" role="button" tabindex="0" onclick="processInput('Last 6 months')">Last 6 months</span>
            <span class="chip" role="button" tabindex="0" onclick="processInput('This year')">This year</span>
          </div>
        </div>`);
    }, 400);
    return;
  }

  if (!customState.accountType) {
    appendThinking();
    setTimeout(() => {
      removeThinking();
      appendBubble('ai', 'Which account should this cover?', `
        <div class="suggestion-chips" style="margin-top:8px">
          <div class="chips">
            <span class="chip" role="button" tabindex="0" onclick="processInput('Savings account')">Savings account</span>
            <span class="chip" role="button" tabindex="0" onclick="processInput('Current account')">Current account</span>
            <span class="chip" role="button" tabindex="0" onclick="processInput('Credit card')">Credit card</span>
            <span class="chip" role="button" tabindex="0" onclick="processInput('All accounts')">All accounts</span>
          </div>
        </div>`);
    }, 400);
    return;
  }

  // ── All params collected — confirm ────────────────────────────────
  appendThinking();
  setTimeout(() => {
    removeThinking();
    appendBubble('ai',
      `Ready to generate your <strong>${capitalise(customState.reportType.replace(/-/g, ' '))}</strong> for <strong>${customState.period}</strong> (${customState.accountType}). Shall I go ahead?`, `
      <div class="suggestion-chips" style="margin-top:8px">
        <div class="chips">
          <span class="chip" role="button" tabindex="0" onclick="generateCustomReport()"><i class="ti ti-bolt"></i> Yes, generate</span>
          <span class="chip" role="button" tabindex="0" onclick="processInput('What parameters are available?')"><i class="ti ti-list-search"></i> Check parameters first</span>
        </div>
      </div>`);
  }, 400);
}

function generateCustomReport() {
  if (!customState.reportType) customState.reportType = 'account-statement';
  if (!customState.period)     customState.period = 'Last month';
  if (!customState.accountType) customState.accountType = 'Savings account ••••4821';

  customState.reportGenerated = true;
  state.intent         = customState.reportType;
  state.period         = customState.period;
  state.accountType    = customState.accountType;
  state.reportGenerated = true;

  appendThinking();
  setTimeout(() => {
    removeThinking();
    renderReport(customState.period, customState.accountType);
    renderActions(customState.period, customState.accountType);

    // Prepend "Customise" section to actions panel
    const panel = $('actions-panel');
    if (panel) {
      const sec = document.createElement('div');
      sec.innerHTML = `
        <div class="action-section-label">Customise</div>
        <div class="action-btn-wrap">
          <button class="action-btn" onclick="openCustomBuilder()">
            <div class="action-btn-icon purple"><i class="ti ti-puzzle" aria-hidden="true"></i></div>
            <div class="action-btn-text">
              <div class="action-btn-title">Add custom parameter</div>
              <div class="action-btn-sub">Extend report with your own fields</div>
            </div>
            <i class="ti ti-chevron-right action-chevron" aria-hidden="true"></i>
          </button>
        </div>
        <div class="rab-sep" style="margin:8px 0"></div>`;
      panel.insertBefore(sec, panel.firstChild);
    }

    appendBubble('ai',
      `Your <strong>${capitalise(customState.reportType.replace(/-/g, ' '))}</strong> is ready! Download or share it using the panel on the right — or use <strong>Add custom parameter</strong> to extend the report with fields not currently in the system.`
    );
  }, 1200);
}

function openCustomBuilder() {
  const ctx = {
    reportType:   customState.reportType  || state.intent  || 'account-statement',
    period:       customState.period      || state.period   || 'Last month',
    accountType:  customState.accountType || state.accountType || 'All accounts',
    customParams: [],
  };
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOM_PARAMS_KEY) || 'null');
    if (saved && saved.reportType === ctx.reportType) ctx.customParams = saved.customParams || [];
  } catch { /* ignore */ }
  localStorage.setItem(CUSTOM_PARAMS_KEY, JSON.stringify(ctx));
  window.location.href = 'custom-report-builder.html';
}

// ── Return from custom-report-builder.html ────────────────────────
function handleCustomBuilderReturn() {
  const done = localStorage.getItem('reportiq_custom_done');
  if (!done) return false;
  localStorage.removeItem('reportiq_custom_done');

  let ctx = {};
  try { ctx = JSON.parse(localStorage.getItem(CUSTOM_PARAMS_KEY) || '{}'); } catch { /* ignore */ }

  appMode = 'custom';
  customState = {
    reportType:   ctx.reportType   || 'account-statement',
    period:       ctx.period       || 'Last month',
    accountType:  ctx.accountType  || 'All accounts',
    reportGenerated: true,
  };

  showJourneyBar('custom');

  // Reconstruct chat
  appendBubble('ai', 'Hi Sarika 👋 Welcome to <strong>ReportIQ</strong>. How would you like to get started?');
  appendBubble('user', 'Build my own');
  appendBubble('user', capitalise(ctx.reportType?.replace(/-/g, ' ') || 'Account statement'));
  appendBubble('user', ctx.period || 'Last month');
  appendBubble('user', ctx.accountType || 'All accounts');

  const params = ctx.customParams || [];
  if (params.length) {
    appendBubble('user', `Added ${params.length} custom parameter${params.length > 1 ? 's' : ''}: ${params.map(p => p.label).join(', ')}`);
  }

  // Re-generate with custom params
  state.intent      = customState.reportType;
  state.period      = customState.period;
  state.accountType = customState.accountType;
  state.reportGenerated = true;

  appendThinking();
  setTimeout(() => {
    removeThinking();
    renderReport(customState.period, customState.accountType, params);
    renderActions(customState.period, customState.accountType);

    const panel = $('actions-panel');
    if (panel) {
      const sec = document.createElement('div');
      sec.innerHTML = `
        <div class="action-section-label">Customise</div>
        <div class="action-btn-wrap">
          <button class="action-btn" onclick="openCustomBuilder()">
            <div class="action-btn-icon purple"><i class="ti ti-puzzle" aria-hidden="true"></i></div>
            <div class="action-btn-text">
              <div class="action-btn-title">Add custom parameter</div>
              <div class="action-btn-sub">${params.length ? params.length + ' custom field' + (params.length > 1 ? 's' : '') + ' active' : 'Extend report with your own fields'}</div>
            </div>
            <i class="ti ti-chevron-right action-chevron" aria-hidden="true"></i>
          </button>
        </div>
        <div class="rab-sep" style="margin:8px 0"></div>`;
      panel.insertBefore(sec, panel.firstChild);
    }

    const paramNote = params.length
      ? `with <strong>${params.length} custom parameter${params.length > 1 ? 's' : ''}</strong> (${params.map(p => p.label).join(', ')}) `
      : '';
    appendBubble('ai', `Report re-generated ${paramNote}— custom fields are appended to the report output.`);
  }, 1000);

  return true;
}

function runTmplBuildStep() {
  const step = TMPL_BUILD_STEPS[tmplBuildStep];
  if (!step) { askSaveName(); return; }

  if (step.chips) {
    const bid = 'tmplbuild-' + Date.now();
    const chipHtml = step.chips.map(opt => {
      const label = typeof opt === 'string' ? opt : opt.label;
      const icon  = typeof opt === 'object' ? opt.icon : '';
      const desc  = typeof opt === 'object' ? opt.desc  : '';
      return `<span class="chip tmpl-chip-rich" data-group="${bid}" role="button" tabindex="0"
        onclick="selectTmplChip(this,'${step.key}','${label}','${bid}')"
        onkeydown="if(event.key==='Enter')selectTmplChip(this,'${step.key}','${label}','${bid}')">
        ${icon ? `<i class="ti ${icon}" aria-hidden="true"></i>` : ''}
        <span class="tmpl-chip-body">
          <span class="tmpl-chip-label">${label}</span>
          ${desc ? `<span class="tmpl-chip-desc">${desc}</span>` : ''}
        </span>
      </span>`;
    }).join('');
    appendBubble('ai', step.ask, `
      <div class="tmpl-chip-grid" style="margin-top:10px">${chipHtml}</div>`);

  } else if (step.type === 'fields') {
    localStorage.setItem('reportiq_tmpl_draft', JSON.stringify(tmplBuildState));
    appendBubble('ai', step.ask, `
      <div style="margin-top:12px">
        <button class="tmpl-fields-nav-btn" onclick="openFieldsPage()">
          <i class="ti ti-settings-2"></i> Configure fields &amp; settings
          <i class="ti ti-arrow-right" style="margin-left:4px;font-size:11px"></i>
        </button>
      </div>`);
  } else {
    appendBubble('ai', step.ask);
    $('chat-input').placeholder = step.placeholder || 'Type here…';
    $('chat-input').focus();
  }
}

function openFieldsPage() {
  localStorage.setItem('reportiq_tmpl_draft', JSON.stringify(tmplBuildState));
  window.location.href = 'template-fields.html';
}

function reopenFieldsPage() {
  // Save current state (including any fields already set) before navigating back
  localStorage.setItem('reportiq_tmpl_draft', JSON.stringify(tmplBuildState));
  window.location.href = 'template-fields.html';
}

function continueAfterFields() {
  document.querySelectorAll('.chip').forEach(c => {
    if (c.textContent.includes('Continue') || c.textContent.includes('Review')) {
      c.onclick = null; c.style.cursor = 'default'; c.style.opacity = '0.5';
    }
  });
  appendBubble('user', 'Continue');
  setTimeout(askSaveName, 400);
}

// ── Save-name step ─────────────────────────────────────────────────
let _tmplAwaitingName = false;

function askSaveName() {
  appendThinking();
  setTimeout(() => {
    removeThinking();
    appendBubble('ai',
      'Great — your template is ready! Would you like to save it with a custom name so you can find it easily later?', `
      <div class="suggestion-chips" style="margin-top:10px">
        <div class="chips">
          <span class="chip" role="button" tabindex="0" onclick="showNameInput()">
            <i class="ti ti-pencil"></i> Yes, give it a name
          </span>
          <span class="chip" role="button" tabindex="0" onclick="saveTemplateWithName(null)">
            <i class="ti ti-check"></i> No, save as-is
          </span>
        </div>
      </div>`);
  }, 500);
}

function showNameInput() {
  _tmplAwaitingName = true;
  const autoName = tmplBuildState.tmplReport
    ? `${tmplBuildState.tmplReport} — ${tmplBuildState.tmplPeriod || 'All periods'}`
    : 'My Template';
  appendBubble('ai', 'What would you like to call this template?');
  const input = $('chat-input');
  input.value = '';
  input.placeholder = `e.g. ${autoName}`;
  input.focus();
}

function saveTemplateWithName(name) {
  _tmplAwaitingName = false;
  const autoName = tmplBuildState.tmplReport
    ? `${tmplBuildState.tmplReport} — ${tmplBuildState.tmplPeriod || 'All periods'}`
    : 'My Template';
  tmplBuildState.tmplName = name || autoName;
  if (name) appendBubble('user', name);
  finishTemplateCreate();
}

function renderTmplFieldsStep(askText) {
  // Determine which fields are relevant based on selected report type
  const rtype = (tmplBuildState.tmplReport || '').toLowerCase();
  const isBalance = rtype.includes('balance');

  const dateFields = `
    <div class="tmpl-fields-row">
      <div class="tmpl-fields-col">
        <label class="tmpl-field-label"><i class="ti ti-calendar-event"></i> Start date</label>
        <input type="date" id="tf-start-date" class="tmpl-field-input">
      </div>
      <div class="tmpl-fields-col">
        <label class="tmpl-field-label"><i class="ti ti-calendar-event"></i> End date</label>
        <input type="date" id="tf-end-date" class="tmpl-field-input">
      </div>
    </div>`;

  const txnTypeField = !isBalance ? `
    <div class="tmpl-fields-group">
      <label class="tmpl-field-label"><i class="ti ti-arrows-exchange"></i> Transaction type</label>
      <div class="tmpl-fields-chips">
        <span class="tmpl-ftag active" data-field="txnType" data-val="All" onclick="toggleTmplFtag(this)">All</span>
        <span class="tmpl-ftag" data-field="txnType" data-val="Debit only" onclick="toggleTmplFtag(this)">Debit only</span>
        <span class="tmpl-ftag" data-field="txnType" data-val="Credit only" onclick="toggleTmplFtag(this)">Credit only</span>
      </div>
    </div>` : '';

  const amountFields = !isBalance ? `
    <div class="tmpl-fields-row">
      <div class="tmpl-fields-col">
        <label class="tmpl-field-label"><i class="ti ti-currency-rupee"></i> Min amount</label>
        <input type="number" id="tf-min-amount" class="tmpl-field-input" placeholder="e.g. 500" min="0">
      </div>
      <div class="tmpl-fields-col">
        <label class="tmpl-field-label"><i class="ti ti-currency-rupee"></i> Max amount</label>
        <input type="number" id="tf-max-amount" class="tmpl-field-input" placeholder="e.g. 50000" min="0">
      </div>
    </div>` : '';

  const currencyField = `
    <div class="tmpl-fields-group">
      <label class="tmpl-field-label"><i class="ti ti-world"></i> Currency</label>
      <div class="tmpl-fields-chips">
        <span class="tmpl-ftag active" data-field="currency" data-val="INR" onclick="toggleTmplFtag(this)">INR</span>
        <span class="tmpl-ftag" data-field="currency" data-val="USD" onclick="toggleTmplFtag(this)">USD</span>
        <span class="tmpl-ftag" data-field="currency" data-val="EUR" onclick="toggleTmplFtag(this)">EUR</span>
        <span class="tmpl-ftag" data-field="currency" data-val="GBP" onclick="toggleTmplFtag(this)">GBP</span>
      </div>
    </div>`;

  const descField = `
    <div class="tmpl-fields-group">
      <label class="tmpl-field-label"><i class="ti ti-notes"></i> Description / notes (optional)</label>
      <input type="text" id="tf-desc" class="tmpl-field-input" placeholder="e.g. Include only salary credits">
    </div>`;

  const cardHtml = `
    <div class="tmpl-fields-card" id="tmpl-fields-card">
      ${dateFields}
      ${txnTypeField}
      ${amountFields}
      ${currencyField}
      ${descField}
      <div class="tmpl-fields-footer">
        <button class="tmpl-fields-skip" onclick="submitTmplFields(true)">Skip — keep flexible</button>
        <button class="tmpl-fields-save" onclick="submitTmplFields(false)"><i class="ti ti-check"></i> Save fields</button>
      </div>
    </div>`;

  appendBubble('ai', askText, cardHtml);
}

function toggleTmplFtag(el) {
  const field = el.dataset.field;
  // Single-select within same field group
  el.closest('.tmpl-fields-chips').querySelectorAll('.tmpl-ftag').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
}

function submitTmplFields(skip) {
  const card = document.getElementById('tmpl-fields-card');
  if (card) {
    // Disable all inputs in the card
    card.querySelectorAll('input, button').forEach(el => el.disabled = true);
    card.querySelectorAll('.tmpl-ftag').forEach(el => { el.onclick = null; el.style.pointerEvents = 'none'; });
  }

  if (skip) {
    tmplBuildState.tmplFields = null;
    appendBubble('user', 'Keep fields flexible');
  } else {
    const startDate = ($('tf-start-date') || {}).value || '';
    const endDate   = ($('tf-end-date')   || {}).value || '';
    const txnType   = document.querySelector('.tmpl-ftag.active[data-field="txnType"]')?.dataset.val || 'All';
    const currency  = document.querySelector('.tmpl-ftag.active[data-field="currency"]')?.dataset.val || 'INR';
    const minAmt    = ($('tf-min-amount') || {}).value || '';
    const maxAmt    = ($('tf-max-amount') || {}).value || '';
    const desc      = ($('tf-desc') || {}).value || '';

    tmplBuildState.tmplFields = { startDate, endDate, txnType, currency, minAmt, maxAmt, desc };

    const parts = [];
    if (startDate && endDate) parts.push(`${startDate} → ${endDate}`);
    else if (startDate)       parts.push(`From ${startDate}`);
    else if (endDate)         parts.push(`Until ${endDate}`);
    if (txnType !== 'All')    parts.push(txnType);
    if (currency !== 'INR')   parts.push(currency);
    if (minAmt || maxAmt)     parts.push(`₹${minAmt||0} – ₹${maxAmt||'∞'}`);
    if (desc)                 parts.push(desc);

    appendBubble('user', parts.length ? parts.join(' · ') : 'Fields configured');
  }

  tmplBuildStep++;
  setTimeout(runTmplBuildStep, 400);
}

function selectTmplChip(el, key, value, bid) {
  document.querySelectorAll(`[data-group="${bid}"]`).forEach(c => {
    c.onclick = null; c.style.cursor = 'default'; c.style.opacity = '0.65';
  });
  el.style.opacity = '1';
  el.classList.add('selected');
  tmplBuildState[key] = value;
  appendBubble('user', value);

  // Custom range → show inline date picker instead of advancing
  if (key === 'tmplPeriod' && value === 'Custom range') {
    showCustomRangePicker();
    return;
  }

  tmplBuildStep++;
  setTimeout(runTmplBuildStep, 400);
}

function showCustomRangePicker() {
  const today = new Date().toISOString().split('T')[0];
  appendBubble('ai', 'Pick your custom date range:', `
    <div class="tmpl-date-range-card" id="tmpl-date-range-card">
      <div class="tmpl-date-row">
        <div class="tmpl-date-col">
          <label class="tmpl-field-label"><i class="ti ti-calendar-event"></i> From</label>
          <input type="date" id="tmpl-cr-from" class="tmpl-field-input" max="${today}">
        </div>
        <div class="tmpl-date-col">
          <label class="tmpl-field-label"><i class="ti ti-calendar-event"></i> To</label>
          <input type="date" id="tmpl-cr-to" class="tmpl-field-input" max="${today}">
        </div>
      </div>
      <div class="tmpl-date-footer">
        <button class="tmpl-fields-skip" onclick="confirmCustomRange(false)">Use this year instead</button>
        <button class="tmpl-fields-save" onclick="confirmCustomRange(true)">
          <i class="ti ti-check"></i> Confirm range
        </button>
      </div>
    </div>`);
}

function confirmCustomRange(useCustom) {
  const card = document.getElementById('tmpl-date-range-card');
  if (card) card.querySelectorAll('input, button').forEach(e => e.disabled = true);

  if (useCustom) {
    const from = $('tmpl-cr-from')?.value || '';
    const to   = $('tmpl-cr-to')?.value   || '';
    if (!from || !to) {
      showToast('⚠ Please select both a start and end date.');
      if (card) card.querySelectorAll('input, button').forEach(e => e.disabled = false);
      return;
    }
    const fmt = d => new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
    tmplBuildState.tmplPeriod = `${fmt(from)} – ${fmt(to)}`;
    tmplBuildState.tmplCustomFrom = from;
    tmplBuildState.tmplCustomTo   = to;
    appendBubble('user', tmplBuildState.tmplPeriod);
  } else {
    tmplBuildState.tmplPeriod = 'This year';
    appendBubble('user', 'This year');
  }

  tmplBuildStep++;
  setTimeout(runTmplBuildStep, 400);
}

function handleTemplateCreateInput(text) {
  // Handle save-name step
  if (_tmplAwaitingName) {
    $('chat-input').placeholder = 'Type your report request…';
    saveTemplateWithName(text.trim() || null);
    return;
  }
  const step = TMPL_BUILD_STEPS[tmplBuildStep];
  if (step && step.type === 'text') {
    tmplBuildState[step.key] = text;
    $('chat-input').placeholder = 'Type your report request…';
    tmplBuildStep++;
    setTimeout(runTmplBuildStep, 400);
  }
}

function finishTemplateCreate() {
  // account + format now come from the fields page settings, or defaults
  const tmplAccount = tmplBuildState.tmplAccount || 'All accounts';
  const tmplFormat  = tmplBuildState.tmplFormat  || 'PDF';
  const { tmplName, tmplReport, tmplPeriod, tmplFields } = tmplBuildState;
  appendThinking();
  setTimeout(() => {
    removeThinking();

    // Build summary tags for the confirmation card
    const fieldTags = [];
    if (tmplFields && Array.isArray(tmplFields)) {
      const regularFields = tmplFields.filter(f => f.type !== 'chart');
      const charts        = tmplFields.filter(f => f.type === 'chart');
      if (regularFields.length)
        fieldTags.push(`<span class="fav-card-tag"><i class="ti ti-forms"></i> ${regularFields.length} field${regularFields.length !== 1 ? 's' : ''}</span>`);
      if (charts.length)
        fieldTags.push(`<span class="fav-card-tag" style="background:#FEF3C7;color:#92400E"><i class="ti ti-chart-bar"></i> ${charts.length} chart${charts.length !== 1 ? 's' : ''}</span>`);
    } else if (tmplFields) {
      // legacy object format (pre-charts)
      if (tmplFields.startDate && tmplFields.endDate)
        fieldTags.push(`<span class="fav-card-tag period"><i class="ti ti-calendar"></i> ${tmplFields.startDate} → ${tmplFields.endDate}</span>`);
      if (tmplFields.txnType && tmplFields.txnType !== 'All')
        fieldTags.push(`<span class="fav-card-tag"><i class="ti ti-arrows-exchange"></i> ${tmplFields.txnType}</span>`);
      if (tmplFields.currency && tmplFields.currency !== 'INR')
        fieldTags.push(`<span class="fav-card-tag"><i class="ti ti-world"></i> ${tmplFields.currency}</span>`);
      if (tmplFields.minAmt || tmplFields.maxAmt)
        fieldTags.push(`<span class="fav-card-tag">₹${tmplFields.minAmt||0} – ₹${tmplFields.maxAmt||'∞'}</span>`);
      if (tmplFields.desc)
        fieldTags.push(`<span class="fav-card-tag"><i class="ti ti-notes"></i> ${escHtml(tmplFields.desc)}</span>`);
    }

    // Save to localStorage
    const custom = JSON.parse(localStorage.getItem(CUSTOM_TMPL_KEY) || '[]');
    const newTmpl = {
      id:        'custom-' + Date.now(),
      name:      tmplName,
      intent:    tmplReport.toLowerCase(),
      period:    tmplPeriod,
      accountType: tmplAccount,
      account:   tmplAccount,
      format:    tmplFormat,
      fields:    tmplFields || null,
      desc:      Array.isArray(tmplFields) ? '' : (tmplFields?.desc || ''),
      category:  detectIntent(tmplReport.toLowerCase()) || 'statement',
      createdAt: new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }),
      custom:    true,
    };
    custom.unshift(newTmpl);
    localStorage.setItem(CUSTOM_TMPL_KEY, JSON.stringify(custom));

    appendBubble('ai', `
      ✅ Template <strong>"${escHtml(tmplName)}"</strong> created successfully!<br>
      <div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px">
        <span class="fav-card-tag period">${tmplReport}</span>
        <span class="fav-card-tag period">${tmplPeriod}</span>
        <span class="fav-card-tag">${tmplAccount}</span>
        <span class="fav-card-tag">${tmplFormat}</span>
        ${fieldTags.join('')}
      </div>`, `
      <div class="suggestion-chips" style="margin-top:10px">
        <div class="chips">
          <span class="chip" role="button" tabindex="0" onclick="useNewTemplate('${newTmpl.id}')">
            <i class="ti ti-play"></i> Use this template now
          </span>
          <span class="chip" role="button" tabindex="0" onclick="openTemplates()">
            <i class="ti ti-layout-grid"></i> Browse all templates
          </span>
        </div>
      </div>`);

    showToast(`✅ Template "${tmplName}" saved.`);
  }, 900);
}

function useNewTemplate(id) {
  const custom = JSON.parse(localStorage.getItem(CUSTOM_TMPL_KEY) || '[]');
  const t = custom.find(c => c.id === id);
  if (!t) return;
  appMode = 'report';
  state.intent = detectIntent(t.intent) || 'account statement';
  state.period = t.period;
  state.accountType = t.account;
  state.format = t.format;
  state.step = FLOWS[state.intent]?.length || 0;
  appendBubble('user', `Use template: ${t.name}`);
  setTimeout(triggerGeneration, 500);
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
    'Last month':           'May 2026',
    'Last 3 months':        'Mar – May 2026',
    'Last 6 months':        'Dec 2025 – May 2026',
    'This year':            'Jan – May 2026',
    'Last financial year':  'Apr 2025 – Mar 2026',
    'This week':            'Week of 2 Jun 2026',
    'Current':              'As of Jun 2026',
    'End of last month':    'May 2026',
    'Last quarter':         'Jan – Mar 2026',
    'Year to date':         'Jan – May 2026'
  };
  return map[p] || p;
}

// ── Report rendering ───────────────────────────────────────────────
function renderReport(pLabel, account, customParams) {
  activeFilters = null; // reset any previous filters
  show('report-badge');
  hide('canvas-empty');
  show('report-output');

  // Assign a stable ID for this report instance
  state.currentReportId = `${state.intent}|${account}|${pLabel}`;

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
              <th scope="col" style="width:140px">Category</th>
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
    </div>

    ${(customParams && customParams.length) ? `
    <div class="custom-params-section">
      <div class="custom-params-header">
        <i class="ti ti-puzzle custom-params-icon" aria-hidden="true"></i>
        <span>Custom parameters</span>
      </div>
      <div class="custom-params-grid">
        ${customParams.map(p => `
          <div class="custom-param-cell">
            <div class="custom-param-cell-label">${escHtml(p.label)}</div>
            <div class="custom-param-cell-value">${escHtml(p.value || '—')}</div>
          </div>`).join('')}
      </div>
    </div>` : ''}`;

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
  const now = new Date();
  const gen = now.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
            + ', ' + now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  // Populate meta row
  $('rab-meta').innerHTML = `
    <span class="rab-meta-item"><i class="ti ti-clock"></i> ${gen}</span>
    <span class="rab-meta-sep">·</span>
    <span class="rab-meta-item"><i class="ti ti-building-bank"></i> ${account}</span>
    <span class="rab-meta-sep">·</span>
    <span class="rab-meta-item"><i class="ti ti-calendar"></i> ${pLabel}</span>
    <span class="rab-meta-sep">·</span>
    <span class="rab-meta-badge"><i class="ti ti-shield-check"></i> Verified</span>`;

  // Populate horizontal action buttons
  $('actions-panel').innerHTML = `
    <div class="rab-download-wrap">
      <button class="rab-btn" onclick="toggleDownloadDropdown(event)" aria-haspopup="true" aria-expanded="false" id="btn-download">
        <i class="ti ti-download" aria-hidden="true"></i> Download <i class="ti ti-chevron-down rab-chevron" aria-hidden="true"></i>
      </button>
      <div class="download-dropdown hidden" id="download-dropdown" role="menu" aria-label="Choose download format">
        <div class="dropdown-label">Choose format</div>
        <button class="dropdown-item" role="menuitem" onclick="downloadAs('PDF')">
          <div class="dropdown-item-icon pdf"><i class="ti ti-file-type-pdf" aria-hidden="true"></i></div>
          <div><div>PDF document</div><div class="dropdown-item-sub">Best for sharing &amp; printing</div></div>
        </button>
        <button class="dropdown-item" role="menuitem" onclick="downloadAs('Excel')">
          <div class="dropdown-item-icon xlsx"><i class="ti ti-file-type-xls" aria-hidden="true"></i></div>
          <div><div>Excel spreadsheet</div><div class="dropdown-item-sub">Best for analysis &amp; editing</div></div>
        </button>
      </div>
    </div>
    <button class="rab-btn" onclick="triggerAction('Email')">
      <i class="ti ti-mail" aria-hidden="true"></i> Email
    </button>
    <button class="rab-btn" onclick="triggerAction('Secure link')">
      <i class="ti ti-link" aria-hidden="true"></i> Copy link
    </button>
    <button class="rab-btn" id="btn-schedule" onclick="startScheduleFlow()">
      <i class="ti ti-calendar-repeat" aria-hidden="true"></i> Schedule
    </button>
    <div class="rab-sep" aria-hidden="true"></div>
    <button class="rab-btn" id="panel-fav-btn" onclick="toggleFavourite()">
      <span id="panel-fav-icon"><i class="ti ti-heart" aria-hidden="true"></i></span>
      <span id="panel-fav-title">Favourite</span>
    </button>
    `;

  hide('right-empty');
  show('actions-panel');
  show('report-action-bar');
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
    Email:         'Report sent to your registered email.',
    'Secure link': 'Secure link copied to clipboard.',
  };
  if (messages[action]) showToast(messages[action]);
}

// ── Schedule wizard ─────────────────────────────────────────────────
let scheduleState = { frequency: null, delivery: null, email: null };

function startScheduleFlow() {
  scheduleState = { frequency: null, delivery: null, email: null };
  appendBubble('ai',
    `Set up a recurring schedule for your <strong>${reportWizard.reportType || state.intent || 'report'}</strong>. How often should it be generated?`,
    `<div class="suggestion-chips" style="margin-top:10px">
      <div class="chip-group-label">Step 1 of 2 — Frequency</div>
      <div class="chips rw-chips">
        <span class="chip rw-chip" onclick="selectScheduleFrequency('Daily')">
          <i class="ti ti-calendar-day"></i> Daily
        </span>
        <span class="chip rw-chip" onclick="selectScheduleFrequency('Weekly')">
          <i class="ti ti-calendar-week"></i> Weekly
        </span>
        <span class="chip rw-chip" onclick="selectScheduleFrequency('Monthly')">
          <i class="ti ti-calendar-month"></i> Monthly
        </span>
        <span class="chip rw-chip" onclick="selectScheduleFrequency('Quarterly')">
          <i class="ti ti-calendar-stats"></i> Quarterly
        </span>
      </div>
    </div>`);
  scrollChat();
}

function selectScheduleFrequency(freq) {
  scheduleState.frequency = freq;
  appendBubble('user', freq);
  appendThinking();
  setTimeout(() => {
    removeThinking();
    appendBubble('ai',
      `<strong>${freq}</strong> — noted. Where should the report be delivered?`,
      `<div class="suggestion-chips" style="margin-top:10px">
        <div class="chip-group-label">Step 2 of 2 — Delivery</div>
        <div class="chips rw-chips">
          <span class="chip rw-chip" onclick="selectScheduleDelivery('email-self')">
            <i class="ti ti-mail"></i> Email me
          </span>
          <span class="chip rw-chip" onclick="selectScheduleDelivery('email-other')">
            <i class="ti ti-mail-forward"></i> Email someone else
          </span>
          <span class="chip rw-chip" onclick="selectScheduleDelivery('save')">
            <i class="ti ti-device-floppy"></i> Save to my account
          </span>
        </div>
      </div>`);
  }, 500);
}

function selectScheduleDelivery(delivery) {
  scheduleState.delivery = delivery;
  if (delivery === 'email-other') {
    appendBubble('user', 'Email someone else');
    appendBubble('ai', 'Enter the recipient\'s email address:', `
      <div class="sched-email-card" style="margin-top:8px">
        <div class="sched-email-row">
          <input type="email" id="sched-email-input" class="sched-email-input"
            placeholder="e.g. manager@company.com" autocomplete="email">
          <button class="chip" onclick="confirmScheduleEmail()">
            <i class="ti ti-check"></i> Confirm
          </button>
        </div>
      </div>`);
    setTimeout(() => document.getElementById('sched-email-input')?.focus(), 100);
  } else {
    const label = delivery === 'email-self' ? 'Email me' : 'Save to my account';
    appendBubble('user', label);
    confirmSchedule(delivery === 'email-self' ? 'sarika.bagwe@azentio.com' : null);
  }
}

function confirmScheduleEmail() {
  const input = document.getElementById('sched-email-input');
  const email = input?.value?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast('Please enter a valid email address.');
    return;
  }
  scheduleState.email = email;
  appendBubble('user', email);
  confirmSchedule(email);
}

function confirmSchedule(email) {
  scheduleState.email = email;
  appendThinking();
  setTimeout(() => {
    removeThinking();
    const reportType = reportWizard.reportType || capitalise(state.intent || 'report');
    const freq       = scheduleState.frequency;
    const deliveryLine = email
      ? `delivered to <strong>${email}</strong>`
      : `saved to your account`;
    const nextRun = scheduleNextRun(freq);

    appendBubble('ai', `
      <div class="sched-confirm-card">
        <div class="sched-confirm-icon"><i class="ti ti-calendar-check"></i></div>
        <div class="sched-confirm-body">
          <div class="sched-confirm-title">Schedule set!</div>
          <div class="sched-confirm-detail">
            Your <strong>${reportType}</strong> will be generated <strong>${freq.toLowerCase()}</strong>
            and ${deliveryLine}.
          </div>
          <div class="sched-confirm-next">
            <i class="ti ti-clock"></i> Next run: <strong>${nextRun}</strong>
          </div>
        </div>
      </div>
      <div style="margin-top:10px;font-size:11.5px;color:var(--color-text-muted)">
        Manage all schedules in <a href="settings.html" style="color:var(--color-accent)">Settings</a>.
      </div>`);

    // Update the Schedule button to show active state
    const btn = document.getElementById('btn-schedule');
    if (btn) {
      btn.classList.add('rab-btn-scheduled');
      btn.innerHTML = `<i class="ti ti-calendar-check" aria-hidden="true"></i> ${freq}`;
      btn.onclick = () => showToast(`Scheduled ${freq.toLowerCase()} — manage in Settings.`);
    }
  }, 700);
}

function scheduleNextRun(freq) {
  const now  = new Date();
  const next = new Date(now);
  if (freq === 'Daily')     next.setDate(now.getDate() + 1);
  else if (freq === 'Weekly') { next.setDate(now.getDate() + (7 - now.getDay() || 7)); }
  else if (freq === 'Monthly') { next.setMonth(now.getMonth() + 1); next.setDate(1); }
  else if (freq === 'Quarterly') { next.setMonth(now.getMonth() + 3); next.setDate(1); }
  return next.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Initialise on load
document.addEventListener('DOMContentLoaded', () => {
  updateFavCount();

  // Check if returning from custom-report-builder page
  if (handleCustomBuilderReturn()) return;

  // Check if returning from the fields configuration page
  const fieldsDone = localStorage.getItem('reportiq_tmpl_fields_done');
  if (fieldsDone === 'done' || fieldsDone === 'skipped') {
    localStorage.removeItem('reportiq_tmpl_fields_done');

    const draft = (() => {
      try { return JSON.parse(localStorage.getItem('reportiq_tmpl_draft')) || {}; }
      catch { return {}; }
    })();

    // Restore build state
    Object.assign(tmplBuildState, draft);
    // Bridge new fields array format to tmplFields key used by finishTemplateCreate
    if (draft.fields) tmplBuildState.tmplFields = draft.fields;
    appMode      = 'template-create';
    tmplBuildStep = TMPL_BUILD_STEPS.findIndex(s => s.key === 'tmplFields') + 1;
    showJourneyBar('template-create');

    // Reconstruct conversation so far
    appendBubble('ai', 'Hi Sarika 👋 Welcome to <strong>ReportIQ</strong>. How would you like to get started?');
    appendBubble('user', 'Create a template');
    if (draft.tmplName)   appendBubble('user', draft.tmplName);
    if (draft.tmplReport) appendBubble('user', draft.tmplReport);
    if (draft.tmplPeriod) appendBubble('user', draft.tmplPeriod);

    if (fieldsDone === 'done' && draft.fields && draft.fields.length) {
      const allItems  = draft.fields;
      const charts    = allItems.filter(f => f.type === 'chart');
      const fields    = allItems.filter(f => f.type !== 'chart');
      const nameSrc   = fields.length ? fields : charts;
      const names     = nameSrc.slice(0, 4).map(f => f.label).join(', ');
      const extraCount = allItems.length - 4;
      const extra      = extraCount > 0 ? ` +${extraCount} more` : '';
      const summaryParts = [];
      if (fields.length)  summaryParts.push(`${fields.length} field${fields.length !== 1 ? 's' : ''}`);
      if (charts.length)  summaryParts.push(`${charts.length} chart${charts.length !== 1 ? 's' : ''}`);
      appendBubble('user', `${summaryParts.join(', ')} configured: ${names}${extra}`);

      // AI confirmation with option to review
      appendBubble('ai',
        `Got it — <strong>${summaryParts.join(' and ')}</strong> saved for this template.`, `
        <div class="suggestion-chips" style="margin-top:10px">
          <div class="chips">
            <span class="chip" role="button" tabindex="0" onclick="reopenFieldsPage()">
              <i class="ti ti-edit"></i> Review / edit fields
            </span>
            <span class="chip" role="button" tabindex="0" onclick="continueAfterFields()">
              <i class="ti ti-arrow-right"></i> Continue
            </span>
          </div>
        </div>`);
    } else {
      appendBubble('user', 'Skipped field configuration');
      appendBubble('ai', 'No problem — fields left flexible. You can always add them later.', `
        <div class="suggestion-chips" style="margin-top:10px">
          <div class="chips">
            <span class="chip" role="button" tabindex="0" onclick="reopenFieldsPage()">
              <i class="ti ti-forms"></i> Configure fields
            </span>
            <span class="chip" role="button" tabindex="0" onclick="continueAfterFields()">
              <i class="ti ti-arrow-right"></i> Continue anyway
            </span>
          </div>
        </div>`);
    }

    // Don't auto-advance — wait for user to click Continue or Review
    return;
  }

  showWelcome();
});

function refinePrompt(text) {
  const input = $('chat-input');
  input.value = text;
  autoResize(input);
  input.focus();
}

// ── Filter Transactions Drawer ─────────────────────────────────────

let activeFilters = null; // null = no filters applied

function openFilterDrawer() {
  document.getElementById('filter-backdrop').classList.remove('hidden');
  document.getElementById('filter-drawer').classList.add('open');
}

function closeFilterDrawer() {
  document.getElementById('filter-backdrop').classList.add('hidden');
  document.getElementById('filter-drawer').classList.remove('open');
}

function selectType(btn) {
  document.querySelectorAll('.filter-type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

function toggleAllCats(btn) {
  const boxes = document.querySelectorAll('#filter-cat-grid input[type="checkbox"]');
  const anyChecked = [...boxes].some(b => b.checked);
  boxes.forEach(b => b.checked = !anyChecked);
  btn.innerHTML = anyChecked
    ? '<i class="ti ti-square-plus"></i> Select all'
    : '<i class="ti ti-square-minus"></i> Deselect all';
}

function applyFilters() {
  const type = document.querySelector('.filter-type-btn.active')?.dataset.type || 'all';
  const checkedCats = [...document.querySelectorAll('#filter-cat-grid input:checked')].map(b => b.value);
  const minAmt = parseFloat(document.getElementById('filter-min').value) || 0;
  const maxAmt = parseFloat(document.getElementById('filter-max').value) || Infinity;

  activeFilters = { type, cats: checkedCats, minAmt, maxAmt };
  closeFilterDrawer();
  reRenderTransactions();
}

function clearFilters() {
  // Reset drawer controls
  document.querySelectorAll('.filter-type-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.filter-type-btn[data-type="all"]').classList.add('active');
  document.querySelectorAll('#filter-cat-grid input[type="checkbox"]').forEach(b => b.checked = true);
  document.getElementById('filter-cat-toggle').innerHTML = '<i class="ti ti-square-minus"></i> Deselect all';
  document.getElementById('filter-min').value = '';
  document.getElementById('filter-max').value = '';

  activeFilters = null;
  closeFilterDrawer();
  reRenderTransactions();
}

function reRenderTransactions() {
  const tbody    = document.querySelector('#report-output .tx-table tbody');
  const countEl  = document.querySelector('#report-output .section-label');
  const activeBar = document.getElementById('filter-active-bar');

  if (!tbody) return;

  let tx = generateTransactions();

  // Apply filters
  if (activeFilters) {
    const { type, cats, minAmt, maxAmt } = activeFilters;
    if (type !== 'all')   tx = tx.filter(t => t.type === type);
    if (cats.length)      tx = tx.filter(t => cats.includes(t.category));
    tx = tx.filter(t => t.amount >= minAmt && t.amount <= maxAmt);
  }

  const fmt = n => n.toLocaleString('en-IN', { minimumFractionDigits: 2 });

  // Re-render rows
  tbody.innerHTML = tx.map(t => `
    <tr>
      <td class="tx-date">${t.date}</td>
      <td><div class="tx-desc">${t.desc}</div><div class="tx-ref">${t.ref}</div></td>
      <td><span class="tx-category ${t.catClass}">${t.category}</span></td>
      <td class="${t.type === 'CR' ? 'tx-amount-credit' : 'tx-amount-debit'}">
        ${t.type === 'CR' ? '+' : '−'} ₹${fmt(t.amount)}
      </td>
    </tr>`).join('') || `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--color-text-muted)">No transactions match the selected filters.</td></tr>`;

  // Update count label
  if (countEl) countEl.textContent = `Transactions (${tx.length})`;

  // Show/hide active filter bar
  if (!activeBar) {
    buildFilterActiveBar(tx);
  } else {
    activeBar.remove();
    if (activeFilters) buildFilterActiveBar(tx);
  }
}

function buildFilterActiveBar(tx) {
  if (!activeFilters) return;
  const { type, cats, minAmt, maxAmt } = activeFilters;
  const all = generateTransactions();
  const chips = [];

  if (type !== 'all') chips.push(type === 'CR' ? 'Credits only' : 'Debits only');
  if (cats.length < 8) chips.push(`${cats.length} categor${cats.length === 1 ? 'y' : 'ies'}`);
  if (minAmt > 0)         chips.push(`Min ₹${minAmt.toLocaleString('en-IN')}`);
  if (maxAmt < Infinity)  chips.push(`Max ₹${maxAmt.toLocaleString('en-IN')}`);

  const bar = document.createElement('div');
  bar.className = 'filter-active-bar';
  bar.id = 'filter-active-bar';
  bar.innerHTML = `
    <span class="filter-active-bar-label"><i class="ti ti-filter"></i> Filtered</span>
    ${chips.map(c => `<span class="filter-active-chip">${c}</span>`).join('')}
    <span class="filter-active-bar-label" style="margin-left:4px">${tx.length} of ${all.length} transactions</span>
    <button class="filter-active-clear" onclick="clearFilters()">Clear</button>`;

  const tableWrap = document.querySelector('#report-output .transactions-table-wrap');
  if (tableWrap) tableWrap.parentNode.insertBefore(bar, tableWrap);
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

function loadCustomTemplates() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_TMPL_KEY) || '[]'); }
  catch { return []; }
}

function removeCustomTemplate(id) {
  const updated = loadCustomTemplates().filter(t => t.id !== id);
  localStorage.setItem(CUSTOM_TMPL_KEY, JSON.stringify(updated));
  // Also remove from favourites if saved there
  saveFavourites(loadFavourites().filter(f => f.tmplId !== id));
  updateFavCount();
  showToast('🗑 Template deleted.');
  filterTemplates(document.getElementById('tmpl-search').value);
}

function allTemplates() {
  const custom = loadCustomTemplates().map(t => ({
    ...t,
    badge: 'custom',
    badgeLabel: 'Custom',
    category: t.intent || 'account statement'
  }));
  return [...custom, ...TEMPLATES];
}

function openTemplates() {
  tmplFilterActive = 'all';
  document.querySelectorAll('#tmpl-overlay .fav-filter-chip').forEach((c, i) => {
    c.classList.toggle('active', i === 0);
  });
  document.getElementById('tmpl-search').value = '';
  renderTmplGrid(allTemplates());
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
  let list = allTemplates();
  if (tmplFilterActive !== 'all') list = list.filter(t => t.category === tmplFilterActive);
  if (query.trim()) {
    const q = query.toLowerCase();
    list = list.filter(t =>
      t.name.toLowerCase().includes(q) ||
      (t.desc || '').toLowerCase().includes(q) ||
      (t.accountType || '').toLowerCase().includes(q)
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

    const deleteBtn = t.custom
      ? `<button class="fav-card-remove" onclick="removeCustomTemplate('${t.id}')"
                 title="Delete template" aria-label="Delete custom template">
           <i class="ti ti-trash" aria-hidden="true"></i>
         </button>`
      : '';

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
          ${deleteBtn}
        </div>
        <p class="tmpl-card-desc">${t.desc}</p>
        <div class="tmpl-tags">
          <span class="fav-card-tag period">${t.period}</span>
          <span class="fav-card-tag" style="display:flex;align-items:center;gap:4px">${formatIcon} ${t.format}</span>
        </div>
        <div class="fav-card-footer" style="border-top:1px solid var(--color-border);padding-top:10px;display:flex;gap:8px">
          <button class="tmpl-use-btn" style="flex:1" onclick="applyTemplate('${t.id}')">
            <i class="ti ti-player-play" aria-hidden="true"></i> Use this template
          </button>
          <button class="tmpl-fav-btn ${isTmplFavourited(t.id) ? 'saved' : ''}"
                  id="tmpl-fav-${t.id}"
                  onclick="toggleTmplFavourite('${t.id}')"
                  title="${isTmplFavourited(t.id) ? 'Saved to favourites' : 'Add to favourites'}"
                  aria-label="Add to favourites">
            <i class="ti ti-heart" aria-hidden="true"></i>
          </button>
        </div>
      </article>`;
  }).join('');
}

function applyTemplate(id) {
  const tmpl = allTemplates().find(t => t.id === id);
  if (!tmpl) return;

  closeTemplates();
  appMode = 'report';

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
  $('actions-panel').innerHTML = ''; hide('actions-panel'); show('right-empty');
  $('rab-meta').innerHTML = '';
  hide('report-action-bar');

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
  const meta    = TYPE_META[state.intent] || TYPE_META['account statement'];
  const pLabel  = periodLabel(state.period || 'Last 3 months');
  const account = state.accountType || 'Savings account';

  // Already saved — don't remove; just inform and open favourites
  if (isFavourited(id)) {
    showToast('Already in favourites — open Favourites to manage.');
    openFavourites();
    return;
  }

  // Add to favourites
  addFavourite({
    id,
    type:    'report',
    intent:  state.intent,
    account,
    period:  pLabel,
    format:  state.format,
    savedOn: new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }),
    savedTs: Date.now()
  });
  showToast('❤ Saved to favourites');

  // Update report-header heart button
  const heartBtn = document.getElementById('report-fav-btn');
  if (heartBtn) {
    heartBtn.classList.add('saved');
    heartBtn.setAttribute('aria-pressed', 'true');
    heartBtn.setAttribute('aria-label', 'Already in favourites');
    heartBtn.querySelector('span').textContent = 'Saved';
  }

  // Update right-panel button
  const panelIcon  = document.getElementById('panel-fav-icon');
  const panelTitle = document.getElementById('panel-fav-title');
  const panelSub   = document.getElementById('panel-fav-sub');
  if (panelIcon)  panelIcon.innerHTML = '<i class="ti ti-heart-filled" aria-hidden="true" style="color:#E11D48"></i>';
  if (panelTitle) panelTitle.textContent = 'Saved to favourites';
  if (panelSub)   panelSub.textContent   = 'View in Favourites page';
}

// ── Template favourites ────────────────────────────────────────────
function isTmplFavourited(tmplId) {
  return loadFavourites().some(f => f.id === 'tmpl-' + tmplId);
}

function toggleTmplFavourite(tmplId) {
  const favId = 'tmpl-' + tmplId;
  if (isTmplFavourited(tmplId)) {
    showToast('Already in favourites — open Favourites to manage.');
    openFavourites();
    return;
  }
  const tmpl = allTemplates().find(t => t.id === tmplId);
  if (!tmpl) return;

  addFavourite({
    id:          favId,
    type:        'template',
    tmplId:      tmplId,
    name:        tmpl.name,
    intent:      tmpl.intent,
    account:     tmpl.accountType || tmpl.account || 'All accounts',
    period:      tmpl.period,
    format:      tmpl.format,
    fieldCount:  Array.isArray(tmpl.fields) ? tmpl.fields.filter(f => f.type !== 'chart').length : 0,
    chartCount:  Array.isArray(tmpl.fields) ? tmpl.fields.filter(f => f.type === 'chart').length : 0,
    savedOn:     new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }),
    savedTs:     Date.now()
  });

  // Update the heart button in the template card
  const btn = document.getElementById('tmpl-fav-' + tmplId);
  if (btn) {
    btn.classList.add('saved');
    btn.title = 'Saved to favourites';
  }
  showToast('❤ Template saved to favourites');
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

// Maps filter chip value → intent category (cls in TYPE_META)
const FILTER_TO_CLS = {
  statement:   'statement',
  transaction: 'transaction',
  balance:     'balance',
  spending:    'spending',
  tax:         'tax',
};

function filterFavourites(query) {
  let list = loadFavourites();

  if (favFilterActive === 'reports') {
    list = list.filter(f => f.type !== 'template');
  } else if (favFilterActive === 'templates') {
    list = list.filter(f => f.type === 'template');
  } else if (favFilterActive !== 'all') {
    const targetCls = FILTER_TO_CLS[favFilterActive];
    list = list.filter(f => {
      if (f.type === 'template') return false;
      const meta = TYPE_META[f.intent];
      return meta && meta.cls === targetCls;
    });
  }

  if (query.trim()) {
    const q = query.toLowerCase();
    list = list.filter(f => {
      const label = f.type === 'template' ? f.name : ((TYPE_META[f.intent] || {}).label || f.intent);
      return label.toLowerCase().includes(q) ||
             (f.account || '').toLowerCase().includes(q) ||
             (f.period  || '').toLowerCase().includes(q);
    });
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
    // ── Template card ────────────────────────────────────────────
    if (f.type === 'template') {
      const formatIcon = f.format === 'Excel'
        ? '<i class="ti ti-file-type-xls" aria-hidden="true"></i>'
        : '<i class="ti ti-file-type-pdf" aria-hidden="true"></i>';
      const fieldTag = f.fieldCount
        ? `<span class="fav-card-tag fav-tag-fields"><i class="ti ti-forms" aria-hidden="true"></i> ${f.fieldCount} field${f.fieldCount !== 1 ? 's' : ''}</span>`
        : '';
      const chartTag = f.chartCount
        ? `<span class="fav-card-tag" style="background:#FEF3C7;color:#92400E"><i class="ti ti-chart-bar" aria-hidden="true"></i> ${f.chartCount} chart${f.chartCount !== 1 ? 's' : ''}</span>`
        : '';
      return `
        <article class="fav-card" aria-label="Template – ${f.name}">
          <div class="fav-card-top">
            <div class="fav-card-type-icon tmpl-type">
              <i class="ti ti-template" aria-hidden="true"></i>
            </div>
            <div class="fav-card-info">
              <div class="fav-card-name">${f.name}</div>
              <div class="fav-card-meta">${f.account} · ${f.period}</div>
            </div>
            <span class="tmpl-badge custom" style="flex-shrink:0;align-self:flex-start">Template</span>
            <button class="fav-card-remove" onclick="removeFavCard('${f.id}')" aria-label="Remove ${f.name} from favourites" title="Remove from favourites">
              <i class="ti ti-trash" aria-hidden="true"></i>
            </button>
          </div>
          <div class="fav-card-tags">
            <span class="fav-card-tag period">${f.period}</span>
            <span class="fav-card-tag" style="display:flex;align-items:center;gap:4px">${formatIcon} ${f.format}</span>
            ${fieldTag}${chartTag}
          </div>
          <div class="fav-card-saved-on">
            <i class="ti ti-clock" aria-hidden="true" style="font-size:11px"></i>
            Saved ${f.savedOn}
          </div>
          <div class="fav-card-footer">
            <button class="tmpl-use-btn" onclick="useFavTemplate('${f.tmplId}')">
              <i class="ti ti-player-play" aria-hidden="true"></i> Use template
            </button>
          </div>
        </article>`;
    }

    // ── Report card ──────────────────────────────────────────────
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
          <span class="tmpl-badge popular" style="flex-shrink:0;align-self:flex-start">Report</span>
          <button class="fav-card-remove" onclick="removeFavCard('${f.id}')" aria-label="Remove ${meta.label} from favourites" title="Remove from favourites">
            <i class="ti ti-trash" aria-hidden="true"></i>
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

function useFavTemplate(tmplId) {
  closeFavourites();
  applyTemplate(tmplId);
}

function downloadFavReport(id) {
  showToast('⬇ Downloading saved report…');
}

function shareFavReport(id) {
  showToast('🔗 Secure link copied to clipboard.');
}

// ── Reset ──────────────────────────────────────────────────────────
function resetWorkspace() {
  // Reset state
  Object.assign(state, { step: 0, intent: null, period: null, accountType: null, format: 'PDF', reportGenerated: false, currentReportId: null });
  appMode        = 'welcome';
  tmplBuildStep  = 0;
  tmplBuildState = {};
  reportWizard   = { reportType: null, period: null, account: null };

  // Clear chat and panels
  $('chat-messages').innerHTML = '';
  hide('chat-badge');
  hide('report-output'); show('canvas-empty'); hide('report-badge');
  $('actions-panel').innerHTML = ''; hide('actions-panel'); show('right-empty');
  $('rab-meta').innerHTML = '';
  hide('report-action-bar');
  hide('browse-tmpl-bar');
  hide('filter-backdrop'); hide('filter-drawer');

  // Hide journey bar and show welcome prompt
  hideJourneyBar();
  showWelcome();
}

// ── Avatar dropdown ────────────────────────────────────────────────
function toggleAvatarMenu() {
  const menu = document.getElementById('avatar-menu');
  const btn  = document.getElementById('avatar-btn');
  const isOpen = !menu.classList.contains('hidden');
  if (isOpen) {
    menu.classList.add('hidden');
    btn.setAttribute('aria-expanded', 'false');
  } else {
    menu.classList.remove('hidden');
    btn.setAttribute('aria-expanded', 'true');
  }
}

// Close avatar menu when clicking outside
document.addEventListener('click', function(e) {
  const wrap = document.getElementById('avatar-wrap');
  if (wrap && !wrap.contains(e.target)) {
    const menu = document.getElementById('avatar-menu');
    const btn  = document.getElementById('avatar-btn');
    if (menu) menu.classList.add('hidden');
    if (btn)  btn.setAttribute('aria-expanded', 'false');
  }
});

function openHelp() {
  showToast('ℹ Help & Support coming soon.');
}

function openWhatsNew() {
  showToast('✨ You\'re on ReportIQ v1.0 — the latest version!');
}

function handleLogout() {
  showToast('👋 Logging out…');
  setTimeout(() => { window.location.href = 'index.html'; }, 900);
}

// ── Feedback ───────────────────────────────────────────────────────

const FB_KEY = 'reportiq_feedback';
let fbRating  = 0;
let fbCat     = '';

function loadFeedback() {
  try { return JSON.parse(localStorage.getItem(FB_KEY)) || []; }
  catch { return []; }
}
function saveFeedbackList(list) {
  localStorage.setItem(FB_KEY, JSON.stringify(list));
}

function updateFbInboxCount() {
  const count = loadFeedback().length;
  const el = document.getElementById('fb-inbox-count');
  if (el) el.textContent = count;
}

function openFeedback() {
  // Reset form
  fbRating = 0; fbCat = '';
  document.querySelectorAll('.fb-star').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.fb-cat-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('fb-rating-label').textContent = 'Tap to rate';
  document.getElementById('fb-comment').value = '';
  document.getElementById('fb-name').value = '';
  document.getElementById('fb-char-used').textContent = '0';
  document.getElementById('fb-error').classList.add('hidden');

  document.getElementById('fb-backdrop').classList.remove('hidden');
  document.getElementById('fb-modal').classList.remove('hidden');
  updateFbInboxCount();
}

function closeFeedback() {
  document.getElementById('fb-backdrop').classList.add('hidden');
  document.getElementById('fb-modal').classList.add('hidden');
}

function setRating(val) {
  fbRating = val;
  const labels = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];
  document.getElementById('fb-rating-label').textContent = labels[val] + ' — ' + val + ' / 5';
  document.querySelectorAll('.fb-star').forEach(s => {
    s.classList.toggle('active', parseInt(s.dataset.val) <= val);
  });
}

function selectFbCat(btn) {
  document.querySelectorAll('.fb-cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  fbCat = btn.dataset.cat;
}

// Character counter + foolproof input init
document.addEventListener('DOMContentLoaded', () => {
  const ta = document.getElementById('fb-comment');
  if (ta) ta.addEventListener('input', () => {
    document.getElementById('fb-char-used').textContent = ta.value.length;
  });
  updateFbInboxCount();

  // Start rotating placeholder
  startRotatingPlaceholder();

  // Close typeahead when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#typeahead-dropdown') && !e.target.closest('#chat-input')) {
      closeTypeahead();
    }
  });

  // Keyboard navigation for typeahead
  $('chat-input')?.addEventListener('keydown', (e) => {
    const dd = $('typeahead-dropdown');
    if (!dd || dd.classList.contains('hidden')) return;
    const items = Array.from(dd.querySelectorAll('.typeahead-item'));
    if (!items.length) return;
    const active = dd.querySelector('.typeahead-item.active');
    const idx = active ? items.indexOf(active) : -1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items.forEach(x => x.classList.remove('active'));
      items[Math.min(idx + 1, items.length - 1)].classList.add('active');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items.forEach(x => x.classList.remove('active'));
      if (idx > 0) items[idx - 1].classList.add('active');
    } else if (e.key === 'Enter' && active) {
      e.preventDefault();
      active.click();
    }
  });
});

function submitFeedback() {
  const errEl = document.getElementById('fb-error');
  if (!fbRating || !fbCat) {
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');

  const entry = {
    id:       Date.now(),
    rating:   fbRating,
    cat:      fbCat,
    comment:  document.getElementById('fb-comment').value.trim(),
    name:     document.getElementById('fb-name').value.trim() || 'Anonymous',
    submittedAt: new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
                 + ', ' + new Date().toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' }),
  };

  const list = loadFeedback();
  list.unshift(entry);
  saveFeedbackList(list);
  updateFbInboxCount();
  closeFeedback();
  showToast('✅ Thank you! Your feedback has been recorded.');
}

// ── Feedback Inbox ─────────────────────────────────────────────────

function openFeedbackInbox() {
  closeFeedback();
  renderFbInbox();
  document.getElementById('fb-backdrop').classList.remove('hidden');
  document.getElementById('fb-inbox-modal').classList.remove('hidden');
}

function closeFeedbackInbox() {
  document.getElementById('fb-backdrop').classList.add('hidden');
  document.getElementById('fb-inbox-modal').classList.add('hidden');
}

function clearAllFeedback() {
  if (!confirm('Delete all feedback entries? This cannot be undone.')) return;
  localStorage.removeItem(FB_KEY);
  updateFbInboxCount();
  renderFbInbox();
  showToast('All feedback cleared.');
}

function renderFbInbox() {
  const list = loadFeedback();
  const body = document.getElementById('fb-inbox-body');
  if (!list.length) {
    body.innerHTML = `<div class="fb-inbox-empty"><i class="ti ti-inbox"></i>No feedback yet.<br>Be the first to share your thoughts!</div>`;
    return;
  }
  body.innerHTML = list.map(f => {
    const stars = Array.from({length: 5}, (_, i) =>
      `<i class="ti ti-star${i < f.rating ? '-filled' : ''}"></i>`).join('');
    return `
      <div class="fb-inbox-card">
        <div class="fb-inbox-card-top">
          <div class="fb-inbox-stars">${stars}</div>
          <span class="fb-inbox-cat">${f.cat}</span>
          <div class="fb-inbox-meta">${f.submittedAt}</div>
        </div>
        ${f.comment ? `<div class="fb-inbox-comment">"${escHtml(f.comment)}"</div>` : ''}
        <div class="fb-inbox-name"><i class="ti ti-user" style="font-size:11px"></i> ${escHtml(f.name)}</div>
      </div>`;
  }).join('');
}
