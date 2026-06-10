'use strict';

/* ================================================================
   ReportIQ – template-fields.js
   Dedicated field-configuration page for template builder
   ================================================================ */

const DRAFT_KEY       = 'reportiq_tmpl_draft';
const FIELDS_DONE_KEY = 'reportiq_tmpl_fields_done';

// ── Chart constants ───────────────────────────────────────────────
const CHART_DATA_SOURCES = [
  { value: 'category-spend',     label: 'Spending by category' },
  { value: 'debit-credit-split', label: 'Debit vs credit split' },
  { value: 'balance-trend',      label: 'Balance over time' },
  { value: 'monthly-totals',     label: 'Monthly totals' },
  { value: 'top-merchants',      label: 'Top merchants' },
  { value: 'transaction-count',  label: 'Transaction count by type' },
  { value: 'income-expense',     label: 'Income vs expense' },
];

const CHART_POSITIONS = [
  { value: 'top',                label: 'Top of report' },
  { value: 'after-summary',      label: 'After summary cards' },
  { value: 'after-transactions', label: 'After transaction table' },
  { value: 'footer',             label: 'Report footer' },
];

const CHART_COLOR_SCHEMES = [
  { value: 'default',    label: 'Azentio green (default)' },
  { value: 'blue',       label: 'Blue' },
  { value: 'purple',     label: 'Purple' },
  { value: 'amber',      label: 'Amber / orange' },
  { value: 'monochrome', label: 'Monochrome' },
];

const CHART_DEFAULT_SOURCE = {
  'bar':            'category-spend',
  'pie':            'category-spend',
  'line':           'balance-trend',
  'donut':          'debit-credit-split',
  'area':           'monthly-totals',
  'horizontal-bar': 'top-merchants',
};

