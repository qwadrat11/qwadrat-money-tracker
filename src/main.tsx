import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SplashScreen } from "@capacitor/splash-screen";
import "./index.css";
import { AuthProvider } from "./auth/AuthProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./i18n";
import { LocaleProvider } from "./i18n/LocaleProvider";
import { LocalizedApp } from "./i18n/LocalizedApp";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LocaleProvider>
          <ErrorBoundary>
            <LocalizedApp />
          </ErrorBoundary>
        </LocaleProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
);

void SplashScreen.hide({ fadeOutDuration: 220 }).catch(() => undefined);
