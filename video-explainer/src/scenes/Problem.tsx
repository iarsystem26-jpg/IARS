import { AbsoluteFill, interpolate } from "remotion";
import { Calendar, Check, FileText, MessageCircle } from "lucide-react";
import { Backdrop, Kinetic, Label, Seal } from "../components/Motion";
import {
  C,
  body,
  display,
  clamp,
  ease,
  enter,
  useMotionFrame,
} from "../design";

export const Problem = () => {
  const f = useMotionFrame();
  const clear = interpolate(f, [150, 180], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ fontFamily: body, color: C.navy }}>
      <Backdrop light />
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 80,
          display: "flex",
          gap: 17,
          alignItems: "center",
        }}
      >
        <Seal size={45} />
        <Label light>School attendance</Label>
      </div>
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 245,
          width: 1680,
          textAlign: "center",
          scale: 1 + clear * 0.035,
        }}
      >
        <Kinetic delay={-24} size={145}>
          Who checked in?
        </Kinetic>
        <div
          style={{
            marginTop: 25,
            opacity: interpolate(f, [135, 160], [0, 1], clamp),
          }}
        >
          <Kinetic delay={140} size={112} color={C.blue}>
            Where's the record?
          </Kinetic>
        </div>
      </div>
      {[
        {
          label: "Which event list?",
          x: 165,
          y: 579,
          r: -7,
          t: 21,
          Icon: Calendar,
          blue: true,
        },
        {
          label: "Was I checked in?",
          x: 1100,
          y: 538,
          r: 5,
          t: 45,
          Icon: Check,
          blue: false,
        },
        {
          label: "Who has the record?",
          x: 485,
          y: 736,
          r: 4,
          t: 69,
          Icon: FileText,
          blue: true,
        },
        {
          label: "Any update?",
          x: 1170,
          y: 766,
          r: -5,
          t: 93,
          Icon: MessageCircle,
          blue: false,
        },
        {
          label: "Follow-up still needed",
          x: 687,
          y: 599,
          r: -3,
          t: 126,
          Icon: MessageCircle,
          blue: true,
        },
      ].map(({ label, x, y, r, t, Icon, blue }, i) => {
        const p = enter(f, t);
        return (
          <div
            key={label}
            style={{
              position: "absolute",
              left: x,
              top: y,
              padding: "24px 32px",
              display: "flex",
              gap: 17,
              alignItems: "center",
              background: blue ? C.blue : "white",
              color: blue ? "white" : C.navy,
              border: "1px solid #0081C81A",
              borderRadius: 80,
              boxShadow: "0 16px 40px #00285912",
              fontSize: 31,
              fontWeight: 800,
              opacity: Math.min(1, p) * (1 - clear),
              translate: `${(1 - p) * (i % 2 ? 180 : -180)}px ${(1 - p) * 85 + clear * 180}px`,
              scale: 0.9 + p * 0.1,
              rotate: `${r}deg`,
            }}
          >
            <Icon size={30} />
            {label}
          </div>
        );
      })}
      <div
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          top: 708,
          textAlign: "center",
          opacity: clear,
          translate: `0 ${(1 - clear) * 40}px`,
        }}
      >
        <div style={{ fontFamily: display, fontSize: 39, fontWeight: 500 }}>
          Keeping them together should be simple.
        </div>
        <div
          style={{
            width: interpolate(f, [180, 220], [0, 340], {
              ...clamp,
              easing: ease,
            }),
            height: 5,
            background: C.gold,
            borderRadius: 5,
            margin: "31px auto",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
