import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { ptBR } from "@clerk/localizations";
import { Rethink_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";

const rethinkSans = Rethink_Sans({
  variable: "--font-rethink-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://estetiqi.com.br";
const siteDescription =
  "Seu negócio de estética organizado em um só lugar: clientes, agenda, financeiro e oportunidades de retorno.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "EstetiQI — Gestão para negócios de estética",
  description: siteDescription,
  applicationName: "EstetiQI",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "EstetiQI",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-icon.png",
  },
  openGraph: {
    type: "website",
    siteName: "EstetiQI",
    locale: "pt_BR",
    title: "EstetiQI — Gestão para negócios de estética",
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: "EstetiQI — Gestão para negócios de estética",
    description: siteDescription,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fbfaf8",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      localization={ptBR}
      signInUrl="/login"
      signUpUrl="/cadastro"
      signInFallbackRedirectUrl="/app"
      signUpFallbackRedirectUrl="/app/onboarding"
      afterSignOutUrl="/login"
    >
      <html
        lang="pt-BR"
        className={`${rethinkSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">{children}</body>
      </html>
    </ClerkProvider>
  );
}
