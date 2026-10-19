import { AbsoluteFill, interpolate } from "remotion";
import { Calendar, ScanLine, FileText } from "lucide-react";
import { Backdrop, Kinetic, Label, Reveal } from "../components/Motion";
import {
  C,
  body,
  display,
  clamp,
  ease,
  enter,
  useMotionFrame,
} from "../design";
export const Agitation = () => {
  const f = useMotionFrame();
  const gather = interpolate(f, [178, 211], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ fontFamily: body, color: "white" }}>
      <Backdrop />
      <div style={{ position: "absolute", left: 120, top: 140 }}>
        <Label>The loose ends add up</Label>
        <div style={{ marginTop: 31 }}>
          <Kinetic size={110}>One event.</Kinetic>
          <Kinetic delay={13} size={110} color={C.gold}>
            Too many loose ends.
          </Kinetic>
        </div>
      </div>
      <svg
        style={{ position: "absolute", left: 0, top: 0 }}
        width="1920"
        height="1080"
      >
        <path
          d="M460 663H770M1060 663H1370"
          stroke="#FFD700"
          strokeWidth="3"
          strokeDasharray="10 10"
          opacity={0.4 + gather * 0.6}
        />
      </svg>
      {[
        {
          label: "Event lists",
          sub: "Which event? Which class?",
          Icon: Calendar,
          x: 165,
          r: -4,
        },
        {
          label: "Check-ins",
          sub: "Who was recorded?",
          Icon: ScanLine,
          x: 700,
          r: 3,
        },
        {
          label: "Follow-up",
          sub: "Where can I review it?",
          Icon: FileText,
          x: 1235,
          r: -2,
        },
      ].map(({ label, sub, Icon, x, r }, i) => {
        const p = enter(f, 20 + i * 12);
        return (
          <div
            key={label}
            style={{
              position: "absolute",
              left:
                x +
                (740 - x) * gather +
                Math.sin(f / 35 + i * 2) * 14 * (1 - gather),
              top:
                530 +
                i * 12 -
                80 * gather +
                Math.sin(f / 44 + i) * 12 * (1 - gather),
              width: 470,
              background: "white",
              borderRadius: 25,
              padding: 35,
              boxSizing: "border-box",
              boxShadow: "0 25px 50px #001B3D35",
              rotate: `${(r + Math.sin(f / 55 + i) * 1.5) * (1 - gather)}deg`,
              scale: 1 - gather * 0.1,
              opacity: Math.min(1, p),
              translate: `0 ${(1 - p) * 50}px`,
              fontFamily: body,
              color: C.navy,
            }}
          >
            <div style={{ display: "flex", gap: 15, alignItems: "center" }}>
              <Icon size={32} color={C.blue} />
              <span
                style={{ fontFamily: display, fontSize: 35, fontWeight: 600 }}
              >
                {label}
              </span>
            </div>
            <div style={{ marginTop: 20, fontSize: 22, color: C.muted }}>
              {sub}
            </div>
          </div>
        );
      })}
      <Reveal
        delay={72}
        style={{
          position: "absolute",
          left: 120,
          bottom: 164,
          fontSize: 34,
          color: "#C1D9EA",
          opacity: 1 - gather,
        }}
      >
        Students need answers. Officers need clear records.
      </Reveal>
    </AbsoluteFill>
  );
};
