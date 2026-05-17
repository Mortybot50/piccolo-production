import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { RouteGuard } from "@/components/RouteGuard";
import { Toaster } from "@/components/ui/sonner";

const LoginPage = lazy(() => import("@/pages/Login"));
const ChangePinPage = lazy(() => import("@/pages/ChangePin"));
const PrimitivesPage = lazy(() => import("@/pages/Primitives"));
const Placeholder = lazy(() => import("@/pages/Placeholder"));
const SettingsPage = lazy(() => import("@/pages/Settings"));
const SalesInputPage = lazy(() => import("@/pages/SalesInput"));
const TodayPage = lazy(() => import("@/pages/Today"));
const StoreOrderPage = lazy(() => import("@/pages/StoreOrder"));
const CateringPage = lazy(() => import("@/pages/Catering"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center text-stone-500">
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<Loading />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/change-pin" element={<ChangePinPage />} />
              <Route
                path="/today"
                element={
                  <RouteGuard>
                    <TodayPage />
                  </RouteGuard>
                }
              />
              <Route
                path="/store-order/:store"
                element={
                  <RouteGuard>
                    <StoreOrderPage />
                  </RouteGuard>
                }
              />
              <Route
                path="/catering"
                element={
                  <RouteGuard>
                    <CateringPage />
                  </RouteGuard>
                }
              />
              <Route
                path="/supplier-orders"
                element={
                  <RouteGuard>
                    <Placeholder title="Supplier orders" phase="Phase G" />
                  </RouteGuard>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <RouteGuard>
                    <Placeholder title="Dashboard" phase="Phase I" />
                  </RouteGuard>
                }
              />
              <Route
                path="/invoice"
                element={
                  <RouteGuard>
                    <Placeholder title="Invoice" phase="Phase H" />
                  </RouteGuard>
                }
              />
              <Route
                path="/invoice/:weekNum"
                element={
                  <RouteGuard>
                    <Placeholder title="Invoice (week)" phase="Phase H" />
                  </RouteGuard>
                }
              />
              <Route
                path="/invoice-history"
                element={
                  <RouteGuard>
                    <Placeholder title="Invoice history" phase="Phase H" />
                  </RouteGuard>
                }
              />
              <Route
                path="/sales-input"
                element={
                  <RouteGuard>
                    <SalesInputPage />
                  </RouteGuard>
                }
              />
              <Route
                path="/settings"
                element={
                  <RouteGuard>
                    <SettingsPage />
                  </RouteGuard>
                }
              />
              <Route
                path="/audit-log"
                element={
                  <RouteGuard>
                    <Placeholder title="Audit log" phase="Phase B" />
                  </RouteGuard>
                }
              />
              <Route
                path="/recipes"
                element={
                  <RouteGuard>
                    <Placeholder title="Recipes" phase="Phase B" />
                  </RouteGuard>
                }
              />
              <Route
                path="/__primitives"
                element={
                  <RouteGuard>
                    <PrimitivesPage />
                  </RouteGuard>
                }
              />
              <Route path="/" element={<Navigate to="/today" replace />} />
              <Route path="*" element={<Navigate to="/today" replace />} />
            </Routes>
          </Suspense>
          <Toaster />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
