import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NicheProvider } from "@/components/niche-provider";
import { QueryProvider } from "@/components/query-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { UserProvider } from "@/features/auth/context";
import { getNicheInitScript } from "@/lib/niches";
import "@/styles/globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "ProMei · Gestão de Estoque e Comercial",
    template: "%s · ProMei",
  },
  description: "Painel web ProMei — gestão comercial e de estoque para MEIs e pequenas empresas",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.png", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={inter.variable} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: getNicheInitScript() }} />
        <NicheProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <QueryProvider>
              <UserProvider>{children}</UserProvider>
            </QueryProvider>
          </ThemeProvider>
        </NicheProvider>
      </body>
    </html>
  );
}
