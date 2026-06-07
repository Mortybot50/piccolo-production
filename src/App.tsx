import { Suspense, lazy } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { RouteGuard } from "@/components/RouteGuard";
import { Toaster } from "@/components/ui/sonner";

const LoginPage = lazy(() => import("@/pages/Login"));
const ChangePinPage = lazy(() => import("@/pages/ChangePin"));
const PrimitivesPage = lazy(() => import("@/pages/Primitives"));
const SettingsPage = lazy(() => import("@/pages/Settings"));
const SalesInputPage = lazy(() => import("@/pages/SalesInput"));
const TodayPage = lazy(() => import("@/pages/Today"));
const StoreOrderPage = lazy(() => import("@/pages/StoreOrder"));
const CateringPage = lazy(() => import("@/pages/Catering"));
const SupplierOrdersPage = lazy(() => import("@/pages/SupplierOrders"));
const InvoicePage = lazy(() => import("@/pages/Invoice"));
const InvoiceHistoryPage = lazy(() => import("@/pages/InvoiceHistory"));
const DashboardPage = lazy(() => import("@/pages/Dashboard"));
const AuditLogPage = lazy(() => import("@/pages/AuditLog"));
const RecipesPage = lazy(() => import("@/pages/Recipes"));
const CostingPage = lazy(() => import("@/pages/Costing"));
const SalesAveragesPage = lazy(() => import("@/pages/SalesAverages"));
const PrepLogPage = lazy(() => import("@/pages/PrepLog"));
const SentryTestPage = lazy(() => import("@/pages/SentryTest"));

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
                    <SupplierOrdersPage />
                  </RouteGuard>
                }
              />
              <Route
                path="/dashboard"
                element={
                  <RouteGuard>
                    <DashboardPage />
                  </RouteGuard>
                }
              />
              <Route
                path="/invoice"
                element={
                  <RouteGuard>
                    <InvoicePage />
                  </RouteGuard>
                }
              />
              <Route
                path="/invoice/:weekNum"
                element={
                  <RouteGuard>
                    <InvoicePage />
                  </RouteGuard>
                }
              />
              <Route
                path="/invoice-history"
                element={
                  <RouteGuard>
                    <InvoiceHistoryPage />
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
                    <AuditLogPage />
                  </RouteGuard>
                }
              />
              <Route
                path="/recipes"
                element={
                  <RouteGuard>
                    <RecipesPage />
                  </RouteGuard>
                }
              />
              <Route
                path="/costing"
                element={
                  <RouteGuard>
                    <CostingPage />
                  </RouteGuard>
                }
              />
              <Route
                path="/sales-averages"
                element={
                  <RouteGuard>
                    <SalesAveragesPage />
                  </RouteGuard>
                }
              />
              <Route
                path="/prep-log"
                element={
                  <RouteGuard>
                    <PrepLogPage />
                  </RouteGuard>
                }
              />
              {/* Internal/dev-only routes: not registered in production builds. */}
              {import.meta.env.DEV ? (
                <>
                  <Route
                    path="/__primitives"
                    element={
                      <RouteGuard>
                        <PrimitivesPage />
                      </RouteGuard>
                    }
                  />
                  <Route
                    path="/__sentry-test"
                    element={
                      <RouteGuard>
                        <SentryTestPage />
                      </RouteGuard>
                    }
                  />
                </>
              ) : null}
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
