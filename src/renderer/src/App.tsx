import { useEffect, useRef, useState } from 'react'
import { Routes, Route, Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import logo from './assets/palm-marine-logo.png'
import BookingListPage from './pages/BookingListPage'
import BookingFormPage from './pages/BookingFormPage'
import BookingDetailPage from './pages/BookingDetailPage'
import DashboardPage from './pages/DashboardPage'
import ArchivePage from './pages/ArchivePage'
import BackupPage from './pages/BackupPage'
import VesselTrackingPage from './pages/VesselTrackingPage'
import ReportsPage from './pages/ReportsPage'
import UnassignedVehiclesPage from './pages/UnassignedVehiclesPage'

/**
 * Sayfalar arası geçişte tarayıcı geçmişini kullanan "Geri" butonu. Uygulama
 * içinde en az bir kez sayfa değiştirilmeden aktif olmaz (ör. başlangıç
 * ekranında "geri" gidilecek bir yer yoktur).
 */
function BackButton(): React.JSX.Element {
  const navigate = useNavigate()
  const location = useLocation()
  const visitedCount = useRef(0)
  const [canGoBack, setCanGoBack] = useState(false)

  useEffect(() => {
    visitedCount.current += 1
    if (visitedCount.current > 1) setCanGoBack(true)
  }, [location.key])

  return (
    <button
      type="button"
      className="app-header__back"
      onClick={() => navigate(-1)}
      disabled={!canGoBack}
      title="Geri"
      aria-label="Geri"
    >
      ← Geri
    </button>
  )
}

function App(): React.JSX.Element {
  return (
    <>
      <header className="app-header">
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img alt="Konteyner Takip Sistemi" className="app-header__logo" src={logo} />
          <div>
            <div className="app-header__title">Konteyner Takip Sistemi</div>
            <div className="app-header__subtitle">Booking &amp; Konteyner Takip</div>
          </div>
        </Link>
        <BackButton />
        <nav className="app-header__nav">
          <NavLink to="/" end className="app-header__navlink">
            Dashboard
          </NavLink>
          <NavLink to="/bookings" className="app-header__navlink">
            Bookingler
          </NavLink>
          <NavLink to="/vessel-tracking" className="app-header__navlink">
            Gemi Takip
          </NavLink>
          <NavLink to="/reports" className="app-header__navlink">
            Raporlar
          </NavLink>
          <NavLink to="/unassigned-vehicles" className="app-header__navlink">
            Atanmayan Araçlar
          </NavLink>
          <NavLink to="/archive" className="app-header__navlink">
            Arşiv
          </NavLink>
          <NavLink to="/backup" className="app-header__navlink">
            Yedekleme
          </NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/bookings" element={<BookingListPage />} />
          <Route path="/bookings/new" element={<BookingFormPage />} />
          <Route path="/bookings/:id/edit" element={<BookingFormPage />} />
          <Route path="/bookings/:id" element={<BookingDetailPage />} />
          <Route path="/archive" element={<ArchivePage />} />
          <Route path="/vessel-tracking" element={<VesselTrackingPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/unassigned-vehicles" element={<UnassignedVehiclesPage />} />
          <Route path="/backup" element={<BackupPage />} />
        </Routes>
      </main>
    </>
  )
}

export default App
