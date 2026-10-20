'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker, CircleMarker } from 'leaflet';
import { LocateFixed } from 'lucide-react';

interface Point {
  i: number;
  lat: number | null;
  lng: number | null;
  title: string;
}

// Leaflet touches `window`, so this component is loaded with ssr: false.
export default function TourMap({ stops, current, onSelect, locateLabel }: { stops: Point[]; current: number; onSelect: (i: number) => void; locateLabel: string }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const markers = useRef<Map<number, Marker>>(new Map());
  const me = useRef<CircleMarker | null>(null);
  const [ready, setReady] = useState(false);
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    let cancelled = false;
    import('leaflet').then((L) => {
      if (cancelled || !box.current || map.current) return;
      const m = L.map(box.current, { scrollWheelZoom: false });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(m);
      const points = stops.filter((s) => s.lat != null && s.lng != null);
      for (const s of points) {
        const icon = L.divIcon({
          className: '',
          html: `<span class="grid size-8 place-items-center rounded-full border-[2.5px] border-white bg-[var(--accent)] font-semibold text-[13px] text-white shadow-[0_4px_12px_rgb(0_0_0/0.3)]">${s.i + 1}</span>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        const marker = L.marker([s.lat!, s.lng!], { icon, title: s.title, keyboard: true })
          .addTo(m)
          .on('click', () => select.current(s.i));
        marker.bindTooltip(s.title, { direction: 'top', offset: [0, -14], className: 'stop-label' });
        markers.current.set(s.i, marker);
      }
      if (points.length) m.fitBounds(L.featureGroup([...markers.current.values()]).getBounds().pad(0.25));
      else m.setView([13.75, 100.49], 14);
      map.current = m;
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      markers.current.clear();
    };
    // Stops are fixed for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep labels in the current language and centre on the playing stop.
  useEffect(() => {
    for (const s of stops) markers.current.get(s.i)?.setTooltipContent(s.title);
  }, [stops]);
  useEffect(() => {
    const m = markers.current.get(current);
    if (m && map.current) map.current.panTo(m.getLatLng());
  }, [current]);

  const locate = () => {
    if (!navigator.geolocation || !map.current) return;
    navigator.geolocation.watchPosition(
      async (pos) => {
        const L = await import('leaflet');
        const ll: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        if (!me.current && map.current) {
          me.current = L.circleMarker(ll, { radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 }).addTo(map.current);
          map.current.panTo(ll);
        } else me.current?.setLatLng(ll);
      },
      () => {},
      { enableHighAccuracy: true },
    );
  };

  return (
    <div className="mt-4">
      <div ref={box} className="card relative z-0 h-80 overflow-hidden sm:h-96" />
      <button onClick={locate} disabled={!ready} className="btn mt-3 w-full py-3 text-[15px]">
        <LocateFixed className="size-4" strokeWidth={1.75} />
        {locateLabel}
      </button>
    </div>
  );
}
