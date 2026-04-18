import React from 'react'
import { Home, Settings, HelpCircle, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import logoImg from '/logo.png'

interface SidebarProps {
  activeItem?: string
  onLogout?: () => void
  onNavigate?: (page: string) => void
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard', icon: Home },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ activeItem = 'dashboard', onLogout, onNavigate }: SidebarProps) {
  const isHelpActive = activeItem === 'help'
  return (
    <aside className="flex flex-col w-64 text-card-foreground">
      {/* macOS traffic light spacing */}
      <div className="h-8 flex-shrink-0" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />

      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-3">
        <img src={logoImg} alt="Airtype" className="h-6 w-auto" />
        <span className="text-lg font-bold text-foreground">AirType</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = activeItem === item.id
          return (
            <Button
              key={item.id}
              variant="ghost"
              onClick={() => onNavigate?.(item.id)}
              className={cn(
                "w-full justify-start gap-3 h-10 px-3 font-medium transition-all rounded-lg",
                isActive
                  ? "bg-accent text-accent-foreground hover:bg-accent shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
            >
              <Icon className={cn("w-4 h-4", isActive && "text-brand-ocean")} />
              <span className="flex-1 text-left text-sm">{item.label}</span>
            </Button>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-3 py-2 space-y-1">
        <ThemeToggle />
        <Button
          variant="ghost"
          onClick={() => onNavigate?.('help')}
          className={cn(
            "w-full justify-start gap-3 h-10 px-3 font-medium transition-all rounded-lg",
            isHelpActive
              ? "bg-accent text-accent-foreground hover:bg-accent shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
          )}
        >
          <HelpCircle className={cn("w-4 h-4", isHelpActive && "text-brand-ocean")} />
          <span className="text-sm">Help & Support</span>
        </Button>
        <Button
          variant="ghost"
          onClick={onLogout}
          className="w-full justify-start gap-3 h-10 px-3 font-medium text-brand-ocean hover:text-brand-dark hover:bg-brand-ocean/10 rounded-lg"
        >
          <LogOut className="w-4 h-4" />
          <span className="text-sm">Logout</span>
        </Button>
      </div>

    </aside>
  )
}
