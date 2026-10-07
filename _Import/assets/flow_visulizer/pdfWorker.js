/**
 * pdfWorker.js — Web Worker for Vector-Based PDF Export
 *
 * This worker runs off the main thread to generate a multi-page PDF of the
 * flow diagram without freezing the UI. It receives simplified node/edge data
 * from DownloadButton.jsx and produces a PDF blob that is sent back via
 * postMessage.
 *
 * The generated PDF has two types of pages:
 *   1. FLOW DIAGRAM pages — large, custom-sized pages that render the full
 *      call flow as vector graphics (nodes, edges, arrowheads). Nodes are
 *      clickable and link to their corresponding detail section.
 *   2. DETAIL pages — standard US Letter (612×792pt) pages that display each
 *      node's configuration in a readable, copy-pastable format. Each detail
 *      section includes a "Back to <Node>" link that returns the viewer to the
 *      node's position on the flow diagram.
 *
 * Architecture overview:
 *   Phase 1 — Pre-calculate flow layouts and generate detail section data
 *   Phase 2 — Assign page numbers to all flow and detail pages
 *   Phase 3 — Create the jsPDF instance and render everything
 *
 * IMPORTANT — jsPDF coordinate quirk:
 *   jsPDF's getVerticalCoordinateString() (used internally by the XYZ link
 *   destination handler) converts Y coordinates using the LAST ACTIVE page's
 *   height, not the page the annotation belongs to. Since detail pages (792pt)
 *   are always created after flow pages, all XYZ link annotations are converted
 *   using 792pt regardless of source page size. The code accounts for this by
 *   pre-adjusting top values before passing them to pdf.link().
 */

import { jsPDF } from 'jspdf';

// ============================================================
// CONSTANTS — Flow Diagram Node Dimensions (in points)
// These mirror the visual layout of the React Flow nodes so
// the PDF rendering matches what the user sees on screen.
// ============================================================
const NODE_W = 280;          // Fixed width of every node card
const HEADER_H = 48;         // Height of the colored header band
const ROW_H = 24;            // Height of each exit/handle row
const SEP_H = 13;            // Height of a separator line between exit groups
const MIN_BODY_H = 40;       // Minimum body height to prevent overly short nodes
const CORNER_R = 8;          // Border radius for node card corners
const HANDLE_R = 5;          // Radius of connection handle dots

// Heights for various body content types within a node
const SECTION_LABEL_H = 20;  // "CHOICES", "ASSIGNMENTS", etc.
const TEXT_LINE_H = 20;      // Standard text line
const ASSIGNMENT_H = 14;     // Compact variable assignment row
const EXPR_BOX_H = 30;       // Condition expression box
const MSG_BOX_H = 40;        // Play Message preview box
const BADGE_H = 30;          // Centered badge (e.g. "End of Flow")

// ============================================================
// CONSTANTS — Detail Pages
// Detail pages use US Letter dimensions and a fixed margin
// to present node configuration in a document-friendly format.
// ============================================================
const DET_PAGE_W = 612;      // US Letter width in points
const DET_PAGE_H = 792;      // US Letter height in points
const DET_MARGIN = 50;       // Margin on all sides
const DET_W = DET_PAGE_W - 2 * DET_MARGIN; // Usable content width

// Vertical spacing for detail page elements
const DET_HDR_H = 40;        // Node name/type header bar
const DET_SEC_H = 22;        // Section title + divider line
const DET_ROW_H = 32;        // (legacy) Fixed key-value row height — KV now uses dynamic height
const DET_CODE_PAD = 16;     // Vertical padding inside code blocks
const DET_CODE_LINE = 13;    // Line height for monospace code text
const DET_MAP_H = 20;        // Variable mapping row (target ← source)
const DET_BACK_H = 24;       // "Back to flow" link area
const DET_GAP = 28;          // Spacing between consecutive node detail sections

// ============================================================
// COLOR HELPERS
// Parse CSS color strings (#hex or rgb()) into [r, g, b] arrays
// for use with jsPDF's setFillColor / setDrawColor / setTextColor.
// ============================================================
function parseColor(color) {
  if (!color) return [0, 0, 0];
  if (color.startsWith('#')) {
    const hex = color.replace('#', '');
    if (hex.length === 3) return [parseInt(hex[0]+hex[0],16), parseInt(hex[1]+hex[1],16), parseInt(hex[2]+hex[2],16)];
    return [parseInt(hex.substr(0,2),16), parseInt(hex.substr(2,2),16), parseInt(hex.substr(4,2),16)];
  }
  const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (m) return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
  return [0, 0, 0];
}

/** Shorthand: set fill color from a CSS color string */
function setFill(pdf, c) { const rgb = parseColor(c); pdf.setFillColor(rgb[0], rgb[1], rgb[2]); }
/** Shorthand: set stroke/draw color from a CSS color string */
function setDraw(pdf, c) { const rgb = parseColor(c); pdf.setDrawColor(rgb[0], rgb[1], rgb[2]); }
/** Shorthand: set text color from a CSS color string */
function setText(pdf, c) { const rgb = parseColor(c); pdf.setTextColor(rgb[0], rgb[1], rgb[2]); }

