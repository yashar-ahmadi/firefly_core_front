import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

// The form controls of the checkout's radio steps (the address picker, shipping, payment), taken
// from here as one set: the radio group together with the shop's checkbox and text input. The
// catalog's filters load these three as one chunk, and Turbopack groups modules by the pages and
// lazy chunks that load them together (Task 3's amendment, measured): with each step its own lazy
// chunk, steps that took the radio group without the other two split that chunk for the catalog
// (category, list and brand +1.8 KB gzip). Taking them as a set keeps the catalog's chunks as
// they were; the input and the checkbox cost those steps nothing they did not already load.

/** Each radio step reads its controls from this set (never from their modules). */
export const STEP_CONTROLS = { RadioGroup, RadioGroupItem, Checkbox, Input }
