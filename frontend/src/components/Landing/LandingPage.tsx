import { Brain, Upload, Eye, Shield, Zap, Database } from 'lucide-react'
import './LandingPage.css'

interface LandingPageProps {
  onLogin: () => void
}

export function LandingPage({ onLogin }: LandingPageProps) {
  return (
    <div className="landing-page">
      {/* Hero Section */}
      <header className="landing-header">
        <nav className="landing-nav">
          <div className="nav-brand">
            <Brain className="nav-logo" />
            <span>Iris Oculus</span>
          </div>
          <button className="btn-login" onClick={onLogin}>
            Sign In
          </button>
        </nav>

        <div className="hero-section">
          <h1 className="hero-title">
            Advanced Medical Imaging
            <br />
            <span className="hero-gradient">Visualization Platform</span>
          </h1>
          <p className="hero-subtitle">
            Process and visualize DICOM and NIFTI medical imaging studies
            <br />
            with AI-powered segmentation powered by TotalSegmentator
          </p>
          <div className="hero-actions">
            <button className="btn-primary" onClick={onLogin}>
              Get Started
            </button>
            <button className="btn-secondary" onClick={() => {
              document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })
            }}>
              Learn More
            </button>
          </div>
        </div>
      </header>

      {/* Features Section */}
      <section id="features" className="features-section">
        <h2 className="section-title">Platform Features</h2>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">
              <Upload />
            </div>
            <h3>Upload Studies</h3>
            <p>
              Securely upload DICOM and NIFTI files.
              All your medical imaging data stored safely in the cloud.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <Brain />
            </div>
            <h3>AI Segmentation</h3>
            <p>
              Automatic anatomical structure segmentation using TotalSegmentator
              with 104 different structures detected.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <Eye />
            </div>
            <h3>3D Visualization</h3>
            <p>
              Interactive triplanar and 3D viewers with advanced
              rendering capabilities for detailed analysis.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <Shield />
            </div>
            <h3>Secure & Private</h3>
            <p>
              Your data is encrypted and protected. Only you
              can access your medical imaging studies.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <Zap />
            </div>
            <h3>Fast Processing</h3>
            <p>
              GPU-accelerated processing with automatic scaling.
              Results ready in minutes, not hours.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-icon">
              <Database />
            </div>
            <h3>Study Management</h3>
            <p>
              Organize and manage all your studies in one place.
              Easy access to your complete imaging history.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section">
        <h2>Ready to Get Started?</h2>
        <p>Join Iris Oculus and transform how you work with medical imaging</p>
        <button className="btn-cta" onClick={onLogin}>
          Create Free Account
        </button>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <Brain className="footer-logo" />
            <span>Iris Oculus</span>
          </div>
          <div className="footer-text">
            © 2025 Iris Oculus. Advanced Medical Imaging Platform.
          </div>
        </div>
      </footer>
    </div>
  )
}
