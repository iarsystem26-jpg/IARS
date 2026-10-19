import React from "react";
import QRCode from "react-qr-code";
import {
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Home,
  Calendar,
  ScanLine,
  QrCode,
  ShieldCheck,
  Users,
  MapPin,
  ChevronDown,
  Search,
  Play,
  UserRound,
} from "lucide-react";
import { C, body, display } from "../design";
import { Seal } from "./Motion";
export const UiButton: React.FC<{
  children: React.ReactNode;
  gold?: boolean;
  style?: React.CSSProperties;
}> = ({ children, gold = false, style }) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
      fontFamily: body,
      fontSize: 19,
      fontWeight: 800,
      padding: "13px 21px",
      borderRadius: 12,
      background: gold ? C.gold : C.navy,
      color: gold ? C.navy : "white",
      ...style,
    }}
  >
    {children}
  </div>
);
export const Chip: React.FC<{ children: React.ReactNode; green?: boolean }> = ({
  children,
  green = false,
}) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      padding: "7px 13px",
      borderRadius: 30,
      fontSize: 17,
      fontWeight: 800,
      background: green ? "#E8F8EF" : "#E6F4FC",
      color: green ? "#008246" : C.navy,
    }}
  >
    {green && <Check size={17} />} {children}
  </span>
);
export const AppShell: React.FC<{
  children: React.ReactNode;
  active?: string;
  role?: "student" | "officer";
  width?: number;
  height?: number;
}> = ({
  children,
  active = "Attendance",
  role = "officer",
  width = 1240,
  height = 580,
}) => {
  const student = role === "student";
  const items = student
    ? [
        ["Home", Home],
        ["My QR", QrCode],
        ["Events", Calendar],
        ["Records", FileText],
      ]
    : [
        ["Home", Home],
        ["Attendance Scanner", ScanLine],
        ["Attendance", FileText],
      ];
  return (
    <div
      style={{
        width,
        height,
        background: "#F8FAFC",
        borderRadius: 22,
        border: "1px solid #B6CBE0",
        overflow: "hidden",
        display: "flex",
        fontFamily: body,
        color: C.navy,
        boxShadow: "0 30px 80px #000F2E30",
      }}
    >
      <div
        style={{
          width: 210,
          flexShrink: 0,
          background: C.navy,
          color: "white",
          padding: "26px 18px",
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            paddingBottom: 28,
            borderBottom: "1px solid #FFFFFF15",
          }}
        >
          <Seal size={43} />
          <div>
            <div style={{ fontFamily: display, fontSize: 29, fontWeight: 700 }}>
              IARS
            </div>
            <div
              style={{
                fontSize: 9,
                fontWeight: 900,
                letterSpacing: 1.1,
                color: "#4ADE80",
              }}
            >
              ATTENDANCE & RECORDS
            </div>
          </div>
        </div>
        <div style={{ marginTop: 24 }}>
          {items.map(([label, Icon]) => {
            const name = label as string;
            const Glyph = Icon as typeof Home;
            return (
              <div
                key={name}
                style={{
                  padding: "16px 13px",
                  marginBottom: 12,
                  borderRadius: 12,
                  fontSize: 16,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  background: name === active ? "#FFFFFF1C" : "transparent",
                  border:
                    name === active
                      ? "1px solid #FFD70070"
                      : "1px solid transparent",
                  color: name === active ? C.gold : "white",
                }}
              >
                <Glyph size={20} />
                {name}
              </div>
            );
          })}
        </div>
        <div
          style={{
            marginTop: 65,
            paddingTop: 20,
            borderTop: "1px solid #FFFFFF15",
            fontSize: 13,
            color: "#BFD6EB",
          }}
        >
          {student ? "Student workspace" : "Authorized officer"}
        </div>
      </div>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          padding: 29,
          position: "relative",
          boxSizing: "border-box",
        }}
      >
        {children}
      </div>
    </div>
  );
};
export const Dashboard: React.FC<{
  downloaded?: boolean;
  filtered?: boolean;
  student?: boolean;
}> = ({ downloaded = false, filtered = false, student = false }) => (
  <>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <div>
        <div
          style={{
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: 2,
            color: C.blue,
            textTransform: "uppercase",
          }}
        >
          {student ? "Verified history" : "Attendance administration"}
        </div>
        <div
          style={{
            fontSize: student ? 28 : 34,
            fontFamily: display,
            fontWeight: 650,
            marginTop: 5,
          }}
        >
          {student ? "Attendance & Sanction Records" : "Attendance Dashboard"}
        </div>
        <div style={{ fontSize: 15, color: C.muted, marginTop: 4 }}>
          {student
            ? "Consolidated attendance history"
            : "Analytics & Reporting Module"}
        </div>
      </div>
      {student ? (
        <UiButton>
          <Download size={18} />
          Export PDF
        </UiButton>
      ) : (
        <UiButton>
          <Download size={18} />
          CSV
        </UiButton>
      )}
    </div>
    <div style={{ display: "flex", gap: 16, marginTop: 23 }}>
      {(student
        ? [
            ["Attendance Rate", "100%"],
            ["Late Check-Ins", "0"],
            ["Active Sanctions", "0 Hours"],
          ]
        : [
            ["Present", "2"],
            ["Late", "1"],
            ["Absent", "0"],
          ]
      ).map(([label, value]) => (
        <div
          key={label}
          style={{
            flex: 1,
            border: `1px solid ${C.border}`,
            borderRadius: 15,
            padding: "16px 20px",
            background: "white",
          }}
        >
          <div style={{ fontSize: 14, color: C.muted, fontWeight: 800 }}>
            {label}
          </div>
          <div
            style={{
              fontFamily: display,
              fontSize: 35,
              fontWeight: 600,
              color: label === "Present" ? C.green : C.navy,
              marginTop: 5,
            }}
          >
            {value}
          </div>
        </div>
      ))}
    </div>
    <div
      style={{
        display: "flex",
        gap: 14,
        marginTop: 22,
        padding: 15,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        background: "white",
      }}
    >
      {(student
        ? ["Search event/ceremony title...", "All Categories", "All Statuses"]
        : ["Event Scope", "Time Period", "Education Level"]
      ).map((label, i) => (
        <div
          key={label}
          style={{ flex: i === 0 ? 1.2 : 1, fontSize: 14, fontWeight: 700 }}
        >
          <div style={{ color: C.muted, marginBottom: 7 }}>{label}</div>
          <div
            style={{
              padding: 10,
              border: `1px solid ${C.border}`,
              borderRadius: 9,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: 15,
            }}
          >
            {student ? (
              i === 0 ? (
                <Search size={17} />
              ) : (
                label
              )
            ) : i === 0 ? (
              filtered ? (
                "Campus Assembly"
              ) : (
                "All Events"
              )
            ) : i === 1 ? (
              "This Month"
            ) : (
              "All Levels"
            )}
            <ChevronDown size={16} />
          </div>
        </div>
      ))}
    </div>
    <div
      style={{
        marginTop: 22,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        overflow: "hidden",
        background: "white",
      }}
    >
      <div
        style={{
          padding: "13px 18px",
          background: "#F1F5F9",
          fontWeight: 900,
          fontSize: 14,
          letterSpacing: 1.3,
        }}
      >
        {student ? "ATTENDANCE LEDGER" : "DETAILED RECORDS"}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: student ? "2fr 1fr 1fr" : "1.8fr 1.8fr 1fr",
          gap: 15,
          padding: "11px 18px",
          borderBottom: `1px solid ${C.border}`,
          fontSize: 13,
          color: C.muted,
          fontWeight: 900,
        }}
      >
        <span>EVENT / WINDOW</span>
        <span>{student ? "TIME IN" : "NAME"}</span>
        <span>STATUS</span>
      </div>
      {(student
        ? [
            ["Campus Assembly", "8:02 AM", "Present"],
            ["Flag Ceremony", "7:01 AM", "Present"],
          ]
        : [
            ["Campus Assembly", "Alex Rivera", "Present"],
            ["Campus Assembly", "Sam Cruz", "Present"],
            ["Campus Assembly", "Jamie Reyes", "Late"],
          ]
      ).map((row) => (
        <div
          key={row[1]}
          style={{
            display: "grid",
            gridTemplateColumns: student ? "2fr 1fr 1fr" : "1.8fr 1.8fr 1fr",
            gap: 15,
            padding: "12px 18px",
            borderBottom: "1px solid #F1F5F9",
            fontSize: 17,
            alignItems: "center",
          }}
        >
          <span style={{ fontWeight: 700 }}>{row[0]}</span>
          <span>{row[1]}</span>
          <span
            style={{
              color: row[2] === "Late" ? "#B85F00" : "#008246",
              fontWeight: 800,
            }}
          >
            {row[2]}
          </span>
        </div>
      ))}
    </div>
    {downloaded && (
      <div
        style={{
          position: "absolute",
          bottom: 20,
          right: 20,
          display: "flex",
          gap: 10,
          alignItems: "center",
          padding: "15px 22px",
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          background: "white",
          boxShadow: "0 8px 30px #00285920",
          fontSize: 18,
          fontWeight: 800,
        }}
      >
        <CheckCircle2 color={C.green} size={23} />
        CSV download started
      </div>
    )}
  </>
);
export const PassCard = () => (
  <div
    style={{
      width: 344,
      border: `1px solid ${C.border}`,
      borderRadius: 20,
      background: "white",
      overflow: "hidden",
      boxShadow: "0 16px 40px #00285918",
    }}
  >
    <div
      style={{
        background: "linear-gradient(125deg,#00A3E0,#0055B7)",
        color: "white",
        padding: "18px 12px",
        textAlign: "center",
        borderBottom: `3px solid ${C.green}`,
      }}
    >
      <Seal size={47} />
      <div style={{ fontSize: 14, fontWeight: 900, marginTop: 9 }}>
        Institution Attendance & Records
      </div>
      <div
        style={{
          fontSize: 11,
          color: "#FFE3AD",
          letterSpacing: 1.5,
          marginTop: 5,
        }}
      >
        IARS | STUDENT ID CARD
      </div>
    </div>
    <div style={{ padding: 18, textAlign: "center" }}>
      <div style={{ fontSize: 24, fontWeight: 900 }}>Alex Rivera</div>
      <div style={{ fontSize: 14, color: C.muted, marginTop: 4 }}>
        ID: 2026-00001A
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 8,
          marginTop: 12,
        }}
      >
        <Chip>General studies</Chip>
        <Chip>Year 1</Chip>
      </div>
      <div
        style={{
          margin: "16px auto 12px",
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          padding: 16,
          width: 188,
          background: "white",
        }}
      >
        <QRCode
          value="IARS-VIDEO-DEMO-NOT-A-CREDENTIAL"
          size={188}
          fgColor={C.navy}
          level="H"
        />
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: C.green,
          marginBottom: 12,
        }}
      >
        Current live QR pass
      </div>
      <UiButton style={{ fontSize: 13, padding: "10px 15px" }}>
        <Download size={16} />
        Download permanent ID
      </UiButton>
    </div>
  </div>
);
export const ScanUI: React.FC<{
  stage: "ready" | "scanning" | "verify" | "recorded";
}> = ({ stage }) => {
  const modal = stage === "verify" || stage === "recorded";
  return (
    <>
      <div
        style={{
          fontSize: 12,
          fontWeight: 900,
          letterSpacing: 1.8,
          color: C.blue,
        }}
      >
        MAYOR WORKSPACE · ATTENDANCE
      </div>
      <div
        style={{
          fontFamily: display,
          fontSize: 33,
          fontWeight: 600,
          marginTop: 4,
        }}
      >
        Attendance recording
      </div>
      <div style={{ fontSize: 15, color: C.muted, marginTop: 4 }}>
        Campus Assembly · Verify each student before saving their attendance.
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 19 }}>
        <div
          style={{
            flex: 1,
            background: "white",
            border: `1px solid ${C.border}`,
            borderRadius: 13,
            padding: 15,
            fontSize: 15,
          }}
        >
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 8 }}>
            Scan action
          </div>
          Scan in <ChevronDown size={15} style={{ float: "right" }} />
        </div>
        <div
          style={{
            flex: 1,
            background: "white",
            border: `1px solid ${C.border}`,
            borderRadius: 13,
            padding: 15,
            fontSize: 15,
          }}
        >
          <ShieldCheck size={20} color={C.green} />
          <div style={{ marginTop: 7, fontWeight: 800 }}>
            Location checked before saving
          </div>
        </div>
      </div>
      <div
        style={{
          border: `1px solid ${C.border}`,
          borderRadius: 16,
          background: "white",
          marginTop: 18,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ fontWeight: 800, fontSize: 18 }}>
            Camera selection <ChevronDown size={15} />
          </div>
          <UiButton gold>
            <Play size={18} />
            {stage === "ready" ? "Start" : "Stop"}
          </UiButton>
        </div>
        <div
          style={{
            height: 217,
            background: "#0B0F19",
            display: "grid",
            placeItems: "center",
            position: "relative",
          }}
        >
          {stage === "ready" ? (
            <div style={{ color: "#CBD5E1", fontSize: 19 }}>Scanner ready</div>
          ) : (
            <>
              <div
                style={{ background: "white", padding: 10, borderRadius: 9 }}
              >
                <QRCode
                  value="IARS-VIDEO-DEMO-NOT-A-CREDENTIAL"
                  size={145}
                  fgColor={C.navy}
                />
              </div>
              <div
                style={{
                  position: "absolute",
                  width: 190,
                  height: 190,
                  border: "3px solid #FFD700",
                  borderRadius: 14,
                }}
              />
            </>
          )}
        </div>
        <div
          style={{
            padding: "12px 17px",
            fontSize: 15,
            color: C.muted,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>
            {stage === "ready"
              ? "Scanner ready"
              : "Scanning for student QR codes"}
          </span>
          <span>One student at a time</span>
        </div>
      </div>
      {modal && (
        <>
          <div
            style={{ position: "absolute", inset: 0, background: "#001B3D68" }}
          />
          <div
            style={{
              position: "absolute",
              left: 190,
              top: 28,
              width: 470,
              borderRadius: 22,
              background: "white",
              overflow: "hidden",
              boxShadow: "0 20px 70px #001B3D50",
            }}
          >
            <div
              style={{
                padding: "23px 25px 15px",
                borderBottom: `1px solid ${C.border}`,
              }}
            >
              <div
                style={{ fontFamily: display, fontSize: 29, fontWeight: 600 }}
              >
                {stage === "recorded"
                  ? "Attendance recorded"
                  : "Verify student identity"}
              </div>
              <div
                style={{
                  fontSize: 15,
                  color: C.muted,
                  marginTop: 6,
                  lineHeight: 1.4,
                }}
              >
                {stage === "recorded"
                  ? "The attendance record was saved successfully."
                  : "Confirm that this profile matches the student presenting the QR code."}
              </div>
            </div>
            <div style={{ padding: 22, textAlign: "center" }}>
              <div
                style={{
                  margin: "0 auto",
                  width: 68,
                  height: 68,
                  borderRadius: 20,
                  background: "#E6F4FC",
                  display: "grid",
                  placeItems: "center",
                  color: C.blue,
                }}
              >
                {stage === "recorded" ? (
                  <CheckCircle2 size={43} color={C.green} />
                ) : (
                  <UserRound size={43} />
                )}
              </div>
              <div style={{ fontSize: 25, fontWeight: 900, marginTop: 13 }}>
                Alex Rivera
              </div>
              <div style={{ fontSize: 15, color: C.muted, marginTop: 4 }}>
                2026-00001A · Year 1 · Section A
              </div>
              {stage === "recorded" ? (
                <div
                  style={{
                    background: "#ECFDF5",
                    border: "1px solid #BBF7D0",
                    borderRadius: 14,
                    padding: 17,
                    marginTop: 17,
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      letterSpacing: 1.4,
                      fontWeight: 900,
                      color: C.muted,
                    }}
                  >
                    STATUS RECORDED
                  </div>
                  <div
                    style={{
                      fontSize: 36,
                      fontFamily: display,
                      color: C.green,
                      fontWeight: 600,
                      marginTop: 4,
                    }}
                  >
                    Present
                  </div>
                  <div style={{ fontSize: 14, color: C.muted, marginTop: 6 }}>
                    <Clock size={14} /> 8:02 AM · Sample event
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    background: "#EFF6FF",
                    border: "1px solid #BFDBFE",
                    borderRadius: 14,
                    padding: 17,
                    marginTop: 17,
                    textAlign: "left",
                  }}
                >
                  <div style={{ fontSize: 19, fontWeight: 900 }}>
                    Identity check required
                  </div>
                  <div style={{ fontSize: 15, lineHeight: 1.5, marginTop: 7 }}>
                    Choose Record only when the student ID and identity match.
                  </div>
                </div>
              )}
            </div>
            <div
              style={{
                padding: "12px 22px 20px",
                display: "flex",
                justifyContent: "flex-end",
                gap: 12,
              }}
            >
              {stage === "recorded" ? (
                <UiButton gold>
                  <ScanLine size={18} />
                  Scan next student
                </UiButton>
              ) : (
                <>
                  <UiButton style={{ background: "#F1F5F9", color: C.navy }}>
                    Waive
                  </UiButton>
                  <UiButton gold>
                    <CheckCircle2 size={18} />
                    Record
                  </UiButton>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
};
export const MiniRecord: React.FC<{
  kind: "pass" | "record" | "hours" | "excuse";
}> = ({ kind }) => {
  const configs = {
    pass: {
      icon: QrCode,
      title: "Student QR pass",
      value: "Ready for check-in",
      sub: "Open your current pass",
    },
    record: {
      icon: CheckCircle2,
      title: "Attendance recorded",
      value: "Present",
      sub: "Identity checked by an officer",
    },
    hours: {
      icon: Clock,
      title: "Service hours",
      value: "Review your balance",
      sub: "Follow recorded completion",
    },
    excuse: {
      icon: FileText,
      title: "Excuse requests",
      value: "Follow your request",
      sub: "School review required",
    },
  };
  const v = configs[kind];
  const Icon = v.icon;
  return (
    <div
      style={{
        padding: 28,
        background: "white",
        fontFamily: body,
        color: C.navy,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 13,
          alignItems: "center",
          fontSize: 20,
          fontWeight: 800,
        }}
      >
        <Icon size={26} color={kind === "record" ? C.green : C.blue} />
        {v.title}
      </div>
      <div
        style={{
          fontFamily: display,
          fontSize: 32,
          fontWeight: 600,
          marginTop: 24,
          color: kind === "record" ? C.green : C.navy,
        }}
      >
        {v.value}
      </div>
      <div style={{ fontSize: 17, color: C.muted, marginTop: 8 }}>{v.sub}</div>
    </div>
  );
};
export const Audience = () => (
  <div
    style={{
      display: "flex",
      gap: 23,
      alignItems: "center",
      fontSize: 21,
      fontWeight: 700,
      color: "#BBD5E9",
    }}
  >
    <Users size={23} />
    Students<span>·</span>Attendance officers<span>·</span>Student affairs
    <span>·</span>Administrators
  </div>
);
export const LocationLine = () => (
  <span
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      color: C.green,
      fontSize: 20,
      fontWeight: 800,
    }}
  >
    <MapPin size={22} />
    Event location check, when required
  </span>
);
