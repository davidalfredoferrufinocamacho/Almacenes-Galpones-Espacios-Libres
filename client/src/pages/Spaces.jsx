import { useState, useEffect } from 'react'
import api from '../services/api'
import SpaceCard from '../components/SpaceCard'
import './Spaces.css'

function Spaces() {
  const [spaces, setSpaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    city: '',
    department: '',
    space_type: '',
    min_sqm: '',
    max_sqm: '',
    has_roof: '',
    has_security: ''
  })

  const departments = [
    'La Paz', 'Santa Cruz', 'Cochabamba', 'Oruro', 'Potosi', 
    'Chuquisaca', 'Tarija', 'Beni', 'Pando'
  ]

  const spaceTypes = [
    { value: 'almacen', label: 'Almacen' },
    { value: 'galpon', label: 'Galpon' },
    { value: 'deposito', label: 'Deposito' },
    { value: 'cuarto', label: 'Cuarto' },
    { value: 'contenedor', label: 'Contenedor' },
    { value: 'patio', label: 'Patio' },
    { value: 'terreno', label: 'Terreno' }
  ]

  useEffect(() => {
    loadSpaces()
  }, [])

  const loadSpaces = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value)
      })
      
      const response = await api.get(`/spaces?${params.toString()}`)
      setSpaces(response.data)
    } catch (error) {
      console.error('Error loading spaces:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (e) => {
    const { name, value } = e.target
    setFilters(prev => ({ ...prev, [name]: value }))
  }

  const handleSearch = (e) => {
    e.preventDefault()
    loadSpaces()
  }

  const clearFilters = () => {
    setFilters({
      city: '',
      department: '',
      space_type: '',
      min_sqm: '',
      max_sqm: '',
      has_roof: '',
      has_security: ''
    })
  }

  return (
    <div className="spaces-page">
      <div className="page-header">
        <div className="container">
          <h1>Espacios Disponibles</h1>
          <p>Encuentra el espacio ideal para tu negocio en Bolivia</p>
        </div>
      </div>

      <div className="container">
        <div className="spaces-layout">
          <aside className="filters-sidebar card">
            <h3>Filtros</h3>
            <form onSubmit={handleSearch}>
              <div className="form-group">
                <label>Departamento</label>
                <select name="department" value={filters.department} onChange={handleFilterChange}>
                  <option value="">Todos</option>
                  {departments.map(dep => (
                    <option key={dep} value={dep}>{dep}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Ciudad</label>
                <input
                  type="text"
                  name="city"
                  value={filters.city}
                  onChange={handleFilterChange}
                  placeholder="Ej: La Paz"
                />
              </div>

              <div className="form-group">
                <label>Tipo de Espacio</label>
                <select name="space_type" value={filters.space_type} onChange={handleFilterChange}>
                  <option value="">Todos</option>
                  {spaceTypes.map(type => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Metros cuadrados</label>
                <div className="range-inputs">
                  <input
                    type="number"
                    name="min_sqm"
                    value={filters.min_sqm}
                    onChange={handleFilterChange}
                    placeholder="Min"
                  />
                  <span>-</span>
                  <input
                    type="number"
                    name="max_sqm"
                    value={filters.max_sqm}
                    onChange={handleFilterChange}
                    placeholder="Max"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Caracteristicas</label>
                <select name="has_roof" value={filters.has_roof} onChange={handleFilterChange}>
                  <option value="">Techo: Todos</option>
                  <option value="true">Con techo</option>
                  <option value="false">Sin techo</option>
                </select>
              </div>

              <div className="form-group">
                <select name="has_security" value={filters.has_security} onChange={handleFilterChange}>
                  <option value="">Seguridad: Todos</option>
                  <option value="true">Con seguridad</option>
                </select>
              </div>

              <div className="filter-buttons">
                <button type="submit" className="btn btn-primary">Buscar</button>
                <button type="button" className="btn btn-outline" onClick={clearFilters}>Limpiar</button>
              </div>
            </form>
          </aside>

          <div className="spaces-content">
            <div className="results-header">
              <span>{spaces.length} espacios encontrados</span>
            </div>

            {loading ? (
              <div className="loading"><div className="spinner"></div></div>
            ) : spaces.length === 0 ? (
              <div className="no-results card">
                <p>No se encontraron espacios con los filtros seleccionados</p>
              </div>
            ) : (
              <div className="grid grid-2">
                {spaces.map(space => (
                  <SpaceCard key={space.id} space={space} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default Spaces
