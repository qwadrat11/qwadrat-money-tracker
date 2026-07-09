import { Capacitor } from '@capacitor/core'

type HapticStyle = 'light' | 'medium' | 'heavy' | 'selection' | 'success' | 'warning' | 'error'

export async function tapHaptic(style: HapticStyle = 'light') {
  if (Capacitor.isNativePlatform()) {
    const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics')
    if (style === 'selection') {
      await Haptics.selectionChanged()
      return
    }
    if (style === 'success') {
      await Haptics.notification({ type: NotificationType.Success })
      return
    }
    if (style === 'warning') {
      await Haptics.notification({ type: NotificationType.Warning })
      return
    }
    if (style === 'error') {
      await Haptics.notification({ type: NotificationType.Error })
      return
    }
    const impactStyle = style === 'light' ? ImpactStyle.Light : style === 'medium' ? ImpactStyle.Medium : ImpactStyle.Heavy
    await Haptics.impact({ style: impactStyle })
    return
  }

  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(style === 'heavy' ? 30 : style === 'medium' ? 18 : 10)
  }
}
