import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import api from '../services/api'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const boliviaCenter = [-16.5, -64.0]
const boliviaZoom = 6

function MapEvents({ onBoundsChange }) {
  const map = useMap()
  const timeoutRef = useRef(null)
  
  useEffect(() => {
    const updateBounds = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => {
        const bounds = map.getBounds()
        onBoundsChange({
          minLat: bounds.getSouth(),
          maxLat: bounds.getNorth(),
          minLng: bounds.getWest(),
          maxLng: bounds.getEast()
        })
      }, 500)
    }
    
    map.on('moveend', updateBounds)
    map.on('zoomend', updateBounds)
    
    setTimeout(updateBounds, 100)
    
    return () => {
      map.off('moveend', updateBounds)
      map.off('zoomend', updateBounds)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [map, onBoundsChange])
  
  return null
}

function MapPage() {
  const [spaces, setSpaces] = useState([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState({
    space_type: '',
    department: ''
  })
  const boundsRef = useRef(null)

  const fetchSpaces = async (bounds) => {
    if (!bounds) return
    
    setLoading(true)
    try {
      const params = new URLSearchParams({
        minLat: bounds.minLat,
        maxLat: bounds.maxLat,
        minLng: bounds.minLng,
        maxLng: bounds.maxLng
      })
      
      if (filters.space_type) params.append('space_type', filters.space_type)
      if (filters.department) params.append('department', filters.department)
      
      const response = await api.get(`/spaces/map?${params}`)
      setSpaces(response.data)
    } catch (error) {
      console.error('Error fetching spaces:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleBoundsChange = (bounds) => {
    boundsRef.current = bounds
    fetchSpaces(bounds)
  }

  const handleFilterChange = (e) => {
    const { name, value } = e.target
    setFilters(prev => ({ ...prev, [name]: value }))
  }

  useEffect(() => {
    if (boundsRef.current) {
      fetchSpaces(boundsRef.current)
    }
  }, [filters])

  const spaceTypes = [
    { value: '', label: 'Todos los tipos' },
    { value: 'almacen', label: 'Almacen' },
    { value: 'galpon', label: 'Galpon' },
    { value: 'deposito', label: 'Deposito' },
    { value: 'cuarto', label: 'Cuarto' },
    { value: 'contenedor', label: 'Contenedor' },
    { value: 'patio', label: 'Patio' },
    { value: 'terreno', label: 'Terreno' }
  ]

  const departments = [
    { value: '', label: 'Todos' },
    { value: 'La Paz', label: 'La Paz' },
    { value: 'Santa Cruz', label: 'Santa Cruz' },
    { value: 'Cochabamba', label: 'Cochabamba' },
    { value: 'Oruro', label: 'Oruro' },
    { value: 'Potosi', label: 'Potosi' },
    { value: 'Tarija', label: 'Tarija' },
    { value: 'Chuquisaca', label: 'Chuquisaca' },
    { value: 'Beni', label: 'Beni' },
    { value: 'Pando', label: 'Pando' }
  ]

  return (
    <div className="map-page">
      <div className="map-filters">
        <h2>Buscar en Mapa</h2>
        <div className="filter-row">
          <select 
            name="space_type" 
            value={filters.space_type} 
            onChange={handleFilterChange}
          >
            {spaceTypes.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <select 
            name="department" 
            value={filters.department} 
            onChange={handleFilterChange}
          >
            {departments.map(d => (
              <option key={d.value} value={d.value}>{d.label}</option>
            ))}
          </select>
          <span className="results-count">
            {loading ? 'Cargando...' : `${spaces.length} espacios encontrados`}
          </span>
        </div>
      </div>
      
      <div className="map-container" style={{ height: 'calc(100vh - 200px)', width: '100%' }}>
        <MapContainer 
          center={boliviaCenter} 
          zoom={boliviaZoom} 
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapEvents onBoundsChange={handleBoundsChange} />
          
          {spaces.filter(s => typeof s.latitude === 'number' && typeof s.longitude === 'number').map(space => (
            <Marker 
              key={space.id} 
              position={[space.latitude, space.longitude]}
            >
              <Popup>
                <div className="map-popup">
                  <h4>{space.title}</h4>
                  <p><strong>Tipo:</strong> {space.space_type}</p>
                  <p><strong>Ubicacion:</strong> {space.city}, {space.department}</p>
                  <p><strong>Area:</strong> {space.available_sqm} m2</p>
                  {space.price_preview && (
                    <p><strong>Desde:</strong> Bs. {space.price_preview}/m2</p>
                  )}
                  <Link to={`/espacios/${space.id}`} className="btn btn-sm">
                    Ver Detalle
                  </Link>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
      
      <style>{`
        .map-page {
          padding: 1rem;
        }
        .map-filters {
          background: #f5f5f5;
          padding: 1rem;
          border-radius: 8px;
          margin-bottom: 1rem;
        }
        .map-filters h2 {
          margin: 0 0 0.5rem 0;
          font-size: 1.25rem;
        }
        .filter-row {
          display: flex;
          gap: 1rem;
          align-items: center;
          flex-wrap: wrap;
        }
        .filter-row select {
          padding: 0.5rem;
          border: 1px solid #ddd;
          border-radius: 4px;
          min-width: 150px;
        }
        .results-count {
          color: #666;
          font-size: 0.9rem;
        }
        .map-container {
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        .map-popup h4 {
          margin: 0 0 0.5rem 0;
        }
        .map-popup p {
          margin: 0.25rem 0;
          font-size: 0.9rem;
        }
        .map-popup .btn {
          display: inline-block;
          margin-top: 0.5rem;
          padding: 0.25rem 0.75rem;
          background: #007bff;
          color: white;
          text-decoration: none;
          border-radius: 4px;
          font-size: 0.85rem;
        }
        .map-popup .btn:hover {
          background: #0056b3;
        }
      `}</style>
    </div>
  )
}

export default MapPage