// ── Field Catalog ─────────────────────────────────────────────────
const FIELD_CATALOG = [
  {
    section: 'Charts & Visuals',
    icon: 'ti-chart-bar',
    fields: [
      { id: 'chartBar',   label: 'Bar chart',          type: 'chart', chartType: 'bar',            desc: 'Spending by category' },
      { id: 'chartPie',   label: 'Pie chart',           type: 'chart', chartType: 'pie',            desc: 'Category breakdown' },
      { id: 'chartLine',  label: 'Line / trend chart',  type: 'chart', chartType: 'line',           desc: 'Balance over time' },
      { id: 'chartDonut', label: 'Donut chart',         type: 'chart', chartType: 'donut',          desc: 'Debit vs credit split' },
      { id: 'chartArea',  label: 'Area chart',          type: 'chart', chartType: 'area',           desc: 'Monthly totals trend' },
      { id: 'chartHBar',  label: 'Top merchants chart', type: 'chart', chartType: 'horizontal-bar', desc: 'Top merchant breakdown' },
    ]
  },
  {
    section: 'Date & Time',
    icon: 'ti-calendar',
    fields: [
      { id: 'startDate',     label: 'Start date',           type: 'date',        defaultVal: '' },
      { id: 'endDate',       label: 'End date',             type: 'date',        defaultVal: '' },
      { id: 'asOfDate',      label: 'As-of date',           type: 'date',        defaultVal: '' },
      { id: 'valueDateFrom', label: 'Value date (from)',     type: 'date',        defaultVal: '' },
      { id: 'valueDateTo',   label: 'Value date (to)',       type: 'date',        defaultVal: '' },
      { id: 'cutoffDate',    label: 'Cut-off date',          type: 'date',        defaultVal: '' },
      { id: 'postingDate',   label: 'Posting date',          type: 'date',        defaultVal: '' },
    ]
  },
  {
    section: 'Amount & Currency',
    icon: 'ti-currency-rupee',
    fields: [
      { id: 'minAmount',     label: 'Min amount',            type: 'number',      defaultVal: '', placeholder: 'e.g. 500' },
      { id: 'maxAmount',     label: 'Max amount',            type: 'number',      defaultVal: '', placeholder: 'e.g. 50000' },
      { id: 'exactAmount',   label: 'Exact amount',          type: 'number',      defaultVal: '', placeholder: 'e.g. 10000' },
      { id: 'currency',      label: 'Currency',              type: 'select',      defaultVal: 'INR', options: ['INR','USD','EUR','GBP','AED','SGD','JPY','CHF'] },
      { id: 'exchangeRate',  label: 'Exchange rate',         type: 'number',      defaultVal: '', placeholder: 'e.g. 83.5' },
      { id: 'totalCredit',   label: 'Total credit threshold',type: 'number',      defaultVal: '', placeholder: 'Min total credits' },
      { id: 'totalDebit',    label: 'Total debit threshold', type: 'number',      defaultVal: '', placeholder: 'Min total debits' },
    ]
  },
  {
    section: 'Transaction',
    icon: 'ti-arrows-exchange',
    fields: [
      { id: 'txnType',       label: 'Transaction type',      type: 'select',      defaultVal: 'All',       options: ['All','Debit only','Credit only'] },
      { id: 'txnMode',       label: 'Transaction mode',      type: 'select',      defaultVal: 'All',       options: ['All','NEFT','RTGS','IMPS','UPI','Cheque','Cash','Card','Online'] },
      { id: 'txnStatus',     label: 'Transaction status',    type: 'select',      defaultVal: 'All',       options: ['All','Cleared','Pending','Reversed','Failed','On hold'] },
      { id: 'txnCount',      label: 'Max transactions',      type: 'number',      defaultVal: '', placeholder: 'e.g. 100' },
      { id: 'narration',     label: 'Narration / description',type: 'text',       defaultVal: '', placeholder: 'Filter by narration text' },
      { id: 'referenceNo',   label: 'Reference number',      type: 'text',        defaultVal: '', placeholder: 'e.g. TXN12345' },
      { id: 'chequeRange',   label: 'Cheque number range',   type: 'text',        defaultVal: '', placeholder: 'e.g. 001–050' },
      { id: 'utrNo',         label: 'UTR number',            type: 'text',        defaultVal: '', placeholder: 'e.g. HDFC2024001' },
      { id: 'excludeInternal',label: 'Exclude internal transfers', type: 'toggle', defaultVal: false },
      { id: 'includePending',label: 'Include pending',       type: 'toggle',      defaultVal: true },
      { id: 'includeReversed',label: 'Include reversed',     type: 'toggle',      defaultVal: false },
    ]
  },
  {
    section: 'Account',
    icon: 'ti-building-bank',
    fields: [
      { id: 'accountNo',     label: 'Account number',        type: 'text',        defaultVal: '', placeholder: 'e.g. 1234567890' },
      { id: 'accountType',   label: 'Account type',          type: 'select',      defaultVal: 'All', options: ['All','Savings','Current','Credit card','Loan','Fixed deposit','NRI','OD'] },
      { id: 'branchCode',    label: 'Branch code',           type: 'text',        defaultVal: '', placeholder: 'e.g. MUM001' },
      { id: 'ifscCode',      label: 'IFSC code',             type: 'text',        defaultVal: '', placeholder: 'e.g. HDFC0001234' },
      { id: 'micrCode',      label: 'MICR code',             type: 'text',        defaultVal: '' },
      { id: 'customerId',    label: 'Customer ID',           type: 'text',        defaultVal: '', placeholder: 'e.g. CUS98765' },
      { id: 'entityName',    label: 'Entity / customer name',type: 'text',        defaultVal: '' },
      { id: 'cifNo',         label: 'CIF number',            type: 'text',        defaultVal: '' },
      { id: 'jointHolder',   label: 'Include joint holders', type: 'toggle',      defaultVal: false },
    ]
  },
  {
    section: 'Category & Tags',
    icon: 'ti-tag',
    fields: [
      { id: 'category',      label: 'Category',              type: 'multiselect', defaultVal: [], options: ['Food & dining','Travel','Shopping','Utilities','Healthcare','Entertainment','Salary','EMI','Insurance','Investments','Tax','Other'] },
      { id: 'tags',          label: 'Tags',                  type: 'text',        defaultVal: '', placeholder: 'Comma-separated tags' },
      { id: 'merchant',      label: 'Merchant name',         type: 'text',        defaultVal: '', placeholder: 'e.g. Amazon, Swiggy' },
      { id: 'costCentre',    label: 'Cost centre',           type: 'text',        defaultVal: '' },
      { id: 'projectCode',   label: 'Project code',          type: 'text',        defaultVal: '' },
      { id: 'gstIn',         label: 'GSTIN',                 type: 'text',        defaultVal: '' },
      { id: 'pan',           label: 'PAN',                   type: 'text',        defaultVal: '' },
    ]
  },
  {
    section: 'Output & Format',
    icon: 'ti-settings-2',
    fields: [
      { id: 'reportLanguage',label: 'Report language',       type: 'select',      defaultVal: 'English', options: ['English','Hindi','Tamil','Telugu','Marathi','Gujarati','Bengali','Kannada'] },
      { id: 'dateFormat',    label: 'Date format',           type: 'select',      defaultVal: 'DD/MM/YYYY', options: ['DD/MM/YYYY','MM/DD/YYYY','YYYY-MM-DD','DD-MMM-YYYY','DD.MM.YYYY'] },
      { id: 'numberFormat',  label: 'Number format',         type: 'select',      defaultVal: 'Indian (1,00,000)', options: ['Indian (1,00,000)','International (100,000)','Plain (100000)'] },
      { id: 'pageSize',      label: 'Page size',             type: 'select',      defaultVal: 'A4', options: ['A4','A3','Letter','Legal'] },
      { id: 'pageOrientation',label: 'Page orientation',     type: 'select',      defaultVal: 'Portrait', options: ['Portrait','Landscape'] },
      { id: 'includeCharts', label: 'Include charts',        type: 'toggle',      defaultVal: true },
      { id: 'includeSummary',label: 'Include summary table', type: 'toggle',      defaultVal: true },
      { id: 'includeSignature',label: 'Include digital signature', type: 'toggle', defaultVal: false },
      { id: 'watermark',     label: 'Watermark text',        type: 'text',        defaultVal: '', placeholder: 'e.g. CONFIDENTIAL' },
      { id: 'reportTitle',   label: 'Custom report title',   type: 'text',        defaultVal: '', placeholder: 'Overrides default title' },
      { id: 'footerNote',    label: 'Footer note',           type: 'text',        defaultVal: '', placeholder: 'Appears at bottom of every page' },
    ]
  },
  {
    section: 'Compliance & Audit',
    icon: 'ti-shield-check',
    fields: [
      { id: 'auditTrail',    label: 'Include audit trail',   type: 'toggle',      defaultVal: false },
      { id: 'preparedBy',    label: 'Prepared by',           type: 'text',        defaultVal: '', placeholder: 'Name or employee ID' },
      { id: 'approvedBy',    label: 'Approved by',           type: 'text',        defaultVal: '' },
      { id: 'complianceRef', label: 'Compliance reference',  type: 'text',        defaultVal: '' },
      { id: 'cbsSource',     label: 'CBS source system',     type: 'select',      defaultVal: 'Auto-detect', options: ['Auto-detect','Finacle','Temenos','Oracle FLEXCUBE','FIS Profile','Silverlake'] },
      { id: 'reportVersion', label: 'Report version tag',    type: 'text',        defaultVal: '', placeholder: 'e.g. v2.1' },
    ]
  },
];

