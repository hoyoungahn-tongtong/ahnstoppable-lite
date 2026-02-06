import React, { useMemo, useRef, useEffect } from "react";

function pad2(n) {
  return String(n).padStart(2, "0");
}
function toISO(y, m1, d) {
  return `${y}-${pad2(m1)}-${pad2(d)}`;
}

function buildMonth(year, monthIndex0) {
  const first = new Date(year, monthIndex0, 1);
  const last = new Date(year, monthIndex0 + 1, 0);
  const daysInMonth = last.getDate();
  const startDow = first.getDay();

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export default function Calendar2026({ year = 2026, selectedDateISO, onSelectDateISO, onClose }) {
  const wrapRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target)) onClose?.();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, m) => ({
      m,
      name: MONTH_NAMES[m],
      weeks: buildMonth(year, m),
    }));
  }, [year]);

  return (
    <div ref={wrapRef} className="w-full mt-3 bg-slate-900/95 border border-slate-700 rounded-2xl p-4 shadow-2xl">
      <div className="flex items-center justify-between mb-3">
        <div className="text-slate-200 font-black text-lg">Calendar ({year})</div>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 font-bold text-sm"
        >
          Close
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-auto pr-1">
        {months.map((mo) => (
          <div key={mo.m} className="bg-slate-900/60 border border-slate-700 rounded-2xl p-4">
            <div className="text-center font-extrabold text-slate-100 mb-3">
              {mo.name} {year}
            </div>

            <div className="grid grid-cols-7 gap-1 text-xs mb-2">
              {DOW.map((d) => (
                <div key={d} className="text-center text-slate-400 font-bold">
                  {d}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {mo.weeks.flat().map((day, idx) => {
                if (!day) return <div key={idx} className="h-8 rounded-lg bg-slate-900/20 border border-transparent" />;

                const iso = toISO(year, mo.m + 1, day);
                const isSelected = iso === selectedDateISO;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      onSelectDateISO(iso);
                      onClose?.();
                    }}
                    className={[
                      "h-8 rounded-lg border text-sm font-bold flex items-center justify-center",
                      isSelected
                        ? "bg-orange-500 text-white border-orange-400"
                        : "bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800",
                    ].join(" ")}
                    title={iso}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 text-slate-400 text-sm text-center">
        Selected: <span className="text-slate-200 font-bold">{selectedDateISO}</span>
      </div>
    </div>
  );
}
