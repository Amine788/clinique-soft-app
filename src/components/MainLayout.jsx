import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function MainLayout() {
    const { pathname } = useLocation();
    // Page sur laquelle le tiroir mobile a été ouvert : il se referme dès qu'on change de page
    const [openedOn, setOpenedOn] = useState(null);
    const navOpen = openedOn === pathname;
    const setNavOpen = (open) => setOpenedOn(open ? pathname : null);

    // Échap ferme le tiroir
    useEffect(() => {
        if (!navOpen) return;
        const onKey = (e) => { if (e.key === 'Escape') setOpenedOn(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [navOpen]);

    return (
        <div className="flex w-full min-h-screen bg-bg relative">
            <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
            {navOpen && (
                <div
                    aria-hidden="true"
                    onClick={() => setNavOpen(false)}
                    className="fixed inset-0 z-[90] bg-slate-900/40 backdrop-blur-[2px] lg:hidden"
                />
            )}
            <div className="flex-1 flex flex-col min-w-0 lg:ml-[var(--sidebar-width)]">
                <Header navOpen={navOpen} onMenuClick={() => setNavOpen(!navOpen)} />
                <main className="flex-1 p-4 sm:p-6 xl:p-8 overflow-y-auto">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
