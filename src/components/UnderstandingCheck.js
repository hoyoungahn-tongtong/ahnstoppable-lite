import React, { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase";

const APP_ID =
  (typeof process !== "undefined" && process.env && process.env.REACT_APP_APP_ID) ||
  "default-app-id";

const litePath = (colName) => `/artifacts/${APP_ID}/public/data/lite/${colName}`;

export default function UnderstandingCheck({ classId, sessionId, canSubmit, studentName }) {
  const [status, setStatus] = useState("");

  const submit = async (color) => {
    if (!studentName) {
      setStatus("Please login first.");
      setTimeout(() => setStatus(""), 1200);
      return;
    }
    if (!canSubmit) {
      setStatus("Locked outside class time.");
      setTimeout(() => setStatus(""), 1200);
      return;
    }

    try {
      await addDoc(collection(db, litePath("understanding")), {
        classId,
        sessionId,
        color,              // red | yellow | green
        studentName,
        createdAt: serverTimestamp(),
      });
      setStatus("Recorded!");
      setTimeout(() => setStatus(""), 900);
    } catch (e) {
      console.error(e);
      setStatus("Failed (rules/config).");
      setTimeout(() => setStatus(""), 1400);
    }
  };

  const Light = ({ color, bg, border, label }) => (
    <button
      type="button"
      onClick={() => submit(color)}
      disabled={!canSubmit}
      className={[
        "w-16 h-16 rounded-full border-4 shadow-inner flex items-center justify-center",
        bg,
        border,
        !canSubmit ? "opacity-60 cursor-not-allowed" : "hover:scale-[1.03] active:scale-[0.98]",
      ].join(" ")}
      title={color}
    >
      <span className="text-3xl leading-none">{label}</span>
    </button>
  );

  return (
    <div className="flex flex-col items-center text-center">
      <div className="text-slate-300 mb-3">
        Tap a color (you can tap multiple times during class).
      </div>

      <div className="flex items-center justify-center gap-5">
        <Light color="red" bg="bg-red-500" border="border-red-300" label="😟" />
        <Light color="yellow" bg="bg-yellow-400" border="border-yellow-200" label="🤔" />
        <Light color="green" bg="bg-green-500" border="border-green-300" label="✅" />
      </div>

      {status ? <div className="mt-3 font-bold text-slate-100">{status}</div> : null}

      {!canSubmit ? (
        <div className="mt-2 text-slate-400 text-sm">
          View-only right now (outside class time).
        </div>
      ) : null}
    </div>
  );
}
