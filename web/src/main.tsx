import "@rainbow-me/rainbowkit/styles.css";
import "./index.css";
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { ThemeProvider, useTheme } from "next-themes";
import { BrowserRouter } from "react-router-dom";
import { WagmiProvider } from "wagmi";
import { Toaster } from "@/components/ui/sonner";
import { wagmiConfig } from "@/lib/wagmi";
import { zamaConfig } from "@/lib/zama";
import App from "./App";

const queryClient = new QueryClient();

const RK = { accentColor: "#b1522c", accentColorForeground: "#fbf6ee", borderRadius: "small" } as const;

function WalletTheme({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  return (
    <RainbowKitProvider locale="en-US" theme={resolvedTheme === "dark" ? darkTheme(RK) : lightTheme(RK)}>
      {children}
    </RainbowKitProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <WalletTheme>
            <ZamaProvider config={zamaConfig}>
              <BrowserRouter>
                <App />
              </BrowserRouter>
              <Toaster richColors position="bottom-right" />
            </ZamaProvider>
          </WalletTheme>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  </StrictMode>,
);
