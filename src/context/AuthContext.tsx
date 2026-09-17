import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../services/firebase';
import { AdminUser, Role } from '../types';

interface AuthContextType {
  currentUser: User | null;
  adminProfile: AdminUser | null;
  role: Role | null;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  registerAdmin: (email: string, pass: string, name: string, role: Role) => Promise<void>;
  logout: () => Promise<void>;
  canAccess: (requiredRoles: Role[]) => boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function loadAuthorizedAdmin(user: User): Promise<AdminUser | null> {
  const adminRef = doc(db, 'admins', user.uid);
  const snap = await getDoc(adminRef);

  if (!snap.exists()) {
    return null;
  }

  const profile = snap.data() as AdminUser;

  if (profile.uid !== user.uid || profile.isActive !== true) {
    return null;
  }

  return profile;
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminUser | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    localStorage.removeItem('huma_quick_role');
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      setAdminProfile(null);
      setRole(null);

      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        const profile = await loadAuthorizedAdmin(user);

        if (profile) {
          setAdminProfile(profile);
          setRole(profile.role);
        }
      } catch (err) {
        console.warn('[HUMA Auth] Failed to load admin profile:', err);
      } finally {
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const login = async (email: string, pass: string) => {
    const trimmedEmail = email.trim();

    try {
      const credential = await signInWithEmailAndPassword(auth, trimmedEmail, pass);
      const profile = await loadAuthorizedAdmin(credential.user);

      if (!profile) {
        await signOut(auth);
        throw new Error(
          'Akun berhasil terautentikasi, tetapi belum terdaftar sebagai staff/admin HUMA.'
        );
      }

      setCurrentUser(credential.user);
      setAdminProfile(profile);
      setRole(profile.role);
    } catch (err: any) {
      if (err?.message?.includes('belum terdaftar sebagai staff/admin HUMA')) {
        throw err;
      }

      const code = err?.code || '';

      if (
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-login-credentials'
      ) {
        throw new Error('Kata sandi yang Anda masukkan salah. Periksa kembali sandi staff Anda.');
      }

      if (code === 'auth/invalid-email') {
        throw new Error('Format alamat email tidak valid.');
      }

      if (code === 'auth/too-many-requests') {
        throw new Error('Terlalu banyak percobaan gagal. Silakan tunggu beberapa saat lagi.');
      }

      if (code === 'auth/user-not-found') {
        throw new Error('Akun staff dengan email tersebut tidak ditemukan.');
      }

      if (code === 'auth/user-disabled') {
        throw new Error('Akun staff tersebut sedang dinonaktifkan.');
      }

      console.warn('[HUMA Auth] Login failed:', code, err?.message || err);
      throw new Error('Login gagal. Periksa kembali email dan kata sandi staff.');
    }
  };

  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });

      const credential = await signInWithPopup(auth, provider);
      const profile = await loadAuthorizedAdmin(credential.user);

      if (!profile) {
        await signOut(auth);
        throw new Error(
          'Akun Google berhasil terautentikasi, tetapi belum terdaftar sebagai staff/admin HUMA.'
        );
      }

      setCurrentUser(credential.user);
      setAdminProfile(profile);
      setRole(profile.role);
    } catch (err: any) {
      console.warn('[HUMA Auth] Google sign in failed:', err?.message || err);
      throw err;
    }
  };

  const registerAdmin = async (
    email: string,
    pass: string,
    name: string,
    assignedRole: Role
  ) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), pass);

      const newAdmin: AdminUser = {
        uid: cred.user.uid,
        email: email.trim(),
        name: name.trim(),
        role: assignedRole,
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'admins', cred.user.uid), newAdmin, { merge: true });

      setCurrentUser(cred.user);
      setAdminProfile(newAdmin);
      setRole(assignedRole);
    } catch (err: any) {
      console.warn('[HUMA Auth] Register admin failed:', err?.message || err);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } finally {
      localStorage.removeItem('huma_quick_role');
      setCurrentUser(null);
      setAdminProfile(null);
      setRole(null);
    }
  };

  const canAccess = (requiredRoles: Role[]): boolean => {
    if (!adminProfile || !role || adminProfile.isActive !== true) {
      return false;
    }

    if (role === 'SUPER_ADMIN') {
      return true;
    }

    return requiredRoles.includes(role);
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        adminProfile,
        role,
        isLoading,
        login,
        loginWithGoogle,
        registerAdmin,
        logout,
        canAccess,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
};
