/**
 * FinSight Mock / Production Fast-Bridge Server
 * Serves the full FinSight REST API + the production built React SPA from a single port (8000).
 * Matches all endpoints in src/api.py:
 *  - /api/health
 *  - /api/summary
 *  - /api/transactions
 *  - /api/commitments
 *  - /api/commitments/:id
 *  - /api/alerts
 *  - /api/cancellation-guide/:pm
 *  - /api/evaluation
 *  - / (React SPA from frontend/dist/)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8000;
const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'data', 'raw');
const PROCESSED_DIR = path.join(ROOT, 'data', 'processed');
const FRONTEND_DIST = path.join(ROOT, 'frontend', 'dist');
const allowedOrigins = new Set([
  'http://localhost:5173', 'http://127.0.0.1:5173',
  'http://localhost:8000', 'http://127.0.0.1:8000',
]);

function parseCSV(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    // Simple CSV parser supporting standard commas
    const values = [];
    let cur = '';
    let inQuotes = false;
    for (let charIdx = 0; charIdx < rawLine.length; charIdx++) {
      const char = rawLine[charIdx];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(cur.trim().replace(/^"|"$/g, ''));
        cur = '';
      } else {
        cur += char;
      }
    }
    values.push(cur.trim().replace(/^"|"$/g, ''));
    
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] !== undefined ? values[idx] : '';
    });
    rows.push(row);
  }
  return rows;
}

// Regulatory guidance dictionary matching src/cancellation_guide.py
const GUIDANCE_BY_METHOD = {
  'upi autopay': {
    mechanism: 'UPI AutoPay',
    regulatory_framework: 'NPCI UPI AutoPay Guidelines (OC No. 223)',
    summary: 'Manage or revoke the recurring mandate directly inside your UPI application.',
    steps: [
      'Open your primary UPI app (Google Pay, PhonePe, Paytm, BHIM, or your bank app).',
      "Navigate to Profile / Settings > 'UPI AutoPay' or 'Recurring Mandates'.",
      'Locate the mandate matching this merchant or payment descriptor.',
      "Tap the mandate to view details, then select 'Pause' or 'Revoke / Cancel Mandate'.",
      'Enter your 4 or 6-digit UPI PIN to confirm the cancellation.',
      "Verify you receive an SMS or notification confirming the mandate status is 'Revoked'."
    ],
    important_notes: [
      'Confirm the effective status and any pending debit with the issuer or payment app.',
      'If you have an active contract with the merchant, also check your merchant account to ensure you do not incur arrears.',
      'FinSight does not directly connect to your UPI app and cannot initiate cancellations on your behalf.'
    ]
  },
  card: {
    mechanism: 'Card E-Mandate (Credit / Debit Card)',
    regulatory_framework: 'RBI Digital Payments - E-mandate Framework, 2026 (RBI/DPSS/2026-27/396)',
    summary: "Cancel recurring subscription via merchant billing or through your card issuer's e-mandate hub.",
    steps: [
      "Merchant direct route: Log into the merchant website or app, navigate to 'Billing' or 'Subscription', and click 'Cancel Subscription'.",
      "Card issuer portal: Log into your bank's NetBanking or Mobile Banking app, go to Cards > 'Manage Recurring Payments / E-Mandates'.",
      "E-Mandate Hub: You can also use your bank's SI-Hub / Mastercard or Visa mandate management portal to revoke the specific merchant standing instruction.",
      "Optional safeguard: If the merchant continues unauthorized billing, set your card's online recurring transaction limit to zero or request card token deletion."
    ],
    important_notes: [
      'Use the issuer withdrawal facility for the e-mandate and complete the issuer authentication step.',
      'Blocking a card token stops payment but does not unilaterally terminate contractual service agreements.'
    ]
  },
  'bank mandate': {
    mechanism: 'Bank Direct Mandate (NACH / eNACH)',
    regulatory_framework: 'NPCI National Automated Clearing House (NACH) Regulations',
    summary: 'Cancel recurring ECS/NACH mandate via NetBanking or bank branch instruction.',
    steps: [
      "Log into your bank's NetBanking portal.",
      "Navigate to Services / Accounts > 'NACH Mandates' or 'Standing Instructions'.",
      'Find the mandate using the Mandate UMRN (Unique Mandate Reference Number) or merchant name.',
      "Select 'Stop / Cancel Mandate' and authorize with OTP or NetBanking password.",
      'If online cancellation is unsupported by your bank, submit a physical Mandate Cancellation Request Form at your home branch.'
    ],
    important_notes: [
      'Ask your bank about its cancellation process, effective date, and any debit already in progress.',
      'Retain your mandate stop confirmation acknowledgment number.'
    ]
  },
  upi: {
    mechanism: 'Standard UPI (One-Off / Manual)',
    regulatory_framework: 'NPCI Unified Payments Interface',
    summary: 'This was paid via standard one-time UPI rather than an active recurring mandate.',
    steps: [
      'Check whether this was a manual one-time payment rather than an automatic debit.',
      "If the merchant charges you repeatedly, check your UPI app's AutoPay section to confirm no active mandate was created.",
      'Contact merchant customer support or check your active account billing status.'
    ],
    important_notes: [
      'One-time UPI payments cannot automatically debit funds in the future without explicit UPI PIN entry.'
    ]
  },
  unknown: {
    mechanism: 'Unspecified Payment Mechanism',
    regulatory_framework: 'General Consumer Financial Protection',
    summary: 'Identify the payment route from your bank account statement or reference ID.',
    steps: [
      'Review your original bank account or card statement to determine whether this payment cleared as UPI, Card, or NetBanking/ECS.',
      'Look up the merchant transaction descriptor in your bank mobile app to see the underlying payment channel.',
      "Log into the merchant's account profile to check active subscriptions and payment methods on file."
    ],
    important_notes: [
      'Always verify payment status through your official financial institution before taking dispute actions.'
    ]
  }
};

function getCancellationGuidance(paymentMethod) {
  const key = (paymentMethod || '').toLowerCase();
  if (key.includes('autopay') || key.includes('upi autopay')) return GUIDANCE_BY_METHOD['upi autopay'];
  if (key.includes('card')) return GUIDANCE_BY_METHOD.card;
  if (key.includes('bank mandate') || key.includes('nach') || key.includes('ecs')) return GUIDANCE_BY_METHOD['bank mandate'];
  if (key.includes('upi')) return GUIDANCE_BY_METHOD.upi;
  return GUIDANCE_BY_METHOD.unknown;
}

function loadPredictions() {
  const rows = parseCSV(path.join(PROCESSED_DIR, 'transaction_predictions.csv'));
  const map = {};
  for (const r of rows) {
    if (!r.transaction_id) continue;
    map[r.transaction_id] = {
      predicted_recurring: r.predicted_recurring === 'True' || r.predicted_recurring === 'true',
      candidate_id: r.candidate_id || '',
      detected_cadence: r.detected_cadence || 'unknown',
      heuristic_confidence: parseFloat(r.heuristic_confidence) || null,
      amount_deviation_ratio: parseFloat(r.amount_deviation_ratio) || null,
      review_required: r.review_required === 'True' || r.review_required === 'true',
      detector_evidence: r.evidence || ''
    };
  }
  return map;
}

function loadTransactions() {
  const rawRows = parseCSV(path.join(RAW_DIR, 'synthetic_transactions.csv'));
  const predictions = loadPredictions();
  return rawRows.map(r => {
    const amount = parseFloat(r.amount) || 0;
    const tid = r.transaction_id || '';
    const pred = predictions[tid] || {};
    const review_required = pred.review_required || false;
    const dev = pred.amount_deviation_ratio;
    
    return {
      transaction_id: tid,
      date: r.date || '',
      description: r.description || '',
      amount: amount,
      direction: (r.direction || '').toLowerCase(),
      payment_method: r.payment_method || '',
      reference_id: r.reference_id || null,
      predicted_recurring: pred.predicted_recurring || false,
      candidate_id: pred.candidate_id || null,
      detected_cadence: pred.detected_cadence || null,
      heuristic_confidence: pred.heuristic_confidence || null,
      amount_deviation_ratio: dev,
      review_required: review_required,
      review_reason: review_required && dev !== null ? `Amount differs ${(dev * 100).toFixed(1)}% from group median.` : null,
      detector_evidence: pred.detector_evidence || ''
    };
  });
}

function loadCommitments() {
  const transactions = loadTransactions();
  const candRows = parseCSV(path.join(PROCESSED_DIR, 'recurring_candidates_v3.csv'));
  
  const candTxMap = {};
  for (const tx of transactions) {
    if (tx.direction !== 'debit') continue;
    if (tx.candidate_id) {
      if (!candTxMap[tx.candidate_id]) candTxMap[tx.candidate_id] = [];
      candTxMap[tx.candidate_id].push(tx);
    }
  }

  return candRows.map((r, idx) => {
    const candId = r.candidate_id || `CAND-${idx + 1}`;
    const desc = r.description || 'Merchant';
    const cadence = (r.detected_cadence || 'unknown').toLowerCase();
    const matching = (candTxMap[candId] || []).sort((a, b) => a.date.localeCompare(b.date));
    
    const amounts = matching.map(t => Math.abs(t.amount)).sort((a, b) => a - b);
    const medianAmt = amounts.length > 0 ? amounts[Math.floor(amounts.length / 2)] : parseFloat(r.median_amount) || 0;
    
    let annualCost = null;
    if (cadence.includes('monthly')) annualCost = medianAmt * 12;
    else if (cadence.includes('quarterly')) annualCost = medianAmt * 4;
    else if (cadence.includes('annual')) annualCost = medianAmt;
    
    const flagged = matching.filter(t => t.review_required);
    const pm = matching.length > 0 ? matching[0].payment_method : 'UPI AutoPay';
    
    return {
      commitment_id: r.commitment_id || `c_${candId.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      candidate_id: candId,
      merchant_id: null,
      display_name: desc,
      observed_descriptors: Array.from(new Set(matching.map(t => t.description))),
      cadence: cadence,
      status: 'candidate',
      confidence_score: parseFloat(r.heuristic_confidence) || 0.9,
      primary_payment_method: pm,
      transaction_ids: matching.map(t => t.transaction_id),
      transaction_count: matching.length || parseInt(r.transaction_count, 10) || 0,
      first_observed_date: matching.length > 0 ? matching[0].date : r.first_seen,
      last_observed_date: matching.length > 0 ? matching[matching.length - 1].date : r.last_seen,
      billing_anchor_day: Number(r.billing_anchor_day) || null,
      billing_anchor_date: r.billing_anchor_date || null,
      amount_pattern: r.amount_pattern || null,
      typical_amount: medianAmt,
      estimated_annual_cost: annualCost,
      currency: 'INR',
      review_required: flagged.length > 0,
      review_transaction_count: flagged.length,
      evidence: [
        `${matching.length || r.transaction_count} transactions reported by detector.`,
        r.evidence || `Cadence fits ${cadence}.`
      ],
      cancellation_guidance: getCancellationGuidance(pm)
    };
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  
  // CORS & Security Headers
  const origin = req.headers.origin;
  res.setHeader('Vary', 'Origin');
  if (allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  if (pathname === '/api' || pathname.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API Endpoints
  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ status: 'ok', service: 'FinSight API', data_mode: 'synthetic', detector_version: 'v3' }));
  }

  if (pathname === '/api/summary') {
    const txs = loadTransactions();
    const commitments = loadCommitments();
    const debits = txs.filter(t => t.direction === 'debit');
    const annualSpend = commitments.reduce((acc, c) => acc + (c.estimated_annual_cost || 0), 0);
    const reviewRequiredCount = commitments.filter(c => c.review_required).length;
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      transaction_count: txs.length,
      debit_transaction_count: debits.length,
      detected_pattern_count: commitments.length,
      estimated_annual_cost: Math.round(annualSpend * 100) / 100,
      annual_estimate_count: commitments.filter(c => c.estimated_annual_cost !== null).length,
      review_required_transaction_count: txs.filter(t => t.review_required).length,
      review_required_commitment_count: reviewRequiredCount,
      currency: 'INR',
      data_mode: 'synthetic'
    }));
  }

  if (pathname === '/api/commitments') {
    const commitments = loadCommitments();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ total: commitments.length, items: commitments }));
  }

  if (pathname.startsWith('/api/commitments/')) {
    const id = pathname.replace('/api/commitments/', '');
    const commitments = loadCommitments();
    const item = commitments.find(c => c.commitment_id === id);
    if (!item) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ detail: 'Commitment not found' }));
    }
    const txs = loadTransactions().filter(t => item.transaction_ids.includes(t.transaction_id));
    item.transactions = txs;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(item));
  }

  if (pathname === '/api/transactions') {
    const txs = loadTransactions();
    const search = typeof parsedUrl.query.search === 'string' ? parsedUrl.query.search.toLowerCase() : '';
    let filtered = txs;
    if (search) {
      filtered = filtered.filter(t => t.description.toLowerCase().includes(search) || t.transaction_id.toLowerCase().includes(search));
    }
    const limit = parseInt(parsedUrl.query.limit, 10) || 100;
    const offset = parseInt(parsedUrl.query.offset, 10) || 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ total: filtered.length, limit, offset, items: filtered.slice(offset, offset + limit) }));
  }

  if (pathname.startsWith('/api/cancellation-guide/')) {
    let pm;
    try {
      pm = decodeURIComponent(pathname.slice('/api/cancellation-guide/'.length));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ detail: 'Invalid payment method' }));
    }
    const guide = getCancellationGuidance(pm);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(guide));
  }

  if (pathname === '/api/alerts') {
    const txs = loadTransactions();
    const commitments = loadCommitments();
    const alerts = [];
    
    for (const tx of txs) {
      if (tx.direction === 'debit' && tx.review_required) {
        alerts.push({
          alert_id: `amount_${tx.transaction_id}`,
          transaction_id: tx.transaction_id,
          alert_type: 'amount_deviation',
          severity: 'warning',
          title: `Review unusual amount: ${tx.description}`,
          evidence: [
            tx.review_reason || 'Amount deviates from observed pattern.',
            `Observed amount: INR ${tx.amount.toFixed(2)}.`,
            `Transaction date: ${tx.date}.`
          ],
          recommended_action: 'Compare this transaction with history.',
          confirmed: false
        });
      }
    }
    
    for (const c of commitments) {
      if (c.cadence === 'irregular') {
        alerts.push({
          alert_id: `review_${c.commitment_id}`,
          commitment_id: c.commitment_id,
          alert_type: 'irregular_pattern',
          severity: 'informational',
          title: `Review irregular payment pattern: ${c.display_name}`,
          evidence: c.evidence,
          recommended_action: 'Review transaction history to verify recurring status.',
          confirmed: false
        });
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ total: alerts.length, items: alerts }));
  }

  if (pathname === '/api/evaluation') {
    const labels = parseCSV(path.join(RAW_DIR, 'ground_truth_labels.csv'));
    const preds = loadPredictions();
    let tp = 0, fp = 0, fn = 0, tn = 0;
    
    for (const lbl of labels) {
      const pred = preds[lbl.transaction_id];
      if (!pred) continue;
      const actual = lbl.is_recurring === 'true' || lbl.is_recurring === 'True';
      const predicted = pred.predicted_recurring;
      if (actual && predicted) tp++;
      else if (!actual && predicted) fp++;
      else if (actual && !predicted) fn++;
      else if (!actual && !predicted) tn++;
    }
    
    const prec = tp + fp > 0 ? tp / (tp + fp) : 1;
    const rec = tp + fn > 0 ? tp / (tp + fn) : 1;
    const f1 = prec + rec > 0 ? 2 * prec * rec / (prec + rec) : 1;
    const total = tp + fp + fn + tn;
    const acc = total > 0 ? (tp + tn) / total : 1;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      evaluated_transactions: total,
      true_positives: tp,
      false_positives: fp,
      false_negatives: fn,
      true_negatives: tn,
      precision: prec,
      recall: rec,
      f1_score: f1,
      accuracy: acc,
      errors: [],
      data_mode: 'synthetic'
    }));
  }

  // Static File Serving (React SPA from frontend/dist/)
  let filePath;
  try {
    const root = fs.realpathSync(FRONTEND_DIST);
    const candidate = fs.realpathSync(path.join(root, pathname === '/' ? 'index.html' : pathname));
    const relative = path.relative(root, candidate);
    if (!relative || relative.split(path.sep)[0] === '..' || path.isAbsolute(relative) || !fs.statSync(candidate).isFile()) {
      throw new Error('File not found');
    }
    filePath = candidate;
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('File not found');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';
  
  if (filePath.includes('/assets/') || filePath.includes('\\assets\\')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (contentType === 'text/html') {
    res.setHeader('Cache-Control', 'no-cache');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('File not found');
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`FinSight server running at http://localhost:${PORT}`);
  console.log(`Serving API & React UI from port ${PORT}`);
});

