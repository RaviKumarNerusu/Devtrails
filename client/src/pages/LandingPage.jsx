import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../authContext.jsx";

const HERO_VIDEO =
  "https://assets.mixkit.co/videos/preview/mixkit-rain-falling-on-the-window-on-a-rainy-day-1864-large.mp4";

const FLOW_STEPS = [
  "Set your city, pincode, and average daily earnings.",
  "Our AI estimates disruption risk based on hyper-local rainfall.",
  "Choose a weekly protection plan and pay a small premium.",
  "When heavy rain hits, payouts are auto-calculated and credited."
];

export default function LandingPage() {
  const { user } = useAuth();
  const [videoFailed, setVideoFailed] = useState(false);

  return (
    <div className="ig-landing">
      <section className="ig-hero row align-items-center g-4 g-lg-5 mb-5 mb-lg-6">
        <div className="col-lg-6 ig-hero-copy">
          <p className="ig-eyebrow ig-reveal">Income Guard</p>
          <h1 className="ig-hero-title ig-reveal ig-reveal-delay-1">
            Weather-linked income protection for gig workers
          </h1>
          <p className="ig-hero-lead ig-reveal ig-reveal-delay-2">
            Income Guard predicts rain disruption with AI and auto-calculates fair payouts so your daily earnings stay
            protected.
          </p>
          <div className="d-flex flex-wrap gap-2 mb-3 ig-reveal ig-reveal-delay-3">
            {user ? (
              <Link to="/dashboard" className="btn btn-primary btn-lg ig-btn-pulse">
                Go to dashboard
              </Link>
            ) : (
              <>
                <Link to="/onboarding" className="btn btn-primary btn-lg ig-btn-pulse">
                  Get started in 2 minutes
                </Link>
                <Link to="/login" className="btn btn-outline-primary btn-lg">
                  Login with email
                </Link>
              </>
            )}
          </div>
          <p className="ig-trust-line ig-reveal ig-reveal-delay-4">
            Trusted by delivery partners to smooth out rainy-day income shocks with weekly micro-premiums.
          </p>
        </div>
        <div className="col-lg-6 ig-hero-media ig-reveal ig-reveal-delay-2">
          <div className="ig-video-frame">
            <div className="ig-video-glow" aria-hidden />
            {!videoFailed ? (
              <video
                className="ig-hero-video"
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-hidden="true"
                onError={() => setVideoFailed(true)}
              >
                <source src={HERO_VIDEO} type="video/mp4" />
              </video>
            ) : null}
            {videoFailed ? (
              <div className="ig-video-fallback" aria-hidden>
                <div className="ig-rain ig-rain-1" />
                <div className="ig-rain ig-rain-2" />
                <div className="ig-rain ig-rain-3" />
                <div className="ig-shield-icon">
                  <svg viewBox="0 0 48 48" width="72" height="72" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                      d="M24 4L8 12v12c0 10 8 18 16 20 8-2 16-10 16-20V12L24 4z"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="currentColor"
                      fillOpacity="0.15"
                    />
                    <path d="M18 24l4 4 8-8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            ) : null}
            <div className="ig-video-caption">
              <span className="ig-live-dot" />
              Live-style rain intelligence preview
            </div>
          </div>
        </div>
      </section>

      <section className="ig-flow-section" aria-labelledby="ig-flow-heading">
        <div className="text-center mb-4 mb-lg-5">
          <h2 id="ig-flow-heading" className="ig-flow-heading ig-float-in">
            Today&apos;s protection flow
          </h2>
          <p className="ig-flow-sub text-muted mx-auto ig-float-in ig-float-in-delay-1">
            From profile to payout — four clear steps, fully automated when conditions trigger.
          </p>
        </div>
        <div className="row g-4 justify-content-center">
          {FLOW_STEPS.map((text, i) => (
            <div key={text} className="col-md-6 col-xl-3">
              <div className={`ig-flow-card h-100 ig-flow-card-animate ig-flow-card-delay-${i + 1}`}>
                <div className="ig-flow-num">{i + 1}</div>
                <p className="ig-flow-text mb-0">{text}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="text-center mt-4 mt-lg-5 ig-float-in ig-float-in-delay-4">
          <Link to="/analytics" className="btn btn-link btn-sm p-0 ig-analytics-link">
            View analytics dashboard →
          </Link>
        </div>
      </section>
    </div>
  );
}