// ── State ─────────────────────────────────────────────────────────
let activeFields    = [];
let selectedIdx     = null;
let dragSrcIdx      = null;

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const draft = loadDraft();
  // Show report type as the "template name" in topbar since name comes at end now
  const topbarLabel = draft.tmplName || draft.tmplReport || 'New template';
  document.getElementById('tmpl-name-display').textContent = topbarLabel;

  if (draft.fields && Array.isArray(draft.fields)) {
    activeFields = draft.fields;
  }

  // Pre-select account + format from draft if previously set
  if (draft.tmplAccount) {
    document.querySelectorAll('.tf-stag[data-field="account"]').forEach(t => {
      t.classList.toggle('active', t.dataset.val === draft.tmplAccount);
    });
  }
  if (draft.tmplFormat) {
    document.querySelectorAll('.tf-stag[data-field="format"]').forEach(t => {
      t.classList.toggle('active', t.dataset.val === draft.tmplFormat);
    });
  }

  renderCatalog();
  renderActiveFields();
  updateFieldCount();
});

function loadDraft() {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || {}; }
  catch { return {}; }
}

// ── Catalog ───────────────────────────────────────────────────────
function renderCatalog(query = '') {
  const container = document.getElementById('catalog-sections');
  const q = query.toLowerCase().trim();

  const html = FIELD_CATALOG.map(section => {
    const fields = q
      ? section.fields.filter(f => f.label.toLowerCase().includes(q) || f.id.toLowerCase().includes(q))
      : section.fields;
    if (!fields.length) return '';

    return `
      <div class="tf-cat-section" data-section="${escAttr(section.section)}">
        <button class="tf-cat-section-hdr" onclick="toggleSection(this)" aria-expanded="true">
          <i class="ti ${section.icon} tf-cat-icon" aria-hidden="true"></i>
          <span class="tf-cat-section-name">${section.section}</span>
          <span class="tf-cat-count">${fields.length}</span>
          <i class="ti ti-chevron-down tf-cat-chevron" aria-hidden="true"></i>
        </button>
        <div class="tf-cat-fields">
          ${fields.map(f => renderCatalogField(f)).join('')}
        </div>
      </div>`;
  }).join('');

  container.innerHTML = html || '<div class="tf-cat-no-results">No fields match your search</div>';
}

