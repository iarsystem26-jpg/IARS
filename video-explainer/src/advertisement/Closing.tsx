import { useCurrentFrame } from "remotion";
import { ArrowUpRight } from "lucide-react";
import { Stage, Seal, C, display, move } from "./Shared";

export const AdClosing = () => {
  const f = useCurrentFrame();
  return (
    <Stage>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 182,
          textAlign: "center",
          scale: move(f, 0, 68, 1.1, 1),
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 30,
            opacity: move(f, 0, 30),
            translate: `0 ${move(f, 0, 50, 38, 0)}px`,
          }}
        >
          <Seal size={106} />
          <span
            style={{
              fontFamily: display,
              fontSize: 118,
              fontWeight: 650,
              letterSpacing: -4,
            }}
          >
            IARS
          </span>
        </div>
        <div
          style={{
            fontSize: 19,
            letterSpacing: 4,
            color: "#9AC6E1",
            marginTop: 20,
            fontWeight: 800,
            opacity: move(f, 10, 45),
          }}
        >
          INSTITUTION ATTENDANCE AND RECORDS SYSTEM
        </div>
        <div style={{ overflow: "hidden", marginTop: 56 }}>
          <div
            style={{
              fontFamily: display,
              fontSize: 102,
              lineHeight: 1.15,
              letterSpacing: -4,
              fontWeight: 550,
              translate: `0 ${move(f, 17, 57, 140, 0)}px`,
            }}
          >
            Make attendance <span style={{ color: C.gold }}>simpler.</span>
          </div>
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 36,
            background: C.gold,
            color: C.navy,
            padding: "26px 44px",
            borderRadius: 19,
            marginTop: 56,
            fontSize: 32,
            fontWeight: 900,
            boxShadow: "0 18px 80px #FFD70018",
            opacity: move(f, 38, 65),
            translate: `0 ${move(f, 38, 76, 24, 0)}px`,
          }}
        >
          Log in to IARS <ArrowUpRight size={34} />
        </div>
        <div
          style={{
            fontSize: 26,
            color: "#C5DCEC",
            marginTop: 28,
            opacity: move(f, 51, 82),
          }}
        >
          rmcssg.vercel.app
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 65,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 19,
          color: "#80A9C5",
          letterSpacing: 2,
        }}
      >
        SCAN · VERIFY · RECORD
      </div>
    </Stage>
  );
};
