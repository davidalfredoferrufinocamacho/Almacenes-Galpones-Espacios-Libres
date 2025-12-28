import { Link } from 'react-router-dom'
import './SpaceCard.css'

function SpaceCard({ space }) {
  const spaceTypes = {
    almacen: 'Almacen',
    galpon: 'Galpon',
    deposito: 'Deposito',
    cuarto: 'Cuarto',
    contenedor: 'Contenedor',
    patio: 'Patio',
    terreno: 'Terreno'
  }

  const getLowestPrice = () => {
    const prices = [
      space.price_per_sqm_day,
      space.price_per_sqm_week,
      space.price_per_sqm_month,
      space.price_per_sqm_quarter,
      space.price_per_sqm_semester,
      space.price_per_sqm_year
    ].filter(p => p > 0)
    
    return prices.length > 0 ? Math.min(...prices) : 0
  }

  return (
    <Link to={`/espacios/${space.id}`} className="space-card card">
      <div className="space-image">
        {space.primary_photo ? (
          <img src={space.primary_photo} alt={space.title} />
        ) : (
          <div className="no-image">Sin imagen</div>
        )}
        <span className="space-type-badge">{spaceTypes[space.space_type]}</span>
      </div>
      
      <div className="space-info">
        <h3>{space.title}</h3>
        <p className="location">{space.city}, {space.department}</p>
        
        {(space.available_from || space.available_until) && (
          <p className="availability">
            {space.available_from && `Desde ${new Date(space.available_from).toLocaleDateString('es-BO')}`}
            {space.available_from && space.available_until && ' - '}
            {space.available_until && `Hasta ${new Date(space.available_until).toLocaleDateString('es-BO')}`}
          </p>
        )}
        
        <div className="space-details">
          <span className="sqm">{space.available_sqm} m² disponibles</span>
          <div className="conditions">
            {space.has_roof ? <span className="tag">Con techo</span> : null}
            {space.has_security ? <span className="tag">Seguridad</span> : null}
          </div>
        </div>
        
        <div className="space-price">
          <span className="price">Bs. {getLowestPrice()}</span>
          <span className="price-label">/m² desde</span>
        </div>
      </div>
    </Link>
  )
}

export default SpaceCard
