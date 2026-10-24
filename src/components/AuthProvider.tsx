"use client";

import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";
import { createContext, useContext, useEffect, useState } from "react";
import { firebase } from "@/lib/firebase";
import { ensureProfile } from "@/lib/progress";

interface AuthState {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({ user: null, loading: true, signOut: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { auth } = firebase();
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) ensureProfile(u).catch((e) => console.error("Could not save profile", e));
    });
  }, []);

  const signOut = () => fbSignOut(firebase().auth);

  return <AuthContext.Provider value={{ user, loading, signOut }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
