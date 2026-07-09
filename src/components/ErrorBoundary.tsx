import { Component, type ReactNode } from 'react'
import { Button } from './ui/Button'
import { Card, CardDescription, CardTitle } from './ui/Card'

type Props = {
  children: ReactNode
}

type State = {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown) {
    console.error('App crashed', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="grid min-h-screen place-items-center bg-[var(--app-bg)] p-4 text-zinc-950 dark:text-zinc-50">
          <Card className="w-[min(520px,calc(100vw-2rem))]">
            <CardTitle>Что-то пошло не так</CardTitle>
            <CardDescription>Приложение восстановит экран после перезапуска. Данные останутся в LocalStorage.</CardDescription>
            <div className="mt-4 flex gap-2">
              <Button onClick={() => window.location.reload()}>Перезагрузить</Button>
            </div>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
