// ─── Constants & Helpers ────────────────────────────────────────────────────

const DEGREE_COLORS = [
  '#e05c6e', // 1 – root
  '#e0804a', // 2
  '#d4a843', // 3
  '#7fc45c', // 4
  '#4cb8a8', // 5
  '#5a9fe0', // 6
  '#9a70e0', // 7
  '#c96ac0', // 8 – octave
];

const DEGREE_NAMES = ['', '1 (Root)', '2nd', '3rd', '4th', '5th', '6th', '7th', '8 (Oct)'];
const NOTE_NAMES_MAJOR = ['', 'C', 'D', 'E', 'F', 'G', 'A', 'B'];

function degreeColor(deg) {
  return DEGREE_COLORS[((deg - 1) % 8 + 8) % 8];
}

// ─── Storage ────────────────────────────────────────────────────────────────

const LS_KEY = 'jazz-standards-custom';

function loadStandards(base) {
  try {
    const custom = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
    // Merge: custom overrides base by id
    const byId = new Map(base.map(s => [s.id, s]));
    custom.forEach(s => byId.set(s.id, s));
    return Array.from(byId.values());
  } catch { return base; }
}

function saveCustomStandard(std) {
  const custom = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  const idx = custom.findIndex(s => s.id === std.id);
  if (idx >= 0) custom[idx] = std; else custom.push(std);
  localStorage.setItem(LS_KEY, JSON.stringify(custom));
}

function deleteCustomStandard(id) {
  const custom = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  localStorage.setItem(LS_KEY, JSON.stringify(custom.filter(s => s.id !== id)));
}

// ─── Connection Logic ────────────────────────────────────────────────────────

function sharedPrefixLength(a, b) {
  let n = 0;
  const len = Math.min(a.scale_degrees.length, b.scale_degrees.length);
  for (let i = 0; i < len; i++) {
    if (a.scale_degrees[i] === b.scale_degrees[i]) n++;
    else break;
  }
  return n;
}

function buildEdges(standards) {
  const edges = [];
  for (let i = 0; i < standards.length; i++) {
    for (let j = i + 1; j < standards.length; j++) {
      const shared = sharedPrefixLength(standards[i], standards[j]);
      if (shared >= 1) {
        edges.push({ source: standards[i].id, target: standards[j].id, shared });
      }
    }
  }
  return edges;
}

// ─── Main App ────────────────────────────────────────────────────────────────

let standards = [];
let allEdges = [];
let selectedNode = null;
let scrubDepth = 0; // 0 = no scrub active
let playingIds = new Set();
let synth = null;

// D3 references
let simulation, svgEl, gMain, nodeGroups, edgePaths, width, height;

// ─── Init ────────────────────────────────────────────────────────────────────

async function init() {
  const resp = await fetch('standards.json');
  const data = await resp.json();
  standards = loadStandards(data.standards);
  allEdges = buildEdges(standards);
  buildGraph();
  buildEditorList();
  setupControls();
  addLegend();
}

// ─── Graph ───────────────────────────────────────────────────────────────────

const NODE_R = 28; // base node radius
const MELODY_H = 14; // melody strip height inside node

