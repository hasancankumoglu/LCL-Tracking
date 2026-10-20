import { Routes, Route, Navigate, Link, NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { PermissionAction } from '@shared/types'
import { useAuth } from './auth/AuthContext'
import logo from './assets/palm-marine-logo.png'
import LanguageSwitcher from './components/LanguageSwitcher'
import LoginPage from './pages/LoginPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import BookingListPage from './pages/BookingListPage'
import BookingFormPage from './pages/BookingFormPage'
import BookingDetailPage from './pages/BookingDetailPage'
import DashboardPage from './pages/DashboardPage'
import ArchivePage from './pages/ArchivePage'
import BackupPage from './pages/BackupPage'
import VesselTrackingPage from './pages/VesselTrackingPage'
import ReportsPage from './pages/ReportsPage'
import UnassignedVehiclesPage from './pages/UnassignedVehiclesPage'
import UsersAdminPage from './pages/UsersAdminPage'
import CustomerManagementPage from './pages/CustomerManagementPage'
import PendingDeletionsPage from './pages/PendingDeletionsPage'

/** Doğrudan URL ile erişimi de kapsayacak şekilde, yetkisiz kullanıcıyı anasayfaya yönlendirir. */
function RequirePermission({
  action,
  children
}: {
  action: PermissionAction
  children: React.JSX.Element
}): React.JSX.Element {
  const { hasPermission } = useAuth()
  if (!hasPermission(action)) return <Navigate to="/" replace />
  return children
}

/** Doğrudan URL ile erişimi de kapsayacak şekilde, admin olmayan kullanıcıyı anasayfaya yönlendirir. */
function RequireAdmin({ children }: { children: React.JSX.Element }): React.JSX.Element {
  const { user } = useAuth()
  if (user?.role !== 'ADMIN') return <Navigate to="/" replace />
  return children
}

/** Customer rolü sadece Dashboard + Bookings (salt okunur) görebilir - doğrudan URL ile erişimi de kapsayacak şekilde diğer tüm sayfalardan uzak tutar. */
function RequireNotCustomer({ children }: { children: React.JSX.Element }): React.JSX.Element {
  const { user } = useAuth()
  if (user?.role === 'CUSTOMER') return <Navigate to="/" replace />
  return children
}

function AdminOperationsMenu(): React.JSX.Element | null {
  const { t } = useTranslation()
  const { user } = useAuth()
  if (user?.role !== 'ADMIN') return null
  return (
    <div className="app-header__dropdown">
      <button type="button" className="app-header__navlink app-header__navlink--dropdown">
        {t('nav.adminOperations')}
      </button>
      <div className="app-header__dropdown-menu">
        <NavLink to="/admin/users" className="app-header__dropdown-item">
          {t('nav.adminUsers')}
        </NavLink>
        <NavLink to="/admin/customers" className="app-header__dropdown-item">
          {t('nav.adminCustomers')}
        </NavLink>
      </div>
    </div>
  )
}

function UserMenu(): React.JSX.Element {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  if (!user) return <></>
  return (
    <div className="app-header__user">
      <div>
        <div className="app-header__user-name">{user.displayName ?? user.username}</div>
        <div className="app-header__user-role">{t(`enums.userRole.${user.role}`)}</div>
      </div>
      <LanguageSwitcher />
      <button type="button" className="app-header__logout" onClick={() => logout()}>
        {t('nav.logout')}
      </button>
    </div>
  )
}

function App(): React.JSX.Element {
  const { t } = useTranslation()
  const { user, hasPermission } = useAuth()

  if (!user) return <LoginPage />
  if (user.mustChangePassword) return <ChangePasswordPage />

  return (
    <>
      <header className="app-header">
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img alt="LCL-Tracking" className="app-header__logo" src={logo} />
          <div>
            <div className="app-header__title">{t('nav.appTitle')}</div>
            <div className="app-header__subtitle">{t('nav.appSubtitle')}</div>
          </div>
        </Link>
        <nav className="app-header__nav">
          {hasPermission('dashboard.view') && (
            <NavLink to="/" end className="app-header__navlink">
              {t('nav.dashboard')}
            </NavLink>
          )}
          <NavLink to="/bookings" className="app-header__navlink">
            {t('nav.bookings')}
          </NavLink>
          {hasPermission('vessel_tracking.view') && (
            <NavLink to="/vessel-tracking" className="app-header__navlink">
              {t('nav.vesselTracking')}
            </NavLink>
          )}
          {user?.role !== 'CUSTOMER' && (
            <>
              <NavLink to="/reports" className="app-header__navlink">
                {t('nav.reports')}
              </NavLink>
              <NavLink to="/unassigned-vehicles" className="app-header__navlink">
                {t('nav.unassignedVehicles')}
              </NavLink>
            </>
          )}
          {hasPermission('archive.view') && (
            <NavLink to="/archive" className="app-header__navlink">
              {t('nav.archive')}
            </NavLink>
          )}
          {hasPermission('bookings.manage') && (
            <NavLink to="/pending-deletions" className="app-header__navlink">
              {t('nav.pendingDeletions')}
            </NavLink>
          )}
          {user?.role !== 'CUSTOMER' && (
            <NavLink to="/backup" className="app-header__navlink">
              {t('nav.backup')}
            </NavLink>
          )}
          <AdminOperationsMenu />
        </nav>
        <UserMenu />
      </header>
      <main className="app-main">
        <Routes>
          <Route
            path="/"
            element={
              <RequirePermission action="dashboard.view">
                <DashboardPage />
              </RequirePermission>
            }
          />
          <Route path="/bookings" element={<BookingListPage />} />
          <Route
            path="/bookings/new"
            element={
              <RequireNotCustomer>
                <BookingFormPage />
              </RequireNotCustomer>
            }
          />
          <Route
            path="/bookings/:id/edit"
            element={
              <RequireNotCustomer>
                <BookingFormPage />
              </RequireNotCustomer>
            }
          />
          <Route path="/bookings/:id" element={<BookingDetailPage />} />
          <Route
            path="/archive"
            element={
              <RequirePermission action="archive.view">
                <ArchivePage />
              </RequirePermission>
            }
          />
          <Route
            path="/vessel-tracking"
            element={
              <RequirePermission action="vessel_tracking.view">
                <VesselTrackingPage />
              </RequirePermission>
            }
          />
          <Route
            path="/reports"
            element={
              <RequireNotCustomer>
                <ReportsPage />
              </RequireNotCustomer>
            }
          />
          <Route
            path="/unassigned-vehicles"
            element={
              <RequireNotCustomer>
                <UnassignedVehiclesPage />
              </RequireNotCustomer>
            }
          />
          <Route
            path="/pending-deletions"
            element={
              <RequirePermission action="bookings.manage">
                <PendingDeletionsPage />
              </RequirePermission>
            }
          />
          <Route
            path="/backup"
            element={
              <RequireNotCustomer>
                <BackupPage />
              </RequireNotCustomer>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RequirePermission action="users.manage">
                <UsersAdminPage />
              </RequirePermission>
            }
          />
          <Route
            path="/admin/customers"
            element={
              <RequireAdmin>
                <CustomerManagementPage />
              </RequireAdmin>
            }
          />
        </Routes>
      </main>
    </>
  )
}

export default App
