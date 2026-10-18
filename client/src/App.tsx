import { Navigate, Route, Routes } from 'react-router'
import AdminRoute from './components/AdminRoute.tsx'
import ContentLayout from './components/ContentLayout.tsx'
import ProtectedLayout from './components/ProtectedLayout.tsx'
import TicketSplitLayout from './components/TicketSplitLayout.tsx'
import DashboardPage from './pages/DashboardPage.tsx'
import LoginPage from './pages/LoginPage.tsx'
import TicketDetailPage from './pages/TicketDetailPage.tsx'
import TicketsPage from './pages/TicketsPage.tsx'
import UsersPage from './pages/UsersPage.tsx'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route element={<ContentLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="tickets" element={<TicketsPage />} />
          <Route element={<AdminRoute />}>
            <Route path="users" element={<UsersPage />} />
          </Route>
        </Route>
        <Route element={<TicketSplitLayout />}>
          <Route path="tickets/:id" element={<TicketDetailPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
