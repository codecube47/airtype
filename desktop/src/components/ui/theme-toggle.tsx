import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/lib/theme-provider'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const toggleTheme = () => {
    if (theme === 'dark') {
      setTheme('light')
    } else {
      setTheme('dark')
    }
  }

  return (
    <Button
      variant="ghost"
      onClick={toggleTheme}
      className="w-full justify-start gap-3 h-10 px-3 font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 rounded-lg"
    >
      {theme === 'dark' ? (
        <Sun className="w-4 h-4" />
      ) : (
        <Moon className="w-4 h-4" />
      )}
      <span className="text-sm">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
    </Button>
  )
}
