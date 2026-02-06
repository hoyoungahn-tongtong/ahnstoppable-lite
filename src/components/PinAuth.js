import React, { useState, useEffect } from "react";

export default function PinAuth({ studentName, isPinRegistered, onLogin, onRegister }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    setPin("");
    setConfirm("");
  }, [studentName, isPinRegistered]);

  if (!studentName) return null;

  return (
    <div className="mt-5 bg-slate-900/60 border border-slate-700 rounded-2xl p-5 text-center">
      {isPinRegistered ? (
        <>
          <div className="text-xl font-black text-slate-100 mb-2">
            Enter your 4-digit PIN
          </div>
          <div className="flex justify-center gap-2">
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-600 text-slate-100 w-full max-w-xs text-center text-lg"
              placeholder="••••"
            />
            <button
              type="button"
              onClick={() => onLogin(pin)}
              className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white font-black"
            >
              Login
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="text-xl font-black text-slate-100 mb-2">
            First time? Create your 4-digit PIN
          </div>
          <div className="text-slate-400 text-sm mb-3">
            (Tip: last 4 digits of your Student ID)
          </div>

          <div className="space-y-2 flex flex-col items-center">
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-600 text-slate-100 w-full max-w-xs text-center text-lg"
              placeholder="Create PIN"
            />
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-600 text-slate-100 w-full max-w-xs text-center text-lg"
              placeholder="Confirm PIN"
            />
            <button
              type="button"
              onClick={() => onRegister(pin, confirm)}
              className="px-5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-black"
            >
              Register & Start
            </button>
          </div>
        </>
      )}
    </div>
  );
}
