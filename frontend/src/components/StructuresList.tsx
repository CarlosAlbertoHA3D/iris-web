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

export default function StructuresList() {
  const structures = useAppStore((s) => s.structures)
  const setVisible = useAppStore((s) => s.setStructureVisible)
  const setOpacity = useAppStore((s) => s.setStructureOpacity)
  const setColor = useAppStore((s) => s.setStructureColor)

  if (!structures.length) {
    return <div className="text-sm text-muted-foreground">Will appear after processing.</div>
  }

  const groups = structures.reduce<Record<string, StructureItem[]>>((acc, it) => {
    acc[it.system] ||= []
    acc[it.system].push(it)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([system, items]) => (
        <div key={system}>
          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">{system}</div>
          <div className="space-y-3">
            {items.map((it) => (
              <div key={it.id} className="rounded-md border p-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={it.visible}
                      onChange={(e) => setVisible(it.id, e.currentTarget.checked)}
                    />
                    <div className="text-sm font-medium">{it.name}</div>
                  </div>
                  <input
                    type="color"
                    value={rgbToHex(it.color)}
                    onChange={(e) => setColor(it.id, hexToRgb(e.currentTarget.value))}
                    className="h-6 w-6 p-0 border rounded"
                    title="Color"
                  />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <Label htmlFor={`opacity-${it.id}`} className="text-xs text-muted-foreground">Opacity</Label>
                  <div className="w-40">
                    <Slider id={`opacity-${it.id}`} value={[it.opacity]} onValueChange={(v) => setOpacity(it.id, v[0])} min={0} max={100} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