// ============================================================
// NODE BLUEPRINT
// Maps each WxCC node type to its visual structure on the flow
// diagram: body content items (labels, text, expression boxes)
// and exit handle rows (Success, Error, Timeout, etc.).
// This determines what appears inside each node card.
// ============================================================
function getNodeBlueprint(type, details) {
  const body = [];   // Content items rendered in the node body
  const exits = [];  // Output handles rendered below the body

  switch (type) {
    case 'StartNode':
      exits.push({ id: 'default', label: 'Start', color: '#444' });
      break;

    case 'MenuNode': {
      body.push({ type: 'sectionLabel', text: 'Choices' });
      // Each menu choice becomes an exit handle with a numbered badge
      (details.choices || []).forEach(c => exits.push({ id: c.id, label: c.label, color: '#444', badge: String(c.id) }));
      exits.push({ id: 'timeout', label: 'No-Input Timeout', color: '#999', sep: true });
      exits.push({ id: 'invalid', label: 'Unmatched Entry', color: '#999' });
      exits.push({ id: 'error', label: 'Undefined Error', color: '#999' });
      break;
    }

    case 'CaseNode': {
      body.push({ type: 'sectionLabel', text: 'Cases' });
      (details.cases || []).forEach(c => exits.push({ id: c.id, label: c.label, color: '#444' }));
      exits.push({ id: 'default', label: 'Default', color: '#444', sep: true });
      exits.push({ id: 'error', label: 'Undefined Error', color: '#D32F2F' });
      break;
    }

    case 'ConditionNode':
      body.push({ type: 'exprBox', text: details.expression || 'Condition Expression' });
      exits.push({ id: 'true', label: 'True', color: '#444', sep: true });
      exits.push({ id: 'false', label: 'False', color: '#444' });
      exits.push({ id: 'error', label: 'Undefined Error', color: '#D32F2F' });
      break;

    case 'BusinessHoursNode':
      body.push({ type: 'text', text: 'Check Schedule', color: '#555' });
      exits.push({ id: 'workingHours', label: 'Working Hours', color: '#444' });
      exits.push({ id: 'holiday', label: 'Holidays', color: '#444' });
      exits.push({ id: 'override', label: 'Override', color: '#E65100' });
      exits.push({ id: 'default', label: 'Default', color: '#444' });
      exits.push({ id: 'error', label: 'Undefined Error', color: '#D32F2F', sep: true });
      break;

    case 'CollectDigitsNode':
      body.push({ type: 'labelVal', label: 'Store In', value: details.variable || 'Digits' });
      exits.push({ id: 'default', label: 'Success', color: '#444' });
      exits.push({ id: 'timeout', label: 'No-Input Timeout', color: '#999', sep: true });
      exits.push({ id: 'invalid', label: 'Unmatched Entry', color: '#999' });
      exits.push({ id: 'error', label: 'Undefined Error', color: '#999' });
      break;

    case 'PlayMessageNode': {
      let msg = 'No message configured';
      if (details.promptsTts && details.promptsTts[0]) msg = details.promptsTts[0].value || details.promptsTts[0].name || msg;
      else if (details.prompts && details.prompts[0]) msg = details.prompts[0].value || details.prompts[0].name || msg;
      else if (details.message) msg = details.message;
      body.push({ type: 'msgBox', text: msg });
      exits.push({ id: 'default', label: 'Success', color: '#444' });
      exits.push({ id: 'error', label: 'Undefined Error', color: '#999', sep: true });
      break;
    }

    case 'PlayMusicNode':
      body.push({ type: 'text', text: details.audioFile || 'Default Audio', color: '#555', italic: true });
      exits.push({ id: 'default', label: 'Success', color: '#444' });
      exits.push({ id: 'error', label: 'Error', color: '#D32F2F' });
      break;

    case 'SetVariableNode': {
      body.push({ type: 'sectionLabel', text: 'Assignments' });
      let assigns = [];
      if (Array.isArray(details.setVariablesArray) && details.setVariablesArray.length > 0) assigns = details.setVariablesArray;
      else if (details.srcVariable) assigns = [details];
      if (assigns.length > 0) assigns.forEach(a => body.push({ type: 'assign', variable: a.srcVariable || '?', value: String(a.expr || a.literal || a.tgtVariable || 'null').substring(0, 30) }));
      else body.push({ type: 'text', text: 'No variables set', color: '#bbb', italic: true });
      exits.push({ id: 'default', label: 'Success', color: '#444', sep: true });
      exits.push({ id: 'error', label: 'Undefined Error', color: '#D32F2F' });
      break;
    }

    case 'ParseNode':
      body.push({ type: 'labelVal', label: 'Input', value: details.inputVariable || 'N/A' });
      exits.push({ id: 'default', label: 'Success', color: '#444' });
      break;

    case 'HTTPRequestNode':
      body.push({ type: 'bold', text: details.httpRequestMethod || 'GET' });
      body.push({ type: 'text', text: (details.httpRequestUrl || 'http://...').substring(0, 40), color: '#555' });
      exits.push({ id: 'default', label: 'Success', color: '#444' });
      break;

    case 'BRERequestNode':
      body.push({ type: 'text', text: 'BRE Execution', color: '#555' });
      exits.push({ id: 'default', label: 'Success', color: '#444' });
      break;

    case 'FunctionNode':
      body.push({ type: 'bold', text: details.functionName || 'Custom Function' });
      exits.push({ id: 'default', label: 'Success', color: '#444' });
      exits.push({ id: 'error', label: 'Error', color: '#D32F2F' });
      break;

    case 'QueueContactNode':
      body.push({ type: 'bold', text: details.queueName || 'Target Queue', color: '#005073' });
      exits.push({ id: 'default', label: 'Success', color: '#444' });
      exits.push({ id: 'failure', label: 'Failure', color: '#D32F2F' });
      break;

    case 'QueueLookupNode':
      body.push({ type: 'text', text: 'Get Queue Stats', color: '#555' });
      exits.push({ id: 'default', label: 'Success', color: '#444' });
      exits.push({ id: 'insufficient_data', label: 'Insufficient Data', color: '#999' });
      exits.push({ id: 'failure', label: 'Failure', color: '#D32F2F' });
      break;

    case 'TransferNode':
      body.push({ type: 'bold', text: details.destination || 'Destination', color: '#005073' });
      exits.push({ id: 'default', label: 'Connected', color: '#444' });
      exits.push({ id: 'busy', label: 'Busy', color: '#999', sep: true });
      exits.push({ id: 'no_answer', label: 'No Answer', color: '#999' });
      exits.push({ id: 'invalid', label: 'Invalid', color: '#999' });
      exits.push({ id: 'error', label: 'Error', color: '#D32F2F' });
      break;

    case 'HandoffNode': {
      const dest = details.handOffFlow?.handOffToName || details.handOffFlow?.handOffTo || 'Target Flow';
      body.push({ type: 'labelVal', label: 'Go To', value: dest, valColor: '#005073' });
      break;
    }

    case 'SubflowNode':
      body.push({ type: 'bold', text: details.subflowName || 'Subflow', color: '#005073' });
      exits.push({ id: 'default', label: 'Success', color: '#444' });
      exits.push({ id: 'error', label: 'Error', color: '#D32F2F' });
      break;

    case 'DisconnectNode':
      body.push({ type: 'badge', text: 'End of Flow', bg: '#FFEBEE', fg: '#D32F2F' });
      break;

    default:
      exits.push({ id: 'default', label: 'Success', color: '#444' });
      exits.push({ id: 'error', label: 'Error', color: '#D32F2F' });
      break;
  }
  return { body, exits };
}