function renderCatalogField(f) {
  const isChart = f.type === 'chart';
  // charts can be added multiple times; fields can only be added once
  const isAdded = !isChart && activeFields.some(a => a.catalogId === f.id);
  const subtitle = isChart ? (f.desc || 'chart') : f.type;
  return `
    <div class="tf-cat-field ${isAdded ? 'is-added' : ''} ${isChart ? 'tf-cat-chart' : ''}"
         onclick="${isAdded ? 'void(0)' : `addField('${f.id}')`}"
         role="${isAdded ? 'presentation' : 'button'}"
         tabindex="${isAdded ? '-1' : '0'}"
         onkeydown="if(event.key==='Enter'&&!${isAdded})addField('${f.id}')"
         title="${isAdded ? 'Already added' : (isChart ? 'Add chart to template' : 'Add to template')}">
      <div class="tf-cat-field-left">
        <span class="tf-cat-field-label">${f.label}</span>
        <span class="tf-cat-field-type">${subtitle}</span>
      </div>
      <div class="tf-cat-field-action">
        ${isAdded
          ? '<i class="ti ti-check tf-added-icon" aria-label="Added"></i>'
          : `<button class="tf-add-btn" tabindex="-1" aria-label="Add ${isChart ? 'chart' : 'field'}"><i class="ti ti-plus"></i></button>`}
      </div>
    </div>`;
}

function searchCatalog(query) {
  renderCatalog(query);
}

function toggleSection(btn) {
  const section = btn.closest('.tf-cat-section');
  const isCollapsed = section.classList.toggle('collapsed');
  btn.setAttribute('aria-expanded', String(!isCollapsed));
}

