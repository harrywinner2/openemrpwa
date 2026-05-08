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

// import.meta.env.BASE_URL reflects Vite's `base` config — '/' for local dev,
// '/<repo>/' for GitHub Pages builds. The router needs to know about this
// prefix or it treats `/openEmrPwa/` as an unknown route and shows Not Found.
export const router = createRouter({
  routeTree,
  basepath: import.meta.env.BASE_URL,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
