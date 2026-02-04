import { createContext, useContext } from 'react';

export interface User {
  id: string;
  username: string;
  role: 'distributor' | 'manager' | 'player';
  points: number;
}

interface AuthContextType {
  user: User | null;
  setUser: (user: User | null) => void;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  setUser: () => {}
});

export const useAuth = () => useContext(AuthContext);
