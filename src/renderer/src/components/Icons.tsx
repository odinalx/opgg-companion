import { normalize, useStatic } from '../lib/assets'

const base = 'https://ddragon.leagueoflegends.com/cdn'

export function ChampIcon({ name, size = 40, className = '' }: { name: string | null; size?: number; className?: string }) {
  const data = useStatic()
  const champ = name ? data?.champions.find((c) => normalize(c.name) === normalize(name) || normalize(c.key) === normalize(name)) : null
  // size = 0 : la taille vient des classes (ex. icône qui remplit sa colonne)
  const style = size ? { width: size, height: size } : undefined
  if (!data || !champ)
    return <div style={style} className={`rounded-md bg-panel-2 ${className}`} title={name ?? undefined} />
  return (
    <img
      src={`${base}/${data.version}/img/champion/${champ.key}.png`}
      alt={champ.name}
      title={champ.name}
      style={style}
      className={`rounded-md ${className}`}
      loading="lazy"
    />
  )
}

export function ItemIcon({ id, size = 24 }: { id: number; size?: number }) {
  const data = useStatic()
  if (!data || !id) return <div style={{ width: size, height: size }} className="rounded bg-panel-2" />
  // Les items de modes spéciaux (Arena…) n'existent pas dans Data Dragon : on masque l'image cassée.
  return (
    <img
      src={`${base}/${data.version}/img/item/${id}.png`}
      alt=""
      style={{ width: size, height: size }}
      className="rounded bg-panel-2"
      loading="lazy"
      onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
    />
  )
}

export function SpellIcon({ id, size = 20 }: { id: number; size?: number }) {
  const data = useStatic()
  const key = data?.spells[id]
  if (!data || !key) return <div style={{ width: size, height: size }} className="rounded bg-panel-2" />
  return <img src={`${base}/${data.version}/img/spell/${key}.png`} alt="" style={{ width: size, height: size }} className="rounded" loading="lazy" />
}

export function RuneIcon({ id, size = 20 }: { id: number | null; size?: number }) {
  const data = useStatic()
  const path = id ? data?.runes[id] : null
  if (!path) return <div style={{ width: size, height: size }} className="rounded-full bg-panel-2" />
  return <img src={`${base}/img/${path}`} alt="" style={{ width: size, height: size }} className="rounded-full bg-night" loading="lazy" />
}

/** Splash art plein cadre d'un champion (à placer dans un conteneur .hero). */
export function Splash({ name }: { name: string | null }) {
  const data = useStatic()
  const champ = name ? data?.champions.find((c) => normalize(c.name) === normalize(name)) : null
  if (!champ) return null
  return <img className="splash" src={`${base}/img/champion/splash/${champ.key}_0.jpg`} alt="" />
}

export function ProfileIcon({ id, size = 40 }: { id: number | undefined; size?: number }) {
  const data = useStatic()
  if (!data || !id) return <div style={{ width: size, height: size }} className="rounded-full bg-panel-2" />
  return (
    <img
      src={`${base}/${data.version}/img/profileicon/${id}.png`}
      alt=""
      style={{ width: size, height: size }}
      className="rounded-full ring-2 ring-line"
    />
  )
}
