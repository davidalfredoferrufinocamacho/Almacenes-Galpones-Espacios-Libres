import { Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import Footer from './components/Footer'
import Home from './pages/Home'
import Spaces from './pages/Spaces'
import SpaceDetail from './pages/SpaceDetail'
import MapPage from './pages/MapPage'
import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import MySpaces from './pages/MySpaces'
import CreateSpace from './pages/CreateSpace'
import MyReservations from './pages/MyReservations'
import MyContracts from './pages/MyContracts'
import Appointments from './pages/Appointments'
import AdminDashboard from './pages/AdminDashboard'
import OwnerDashboard from './pages/OwnerDashboard'
import Legal from './pages/Legal'
import Contact from './pages/Contact'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <div className="app">
      <Header />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/espacios" element={<Spaces />} />
          <Route path="/espacios/:id" element={<SpaceDetail />} />
          <Route path="/mapa" element={<MapPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/registro" element={<Register />} />
          <Route path="/legal/:type" element={<Legal />} />
          <Route path="/contacto" element={<Contact />} />
          
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } />
          
          <Route path="/mis-espacios" element={
            <ProtectedRoute roles={['HOST']}>
              <MySpaces />
            </ProtectedRoute>
          } />
          
          <Route path="/crear-espacio" element={
            <ProtectedRoute roles={['HOST']}>
              <CreateSpace />
            </ProtectedRoute>
          } />
          
          <Route path="/mis-reservaciones" element={
            <ProtectedRoute roles={['GUEST']}>
              <MyReservations />
            </ProtectedRoute>
          } />
          
          <Route path="/mis-contratos" element={
            <ProtectedRoute>
              <MyContracts />
            </ProtectedRoute>
          } />
          
          <Route path="/citas" element={
            <ProtectedRoute>
              <Appointments />
            </ProtectedRoute>
          } />
          
          <Route path="/admin/*" element={
            <ProtectedRoute roles={['ADMIN']}>
              <AdminDashboard />
            </ProtectedRoute>
          } />
          
          <Route path="/propietario/*" element={
            <ProtectedRoute roles={['HOST']}>
              <OwnerDashboard />
            </ProtectedRoute>
          } />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}

export default App