function buildGraph() {
  const container = document.getElementById('graph-container');
  width = container.clientWidth;
  height = container.clientHeight;

  d3.select('#graph').selectAll('*').remove();

  svgEl = d3.select('#graph')
    .attr('width', width)
    .attr('height', height);

  // Zoom & pan
  const zoom = d3.zoom()
    .scaleExtent([0.2, 4])
    .on('zoom', e => gMain.attr('transform', e.transform));
  svgEl.call(zoom);

  gMain = svgEl.append('g');

  // Edges layer
  const edgeLayer = gMain.append('g').attr('class', 'edges');
  // Nodes layer
  const nodeLayer = gMain.append('g').attr('class', 'nodes');

  const nodes = standards.map(s => ({ ...s }));
  const links = allEdges.map(e => ({
    ...e,
    source: nodes.find(n => n.id === e.source),
    target: nodes.find(n => n.id === e.target),
  }));

  // Draw edges
  edgePaths = edgeLayer.selectAll('.edge')
    .data(links)
    .enter().append('line')
    .attr('class', 'edge')
    .attr('data-source', d => d.source.id)
    .attr('data-target', d => d.target.id)
    .attr('data-shared', d => d.shared);

  // Draw nodes
  nodeGroups = nodeLayer.selectAll('.node')
    .data(nodes)
    .enter().append('g')
    .attr('class', 'node')
    .attr('id', d => `node-${d.id}`)
    .call(d3.drag()
      .on('start', dragStart)
      .on('drag', dragging)
      .on('end', dragEnd));

  nodeGroups.append('circle')
    .attr('r', NODE_R)
    .on('click', (e, d) => { e.stopPropagation(); selectNode(d); });

  // Melody strip (rendered as SVG inside the node)
  nodeGroups.each(function(d) {
    const g = d3.select(this);
    const degs = d.scale_degrees;
    const noteCount = Math.min(degs.length, 10);
    const stripW = (NODE_R * 2) - 8;
    const dotSpacing = stripW / (noteCount - 1 || 1);
    const cx0 = -stripW / 2;

    const melodyG = g.append('g')
      .attr('class', 'melody-strip')
      .attr('transform', `translate(0, 6)`)
      .on('mousemove', (e) => onMelodyScrub(e, d, melodyG, stripW, dotSpacing, cx0, noteCount))
      .on('mouseleave', () => onMelodyLeave(d, melodyG))
      .on('click', (e) => { e.stopPropagation(); selectNode(d); });

    // Invisible hit-area
    melodyG.append('rect')
      .attr('x', cx0 - 4)
      .attr('y', -MELODY_H / 2 - 4)
      .attr('width', stripW + 8)
      .attr('height', MELODY_H + 8)
      .attr('fill', 'transparent');

    // Dots
    for (let i = 0; i < noteCount; i++) {
      const deg = degs[i];
      const cx = cx0 + i * dotSpacing;
      const cy = -mapDegreeToY(deg, MELODY_H);
      melodyG.append('circle')
        .attr('class', `melody-dot note-${i}`)
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', 2.5)
        .attr('fill', degreeColor(deg))
        .attr('opacity', 0.6);
      // Connector line to next
      if (i < noteCount - 1) {
        const nextDeg = degs[i + 1];
        const nx = cx0 + (i + 1) * dotSpacing;
        const ny = -mapDegreeToY(nextDeg, MELODY_H);
        melodyG.append('line')
          .attr('class', `note-line-${i}`)
          .attr('x1', cx).attr('y1', cy)
          .attr('x2', nx).attr('y2', ny)
          .attr('stroke', degreeColor(deg))
          .attr('stroke-width', 1)
          .attr('opacity', 0.25);
      }
    }

    // Scrub cursor line
    melodyG.append('line')
      .attr('class', 'melody-cursor')
      .attr('x1', 0).attr('x2', 0)
      .attr('y1', -MELODY_H / 2 - 4)
      .attr('y2', MELODY_H / 2 + 4);
  });

  // Labels below circle
  nodeGroups.append('text')
    .attr('y', NODE_R + 11)
    .text(d => truncate(d.title, 18));

  // Force simulation
  simulation = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links)
      .id(d => d.id)
      .distance(d => 100 + (8 - d.shared) * 20)
      .strength(d => d.shared * 0.03))
    .force('charge', d3.forceManyBody().strength(-500))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide(NODE_R + 20))
    .on('tick', tick);

  // Click on background to deselect
  svgEl.on('click', () => { deselectAll(); });
}

function mapDegreeToY(deg, h) {
  // Map degree 1–8 to -h/2 .. +h/2 (8=top, 1=bottom)
  return ((deg - 1) / 7) * h - h / 2;
}

function tick() {
  edgePaths
    .attr('x1', d => d.source.x)
    .attr('y1', d => d.source.y)
    .attr('x2', d => d.target.x)
    .attr('y2', d => d.target.y);

  nodeGroups.attr('transform', d => `translate(${d.x},${d.y})`);
}