// ── Add / Remove fields ───────────────────────────────────────────
function addField(catalogId) {
  let catalogField = null;
  for (const section of FIELD_CATALOG) {
    catalogField = section.fields.find(f => f.id === catalogId);
    if (catalogField) break;
  }
  if (!catalogField) return;

  if (catalogField.type === 'chart') {
    activeFields.push({
      catalogId:   catalogField.id,
      label:       catalogField.label,
      type:        'chart',
      chartType:   catalogField.chartType,
      chartTitle:  '',
      dataSource:  CHART_DEFAULT_SOURCE[catalogField.chartType] || 'category-spend',
      position:    'after-summary',
      colorScheme: 'default',
      required:    false,
      helpText:    '',
    });
  } else {
    activeFields.push({
      catalogId:   catalogField.id,
      label:       catalogField.label,
      type:        catalogField.type,
      defaultVal:  catalogField.defaultVal !== undefined ? catalogField.defaultVal : '',
      placeholder: catalogField.placeholder || '',
      options:     catalogField.options ? [...catalogField.options] : [],
      required:    false,
      helpText:    '',
    });
  }

  renderCatalog(document.getElementById('catalog-search').value);
  renderActiveFields();
  updateFieldCount();

  setTimeout(() => {
    const items = document.querySelectorAll('.tf-afield');
    items[items.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 80);
}

function removeField(idx) {
  activeFields.splice(idx, 1);
  if (selectedIdx === idx)       selectedIdx = null;
  else if (selectedIdx > idx)    selectedIdx--;
  renderCatalog(document.getElementById('catalog-search').value);
  renderActiveFields();
  updateFieldCount();
}

// ── Active Fields ─────────────────────────────────────────────────
function renderActiveFields() {
  const list  = document.getElementById('fields-active-list');
  const empty = document.getElementById('fields-empty');

  if (!activeFields.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = activeFields.map((f, i) => renderActiveField(f, i)).join('');
}

function renderActiveField(f, i) {
  const isOpen = selectedIdx === i;
  return `
    <div class="tf-afield ${isOpen ? 'expanded' : ''}"
         draggable="true"
         ondragstart="onDragStart(event,${i})"
         ondragover="onDragOver(event,${i})"
         ondrop="onDrop(event,${i})"
         ondragend="onDragEnd()"
         id="afield-${i}">
      <div class="tf-afield-row" onclick="toggleExpand(${i})">
        <div class="tf-afield-drag" onclick="event.stopPropagation()" title="Drag to reorder">
          <i class="ti ti-grip-vertical" aria-hidden="true"></i>
        </div>
        <div class="tf-afield-type-icon type-${f.type}">
          <i class="ti ${getTypeIcon(f.type)}" aria-hidden="true"></i>
        </div>
        <div class="tf-afield-info">
          <span class="tf-afield-label">${escHtml(f.label)}</span>
          <span class="tf-afield-typebadge">${f.type === 'chart' ? (f.chartType || 'chart') : f.type}</span>
          ${f.required ? '<span class="tf-afield-req">Required</span>' : ''}
        </div>
        <div class="tf-afield-actions">
          <button class="tf-afield-del" onclick="event.stopPropagation();removeField(${i})" title="Remove field" aria-label="Remove">
            <i class="ti ti-trash" aria-hidden="true"></i>
          </button>
          <i class="ti ti-chevron-down tf-afield-chevron ${isOpen ? 'open' : ''}" aria-hidden="true"></i>
        </div>
      </div>
      ${isOpen ? renderFieldSettings(f, i) : ''}
    </div>`;
}

function renderFieldSettings(f, i) {
  if (f.type === 'chart') return renderChartSettings(f, i);

  const defaultInput = buildDefaultInput(f, i);
  const showPlaceholder = (f.type === 'text' || f.type === 'number');

  return `
    <div class="tf-afield-settings">
      <div class="tf-settings-grid">

        <div class="tf-settings-group">
          <label class="tf-settings-label">Field label</label>
          <input type="text" class="tf-settings-input"
                 value="${escAttr(f.label)}"
                 oninput="updateProp(${i},'label',this.value)"
                 placeholder="Display label">
        </div>

        <div class="tf-settings-group">
          <label class="tf-settings-label">Default value</label>
          ${defaultInput}
        </div>

        ${showPlaceholder ? `
        <div class="tf-settings-group">
          <label class="tf-settings-label">Placeholder text</label>
          <input type="text" class="tf-settings-input"
                 value="${escAttr(f.placeholder || '')}"
                 oninput="updateProp(${i},'placeholder',this.value)"
                 placeholder="Hint shown in empty field">
        </div>` : ''}

        <div class="tf-settings-group">
          <label class="tf-settings-label">Help text</label>
          <input type="text" class="tf-settings-input"
                 value="${escAttr(f.helpText || '')}"
                 oninput="updateProp(${i},'helpText',this.value)"
                 placeholder="Short description shown under the field">
        </div>

      </div>
      <div class="tf-settings-footer">
        <label class="tf-settings-label">Required field</label>
        <button class="tf-toggle ${f.required ? 'on' : ''}"
                onclick="toggleRequired(${i})"
                aria-pressed="${f.required}"
                aria-label="Toggle required">
          <span class="tf-toggle-thumb"></span>
        </button>
      </div>
    </div>`;
}

function renderChartSettings(f, i) {
  const srcOptions = CHART_DATA_SOURCES.map(s =>
    `<option value="${s.value}" ${f.dataSource === s.value ? 'selected' : ''}>${s.label}</option>`
  ).join('');
  const posOptions = CHART_POSITIONS.map(p =>
    `<option value="${p.value}" ${f.position === p.value ? 'selected' : ''}>${p.label}</option>`
  ).join('');
  const colorOptions = CHART_COLOR_SCHEMES.map(c =>
    `<option value="${c.value}" ${f.colorScheme === c.value ? 'selected' : ''}>${c.label}</option>`
  ).join('');

  const CHART_ICON_MAP = {
    'bar':            'ti-chart-bar',
    'pie':            'ti-chart-pie',
    'line':           'ti-chart-line',
    'donut':          'ti-chart-donut',
    'area':           'ti-chart-area-line',
    'horizontal-bar': 'ti-chart-bar-off',
  };
  const chartIcon = CHART_ICON_MAP[f.chartType] || 'ti-chart-bar';

  return `
    <div class="tf-afield-settings tf-chart-settings">
      <div class="tf-chart-settings-header">
        <i class="ti ${chartIcon} tf-chart-settings-icon" aria-hidden="true"></i>
        <span class="tf-chart-settings-title">${escHtml(f.label)} settings</span>
      </div>
      <div class="tf-settings-grid">

        <div class="tf-settings-group" style="grid-column:1/-1">
          <label class="tf-settings-label">Chart title</label>
          <input type="text" class="tf-settings-input"
                 value="${escAttr(f.chartTitle || '')}"
                 oninput="updateProp(${i},'chartTitle',this.value)"
                 placeholder="Leave blank to use default title">
        </div>

        <div class="tf-settings-group">
          <label class="tf-settings-label">Data source</label>
          <select class="tf-settings-input" onchange="updateProp(${i},'dataSource',this.value)">
            ${srcOptions}
          </select>
        </div>

        <div class="tf-settings-group">
          <label class="tf-settings-label">Position in report</label>
          <select class="tf-settings-input" onchange="updateProp(${i},'position',this.value)">
            ${posOptions}
          </select>
        </div>

        <div class="tf-settings-group">
          <label class="tf-settings-label">Color scheme</label>
          <select class="tf-settings-input" onchange="updateProp(${i},'colorScheme',this.value)">
            ${colorOptions}
          </select>
        </div>

        <div class="tf-settings-group">
          <label class="tf-settings-label">Help / caption text</label>
          <input type="text" class="tf-settings-input"
                 value="${escAttr(f.helpText || '')}"
                 oninput="updateProp(${i},'helpText',this.value)"
                 placeholder="Caption shown below the chart">
        </div>

      </div>
    </div>`;
}

function buildDefaultInput(f, i) {
  const v = f.defaultVal;
  switch (f.type) {
    case 'date':
      return `<input type="date" class="tf-settings-input" value="${escAttr(v)}" oninput="updateProp(${i},'defaultVal',this.value)">`;

    case 'select':
      return `<select class="tf-settings-input" onchange="updateProp(${i},'defaultVal',this.value)">
        ${(f.options || []).map(o => `<option value="${escAttr(o)}" ${v === o ? 'selected' : ''}>${o}</option>`).join('')}
      </select>`;

    case 'toggle':
      return `<button class="tf-toggle ${v ? 'on' : ''}"
                      onclick="updateProp(${i},'defaultVal',!${v});renderActiveFields()"
                      aria-pressed="${v}"
                      aria-label="Default on/off">
                <span class="tf-toggle-thumb"></span>
              </button>`;

    case 'number':
      return `<input type="number" class="tf-settings-input" value="${escAttr(v)}"
                     placeholder="${escAttr(f.placeholder || '')}"
                     oninput="updateProp(${i},'defaultVal',this.value)">`;

    case 'multiselect':
      return `<div class="tf-multisel-wrap">
        ${(f.options || []).map(o => {
          const checked = Array.isArray(v) && v.includes(o);
          return `<label class="tf-multisel-opt ${checked ? 'checked' : ''}">
            <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleMultisel(${i},'${escAttr(o)}',this.checked)" style="display:none">
            ${o}
          </label>`;
        }).join('')}
      </div>`;

    default:
      return `<input type="text" class="tf-settings-input" value="${escAttr(v)}"
                     placeholder="${escAttr(f.placeholder || '')}"
                     oninput="updateProp(${i},'defaultVal',this.value)">`;
  }
}

function toggleExpand(idx) {
  selectedIdx = (selectedIdx === idx) ? null : idx;
  renderActiveFields();
  if (selectedIdx !== null) {
    setTimeout(() => {
      document.getElementById(`afield-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
  }
}

function updateProp(idx, prop, value) {
  if (!activeFields[idx]) return;
  activeFields[idx][prop] = value;
  if (prop === 'label') {
    // Lightweight update — just the label text node
    const el = document.querySelector(`#afield-${idx} .tf-afield-label`);
    if (el) el.textContent = value;
  }
}

function toggleRequired(idx) {
  if (!activeFields[idx]) return;
  activeFields[idx].required = !activeFields[idx].required;
  renderActiveFields();
}

function toggleMultisel(idx, option, checked) {
  if (!activeFields[idx]) return;
  let arr = Array.isArray(activeFields[idx].defaultVal) ? [...activeFields[idx].defaultVal] : [];
  if (checked) { if (!arr.includes(option)) arr.push(option); }
  else          { arr = arr.filter(o => o !== option); }
  activeFields[idx].defaultVal = arr;
  // Update checkboxes in place
  const wrap = document.querySelector(`#afield-${idx} .tf-multisel-wrap`);
  if (wrap) {
    wrap.querySelectorAll('.tf-multisel-opt').forEach(label => {
      const cb = label.querySelector('input[type=checkbox]');
      label.classList.toggle('checked', cb.checked);
    });
  }
}

// ── Drag & Drop ───────────────────────────────────────────────────
function onDragStart(e, idx) {
  dragSrcIdx = idx;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(() => document.getElementById(`afield-${idx}`)?.classList.add('dragging'), 0);
}

function onDragOver(e, idx) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.tf-afield').forEach((el, i) => {
    el.classList.toggle('drag-over', i === idx && i !== dragSrcIdx);
  });
}

function onDrop(e, idx) {
  e.preventDefault();
  if (dragSrcIdx === null || dragSrcIdx === idx) return;
  const item = activeFields.splice(dragSrcIdx, 1)[0];
  activeFields.splice(idx, 0, item);
  if (selectedIdx === dragSrcIdx)      selectedIdx = idx;
  else if (dragSrcIdx < idx && selectedIdx > dragSrcIdx && selectedIdx <= idx) selectedIdx--;
  else if (dragSrcIdx > idx && selectedIdx < dragSrcIdx && selectedIdx >= idx) selectedIdx++;
  dragSrcIdx = null;
  renderActiveFields();
}

function onDragEnd() {
  dragSrcIdx = null;
  document.querySelectorAll('.tf-afield').forEach(el => el.classList.remove('dragging', 'drag-over'));
}

// ── Helpers ───────────────────────────────────────────────────────
function updateFieldCount() {
  const charts = activeFields.filter(f => f.type === 'chart').length;
  const fields = activeFields.length - charts;
  let label;
  if (!activeFields.length) {
    label = 'No items added';
  } else {
    const parts = [];
    if (fields)  parts.push(`${fields} field${fields !== 1 ? 's' : ''}`);
    if (charts)  parts.push(`${charts} chart${charts !== 1 ? 's' : ''}`);
    label = parts.join(', ') + ' added';
  }
  document.getElementById('field-count').textContent = label;
}

function getTypeIcon(type) {
  return { date: 'ti-calendar-event', number: 'ti-hash', text: 'ti-forms', select: 'ti-chevrons-down', multiselect: 'ti-list-check', toggle: 'ti-toggle-right', chart: 'ti-chart-bar' }[type] || 'ti-forms';
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function escAttr(s) {
  return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Navigation ────────────────────────────────────────────────────
function goBack() {
  // Navigate back without saving — treat as skip
  window.location.href = 'reporting-workspace.html';
}

function getSettingsFromPage() {
  return {
    tmplAccount: document.querySelector('.tf-stag.active[data-field="account"]')?.dataset.val || 'All accounts',
    tmplFormat:  document.querySelector('.tf-stag.active[data-field="format"]')?.dataset.val  || 'PDF',
  };
}

function selectSettingTag(el) {
  const field = el.dataset.field;
  el.closest('.tf-settings-chips').querySelectorAll('.tf-stag').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
}

function skipAndContinue() {
  const draft = loadDraft();
  draft.fields = [];
  Object.assign(draft, getSettingsFromPage());
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  localStorage.setItem(FIELDS_DONE_KEY, 'skipped');
  window.location.href = 'reporting-workspace.html';
}

function saveAndContinue() {
  const draft = loadDraft();
  draft.fields = activeFields;
  Object.assign(draft, getSettingsFromPage());
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  localStorage.setItem(FIELDS_DONE_KEY, 'done');
  window.location.href = 'reporting-workspace.html';
}
