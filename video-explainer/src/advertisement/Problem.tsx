import { useCurrentFrame, interpolate } from "remotion";
import { FileText, Search, Clock3 } from "lucide-react";
import { Stage, Wordmark, C, display, move, clamp } from "./Shared";

export const AdProblem = () => {
  const f = useCurrentFrame();
  const collapse = move(f, 207, 239);
  return (
    <Stage>
      <div style={{ position: "absolute", left: 100, top: 62 }}>
        <Wordmark />
      </div>
      <div
        style={{
          position: "absolute",
          left: 105,
          top: 265,
          width: 830,
          translate: `${-collapse * 120}px 0`,
          opacity: 1 - collapse,
        }}
      >
        <div
          style={{
            fontSize: 21,
            fontWeight: 800,
            letterSpacing: 5,
            color: "#9CC5E0",
            marginBottom: 28,
          }}
        >
          THE DAILY ATTENDANCE ROUTINE
        </div>
        <div style={{ overflow: "hidden" }}>
          <div
            style={{
              fontFamily: display,
              fontSize: 112,
              fontWeight: 600,
              lineHeight: 1.12,
              letterSpacing: -5,
            }}
          >
            Still sorting
          </div>
        </div>
        <div style={{ overflow: "hidden" }}>
          <div
            style={{
              fontFamily: display,
              fontSize: 112,
              fontWeight: 600,
              lineHeight: 1.08,
              letterSpacing: -5,
              translate: `0 ${move(f, 13, 51, 130, 0)}px`,
            }}
          >
            attendance
          </div>
        </div>
        <div style={{ overflow: "hidden" }}>
          <div
            style={{
              fontFamily: display,
              fontSize: 112,
              fontWeight: 600,
              lineHeight: 1.1,
              letterSpacing: -5,
              color: C.gold,
              translate: `0 ${move(f, 28, 67, 130, 0)}px`,
            }}
          >
            by hand?
          </div>
        </div>
        <div
          style={{
            width: move(f, 60, 110, 0, 180),
            height: 5,
            background: C.gold,
            marginTop: 38,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          left: 1060,
          top: 185,
          width: 660,
          height: 715,
          perspective: 1800,
          transform: `translateX(${-collapse * 60}px) scale(${1 - collapse * 0.5})`,
          opacity: 1 - collapse,
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 510,
              height: 575,
              left: 45 + i * 19,
              top: 40 + i * 27,
              background: "#FCFCFD",
              borderRadius: 16,
              padding: 34,
              boxSizing: "border-box",
              color: C.navy,
              boxShadow: "0 25px 70px #000c2040",
              transform: `translateY(${move(f, i * 26, i * 26 + 52, 100, 0)}px) rotate(${[-13, 9, -3][i] + move(f, 0, 210, 0, 2)}deg)`,
              opacity: i === 0 ? 1 : move(f, i * 26, i * 26 + 18),
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "2px solid #DAE4EF",
                paddingBottom: 25,
              }}
            >
              <FileText size={34} />
              <span style={{ fontSize: 16, letterSpacing: 2, fontWeight: 900 }}>
                ATTENDANCE SHEET
              </span>
            </div>
            <div
              style={{
                fontFamily: display,
                fontSize: 32,
                fontWeight: 600,
                marginTop: 25,
              }}
            >
              {["School event", "Class attendance", "Campus assembly"][i]}
            </div>
            <div style={{ marginTop: 30 }}>
              {[0, 1, 2, 3, 4, 5].map((j) => (
                <div
                  key={j}
                  style={{
                    height: 49,
                    display: "flex",
                    alignItems: "center",
                    gap: 20,
                    borderBottom: "1px solid #DCE5EF",
                  }}
                >
                  <span
                    style={{
                      width: 19,
                      height: 19,
                      border: "2px solid #A8B8C9",
                      borderRadius: 3,
                    }}
                  />
                  <span
                    style={{
                      height: 7,
                      width: 180 - (j % 3) * 28,
                      background: "#CAD6E3",
                      borderRadius: 5,
                    }}
                  />
                  <span
                    style={{
                      height: 7,
                      width: 70,
                      background: j % 2 ? "#E1E8F0" : "#BDCFE1",
                      marginLeft: "auto",
                      borderRadius: 5,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        <div
          style={{
            position: "absolute",
            left: -36,
            top: 500,
            background: C.gold,
            color: C.navy,
            borderRadius: 20,
            padding: "20px 25px",
            boxShadow: "0 15px 50px #00132c55",
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 23,
            fontWeight: 900,
            scale: move(f, 86, 123, 0.75, 1),
            opacity: move(f, 86, 105),
          }}
        >
          <Search size={28} /> Find. Check. Repeat.
        </div>
        <div
          style={{
            position: "absolute",
            right: -40,
            top: 10,
            background: "#FFFFFF14",
            border: "1px solid #FFFFFF35",
            borderRadius: 25,
            padding: 23,
            rotate: "10deg",
            opacity: move(f, 65, 95),
          }}
        >
          <Clock3 size={46} color={C.gold} />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 75,
          left: 105,
          color: "#9CC5E0",
          fontSize: 22,
          opacity: move(f, 110, 150) * (1 - collapse),
        }}
      >
        A familiar task. A clearer way forward.
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: C.gold,
          clipPath: `circle(${interpolate(f, [222, 239], [0, 145], clamp)}% at 74% 52%)`,
          opacity: f >= 222 ? 1 : 0,
        }}
      />
    </Stage>
  );
};