function dragStart(e, d) {
  if (!e.active) simulation.alphaTarget(0.3).restart();
  d.fx = d.x; d.fy = d.y;
}
function dragging(e, d) { d.fx = e.x; d.fy = e.y; }
function dragEnd(e, d) {
  if (!e.active) simulation.alphaTarget(0);
  d.fx = null; d.fy = null;
}

function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// ─── Selection ───────────────────────────────────────────────────────────────

function selectNode(d) {
  deselectAll();
  selectedNode = d;

  // Mark selected
  d3.select(`#node-${d.id}`).classed('selected', true);

  // Determine connected nodes at current depth
  const depth = +document.getElementById('depth-slider').value;
  const connected = getConnectedAt(d.id, depth);
  connected.forEach(id => {
    d3.select(`#node-${id}`).classed('connected', true);
  });

  // Highlight edges
  edgePaths.each(function(e) {
    const isInvolved = (e.source.id === d.id || e.target.id === d.id) && e.shared >= depth;
    d3.select(this)
      .classed('visible', e.shared >= depth)
      .classed('highlighted', isInvolved);
  });

  // Show detail panel
  showDetailPanel(d, connected, depth);
}

function deselectAll() {
  selectedNode = null;
  nodeGroups.classed('selected', false).classed('connected', false)
    .classed('scrub-match', false).classed('scrub-partial', false);
  edgePaths.classed('highlighted', false);
  updateEdgeVisibility();
  document.getElementById('detail-panel').classList.add('hidden');
}

function getConnectedAt(id, depth) {
  return allEdges
    .filter(e => (e.source === id || e.target === id) && e.shared >= depth)
    .map(e => e.source === id ? e.target : e.source);
}

function updateEdgeVisibility() {
  const depth = +document.getElementById('depth-slider').value;
  edgePaths
    .classed('visible', d => d.shared >= depth)
    .classed('highlighted', false);
}

// ─── Melody Scrubbing ────────────────────────────────────────────────────────

function onMelodyScrub(event, d, melodyG, stripW, dotSpacing, cx0, noteCount) {
  const [mx] = d3.pointer(event, melodyG.node());
  const rawIdx = (mx - cx0) / dotSpacing;
  const idx = Math.max(0, Math.min(noteCount - 1, Math.round(rawIdx)));
  const scrubNotes = d.scale_degrees.slice(0, idx + 1);

  // Update cursor line
  const cursorX = cx0 + idx * dotSpacing;
  melodyG.select('.melody-cursor')
    .attr('x1', cursorX).attr('x2', cursorX)
    .attr('opacity', 0.8);

  // Light up dots up to cursor, dim rest
  melodyG.selectAll('.melody-dot').each(function(_, i) {
    d3.select(this)
      .attr('opacity', i <= idx ? 1 : 0.2)
      .attr('r', i === idx ? 4 : 2.5);
  });

  // Highlight all nodes that share the same prefix
  nodeGroups.each(function(nd) {
    if (nd.id === d.id) return;
    const shared = sharedPrefixLength(d, nd);
    // Full match = shares at least idx+1 notes
    const fullMatch = shared >= idx + 1;
    // Partial = shares at least 1 but fewer
    const partial = shared > 0 && shared < idx + 1;
    d3.select(this)
      .classed('scrub-match', fullMatch)
      .classed('scrub-partial', partial);
  });

  // Highlight edges
  edgePaths.each(function(e) {
    const involves = e.source.id === d.id || e.target.id === d.id;
    const otherId = e.source.id === d.id ? e.target.id : e.source.id;
    const shared = sharedPrefixLength(d, standards.find(s => s.id === otherId));
    d3.select(this)
      .classed('visible', involves && shared >= 1)
      .classed('highlighted', involves && shared >= idx + 1);
  });

  // Show tooltip
  const matches = standards.filter(s => s.id !== d.id && sharedPrefixLength(d, s) >= idx + 1);
  showTooltip(event, d, idx + 1, matches);
}

