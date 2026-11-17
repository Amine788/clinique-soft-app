import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Store Zustand pour l'authentification et la gestion des rôles
export const useAuthStore = create(
    persist(
        (set) => ({
            token: null,
            user: null,   // { id, email, name, role, avatar, doctorId? }
            isAuthenticated: false,

            // Action: Login
            login: (token, user) => set({
                token,
                user,
                isAuthenticated: true,
            }),

            // Action: Logout
            logout: () => set({
                token: null,
                user: null,
                isAuthenticated: false,
            }),

            // Action: Mettre à jour le profil
            updateUser: (userData) => set((state) => ({
                user: { ...state.user, ...userData },
            })),
        }),
        {
            name: 'clinicsoft-auth',  // Clé localStorage
        }
    )
);
