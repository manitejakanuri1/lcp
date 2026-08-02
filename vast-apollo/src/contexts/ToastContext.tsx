import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
    id: string
    type: ToastType
    message: string
}

interface ToastContextType {
    addToast: (type: ToastType, message: string) => void
    removeToast: (id: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function useToast() {
    const context = useContext(ToastContext)
    if (!context) throw new Error('useToast must be used within ToastProvider')
    return context
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])

    const addToast = useCallback((type: ToastType, message: string) => {
        const id = crypto.randomUUID()
        setToasts(prev => [...prev, { id, type, message }])
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id))
        }, 4000)
    }, [])

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    const icons: Record<ToastType, typeof CheckCircle> = {
        success: CheckCircle,
        error: AlertCircle,
        warning: AlertTriangle,
        info: Info,
    }

    const colors: Record<ToastType, string> = {
        success: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200',
        error: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200',
        warning: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200',
        info: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200',
    }

    return (
        <ToastContext.Provider value={{ addToast, removeToast }}>
            {children}

            {/* Toast container */}
            {toasts.length > 0 && (
                <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-80">
                    {toasts.map(toast => {
                        const Icon = icons[toast.type]
                        return (
                            <div
                                key={toast.id}
                                className={`flex items-start gap-3 p-3 rounded-lg border shadow-lg animate-slide-in ${colors[toast.type]}`}
                            >
                                <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                <p className="text-sm flex-1 leading-snug">{toast.message}</p>
                                <button
                                    onClick={() => removeToast(toast.id)}
                                    className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )
                    })}
                </div>
            )}
        </ToastContext.Provider>
    )
}
