import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Smartphone, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '../ui/button'

export default function VRLogin() {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (code.length !== 5) {
      setError('Code must be 5 digits')
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Verify code with backend
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/vr/studies?code=${code}`,
        {
          method: 'GET',
        }
      )

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Invalid or expired code')
        }
        throw new Error('Error verifying code')
      }

      // Code is valid, save to storage and redirect
      localStorage.setItem('vr_code', code)
      navigate('/vr-dashboard')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 bg-primary/10 flex items-center justify-center rounded-full">
            <Smartphone className="h-6 w-6 text-primary" />
          </div>
          <h2 className="mt-6 text-3xl font-bold tracking-tight">
            VR Synchronization
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter the 5-digit code generated in your My Studies dashboard
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="code" className="sr-only">
                Access Code
              </label>
              <input
                id="code"
                name="code"
                type="text"
                required
                className="appearance-none rounded-md relative block w-full px-3 py-2 border border-input bg-background placeholder-muted-foreground text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-ring focus:border-input"
                placeholder="00000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                disabled={loading}
              />
            </div>
          </div>

          {error && (
            <div className="text-destructive text-sm text-center">
              {error}
            </div>
          )}

          <div>
            <Button
              type="submit"
              className="w-full flex justify-center"
              disabled={loading || code.length !== 5}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  Access <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
