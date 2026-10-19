import { useCurrentFrame, interpolate } from "remotion";
import {
  Check,
  MousePointer2,
  ScanLine,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { AppShell, ScanUI } from "../components/ProductUI";
import { Stage, Wordmark, C, display, move, clamp } from "./Shared";

export const AdSolution = () => {
  const f = useCurrentFrame();
  const stage = f < 100 ? "scanning" : f < 294 ? "verify" : "recorded";
  const push = move(f, 95, 170);
  const retreat = move(f, 352, 419);
  return (
    <Stage light>
      <div style={{ position: "absolute", left: 100, top: 62 }}>
        <Wordmark />
      </div>
      <div
        style={{
          position: "absolute",
          right: 108,
          top: 82,
          fontSize: 21,
          fontWeight: 800,
          letterSpacing: 3,
          color: "#52758F",
        }}
      >
        INSTITUTION ATTENDANCE AND RECORDS SYSTEM
      </div>
      <div
        style={{
          position: "absolute",
          left: 103,
          top: 159,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            fontFamily: display,
            fontSize: 90,
            fontWeight: 600,
            letterSpacing: -3,
            translate: `0 ${move(f, 7, 48, 115, 0)}px`,
          }}
        >
          From QR to <span style={{ color: C.blue }}>recorded.</span>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 106,
          top: 382,
          width: 320,
          opacity: 1 - retreat,
          translate: `${move(f, 12, 65, -70, 0)}px 0`,
        }}
      >
        {[
          [ScanLine, "Scan the QR", 0],
          [ShieldCheck, "Verify identity", 100],
          [CheckCircle2, "Record attendance", 294],
        ].map(([Icon, label, start], i) => {
          const Glyph = Icon as typeof Check;
          const active = f >= Number(start);
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 20,
                marginBottom: 55,
                opacity: active ? 1 : 0.3,
                translate: `${active ? 8 : 0}px 0`,
              }}
            >
              <div
                style={{
                  width: 55,
                  height: 55,
                  borderRadius: 18,
                  display: "grid",
                  placeItems: "center",
                  background: active ? C.navy : "#DDE5EF",
                  color: "white",
                }}
              >
                <Glyph size={28} />
              </div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  lineHeight: 1.2,
                  width: 215,
                }}
              >
                {String(label)}
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: "absolute",
          left: 490,
          top: 330,
          transformOrigin: "65% 55%",
          transform:
            f < 80
              ? `perspective(2200px) translateY(${move(f, 0, 64, 170, 0)}px) rotateY(${move(f, 0, 80, -10, 0)}deg) rotateX(${move(f, 0, 80, 6, 0)}deg)`
              : `translateY(${retreat * 35}px) scale(${1 + push * 0.06 - retreat * 0.14})`,
          opacity: move(f, 0, 28) * (1 - retreat),
        }}
      >
        <AppShell active="Attendance Scanner" width={1260} height={600}>
          <ScanUI stage={stage} />
        </AppShell>
        {f >= 180 && f < 304 && (
          <div
            style={{
              position: "absolute",
              left: interpolate(f, [180, 260, 294], [1100, 820, 820], {
                ...clamp,
              }),
              top: interpolate(f, [180, 260, 294], [600, 498, 498], {
                ...clamp,
              }),
              opacity: move(f, 180, 200),
              scale: f >= 279 && f < 294 ? 0.85 : 1,
            }}
          >
            <MousePointer2
              size={39}
              fill={C.navy}
              color="white"
              strokeWidth={1.6}
            />
          </div>
        )}
        {f >= 294 && (
          <div
            style={{
              position: "absolute",
              right: -28,
              bottom: -27,
              padding: "20px 30px",
              borderRadius: 18,
              background: C.green,
              color: "white",
              fontSize: 27,
              fontWeight: 800,
              display: "flex",
              gap: 12,
              alignItems: "center",
              boxShadow: "0 15px 35px #00824630",
              scale: move(f, 294, 322, 0.82, 1),
              opacity: move(f, 294, 308),
            }}
          >
            <CheckCircle2 size={30} /> Attendance recorded
          </div>
        )}
      </div>
      <div
        style={{
          position: "absolute",
          left: 107,
          bottom: 58,
          fontSize: 19,
          color: "#60778B",
          opacity: 1 - retreat,
        }}
      >
        Illustrative student and event data · Online attendance flow
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: C.navy,
          clipPath: `circle(${interpolate(f, [394, 419], [0, 145], clamp)}% at 74% 52%)`,
          opacity: f >= 394 ? 1 : 0,
        }}
      />
      {f < 28 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: C.gold,
            clipPath: `circle(${move(f, 0, 27, 145, 0)}% at 74% 52%)`,
          }}
        />
      )}
    </Stage>
  );
};
