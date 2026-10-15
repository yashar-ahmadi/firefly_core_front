import { agro } from './agro'
import { boardgame } from './boardgame'
import { carpet } from './carpet'
import { defaultPreset } from './default'
import { digital } from './digital'
import { paint } from './paint'

export const PRESET_NAMES = ['default', 'digital', 'agro', 'boardgame', 'carpet', 'paint'] as const
export type PresetName = (typeof PRESET_NAMES)[number]

export const RADIUS_SCALES = ['sm', 'md', 'lg', 'xl'] as const
export type RadiusScale = (typeof RADIUS_SCALES)[number]

/** Look and feel of one shop type. Env variables may override colours and radius. */
export interface Preset {
  name: PresetName
  /** Persian shop-type label, also the fallback store name. */
  label: string
  primary: string
  accent: string
  radius: RadiusScale
  shadow: 'soft' | 'crisp'
  motion: 'calm' | 'lively'
  cardStyle: 'flat' | 'elevated'
}

export const PRESETS: Record<PresetName, Preset> = {
  default: defaultPreset,
  digital,
  agro,
  boardgame,
  carpet,
  paint,
}
