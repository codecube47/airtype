import React, { useEffect, useState, useRef } from 'react'
import { authService, User } from '../services/api/auth'
import { transcribeService, Transcription, TranscriptionStats } from '../services/api/transcribe'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sidebar } from '@/components/Sidebar'
import { Mic, FileText, Clock, Search, ChevronLeft, ChevronRight, ChevronDown, WifiOff, RefreshCw, Copy, Check } from 'lucide-react'

interface DashboardProps {
  onLogout: () => void
  onNavigate?: (page: string) => void
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffSec < 60) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay === 1) return 'Yesterday'
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function Dashboard({ onLogout, onNavigate }: DashboardProps) {
  const [user, setUser] = useState<User | null>(null)
  const userRef = useRef<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [connectionError, setConnectionError] = useState(false)
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [stats, setStats] = useState<TranscriptionStats | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const itemsPerPage = 5

  useEffect(() => {
    loadUser()
    loadTranscriptions(currentPage)
    loadStats()

    // Listen for new transcriptions from the widget
    const handleNewTranscription = (result: unknown) => {
      const data = result as {
        id: string
        rawText: string
        cleanedText: string
        processingTime: number
        wordCount: number
      }

      // Create transcription object from IPC data
      const newTranscription: Transcription = {
        id: data.id,
        userId: userRef.current?.id || '',
        rawText: data.rawText,
        cleanedText: data.cleanedText,
        metadata: {
          duration: 0,
          language: 'en',
          model: 'whisper-large-v3-turbo',
          processingTime: data.processingTime,
          wordCount: data.wordCount,
        },
        createdAt: new Date().toISOString(),
      }

      // Prepend to list (most recent first)
      setTranscriptions(prev => [newTranscription, ...prev.slice(0, itemsPerPage - 1)])
      setTotalItems(prev => prev + 1)

      // Update stats locally
      setStats(prev => prev ? {
        totalTranscriptions: prev.totalTranscriptions + 1,
        totalWords: prev.totalWords + data.wordCount,
        avgProcessingTime: ((prev.avgProcessingTime * prev.totalTranscriptions) + data.processingTime) / (prev.totalTranscriptions + 1),
        plan: prev.plan,
        wordLimit: prev.wordLimit,
        wordsRemaining: prev.wordsRemaining === -1 ? -1 : Math.max(0, prev.wordsRemaining - data.wordCount),
      } : {
        totalTranscriptions: 1,
        totalWords: data.wordCount,
        avgProcessingTime: data.processingTime,
        plan: 'free',
        wordLimit: 3000,
        wordsRemaining: 3000 - data.wordCount,
      })

      // Reset to first page if not already
      setCurrentPage(1)
    }
    window.electronAPI?.onTranscriptionResult(handleNewTranscription)

    return () => {
      window.electronAPI?.removeTranscriptionResultListener()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run on mount

  const loadStats = async () => {
    try {
      const data = await transcribeService.getStats()
      setStats(data)
      setConnectionError(false)
    } catch (error) {
      console.warn('[Dashboard] Failed to load stats:', error)
    }
  }

  // Load transcriptions when page changes (user clicks pagination)
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    loadTranscriptions(page)
  }

  const loadTranscriptions = async (page: number, limit: number = itemsPerPage) => {
    try {
      const response = await transcribeService.getTranscriptions(page, limit)
      setTranscriptions(response.transcriptions || [])
      setTotalPages(response.totalPages || 1)
      setTotalItems(response.total || 0)
      setConnectionError(false)
    } catch (error) {
      const axiosError = error as { response?: { status?: number } }
      if (!axiosError.response) {
        setConnectionError(true)
      }
      console.warn('[Dashboard] Failed to load transcriptions:', error)
    }
  }

  const handleViewAll = () => {
    setShowAll(true)
    setCurrentPage(1)
    loadTranscriptions(1, 1000) // Load up to 1000 items
  }

  const handleShowLess = () => {
    setShowAll(false)
    setCurrentPage(1)
    loadTranscriptions(1, itemsPerPage)
  }

  const loadUser = async () => {
    try {
      const currentUser = await authService.getCurrentUser()
      setUser(currentUser)
      userRef.current = currentUser
      setConnectionError(false)
    } catch (error: unknown) {
      const axiosError = error as { response?: { status?: number } }
      if (axiosError.response?.status === 401 || axiosError.response?.status === 403) {
        onLogout()
        return
      }
      // No response = network/connection error
      if (!axiosError.response) {
        setConnectionError(true)
      }
      console.warn('[Dashboard] Failed to load user:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleLogout = () => {
    onLogout()
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-muted border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // Filter transcriptions based on search query
  const filteredTranscriptions = searchQuery
    ? transcriptions.filter(t =>
        (t.cleanedText || t.rawText || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : transcriptions

  const statCards = [
    {
      title: 'Total Transcriptions',
      value: (stats?.totalTranscriptions ?? 0).toLocaleString(),
      icon: FileText,
      color: 'text-brand-ocean bg-brand-cyan/30 dark:text-brand-ocean dark:bg-brand-ocean/30',
    },
    {
      title: 'Words Transcribed',
      value: (stats?.totalWords ?? 0).toLocaleString(),
      icon: Mic,
      color: 'text-brand-ocean bg-brand-cyan/30 dark:text-brand-ocean dark:bg-brand-ocean/30',
    },
    {
      title: 'Avg. Processing Time',
      value: stats?.avgProcessingTime ? `${stats.avgProcessingTime.toFixed(2)}s` : '0s',
      icon: Clock,
      color: 'text-brand-ocean bg-brand-cyan/30 dark:text-brand-ocean dark:bg-brand-ocean/30',
    },
  ]

  return (
    <div className="flex h-screen bg-muted/30 p-3 gap-3">
      {/* Sidebar */}
      <Sidebar activeItem="dashboard" onLogout={handleLogout} onNavigate={onNavigate} />

      {/* Main Content Card */}
      <div className="flex-1 flex flex-col overflow-hidden bg-background rounded-xl border border-border">
        {/* Top Navbar - draggable region */}
        <header className="flex items-center justify-between px-8 py-4 border-b border-border" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
          <div className="flex items-center gap-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search transcriptions..."
                className="w-80 pl-10 pr-4 py-2 text-sm bg-muted border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex items-center gap-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            {user && (
              <div className="flex items-center gap-3 pl-4 border-l border-border">
                <div className="text-right">
                  <p className="text-sm font-medium text-foreground">{user.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{user.plan || 'Free'} Plan</p>
                </div>
                <Avatar className="w-9 h-9">
                  <AvatarImage src={user.picture} alt={user.name} />
                  <AvatarFallback>{user.name?.charAt(0)}</AvatarFallback>
                </Avatar>
              </div>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-8">
          {/* Connection Error Banner */}
          {connectionError && (
            <div className="mb-6 flex items-center justify-between gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/5">
              <div className="flex items-center gap-3">
                <WifiOff className="w-5 h-5 text-destructive shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">Unable to connect to server</p>
                  <p className="text-xs text-muted-foreground">Some data may be outdated. Recording still works.</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { loadUser(); loadTranscriptions(currentPage); loadStats() }}
                className="shrink-0 gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </Button>
            </div>
          )}

          {/* Welcome Section */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground">
              Welcome back, {user?.name?.split(' ')[0] || 'there'}!
            </h1>
            <p className="text-muted-foreground mt-1">
              Here's what's happening with your transcriptions today.
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-6 mb-8">
            {statCards.map((stat) => {
              const Icon = stat.icon
              return (
                <Card key={stat.title} className="border border-border rounded-xl shadow-sm bg-card">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-muted-foreground">{stat.title}</p>
                        <p className="text-2xl font-bold text-foreground mt-1">{stat.value}</p>
                      </div>
                      <div className={`p-3 rounded-xl ${stat.color}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {/* Word Usage for Free Plan */}
          {stats && (!stats.plan || stats.plan === 'free') && (stats.wordLimit === undefined || stats.wordLimit > 0) && (
            (() => {
              const wordLimit = stats.wordLimit ?? 3000
              const usagePercent = Math.min(100, (stats.totalWords / wordLimit) * 100)
              const isLimit = stats.totalWords >= wordLimit
              return (
                <Card className="mb-8 border border-border rounded-xl shadow-sm bg-card">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">Word Usage</p>
                        <p className="text-xs text-muted-foreground">Free plan · {wordLimit.toLocaleString()} word limit</p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground">{stats.totalWords.toLocaleString()}</span> / {wordLimit.toLocaleString()}
                      </p>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isLimit ? 'bg-destructive' : 'bg-foreground/70'
                        }`}
                        style={{ width: `${usagePercent}%` }}
                      />
                    </div>
                    {isLimit && (
                      <p className="text-xs text-destructive mt-2">
                        Limit reached · <button className="underline hover:no-underline">Upgrade to Pro</button>
                      </p>
                    )}
                  </CardContent>
                </Card>
              )
            })()
          )}

          {/* Recent Transcriptions */}
          <Card className="border border-border rounded-xl shadow-sm bg-card">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Recent Transcriptions</CardTitle>
                  <CardDescription>Your latest voice-to-text conversions</CardDescription>
                </div>
                {showAll ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-brand-ocean hover:text-brand-dark hover:bg-brand-ocean/10 font-medium"
                    onClick={handleShowLess}
                  >
                    Show less
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-brand-ocean hover:text-brand-dark hover:bg-brand-ocean/10 font-medium"
                    onClick={handleViewAll}
                  >
                    View all
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {totalItems === 0 ? (
                <div className="text-center py-12 min-h-[300px] flex flex-col items-center justify-center">
                  <Mic className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-1">No transcriptions yet</h3>
                  <p className="text-muted-foreground text-sm">
                    Hold the fn key to start recording your first transcription.
                  </p>
                </div>
              ) : filteredTranscriptions.length === 0 ? (
                <div className="text-center py-12 min-h-[300px] flex flex-col items-center justify-center">
                  <Search className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-foreground mb-1">No results found</h3>
                  <p className="text-muted-foreground text-sm">
                    No transcriptions match "{searchQuery}"
                  </p>
                </div>
              ) : (
                <div>
                  <div className="overflow-hidden rounded-xl border border-border">
                    <table className="w-full table-fixed">
                      <colgroup>
                        <col />
                        <col className="w-[70px]" />
                        <col className="w-[80px]" />
                        <col className="w-[100px]" />
                      </colgroup>
                      <thead className="bg-muted/50">
                        <tr className="border-b border-border">
                          <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Content
                          </th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Words
                          </th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Time
                          </th>
                          <th className="text-left py-3 px-4 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Date
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredTranscriptions.map((t) => {
                          const isExpanded = expandedId === t.id
                          const textContent = t.cleanedText || t.rawText
                          return (
                            <React.Fragment key={t.id}>
                              <tr
                                className={`hover:bg-muted/50 transition-colors cursor-pointer ${isExpanded ? 'bg-muted/30' : ''}`}
                                onClick={() => setExpandedId(isExpanded ? null : t.id)}
                              >
                                <td className="py-4 px-4 min-w-0 align-top">
                                  <div className="flex items-start gap-2 min-w-0">
                                    <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 mt-0.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                    <p className={`text-sm text-foreground flex-1 min-w-0 ${isExpanded ? 'whitespace-pre-wrap break-words' : 'truncate'}`}>
                                      {textContent}
                                    </p>
                                    {isExpanded && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          navigator.clipboard.writeText(textContent)
                                          setCopiedId(t.id)
                                          setTimeout(() => setCopiedId(null), 2000)
                                        }}
                                        className="shrink-0 -mt-1 p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                                        title="Copy to clipboard"
                                      >
                                        {copiedId === t.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="py-4 px-4 whitespace-nowrap align-top">
                                  <span className="text-sm text-muted-foreground">{t.metadata?.wordCount}</span>
                                </td>
                                <td className="py-4 px-4 whitespace-nowrap align-top">
                                  <span className="text-sm text-muted-foreground">{t.metadata?.processingTime?.toFixed(2)}s</span>
                                </td>
                                <td className="py-4 px-4 whitespace-nowrap align-top">
                                  <span className="text-sm text-muted-foreground">{t.createdAt ? formatRelativeTime(t.createdAt) : '—'}</span>
                                </td>
                              </tr>
                              {isExpanded && t.rawText && t.cleanedText && t.rawText !== t.cleanedText && (
                                <tr className="bg-muted/30">
                                  <td colSpan={4} className="pl-10 pr-4 pb-3 pt-0">
                                    <div className="flex items-baseline gap-3">
                                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 shrink-0">Raw</span>
                                      <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{t.rawText}</p>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && !searchQuery && !showAll && (
                    <div className="flex items-center justify-between pt-4 mt-4">
                      <p className="text-sm text-muted-foreground">
                        Page <span className="font-medium text-foreground">{currentPage}</span> of <span className="font-medium text-foreground">{totalPages}</span>
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handlePageChange(1)}
                          disabled={currentPage === 1}
                          className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          First
                        </button>
                        <button
                          onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                          disabled={currentPage === 1}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </button>

                        <div className="flex items-center gap-1 mx-2">
                          {(() => {
                            const pages: (number | string)[] = []
                            if (totalPages <= 5) {
                              for (let i = 1; i <= totalPages; i++) pages.push(i)
                            } else {
                              if (currentPage <= 3) {
                                pages.push(1, 2, 3, 4, '...', totalPages)
                              } else if (currentPage >= totalPages - 2) {
                                pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages)
                              } else {
                                pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages)
                              }
                            }
                            return pages.map((page, idx) =>
                              page === '...' ? (
                                <span key={`ellipsis-${idx}`} className="px-2 text-muted-foreground">...</span>
                              ) : (
                                <button
                                  key={page}
                                  onClick={() => handlePageChange(page as number)}
                                  className={`min-w-[32px] h-8 px-2 text-sm font-medium rounded-lg transition-all ${
                                    currentPage === page
                                      ? 'bg-brand-ocean text-white shadow-sm'
                                      : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                                  }`}
                                >
                                  {page}
                                </button>
                              )
                            )
                          })()}
                        </div>

                        <button
                          onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                          disabled={currentPage === totalPages}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handlePageChange(totalPages)}
                          disabled={currentPage === totalPages}
                          className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          Last
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  )
}
