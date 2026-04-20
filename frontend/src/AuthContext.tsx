import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

export type Role = "teacher" | "student" | "admin";
export interface User {
  id: string;
  name: string;
  role: Role;
  employee_id?: string;
  usn?: string;
  roll_number?: string;
  semester?: string;
  division?: string;
  branch?: string;
  face_registered?: boolean;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  setAuth: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  token: string | null;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const t = await AsyncStorage.getItem("auth_token");
    setToken(t);
    if (!t) { setUser(null); return; }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (e) {
      await AsyncStorage.removeItem("auth_token");
      setUser(null);
      setToken(null);
    }
  };

  useEffect(() => {
    (async () => { await refresh(); setLoading(false); })();
  }, []);

  const setAuth = async (t: string, u: User) => {
    await AsyncStorage.setItem("auth_token", t);
    setToken(t);
    setUser(u);
  };

  const logout = async () => {
    await AsyncStorage.removeItem("auth_token");
    setToken(null);
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, token, loading, setAuth, logout, refresh }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);
