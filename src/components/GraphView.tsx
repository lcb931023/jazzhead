import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import type { Standard, Edge, SimNode, TooltipData } from '../types';
import { NODE_R, MELODY_H } from '../constants';
import { degreeColor, sharedPrefixLength, truncate } from '../lib/music';

// After D3 link resolution, source/target are SimNode objects
type SimLink = d3.SimulationLinkDatum<SimNode> & { shared: number };

interface Props {
  standards: Standard[];
  allEdges: Edge[];
  depth: number;
  showLabels: boolean;
  selectedId: string | null;
  onSelectNode: (s: Standard | null) => void;
}

function mapDegreeToY(deg: number, h: number) {
  return ((deg - 1) / 12) * h - h / 2;
}

export function GraphView({ standards, allEdges, depth, showLabels, selectedId, onSelectNode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // D3 selections stored in refs — never become React state
  const nodeGroupsRef = useRef<d3.Selection<SVGGElement, SimNode, SVGGElement, unknown> | null>(null);
  const edgePathsRef = useRef<d3.Selection<SVGLineElement, SimLink, SVGGElement, unknown> | null>(null);
  const simulationRef = useRef<d3.Simulation<SimNode, undefined> | null>(null);

  // Refs for latest prop values — prevents stale closures in D3 handlers
  const depthRef = useRef(depth);
  const selectedIdRef = useRef(selectedId);
  const onSelectRef = useRef(onSelectNode);
  const standardsRef = useRef(standards);
  const allEdgesRef = useRef(allEdges);
  const showLabelsRef = useRef(showLabels);

  useEffect(() => { depthRef.current = depth; }, [depth]);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);
  useEffect(() => { onSelectRef.current = onSelectNode; }, [onSelectNode]);
  useEffect(() => { standardsRef.current = standards; }, [standards]);
  useEffect(() => { allEdgesRef.current = allEdges; }, [allEdges]);
  useEffect(() => { showLabelsRef.current = showLabels; }, [showLabels]);

  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  // ── Full graph rebuild when standards or edges change ──────────────────────
  useEffect(() => {
    const container = containerRef.current;
    const svgEl = svgRef.current;
    if (!container || !svgEl || standards.length === 0) return;

    const W = container.clientWidth;
    const H = container.clientHeight;

    const svg = d3.select(svgEl).attr('width', W).attr('height', H);
    svg.selectAll('*').remove();

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on('zoom', e => gMain.attr('transform', e.transform));
    svg.call(zoom);

    const gMain = svg.append('g');
    const edgeLayer = gMain.append('g').attr('class', 'edges');
    const nodeLayer = gMain.append('g').attr('class', 'nodes');

    const nodes: SimNode[] = standards.map(s => ({ ...s }));
    const nodeById = new Map(nodes.map(n => [n.id, n]));

    const links: SimLink[] = allEdges
      .map(e => ({
        source: nodeById.get(e.source) as SimNode,
        target: nodeById.get(e.target) as SimNode,
        shared: e.shared,
      }))
      .filter(l => l.source && l.target);

    // Edges
    const edgePaths = edgeLayer
      .selectAll<SVGLineElement, SimLink>('.edge')
      .data(links)
      .enter().append('line')
      .attr('class', 'edge')
      .attr('data-shared', d => d.shared)
      .classed('visible', d => d.shared >= depthRef.current);
    edgePathsRef.current = edgePaths;

    // Node groups
    const nodeGroups = nodeLayer
      .selectAll<SVGGElement, SimNode>('.node')
      .data(nodes)
      .enter().append('g')
      .attr('class', 'node')
      .attr('id', d => `node-${d.id}`)
      .call(
        d3.drag<SVGGElement, SimNode>()
          .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
          .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
          .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
      );

    nodeGroups.append('circle')
      .attr('r', NODE_R)
      .on('click', (e, d) => { e.stopPropagation(); onSelectRef.current(d); });

    // Melody strip per node
    nodeGroups.each(function(d) {
      const g = d3.select<SVGGElement, SimNode>(this);
      const degs = d.scale_degrees;
      const noteCount = Math.min(degs.length, 10);
      const stripW = NODE_R * 2 - 8;
      const dotSpacing = stripW / (noteCount - 1 || 1);
      const cx0 = -stripW / 2;

      const melodyG = g.append('g')
        .attr('class', 'melody-strip')
        .attr('transform', 'translate(0,6)')
        .on('mousemove', (e) => handleScrub(e, d, melodyG, dotSpacing, cx0, noteCount))
        .on('mouseleave', () => handleScrubLeave(d, melodyG))
        .on('click', (e) => { e.stopPropagation(); onSelectRef.current(d); });

      // Hit area
      melodyG.append('rect')
        .attr('x', cx0 - 4).attr('y', -MELODY_H / 2 - 4)
        .attr('width', stripW + 8).attr('height', MELODY_H + 8)
        .attr('fill', 'transparent');

      // Dots and connector lines
      for (let i = 0; i < noteCount; i++) {
        const deg = degs[i];
        const cx = cx0 + i * dotSpacing;
        const cy = -mapDegreeToY(deg, MELODY_H);
        melodyG.append('circle')
          .attr('class', `melody-dot note-${i}`)
          .attr('cx', cx).attr('cy', cy)
          .attr('r', 2.5).attr('fill', degreeColor(deg)).attr('opacity', 0.6);
        if (i < noteCount - 1) {
          const nextDeg = degs[i + 1];
          melodyG.append('line')
            .attr('class', `note-line-${i}`)
            .attr('x1', cx).attr('y1', cy)
            .attr('x2', cx0 + (i + 1) * dotSpacing).attr('y2', -mapDegreeToY(nextDeg, MELODY_H))
            .attr('stroke', degreeColor(deg)).attr('stroke-width', 1).attr('opacity', 0.25);
        }
      }

      // Scrub cursor
      melodyG.append('line').attr('class', 'melody-cursor')
        .attr('x1', 0).attr('x2', 0)
        .attr('y1', -MELODY_H / 2 - 4).attr('y2', MELODY_H / 2 + 4);
    });

    nodeGroups.append('text')
      .attr('y', NODE_R + 11)
      .text(d => truncate(d.title, 18))
      .style('opacity', showLabelsRef.current ? 1 : 0);

    nodeGroupsRef.current = nodeGroups;

    // Force simulation
    const simulation = d3.forceSimulation<SimNode>(nodes)
      .force('link', d3.forceLink<SimNode, SimLink>(links)
        .distance(d => 100 + (8 - d.shared) * 20)
        .strength(d => d.shared * 0.03))
      .force('charge', d3.forceManyBody().strength(-500))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collision', d3.forceCollide(NODE_R + 20))
      .on('tick', () => {
        edgePaths
          .attr('x1', d => (d.source as SimNode).x ?? 0)
          .attr('y1', d => (d.source as SimNode).y ?? 0)
          .attr('x2', d => (d.target as SimNode).x ?? 0)
          .attr('y2', d => (d.target as SimNode).y ?? 0);
        nodeGroups.attr('transform', d => `translate(${d.x ?? 0},${d.y ?? 0})`);
      });

    simulationRef.current = simulation;

    svg.on('click', () => { onSelectRef.current(null); setTooltip(null); });

    // Resize observer
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      svg.attr('width', w).attr('height', h);
      simulation.force('center', d3.forceCenter(w / 2, h / 2)).alpha(0.1).restart();
    });
    ro.observe(container);

    return () => { simulation.stop(); ro.disconnect(); };
  }, [standards, allEdges]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update selection highlights ────────────────────────────────────────────
  useEffect(() => {
    const ng = nodeGroupsRef.current;
    const ep = edgePathsRef.current;
    if (!ng || !ep) return;

    ng.classed('selected', false).classed('connected', false);
    ep.classed('highlighted', false).classed('visible', d => d.shared >= depth);

    if (selectedId) {
      ng.filter(d => d.id === selectedId).classed('selected', true);

      const connectedIds = new Set(
        allEdges
          .filter(e => (e.source === selectedId || e.target === selectedId) && e.shared >= depth)
          .map(e => e.source === selectedId ? e.target : e.source)
      );
      ng.each(function(d) {
        if (connectedIds.has(d.id)) d3.select(this).classed('connected', true);
      });
      ep.each(function(e) {
        const src = (e.source as SimNode).id;
        const tgt = (e.target as SimNode).id;
        const involves = src === selectedId || tgt === selectedId;
        if (involves) d3.select(this).classed('highlighted', e.shared >= depth);
      });
    }
  }, [selectedId, depth, allEdges]);

  // ── Label visibility ───────────────────────────────────────────────────────
  useEffect(() => {
    nodeGroupsRef.current?.selectAll('text').style('opacity', showLabels ? 1 : 0);
  }, [showLabels]);

  // ── Scrub event handlers (only called from D3 closures; access via refs) ───
  function handleScrub(
    event: MouseEvent,
    d: SimNode,
    melodyG: d3.Selection<SVGGElement, SimNode, SVGGElement, unknown>,
    dotSpacing: number,
    cx0: number,
    noteCount: number
  ) {
    const [mx] = d3.pointer(event, melodyG.node());
    const idx = Math.max(0, Math.min(noteCount - 1, Math.round((mx - cx0) / dotSpacing)));
    const cursorX = cx0 + idx * dotSpacing;

    melodyG.select('.melody-cursor').attr('x1', cursorX).attr('x2', cursorX).attr('opacity', 0.8);
    melodyG.selectAll('.melody-dot').each(function(_, i) {
      d3.select(this).attr('opacity', i <= idx ? 1 : 0.2).attr('r', i === idx ? 4 : 2.5);
    });

    const ng = nodeGroupsRef.current;
    const ep = edgePathsRef.current;
    if (!ng || !ep) return;

    ng.each(function(nd) {
      if (nd.id === d.id) return;
      const shared = sharedPrefixLength(d, nd);
      d3.select(this)
        .classed('scrub-match', shared >= idx + 1)
        .classed('scrub-partial', shared > 0 && shared < idx + 1);
    });

    ep.each(function(e) {
      const src = (e.source as SimNode).id;
      const tgt = (e.target as SimNode).id;
      const involves = src === d.id || tgt === d.id;
      const otherId = src === d.id ? tgt : src;
      const other = standardsRef.current.find(s => s.id === otherId);
      const shared = other ? sharedPrefixLength(d, other) : 0;
      d3.select(this)
        .classed('visible', involves && shared >= 1)
        .classed('highlighted', involves && shared >= idx + 1);
    });

    const matches = standardsRef.current.filter(s => s.id !== d.id && sharedPrefixLength(d, s) >= idx + 1);
    if (containerRef.current) {
      const [px, py] = d3.pointer(event, containerRef.current);
      setTooltip({ x: px, y: py, standard: d, depth: idx + 1, matches });
    }
  }

  function handleScrubLeave(
    d: SimNode,
    melodyG: d3.Selection<SVGGElement, SimNode, SVGGElement, unknown>
  ) {
    melodyG.select('.melody-cursor').attr('opacity', 0);
    melodyG.selectAll('.melody-dot').attr('opacity', 0.6).attr('r', 2.5);
    setTooltip(null);

    const ng = nodeGroupsRef.current;
    const ep = edgePathsRef.current;
    if (!ng || !ep) return;

    ng.classed('scrub-match', false).classed('scrub-partial', false);
    ep.classed('visible', (e: SimLink) => e.shared >= depthRef.current).classed('highlighted', false);

    const sid = selectedIdRef.current;
    if (sid) {
      ng.filter(nd => nd.id === sid).classed('selected', true);
      const connectedIds = new Set(
        allEdgesRef.current
          .filter(e => (e.source === sid || e.target === sid) && e.shared >= depthRef.current)
          .map(e => e.source === sid ? e.target : e.source)
      );
      ng.each(function(nd) {
        if (connectedIds.has(nd.id)) d3.select(this).classed('connected', true);
      });
      ep.each(function(e) {
        const src = (e.source as SimNode).id;
        const tgt = (e.target as SimNode).id;
        const involves = src === sid || tgt === sid;
        if (involves) d3.select(this).classed('highlighted', e.shared >= depthRef.current);
      });
    }
  }

  return (
    <div ref={containerRef} id="graph-container">
      <svg ref={svgRef} id="graph" />
      {tooltip && (
        <div id="tooltip" style={{ left: tooltip.x + 20, top: tooltip.y - 10 }}>
          <strong>{tooltip.standard.title}</strong>
          <span>
            First {tooltip.depth} note{tooltip.depth > 1 ? 's' : ''} matched by {tooltip.matches.length} other{tooltip.matches.length !== 1 ? 's' : ''}:
          </span>
          <br />
          <span>
            {tooltip.matches.slice(0, 5).map(s => s.title).join(', ')}
            {tooltip.matches.length > 5 ? ` +${tooltip.matches.length - 5} more` : ''}
          </span>
        </div>
      )}
    </div>
  );
}
