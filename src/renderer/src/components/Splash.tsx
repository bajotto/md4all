import { useEffect, useState } from 'react'
import Logo from './Logo'

export default function Splash(): JSX.Element | null {
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFading(true), 900)
    const hideTimer = setTimeout(() => setVisible(false), 1300)
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer) }
  }, [])

  if (!visible) return null

  return (
    <div className={`splash ${fading ? 'splash-fade' : ''}`}>
      <div className="splash-inner">
        <Logo size={72} />
        <span className="splash-wordmark">md4all</span>
      </div>
    </div>
  )
}
