import { useState, useEffect } from 'react'
import api from '../services/api'
import './Contact.css'

function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  })
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [siteConfig, setSiteConfig] = useState({
    contact_description: 'Almacenes, Galpones, Espacios Libres es una plataforma de intermediacion tecnologica para el alquiler temporal de espacios en Bolivia.',
    contact_notice: 'Este formulario es el unico canal oficial de contacto con la plataforma. No se permite contacto directo entre HOST y GUEST.',
    contact_hours: 'Lunes a Viernes, 9:00 - 18:00',
    contact_response_time: '24-48 horas habiles'
  })

  useEffect(() => {
    api.get('/contact/site-config')
      .then(r => setSiteConfig(prev => ({ ...prev, ...r.data })))
      .catch(() => {})
  }, [])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await api.post('/contact', formData)
      setSuccess(true)
      setFormData({ name: '', email: '', subject: '', message: '' })
    } catch (err) {
      setError(err.response?.data?.error || 'Error al enviar mensaje')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="contact-page">
      <div className="page-header">
        <div className="container">
          <h1>Contactar con la Plataforma</h1>
          <p>Envie sus consultas, sugerencias o reportes</p>
        </div>
      </div>

      <div className="container">
        <div className="contact-content">
          <div className="contact-info card">
            <h2>Informacion</h2>
            <p>
              <strong>Almacenes, Galpones, Espacios Libres</strong> {siteConfig.contact_description.replace('Almacenes, Galpones, Espacios Libres ', '')}
            </p>
            <p>
              {siteConfig.contact_notice}
            </p>
            <div className="info-items">
              <div className="info-item">
                <strong>Horario de atencion:</strong>
                <span>{siteConfig.contact_hours}</span>
              </div>
              <div className="info-item">
                <strong>Tiempo de respuesta:</strong>
                <span>{siteConfig.contact_response_time}</span>
              </div>
            </div>
          </div>

          <div className="contact-form card">
            <h2>Enviar Mensaje</h2>

            {success && (
              <div className="alert alert-success">
                Mensaje enviado exitosamente. Nos pondremos en contacto pronto.
              </div>
            )}

            {error && <div className="alert alert-error">{error}</div>}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Nombre</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Correo Electronico</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Asunto</label>
                <input
                  type="text"
                  name="subject"
                  value={formData.subject}
                  onChange={handleChange}
                  required
                />
              </div>

              <div className="form-group">
                <label>Mensaje</label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleChange}
                  required
                  rows="5"
                  minLength="10"
                ></textarea>
              </div>

              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Enviando...' : 'Enviar Mensaje'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Contact
