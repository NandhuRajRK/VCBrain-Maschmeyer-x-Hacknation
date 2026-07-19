"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Building2, MapPin, Users } from "lucide-react";
import { geoEquirectangular, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { FeatureCollection, Geometry } from "geojson";
import type { GeometryCollection, Topology } from "topojson-specification";
import countriesTopology from "world-atlas/countries-110m.json";
import type { ApiCompany, ApiFounder } from "../lib/api";
import { listAllFounders } from "../lib/api";
import styles from "./GlobalIntelligenceMap.module.css";

type Mode = "companies" | "founders";
type Point = { id: string; companyId: string; name: string; detail: string; geography: string; lat: number; lon: number };

const topology = countriesTopology as unknown as Topology;
const countries = feature(topology, topology.objects.countries as GeometryCollection) as FeatureCollection<Geometry>;
const textureCache: Partial<Record<"light" | "dark", HTMLCanvasElement>> = {};
const KNOWN: [RegExp, number, number][] = [
  [/san francisco|bay area/i, 37.77, -122.42], [/new york/i, 40.71, -74], [/boston/i, 42.36, -71.06], [/austin/i, 30.27, -97.74],
  [/united states|usa|us$/i, 39.5, -98.35], [/london|united kingdom|uk/i, 51.51, -0.13], [/berlin/i, 52.52, 13.41],
  [/munich/i, 48.14, 11.58], [/dach|germany/i, 51.17, 10.45], [/paris|france/i, 48.86, 2.35], [/amsterdam/i, 52.37, 4.9],
  [/europe|eu$/i, 50.5, 10], [/india|bengaluru|bangalore/i, 12.97, 77.59], [/singapore/i, 1.35, 103.82],
  [/tokyo|japan/i, 35.68, 139.65], [/china|beijing|shanghai/i, 35.86, 104.2], [/australia|sydney/i, -33.87, 151.21],
  [/africa|nairobi/i, -1.29, 36.82], [/south america|brazil/i, -14.24, -51.93], [/remote|global/i, 20, 0],
];

function coordinates(geography: string, seed: string): [number, number] {
  const known = KNOWN.find(([pattern]) => pattern.test(geography));
  const hash = [...seed].reduce((value, char) => ((value * 31) + char.charCodeAt(0)) >>> 0, 7);
  if (known) {
    const latitudeOffset = ((hash % 100) / 100 - 0.5) * 2.2;
    const longitudeOffset = (((hash >>> 8) % 100) / 100 - 0.5) * 2.8;
    return [known[1] + latitudeOffset, known[2] + longitudeOffset];
  }
  return [-55 + (hash % 110), -170 + ((hash >>> 7) % 340)];
}

function globeTexture(light: boolean) {
  const cacheKey = light ? "light" : "dark";
  if (textureCache[cacheKey]) return textureCache[cacheKey];
  const width = 1024;
  const height = 512;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  const projection = geoEquirectangular().translate([width / 2, height / 2]).scale(width / (2 * Math.PI));
  const path = geoPath(projection, context);

  context.fillStyle = light ? "#e1e9ea" : "#aebfc6";
  context.fillRect(0, 0, width, height);
  context.beginPath();
  path(countries);
  context.fillStyle = light ? "#c7d4d7" : "#c8d4d7";
  context.fill();
  context.save();
  context.beginPath();
  path(countries);
  context.clip();
  context.font = "5px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  const glyphs = ["·", "·", "·", "·", ":", "+", "×"];
  let seed = 0x5f3759df;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
  for (let index = 0; index < 9500; index += 1) {
    const x = random() * width;
    const y = random() * height;
    context.globalAlpha = 0.18 + random() * 0.24;
    context.font = `${3 + Math.floor(random() * 3)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    context.fillStyle = light ? "#667f8a" : "#708894";
    context.fillText(glyphs[Math.floor(random() * glyphs.length)], x, y);
  }
  context.restore();
  context.globalAlpha = 0.56;
  context.beginPath();
  path(countries);
  context.strokeStyle = light ? "#78909a" : "#748b96";
  context.lineWidth = 0.65;
  context.stroke();
  context.globalAlpha = 1;

  textureCache[cacheKey] = canvas;
  return canvas;
}

export default function GlobalIntelligenceMap({ companies }: { companies: ApiCompany[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLAnchorElement>(null);
  const hoveredRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const [founders, setFounders] = useState<ApiFounder[]>([]);
  const [mode, setMode] = useState<Mode>("companies");
  const [geography, setGeography] = useState("all");
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => { listAllFounders().then(setFounders).catch(() => setFounders([])); }, []);
  const companyById = useMemo(() => new Map(companies.map((company) => [company.id, company])), [companies]);
  const geographies = useMemo(() => [...new Set(companies.map((company) => company.geography).filter((value): value is string => Boolean(value)))].sort(), [companies]);
  const points = useMemo<Point[]>(() => {
    if (mode === "companies") return companies.filter((company) => company.geography).map((company) => {
      const [lat, lon] = coordinates(company.geography!, company.id);
      return { id: company.id, companyId: company.id, name: company.name, detail: [company.sector, company.stage].filter(Boolean).join(" · "), geography: company.geography!, lat, lon };
    });
    return founders.map((founder) => {
      const company = companyById.get(founder.company_id);
      if (!company?.geography) return null;
      const [lat, lon] = coordinates(company.geography, founder.id);
      return { id: founder.id, companyId: company.id, name: founder.name, detail: `${founder.role || "Founder"} · ${company.name}`, geography: company.geography, lat, lon };
    }).filter((point): point is Point => point !== null);
  }, [companies, companyById, founders, mode]);
  const visible = useMemo(() => points.filter((point) => geography === "all" || point.geography === geography), [geography, points]);
  const active = visible.find((point) => point.id === (hovered ?? selected));

  useEffect(() => { hoveredRef.current = hovered; }, [hovered]);
  useEffect(() => { selectedRef.current = selected; }, [selected]);
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage || !visible.length) return;
    let disposed = false;
    let frame = 0;
    let intersecting = true;
    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    let lastInteraction = performance.now();
    let teardown = () => {};

    void import("three").then((THREE) => {
      if (disposed) return;
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
      camera.position.z = 4.05;
      const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.4));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const globe = new THREE.Group();
      globe.position.y = -0.3;
      globe.rotation.set(-0.14, -0.08, 0.03);
      scene.add(globe);

      const light = document.documentElement.dataset.theme === "light";
      const radius = 1.52;
      const texture = new THREE.CanvasTexture(globeTexture(light));
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(2, renderer.capabilities.getMaxAnisotropy());
      globe.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 44), new THREE.MeshBasicMaterial({ map: texture })));

      const toVector = (lat: number, lon: number, r = radius + 0.012) => {
        const phi = (90 - lat) * Math.PI / 180;
        const theta = (lon + 180) * Math.PI / 180;
        return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
      };

      const markerMeshes: import("three").Object3D[] = [];
      const markerById = new Map<string, import("three").Object3D>();
      const upAxis = new THREE.Vector3(0, 1, 0);
      visible.forEach((point) => {
        const normal = toVector(point.lat, point.lon, 1).normalize();
        const root = toVector(point.lat, point.lon, radius + 0.006);
        const color = 0xe8dfa7;
        const marker = new THREE.Group();
        marker.position.copy(root);
        marker.quaternion.setFromUnitVectors(upAxis, normal);
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.013, 0.17, 8), new THREE.MeshBasicMaterial({ color }));
        stem.position.y = 0.085;
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.048, 16, 12), new THREE.MeshBasicMaterial({ color }));
        head.position.y = 0.185;
        const hit = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
        hit.position.y = 0.17;
        hit.userData.id = point.id;
        const foot = new THREE.Mesh(new THREE.RingGeometry(0.035, 0.055, 20), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
        foot.rotation.x = -Math.PI / 2;
        marker.add(stem, head, hit, foot);
        marker.userData.id = point.id;
        globe.add(marker);
        markerMeshes.push(hit);
        markerById.set(point.id, marker);
      });

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const pointerAt = (event: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
        raycaster.setFromCamera(pointer, camera);
        return raycaster.intersectObjects(markerMeshes, false)[0];
      };
      const positionTooltip = () => {
        const tooltip = tooltipRef.current;
        const marker = markerById.get(hoveredRef.current ?? selectedRef.current ?? "");
        if (!tooltip || !marker) return;
        const world = marker.getWorldPosition(new THREE.Vector3());
        const normal = world.clone().sub(globe.getWorldPosition(new THREE.Vector3())).normalize();
        const facing = camera.position.clone().sub(world).dot(normal) > 0;
        const projected = world.project(camera);
        tooltip.style.setProperty("--tooltip-x", `${(projected.x * 0.5 + 0.5) * stage.clientWidth}px`);
        tooltip.style.setProperty("--tooltip-y", `${(-projected.y * 0.5 + 0.5) * stage.clientHeight}px`);
        tooltip.dataset.visible = String(facing);
      };
      const resize = () => {
        const width = stage.clientWidth; const height = stage.clientHeight;
        renderer.setSize(width, height, false); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix();
      };
      const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(stage); resize();
      const intersection = new IntersectionObserver(([entry]) => { intersecting = entry.isIntersecting; if (intersecting) render(); }, { threshold: 0.05 });
      intersection.observe(stage);
      const canAnimate = () => intersecting && document.visibilityState === "visible";
      const render = () => {
        cancelAnimationFrame(frame);
        if (!canAnimate() || disposed) return;
        const now = performance.now();
        if (!dragging && now - lastInteraction > 1400) globe.rotation.y += 0.00135;
        renderer.render(scene, camera);
        positionTooltip();
        frame = requestAnimationFrame(render);
      };
      const visibility = () => { if (canAnimate()) render(); else cancelAnimationFrame(frame); };
      const down = (event: PointerEvent) => { dragging = true; moved = false; setHovered(null); lastX = event.clientX; lastY = event.clientY; lastInteraction = performance.now(); canvas.setPointerCapture(event.pointerId); };
      const move = (event: PointerEvent) => {
        if (!dragging) {
          const id = pointerAt(event)?.object.userData.id as string | undefined;
          setHovered((current) => current === (id ?? null) ? current : (id ?? null));
          canvas.dataset.hovering = String(Boolean(id));
          return;
        }
        const dx = event.clientX - lastX; const dy = event.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        globe.rotation.y += dx * 0.006; globe.rotation.x = Math.max(-1.05, Math.min(1.05, globe.rotation.x + dy * 0.004));
        lastX = event.clientX; lastY = event.clientY; lastInteraction = performance.now();
      };
      const up = (event: PointerEvent) => {
        dragging = false; lastInteraction = performance.now();
        if (!moved) {
          const id = pointerAt(event)?.object.userData.id as string | undefined;
          if (id) setSelected(id);
        }
      };
      const leave = () => { if (!dragging) { setHovered(null); canvas.dataset.hovering = "false"; } };
      canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); canvas.addEventListener("pointerup", up); canvas.addEventListener("pointerleave", leave);
      document.addEventListener("visibilitychange", visibility);
      setReady(true); render();

      teardown = () => {
        cancelAnimationFrame(frame); resizeObserver.disconnect(); intersection.disconnect(); document.removeEventListener("visibilitychange", visibility);
        canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); canvas.removeEventListener("pointerup", up); canvas.removeEventListener("pointerleave", leave);
        scene.traverse((object) => { if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach((material) => material.dispose()); } });
        renderer.dispose();
      };
    });
    return () => { disposed = true; teardown(); };
  }, [visible]);

  return <section className={styles.section} aria-label="Global intelligence globe">
    <header className={styles.header}><div><span>Global intelligence</span><strong>{visible.length} {mode}</strong></div><div className={styles.controls}><div className={styles.segment}><button type="button" data-active={mode === "companies"} onClick={() => { setReady(false); setMode("companies"); setSelected(null); }} title="Companies"><Building2 size={14} /></button><button type="button" data-active={mode === "founders"} onClick={() => { setReady(false); setMode("founders"); setSelected(null); }} title="Founders"><Users size={14} /></button></div><label><MapPin size={13} /><select value={geography} onChange={(event) => { setReady(false); setGeography(event.target.value); setSelected(null); }}><option value="all">All geographies</option>{geographies.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div></header>
    <div className={styles.map} ref={stageRef} data-ready={ready}>
      <canvas ref={canvasRef} aria-label={`Interactive globe showing ${visible.length} ${mode}`} />
      {!ready && visible.length > 0 && <div className={styles.loader}><span /></div>}
      {!visible.length && <p className={styles.empty}>No location data matches this filter.</p>}
      {active && <Link ref={tooltipRef} href={`/company/${active.companyId}`} className={styles.tooltip} data-visible="true"><span>{active.name}</span><small>{active.detail || "Profile available"}</small><b><MapPin size={11} />{active.geography}</b></Link>}
      <p className={styles.hint}>Drag to explore</p>
    </div>
  </section>;
}
