import { useState } from 'react'
import { ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react'
import { Slider } from './ui/slider'
import { Label } from './ui/label'
import { useAppStore, type StructureItem } from '../store/useAppStore'

function rgbToHex([r, g, b]: [number, number, number]) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return [r, g, b]
}

const SYSTEM_NAMES: Record<string, string> = {
  'nervous': '🧠 Nervous System',
  'respiratory': '🫁 Respiratory',
  'heart_cardiovascular': '❤️ Heart',
  'arteries_cardiovascular': '🔴 Arteries',
  'veins_cardiovascular': '🔵 Veins',
  'digestive': '🍽️ Digestive',
  'skeletal': '🦴 Skeletal',
  'muscular': '💪 Muscular',
  'urinary': '🚽 Urinary',
  'reproductive': '🌸 Reproductive',
  'endocrine': '🧪 Endocrine',
  'other': '📦 Other'
}

export default function StructuresList() {
  const structures = useAppStore((s) => s.structures)
  const setVisible = useAppStore((s) => s.setStructureVisible)
  const setOpacity = useAppStore((s) => s.setStructureOpacity)
  const setColor = useAppStore((s) => s.setStructureColor)
  
  // Track collapsed systems
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  if (!structures.length) {
    return <div className="text-sm text-muted-foreground">Will appear after processing.</div>
  }

  const groups = structures.reduce<Record<string, StructureItem[]>>((acc, it) => {
    acc[it.system] ||= []
    acc[it.system].push(it)
    return acc
  }, {})

  const toggleSystem = (system: string) => {
    setCollapsed(prev => ({ ...prev, [system]: !prev[system] }))
  }

  const toggleAllInSystem = (system: string, visible: boolean) => {
    const items = groups[system] || []
    items.forEach(it => setVisible(it.id, visible))
  }

  return (
    <div className="space-y-2">
      {Object.entries(groups).map(([system, items]) => {
        const isCollapsed = collapsed[system]
        const allVisible = items.every(it => it.visible)
        const someVisible = items.some(it => it.visible)
        
        return (
          <div key={system} className="border rounded-md overflow-hidden">
            {/* System Header - Collapsible */}
            <div className="bg-muted/50 p-2 flex items-center justify-between cursor-pointer hover:bg-muted/70 transition-colors">
              <div className="flex items-center gap-2 flex-1" onClick={() => toggleSystem(system)}>
                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                <span className="text-sm font-semibold">
                  {SYSTEM_NAMES[system] || system}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({items.length})
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggleAllInSystem(system, !allVisible)
                }}
                className="p-1 hover:bg-muted rounded transition-colors"
                title={allVisible ? "Hide all" : "Show all"}
              >
                {allVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            
            {/* System Content - Collapsible */}
            {!isCollapsed && (
              <div className="p-2 space-y-2 max-h-96 overflow-y-auto">
                {items.map((it) => (
                  <div key={it.id} className="rounded border bg-card p-2 hover:bg-accent/5 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <input
                          type="checkbox"
                          checked={it.visible}
                          onChange={(e) => setVisible(it.id, e.currentTarget.checked)}
                          className="flex-shrink-0"
                        />
                        <div className="text-xs font-medium truncate" title={it.name}>{it.name}</div>
                      </div>
                      <input
                        type="color"
                        value={rgbToHex(it.color)}
                        onChange={(e) => setColor(it.id, hexToRgb(e.currentTarget.value))}
                        className="h-5 w-5 p-0 border rounded flex-shrink-0 ml-2"
                        title="Color"
                      />
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Label htmlFor={`opacity-${it.id}`} className="text-xs text-muted-foreground whitespace-nowrap">
                        Opacity
                      </Label>
                      <div className="flex-1">
                        <Slider 
                          id={`opacity-${it.id}`} 
                          value={[it.opacity]} 
                          onValueChange={(v) => setOpacity(it.id, v[0])} 
                          min={0} 
                          max={100}
                          className="w-full"
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-8 text-right">
                        {it.opacity}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
