import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import api from '../services/api'
import './Legal.css'

function Legal() {
  const { type } = useParams()
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(true)

  const endpoints = {
    'aviso-legal': '/legal/aviso-legal',
    'terminos': '/legal/terminos',
    'privacidad': '/legal/privacidad',
    'pagos-reembolsos': '/legal/pagos-reembolsos',
    'intermediacion': '/legal/intermediacion',
    'anti-bypass': '/legal/anti-bypass'
  }

  useEffect(() => {
    loadContent()
  }, [type])

  const loadContent = async () => {
    setLoading(true)
    try {
      const endpoint = endpoints[type] || endpoints['aviso-legal']
      const response = await api.get(endpoint)
      setContent(response.data)
    } catch (error) {
      console.error('Error loading legal content:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div className="loading"><div className="spinner"></div></div>
  }

  return (
    <div className="legal-page">
      <div className="page-header">
        <div className="container">
          <h1>{content?.title || 'Documento Legal'}</h1>
        </div>
      </div>

      <div className="container">
        <div className="legal-content card">
          <div className="content-body">
            {content?.content || 'Contenido no disponible'}
          </div>

          <div className="legal-footer">
            <p>Version: {content?.version || 1}</p>
            <p>Ultima actualizacion: {content?.updated_at ? new Date(content.updated_at).toLocaleDateString() : 'N/A'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Legal
