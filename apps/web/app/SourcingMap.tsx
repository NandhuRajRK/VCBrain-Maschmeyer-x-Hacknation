"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HelpCircle, MapPin } from "lucide-react";
import { geoEquirectangular, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import countriesTopology from "world-atlas/countries-110m.json";
import type { ApiDiscoveryCandidate } from "../lib/api";
import styles from "./SourcingMap.module.css";

type MapPoint = { id: string; name: string; location: string; x: number; y: number };
const topology = countriesTopology as unknown as Topology;
const countries = feature(topology, topology.objects.countries as GeometryCollection) as FeatureCollection<Geometry>;
const LOCATIONS: [RegExp, number, number][] = [
  [/san francisco|bay area/i, 37.77, -122.42], [/new york/i, 40.71, -74], [/boston/i, 42.36, -71.06],
  [/london|united kingdom|uk/i, 51.51, -0.13], [/berlin/i, 52.52, 13.41], [/munich/i, 48.14, 11.58],
  [/germany|dach/i, 51.17, 10.45], [/paris|france/i, 48.86, 2.35], [/amsterdam/i, 52.37, 4.9],
  [/bengaluru|bangalore|india/i, 12.97, 77.59], [/singapore/i, 1.35, 103.82], [/tokyo|japan/i, 35.68, 139.65],
  [/sydney|australia/i, -33.87, 151.21], [/nairobi|kenya/i, -1.29, 36.82],
];

function locationOf(candidate: ApiDiscoveryCandidate) {
  const value = candidate.source_metadata.location ?? candidate.source_metadata.geography ?? candidate.source_metadata.city;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function seedOffset(seed: string) {
  const value = [...seed].reduce((total, char) => ((total * 31) + char.charCodeAt(0)) >>> 0, 17);
  return [((value % 100) / 100 - .5) * 2.4, (((value >>> 8) % 100) / 100 - .5) * 3.2] as const;
}

export default function SourcingMap({ candidates, onOpenHow }: { candidates: ApiDiscoveryCandidate[]; onOpenHow: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const projection = useMemo(() => geoEquirectangular().fitSize([180, 88], countries), []);
  const points = useMemo<MapPoint[]>(() => candidates.flatMap((candidate) => {
    const location = locationOf(candidate);
    const known = location && LOCATIONS.find(([pattern]) => pattern.test(location));
    if (!location || !known) return [];
    const [latOffset, lonOffset] = seedOffset(candidate.id);
    const coordinate = projection([known[2] + lonOffset, known[1] + latOffset]);
    return coordinate ? [{ id: candidate.id, name: candidate.name, location, x: (coordinate[0] / 180) * 100, y: (coordinate[1] / 88) * 100 }] : [];
  }), [candidates, projection]);
  const unresolved = candidates.length - points.length;
  const selected = points.find((point) => point.id === active);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    canvas.width = 180; canvas.height = 88;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const path = geoPath(projection, context);
    context.beginPath(); path(countries);
    context.fillStyle = "rgba(204, 208, 211, .34)";
    context.fill();
    context.lineWidth = .45;
    context.strokeStyle = "rgba(255, 255, 255, .13)";
    context.stroke();
    context.globalCompositeOperation = "source-atop";
    for (let y = 0; y < 88; y += 3) for (let x = 0; x < 180; x += 3) {
      const shade = ((x * 13 + y * 17) % 11) / 11;
      context.fillStyle = `rgba(255,255,255,${.03 + shade * .12})`;
      context.fillRect(x, y, 1.4, 1.4);
    }
    context.globalCompositeOperation = "source-over";
  }, [projection]);

  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    setPan({ x: drag.current.panX + event.clientX - drag.current.x, y: drag.current.panY + event.clientY - drag.current.y });
  };
  const pointerUp = () => { drag.current = null; };

  return <section className={styles.section} aria-label="Sourcing footprint">
    <header className={styles.header}>
      <div><p>Outbound footprint</p><h2>Where leads are surfacing</h2></div>
      <button type="button" className={styles.helpTrigger} onClick={onOpenHow} aria-label="How sourcing works"><HelpCircle size={15} /></button>
    </header>
    <div className={styles.map} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={(event) => { event.preventDefault(); setZoom((value) => Math.max(.9, Math.min(2.2, value + (event.deltaY < 0 ? .12 : -.12)))); }}>
      <div className={styles.surface} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        <canvas ref={canvasRef} aria-hidden="true" />
        {points.map((point) => <button key={point.id} type="button" className={styles.pin} data-active={active === point.id} style={{ left: `${point.x}%`, top: `${point.y}%` }} onClick={(event) => { event.stopPropagation(); setActive((current) => current === point.id ? null : point.id); }} aria-label={`${point.name}, ${point.location}`}><span /></button>)}
      </div>
      {selected && <div className={styles.tooltip}><strong>{selected.name}</strong><span><MapPin size={12} />{selected.location}</span></div>}
      <div className={styles.legend}><span><i />{points.length} located</span>{unresolved > 0 && <span>{unresolved} awaiting location evidence</span>}</div>
      <p className={styles.hint}>Drag to pan · scroll to zoom</p>
    </div>
  </section>;
}
