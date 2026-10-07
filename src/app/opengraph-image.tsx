import { ImageResponse } from "next/og";

export const alt = "EstetiQI — Seu negócio de estética organizado em um só lugar.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 90px",
          background: "#fbfaf8",
          color: "#30463c",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <svg width="120" height="120" viewBox="0 0 512 512">
            <rect width="512" height="512" rx="112" fill="#30463c" />
            <path
              d="M256 82c-22 72-67 111-129 119 33 22 65 32 98 31-36 38-76 54-122 56 49 35 101 44 157 27-6 42-21 78-47 110 67-19 117-58 149-117 28-51 36-110 20-178-28 34-63 58-105 70 3-43-3-83-21-118Z"
              fill="#f7faf8"
            />
            <circle cx="365" cy="126" r="22" fill="#a9c6b4" />
          </svg>
          <div style={{ fontSize: 84, fontWeight: 700, marginLeft: 32 }}>
            EstetiQI
          </div>
        </div>
        <div
          style={{
            fontSize: 58,
            lineHeight: 1.2,
            marginTop: 56,
            maxWidth: 940,
            color: "#527765",
          }}
        >
          Seu negócio de estética organizado em um só lugar.
        </div>
        <div style={{ fontSize: 30, marginTop: 36, color: "#78867f" }}>
          Clientes · Agenda · Financeiro · Oportunidades de retorno
        </div>
      </div>
    ),
    size
  );
}
