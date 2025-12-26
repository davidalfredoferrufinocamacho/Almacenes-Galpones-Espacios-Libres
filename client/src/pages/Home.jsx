import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import SpaceCard from '../components/SpaceCard'
import './Home.css'

function Home() {
  const [spaces, setSpaces] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/spaces?limit=6')
      .then(response => setSpaces(response.data.slice(0, 6)))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="home">
      <section className="hero">
        <div className="container">
          <div className="hero-content">
            <h1>Encuentra el Espacio Perfecto para tu Negocio</h1>
            <p>Plataforma lider en Bolivia para alquiler temporal de almacenes, galpones y espacios libres</p>
            <div className="hero-buttons">
              <Link to="/espacios" className="btn btn-primary">Ver Espacios</Link>
              <Link to="/registro" className="btn btn-outline">Publicar Espacio</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="features">
        <div className="container">
          <h2>Como Funciona</h2>
          <div className="features-grid">
            <div className="feature">
              <div className="feature-icon">1</div>
              <h3>Busca</h3>
              <p>Explora nuestra amplia seleccion de espacios disponibles en toda Bolivia</p>
            </div>
            <div className="feature">
              <div className="feature-icon">2</div>
              <h3>Reserva</h3>
              <p>Paga un anticipo seguro y agenda una visita presencial al espacio</p>
            </div>
            <div className="feature">
              <div className="feature-icon">3</div>
              <h3>Confirma</h3>
              <p>Firma el contrato digital y comienza a usar tu espacio alquilado</p>
            </div>
          </div>
        </div>
      </section>

      <section className="spaces-section">
        <div className="container">
          <div className="section-header">
            <h2>Espacios Destacados</h2>
            <Link to="/espacios" className="see-all">Ver todos</Link>
          </div>
          
          {loading ? (
            <div className="loading"><div className="spinner"></div></div>
          ) : (
            <div className="grid grid-3">
              {spaces.map(space => (
                <SpaceCard key={space.id} space={space} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="trust">
        <div className="container">
          <h2>Intermediacion Segura</h2>
          <div className="trust-content">
            <div className="trust-item">
              <h3>Pagos Protegidos</h3>
              <p>Tu anticipo queda en escrow hasta la confirmacion del contrato</p>
            </div>
            <div className="trust-item">
              <h3>Contratos Digitales</h3>
              <p>Firma electronica con validez legal segun legislacion boliviana</p>
            </div>
            <div className="trust-item">
              <h3>100% Reembolsable</h3>
              <p>Si no confirmas, recuperas el 100% de tu anticipo</p>
            </div>
            <div className="trust-item">
              <h3>Auditoria Completa</h3>
              <p>Todas las transacciones quedan registradas y exportables</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Home