function onMelodyLeave(d, melodyG) {
  melodyG.select('.melody-cursor').attr('opacity', 0);
  melodyG.selectAll('.melody-dot').attr('opacity', 0.6).attr('r', 2.5);

  nodeGroups.classed('scrub-match', false).classed('scrub-partial', false);

  if (selectedNode) {
    selectNode(selectedNode);
  } else {
    updateEdgeVisibility();
    hideTooltip();
  }
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function showTooltip(event, d, depth, matches) {
  const tip = document.getElementById('tooltip');
  const [px, py] = d3.pointer(event, document.getElementById('graph-container'));
  tip.classList.remove('hidden');
  tip.style.left = (px + 20) + 'px';
  tip.style.top = (py - 10) + 'px';
  const matchList = matches.slice(0, 5).map(s => s.title).join(', ');
  const more = matches.length > 5 ? ` +${matches.length - 5} more` : '';
  tip.innerHTML = `
    <strong>${d.title}</strong>
    <span>First ${depth} note${depth > 1 ? 's' : ''} matched by ${matches.length} other${matches.length !== 1 ? 's' : ''}:</span><br>
    <span>${matchList}${more}</span>
  `;
}

function hideTooltip() {
  document.getElementById('tooltip').classList.add('hidden');
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

function showDetailPanel(d, connected, depth) {
  const panel = document.getElementById('detail-panel');
  panel.classList.remove('hidden');

  document.getElementById('detail-title').textContent = d.title;
  document.getElementById('detail-meta').textContent =
    `${d.composer || '?'} · Key: ${d.key} · ${d.time_signature} · ♩=${d.tempo}`;

  // Large melody display
  renderDetailMelody(d);

  // Connections list
  const connDiv = document.getElementById('detail-connections');
  const connectedStandards = allEdges
    .filter(e => (e.source === d.id || e.target === d.id))
    .map(e => ({
      id: e.source === d.id ? e.target : e.source,
      shared: e.shared
    }))
    .sort((a, b) => b.shared - a.shared);

  if (connectedStandards.length === 0) {
    connDiv.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem">No shared starting notes found.</p>';
    return;
  }

  connDiv.innerHTML = `<h3>Shares starting notes with</h3>`;
  connectedStandards.forEach(({ id, shared }) => {
    const s = standards.find(x => x.id === id);
    if (!s) return;
    const degreeDots = s.scale_degrees.slice(0, shared).map(deg =>
      `<span style="color:${degreeColor(deg)};font-weight:600">${DEGREE_NAMES[deg] || deg}</span>`
    ).join(', ');
    const item = document.createElement('div');
    item.className = 'connection-item';
    item.innerHTML = `
      <span>${s.title}</span>
      <span class="connection-count">${shared}</span>
    `;
    item.title = `Shared: ${degreeDots}`;
    item.onclick = () => {
      const nd = d3.selectAll('.node').data().find(x => x.id === id);
      if (nd) selectNode(nd);
    };
    connDiv.appendChild(item);
  });
}

function renderDetailMelody(d) {
  const container = document.getElementById('detail-melody');
  const W = 272, H = 60;
  const degs = d.scale_degrees;
  const n = degs.length;
  const spacing = (W - 24) / Math.max(n - 1, 1);
  const x0 = 12;

  let html = `<svg viewBox="0 0 ${W} ${H}" style="overflow:visible">`;

  // Draw guide lines for each degree
  for (let deg = 1; deg <= 8; deg++) {
    const y = H - 8 - ((deg - 1) / 7) * (H - 16);
    html += `<line x1="0" y1="${y}" x2="${W}" y2="${y}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>`;
  }

  // Lines between notes
  for (let i = 0; i < n - 1; i++) {
    const x1 = x0 + i * spacing;
    const y1 = H - 8 - ((degs[i] - 1) / 7) * (H - 16);
    const x2 = x0 + (i + 1) * spacing;
    const y2 = H - 8 - ((degs[i + 1] - 1) / 7) * (H - 16);
    html += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${degreeColor(degs[i])}" stroke-width="1.5" opacity="0.4"/>`;
  }

  // Dots + labels
  for (let i = 0; i < n; i++) {
    const x = x0 + i * spacing;
    const y = H - 8 - ((degs[i] - 1) / 7) * (H - 16);
    html += `<circle cx="${x}" cy="${y}" r="5" fill="${degreeColor(degs[i])}" opacity="0.9"/>`;
    html += `<text x="${x}" y="${y + 14}" text-anchor="middle" font-size="8" fill="${degreeColor(degs[i])}" opacity="0.8">${degs[i]}</text>`;
  }

  html += '</svg>';
  container.innerHTML = html;
}

// ─── Controls ─────────────────────────────────────────────────────────────────

function setupControls() {
  const slider = document.getElementById('depth-slider');
  const label = document.getElementById('depth-label');

  slider.addEventListener('input', () => {
    const v = +slider.value;
    label.textContent = v;
    updateEdgeVisibility();
    if (selectedNode) selectNode(selectedNode);
  });

  document.getElementById('show-labels').addEventListener('change', e => {
    d3.selectAll('.node text').style('opacity', e.target.checked ? 1 : 0);
  });

  document.getElementById('close-detail').addEventListener('click', () => {
    document.getElementById('detail-panel').classList.add('hidden');
    deselectAll();
  });

  document.getElementById('editor-toggle').addEventListener('click', () => {
    document.getElementById('editor-panel').classList.toggle('hidden');
  });

  document.getElementById('close-editor').addEventListener('click', () => {
    document.getElementById('editor-panel').classList.add('hidden');
  });

  document.getElementById('editor-form').addEventListener('submit', onEditorSubmit);
  document.getElementById('export-btn').addEventListener('click', exportJSON);
  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });
  document.getElementById('import-file').addEventListener('change', importJSON);

  document.getElementById('play-btn').addEventListener('click', () => {
    if (selectedNode) playMelody(selectedNode);
  });

  window.addEventListener('resize', () => {
    const container = document.getElementById('graph-container');
    width = container.clientWidth;
    height = container.clientHeight;
    svgEl.attr('width', width).attr('height', height);
    simulation.force('center', d3.forceCenter(width / 2, height / 2)).alpha(0.1).restart();
  });
}

