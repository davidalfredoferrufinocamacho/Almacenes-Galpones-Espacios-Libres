import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import SpaceCard from '../components/SpaceCard'
import './Home.css'

function Home() {
  const [spaces, setSpaces] = useState([])
  const [loading, setLoading] = useState(true)
  const [content, setContent] = useState({})

  useEffect(() => {
    Promise.all([
      api.get('/spaces?featured=true'),
      api.get('/spaces/config/homepage')
    ])
      .then(([spacesRes, contentRes]) => {
        setSpaces(spacesRes.data.slice(0, 6))
        setContent(contentRes.data)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="home">
      <section className="hero">
        <div className="container">
          <div className="hero-content">
            <h1>{content.hero_title || 'Encuentra el Espacio Perfecto para tu Negocio'}</h1>
            <p>{content.hero_subtitle || 'Plataforma lider en Bolivia para alquiler temporal de almacenes, galpones y espacios libres'}</p>
            <div className="hero-buttons">
              <Link to="/espacios" className="btn btn-primary">{content.hero_button1_text || 'Ver Espacios'}</Link>
              <Link to="/registro" className="btn btn-outline">{content.hero_button2_text || 'Publicar Espacio'}</Link>
            </div>
          </div>
        </div>
      </section>

      <section className="features">
        <div className="container">
          <h2>{content.howit_section_title || 'Como Funciona'}</h2>
          <div className="features-grid">
            <div className="feature">
              <div className="feature-icon">1</div>
              <h3>{content.howit_step1_title || 'Busca'}</h3>
              <p>{content.howit_step1_description || 'Explora nuestra amplia seleccion de espacios disponibles en toda Bolivia'}</p>
            </div>
            <div className="feature">
              <div className="feature-icon">2</div>
              <h3>{content.howit_step2_title || 'Reserva'}</h3>
              <p>{content.howit_step2_description || 'Paga un anticipo seguro y agenda una visita presencial al espacio'}</p>
            </div>
            <div className="feature">
              <div className="feature-icon">3</div>
              <h3>{content.howit_step3_title || 'Confirma'}</h3>
              <p>{content.howit_step3_description || 'Firma el contrato digital y comienza a usar tu espacio alquilado'}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="spaces-section">
        <div className="container">
          <div className="section-header">
            <h2>{content.featured_section_title || 'Espacios Destacados'}</h2>
            <Link to="/espacios" className="see-all">{content.featured_see_all_text || 'Ver todos'}</Link>
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
          <h2>{content.trust_section_title || 'Intermediacion Segura'}</h2>
          <div className="trust-content">
            <div className="trust-item">
              <h3>{content.trust_feature1_title || 'Pagos Protegidos'}</h3>
              <p>{content.trust_feature1_description || 'Tu anticipo queda en escrow hasta la confirmacion del contrato'}</p>
            </div>
            <div className="trust-item">
              <h3>{content.trust_feature2_title || 'Contratos Digitales'}</h3>
              <p>{content.trust_feature2_description || 'Firma electronica con validez legal segun legislacion boliviana'}</p>
            </div>
            <div className="trust-item">
              <h3>{content.trust_feature3_title || '100% Reembolsable'}</h3>
              <p>{content.trust_feature3_description || 'Si no confirmas, recuperas el 100% de tu anticipo'}</p>
            </div>
            <div className="trust-item">
              <h3>{content.trust_feature4_title || 'Auditoria Completa'}</h3>
              <p>{content.trust_feature4_description || 'Todas las transacciones quedan registradas y exportables'}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default Home
