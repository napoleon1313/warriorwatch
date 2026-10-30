"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Facility, TypicalResponse } from "@warriorwatch/contract";
import { api } from "@/lib/api";
import { GYM_SLUGS, LIBRARY_TOTAL_SLUGS, SESSION_SLUGS, SLUG_TO_ID, display } from "@/lib/facilities";
import { rangeFor } from "@/lib/hours";
import { usePolling, useNow } from "@/lib/hooks";
import { LABEL_TEXT, LABEL_VAR } from "@/lib/labels";
import {
  DURATIONS,
  MAX_BLOCKS,
  STEP,
  bestOrder,
  bestStarts,
  decodeBlocks,
  decodeTime,
  encodeBlocks,
  encodeTime,
  move,
  scoreSession,
  type Block,
  type RoomInfo,
  type SessionScore,
} from "@/lib/session";
import { WEEKDAYS, addDays, formatMinute, formatYmd, localParts, plural, weekdayOf } from "@/lib/time";
import { LabelPill } from "./LabelPill";
import { MiniAxis, MiniCurve } from "./MiniCurve";
import { Section } from "./Section";

const DEFAULT_MIN = 30;

function roundUp(min: number, step = STEP): number {
  return Math.ceil(min / step) * step;
}

export function SessionBuilder() {
  const now = useNow(60_000);
  const lp = localParts(now);
  const today = lp.ymd;
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(today, i)), [today]);

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [ymd, setYmd] = useState(today);
  const [startMin, setStartMin] = useState<number>(() => Math.min(1425, roundUp(lp.minuteOfDay + 15)));
  const [loaded, setLoaded] = useState(false);
  const [justOptimized, setJustOptimized] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  // URL → state once; state → URL always, so a session can be shared.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const b = decodeBlocks(q.get("b"), new Set(SESSION_SLUGS));
    const d = q.get("d");
    const t = decodeTime(q.get("t"));
    if (b.length) setBlocks(b);
    if (d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= today) setYmd(d);
    if (t != null) setStartMin(t);
    setLoaded(true);
  }, [today]);
  useEffect(() => {
    if (!loaded) return;
    // Keep unrelated params (demo clock `at`, `mock`) so a reload stays in the same state.
    const q = new URLSearchParams(location.search);
    if (blocks.length) q.set("b", encodeBlocks(blocks));
    else q.delete("b");
    if (ymd !== today) q.set("d", ymd);
    else q.delete("d");
    q.set("t", encodeTime(startMin));
    history.replaceState(null, "", `?${q.toString()}`);
  }, [blocks, ymd, startMin, today, loaded]);

  const weekday = weekdayOf(ymd);
  const facilities = usePolling((s) => api.facilities(s), null, "facilities");
  const typical = usePolling(
    (s) => Promise.all(SESSION_SLUGS.map((slug) => api.typical(slug, weekday, s))),
    null,
    `typical-all:${weekday}`,
  );

  const rooms = useMemo(() => {
    const m = new Map<string, RoomInfo>();
    const byId = new Map<string, Facility>((facilities.data?.facilities ?? []).map((f) => [f.id, f]));
    const typ = new Map<string, TypicalResponse>((typical.data ?? []).map((t) => [t.facilityId, t]));
    for (const slug of SESSION_SLUGS) {
      const id = SLUG_TO_ID[slug]!;
      const f = byId.get(id);
      if (!f) continue;
      m.set(slug, { slug, max: f.maxOccupancy ?? 0, hours: f.hours, slots: typ.get(id)?.slots ?? [] });
    }
    return m;
  }, [facilities.data, typical.data]);

  const ready = rooms.size > 0 && typical.data != null;
  const daysOfData = useMemo(() => Math.max(0, ...(typical.data?.flatMap((t) => t.slots.map((s) => s.n)) ?? [0])), [typical.data]);

  const score: SessionScore | null = useMemo(
    () => (ready && blocks.length ? scoreSession(blocks, startMin, rooms, ymd) : null),
    [ready, blocks, startMin, rooms, ymd],
  );
  const optimized = useMemo(() => (ready && blocks.length > 1 ? bestOrder(blocks, startMin, rooms, ymd) : null), [ready, blocks, startMin, rooms, ymd]);
  const canImprove = optimized && score && optimized.score.avgPct != null && score.avgPct != null && optimized.score.avgPct < score.avgPct;

  // Earliest open to latest close across the chosen rooms, for the time picker and best-start scan.
  const span = useMemo(() => {
    let from = 1440;
    let to = 0;
    for (const b of blocks) {
      const r = rooms.get(b.slug);
      const rg = r ? rangeFor(r.hours, weekday) : null;
      if (!rg) continue;
      from = Math.min(from, rg.open);
      to = Math.max(to, Math.min(1440, rg.close));
    }
    if (from >= to) return { from: 360, to: 1440 };
    return { from, to };
  }, [blocks, rooms, weekday]);
  const total = blocks.reduce((a, b) => a + b.minutes, 0);
  const starts = useMemo(() => {
    if (!ready || !blocks.length) return [];
    const earliest = ymd === today ? Math.max(span.from, roundUp(lp.minuteOfDay)) : span.from;
    return bestStarts(blocks, rooms, ymd, { from: earliest, to: Math.max(earliest, span.to - total) }, 3);
  }, [ready, blocks, rooms, ymd, span, total, today, lp.minuteOfDay]);

  const timeOptions = useMemo(() => {
    const out: number[] = [];
    for (let m = span.from; m <= Math.max(span.from, span.to - 15); m += STEP) out.push(m);
    if (!out.includes(startMin)) out.push(startMin);
    return out.sort((a, b) => a - b);
  }, [span, startMin]);

  const add = (slug: string) => {
    if (blocks.length >= MAX_BLOCKS) return;
    setBlocks((b) => [...b, { slug, minutes: DEFAULT_MIN }]);
  };
  const setMinutes = (i: number, minutes: number) => setBlocks((b) => b.map((x, j) => (j === i ? { ...x, minutes: Math.max(5, Math.min(180, minutes)) } : x)));
  const remove = (i: number) => setBlocks((b) => b.filter((_, j) => j !== i));
  const reorder = useCallback((from: number, to: number) => setBlocks((b) => move(b, from, to)), []);

  // ---- pointer drag to reorder ----
  const listRef = useRef<HTMLOListElement>(null);
  const [drag, setDrag] = useState<{ from: number; to: number; dy: number; h: number } | null>(null);
  const dragRef = useRef<{ from: number; startY: number; mids: number[]; h: number } | null>(null);
  const onHandleDown = (i: number) => (e: React.PointerEvent<HTMLButtonElement>) => {
    const rows = Array.from(listRef.current?.querySelectorAll<HTMLLIElement>("li[data-row]") ?? []);
    const rects = rows.map((r) => r.getBoundingClientRect());
    const h = rects[i]?.height ?? 0;
    dragRef.current = { from: i, startY: e.clientY, mids: rects.map((r) => r.top + r.height / 2), h };
    setDrag({ from: i, to: i, dy: 0, h });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHandleMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    const y = d.mids[d.from]! + dy;
    let to = d.from;
    for (let j = 0; j < d.mids.length; j++) {
      if (j < d.from && y < d.mids[j]!) {
        to = j;
        break;
      }
      if (j > d.from && y > d.mids[j]!) to = j;
    }
    setDrag({ from: d.from, to, dy, h: d.h });
  };
  const onHandleUp = () => {
    const d = dragRef.current;
    if (d && drag && drag.to !== drag.from) reorder(drag.from, drag.to);
    dragRef.current = null;
    setDrag(null);
  };

  const dayLabel = ymd === today ? "today" : ymd === addDays(today, 1) ? "tomorrow" : WEEKDAYS[weekday];
  const endMin = startMin + total;

  const share = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      {/* ---------- 01 pick rooms ---------- */}
      <Section eyebrow="01" title="Pick rooms, in the order you'll do them" aside={`${blocks.length}/${MAX_BLOCKS} blocks`} className="lg:col-span-2">
        <div className="space-y-3">
          {(
            [
              ["gyms", GYM_SLUGS],
              ["libraries · a study block between workouts", LIBRARY_TOTAL_SLUGS],
            ] as const
          ).map(([label, group]) => (
            <div key={label}>
              <p className="eyebrow mb-1.5">{label}</p>
              <div className="flex flex-wrap gap-2">
                {group.map((slug) => {
                  const d = display(SLUG_TO_ID[slug]!);
                  const r = rooms.get(slug);
                  const closedToday = r ? !rangeFor(r.hours, weekday) : false;
                  return (
                    <button
                      key={slug}
                      type="button"
                      onClick={() => add(slug)}
                      disabled={blocks.length >= MAX_BLOCKS || closedToday}
                      className="panel panel-hover group flex items-center gap-2 px-3 py-2 text-left text-sm disabled:opacity-40"
                      title={closedToday ? `Closed ${WEEKDAYS[weekday]}` : `Add 30 min of ${d.title}`}
                    >
                      <span className="mono text-[11px] text-faint group-hover:text-accent">+</span>
                      <span>
                        <span className="font-medium">{d.title}</span>
                        <span className="mono ml-1.5 text-[10px] text-faint">{d.where}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {blocks.length === 0 && (
          <p className="mt-3 text-sm text-muted">
            Tap rooms to build a session, e.g. <button type="button" className="text-accent underline underline-offset-2" onClick={() => setBlocks([{ slug: "pac-free-weights", minutes: 45 }, { slug: "pac-cardio", minutes: 30 }])}>45 min free weights then 30 min cardio</button>. Then drag to reorder, and we&apos;ll show how crowded each stop usually is at that time.
          </p>
        )}
      </Section>

      {/* ---------- 02 blocks ---------- */}
      <Section eyebrow="02" title="Your session" aside={blocks.length ? `${total} min · ${formatMinute(startMin)} → ${formatMinute(endMin)}` : " "}>
        {blocks.length === 0 ? (
          <p className="text-sm text-muted">No blocks yet.</p>
        ) : (
          <ol ref={listRef} className="space-y-2" aria-label="Session blocks, in order">
            {blocks.map((b, i) => {
              const d = display(SLUG_TO_ID[b.slug]!);
              const seg = score?.segments[i];
              const r = rooms.get(b.slug);
              const pts = (r?.slots ?? []).map((s) => ({ m: s.minute + 7.5, v: s.median }));
              const rg = r ? rangeFor(r.hours, weekday) : null;
              const from = rg ? Math.floor(rg.open / 60) * 60 : 300;
              const to = rg ? Math.min(1560, Math.ceil(rg.close / 60) * 60) : 1440;
              let transform: string | undefined;
              let transition = "transform 200ms var(--ease)";
              let z = 0;
              if (drag) {
                if (i === drag.from) {
                  transform = `translateY(${drag.dy}px)`;
                  transition = "none";
                  z = 10;
                } else if (drag.from < i && i <= drag.to) transform = `translateY(-${drag.h + 8}px)`;
                else if (drag.to <= i && i < drag.from) transform = `translateY(${drag.h + 8}px)`;
              }
              const color = seg ? LABEL_VAR[seg.label] : "var(--muted)";
              return (
                <li
                  key={`${b.slug}-${i}`}
                  data-row
                  className={`panel relative p-3 ${drag?.from === i ? "shadow-lg ring-1 ring-[color:var(--accent)]" : ""}`}
                  style={{ transform, transition, zIndex: z, position: "relative" }}
                >
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      aria-label={`Drag to reorder ${d.title}`}
                      className="mono -ml-1 mt-0.5 cursor-grab touch-none select-none rounded px-1 text-base leading-none text-faint hover:text-fg active:cursor-grabbing"
                      onPointerDown={onHandleDown(i)}
                      onPointerMove={onHandleMove}
                      onPointerUp={onHandleUp}
                      onPointerCancel={onHandleUp}
                    >
                      ⋮⋮
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <div className="min-w-0">
                          <span className="mono mr-2 text-[11px] text-faint">{String(i + 1).padStart(2, "0")}</span>
                          <span className="text-sm font-semibold">{d.title}</span>
                          <span className="mono ml-1.5 text-[10px] text-faint">{d.where}</span>
                        </div>
                        {seg && <LabelPill label={seg.label} />}
                      </div>
                      <div className="mono mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                        {seg ? (
                          <>
                            <span className="text-fg">
                              {formatMinute(seg.from)} → {formatMinute(seg.to)}
                            </span>
                            {seg.open ? (
                              seg.expected != null ? (
                                <span>
                                  usually ~{seg.expected}
                                  {r?.max ? `/${r.max}` : ""} · {seg.pct}%
                                </span>
                              ) : (
                                <span>no usual data yet</span>
                              )
                            ) : (
                              <span className="text-[color:var(--packed)]">closed then</span>
                            )}
                          </>
                        ) : (
                          <span>&nbsp;</span>
                        )}
                      </div>
                      <div className="mt-2">
                        <MiniCurve
                          points={pts}
                          max={r?.max ?? 1}
                          color={color}
                          from={from}
                          to={to}
                          height={34}
                          highlight={seg ? { from: seg.from, to: seg.to } : null}
                          highlightColor={color}
                          index={i}
                        />
                        <MiniAxis from={from} to={to} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <div className="mono inline-flex items-center rounded-md border border-line" role="group" aria-label={`Duration for ${d.title}`}>
                          <button type="button" className="px-2 py-1 text-xs text-muted hover:text-fg" onClick={() => setMinutes(i, b.minutes - STEP)} aria-label="15 minutes less">
                            −
                          </button>
                          <span className="min-w-[4.5rem] border-x border-line px-2 py-1 text-center text-xs">{b.minutes} min</span>
                          <button type="button" className="px-2 py-1 text-xs text-muted hover:text-fg" onClick={() => setMinutes(i, b.minutes + STEP)} aria-label="15 minutes more">
                            +
                          </button>
                        </div>
                        {DURATIONS.map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setMinutes(i, m)}
                            className={`mono rounded-md border px-1.5 py-1 text-[10px] ${b.minutes === m ? "border-accent text-accent" : "border-line text-faint hover:text-fg"}`}
                          >
                            {m}
                          </button>
                        ))}
                        <span className="ml-auto flex items-center gap-0.5">
                          <button type="button" className="mono rounded px-1.5 py-1 text-xs text-faint hover:text-fg disabled:opacity-30" onClick={() => reorder(i, i - 1)} disabled={i === 0} aria-label="Move up">
                            ↑
                          </button>
                          <button type="button" className="mono rounded px-1.5 py-1 text-xs text-faint hover:text-fg disabled:opacity-30" onClick={() => reorder(i, i + 1)} disabled={i === blocks.length - 1} aria-label="Move down">
                            ↓
                          </button>
                          <button type="button" className="mono rounded px-1.5 py-1 text-xs text-faint hover:text-[color:var(--packed)]" onClick={() => remove(i)} aria-label={`Remove ${d.title}`}>
                            ✕
                          </button>
                        </span>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      {/* ---------- 03 when + summary ---------- */}
      <div className="min-w-0 space-y-4">
        <Section eyebrow="03" title="When">
          <fieldset className="min-w-0">
            <legend className="eyebrow mb-1.5">day</legend>
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              {days.map((d, i) => {
                const checked = d === ymd;
                const wd = weekdayOf(d);
                return (
                  <label
                    key={d}
                    className={`mono relative flex min-w-[3.6rem] shrink-0 cursor-pointer flex-col items-center rounded-md border px-2 py-1.5 text-xs has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[color:var(--accent)] ${
                      checked ? "border-accent bg-accent-soft text-fg" : "border-line text-muted hover:text-fg"
                    }`}
                  >
                    <input type="radio" name="day" value={d} checked={checked} onChange={() => setYmd(d)} className="sr-only" />
                    <span className="font-semibold">{i === 0 ? "Today" : i === 1 ? "Tmrw" : WEEKDAYS[wd].slice(0, 3)}</span>
                    <span className="text-[10px] opacity-80">{formatYmd(d).split(", ")[1]}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor="start" className="eyebrow mb-1.5 block">
                start
              </label>
              <select
                id="start"
                value={startMin}
                onChange={(e) => setStartMin(Number(e.target.value))}
                className="mono h-10 rounded-md border border-line bg-card px-2 text-sm"
              >
                {timeOptions.map((m) => (
                  <option key={m} value={m}>
                    {formatMinute(m)}
                  </option>
                ))}
              </select>
            </div>
            {ymd === today && (
              <button
                type="button"
                className="mono h-10 rounded-md border border-line px-3 text-xs text-muted hover:text-fg"
                onClick={() => setStartMin(Math.min(1425, roundUp(lp.minuteOfDay + 5, 5)))}
              >
                now
              </button>
            )}
            {starts[0] && starts[0].startMin !== startMin && (
              <button
                type="button"
                className="mono h-10 rounded-md border border-accent px-3 text-xs text-accent hover:bg-accent-soft"
                onClick={() => setStartMin(starts[0]!.startMin)}
              >
                quietest start · {formatMinute(starts[0].startMin)}
              </button>
            )}
          </div>
          {starts.length > 0 && (
            <div className="mono mt-3 space-y-1 text-[11px] text-muted">
              <p className="eyebrow">quietest starts {dayLabel}</p>
              {starts.map((o) => (
                <button key={o.startMin} type="button" onClick={() => setStartMin(o.startMin)} className="flex w-full items-center gap-3 rounded px-1 py-0.5 text-left hover:bg-card-2">
                  <span className={o.startMin === startMin ? "text-fg" : ""}>{formatMinute(o.startMin)}</span>
                  <span className="relative h-1.5 flex-1 overflow-hidden rounded-sm bg-line">
                    <span className="absolute inset-y-0 left-0 rounded-sm" style={{ width: `${o.score.avgPct}%`, background: LABEL_VAR[o.score.worstPct != null && o.score.worstPct >= 85 ? "packed" : o.score.avgPct! >= 60 ? "busy" : o.score.avgPct! >= 35 ? "moderate" : "quiet"] }} />
                  </span>
                  <span className="w-12 text-right">{o.score.avgPct}% avg</span>
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section eyebrow="04" title={`Session ${dayLabel}`} aside={daysOfData ? `usual = ${plural(daysOfData, "day")} of data` : " "}>
          {!blocks.length ? (
            <p className="text-sm text-muted">Add a room to see the plan.</p>
          ) : !score ? (
            <div className="skeleton h-24 w-full" aria-hidden="true" />
          ) : (
            <>
              {/* timeline strip */}
              <div className="mono flex justify-between text-[10px] text-faint" aria-hidden="true">
                <span>{formatMinute(startMin)}</span>
                <span>{formatMinute(endMin)}</span>
              </div>
              <div className="mt-1 flex h-9 w-full gap-0.5 overflow-hidden rounded-md" role="img" aria-label={score.segments.map((s) => `${display(SLUG_TO_ID[s.slug]!).title} ${formatMinute(s.from)} to ${formatMinute(s.to)}, ${LABEL_TEXT[s.label].toLowerCase()}`).join("; ")}>
                {score.segments.map((s, i) => {
                  const d = display(SLUG_TO_ID[s.slug]!);
                  return (
                    <div
                      key={i}
                      className="fade-in relative flex min-w-0 items-center overflow-hidden px-1.5"
                      style={{ flex: `${s.to - s.from} 1 0`, background: `color-mix(in oklab, ${LABEL_VAR[s.label]} 28%, var(--card-2))`, borderBottom: `2px solid ${LABEL_VAR[s.label]}` }}
                      title={`${d.title} · ${formatMinute(s.from)}–${formatMinute(s.to)} · ${s.pct ?? "?"}%`}
                    >
                      <span className="mono truncate text-[10px] text-fg">
                        {d.title}
                        {s.pct != null && <span className="ml-1 text-muted">{s.pct}%</span>}
                      </span>
                    </div>
                  );
                })}
              </div>

              <dl className="mono mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-card-2 py-2">
                  <dt className="eyebrow">total</dt>
                  <dd className="mt-0.5 text-base font-semibold">{total} min</dd>
                </div>
                <div className="rounded-md bg-card-2 py-2">
                  <dt className="eyebrow">avg fullness</dt>
                  <dd className="mt-0.5 text-base font-semibold" style={{ color: score.avgPct == null ? undefined : LABEL_VAR[score.avgPct >= 85 ? "packed" : score.avgPct >= 60 ? "busy" : score.avgPct >= 35 ? "moderate" : "quiet"] }}>
                    {score.avgPct == null ? "—" : `${score.avgPct}%`}
                  </dd>
                </div>
                <div className="rounded-md bg-card-2 py-2">
                  <dt className="eyebrow">worst stop</dt>
                  <dd className="mt-0.5 text-base font-semibold">{score.worstPct == null ? "—" : `${score.worstPct}%`}</dd>
                </div>
              </dl>

              {!score.feasible && (
                <p className="mono mt-2 text-[11px] text-[color:var(--packed)]">One or more stops fall outside that room&apos;s hours. Shift the start or shorten a block.</p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                {blocks.length > 1 && (
                  <button
                    type="button"
                    disabled={!canImprove}
                    onClick={() => {
                      if (!optimized) return;
                      setJustOptimized((score?.avgPct ?? 0) - (optimized.score.avgPct ?? 0));
                      setBlocks(optimized.blocks);
                      setTimeout(() => setJustOptimized(null), 2500);
                    }}
                    className="mono rounded-md border border-accent px-3 py-1.5 text-xs text-accent hover:bg-accent-soft disabled:border-line disabled:text-faint disabled:hover:bg-transparent"
                  >
                    {justOptimized != null
                      ? `reordered · −${justOptimized} pts`
                      : canImprove
                        ? `optimize order · saves ${(score.avgPct ?? 0) - (optimized!.score.avgPct ?? 0)} pts`
                        : "order is already best"}
                  </button>
                )}
                <button type="button" onClick={share} className="mono rounded-md border border-line px-3 py-1.5 text-xs text-muted hover:text-fg">
                  {copied ? "link copied" : "copy link"}
                </button>
                <button type="button" onClick={() => setBlocks([])} className="mono rounded-md px-3 py-1.5 text-xs text-faint hover:text-fg">
                  clear
                </button>
              </div>
              <p className="mt-3 text-xs text-muted">Expected counts from the usual curve for a {WEEKDAYS[weekday]}, not a promise. Check the live page before you walk over.</p>
            </>
          )}
        </Section>
      </div>
    </div>
  );
}
