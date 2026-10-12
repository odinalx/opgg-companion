// Parser du format compact renvoyé par l'OP.GG MCP.
//
// Exemple de réponse :
//   class LolGetChampionSynergies: data
//   class Data: synergies
//   class Synergie: synergy_champion_name,play,win_rate
//
//   LolGetChampionSynergies(Data([Synergie("Lee Sin",1976,0.52), ...]))
//
// Les en-têtes "class X: a,b,c" donnent l'ordre des arguments positionnels.
// Certains outils (ex. lol_get_lane_matchup_guide) renvoient du JSON brut.

type Value = string | number | boolean | null | Value[] | { [k: string]: Value }

export function parseOpggText(text: string): any {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed)

  const lines = trimmed.split('\n')
  const classes = new Map<string, string[][]>()
  let i = 0
  for (; i < lines.length; i++) {
    const m = /^class (\w+): ?(.*)$/.exec(lines[i])
    if (!m) break
    const fields = m[2] ? m[2].split(',').map((f) => f.trim()) : []
    const list = classes.get(m[1]) ?? []
    list.push(fields)
    classes.set(m[1], list)
  }
  const body = lines.slice(i).join('\n').trim()
  if (!body) return null
  const result = new Parser(body, classes).parse()
  // L'objet racine (ex. LolGetChampionSynergies) n'est qu'un wrapper : on renvoie son contenu.
  return result
}

class Parser {
  private pos = 0
  constructor(
    private readonly src: string,
    private readonly classes: Map<string, string[][]>
  ) {}

  parse(): Value {
    const v = this.value()
    this.ws()
    if (this.pos < this.src.length) throw this.error('contenu inattendu après la valeur')
    return v
  }

  private error(msg: string): Error {
    return new Error(`OP.GG parse: ${msg} (pos ${this.pos}: "${this.src.slice(this.pos, this.pos + 30)}")`)
  }

  private ws(): void {
    while (this.pos < this.src.length && /\s/.test(this.src[this.pos])) this.pos++
  }

  private value(): Value {
    this.ws()
    const c = this.src[this.pos]
    if (c === '"') return this.string()
    if (c === '[') return this.list()
    if (c === '-' || (c >= '0' && c <= '9')) return this.number()
    const ident = /^[A-Za-z_]\w*/.exec(this.src.slice(this.pos, this.pos + 128))
    if (!ident) throw this.error('valeur invalide')
    const name = ident[0]
    this.pos += name.length
    switch (name) {
      case 'null':
      case 'None':
        return null
      case 'true':
      case 'True':
        return true
      case 'false':
      case 'False':
        return false
    }
    this.ws()
    if (this.src[this.pos] !== '(') throw this.error(`"(" attendu après ${name}`)
    return this.call(name)
  }

  private call(name: string): Value {
    this.pos++ // (
    const args: Value[] = []
    this.ws()
    while (this.src[this.pos] !== ')') {
      args.push(this.value())
      this.ws()
      if (this.src[this.pos] === ',') {
        this.pos++
        this.ws()
      } else if (this.src[this.pos] !== ')') throw this.error('"," ou ")" attendu')
    }
    this.pos++ // )
    const candidates = this.classes.get(name) ?? []
    const fields = candidates.find((f) => f.length === args.length) ?? candidates[0]
    if (!fields) throw this.error(`classe inconnue ${name}`)
    const obj: { [k: string]: Value } = {}
    fields.forEach((f, idx) => (obj[f] = idx < args.length ? args[idx] : null))
    return obj
  }

  private list(): Value[] {
    this.pos++ // [
    const items: Value[] = []
    this.ws()
    while (this.src[this.pos] !== ']') {
      items.push(this.value())
      this.ws()
      if (this.src[this.pos] === ',') {
        this.pos++
        this.ws()
      } else if (this.src[this.pos] !== ']') throw this.error('"," ou "]" attendu')
    }
    this.pos++
    return items
  }

  private string(): string {
    const start = this.pos
    this.pos++
    while (this.pos < this.src.length) {
      const c = this.src[this.pos]
      if (c === '\\') this.pos += 2
      else if (c === '"') break
      else this.pos++
    }
    this.pos++
    return JSON.parse(this.src.slice(start, this.pos))
  }

  private number(): number {
    const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(this.src.slice(this.pos, this.pos + 64))
    if (!m) throw this.error('nombre invalide')
    this.pos += m[0].length
    return Number(m[0])
  }
}