// ============================================================
// DIAGRAM LAYOUT CALCULATOR
// Computes the total height of a node and the Y positions of
// each exit handle. This is used to determine how tall to draw
// each node card and where to anchor outgoing edge connections.
// ============================================================
function calculateLayout(type, details) {
  const { body, exits } = getNodeBlueprint(type, details);

  // Start the cursor below the header
  let cursor = HEADER_H;
  const handles = {};

  // Accumulate height for each body content item
  body.forEach(item => {
    cursor += ({ sectionLabel: SECTION_LABEL_H, text: TEXT_LINE_H, bold: TEXT_LINE_H, labelVal: TEXT_LINE_H, assign: ASSIGNMENT_H, exprBox: EXPR_BOX_H, msgBox: MSG_BOX_H, badge: BADGE_H })[item.type] || TEXT_LINE_H;
  });

  // Accumulate height for each exit row, recording handle Y positions
  exits.forEach(exit => {
    if (exit.sep) cursor += SEP_H;              // Optional separator before this exit
    handles[exit.id] = cursor + ROW_H / 2;      // Handle dot is vertically centered in the row
    cursor += ROW_H;
  });

  // Enforce minimum body height so very simple nodes aren't too short
  if (cursor - HEADER_H < MIN_BODY_H) {
    const diff = MIN_BODY_H - (cursor - HEADER_H);
    Object.keys(handles).forEach(k => { handles[k] += diff; });
    cursor += diff;
  }

  return { totalHeight: cursor, handles, body, exits };
}

// ============================================================
// DIAGRAM NODE DRAWING
// Renders a single node card onto the PDF at position (n.x, n.y).
// Draws the header band, body content, exit rows with handle
// dots, and the input handle on the left side.
// ============================================================
function drawNode(pdf, n) {
  const { x, y, totalHeight: h, headerColor, borderColor, fontColor, label, subtitle, body, exits, type } = n;
  const w = NODE_W, r = CORNER_R;

  // White background fill for the entire card
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(x, y, w, h, r, r, 'F');

  // Colored header band — draw a taller rounded rect then cover the bottom
  // corners with a white rect so only the top corners are rounded
  setFill(pdf, headerColor);
  pdf.roundedRect(x, y, w, HEADER_H + r, r, r, 'F');
  pdf.setFillColor(255, 255, 255);
  pdf.rect(x, y + HEADER_H, w, r, 'F');

  // Divider line between header and body
  setDraw(pdf, borderColor);
  pdf.setLineWidth(0.5);
  pdf.line(x, y + HEADER_H, x + w, y + HEADER_H);

  // Black border around the entire card
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(1);
  pdf.roundedRect(x, y, w, h, r, r, 'S');

  // Header text: node label (bold) and subtitle/type (italic)
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14); setText(pdf, fontColor);
  pdf.text(String(label || '').substring(0, 32), x + 12, y + 22);
  pdf.setFont('helvetica', 'italic'); pdf.setFontSize(11); pdf.setTextColor(85, 85, 85);
  pdf.text(subtitle || '', x + 12, y + 38);

  // Render body content items
  let cursor = y + HEADER_H;
  body.forEach(item => {
    switch (item.type) {
      case 'sectionLabel':
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(170, 170, 170);
        pdf.text(item.text.toUpperCase(), x + 12, cursor + 14); cursor += SECTION_LABEL_H; break;
      case 'text':
        pdf.setFont('helvetica', item.italic ? 'italic' : 'normal'); pdf.setFontSize(11); setText(pdf, item.color || '#555');
        pdf.text(String(item.text).substring(0, 42), x + 12, cursor + 14); cursor += TEXT_LINE_H; break;
      case 'bold':
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); setText(pdf, item.color || '#292929');
        pdf.text(String(item.text).substring(0, 38), x + 12, cursor + 14); cursor += TEXT_LINE_H; break;
      case 'labelVal': {
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(170, 170, 170);
        const lbl = item.label + ':'; pdf.text(lbl, x + 12, cursor + 14);
        const lw = pdf.getTextWidth(lbl) + 4;
        pdf.setFont('helvetica', 'bold'); setText(pdf, item.valColor || '#005073');
        pdf.text(String(item.value).substring(0, 30), x + 12 + lw, cursor + 14); cursor += TEXT_LINE_H; break;
      }
      case 'assign': {
        // Variable assignment: "varName = value" in courier font
        pdf.setFont('courier', 'bold'); pdf.setFontSize(10); pdf.setTextColor(0, 80, 115);
        const vt = String(item.variable).substring(0, 18); pdf.text(vt, x + 12, cursor + 10);
        const vw = pdf.getTextWidth(vt);
        pdf.setFont('courier', 'normal'); pdf.setTextColor(153, 153, 153); pdf.text(' = ', x + 12 + vw, cursor + 10);
        const ew = pdf.getTextWidth(' = '); pdf.setTextColor(230, 81, 0);
        pdf.text(String(item.value), x + 12 + vw + ew, cursor + 10); cursor += ASSIGNMENT_H; break;
      }
      case 'exprBox':
        // Light gray rounded box for condition expressions
        pdf.setFillColor(249, 249, 249); pdf.setDrawColor(238, 238, 238); pdf.setLineWidth(0.5);
        pdf.roundedRect(x + 12, cursor + 4, w - 24, EXPR_BOX_H - 8, 4, 4, 'FD');
        pdf.setFont('helvetica', 'italic'); pdf.setFontSize(10); pdf.setTextColor(133, 133, 133);
        pdf.text(String(item.text).substring(0, 42), x + 16, cursor + 18); cursor += EXPR_BOX_H; break;
      case 'msgBox':
        // Blue-tinted box for message previews
        pdf.setFillColor(225, 245, 254); pdf.setDrawColor(179, 229, 252); pdf.setLineWidth(0.5);
        pdf.roundedRect(x + 12, cursor + 4, w - 24, MSG_BOX_H - 8, 4, 4, 'FD');
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(2, 119, 189);
        pdf.text(String(item.text).substring(0, 45), x + 16, cursor + 18); cursor += MSG_BOX_H; break;
      case 'badge': {
        // Centered pill badge (used by DisconnectNode for "End of Flow")
        setFill(pdf, item.bg); pdf.roundedRect(x + 40, cursor + 4, w - 80, BADGE_H - 8, 10, 10, 'F');
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); setText(pdf, item.fg);
        const bw = pdf.getTextWidth(item.text); pdf.text(item.text, x + w / 2 - bw / 2, cursor + 18); cursor += BADGE_H; break;
      }
    }
  });

  // Render exit handle rows
  exits.forEach(exit => {
    // Optional separator line before this exit group
    if (exit.sep) { pdf.setDrawColor(238, 238, 238); pdf.setLineWidth(0.5); pdf.line(x, cursor + SEP_H / 2, x + w, cursor + SEP_H / 2); cursor += SEP_H; }

    // Optional numbered badge (for MenuNode choices: "1", "2", etc.)
    if (exit.badge) {
      pdf.setDrawColor(204, 204, 204); pdf.setFillColor(255, 255, 255); pdf.setLineWidth(0.5);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
      const btw = pdf.getTextWidth(exit.badge); const bw = Math.max(18, btw + 8);
      pdf.roundedRect(x + 12, cursor + 3, bw, 18, 9, 9, 'FD');
      pdf.setTextColor(85, 85, 85); pdf.text(exit.badge, x + 12 + bw / 2, cursor + 15, { align: 'center' });
    }

    // Exit label text (right-aligned)
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11); setText(pdf, exit.color);
    pdf.text(exit.label, x + w - 20, cursor + 16, { align: 'right' });

    // Output handle dot (filled circle with white inner circle)
    pdf.setFillColor(85, 85, 85); pdf.circle(x + w, cursor + ROW_H / 2, HANDLE_R, 'F');
    pdf.setFillColor(255, 255, 255); pdf.circle(x + w, cursor + ROW_H / 2, HANDLE_R - 2, 'F');
    cursor += ROW_H;
  });

  // Input handle dot on the left side (except for StartNode which has no input)
  if (type !== 'StartNode') {
    pdf.setFillColor(85, 85, 85); pdf.circle(x, y + 24, HANDLE_R, 'F');
    pdf.setFillColor(255, 255, 255); pdf.circle(x, y + 24, HANDLE_R - 2, 'F');
  }
}

