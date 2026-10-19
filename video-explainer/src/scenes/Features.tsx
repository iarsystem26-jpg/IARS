import React from "react";
import { AbsoluteFill, interpolate, Sequence, useVideoConfig } from "remotion";
import {
  Backdrop,
  Cursor,
  Kinetic,
  Label,
  Reveal,
  DemoNote,
} from "../components/Motion";
import {
  AppShell,
  Dashboard,
  PassCard,
  ScanUI,
  LocationLine,
} from "../components/ProductUI";
import { C, body, display, clamp, ease, useMotionFrame } from "../design";
const Step: React.FC<{ number: string; label: string }> = ({
  number,
  label,
}) => (
  <div style={{ display: "flex", gap: 17, alignItems: "center" }}>
    <span
      style={{
        display: "grid",
        placeItems: "center",
        width: 55,
        height: 55,
        borderRadius: 16,
        border: "1px solid #0081C850",
        color: C.blue,
        fontFamily: display,
        fontSize: 26,
      }}
    >
      {number}
    </span>
    <Label light>{label}</Label>
  </div>
);
const Pass = () => {
  const f = useMotionFrame();
  const open = f >= 33;
  return (
    <AbsoluteFill style={{ fontFamily: body, color: C.navy }}>
      <Backdrop light />
      <div style={{ position: "absolute", left: 120, top: 177, width: 620 }}>
        <Step number="01" label="The student pass" />
        <div style={{ marginTop: 45 }}>
          <Kinetic size={106}>Open your</Kinetic>
          <Kinetic delay={10} size={106} color={C.blue}>
            current pass.
          </Kinetic>
        </div>
        <Reveal
          delay={30}
          style={{
            marginTop: 35,
            fontSize: 31,
            lineHeight: 1.45,
            color: C.muted,
            width: 500,
          }}
        >
          Your student identity,
          <br />
          ready for the attendance officer.
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          left: 792,
          top: 169,
          width: 998,
          scale: interpolate(f, [0, 33, 70, 120], [0.96, 1, 1.05, 1.05], {
            ...clamp,
            easing: ease,
          }),
          transformOrigin: "right center",
        }}
      >
        <AppShell
          role="student"
          active={open ? "My QR" : "Home"}
          width={998}
          height={686}
        >
          {open ? (
            <>
              <div
                style={{
                  textAlign: "center",
                  fontSize: 28,
                  fontFamily: display,
                  fontWeight: 650,
                  marginTop: -9,
                  marginBottom: 16,
                }}
              >
                Student QR Passport
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <PassCard />
              </div>
            </>
          ) : (
            <>
              <div style={{ fontFamily: display, fontSize: 38 }}>
                Student workspace
              </div>
              <div style={{ marginTop: 27, color: C.muted, fontSize: 24 }}>
                Open My QR before checking in.
              </div>
            </>
          )}
        </AppShell>
        <Cursor
          points={[
            { frame: 0, x: 270, y: 430 },
            { frame: 24, x: 69, y: 217 },
            { frame: 40, x: 70, y: 217 },
            { frame: 62, x: 420, y: 390 },
          ]}
          clicks={[24]}
          showFrom={5}
          showUntil={70}
        />
      </div>
      <DemoNote />
    </AbsoluteFill>
  );
};
const Scan = () => {
  const f = useMotionFrame();
  const stage =
    f < 32 ? "ready" : f < 81 ? "scanning" : f < 171 ? "verify" : "recorded";
  return (
    <AbsoluteFill style={{ fontFamily: body, color: C.navy }}>
      <Backdrop light />
      <div style={{ position: "absolute", left: 120, top: 175, width: 620 }}>
        <Step number="02" label="The officer check-in" />
        <div style={{ marginTop: 45 }}>
          {f < 171 ? (
            <>
              <Kinetic size={104}>Scan.</Kinetic>
              <Kinetic delay={9} size={104} color={C.blue}>
                Check identity.
              </Kinetic>
            </>
          ) : (
            <>
              <Kinetic delay={171} size={102}>
                Then record
              </Kinetic>
              <Kinetic delay={178} size={102} color={C.blue}>
                attendance.
              </Kinetic>
            </>
          )}
        </div>
        <Reveal
          delay={38}
          style={{
            marginTop: 38,
            fontSize: 31,
            color: C.muted,
            lineHeight: 1.45,
            width: 530,
          }}
        >
          A verified student.
          <br />A clear attendance record.
        </Reveal>
        <Reveal delay={105} style={{ marginTop: 31 }}>
          <LocationLine />
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          left: 792,
          top: 175,
          width: 998,
          scale: interpolate(f, [0, 81, 110, 162, 197], [1, 1, 1.09, 1.09, 1], {
            ...clamp,
            easing: ease,
          }),
          transformOrigin: "right center",
        }}
      >
        <AppShell active="Attendance Scanner" width={998} height={670}>
          <ScanUI stage={stage} />
        </AppShell>
        <Cursor
          points={[
            { frame: 0, x: 500, y: 410 },
            { frame: 27, x: 920, y: 279 },
            { frame: 36, x: 920, y: 279 },
            { frame: 84, x: 619, y: 367 },
            { frame: 146, x: 800, y: 510 },
            { frame: 162, x: 800, y: 510 },
            { frame: 178, x: 892, y: 563 },
          ]}
          clicks={[27, 162]}
          showFrom={6}
          showUntil={184}
        />
      </div>
      <DemoNote />
    </AbsoluteFill>
  );
};
const Records = () => {
  const f = useMotionFrame();
  const officer = f >= 45;
  return (
    <AbsoluteFill style={{ fontFamily: body, color: C.navy }}>
      <Backdrop light />
      <div style={{ position: "absolute", left: 120, top: 178, width: 620 }}>
        <Step number="03" label="The records" />
        <div style={{ marginTop: 45 }}>
          <Kinetic size={109}>Review it.</Kinetic>
          <Kinetic delay={9} size={109} color={C.blue}>
            Report it.
          </Kinetic>
        </div>
        <Reveal
          delay={23}
          style={{
            marginTop: 39,
            fontSize: 31,
            lineHeight: 1.45,
            color: C.muted,
            width: 540,
          }}
        >
          Students see their history.
          <br />
          Officers filter and export reports.
        </Reveal>
      </div>
      <div
        style={{
          position: "absolute",
          left: 759,
          top: 204,
          scale: interpolate(
            f,
            [0, 45, 65, 108, 155],
            [0.84, 0.87, 0.9, 0.9, 0.87],
            { ...clamp, easing: ease },
          ),
          transformOrigin: "left top",
        }}
      >
        <AppShell
          width={1200}
          height={695}
          role={officer ? "officer" : "student"}
          active={officer ? "Attendance" : "Records"}
        >
          <Dashboard
            student={!officer}
            filtered={f >= 78}
            downloaded={f >= 108}
          />
          {f >= 60 && f < 78 && (
            <div
              style={{
                position: "absolute",
                left: 45,
                top: 349,
                width: 324,
                border: "1px solid #E2E8F0",
                borderRadius: 12,
                background: "white",
                padding: 13,
                boxSizing: "border-box",
                boxShadow: "0 12px 35px #00285925",
                fontSize: 19,
                fontWeight: 800,
                color: C.navy,
              }}
            >
              Campus Assembly
            </div>
          )}
        </AppShell>
        <Cursor
          points={[
            { frame: 0, x: 490, y: 420 },
            { frame: 59, x: 420, y: 327 },
            { frame: 61, x: 420, y: 327 },
            { frame: 75, x: 420, y: 375 },
            { frame: 78, x: 420, y: 375 },
            { frame: 96, x: 1105, y: 72 },
            { frame: 99, x: 1105, y: 72 },
            { frame: 116, x: 1115, y: 105 },
          ]}
          clicks={[60, 78, 99]}
          showFrom={46}
          showUntil={123}
        />
      </div>
      <DemoNote />
    </AbsoluteFill>
  );
};
export const Features = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      <Sequence name="Open My QR" durationInFrames={4 * fps} premountFor={fps}>
        <Pass />
      </Sequence>
      <Sequence
        name="Scan and verify identity"
        from={4 * fps}
        durationInFrames={7.5 * fps}
        premountFor={fps}
      >
        <Scan />
      </Sequence>
      <Sequence
        name="Review and export"
        from={11.5 * fps}
        durationInFrames={5.9 * fps}
        premountFor={fps}
      >
        <Records />
      </Sequence>
    </AbsoluteFill>
  );
};
