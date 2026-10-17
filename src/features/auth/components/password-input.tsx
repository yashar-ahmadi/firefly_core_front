'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { IconButton } from '@/components/ui/icon-button'
import { Input, type InputProps } from '@/components/ui/input'

/**
 * A password field with a show/hide button: 44px, one name («نمایش رمز عبور») and
 * `aria-pressed` while the password shows (a toggle, so the name does not change too). Runs left
 * to right like the passwords people type. Field injects the id and the aria props.
 */
export function PasswordInput(props: Omit<InputProps, 'type' | 'endAdornment'>) {
  const [shown, setShown] = useState(false)
  return (
    <Input
      dir="ltr"
      {...props}
      type={shown ? 'text' : 'password'}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      endAdornment={
        <IconButton
          label="نمایش رمز عبور"
          aria-pressed={shown}
          icon={shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          onClick={() => setShown((value) => !value)}
          className="-me-2.5 text-ink-600"
        />
      }
    />
  )
}
