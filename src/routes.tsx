import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { OAuthCallbackPage } from './auth/oauthCallback';
import { RequireAuth } from './auth/RequireAuth';
import { PatientDashboardPage } from './pages/PatientDashboardPage';
import { PatientPickerPage } from './pages/PatientPickerPage';

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const callbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/oauth-callback',
  component: OAuthCallbackPage,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => (
    <RequireAuth>
      <PatientPickerPage />
    </RequireAuth>
  ),
});

const patientRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/patient/$id',
  component: () => (
    <RequireAuth>
      <PatientDashboardPage />
    </RequireAuth>
  ),
});

const routeTree = rootRoute.addChildren([indexRoute, callbackRoute, patientRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