// ============================================================
// EDGE DRAWING
// Renders a cubic Bezier curve from (sx,sy) to (tx,ty) with an
// arrowhead at the target end. Handles two cases:
//   - Forward edges: smooth S-curve from right handle to left handle
//   - Backward edges: arc up and over the nodes to avoid crossing
// ============================================================
function drawEdge(pdf, sx, sy, tx, ty, color) {
  setDraw(pdf, color); pdf.setLineWidth(2);

  const dx = tx - sx;
  const dy = ty - sy;

  // Detect backward edges (target is to the left of or overlapping the source)
  const isBackward = dx < 50;
  let c1x, c1y, c2x, c2y;

  if (isBackward) {
    // Loop-back arc: extends right of source and left of target, arcing above both.
    // loopOut scales with vertical distance so tall loops don't look pinched.
    // arcTop scales with horizontal distance so wide loops don't look flat.
    const loopOut = Math.max(80, Math.abs(dy) * 0.25 + 60);
    const arcTop  = Math.min(sy, ty) - Math.max(60, Math.abs(dx) * 0.15 + 40);
    c1x = sx + loopOut; c1y = arcTop;
    c2x = tx - loopOut; c2y = arcTop;
  } else {
    // Forward S-curve: enforce a minimum offset of 60pt so short/vertical
    // connections still have a visible curve instead of a near-straight line.
    const hDist = Math.max(Math.abs(dx) * 0.45, 60);
    c1x = sx + hDist; c1y = sy;
    c2x = tx - hDist; c2y = ty;
  }

  // Draw the cubic Bezier curve
  pdf.lines([[c1x - sx, c1y - sy, c2x - sx, c2y - sy, tx - sx, ty - sy]], sx, sy, [1, 1], 'S');

  // Draw filled triangular arrowhead at the target point
  const a = Math.atan2(ty - c2y, tx - c2x), L = 10, W = 5;
  setFill(pdf, color);
  pdf.triangle(tx, ty, tx - L*Math.cos(a) + W*Math.sin(a), ty - L*Math.sin(a) - W*Math.cos(a), tx - L*Math.cos(a) - W*Math.sin(a), ty - L*Math.sin(a) + W*Math.cos(a), 'F');
}

// ============================================================
// FLOW PAGE LAYOUT CALCULATOR
// Takes raw node/edge data for one flow (main or event) and
// computes: node dimensions, bounding box, page size, and
// content offset (ox, oy) to center the flow on the page.
// ============================================================
function calculatePageLayout(pageData) {
  const { nodes, edges } = pageData;
  if (!nodes || nodes.length === 0) return null;

  // Build nodeMap: merge each node's positional data with its calculated layout
  const nodeMap = {};
  nodes.forEach(n => {
    if (n.isGroupHeader) { nodeMap[n.id] = { ...n, totalHeight: 30, handles: {} }; return; }
    nodeMap[n.id] = { ...n, ...calculateLayout(n.type, n.details) };
  });

  // Compute tight bounding box around all nodes (including handle dots)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  Object.values(nodeMap).forEach(n => {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + NODE_W + HANDLE_R);
    maxY = Math.max(maxY, n.y + n.totalHeight);
  });

  // Expand bounding box upward for backward-looping edges that arc above nodes.
  // Must mirror the loopOut / arcTop formula in drawEdge exactly.
  (edges || []).forEach(edge => {
    const src = nodeMap[edge.source], tgt = nodeMap[edge.target];
    if (!src || !tgt) return;
    const edgeDx = tgt.x - src.x;
    if (edgeDx < 50) {
      const srcHY  = src.handles[edge.sourceHandle] || HEADER_H / 2;
      const rawSy  = src.y + srcHY;
      const rawTy  = tgt.y + 24;
      const edgeDy = rawTy - rawSy;
      const arcTop = Math.min(rawSy, rawTy) - Math.max(60, Math.abs(edgeDx) * 0.15 + 40);
      // loopOut can push the control points further right/left — account for that
      // in minX/maxX too if needed, but primarily guard the top boundary here.
      minY = Math.min(minY, arcTop);
      // loopOut = Math.max(80, Math.abs(edgeDy) * 0.25 + 60) — update X bounds
      const loopOut = Math.max(80, Math.abs(edgeDy) * 0.25 + 60);
      minX = Math.min(minX, tgt.x - loopOut);
      maxX = Math.max(maxX, src.x + NODE_W + loopOut);
    }
  });

  // Calculate page dimensions with margin, enforcing minimum sizes
  const margin = 80, cW = maxX - minX, cH = maxY - minY;
  const pageW = Math.max(cW + 2 * margin, 842);
  const pageH = Math.max(cH + 2 * margin, 595);

  // Content offset centers the flow on the page
  return {
    nodeMap, edges, pageW, pageH,
    ox: margin - minX + (pageW - cW - 2 * margin) / 2,
    oy: margin - minY + (pageH - cH - 2 * margin) / 2,
  };
}

