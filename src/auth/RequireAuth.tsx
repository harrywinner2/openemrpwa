import { useEffect, useState } from 'react';
import { isAuthenticated, subscribe } from './tokenStore';
import { SignInScreen } from './SignInScreen';
import { ServerPickerScreen } from '../pages/ServerPickerScreen';
import { loadServerConfig } from '../config/serverConfig';

export function RequireAuth({ children }: { children: React.ReactNode }): JSX.Element {
  const [hasServer, setHasServer] = useState<boolean>(() => loadServerConfig() !== null);
  const [authed, setAuthed] = useState<boolean>(() => isAuthenticated());

  useEffect(() => subscribe((t) => setAuthed(t !== null && t.expires_at > Date.now())), []);

  if (!hasServer) {
    return <ServerPickerScreen onConfigured={() => setHasServer(true)} />;
  }
  if (!authed) {
    return <SignInScreen onSignedIn={() => setAuthed(true)} />;
  }
  return <>{children}</>;
}