// ─── Legend ────────────────────────────────────────────────────────────────

function addLegend() {
  let legend = document.getElementById('degree-legend');
  if (!legend) {
    legend = document.createElement('div');
    legend.id = 'degree-legend';
    document.getElementById('app').appendChild(legend);
  }
  legend.innerHTML = '<span style="margin-right:4px">Scale degree:</span>';
  for (let i = 1; i <= 8; i++) {
    legend.innerHTML += `
      <span style="display:flex;align-items:center;gap:4px;margin-right:8px">
        <span class="legend-dot" style="background:${degreeColor(i)}"></span>
        <span>${i === 8 ? '8 (Oct)' : i}</span>
      </span>
    `;
  }
}

// ─── Audio Playback ───────────────────────────────────────────────────────────

const KEY_TO_MIDI_ROOT = {
  'C': 60, 'C#': 61, 'Db': 61, 'D': 62, 'D#': 63, 'Eb': 63,
  'E': 64, 'F': 65, 'F#': 66, 'Gb': 66, 'G': 67, 'G#': 68,
  'Ab': 68, 'A': 69, 'A#': 70, 'Bb': 70, 'B': 71,
  'Cm': 60, 'Dm': 62, 'Em': 64, 'Fm': 65, 'Gm': 67,
  'Am': 69, 'Bm': 71, 'C#m': 61, 'Ebm': 63, 'F#m': 66,
};

// Major scale intervals (semitones from root)
const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11];
// Natural minor
const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10];

function isMinorKey(key) {
  return key.endsWith('m') && key.length > 1;
}