// ============================================================
// FLOW PAGE RENDERER
// Draws all edges and nodes for one flow onto the current PDF
// page, and adds clickable link annotations on each node that
// navigate to its detail section on the appropriate detail page.
// ============================================================
function renderFlowPage(pdf, layout, detailPlan) {
  const { nodeMap, edges, ox, oy, pageH } = layout;
  const { nodeToPage, nodeToDetailY } = detailPlan;

  // Draw edges first (behind nodes)
  (edges || []).forEach(edge => {
    const src = nodeMap[edge.source], tgt = nodeMap[edge.target];
    if (!src || !tgt) return;
    const hY = src.handles[edge.sourceHandle];
    drawEdge(pdf, src.x + NODE_W + ox, (hY !== undefined ? src.y + hY : src.y + HEADER_H / 2) + oy, tgt.x + ox, tgt.y + 24 + oy, edge.color);
  });

  // Draw nodes on top of edges
  Object.values(nodeMap).forEach(n => {
    // Apply content offset to get absolute page position
    const s = { ...n, x: n.x + ox, y: n.y + oy };

    // Group headers are simple text + line dividers (for event flow sections)
    if (n.isGroupHeader) {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(24); pdf.setTextColor(136, 136, 136);
      pdf.text(n.label, s.x, s.y + 20);
      pdf.setDrawColor(204, 204, 204); pdf.setLineWidth(1); pdf.line(s.x, s.y + 26, s.x + 400, s.y + 26);
      return;
    }

    drawNode(pdf, s);

    // Add clickable link annotation over the node card
    if (nodeToPage && nodeToPage[n.id]) {
      const detY = (nodeToDetailY && nodeToDetailY[n.id]) || 0;
      // jsPDF quirk: XYZ link handler converts top using the LAST ACTIVE page's
      // height (always 792pt after detail pages are created). Passing detY directly
      // yields: 792 - detY = correct PDF Y position on the detail page.
      // left:0 positions at the page's left edge; zoom:1 sets 100% zoom.
      pdf.link(s.x, s.y, NODE_W, s.totalHeight, { pageNumber: nodeToPage[n.id], magFactor: 'XYZ', left: 0, top: detY, zoom: 1 });
    }
  });
}

