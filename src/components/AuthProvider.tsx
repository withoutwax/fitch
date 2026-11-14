"use client";

import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { createContext, useContext, useEffect, useState } from "react";
import { firebase } from "@/lib/firebase";
import { ensureProfile, importGuestProgress } from "@/lib/progress";
import { parseConsent, type Consent } from "@/lib/consent";
import { parseRole, type Role } from "@/lib/roles";

interface AuthState {
  user: User | null;
  loading: boolean;
  /** The signed-in user's role, null for guests and until it has loaded. */
  role: Role | null;
  /** Consent saved on the profile; undefined until it has loaded, null if never given. */
  consent: Consent | null | undefined;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({ user: null, loading: true, role: null, consent: undefined, signOut: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { auth } = firebase();
    return onAuthStateChanged(auth, async (u) => {
      if (u) {
        ensureProfile(u).catch((e) => console.error("Could not save profile", e));
        // Finish moving any guest progress into the account before pages load progress.
        await importGuestProgress(u.uid).catch((e) => console.error("Could not import progress saved in this browser", e));
      }
      setUser(u);
      setLoading(false);
    });
  }, []);

  // Follow the profile live, so a role change applies without signing out.
  const [roleState, setRoleState] = useState<{ uid: string; role: Role; consent: Consent | null } | null>(null);
  const uid = user?.uid ?? null;
  useEffect(() => {
    if (!uid) return;
    return onSnapshot(
      doc(firebase().db, "users", uid),
      (snap) => setRoleState({ uid, role: parseRole(snap.data()?.role), consent: parseConsent(snap.data()?.consent) }),
      (e) => console.error("Could not load your role", e),
    );
  }, [uid]);
  const mine = uid && roleState?.uid === uid ? roleState : null;
  const role = mine?.role ?? null;
  const consent = mine ? mine.consent : undefined;

  const signOut = () => fbSignOut(firebase().auth);

  return <AuthContext.Provider value={{ user, loading, role, consent, signOut }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
