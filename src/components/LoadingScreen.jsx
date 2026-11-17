import React from 'react';
import { Loader2 } from 'lucide-react';

export default function LoadingScreen({ message = "Chargement en cours..." }) {
    return (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[400px] gap-6 animate-in fade-in duration-500">
            {/* Logo container with pulse effect */}
            <div className="relative flex items-center justify-center">
                <div className="absolute inset-0 bg-primary/10 rounded-full blur-xl animate-pulse"></div>
                <div className="w-20 h-20 bg-white rounded-2xl shadow-xl flex items-center justify-center p-3 relative z-10 border border-primary/10">
                    <img 
                        src="/logo-icon.png" 
                        alt="NextClinic" 
                        className="w-full h-full object-contain mix-blend-multiply"
                        onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    {/* Fallback spinner if logo doesn't load or as an overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-white/50 rounded-2xl backdrop-blur-[1px]">
                        <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    </div>
                </div>
            </div>

            {/* Text */}
            <div className="text-center space-y-2">
                <h3 className="text-lg font-bold text-gray-900 tracking-tight">NextClinic</h3>
                <p className="text-sm font-medium text-gray-500">{message}</p>
            </div>
        </div>
    );
}