// ============================================================
// NODE DETAIL SECTIONS
// Generates structured detail content for each node type,
// mirroring what the React DetailsPanel components display.
// Returns an array of sections, each with a title and items.
// Item types: 'kv' (key-value), 'code' (monospace block), 'map' (variable mapping).
// ============================================================
function getNodeDetailSections(type, details) {
  const d = details || {};
  const secs = [];

  switch (type) {
    case 'StartNode':
      secs.push({ title: 'Trigger', items: [
        { type: 'kv', k: 'Event', v: d.event || 'NewPhoneContact' },
        { type: 'kv', k: 'Channel', v: d.channel || 'Telephony' },
      ] }); break;

    case 'MenuNode': {
      const prompts = d.promptsTts || [];
      if (prompts.length > 0) secs.push({ title: 'Prompt', items: prompts.map(p => ({ type: 'code', badge: p.type === 'tts' ? 'TTS' : 'Audio', text: p.value || p.name || '' })) });
      secs.push({ title: 'Settings', items: [
        { type: 'kv', k: 'Entry Timeout', v: (d.entryTimeout || '10') + 's' },
        { type: 'kv', k: 'Interruptible', v: d.interruptible ? 'Yes' : 'No' },
      ] }); break;
    }

    case 'CollectDigitsNode':
      secs.push({ title: 'Input Configuration', items: [
        { type: 'kv', k: 'Variable', v: d.variable || 'Digits' },
        { type: 'kv', k: 'Max Digits', v: String(d.maxDigits || 'N/A') },
        { type: 'kv', k: 'Min Digits', v: String(d.minDigits || '1') },
        { type: 'kv', k: 'Terminator', v: d.terminatorSymbol || 'None' },
      ] });
      secs.push({ title: 'Timers', items: [
        { type: 'kv', k: 'Entry Timeout', v: (d.entryTimeout || 'N/A') + 's' },
        { type: 'kv', k: 'Inter-digit Timeout', v: (d.interDigitTimeout || 'N/A') + 's' },
      ] }); break;

    case 'PlayMessageNode': {
      const prompts = d.promptsTts || d.prompts || [];
      secs.push({ title: 'Settings', items: [{ type: 'kv', k: 'Interruptible', v: d.interruptible ? 'Yes' : 'No' }] });
      if (prompts.length > 0) secs.push({ title: 'Audio Source', items: prompts.map(p => ({ type: 'code', badge: (p.type === 'tts' ? 'TTS' : 'Audio'), text: p.value || p.name || '' })) });
      break;
    }

    case 'PlayMusicNode':
      secs.push({ title: 'Music Settings', items: [
        { type: 'kv', k: 'Duration', v: d.duration ? d.duration + 's' : 'Continuous' },
        { type: 'kv', k: 'Source', v: d.audioRadioGroup || 'Static Audio' },
      ] });
      secs.push({ title: 'Audio File', items: [{ type: 'code', text: d.prompt || d['prompt:name'] || d.musicFile || 'Default' }] });
      break;

    case 'SetVariableNode': {
      let vars = [];
      if (Array.isArray(d.setVariablesArray) && d.setVariablesArray.length > 0) vars = d.setVariablesArray;
      else if (d.srcVariable) vars = [d];
      secs.push({ title: 'Variables (' + vars.length + ')', items: vars.length > 0
        ? vars.map(v => ({ type: 'kv', k: v.srcVariable || v.name || '?', v: String(v.literal || v.value || v.expr || v.tgtVariable || 'null') }))
        : [{ type: 'kv', k: 'Status', v: 'No variables set' }]
      }); break;
    }

    case 'ConditionNode':
      secs.push({ title: 'Configuration', items: [{ type: 'kv', k: 'Description', v: d.description || 'N/A' }] });
      if (d.expression) secs.push({ title: 'Expression', items: [{ type: 'code', text: d.expression }] });
      break;

    case 'BusinessHoursNode':
      secs.push({ title: 'Schedule', items: [
        { type: 'kv', k: 'Schedule', v: d['businessHoursId:name'] || d.businessHoursId || 'N/A' },
        { type: 'kv', k: 'Mode', v: d.businessHoursRadioGroup || 'N/A' },
      ] }); break;

    case 'QueueContactNode': {
      const isSB = d['destination:type'] === 'SKILLS_BASED';
      secs.push({ title: 'Queue Selection', items: [
        { type: 'kv', k: 'Mode', v: d.queueRadioGroup || 'Static' },
        { type: 'kv', k: 'Destination', v: d['destination:name'] || d.destination || d.destinationVariable || 'N/A' },
        { type: 'kv', k: 'Type', v: isSB ? 'Skill-Based' : 'Queue-Based' },
      ] });
      if (isSB && d.skills) secs.push({ title: 'Skill Requirements', items: [{ type: 'code', text: JSON.stringify(d.skills, null, 2) }] });
      break;
    }

    case 'QueueLookupNode':
      secs.push({ title: 'Lookup Settings', items: [
        { type: 'kv', k: 'Lookback', v: (d.ewtLookbackMinutes || 'N/A') + ' min' },
        { type: 'kv', k: 'Queue', v: d['destination:name'] || d.destination || 'N/A' },
      ] }); break;

    case 'TransferNode':
      if (d.handOffFlow) secs.push({ title: 'Flow Handoff', items: [
        { type: 'kv', k: 'Flow Name', v: d.handOffFlow.handOffToName || 'N/A' },
        { type: 'kv', k: 'Flow ID', v: d.handOffFlow.handOffTo || 'N/A' },
      ] });
      else secs.push({ title: 'Blind Transfer', items: [{ type: 'kv', k: 'Destination', v: d['transfertodn:name'] || d.transfertodn || 'N/A' }] });
      break;

    case 'HandoffNode':
      if (d.handOffFlow) {
        secs.push({ title: 'Flow Handoff', items: [
          { type: 'kv', k: 'Flow Name', v: d.handOffFlow.handOffToName || 'N/A' },
          { type: 'kv', k: 'Flow ID', v: d.handOffFlow.handOffTo || 'N/A' },
          { type: 'kv', k: 'Version', v: d.handOffFlow.flowTagName || 'Latest' },
        ] });
        if (d.handOffFlow.mappedVariableArray) secs.push({ title: 'Variable Mapping', items: [{ type: 'code', text: JSON.stringify(d.handOffFlow.mappedVariableArray, null, 2) }] });
      } break;

    case 'SubflowNode': {
      secs.push({ title: 'Flow Info', items: [{ type: 'kv', k: 'Subflow', v: d.subflowName || 'N/A' }] });
      const si = d.subflowInputVariables || [];
      if (si.length > 0) secs.push({ title: 'Inputs', items: si.map(v => ({ type: 'map', tgt: v.target || '?', src: v.src || '?', arrow: '←' })) });
      const so = d.subflowOutputVariables || [];
      if (so.length > 0) secs.push({ title: 'Outputs', items: so.map(v => ({ type: 'map', tgt: v.target || '?', src: v.src || '?', arrow: '←' })) });
      break;
    }

    case 'HTTPRequestNode':
      secs.push({ title: 'Request Config', items: [
        { type: 'kv', k: 'Method', v: d.httpRequestMethod || 'GET' },
        { type: 'kv', k: 'URL', v: d.httpRequestUrl || 'N/A' },
        { type: 'kv', k: 'Content Type', v: d.httpContentType || 'N/A' },
        { type: 'kv', k: 'Timeout', v: (d.httpResponseTimeout || 'N/A') + 'ms' },
      ] });
      if (d.httpQueryParameters && typeof d.httpQueryParameters === 'object') { const p = Object.entries(d.httpQueryParameters); if (p.length > 0) secs.push({ title: 'Query Parameters', items: p.map(([k, v]) => ({ type: 'kv', k, v: String(v) })) }); }
      if (d.httpRequestHeaders && typeof d.httpRequestHeaders === 'object') { const h = Object.entries(d.httpRequestHeaders); if (h.length > 0) secs.push({ title: 'Headers', items: h.map(([k, v]) => ({ type: 'kv', k, v: String(v) })) }); }
      if (Array.isArray(d.outputVariableArray) && d.outputVariableArray.length > 0) secs.push({ title: 'Output Parsing', items: d.outputVariableArray.map(v => ({ type: 'map', tgt: v.outputVariable || '?', src: v.jsonPathExp || '?', arrow: '←' })) });
      break;

    case 'BRERequestNode':
      secs.push({ title: 'Business Rules Engine', items: [
        { type: 'kv', k: 'URL', v: d.httpRequestUrl || 'System Default' },
        { type: 'kv', k: 'Timeout', v: (d.httpResponseTimeout || 'N/A') + 'ms' },
      ] });
      if (d.httpQueryParameters && typeof d.httpQueryParameters === 'object') { const p = Object.entries(d.httpQueryParameters); if (p.length > 0) secs.push({ title: 'Input Parameters', items: p.map(([k, v]) => ({ type: 'kv', k, v: String(v) })) }); }
      if (Array.isArray(d.outputVariableArray) && d.outputVariableArray.length > 0) secs.push({ title: 'Output Parsing', items: d.outputVariableArray.map(v => ({ type: 'map', tgt: v.outputVariable || '?', src: v.jsonPathExp || '?', arrow: '←' })) });
      break;

    case 'ParseNode':
      secs.push({ title: 'Parse Configuration', items: [
        { type: 'kv', k: 'Input', v: d.inputVariable || 'N/A' },
        { type: 'kv', k: 'Format', v: d.contentType || 'N/A' },
      ] });
      if (Array.isArray(d.outputVariableArray) && d.outputVariableArray.length > 0) secs.push({ title: 'Output Mapping', items: d.outputVariableArray.map(v => ({ type: 'map', tgt: v.outputVariable || '?', src: v.jsonPathExp || '?', arrow: '←' })) });
      break;

    case 'FunctionNode': {
      secs.push({ title: 'Custom Function', items: [
        { type: 'kv', k: 'Name', v: d.fnName || d.functionName || 'N/A' },
        { type: 'kv', k: 'Version', v: (d.fnVersionConfig && d.fnVersionConfig.version) || 'Latest' },
      ] });
      const fi = d.fnInputVariables || [];
      if (fi.length > 0) secs.push({ title: 'Inputs', items: fi.map(v => ({ type: 'map', tgt: v.target || v.outputVariable || '?', src: v.src || v.jsonPathExp || '?', arrow: '←' })) });
      const fo = d.fnOutputVariables || [];
      if (fo.length > 0) secs.push({ title: 'Outputs', items: fo.map(v => ({ type: 'map', tgt: v.target || v.outputVariable || '?', src: v.src || v.jsonPathExp || '?', arrow: '→' })) });
      break;
    }

    case 'DisconnectNode':
      secs.push({ title: 'Action', items: [{ type: 'kv', k: 'Behavior', v: 'Disconnect Contact' }] }); break;

    default: {
      // Fallback: display all non-object, non-internal properties as key-value pairs
      const items = [];
      Object.entries(d).forEach(([key, val]) => { if (!key.startsWith('_') && key !== 'activityId' && typeof val !== 'object') items.push({ type: 'kv', k: key, v: String(val) }); });
      if (items.length > 0) secs.push({ title: 'Properties', items });
      break;
    }
  }
  return secs;
}

