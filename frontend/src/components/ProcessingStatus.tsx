import { useEffect, useState } from 'react'
import { Loader2, CheckCircle, XCircle, Clock, Cpu } from 'lucide-react'

interface ProcessingStatusProps {
  jobId: string
  status: string
  onComplete?: () => void
}

export function ProcessingStatus({ jobId, status, onComplete }: ProcessingStatusProps) {
  const [currentStatus, setCurrentStatus] = useState(status)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState('15-25 min')

  useEffect(() => {
    setCurrentStatus(status)
  }, [status])

  // Timer to show elapsed time
  useEffect(() => {
    if (currentStatus === 'queued' || currentStatus === 'processing') {
      const interval = setInterval(() => {
        setElapsedTime(prev => {
          const newTime = prev + 1
          // Update estimated time based on elapsed
          if (newTime < 300) { // Less than 5 min
            setEstimatedTimeRemaining('20-25 min')
          } else if (newTime < 600) { // Less than 10 min
            setEstimatedTimeRemaining('10-15 min')
          } else if (newTime < 900) { // Less than 15 min
            setEstimatedTimeRemaining('5-10 min')
          } else {
            setEstimatedTimeRemaining('Few minutes')
          }
          return newTime
        })
      }, 1000)

      return () => clearInterval(interval)
    }
  }, [currentStatus])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getStatusDisplay = () => {
    switch (currentStatus) {
      case 'pending':
      case 'uploaded':
        return {
          icon: <Clock className="w-5 h-5 text-blue-500" />,
          title: 'Ready to Process',
          description: 'Study uploaded and ready for AI processing',
          color: 'text-blue-500',
          bg: 'bg-blue-500/10'
        }
      case 'queued':
        return {
          icon: <Loader2 className="w-5 h-5 text-yellow-500 animate-spin" />,
          title: 'Queued',
          description: 'Waking up AI endpoint... (This may take 5-10 minutes on first run)',
          color: 'text-yellow-500',
          bg: 'bg-yellow-500/10'
        }
      case 'processing':
        return {
          icon: <Cpu className="w-5 h-5 text-purple-500 animate-pulse" />,
          title: 'Processing with AI',
          description: 'TotalSegmentator is analyzing your scan',
          color: 'text-purple-500',
          bg: 'bg-purple-500/10'
        }
      case 'completed':
        return {
          icon: <CheckCircle className="w-5 h-5 text-green-500" />,
          title: 'Completed',
          description: '3D models ready to view',
          color: 'text-green-500',
          bg: 'bg-green-500/10'
        }
      case 'failed':
        return {
          icon: <XCircle className="w-5 h-5 text-red-500" />,
          title: 'Failed',
          description: 'Processing failed. Please try again.',
          color: 'text-red-500',
          bg: 'bg-red-500/10'
        }
      default:
        return {
          icon: <Clock className="w-5 h-5 text-gray-500" />,
          title: 'Unknown',
          description: 'Status unknown',
          color: 'text-gray-500',
          bg: 'bg-gray-500/10'
        }
    }
  }

  const statusDisplay = getStatusDisplay()
  const isProcessing = currentStatus === 'queued' || currentStatus === 'processing'

  return (
    <div className={`rounded-lg border p-4 ${statusDisplay.bg}`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          {statusDisplay.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h4 className={`text-sm font-semibold ${statusDisplay.color}`}>
              {statusDisplay.title}
            </h4>
            {isProcessing && (
              <span className="text-xs text-muted-foreground">
                {formatTime(elapsedTime)} elapsed
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            {statusDisplay.description}
          </p>
          
          {isProcessing && (
            <>
              {/* Progress bar */}
              <div className="w-full bg-muted rounded-full h-2 mb-2 overflow-hidden">
                <div 
                  className={`h-full ${statusDisplay.color.replace('text-', 'bg-')} transition-all duration-1000 animate-pulse`}
                  style={{ 
                    width: currentStatus === 'queued' ? '30%' : '70%',
                    transition: 'width 2s ease-in-out'
                  }}
                />
              </div>
              
              {/* Estimated time */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {currentStatus === 'queued' ? 'Starting up...' : 'Processing...'}
                </span>
                <span className="text-muted-foreground">
                  ~{estimatedTimeRemaining} remaining
                </span>
              </div>
            </>
          )}

          {currentStatus === 'completed' && (
            <div className="text-xs text-muted-foreground">
              Processing took {formatTime(elapsedTime)} • Click "View Study" to see results
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
