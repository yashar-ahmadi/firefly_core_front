'use client'

import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import type { OtpMethod } from '@/lib/api/types/account'

const CHANNEL_LABEL: Record<OtpMethod, string> = {
  email: 'ایمیل',
  sms: 'پیامک',
  telegram: 'تلگرام',
}

export interface ChannelChoiceProps {
  /** The channels the settings offer for the identifier type (more than one). */
  channels: OtpMethod[]
  channel: OtpMethod
  onChannel: (channel: OtpMethod) => void
}

/** «روش دریافت کد»: one card per channel, for an identifier that can take more than one. */
export function ChannelChoice({ channels, channel, onChannel }: ChannelChoiceProps) {
  return (
    <RadioGroup
      aria-label="روش دریافت کد"
      value={channel}
      onValueChange={(value) => onChannel(value as OtpMethod)}
      className="grid-cols-2"
    >
      {channels.map((option) => (
        <RadioGroupItem key={option} value={option} label={CHANNEL_LABEL[option]} variant="card" />
      ))}
    </RadioGroup>
  )
}