// ============================================================
// DETAIL HEIGHT ESTIMATION
// Estimates how many vertical points a node's detail section
// will consume. Used by the page planner to decide when to
// start a new page and to compute each node's Y position.
// ============================================================

/** Estimate how many wrapped lines a code block will produce (~75 chars/line) */
function estimateCodeLines(text) {
  const lines = String(text || '').split('\n');
  let total = 0;
  lines.forEach(l => { total += Math.max(1, Math.ceil(l.length / 75)); });
  return total;
}

/**
 * Estimate the total height of one node's detail section including
 * header, all sections, items, and the back link + gap at the bottom.
 */
function estimateDetailHeight(sections) {
  let h = DET_HDR_H;
  sections.forEach(sec => {
    h += DET_SEC_H;
    sec.items.forEach(item => {
      if (item.type === 'kv') {
        // Dynamic height: key label + wrapped value lines
        const valLen = String(item.v || '').length;
        const estLines = Math.max(1, Math.ceil(valLen / 72));
        h += 30 + estLines * 14;
      }
      else if (item.type === 'code') {
        const lines = estimateCodeLines(item.text);
        h += (item.badge ? 18 : 4) + 10 + lines * DET_CODE_LINE + 8 + 4;
      }
      else if (item.type === 'map') h += DET_MAP_H;
    });
  });
  h += DET_BACK_H + DET_GAP;
  return h;
}

// ============================================================
// DETAIL PAGE PLANNER
// Determines which PDF page number each node's details will
// appear on, and the Y position within that page. Packs nodes
// sequentially, starting a new page when the current one is full.
// ============================================================
function planDetailPages(detailNodes, startPage) {
  const nodeToPage = {};      // nodeId → page number
  const nodeToDetailY = {};   // nodeId → Y position (jsPDF coords) on its detail page
  let page = startPage;
  let used = 0;
  const cap = DET_PAGE_H - 2 * DET_MARGIN; // Usable vertical space per page

  detailNodes.forEach(n => {
    const h = estimateDetailHeight(n.sections);
    // Start a new page if this node won't fit on the current one
    if (used > 0 && used + h > cap) { page++; used = 0; }
    nodeToPage[n.id] = page;
    nodeToDetailY[n.id] = DET_MARGIN + used;
    used += h;
  });

  return { nodeToPage, nodeToDetailY, totalPages: detailNodes.length > 0 ? page - startPage + 1 : 0 };
}

