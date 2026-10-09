import { MotionConfig } from 'framer-motion'
import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import { AppShell } from './layouts/AppShell'
import { ForgotPassword, Landing, Login, Register, Splash, VerifyEmail } from './screens/auth'
import { DesignSystem, StatesGallery } from './screens/design'
import { DriverRide, OfferRide } from './screens/drive'
import { FindRide, MatchResults } from './screens/find'
import { Home } from './screens/home'
import { ChatList, ChatThread, Notifications } from './screens/inbox'
import { LiveRide } from './screens/live'
import { Onboarding } from './screens/onboarding'
import { Payment } from './screens/payment'
import { Profile, ProfileSection, Settings } from './screens/profile'
import { RideDetails } from './screens/rideDetails'
import { MyRides } from './screens/rides'
import { TripStatus } from './screens/trip'
import { Wallet } from './screens/wallet'
import { processScheduled } from './services/api'
import { SearchProvider } from './state/search'

/** Drives the local community simulator (driver responses, incoming requests, replies). */
function useSimulator() {
  useEffect(() => {
    const t = setInterval(processScheduled, 1000)
    return () => clearInterval(t)
  }, [])
}

export function App() {
  useSimulator()
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <SearchProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Splash />} />
              <Route path="/welcome" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/verify" element={<VerifyEmail />} />
              <Route path="/forgot" element={<ForgotPassword />} />
              <Route path="/design-system" element={<DesignSystem />} />
              <Route path="/states" element={<StatesGallery />} />

              {/* Primary destinations — bottom navigation on mobile */}
              <Route element={<AppShell nav />}>
                <Route path="/home" element={<Home />} />
                <Route path="/find" element={<FindRide />} />
                <Route path="/find/results" element={<MatchResults />} />
                <Route path="/rides" element={<MyRides />} />
                <Route path="/wallet" element={<Wallet />} />
                <Route path="/profile" element={<Profile />} />
              </Route>

              {/* Focused flows — no bottom navigation */}
              <Route element={<AppShell nav={false} />}>
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/ride/:rideId" element={<RideDetails />} />
                <Route path="/trip/:bookingId" element={<TripStatus />} />
                <Route path="/pay/:bookingId" element={<Payment />} />
                <Route path="/live/:bookingId" element={<LiveRide />} />
                <Route path="/offer" element={<OfferRide />} />
                <Route path="/drive/:rideId" element={<DriverRide />} />
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/chat" element={<ChatList />} />
                <Route path="/chat/:bookingId" element={<ChatThread />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/profile/:section" element={<ProfileSection />} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </SearchProvider>
      </ToastProvider>
    </MotionConfig>
  )
}