function degreeToMidi(deg, key) {
  const root = KEY_TO_MIDI_ROOT[key] || 60;
  const minor = isMinorKey(key);
  const intervals = minor ? MINOR_INTERVALS : MAJOR_INTERVALS;
  const octave = deg === 8 ? 1 : 0;
  const scaleDeg = deg === 8 ? 1 : deg;
  return root + intervals[scaleDeg - 1] + octave * 12;
}

function midiToToneNote(midi) {
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const oct = Math.floor(midi / 12) - 1;
  const note = notes[midi % 12];
  return `${note}${oct}`;
}

async function playMelody(d) {
  if (!synth) {
    await Tone.start();
    synth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.02, decay: 0.1, sustain: 0.4, release: 0.8 },
    }).toDestination();
  }

  const btn = document.getElementById('play-btn');
  if (btn.classList.contains('playing')) {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    btn.classList.remove('playing');
    btn.textContent = '▶ Play Melody';
    return;
  }

  btn.classList.add('playing');
  btn.textContent = '■ Stop';

  const bpm = d.tempo || 120;
  Tone.Transport.bpm.value = bpm;

  const quarterSec = 60 / bpm;
  let t = Tone.now() + 0.05;

  d.scale_degrees.forEach((deg, i) => {
    const dur = (d.durations && d.durations[i]) ? d.durations[i] : 1;
    const midi = degreeToMidi(deg, d.key);
    const note = midiToToneNote(midi);
    const durSec = dur * quarterSec;
    synth.triggerAttackRelease(note, Math.max(0.1, durSec * 0.85), t);
    t += durSec;
  });

  setTimeout(() => {
    btn.classList.remove('playing');
    btn.textContent = '▶ Play Melody';
  }, (t - Tone.now()) * 1000 + 200);
}

// ─── Editor ──────────────────────────────────────────────────────────────────

function onEditorSubmit(e) {
  e.preventDefault();
  const fd = new FormData(e.target);
  const title = fd.get('title').trim();
  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const degsRaw = fd.get('scale_degrees').split(',').map(x => parseInt(x.trim())).filter(n => !isNaN(n));
  const dursRaw = fd.get('durations').split(',').map(x => parseFloat(x.trim())).filter(n => !isNaN(n));

  const std = {
    id,
    title,
    composer: fd.get('composer') || '',
    key: fd.get('key') || 'C',
    time_signature: fd.get('time_signature') || '4/4',
    tempo: parseInt(fd.get('tempo')) || 120,
    scale_degrees: degsRaw,
    durations: dursRaw.length ? dursRaw : undefined,
  };

  saveCustomStandard(std);
  e.target.reset();
  rebuildApp();
}

function buildEditorList() {
  const list = document.getElementById('standards-list');
  list.innerHTML = `<h3>All Standards (${standards.length})</h3>`;
  standards.forEach(s => {
    const div = document.createElement('div');
    div.className = 'std-item';
    div.innerHTML = `<span>${s.title}</span><span style="color:var(--text-muted);font-size:0.75rem">${s.key}</span>`;
    const del = document.createElement('button');
    del.textContent = '✕';
    del.title = 'Delete (custom only)';
    del.onclick = (e) => { e.stopPropagation(); deleteCustomStandard(s.id); rebuildApp(); };
    div.appendChild(del);
    list.appendChild(div);
  });
}

function rebuildApp() {
  // Reload standards from storage, rebuild edges and graph
  fetch('standards.json')
    .then(r => r.json())
    .then(data => {
      standards = loadStandards(data.standards);
      allEdges = buildEdges(standards);
      buildGraph();
      buildEditorList();
    });
}

function exportJSON() {
  const custom = JSON.parse(localStorage.getItem(LS_KEY) || '[]');
  const blob = new Blob([JSON.stringify({ custom_standards: custom }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'jazz-standards-custom.json';
  a.click();
}

function importJSON(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      const arr = data.custom_standards || data.standards || [];
      arr.forEach(s => saveCustomStandard(s));
      rebuildApp();
    } catch {
      alert('Invalid JSON file.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

init();