// ============================================================
// DETAIL PAGE RENDERER
// Draws the actual detail content for each node onto US Letter
// pages: colored header bar, section titles, key-value pairs,
// code blocks, variable mappings, and a back-to-flow link.
// ============================================================
function renderDetailPages(pdf, detailNodes, plan, flowPageNum, flowPageH) {
  if (detailNodes.length === 0) return;

  let currentPage = -1;
  let cy = 0;               // Current Y cursor position
  const mx = DET_MARGIN;    // Left margin X
  const w = DET_W;           // Content width

  detailNodes.forEach(n => {
    const targetPage = plan.nodeToPage[n.id];

    // Start a new PDF page when moving to the next planned page
    if (targetPage !== currentPage) {
      pdf.addPage();
      pdf.internal.pageSize.setWidth(DET_PAGE_W);
      pdf.internal.pageSize.setHeight(DET_PAGE_H);
      currentPage = targetPage;
      cy = DET_MARGIN;
    }

    // --- Node detail header bar (colored, matching the node's theme) ---
    setFill(pdf, n.headerColor);
    pdf.roundedRect(mx, cy, w, DET_HDR_H - 4, 6, 6, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    setText(pdf, n.fontColor || '#292929');
    pdf.text(String(n.label || '').substring(0, 60), mx + 12, cy + 17);
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(10);
    pdf.setTextColor(80, 80, 80);
    pdf.text(n.subtitle || '', mx + 12, cy + 30);
    cy += DET_HDR_H;

    // --- Render each section (e.g. "TRIGGER", "SETTINGS", "VARIABLES") ---
    n.sections.forEach(sec => {
      // Section title with underline
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(153, 153, 153);
      pdf.text(sec.title.toUpperCase(), mx + 4, cy + 15);
      pdf.setDrawColor(230, 230, 230);
      pdf.setLineWidth(0.5);
      pdf.line(mx + 4, cy + 18, mx + w - 4, cy + 18);
      cy += DET_SEC_H;

      // Render each item in the section
      sec.items.forEach(item => {
        switch (item.type) {
          // Key-value pair: gray label on top, dark value below (wraps to multiple lines)
          case 'kv': {
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(9);
            pdf.setTextColor(120, 120, 120);
            pdf.text(item.k, mx + 8, cy + 12);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(11);
            pdf.setTextColor(34, 34, 34);
            const valLines = pdf.splitTextToSize(String(item.v), w - 16);
            valLines.forEach((line, li) => {
              pdf.text(line, mx + 8, cy + 26 + li * 14);
            });
            cy += 30 + valLines.length * 14;
            break;
          }

          // Code block: monospace text in a gray rounded box, optional badge (TTS/Audio)
          case 'code': {
            let codeTop = cy + 4;

            // Optional type badge above the code box (e.g. "TTS", "Audio")
            if (item.badge) {
              pdf.setFillColor(2, 119, 189);
              pdf.roundedRect(mx + 8, cy + 2, 32, 13, 3, 3, 'F');
              pdf.setFont('helvetica', 'bold');
              pdf.setFontSize(7);
              pdf.setTextColor(255, 255, 255);
              pdf.text(item.badge, mx + 24, cy + 11, { align: 'center' });
              codeTop = cy + 18;
            }

            // Split text for wrapping, then draw the gray background box
            pdf.setFont('courier', 'normal');
            pdf.setFontSize(9);
            const codeLines = pdf.splitTextToSize(String(item.text || ''), w - 40);
            const boxH = 10 + codeLines.length * DET_CODE_LINE + 8;

            pdf.setFillColor(245, 245, 245);
            pdf.setDrawColor(230, 230, 230);
            pdf.setLineWidth(0.5);
            pdf.roundedRect(mx + 8, codeTop, w - 16, boxH, 4, 4, 'FD');

            // Render each line of code inside the box
            pdf.setTextColor(60, 60, 60);
            codeLines.forEach((line, li) => {
              pdf.text(line, mx + 16, codeTop + 10 + (li + 0.7) * DET_CODE_LINE);
            });

            cy = codeTop + boxH + 4;
            break;
          }

          // Variable mapping: "target ← source" with arrow in between
          case 'map':
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(10);
            pdf.setTextColor(120, 120, 120);
            pdf.text(item.tgt, mx + 8, cy + 14);
            {
              const tw = pdf.getTextWidth(item.tgt);
              pdf.setTextColor(180, 180, 180);
              pdf.text(' ' + item.arrow + ' ', mx + 8 + tw, cy + 14);
              const aw = pdf.getTextWidth(' ' + item.arrow + ' ');
              pdf.setFont('courier', 'normal');
              pdf.setFontSize(9);
              pdf.setTextColor(34, 34, 34);
              pdf.text(String(item.src).substring(0, 60), mx + 8 + tw + aw, cy + 14);
            }
            cy += DET_MAP_H;
            break;
        }
      });
    });

    // --- Separator line between this node's details and the back link ---
    pdf.setDrawColor(220, 220, 220);
    pdf.setLineWidth(0.5);
    pdf.line(mx, cy + 4, mx + w, cy + 4);
    cy += 12;

    // --- "Back to <Node>" link ---
    // Clicking this navigates back to the node's position on the flow diagram page.
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(2, 119, 189);
    pdf.text('\u2190 Back to ' + String(n.label || 'Flow Diagram').substring(0, 40), mx + 4, cy + 14);

    // jsPDF XYZ coordinate adjustment for cross-page-size links:
    // The XYZ handler converts top via (currentPageH - top). Since we're on a detail
    // page (792pt) but targeting the flow page (flowPageH), we pre-adjust the value:
    //   792 - adjTop should equal flowPageH - flowAbsY + 30
    //   → adjTop = 792 - flowPageH + flowAbsY - 30
    // The -30 adds breathing room so the node isn't clipped at the viewport edge.
    const adjTop = DET_PAGE_H - flowPageH + (n.flowAbsY || 0) - 30;
    pdf.link(mx, cy, w, 18, {
      pageNumber: flowPageNum,
      magFactor: 'XYZ',
      left: Math.max(0, (n.flowAbsX || 0) - 50),
      top: adjTop,
      zoom: 0, // preserve the viewer's current zoom level
    });
    cy += DET_BACK_H + DET_GAP;
  });
}

// ============================================================
// WEB WORKER MESSAGE HANDLER
// Entry point: receives { pages } from DownloadButton.jsx,
// orchestrates the three-phase PDF generation, and returns
// a blob via postMessage.
// ============================================================
self.onmessage = (e) => {
  const { pages } = e.data;

  try {
    // --------------------------------------------------------
    // Phase 1: Pre-calculate layouts and detail section data
    // For each flow (main, event), compute the page layout and
    // generate detail sections for every non-header node.
    // --------------------------------------------------------
    const flowDataSets = [];
    pages.forEach(pageData => {
      const layout = calculatePageLayout(pageData);
      if (!layout) return;

      // Build detail node list sorted top-to-bottom, left-to-right.
      // Each node gets its detail sections pre-generated and its
      // absolute position on the flow page stored for back-link targeting.
      const detailNodes = Object.values(layout.nodeMap)
        .filter(n => !n.isGroupHeader)
        .sort((a, b) => a.y - b.y || a.x - b.x)
        .map(n => ({
          ...n,
          sections: getNodeDetailSections(n.type, n.details),
          flowAbsX: n.x + layout.ox, // Absolute X on the flow PDF page
          flowAbsY: n.y + layout.oy, // Absolute Y on the flow PDF page
        }));

      flowDataSets.push({ layout, detailNodes });
    });

    if (flowDataSets.length === 0) {
      self.postMessage({ type: 'error', error: 'No content to export' });
      return;
    }

    // --------------------------------------------------------
    // Phase 2: Assign page numbers
    // Page 1 = main flow diagram, pages 2-N = main flow details,
    // then event flow diagram, then event flow details, etc.
    // --------------------------------------------------------
    let pageNum = 1;
    const renderQueue = [];

    flowDataSets.forEach(ds => {
      const flowPageNum = pageNum;
      pageNum++;

      const detailPlan = planDetailPages(ds.detailNodes, pageNum);
      pageNum += detailPlan.totalPages;

      renderQueue.push({ layout: ds.layout, detailNodes: ds.detailNodes, detailPlan, flowPageNum });
    });

    // --------------------------------------------------------
    // Phase 3: Create jsPDF instance and render all pages
    // --------------------------------------------------------
    const pdf = new jsPDF({ unit: 'pt', compress: true });

    // Set initial zoom so the flow diagram fits a typical viewer window.
    // This outputs /OpenAction [page /XYZ null null zoom] in the PDF.
    const firstLayout = renderQueue[0].layout;
    const initialZoom = Math.max(0.02, Math.min(1, 1200 / firstLayout.pageW, 800 / firstLayout.pageH));
    pdf.setDisplayMode(initialZoom);

    renderQueue.forEach((item, idx) => {
      // The first page already exists from `new jsPDF()`; add new pages for subsequent flows
      if (idx > 0) pdf.addPage();

      // Set the flow page to its computed custom dimensions
      pdf.internal.pageSize.setWidth(item.layout.pageW);
      pdf.internal.pageSize.setHeight(item.layout.pageH);

      // Render the flow diagram, then all its detail pages
      renderFlowPage(pdf, item.layout, item.detailPlan);
      renderDetailPages(pdf, item.detailNodes, item.detailPlan, item.flowPageNum, item.layout.pageH);
    });

    // Send the completed PDF blob back to the main thread
    self.postMessage({ type: 'success', blob: pdf.output('blob') });
  } catch (error) {
    self.postMessage({ type: 'error', error: error.message || 'Unknown error' });
  }
};
