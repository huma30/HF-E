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
import { getApp, getApps, initializeApp } from 'firebase/app';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, firebaseConfig } from '../services/firebase';
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
  switchQuickRole: (role: Role) => void;
  canAccess: (requiredRoles: Role[]) => boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [adminProfile, setAdminProfile] = useState<AdminUser | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Clean up any old demo role persistence immediately
  useEffect(() => {
    localStorage.removeItem('huma_quick_role');
  }, []);

  // Load admin profile from Firestore when auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const adminDocRef = doc(db, 'admins', user.uid);
          const snap = await getDoc(adminDocRef);

          if (snap.exists()) {
            const data = snap.data() as AdminUser;
            setAdminProfile(data);
            setRole(data.role);
          } else {
            // Only the designated owner may bootstrap their own first admin profile.
            const isOwner = user.email?.toLowerCase() === 'huma301123@gmail.com';
            if (isOwner) {
              const newAdmin: AdminUser = {
                uid: user.uid,
                email: user.email || '',
                name: user.displayName || 'Owner HUMA',
                role: 'SUPER_ADMIN',
                isActive: true,
                createdAt: new Date().toISOString(),
              };
              await setDoc(adminDocRef, newAdmin, { merge: true });
              setAdminProfile(newAdmin);
              setRole('SUPER_ADMIN');
            } else {
              setAdminProfile(null);
              setRole(null);
            }
          }
        } catch (err) {
          console.warn('[HUMA] Admin profile fetch error:', err);
          // Fallback profile
          const isOwner = user.email?.toLowerCase() === 'huma301123@gmail.com';
          const fallbackRole: Role = isOwner ? 'SUPER_ADMIN' : 'CASHIER';
          const fallbackProfile: AdminUser = {
            uid: user.uid,
            email: user.email || '',
            name: user.displayName || (isOwner ? 'Owner HUMA' : 'Staff Kasir'),
            role: fallbackRole,
            isActive: true,
            createdAt: new Date().toISOString(),
          };
          setAdminProfile(fallbackProfile);
          setRole(fallbackRole);
        }
      } else {
        setAdminProfile(null);
        setRole(null);
        localStorage.removeItem('huma_quick_role');
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      console.warn('[HUMA] Google sign in error:', err?.message || err);
      throw err;
    }
  };

  const login = async (email: string, pass: string) => {
    const trimmedEmail = email.trim();
    try {
      await signInWithEmailAndPassword(auth, trimmedEmail, pass);
    } catch (err: any) {
      const code = err?.code || '';
      console.warn('[HUMA] Standard auth failed with code:', code, err?.message);

      // Explicit authentication failure: invalid password or invalid email format
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

      // Offline / Demo emergency fallback: strictly verify authorized master demo credentials
      const isOwnerCreds =
        trimmedEmail.toLowerCase() === 'huma301123@gmail.com' && pass === 'huma123456';
      const isCashierCreds =
        trimmedEmail.toLowerCase() === 'kasir@huma.local' && pass === 'kasir123';

      if (isOwnerCreds) {
        console.info('[HUMA Auth] Activating verified offline/demo Owner role session');
        switchQuickRole('SUPER_ADMIN');
        return;
      }

      if (isCashierCreds) {
        console.info('[HUMA Auth] Activating verified offline/demo Cashier role session');
        switchQuickRole('CASHIER');
        return;
      }

      // If user is not found or other configuration errors occurred
      if (code === 'auth/user-not-found') {
        throw new Error('Akun staff dengan email tersebut tidak ditemukan.');
      }

      throw new Error(err?.message || 'Login gagal. Periksa kembali email dan kata sandi staff.');
    }
  };

  const registerAdmin = async (email: string, pass: string, name: string, assignedRole: Role) => {
    const registrationAppName = 'huma-admin-registration';
    try {
      const registrationApp = getApps().some((item) => item.name === registrationAppName)
        ? getApp(registrationAppName)
        : initializeApp(firebaseConfig, registrationAppName);
      const registrationAuth = (await import('firebase/auth')).getAuth(registrationApp);

      const cred = await createUserWithEmailAndPassword(registrationAuth, email.trim(), pass);
      const newAdmin: AdminUser = {
        uid: cred.user.uid,
        email: email.trim(),
        name: name.trim(),
        role: assignedRole,
        isActive: true,
        createdAt: new Date().toISOString(),
      };

      // The primary auth session remains the currently signed-in owner/admin.
      await setDoc(doc(db, 'admins', cred.user.uid), newAdmin, { merge: true });
      await signOut(registrationAuth);
    } catch (err) {
      console.error('[HUMA Auth] Admin registration failed:', err);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.warn('Sign out error:', e);
    }
    localStorage.removeItem('huma_quick_role');
    setAdminProfile(null);
    setRole(null);
  };

  /**
   * Fast quick-role test switcher for management/cashier operational testing
   */
  const switchQuickRole = (newRole: Role) => {
    setRole(newRole);
    localStorage.setItem('huma_quick_role', newRole);
    const profile: AdminUser = {
      uid: 'quick-' + newRole.toLowerCase(),
      email: `${newRole.toLowerCase()}@huma.local`,
      name: `${newRole.replace('_', ' ')} HUMA`,
      role: newRole,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    setAdminProfile(profile);
  };

  const canAccess = (requiredRoles: Role[]): boolean => {
    if (!role) return false;
    if (role === 'SUPER_ADMIN') return true;
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
        switchQuickRole,
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
