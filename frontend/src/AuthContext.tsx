import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

export type Role = "teacher" | "student";
export interface User {
  id: string;
  name: string;
  role: Role;
  email?: string;
  usn?: string;
  roll_number?: string;
  semester?: string;
  division?: string;
  subject?: string;
  face_registered?: boolean;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  setAuth: (token: string, user: User) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({} as AuthCtx);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    const token = await AsyncStorage.getItem("auth_token");
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch (e) {
      await AsyncStorage.removeItem("auth_token");
      setUser(null);
    }
  };

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, []);

  const setAuth = async (token: string, u: User) => {
    await AsyncStorage.setItem("auth_token", token);
    setUser(u);
  };

  const logout = async () => {
    await AsyncStorage.removeItem("auth_token");
    setUser(null);
  };

  return (
    <Ctx.Provider value={{ user, loading, setAuth, logout, refresh }}>
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);
