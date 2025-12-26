import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import './MySpaces.css'

function MySpaces() {
  const [spaces, setSpaces] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSpaces()
  }, [])

  const loadSpaces = async () => {
    try {
      const response = await api.get('/users/my-spaces')
      setSpaces(response.data)
    } catch (error) {
      console.error('Error loading spaces:', error)
    } finally {
      setLoading(false)
    }
  }

  const statusLabels = {
    draft: 'Borrador',
    published: 'Publicado',
    paused: 'Pausado'
  }

  const statusColors = {
    draft: 'status-draft',
    published: 'status-published',
    paused: 'status-paused'
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  return (
    <div className="my-spaces">
      <div className="page-header">
        <div className="container">
          <div className="header-content">
            <h1>Mis Espacios</h1>
            <Link to="/crear-espacio" className="btn btn-primary">Crear Espacio</Link>
          </div>
        </div>
      </div>

      <div className="container">
        {spaces.length === 0 ? (
          <div className="empty-state card">
            <h3>No tienes espacios registrados</h3>
            <p>Comienza publicando tu primer espacio</p>
            <Link to="/crear-espacio" className="btn btn-primary">Crear Espacio</Link>
          </div>
        ) : (
          <div className="spaces-list">
            {spaces.map(space => (
              <div key={space.id} className="space-item card">
                <div className="space-content">
                  <div className="space-main">
                    <h3>{space.title}</h3>
                    <p className="location">{space.city}, {space.department}</p>
                    <p className="sqm">{space.available_sqm} m² disponibles</p>
                  </div>
                  <div className="space-stats">
                    <span className={`status-badge ${statusColors[space.status]}`}>
                      {statusLabels[space.status]}
                    </span>
                    <span className="reservations">
                      {space.active_reservations} reservaciones activas
                    </span>
                  </div>
                </div>
                <div className="space-actions">
                  <Link to={`/espacios/${space.id}`} className="btn btn-outline">Ver</Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default MySpaces
