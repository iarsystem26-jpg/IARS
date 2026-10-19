import { AbsoluteFill } from "remotion";
import { ArrowUpRight } from "lucide-react";
import { Backdrop, Kinetic, Reveal, Seal, Label } from "../components/Motion";
import { C, body, display } from "../design";
import site from "../site.json";
export const CTA = () => (
  <AbsoluteFill style={{ fontFamily: body, color: "white" }}>
    <Backdrop />
    <div
      style={{
        position: "absolute",
        left: 120,
        right: 120,
        top: 121,
        textAlign: "center",
      }}
    >
      <Reveal>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 31,
          }}
        >
          <Seal size={118} />
          <div
            style={{
              fontFamily: display,
              fontSize: 130,
              fontWeight: 650,
              letterSpacing: -4,
            }}
          >
            IARS
          </div>
        </div>
      </Reveal>
      <Reveal
        delay={8}
        style={{ marginTop: 15, color: "#BDD4E8", fontSize: 27 }}
      >
        Institution Attendance and Records System
      </Reveal>
      <div style={{ marginTop: 73 }}>
        <Kinetic delay={14} size={108}>
          Bring your school
        </Kinetic>
        <Kinetic delay={26} size={108} color={C.gold}>
          records together.
        </Kinetic>
      </div>
      <Reveal
        delay={44}
        style={{ marginTop: 44, display: "flex", justifyContent: "center" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 21,
            background: C.gold,
            color: C.navy,
            padding: "21px 39px",
            borderRadius: 18,
            fontSize: 33,
            fontWeight: 900,
          }}
        >
          Explore IARS
          <ArrowUpRight size={33} />
        </div>
      </Reveal>
      <Reveal
        delay={53}
        style={{ marginTop: 26, fontSize: 28, color: "#C2D9EB" }}
      >
        Log in with your school account.
      </Reveal>
      {site.verified && (
        <Reveal delay={58} style={{ marginTop: 25 }}>
          <Label
            style={{ fontSize: 24, letterSpacing: 1, textTransform: "none" }}
          >
            {site.url}
          </Label>
        </Reveal>
      )}
    </div>
  </AbsoluteFill>
);
